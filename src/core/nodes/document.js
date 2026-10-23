/* ============================================================================
 *  方案文档 ⇄ 节点图（v2 存档格式的读写）
 *
 *  v1 文档直接把「按门窗切开的墙段数组」当存档：
 *      walls: [[x0,y0,x1,y1,类型], …]   wins: [[…], …]   doors: [{rect,…}]
 *  v2 文档改为存节点图（墙是整段 + 洞口是墙的子节点），
 *  墙段数组退化为「加载时的投影」，只在运行时与 2D / 编辑使用。
 *
 *  为什么先改文档、不改运行时写路径：
 *    · 文档是唯一需要长期稳定的部分，先把它翻过来，外部消费者（MCP / 云端 / 二次开发）
 *      拿到的就是语义模型；
 *    · 投影函数是纯函数，可以用往返测试把「有损点」一次性逼出来（门扇信息、家具附加字段、
 *      区域高差…），比在运行时迁移中边跑边查安全得多。
 *
 *  约定：nodes[levelId] 只包含该层的「用户增量」（自建墙 / 门窗 / 区域 / 家具），
 *  户型自带的静态几何由 planId + geoVersion 决定，不重复存进节点图。
 * ========================================================================== */
import { graphFromLegacy, rectOfWallNode, lineOfWallNode } from './legacy.js';
import { safeParseGraph } from './schema.js';
import { WALL_UID, WIN_UID, WALL_LINE } from '../model/uid.js';

/** 这些字段是「节点图的投影」，v2 文档里不再直接保存 */
export const DELTA_FIELDS = ['walls', 'wins', 'doors', 'slides', 'bays', 'regions', 'furniture'];

const byIndex = (a, b) => (a.meta?.index ?? 0) - (b.meta?.index ?? 0);
const nodesOf = (graph, type) =>
  Object.values(graph?.nodes || {}).filter(n => n.type === type && n.visible !== false);

/**
 * 用户增量 → 节点图（不含拆除记录 / 墙面材质：它们按下标引用户型几何，仍留在 plan 里）
 */
export function graphFromDeltas(deltas = {}, level = { id: 'L1' }){
  return graphFromLegacy({
    planId: deltas.planId || level.planId || 'default',
    level: {
      id: level.id || 'L1',
      name: level.name || '',
      kind: level.kind || 'floor',
      elev: level.elev || 0,
      clearH: level.clearH || 2800
    },
    walls: deltas.walls || [],
    wins: deltas.wins || [],
    doors: deltas.doors || [],
    slides: deltas.slides || [],
    rooms: [...(deltas.regions || []), ...(deltas.bays || [])],
    furniture: deltas.furniture || []
  });
}

/**
 * 节点图 → 用户增量。
 * 输出与 v1 的 delta 字段同构，可以直接喂给 resolveGeometry / restore。
 */
