/* 节点模型单测：node --test tests/ */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGraph, addNode, updateNode, removeNode, validateGraph, childrenOf, descendants } from '../src/core/nodes/graph.js';
import { graphFromLegacy, toLegacy } from '../src/core/nodes/legacy.js';
import { wallRuns, runRect } from '../src/core/nodes/derive.js';
import { parseGraph } from '../src/core/nodes/schema.js';

const level = { id: 'L1', name: '一层', kind: 'floor', elev: 0, clearH: 2800 };

/* ---------------- 图操作 ---------------- */

test('graph: 增删改 + 父子关系', () => {
  let g = createGraph({ id: 'site', type: 'site', parentId: null });
  g = addNode(g, { id: 'lv', type: 'level', kind: 'floor', elev: 0, clearH: 2800 }, 'site');
  g = addNode(g, { id: 'w1', type: 'wall', a: [0, 0], b: [1000, 0], thickness: 120, kind: 'n' }, 'lv');

  assert.equal(g.nodes.w1.parentId, 'lv');
  assert.deepEqual(childrenOf(g, 'lv').map(n => n.id), ['w1']);
  assert.deepEqual(descendants(g, 'site').map(n => n.id).sort(), ['lv', 'w1']);
  assert.equal(validateGraph(g).ok, true);

  g = updateNode(g, 'w1', { thickness: 200 });
  assert.equal(g.nodes.w1.thickness, 200);

  g = removeNode(g, 'lv');
  assert.equal(g.nodes.w1, undefined, '删除父节点应级联删除子节点');
  assert.equal(g.nodes.lv, undefined);
});

test('graph: 拒绝非法操作', () => {
  const g = createGraph({ id: 'site', type: 'site', parentId: null });
  assert.throws(() => addNode(g, { id: 'x', type: 'level' }, 'nope'), /父节点不存在/);
  assert.throws(() => removeNode(g, 'site'), /不能删除根节点/);

  let g2 = addNode(g, { id: 'a', type: 'level' });
  g2 = addNode(g2, { id: 'b', type: 'level' }, 'a');
  assert.throws(() => updateNode(g2, 'a', { parentId: 'b' }), /子树/);
});

test('graph: validateGraph 能发现孤儿节点', () => {
  const g = createGraph({ id: 'site', type: 'site', parentId: null });
  g.nodes.ghost = { id: 'ghost', type: 'wall', parentId: 'missing', a: [0, 0], b: [1, 1], thickness: 1, kind: 'n' };
  const v = validateGraph(g);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes('父节点不存在')));
});

/* ---------------- 旧几何 → 节点 ---------------- */

test('legacy: 适配器保留下标身份与洞口竖向范围', () => {
  const g = graphFromLegacy({
    level,
    walls: [[0, 0, 1000, 120, 'n'], [1800, 0, 3000, 120, 'n']],
    doors: [{ rect: [1000, 0, 1800, 120], h: [1000, 60], c: [1, 0], o: [0, 1], len: 800 }],
    wins: [[400, 0, 700, 120]],
    rooms: [{ id: 'r1', name: '客厅', poly: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]], mat: 'wood' }],
    furniture: [{ id: 'f1', type: 'sofa', cx: 500, cy: 500, w: 1800, d: 800, rot: 0 }]
  });

  assert.equal(parseGraph(g).nodes.wall_0.type, 'wall');
  assert.equal(g.nodes.wall_0.meta.index, 0);
  assert.equal(g.nodes.open_nd0.type, 'opening');
  assert.equal(g.nodes.open_nd0.head, 2.1);
  assert.equal(g.nodes.open_nw0.sill, 1.4, '下标 0 的窗按落地窗处理');
  assert.equal(g.nodes.zone_r1.type, 'zone');
  assert.equal(g.nodes.item_f1.itemType, 'sofa');
  assert.equal(g.nodes.open_nd0.parentId, 'wall_0', '洞口应挂到相邻墙段上');
});

test('legacy: 二层以上入户门标记为 suppressed（洞口填实）', () => {
  const g = graphFromLegacy({
    level: { ...level, id: 'L2', elev: 2800 },
    walls: [[0, 0, 1000, 120, 'n'], [1800, 0, 3000, 120, 'n']],
    doors: [{ rect: [1000, 0, 1800, 120], entry: true, h: [1000, 60], c: [1, 0], o: [0, 1], len: 900 }]
  });
  assert.equal(g.nodes.open_nd0.suppressed, true);
  const runs = wallRuns(g);
  assert.equal(runs.length, 1, '入户门洞位置应合并成整段墙');
  assert.equal(runs[0].holes.length, 0, '不产生洞口');
});

