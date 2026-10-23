/* ============================================================================
 *  旧几何 ⇄ 节点图 的双向适配
 *
 *  现状：2D 编辑 / 拾取 / 存档仍然围绕「扁平数组 + 数组下标」工作，
 *  这里把「已解析的当前楼层几何」翻译成节点图，给 3D 与后续能力消费。
 *
 *  为什么要适配而不是直接改写：
 *    · 下标是现有 100+ 处代码的身份（'w3' / 'nd2' / state.demolished / elemNames），
 *      一次性替换风险过高；先用适配层把真相搬到节点上，再逐块迁移消费方。
 *    · 适配是纯函数，可单测、可回滚，出问题不影响 2D。
 * ========================================================================== */
import { createGraph, addNode } from './graph.js';
import { DOOR_H, WIN_HEAD, winSill, slideHead } from './constants.js';
import { WALL_UID, WIN_UID, WALL_LINE, plainRect } from '../model/uid.js';
import { isSlantXY } from '../model/wallLine.js';
import { quadOf, aabbOfQuad } from '../geometry/seg.js';

const TOL = 3;          // 平面坐标容差（mm）
const MIN_T = 40;       // 退化墙的最小厚度（mm）

/** 矩形长轴方向：'h' 水平 / 'v' 竖直 */
export const axisOf = ([x0, y0, x1, y1]) => ((x1 - x0) >= (y1 - y0) ? 'h' : 'v');

/** 矩形上的斜墙中心线负载（{ a, b, t }）；没有则 null */
export const slantSegOf = rect => (rect && rect[WALL_LINE] && rect[WALL_LINE].a ? rect[WALL_LINE] : null);

/** a→b 是否斜向（角度判定，见 wallLine.js） */
const isSlant = isSlantXY;

/**
 * 矩形 → 墙体描述（中心线 + 厚度），与 derive.js 使用同一套表达。
 *
 * 方向不能只看长宽比：门垛 / 窗间的短墙墩常常「宽 240、长 90」，
 * 按长宽比会被判成水平墙，导致门窗两侧的墙段合并不起来。
 * 这里优先跟随「同厚且首尾相接的洞口」方向，其余再退回长宽比。
 *
 * 斜墙（第 7 位带中心线负载）：直接返回 axis='s' + 真实端点，
 * 不再坍缩成正交包围盒 —— 否则斜墙会在 3D / 存档往返里退化成一个大方块。
 * @param {Array} rect      [x0,y0,x1,y1]
 * @param {Array} [openings] 洞口 span 列表（spanOf 的返回值）
 */
export function spanOf(rect, openings = []){
  const seg = slantSegOf(rect);
  if (seg){
    const t = Number(seg.t) > 0 ? seg.t : MIN_T;
    const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
    // 一维坐标沿墙从起点算起（与 derive.js 的斜墙表达一致）；真实几何看 line
    return { axis: 's', a: 0, b: len, c: 0, t, line: seg };
  }
  const [x0, y0, x1, y1] = rect;
  let axis = axisOf(rect);

  for (const o of openings){
    if (o.axis === 'v'
      && Math.abs((x1 - x0) - o.t) <= TOL
      && (Math.abs(y0 - o.b) <= TOL || Math.abs(y1 - o.a) <= TOL)){ axis = 'v'; break; }
    if (o.axis === 'h'
      && Math.abs((y1 - y0) - o.t) <= TOL
      && (Math.abs(x0 - o.b) <= TOL || Math.abs(x1 - o.a) <= TOL)){ axis = 'h'; break; }
  }

  const h = axis === 'h';
  return {
    axis,
    a: h ? x0 : y0,
    b: h ? x1 : y1,
    c: h ? (y0 + y1) / 2 : (x0 + x1) / 2,
    t: Math.max(MIN_T, h ? y1 - y0 : x1 - x0)
  };
}

/** 中心线 + 厚度 → 矩形（derive / toLegacy 共用） */
export function rectOfSpan(span){
  const { axis, a, b, c, t } = span;
  return axis === 'h'
    ? [Math.round(a), Math.round(c - t / 2), Math.round(b), Math.round(c + t / 2)]
    : [Math.round(c - t / 2), Math.round(a), Math.round(c + t / 2), Math.round(b)];
}

/** 墙矩形 → wall 节点 */
function wallNode(rect, kind, index, levelId, sp = spanOf(rect)){
  const seg = sp.line;
  return {
    id: `wall_${index}`,
    type: 'wall',
    parentId: levelId,
    // 斜墙直接用中心线端点：节点 schema 本来就是 a/b + thickness，天然支持任意角度
    a: seg ? [seg.a[0], seg.a[1]] : (sp.axis === 'h' ? [sp.a, sp.c] : [sp.c, sp.a]),
    b: seg ? [seg.b[0], seg.b[1]] : (sp.axis === 'h' ? [sp.b, sp.c] : [sp.c, sp.b]),
    thickness: sp.t,
    kind,
    // uid 是元素身份（名称 / 墙面材质按它存），必须随节点走完存档往返
    meta: { index, uid: rect[WALL_UID] || '' }
  };
}

