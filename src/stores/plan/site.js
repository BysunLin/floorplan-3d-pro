/* ============================================================================
 *  场地（Site）Store —— 多楼栋 / 小区道路
 *
 *  P1 范围：
 *    · state.site.buildings：楼栋列表。active=true 的那栋是「当前编辑楼栋」，
 *      它的几何就是全局 WALLS / ROOMS（局部坐标）；其它栋只有 { planId, x, y, rot }，
 *      渲染时套模板几何 + 变换。
 *    · state.site.roads：小区道路折线（pts + 宽度 w）。
 *
 *  为什么当前栋不把几何烘进世界坐标：室内编辑（吸附 / 命中 / 门窗 / 撤销）全都
 *  工作在局部坐标，改坐标空间要动几十处；改用一个 <g transform> 把局部映射到世界，
 *  代价只有「鼠标点要反变换一次」（见 usePlanInteraction 的 toP）。
 *
 *  3D 目前仍只渲染当前栋（P3 再做场地级实例化）。
 * ========================================================================== */
import { computed } from 'vue';
import { BOUNDS } from '@/core/model/plan.js';
import { planName, makePlan } from '@/core/plans/index.js';
import { lang } from '@/i18n.js';
import { transformedAabb, hitAabb, ROAD_W, buildingTransform } from '@/core/model/site.js';
import { graphFromLegacy } from '@/core/nodes/legacy.js';
import { wallRuns, runPathD } from '@/core/nodes/derive.js';

/** 模板缓存：同一 planId 的包围盒 / 层数 / 外墙路径只算一次（makePlan 是深拷贝，别每次渲染都跑） */
const tplCache = new Map();

function templateOf(planId){
  if (!planId) return null;
  if (tplCache.has(planId)) return tplCache.get(planId);
  let tpl = null;
  try {
    const g = makePlan(planId);
    const runs = wallRuns(graphFromLegacy({
      level: { id: 'L1' }, walls: g.walls, wins: g.wins || [], doors: g.doors || [],
      slides: g.slides || [], rooms: g.rooms || []
    }));
    const kindOf = r => g.walls[r.wallIds[0]]?.[4] || 'n';
    const outer = runs.filter(r => kindOf(r) === 'e');
    const list = outer.length ? outer : runs.filter(r => kindOf(r) === 'b');
    tpl = {
      bounds: { ...g.bounds },
      floors: (g.levels || []).length || 1,
      // 外墙轮廓（模板局部坐标，渲染时由楼栋 transform 映射到场地）
      wallsD: list.map(r => runPathD(r)).join('')
    };
  } catch { tpl = null; }
  tplCache.set(planId, tpl);
  return tpl;
}

export function createSite(ctx){
  const { state, planId } = ctx;

  const site = () => state.site || (state.site = { buildings: [], roads: [], seq: 1 });
  const nextId = prefix => `${prefix}${site().seq++}`;

  const activeBuilding = computed(() =>
    site().buildings.find(b => b.active) || { id: 'b0', active: true, name: '', x: 0, y: 0, rot: 0 });

  /**
   * 场地里的全部楼栋（世界事务）：
   *   { id,name,planId,x,y,rot,active,bounds(世界AABB),floors,wallsD(局部路径) }
   */
  const siteBuildings = computed(() => site().buildings.map(b => {
    const isActive = !!b.active;
    const tpl = isActive ? null : templateOf(b.planId);
    // 当前栋的几何在全局数组里（局部坐标），包围盒就是 BOUNDS
    const local = isActive ? BOUNDS : (tpl?.bounds || { x: 0, y: 0, w: 0, h: 0 });
    const bounds = transformedAabb(b, local);
    return {
      ...b,
      isActive,
      bounds,                                  // 世界 AABB（命中 / 标签定位）
      localBounds: { ...local },               // 局部 AABB（楼块底，画在 transform 里）
      transform: buildingTransform(b),          // 局部 → 场地的 SVG 变换
      floors: isActive ? (state.levels || []).length : (tpl?.floors || 1),
      wallsD: isActive ? '' : (tpl?.wallsD || ''),
      name: b.name || (isActive ? planName(planId.value, lang.value) : planName(b.planId, lang.value))
    };
  }));

  const siteRoads = computed(() => site().roads);

  /** 当前楼栋的 SVG 变换串（把室内几何映射到场地） */
  const activeTransform = computed(() => buildingTransform(activeBuilding.value));

  /** 命中：世界坐标点 → 楼栋（后加的优先，和渲染顺序相反） */
  function buildingAt(p, tol = 0){
    const list = siteBuildings.value;
    for (let i = list.length - 1; i >= 0; i--){
      if (hitAabb(list[i].bounds, p, tol)) return list[i];
    }
    return null;
  }

  /* ---------------- 楼栋增删改 ---------------- */

  function addBuilding({ planId: pid = null, x = 0, y = 0, rot = 0, name = '' } = {}){
    const b = { id: nextId('b'), planId: pid || planId.value, name, x, y, rot };
    ctx.mutate(() => { site().buildings.push(b); });
    return b;
  }

  /** 拖动中直接改坐标（调用方负责 snap / commit，避免每帧入撤销栈） */
  function setBuildingPos(id, x, y){
    const b = site().buildings.find(v => v.id === id);
    if (!b) return false;
    b.x = Math.round(x); b.y = Math.round(y);
    return true;
  }

  function rotateBuilding(id, delta = 90){
    const b = site().buildings.find(v => v.id === id);
    if (!b) return;
    ctx.mutate(() => { b.rot = ((Math.round((b.rot || 0) + delta) % 360) + 360) % 360; });
  }

  function renameBuilding(id, name){
    const b = site().buildings.find(v => v.id === id);
    if (!b) return;
    ctx.mutate(() => { b.name = String(name || '').trim(); });
  }

  /** 删除楼栋：当前编辑栋不允许删（它是方案本体） */
  function removeBuilding(id){
    const b = site().buildings.find(v => v.id === id);
    if (!b || b.active) return false;
    ctx.mutate(() => {
      const s = site();
      s.buildings = s.buildings.filter(v => v.id !== id);
    });
    return true;
  }

  /* ---------------- 道路 ---------------- */

  function addRoad(pts, w = ROAD_W){
    if (!Array.isArray(pts) || pts.length < 2) return null;
    const road = {
      id: nextId('r'),
      w: Number(w) || ROAD_W,
      pts: pts.map(p => [Math.round(p[0]), Math.round(p[1])])
    };
    ctx.mutate(() => { site().roads.push(road); });
    return road;
  }

  function removeRoad(id){
    ctx.mutate(() => { const s = site(); s.roads = s.roads.filter(r => r.id !== id); });
  }

  return {
    activeBuilding, activeTransform, siteBuildings, siteRoads,
    buildingAt, addBuilding, setBuildingPos, rotateBuilding, renameBuilding, removeBuilding,
    addRoad, removeRoad
  };
}