test('legacy: 往返转换保持墙体与门窗足迹', () => {
  const walls = [[0, 0, 1000, 120, 'n'], [1800, 0, 3000, 120, 'b']];
  const wins = [[400, 0, 700, 120]];
  const doors = [{ rect: [1000, 0, 1800, 120], h: [1000, 60], c: [1, 0], o: [0, 1], len: 800 }];
  const out = toLegacy(graphFromLegacy({ level, walls, wins, doors }));
  assert.deepEqual(out.walls.map(w => w.slice(0, 4)), walls.map(w => w.slice(0, 4)));
  assert.deepEqual(out.walls.map(w => w[4]), walls.map(w => w[4]));
  assert.deepEqual(out.wins, wins);
  assert.deepEqual(out.doors.map(d => d.rect), doors.map(d => d.rect));
});

/* ---------------- 整段墙推导 ---------------- */

test('derive: 被门洞隔开的两段墙合成一段，并长出真实洞口', () => {
  const g = graphFromLegacy({
    level,
    walls: [[0, 0, 1000, 120, 'n'], [1800, 0, 3000, 120, 'n']],
    doors: [{ rect: [1000, 0, 1800, 120], h: [1000, 60], c: [1, 0], o: [0, 1], len: 800 }]
  });
  const runs = wallRuns(g);
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].span, [0, 3000]);
  assert.deepEqual(runs[0].wallIds, [0, 1]);
  assert.equal(runs[0].holes.length, 1);
  assert.deepEqual(
    { a: runs[0].holes[0].a, b: runs[0].holes[0].b, sill: runs[0].holes[0].sill, head: runs[0].holes[0].head },
    { a: 1000, b: 1800, sill: 0, head: 2.1 }
  );
});

test('derive: 窗按位置带不同窗台高度', () => {
  const g = graphFromLegacy({
    level,
    walls: [[0, 0, 1000, 120, 'n'], [1500, 0, 2000, 120, 'n'], [2500, 0, 3000, 120, 'n']],
    wins: [[1000, 0, 1500, 120], [2000, 0, 2500, 120]]
  });
  const [run] = wallRuns(g);
  assert.equal(run.holes.length, 2);
  assert.equal(run.holes[0].sill, 1.4, '首窗为落地窗');
  assert.equal(run.holes[1].sill, 0.9, '普通窗台 0.9m');
  assert.equal(run.holes[0].head, 2.4);
});

test('derive: 相交墙体去重（转角不重叠、不留缝）', () => {
  const g = graphFromLegacy({
    level,
    walls: [
      [0, 0, 1000, 120, 'n'],      // 水平：band z ∈ [0,120]
      [880, 0, 1000, 400, 'n']     // 竖直：与水平墙转角重叠 120×120
    ]
  });
  const runs = wallRuns(g);
  const h = runs.find(r => r.axis === 'h');
  const v = runs.find(r => r.axis === 'v');
  assert.deepEqual(h.span, [0, 1000]);
  assert.deepEqual(v.span, [120, 400], '竖直墙应被水平墙切掉重叠段');
});

test('derive: 水平墙与竖直墙的矩形不重叠', () => {
  const g = graphFromLegacy({
    level,
    walls: [[0, 0, 1000, 120, 'n'], [880, 0, 1000, 400, 'n']]
  });
  const [a, b] = wallRuns(g).map(runRect);
  const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  assert.ok(ox <= 0 || oy <= 0, `两个墙体矩形仍有重叠：${ox}×${oy}`);
});

test('derive: 不同材质 / 类型不会错误合并', () => {
  const g = graphFromLegacy({
    level,
    walls: [[0, 0, 1000, 120, 'n'], [1000, 0, 2000, 120, 'b']]
  });
  assert.equal(wallRuns(g).length, 2);
});

test('derive: 空图安全返回', () => {
  assert.deepEqual(wallRuns(null), []);
  assert.deepEqual(wallRuns(graphFromLegacy({ level })), []);
});