/** 同向、同厚、与洞口首尾相接的墙，作为洞口的宿主 */
function hostWallOf(sp, walls){
  for (const w of walls){
    if (w.axis !== sp.axis) continue;
    if (Math.abs(w.c - sp.c) > w.t / 2 + TOL) continue;
    if (Math.abs(w.a - sp.b) <= TOL || Math.abs(w.b - sp.a) <= TOL) return w.nodeId;
  }
  return null;
}

/**
 * 由「当前楼层已解析的几何」生成节点图。
 *
 * @param {object} o
 * @param {object} o.level      { id, name, kind, elev, clearH }
 * @param {Array}  o.walls      已扣除拆除段的墙体矩形 [[x0,y0,x1,y1,kind]]
 * @param {Array}  o.wins       窗矩形
 * @param {Array}  o.doors      门对象 { rect, h, c, o, len, entry }
 * @param {Array}  o.slides     推拉门 { rect, v }
 * @param {Array}  o.rooms      房间 / 区域（含用户绘制区域、飘窗）
 * @param {Array}  o.furniture  家具
 * @param {object} o.wallMats   { 'w3': 'glass' } 墙面材质
 * @param {string} o.planId     户型 id
 */
export function graphFromLegacy(o = {}){
  const {
    level = { id: 'L1', name: '一层', kind: 'floor', elev: 0, clearH: 2800 },
    walls = [], wins = [], doors = [], slides = [], rooms = [], furniture = [],
    wallMats = {}, planId = 'default', demolished = []
  } = o;
  const gone = key => demolished.includes(key);
  // 墙面材质按「元素 uid」存，调用方传函数更可靠；旧的 { 'w3': 'glass' } 仍然兼容
  const matOf = typeof o.materialOf === 'function' ? o.materialOf : (i => wallMats[`w${i}`]);

  const levelId = `level_${level.id}`;
  let graph = createGraph({
    id: 'site', type: 'site', parentId: null, name: planId, meta: { planId }
  });
  graph = addNode(graph, {
    id: 'building_0', type: 'building', parentId: 'site', name: level?.buildingName || '主楼', meta: {}
  });
  graph = addNode(graph, {
    id: levelId, type: 'level', parentId: 'building_0',
    name: level.name || '一层',
    kind: level.kind || 'floor',
    elev: Number(level.elev) || 0,
    clearH: Number(level.clearH) || 2800,
    meta: { levelId: level.id, planId }
  });

  /* ---------------- 墙 ---------------- */
  // 先算出所有洞口的一维区间，用来给门垛 / 墙墩判定方向
  const openingSpans = [
    ...wins.filter(Boolean).map(r => spanOf(r)),
    ...doors.filter(d => d?.rect).map(d => spanOf(d.rect)),
    ...slides.filter(s => s?.rect).map(s => spanOf(s.rect))
  ];

  const wallSpans = [];
  walls.forEach((rect, i) => {
    if (!rect) return;
    const kind = rect[4] || 'n';
    const sp = spanOf(rect, openingSpans);
    const node = wallNode(rect, kind, i, levelId, sp);
    const materialId = matOf(i);
    if (materialId) node.materialId = materialId;
    // 拆除的墙保留节点与下标（身份不漂移），只是不可见
    if (gone(`w${i}`)) node.visible = false;
    graph = addNode(graph, node);
    if (node.visible !== false) wallSpans.push({ ...sp, nodeId: node.id, kind });
  });

  /* ---------------- 洞口 ---------------- */
  const addOpening = (rect, kind, i, prefix, extra = {}) => {
    if (!rect) return;
    const visible = !gone(`${prefix}${i}`);
    const sp = spanOf(rect);
    const host = visible ? hostWallOf(sp, wallSpans) : null;
    graph = addNode(graph, {
      id: `open_${prefix}${i}`,
      type: 'opening',
      parentId: host || levelId,
      kind,
      rect: plainRect(rect),          // 数组里可能带 uid，schema 只收 4 个分量
      sill: extra.sill ?? 0,
      head: extra.head ?? DOOR_H,
      suppressed: !!extra.suppressed,
      ...(visible ? {} : { visible: false }),
      ...(extra.name ? { name: extra.name } : {}),
      ...(extra.swing ? { swing: extra.swing } : {}),
      meta: { key: `${prefix}${i}`, index: i, uid: extra.uid || '', ...(extra.meta || {}) }
    });
  };

  // 门：二层以上不出现入户门（洞口位置由墙体填实 → suppressed）
  doors.forEach((d, i) => {
    if (!d?.rect) return;
    const isEntry = !!d.entry;
    const kind = isEntry ? 'entry' : (d.dbl || d.kind === 'double' ? 'double' : 'door');
    addOpening(d.rect, kind, i, 'nd', {
      head: DOOR_H,
      name: d.name,
      uid: d.uid,
      suppressed: isEntry && Math.abs(Number(level.elev) || 0) > .5,
      swing: d.h && d.c && d.o ? { hinge: d.h, close: d.c, open: d.o, len: d.len || 800 } : undefined,
      meta: isEntry ? { entry: true } : {}
    });
  });

  slides.forEach((s, i) => {
    if (!s?.rect) return;
    addOpening(s.rect, 'slide', i, 'ns', { head: slideHead(s), uid: s.uid, meta: { v: !!s.v } });
  });

  wins.forEach((r, i) => {
    if (!r) return;
    addOpening(r, i >= 6 ? 'bay' : 'win', i, 'nw', {
      sill: winSill(i), head: WIN_HEAD, uid: r[WIN_UID]
    });
  });

  /* ---------------- 房间 / 区域 ---------------- */
  rooms.forEach((r, i) => {
    if (!r?.poly || r.poly.length < 3) return;
    // 数据里可能有重复的区域 id（历史上按毫秒生成）：节点 id 仍要唯一
    let zoneId = `zone_${r.id || i}`;
    if (graph.nodes[zoneId]) zoneId = `${zoneId}_${i}`;
    graph = addNode(graph, {
      id: zoneId,
      type: 'zone',
      parentId: levelId,
      name: r.name,
      poly: r.poly,
      holes: r.holes || [],
      mat: r.mat || 'tile800',
      outdoor: !!r.outdoor,
      region: !!r.region,
      counted: r.counted !== false,
      // bay：飘窗（counted=false 的房间型构件）；其余都按区域 / 房间处理
      meta: { key: r.id || String(i), at: r.at || null, lift: r.lift ?? null, bay: !!r.bay || r.counted === false }
    });
  });

  /* ---------------- 家具 ---------------- */
  furniture.forEach((f, i) => {
    if (!f) return;
    const { id, type, cx, cy, w, d, rot, color, ...rest } = f;
    graph = addNode(graph, {
      id: `item_${id || i}`,
      type: 'item',
      parentId: levelId,
      itemType: type || 'box',
      cx: cx || 0, cy: cy || 0,
      w: Math.max(1, w || 1), d: Math.max(1, d || 1),
      rot: rot || 0,
      ...(color ? { color } : {}),
      meta: { ...rest, uid: id }        // 家具原 id：投影回数组时要原样还原
    });
  });

  return graph;
}

