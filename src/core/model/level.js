/* ============================================================================
 *  Phase 0：楼层（Level）抽象 + 纯几何解析
 *
 *  一个 Level = 一份「静态户型几何（geo）+ 用户增量（deltas）」。
 *  resolveGeometry(level) 是纯函数：不读也不写任何全局数组，只依据传入的
 *  level 返回一份完整几何，便于：
 *    · 2D / 编辑：把「当前层」的解析结果写回 WALLS / ROOMS … 全局数组（行为不变）；
 *    · 3D：以后可以直接遍历各层调用 resolveGeometry，而不再依赖全局数组。
 *
 *  普通楼层（kind = floor）共用户型基准几何；夹层（kind = loft）可以拥有
 *  自己的独立几何（level.geo 由户型定义提供），不再继承一层的墙体 / 房间。
 * ========================================================================== */
import { bboxOf, labelPoint, pointInRing, pointInShape } from '@/core/geometry/region.js';

/* 区域（用户绘制房间）默认地面材质：与 store 内常量保持一致 */
const REGION_MAT = 'tile800';
/* Phase 0 的默认层高（mm） */
export const LEVEL_H = 2800;

/** 取环的轴对齐矩形（不是正交矩形时返回 null） */
function axisRectOf(ring){
  const xs = [...new Set(ring.map(p => p[0]))];
  const ys = [...new Set(ring.map(p => p[1]))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * 把「洞口环」（楼梯上楼区域）落进房间：完全落在房间内才作为洞，
 * 超出楼板边界的部分按楼板包围盒裁掉（贴边处内收 1mm，保证洞严格在楼板内）。
 */
function fitOpenings(room, openings){
  const out = [];
  if (!room?.poly || room.poly.length < 3) return out;
  for (const ring of openings || []){
    if (!ring || ring.length < 3) continue;
    const rect = axisRectOf(ring);
    if (rect){
      const bb = bboxOf(room);
      if (!bb) continue;
      const x0 = Math.max(rect[0], bb[0]), y0 = Math.max(rect[1], bb[1]);
      const x1 = Math.min(rect[2], bb[2]), y1 = Math.min(rect[3], bb[3]);
      if (x1 - x0 < 50 || y1 - y0 < 50) continue;
      const hole = [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x1 - 1, y1 - 1], [x0 + 1, y1 - 1]];
      if (hole.every(([x, y]) => pointInRing(x, y, room.poly))) out.push(hole);
      continue;
    }
    if (ring.every(([x, y]) => pointInShape(x, y, room))) out.push(ring);
  }
  return out;
}

/** 区域（用户绘制的房间）→ ROOMS 片段；名称 / 地面 / 灯款式以 roomMeta 为准 */
export function regionRooms(regions, roomMeta = {}, openings = []){
  return (regions || []).map(r => {
    const extra = fitOpenings(r, openings);
    const holes = [...(r.holes || []), ...extra];
    return {
      id: r.id,
      name: roomMeta[r.id]?.name || r.name,
      poly: r.poly,
      holes,
      openings: extra,          // 楼板开洞（楼梯）：只影响地面，天花不跟着开洞
      mat: roomMeta[r.id]?.mat || r.mat || REGION_MAT,
      counted: !r.outdoor,
      outdoor: !!r.outdoor,
      region: true,
      // 户外地面的高差（mm）：人行道 / 路缘石比车行道高，3D 按此抬升（默认 8mm）。
      // 优先取房间表里的用户设置（RoomPanel 的「地面高差」），其次是户型自带区域上的值。
      lift: roomMeta[r.id]?.lift ?? r.lift,
      // 户型自带区域可显式给标签锚点（如环形花园：包围盒中心落在洞里时会跑到墙边）
      at: r.at || labelPoint({ poly: r.poly, holes })
    };
  });
}

/** 构造一个楼层描述符 */
export function makeLevel({ id = 'L1', name = '一层', kind = 'floor', elev = 0, clearH = LEVEL_H, geo = null, deltas = null, openings = [] } = {}){
  return { id, name, kind, elev, clearH, geo, deltas, openings };
}

/**
 * 按楼层解析出完整几何（纯函数）。
 * @param level  { geo: 静态几何, deltas: 用户增量, openings: 楼板洞口（楼梯上楼区域） }
 * @returns { walls, wins, doors, slides, lintels, rooms, builtinRooms, bounds }
 *   rooms      = 内置房间（扣除已删除）+ 飘窗 + 用户区域
 *   builtinRooms = 内置房间（扣除已删除），供净面积差集计算识别「哪些是户型自带」
 */
export function resolveGeometry(level){
  const geo = level?.geo || {};
  const dl  = level?.deltas || {};
  const deleted = dl.deletedRooms || [];
  const openings = level?.openings || [];
  const builtinRooms = (geo.rooms || []).filter(r => !deleted.includes(r.id));
  // 内置房间同样可能被上层楼梯穿越：带上洞口（不修改原始对象）
  const roomsWithHoles = room => {
    const extra = fitOpenings(room, openings);
    return extra.length
      ? { ...room, holes: [...(room.holes || []), ...extra], openings: extra }
      : room;
  };
  // 地下层（elev < 0 或 kind = 'basement'）：入户门只属于首层，继承来的入户门要剔掉，
  // 否则 2D 会在地下室画出首层的门扇、3D 也会多一樘门
  const under = level?.kind === 'basement' || (level?.elev || 0) < -0.001;
  const doors = [...(geo.doors || []), ...(dl.doors || [])];
  return {
    walls:   [...(geo.walls  || []), ...(dl.walls  || [])],
    wins:    [...(geo.wins   || []), ...(dl.wins   || [])],
    doors:   under ? doors.filter(d => !d.entry) : doors,
    slides:  [...(geo.slides || []), ...(dl.slides || [])],
    lintels: [...(geo.lintels || [])],
    rooms:   [
      ...builtinRooms.map(roomsWithHoles),
      ...(dl.bays || []).map(roomsWithHoles),
      ...regionRooms(dl.regions, dl.rooms || {}, openings)
    ],
    builtinRooms,
    bounds:  geo.bounds
  };
}