export function deltasFromGraph(graph){
  const walls = nodesOf(graph, 'wall').sort(byIndex).map(n => {
    const w = [...rectOfWallNode(n).map(Math.round), n.kind];
    const seg = lineOfWallNode(n);
    if (seg) w[WALL_LINE] = seg;                   // 斜墙：中心线必须跟着矩形一起还原
    if (n.meta?.uid) w[WALL_UID] = n.meta.uid;     // 身份跟着墙走，名称 / 材质才不会串位
    return w;
  });

  const opens = nodesOf(graph, 'opening');
  const wins = opens.filter(n => n.kind === 'win' || n.kind === 'bay')
    .sort(byIndex).map(n => {
      const r = [...n.rect];
      if (n.meta?.uid) r[WIN_UID] = n.meta.uid;
      return r;
    });

  const doors = opens.filter(n => n.kind === 'door' || n.kind === 'entry' || n.kind === 'double')
    .sort(byIndex).map(n => {
      const d = { name: n.name, rect: [...n.rect] };
      if (n.swing){
        d.h = [...n.swing.hinge];
        d.c = [...n.swing.close];
        d.o = [...n.swing.open];
        d.len = n.swing.len;
      }
      d.entry = !!n.meta?.entry;
      d.dbl = n.kind === 'double';
      if (n.meta?.uid) d.uid = n.meta.uid;
      return d;
    });

  const slides = opens.filter(n => n.kind === 'slide')
    .sort(byIndex).map(n => {
      const s = { rect: [...n.rect], v: !!n.meta?.v };
      if (n.meta?.uid) s.uid = n.meta.uid;
      return s;
    });

  const zones = nodesOf(graph, 'zone').sort(byIndex);
  const bays = zones.filter(z => z.meta?.bay).map(z => ({
    id: z.meta?.key || z.id.replace(/^zone_/, ''),
    name: z.name,
    poly: z.poly.map(p => [...p]),
    mat: z.mat,
    counted: false
  }));

  const regions = zones.filter(z => !z.meta?.bay).map(z => {
    const r = {
      id: z.meta?.key || z.id.replace(/^zone_/, ''),
      poly: z.poly.map(p => [...p]),
      mat: z.mat
    };
    if (z.name) r.name = z.name;
    if (z.holes?.length) r.holes = z.holes.map(h => h.map(p => [...p]));
    if (z.outdoor) r.outdoor = true;
    if (z.meta?.lift != null) r.lift = z.meta.lift;
    if (z.meta?.at) r.at = z.meta.at;
    return r;
  });

  const furniture = nodesOf(graph, 'item').map(n => {
    const f = { ...(n.meta || {}) };
    delete f.uid;
    f.id = n.meta?.uid || n.id.replace(/^item_/, '');
    f.type = n.itemType;
    f.cx = n.cx;
    f.cy = n.cy;
    f.w = n.w;
    f.d = n.d;
    f.rot = n.rot ?? 0;
    if (n.color) f.color = n.color;
    return f;
  });

  return { walls, wins, doors, slides, bays, regions, furniture };
}

/**
 * 拆成「不含投影字段的 plan」+「每层一张节点图」。
 * @param {object} plan 完整 state（含当前层的增量字段与 levelData）
 */
export function splitDocumentPlan(plan = {}){
  const levels = plan.levels || [];
  const active = plan.activeLevel || levels[0]?.id || 'L1';
  const metaOf = id => levels.find(l => l.id === id) || { id };

  const nodes = { [active]: graphFromDeltas(plan, metaOf(active)) };
  const rest = { ...plan };
  for (const f of DELTA_FIELDS) delete rest[f];

  rest.levelData = {};
  for (const [id, d] of Object.entries(plan.levelData || {})){
    nodes[id] = graphFromDeltas(d || {}, metaOf(id));
    const keep = { ...(d || {}) };
    for (const f of DELTA_FIELDS) delete keep[f];
    rest.levelData[id] = keep;
  }
  return { plan: rest, nodes };
}

/**
 * 用节点图把 plan 的投影字段补回来（导入时调用）。
 * @param {object} plan  文档里的 plan（不含投影字段）
 * @param {object} nodes { [levelId]: PlanGraph }
 * @param {{strict?: boolean}} [opts] strict=true 时校验失败直接抛错（导入外部文件）
 */
export function joinDocumentPlan(plan = {}, nodes = {}, { strict = false } = {}){
  const levels = plan.levels || [];
  const active = plan.activeLevel || levels[0]?.id || 'L1';
  const out = { ...plan, levelData: { ...(plan.levelData || {}) } };

  const project = id => {
    const graph = nodes?.[id];
    if (!graph) return null;
    if (strict){
      const r = safeParseGraph(graph);
      if (!r.success){
        const first = r.error.issues?.[0];
        const where = first?.path?.length ? first.path.join('.') : id;
        throw new Error(`方案数据损坏（${where}）：${first?.message || '节点图无效'}`);
      }
    }
    return deltasFromGraph(graph);
  };

  const cur = project(active);
  if (cur) Object.assign(out, cur);
  for (const id of Object.keys(out.levelData)){
    const d = project(id);
    if (d) out.levelData[id] = { ...out.levelData[id], ...d };
  }
  return out;
}