/**
 * 节点图 → 旧几何数组（回写 / 单测用）。
 * 只还原墙体与洞口；房间 / 家具由调用方按需取用。
 */
export function toLegacy(graph){
  const nodes = Object.values(graph?.nodes || {}).filter(n => n.visible !== false);
  const byIndex = (a, b) => (a.meta?.index ?? 0) - (b.meta?.index ?? 0);

  const walls = nodes.filter(n => n.type === 'wall').sort(byIndex)
    .map(n => {
      const w = [...rectOfWallNode(n).map(Math.round), n.kind];
      const seg = lineOfWallNode(n);
      if (seg) w[WALL_LINE] = seg;     // 斜墙：中心线随矩形一起还原
      return w;
    });

  const wins = nodes.filter(n => n.type === 'opening' && (n.kind === 'win' || n.kind === 'bay'))
    .sort(byIndex).map(n => n.rect);

  const doors = nodes.filter(n => n.type === 'opening' && (n.kind === 'door' || n.kind === 'entry' || n.kind === 'double'))
    .sort(byIndex).map(n => {
      const out = { rect: n.rect };
      if (n.name) out.name = n.name;
      if (n.swing){ out.h = n.swing.hinge; out.c = n.swing.close; out.o = n.swing.open; out.len = n.swing.len; }
      if (n.meta?.entry) out.entry = true;
      if (n.kind === 'double') out.dbl = true;
      return out;
    });

  const slides = nodes.filter(n => n.type === 'opening' && n.kind === 'slide')
    .sort(byIndex).map(n => ({ rect: n.rect, v: !!n.meta?.v }));

  return { walls, wins, doors, slides };
}

/** wall 节点（中心线 + 厚度）→ 平面矩形 [x0,y0,x1,y1]（斜墙返回 AABB） */
export function rectOfWallNode(n){
  if (isSlant(n.a[0], n.a[1], n.b[0], n.b[1])){
    const q = quadOf({ x: n.a[0], y: n.a[1] }, { x: n.b[0], y: n.b[1] }, n.thickness);
    return aabbOfQuad(q);
  }
  const h = Math.abs(n.b[0] - n.a[0]) >= Math.abs(n.b[1] - n.a[1]);
  return h
    ? [Math.min(n.a[0], n.b[0]), n.a[1] - n.thickness / 2, Math.max(n.a[0], n.b[0]), n.a[1] + n.thickness / 2]
    : [n.a[0] - n.thickness / 2, Math.min(n.a[1], n.b[1]), n.a[0] + n.thickness / 2, Math.max(n.a[1], n.b[1])];
}

/**
 * wall 节点 → 斜墙中心线负载（正交墙返回 null）。
 * 存档往返用：矩形只带 AABB，中心线必须靠它还原。
 */
export function lineOfWallNode(n){
  if (!isSlant(n.a[0], n.a[1], n.b[0], n.b[1])) return null;
  return { a: [n.a[0], n.a[1]], b: [n.b[0], n.b[1]], t: n.thickness };
}
