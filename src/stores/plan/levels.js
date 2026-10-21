import { computed } from 'vue';
import { ROOMS } from '@/core/model/plan.js';
import { makeLevel, resolveGeometry } from '@/core/model/level.js';
import { areaOf, difference } from '@/core/geometry/region.js';
import { isClimbType, isOpeningFreeType, save as savePlan } from '@/core/library/index.js';
import { tr } from '@/i18n.js';
import { getEngine } from '@/workspace/view3d/registry.js';

/** 由 stores/plan/index.js 组装：只依赖共享上下文 ctx，不直接持有全局单例 */
export function createLevels(ctx){
  const geo = ctx.geo;
  const base = geo.base;
  const state = ctx.state;
  const ui = ctx.ui;
  const uiStore = ctx.uiStore;
  const planId = ctx.planId;
  const planVersion = ctx.planVersion;
  const levelGeoOf = (...a) => ctx.levelGeoOf(...a);
  const emit = (...a) => ctx.emit(...a);
  const syncUserGeom = (...a) => ctx.syncUserGeom(...a);
  const regionSeedKey = (...a) => ctx.regionSeedKey(...a);
  const commit = (...a) => ctx.commit(...a);
  const snap = (...a) => ctx.snap(...a);

  /** 家具占地矩形 → 平面多边形（考虑旋转），用于楼梯上楼区域的楼板开洞 */
  function rotRectPoly(f){
    const a = f.rot*Math.PI/180, c = Math.cos(a), s = Math.sin(a);
    const hw = f.w/2, hd = f.d/2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
      .map(([x, y]) => [Math.round(f.cx + x*c - y*s), Math.round(f.cy + x*s + y*c)]);
  }

  /** 该层楼板需要开的洞：正下方一层里所有「上行」楼梯（步梯 / 旋转步梯 / 扶梯）的占地。
   *  夹层开口因此始终与一层上楼区域大小一致（楼梯移动 / 改尺寸后自动跟随）。 */
  function stairOpeningsFor(meta){
    if (!meta) return [];
    const cur = meta.elev || 0;
    const below = state.levels
      .filter(l => (l.elev || 0) < cur)
      .sort((a, b) => (b.elev || 0) - (a.elev || 0))[0];
    if (!below) return [];
    const d = below.id === state.activeLevel ? state : (state.levelData[below.id] || {});
    return (d.furniture || [])
      // 坡道（ramp）虽然带上下标高，但它是室外构筑物：不切上层楼板
      .filter(f => isClimbType(f.type) && !isOpeningFreeType(f.type) && (f.sdir ?? 1) > 0)
      .map(f => rotRectPoly(f));
  }
  /* ---------- 楼层（Phase 1）：当前楼层数据平铺在 state，其它楼层存在 state.levelData ---------- */
  const LEVEL_FIELDS = ['furniture', 'rooms', 'demolished', 'measures', 'walls', 'wins', 'doors', 'slides', 'bays', 'regions', 'deletedRooms', 'regionSeed', 'elemNames'];
  const cloneData = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

  /** 当前楼层描述符：几何按楼层取（夹层可用独立几何），标高 / 层高取自楼层元信息 */
  const currentLevel = () => {
    const meta = state.levels.find(l => l.id === state.activeLevel) || state.levels[0];
    return makeLevel({
      id: meta.id, name: meta.name, kind: meta.kind, elev: meta.elev, clearH: meta.clearH,
      geo: levelGeoOf(meta), deltas: state, openings: stairOpeningsFor(meta)
    });
  };

  /** 新建楼层的初始数据：沿用户型静态房间名 / 材质，家具与拆改增量清空，不补入户走廊 */
  function newLevelData(){
    const rooms = {};
    for (const r of geo.levelGeo.rooms) rooms[r.id] = { name: r.name, mat: r.mat, light: 'round' };
    return {
      furniture: [], rooms, demolished: [], measures: [],
      walls: [], wins: [], doors: [], slides: [], bays: [],
      regions: [], deletedRooms: [],
      regionSeed: regionSeedKey(planId.value || DEFAULT_PLAN),
      elemNames: {}
    };
  }

  /** 把当前楼层的平铺数据收进 levelData（切走前调用） */
  function flushActive(){
    const data = {};
    for (const k of LEVEL_FIELDS) data[k] = state[k];
    state.levelData[state.activeLevel] = data;
  }

  /** 从 levelData 载入目标楼层数据（切入后调用）；克隆以与 levelData 解耦，并补齐缺失字段 */
  function hydrateActive(){
    const d = Object.assign(newLevelData(), state.levelData[state.activeLevel] || {});
    for (const k of LEVEL_FIELDS) state[k] = cloneData(d[k]);
    delete state.levelData[state.activeLevel];
  }

  /** 切换楼层时清掉与「当前层」绑定的临时状态（选中、进行中的区域绘制 / 测量） */
  function resetLevelUi(){
    ui.sel = null;
    ui.regionDraw = null;
    ui.regionSnap = null;
    ui.mA = null; ui.mCur = null;
  }

  /** 楼层切换 / 新建后的收尾：重建几何、持久化、通知 3D */
  function afterLevelChange(){
    resetLevelUi();
    syncUserGeom();
    savePlan(state);
    emit();
    const engine = getEngine();
    engine?.sync(true);
    engine?.resetView?.();          // 3D 中切换楼层时把镜头重新对准新楼层
    planVersion.value++;
  }

  /** 切换楼层：把当前层数据存回 levelData，载入目标层数据并重建几何 */
  function switchLevel(id){
    if (!id || id === state.activeLevel) return;
    if (!state.levels.some(l => l.id === id)) return;
    flushActive();
    state.activeLevel = id;
    hydrateActive();
    afterLevelChange();
  }

  /** 楼层按标高排序（地下层插到最前），保证楼层条 / 面积表顺序稳定 */
  function sortLevels(){
    state.levels.sort((a, b) => (a.elev || 0) - (b.elev || 0) || (b.no || 0) - (a.no || 0));
  }

  /** 在末尾新增一层并切过去（进撤销栈，Ctrl+Z 可撤销新增） */
  function addLevel(){
    const no = state.levels.reduce((m, l) => Math.max(m, l.no || 0), 0) + 1;
    const id = 'L' + no + '_' + Date.now().toString(36).slice(-4);
    const before = snap();
    flushActive();
    // 新层直接叠在「最高一层的顶面」上：loft 夹层净高只有 2.2m 时不能按 2.8m 递推，
    // 否则夹层顶与新层地面之间会空出一条缝，外墙看起来全是镂空。
    const topElev = state.levels.reduce((m, l) => Math.max(m, (l.elev || 0) + (l.clearH || 2800)), 0);
    state.levels.push({ id, no, name: `${no}层`, kind: 'floor', elev: topElev, clearH: 2800 });
    sortLevels();
    state.levelData[id] = newLevelData();
    state.activeLevel = id;
    hydrateActive();
    syncUserGeom();                      // 先重建几何，再入栈 / 通知 3D
    resetLevelUi();
    commit(before);
    const engine = getEngine();
    engine?.sync(true);
    engine?.resetView?.();
    planVersion.value++;
    uiStore.showToast(tr(`已新增第 ${no} 层`, `Added Level ${no}`));
  }

  /**
   * 新增地下层（负一层 / 负二层…）：标高接在「最底层地面」之下，层高 2.8m。
   * 与新增楼层一样继承户型基准几何（可直接改墙 / 删房间），入户门只在首层，
   * 3D 里地下层不画入户门（见 build.js 的 gone 判断）。
   */
  function addBasement(){
    if (state.levels.filter(l => (l.elev || 0) < 0).length >= 3) {
      uiStore.showToast(tr('地下层最多三层', 'Up to 3 basement levels'));
      return;
    }
    const before = snap();
    flushActive();
    const clearH = 2800;
    const bottom = state.levels.reduce((m, l) => Math.min(m, (l.elev || 0)), 0);
    const no = state.levels.reduce((m, l) => Math.min(m, Math.min(0, Number(l.no) || 0)), 0) - 1;  // -1 / -2 / -3
    const depth = Math.abs(no);
    const id = 'B' + depth + '_' + Date.now().toString(36).slice(-4);
    state.levels.push({ id, no, name: `负${depth}层`, kind: 'basement', elev: bottom - clearH, clearH });
    sortLevels();
    state.levelData[id] = newLevelData();
    state.activeLevel = id;
    hydrateActive();
    syncUserGeom();
    resetLevelUi();
    commit(before);
    const engine = getEngine();
    engine?.sync(true);
    engine?.resetView?.();
    planVersion.value++;
    uiStore.showToast(tr(
      `已新增${depth === 1 ? '负一层' : `负${depth}层`}（沿用地上一层轮廓，可直接改墙 / 删房间）`,
      `Added basement B${depth} (inherits the plan outline)`));
  }

  /** 把当前层的房间轮廓转成区域（楼板）：夹层是「单独的平面」，没有区域时用它兜底 */
  function regionsFromRooms(){
    // 已经画过区域（入户走廊这类户外区域不算）就沿用用户的楼板划分
    if ((state.regions || []).some(r => !r.outdoor)) return;
    const out = [];
    for (const r of ROOMS){
      if (!r.poly || r.poly.length < 3 || r.counted === false || r.outdoor) continue;
      if (state.rooms?.[r.id]?.mat === 'void') continue;
      out.push({
        id: r.id, name: state.rooms?.[r.id]?.name || r.name,
        mat: state.rooms?.[r.id]?.mat || r.mat, poly: r.poly, holes: r.holes || [],
        loftSeed: true                     // 由房间轮廓临时生成的楼板：切回普通楼层时移除
      });
    }
    if (out.length) state.regions = out;
  }

  /** 切换某层为夹层（loft）/ 普通楼层：夹层净高更低、是单独的平面（不继承一层的墙与房间），
   *  3D 会做挑空 + 临边栏杆 + 通高墙 */
  function toggleLoft(id){
    const lv = state.levels.find(l => l.id === id);
    if (!lv) return;
    const toLoft = lv.kind !== 'loft';
    lv.kind = toLoft ? 'loft' : 'floor';
    lv.clearH = toLoft ? 2200 : 2800;
    // 夹层独立成一块楼板：不再显示一层的墙面 / 房间；切回普通楼层时恢复继承
    if (geo.planGeos[lv.id]) delete lv.own;
    else if (toLoft){
      regionsFromRooms();                // 没有区域时，按当前房间轮廓生成楼板
      lv.own = true;
    } else {
      state.regions = (state.regions || []).filter(r => !r.loftSeed);
      delete lv.own;
    }
    syncUserGeom();
    savePlan(state);
    emit();
    const engine = getEngine();
    engine?.sync(true);
    engine?.resetView?.();
    planVersion.value++;
    uiStore.showToast(toLoft
      ? tr('已设为夹层（loft），下层挑空、临边自动加栏杆', 'Set as loft — the floor below is now double-height with railings')
      : tr('已设为普通楼层', 'Set as a normal floor'));
  }
  /* ---------- 给 3D 引擎：所有楼层的解析结果 ---------- */

  /** 当前楼层元信息（elev / clearH / kind…） */
  const activeLevelMeta = () => state.levels.find(l => l.id === state.activeLevel) || state.levels[0];

  /**
   * 所有楼层的解析快照：活跃层用 state，其它层用 state.levelData。
   * 3D 引擎用它按 elev 叠层渲染（不再依赖全局数组）。
   */
  function levelSnapshots(){
    return state.levels.map(lv => {
      const deltas = lv.id === state.activeLevel ? state : (state.levelData[lv.id] || {});
      const geo = resolveGeometry(makeLevel({
        id: lv.id, name: lv.name, kind: lv.kind, elev: lv.elev, clearH: lv.clearH,
        geo: levelGeoOf(lv), deltas, openings: stairOpeningsFor(lv)
      }));
      return {
        level: lv,
        active: lv.id === state.activeLevel,
        walls: geo.walls, wins: geo.wins, doors: geo.doors, slides: geo.slides,
        lintels: geo.lintels, rooms: geo.rooms,
        furniture: deltas.furniture || [],
        roomsMeta: deltas.rooms || {},
        regions: deltas.regions || [],
        demolished: deltas.demolished || []
      };
    });
  }

  /** 当前楼层正下方一层的几何快照（2D 下层虚影用）；家具只带出「通往本层的楼梯」所需的数据 */
  function levelBelowSnapshot(){
    const cur = activeLevelMeta()?.elev || 0;
    const below = state.levels
      .filter(l => (l.elev || 0) < cur)
      .sort((a, b) => (b.elev || 0) - (a.elev || 0))[0];
    if (!below) return null;
    const deltas = state.levelData[below.id] || {};
    const geo = resolveGeometry(makeLevel({
      id: below.id, name: below.name, kind: below.kind, elev: below.elev, clearH: below.clearH,
      geo: levelGeoOf(below), deltas, openings: stairOpeningsFor(below)
    }));
    return {
      level: below, rooms: geo.rooms, regions: deltas.regions || [], demolished: deltas.demolished || [],
      furniture: deltas.furniture || []          // 下层虚影里同时画出通往本层的楼梯
    };
  }

  /** 各层套内使用面积（按该层区域扣除后的净面积）；只依赖几何，不读家具 */
  function levelAreas(){
    return state.levels.map(lv => {
      const deltas = lv.id === state.activeLevel ? state : (state.levelData[lv.id] || {});
      const geo = resolveGeometry(makeLevel({
        id: lv.id, name: lv.name, kind: lv.kind, elev: lv.elev, clearH: lv.clearH,
        geo: levelGeoOf(lv), deltas, openings: stairOpeningsFor(lv)
      }));
      const regs = (deltas.regions || []).map(r => ({ poly: r.poly, holes: r.holes || [] }));
      let a = 0;
      for (const r of geo.rooms){
        if (r.counted === false) continue;
        if (deltas.rooms?.[r.id]?.mat === 'void') continue;   // 挑空不计入使用面积
        // 区域本身就是楼板：按自身面积计（已扣掉楼梯洞口等 holes）；
        // 内置房间则要扣掉覆盖在它上面的区域，避免重复计算。
        if (r.region){ a += areaOf(r); continue; }
        a += regs.length ? difference(r, regs).reduce((x, p) => x + areaOf(p), 0) : areaOf(r);
      }
      return { id: lv.id, no: lv.no || 1, kind: lv.kind, area: a };
    });
  }

  /** 户型基准墙体（夹层不做临边栏杆时用它跳过建筑外轮廓） */
  const baseWalls = () => geo.levelGeo.walls;

  return { LEVEL_FIELDS, activeLevelMeta, addBasement, addLevel, afterLevelChange, baseWalls, cloneData, currentLevel, flushActive, hydrateActive, levelAreas, levelBelowSnapshot, levelSnapshots, newLevelData, regionsFromRooms, resetLevelUi, rotRectPoly, sortLevels, stairOpeningsFor, switchLevel, toggleLoft };
}
