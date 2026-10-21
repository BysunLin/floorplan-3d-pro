import { ROOMS, BOUNDS, setGeometry } from '@/core/model/plan.js';
import { areaOf, bboxOf, overlap, difference, labelPoint } from '@/core/geometry/region.js';
import { resolveGeometry } from '@/core/model/level.js';
import { makePlan } from '@/core/plans/index.js';
import { tr } from '@/i18n.js';
import { REGION_NAME, REGION_MAT, REGION_SEED_VER, LEGACY_REGION_IDS } from './constants.js';

/** 由 stores/plan/index.js 组装：只依赖共享上下文 ctx，不直接持有全局单例 */
export function createGeometry(ctx){
  const geo = ctx.geo;
  const base = geo.base;
  const state = ctx.state;
  const planId = ctx.planId;
  const currentLevel = (...a) => ctx.currentLevel(...a);

  let areaSig = '';

  function syncUserGeom(){
    // 飘窗 / 用户绘制的区域：房间名与地面材料存在 state.rooms，旧存档或重载后补齐
    for (const b of state.bays) if (!state.rooms[b.id]) state.rooms[b.id] = { name: b.name || tr('飘窗', 'Bay window'), mat: b.mat || 'marble' };
    for (const r of state.regions || []) if (!state.rooms[r.id]) state.rooms[r.id] = { name: r.name || REGION_NAME, mat: r.mat || REGION_MAT, light: 'round' };
    // 纯函数按「当前楼层」解析出完整几何（静态几何 + 用户增量），再写回全局数组供 2D / 编辑使用。
    // 旧的实现是就地拼接尾部；现在统一走 setGeometry(resolveGeometry(level))，行为等价，
    // 并为多楼层铺路：3D 以后可直接遍历各层调用 resolveGeometry，不再依赖全局数组。
    const resolved = resolveGeometry(currentLevel());
    setGeometry(resolved);
    // 视口范围取「所有楼层 bounds 的并集」：地下车库 / 独立平面可能比基准层更大，
    // 只按当前层的 bounds 会在切换楼层时把边缘裁掉
    Object.assign(BOUNDS, unionBounds() || {});
    // base.* 同步成「当前楼层静态几何的元素数」：带独立几何的夹层 static 可能为 0，
    // 这样删除 / 命名时的下标仍然落在正确的层内。
    base.walls  = Math.max(0, resolved.walls.length  - (state.walls  || []).length);
    base.wins   = Math.max(0, resolved.wins.length   - (state.wins   || []).length);
    base.doors  = Math.max(0, resolved.doors.length  - (state.doors  || []).length);
    base.slides = Math.max(0, resolved.slides.length - (state.slides || []).length);
    // base.rooms 同步成「当前内置房间数」，便于 refreshRoomGeometry 识别内置房间
    base.rooms = resolved.builtinRooms.length;
    // 房间名 / 地面材料里属于已删除房间（撤销、删区域、换户型后残留）的键一并清掉，
    // 否则自动命名时会把不存在的名字也算作占用
    const ids = new Set(ROOMS.map(r => r.id));
    for (const k in state.rooms) if (!ids.has(k)) delete state.rooms[k];
    refreshRoomGeometry();
  }

  /** 区域会覆盖掉静态房间的那部分：预计算「房间净几何」（面积 / 轮廓 / 可能被切成多块），
   *  2D 选中框、地面填充与 3D 地面都用它，避免出现「面积减了、外框没减」 */
  function refreshRoomGeometry(){
    const regs = (state.regions || []).map(r => ({ poly: r.poly, holes: r.holes || [] }));
    // 内置房间删除 / 撤销恢复也算进签名：否则恢复出来的房间沿用旧的净面积（可能已与当前区域不符）
    // 楼层也要算进去：夹层使用独立几何，切层后必须重新计算（ROOMS 是新建对象）
    const sig = planId.value + '|' + state.activeLevel + '|' + (state.deletedRooms || []).join(',')
      + '|' + JSON.stringify(regs.map(r => [r.poly, r.holes]));
    if (sig === areaSig) return;
    areaSig = sig;
    for (const room of ROOMS.slice(0, base.rooms)){
      const bb = bboxOf(room);
      const hits = regs.filter(g => overlap(bb, bboxOf(g)));
      if (!hits.length){
        room.netArea = areaOf(room);
        delete room.netPieces;
        delete room.netAt;
        continue;
      }
      const pieces = difference(room, hits);
      room.netArea = pieces.reduce((a, p) => a + areaOf(p), 0);
      room.netPieces = pieces;
      // 名称 / 面积文案跟着新的选区走：放到剩余几何里最大的一块的中心
      let big = null, bigA = -1;
      for (const p of pieces){
        const a = areaOf(p);
        if (a > bigA){ bigA = a; big = p; }
      }
      room.netAt = big ? labelPoint(big) : null;   // 整个被覆盖 → null（不再显示文案）
    }
  }

  /** 所有楼层视口范围的并集（含地下层 / 独立平面）；读不到时返回 null */
  function unionBounds(){
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const lv of state.levels || []){
      const b = ctx.levelGeoOf(lv)?.bounds;
      if (!b) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  const regionSeedKey = id => `${id}@${REGION_SEED_VER}`;

  /** 首次进入某户型时补上该户型自带的区域（入户走廊）；删掉后不会再加回来 */
  function seedPlanRegions(id){
    if (!state.regions) state.regions = [];
    const key = regionSeedKey(id);
    if (state.regionSeed === key) return;
    // 旧版本的内置区域（入户区）替换掉，用户自绘的区域保留
    state.regions = state.regions.filter(r => !LEGACY_REGION_IDS.includes(r.id));
    for (const r of makePlan(id).regions || []){
      if (state.regions.some(x => x.id === r.id)) continue;
      state.regions.push(r);
      state.rooms[r.id] = { name: r.name, mat: r.mat, light: 'round' };
    }
    state.regionSeed = key;
  }

  /* 区域的 ROOMS 片段生成已抽到 data/level.js 的 regionRooms()，由 resolveGeometry 统一调用 */

  return { refreshRoomGeometry, regionSeedKey, seedPlanRegions, syncUserGeom };
}
