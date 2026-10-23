/* ============================================================================
 *  节点图操作（纯函数）
 *
 *  图 = { version, rootId, nodes: Record<id, Node> }
 *  子节点不额外存 children 数组，统一由 parentId 反查，避免两份真相不同步。
 *
 *  所有写操作返回新图（结构共享），因此：
 *    · 旧图可以直接当撤销快照用，不需要再 JSON.stringify 整个方案；
 *    · 3D 侧可以按节点 id 比对引用是否变化，判断要不要重建几何。
 * ========================================================================== */
import { NODE_VERSION } from './schema.js';

export const emptyGraph = (rootId = 'site') => ({
  version: NODE_VERSION,
  rootId,
  nodes: {}
});

/** 用根节点创建一张新图 */
export function createGraph(root){
  if (!root?.id) throw new Error('createGraph: 根节点缺少 id');
  return {
    version: NODE_VERSION,
    rootId: root.id,
    nodes: { [root.id]: { parentId: null, ...root } }
  };
}

export const getNode = (graph, id) => graph.nodes[id] || null;

/** 直接子节点（按 id 排序，保证渲染 / 序列化顺序稳定） */
export function childrenOf(graph, id){
  const out = [];
  for (const n of Object.values(graph.nodes)) if (n.parentId === id) out.push(n);
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** 全部后代（广度优先，不含自身） */
export function descendants(graph, id){
  const out = [];
  const queue = [id];
  const seen = new Set([id]);
  while (queue.length){
    const cur = queue.shift();
    for (const n of Object.values(graph.nodes)){
      if (n.parentId !== cur || seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
      queue.push(n.id);
    }
  }
  return out;
}

/** a 是否是 b 的祖先 */
export function isAncestor(graph, a, b){
  let cur = graph.nodes[b];
  const guard = new Set();
  while (cur && cur.parentId){
    if (guard.has(cur.id)) return false;      // 脏数据：环
    guard.add(cur.id);
    if (cur.parentId === a) return true;
    cur = graph.nodes[cur.parentId];
  }
  return false;
}

/** 从根到某节点的路径（含自身） */
export function pathOf(graph, id){
  const out = [];
  let cur = graph.nodes[id];
  const guard = new Set();
  while (cur){
    if (guard.has(cur.id)) break;
    guard.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? graph.nodes[cur.parentId] : null;
  }
  return out;
}

/** 新增节点；parentId 必须已存在，id 必须唯一 */
export function addNode(graph, node, parentId = node.parentId ?? null){
  if (graph.nodes[node.id]) throw new Error(`addNode: 节点 id 重复 "${node.id}"`);
  if (parentId && !graph.nodes[parentId]) throw new Error(`addNode: 父节点不存在 "${parentId}"`);
  return {
    ...graph,
    nodes: { ...graph.nodes, [node.id]: { ...node, parentId } }
  };
}

/**
 * 修改节点。不允许改 id / type，避免身份漂移；
 * 改 parentId 时会检查环。
 */
export function updateNode(graph, id, patch){
  const cur = graph.nodes[id];
  if (!cur) throw new Error(`updateNode: 节点不存在 "${id}"`);
  if (patch.id && patch.id !== id) throw new Error('updateNode: 不允许修改节点 id');
  if (patch.type && patch.type !== cur.type) throw new Error('updateNode: 不允许修改节点类型');
  if (patch.parentId !== undefined && patch.parentId !== null){
    if (!graph.nodes[patch.parentId]) throw new Error(`updateNode: 父节点不存在 "${patch.parentId}"`);
    if (patch.parentId === id || isAncestor(graph, id, patch.parentId))
      throw new Error('updateNode: 不能把节点挂到自己的子树下');
  }
  const next = { ...cur, ...patch, id };
  if (patch.meta) next.meta = { ...(cur.meta || {}), ...patch.meta };
  return { ...graph, nodes: { ...graph.nodes, [id]: next } };
}

/** 删除节点及其所有后代（根节点不可删） */
export function removeNode(graph, id){
  if (id === graph.rootId) throw new Error('removeNode: 不能删除根节点');
  if (!graph.nodes[id]) return graph;
  const doomed = new Set([id, ...descendants(graph, id).map(n => n.id)]);
  const nodes = {};
  for (const [k, v] of Object.entries(graph.nodes)) if (!doomed.has(k)) nodes[k] = v;
  return { ...graph, nodes };
}

/** 按类型筛选 */
export function nodesOfType(graph, type){
  return Object.values(graph.nodes).filter(n => n.type === type);
}

/** 节点内容签名：用于事件总线 / 增量重建时判断是否真的变了 */
export function nodeSig(node){
  return JSON.stringify(node);
}

/**
 * 图完整性校验（不依赖 zod，供运行时快速自检）
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateGraph(graph){
  const errors = [];
  if (!graph || typeof graph !== 'object') return { ok: false, errors: ['图不是对象'] };
  if (!graph.nodes || typeof graph.nodes !== 'object') return { ok: false, errors: ['缺少 nodes'] };
  if (!graph.nodes[graph.rootId]) errors.push(`根节点不存在：${graph.rootId}`);
  for (const [id, n] of Object.entries(graph.nodes)){
    if (n.id !== id) errors.push(`节点 id 与键不一致：${id}`);
    if (id !== graph.rootId){
      if (!n.parentId) errors.push(`缺少 parentId：${id}`);
      else if (!graph.nodes[n.parentId]) errors.push(`父节点不存在：${id} → ${n.parentId}`);
    }
    if (n.parentId && isAncestor(graph, id, n.parentId)) errors.push(`父子成环：${id}`);
  }
  return { ok: errors.length === 0, errors };
}

/** 结构共享检查：两个图之间哪些节点是同一个对象（没有变化） */
export function changedIds(prev, next){
  if (!prev) return Object.keys(next?.nodes || {});
  const out = [];
  const keys = new Set([...Object.keys(prev.nodes), ...Object.keys(next.nodes)]);
  for (const k of keys) if (prev.nodes[k] !== next.nodes[k]) out.push(k);
  return out;
}
