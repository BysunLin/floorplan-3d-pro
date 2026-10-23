/* ============================================================================
 *  斜墙（任意角度墙）回归
 *
 *  覆盖 P0 / P1 的四条链路：
 *    1. 几何内核（seg.js）：点到线段、线段求交、四边形
 *    2. 落墙：wallGeom 正交时与 wallRect 完全一致，斜向时带中心线负载
 *    3. 派生：wallRuns 的斜墙 run（axis='s'）+ 不破坏正交墙的合并 / 修剪
 *    4. 存档往返：矩形 ⇄ 节点图 不能把中心线弄丢
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

// plan.js 顶层会读 matchMedia（判断触屏）：node 环境下先补一个空实现再动态导入
globalThis.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });

const { wallRect, wallGeom } = await import('../src/core/model/plan.js');
const { WALL_LINE } = await import('../src/core/model/uid.js');
const { wallLine, isSlantAB, isSlantXY } = await import('../src/core/model/wallLine.js');
const { closestOnSeg, segIntersect, quadOf, aabbOfQuad } = await import('../src/core/geometry/seg.js');
const { graphFromLegacy, rectOfWallNode, lineOfWallNode } = await import('../src/core/nodes/legacy.js');
const { deltasFromGraph } = await import('../src/core/nodes/document.js');
const { wallRuns, runRect, runQuad } = await import('../src/core/nodes/derive.js');
const { wallAngles } = await import('../src/core/geometry/angle.js');
const { snapWallDeg, resetWallSnap, projectOnRay, isAxisDeg } = await import('../src/core/geometry/wallSnap.js');

const level = { id: 'L1', name: '一层', kind: 'floor', elev: 0, clearH: 2800 };

/* ---------------- 几何内核 ---------------- */

test('seg: 点到斜线段最近点 / 距离', () => {
  const a = { x: 0, y: 0 }, b = { x: 1000, y: 1000 };
  const c = closestOnSeg({ x: 0, y: 1000 }, a, b);
  assert.equal(Math.round(c.x), 500);
  assert.equal(Math.round(c.y), 500);
  assert.equal(Math.round(c.d), 707);
});

test('seg: 线段求交（斜 × 斜）', () => {
  const p = segIntersect({ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }, { x: 1000, y: 0 });
  assert.equal(Math.round(p.x), 500);
  assert.equal(Math.round(p.y), 500);
  assert.equal(segIntersect({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 10 }, { x: 1000, y: 10 }), null, '平行返回 null');
});

test('seg: 中心线 ±t/2 → 四边形，AABB 正确', () => {
  const q = quadOf({ x: 0, y: 0 }, { x: 1000, y: 1000 }, 200);
  assert.equal(q.length, 4);
  // 法向为 (-√2/2, √2/2)，半厚 100 → 偏移约 70.7
  const [x0, y0, x1, y1] = aabbOfQuad(q).map(Math.round);
  assert.deepEqual([x0, y0, x1, y1], [-71, -71, 1071, 1071]);
});

/* ---------------- 斜墙判定 ---------------- */

test('判定：10 m 长差 2 mm 的墙仍是正交墙（不误判成斜墙）', () => {
  assert.equal(isSlantXY(0, 0, 10000, 2), false);
  assert.equal(isSlantAB({ x: 0, y: 0 }, { x: 10000, y: 2 }), false);
  assert.equal(isSlantAB({ x: 0, y: 0 }, { x: 1000, y: 1000 }), true);
});

/* ---------------- 落墙 ---------------- */

test('wallGeom：正交时与 wallRect 逐值一致（旧路径零改动）', () => {
  const a = { x: 1000, y: 2000 }, b = { x: 4000, y: 2000 };
  assert.deepEqual(wallGeom(a, b, 240, 'n'), wallRect(a, b, 240, 'n'));
  const va = { x: 1000, y: 2000 }, vb = { x: 1000, y: 5000 };
  assert.deepEqual(wallGeom(va, vb, 120, 'b'), wallRect(va, vb, 120, 'b'));
});

test('wallGeom：斜墙 = AABB + 中心线负载', () => {
  const r = wallGeom({ x: 0, y: 0 }, { x: 1000, y: 1000 }, 200, 'n');
  assert.equal(r[4], 'n');
  assert.ok(Array.isArray(r[WALL_LINE].a), '第 7 位必须是中心线');
  const ln = wallLine(r);
  assert.equal(ln.slanted, true);
  assert.equal(ln.t, 200);
  // 矩形退化为包围盒：命中 / 剔除可用，几何看中心线
  const [x0, y0, x1, y1] = aabbOfQuad(quadOf({ x: 0, y: 0 }, { x: 1000, y: 1000 }, 200)).map(Math.round);
  assert.deepEqual([r[0], r[1], r[2], r[3]], [x0, y0, x1, y1]);
});

test('wallLine：正交墙由矩形反推中心线', () => {
  const ln = wallLine([0, 0, 1000, 120, 'n']);
  assert.equal(ln.slanted, false);
  assert.deepEqual([ln.a.x, ln.a.y, ln.b.x, ln.b.y], [0, 60, 1000, 60]);
  assert.equal(ln.t, 120);
});

/* ---------------- 派生 ---------------- */

test('derive：斜墙走 axis=s 分支，正交墙合并行为不变', () => {
  const slanted = wallGeom({ x: 0, y: 0 }, { x: 2000, y: 2000 }, 240, 'n');
  const g = graphFromLegacy({
    level,
    walls: [[0, 5000, 1000, 5120, 'n'], [1800, 5000, 3000, 5120, 'n'], slanted],
    doors: [{ rect: [1000, 5000, 1800, 5120], h: [1000, 5060], c: [1, 0], o: [0, 1], len: 800 }]
  });
  const runs = wallRuns(g);
  const h = runs.find(r => r.axis === 'h');
  const s = runs.find(r => r.axis === 's');

  assert.ok(h, '正交墙仍然合并成一段');
  assert.deepEqual(h.span, [0, 3000]);
  assert.equal(h.holes.length, 1);

  assert.ok(s, '斜墙单独成段');
  assert.ok(s.line, '斜墙 run 必须带中心线');
  assert.deepEqual(s.line.a, [0, 0]);
  assert.deepEqual(s.line.b, [2000, 2000]);
  assert.equal(Math.round(s.span[1]), 2828);

  // runQuad：斜墙轮廓是四边形，runRect 退化为 AABB
  const q = runQuad(s);
  assert.equal(q.length, 4);
  assert.notDeepEqual(q[0], q[1]);
  const [bx0, by0, bx1, by1] = runRect(s).map(Math.round);
  assert.deepEqual([bx0, by0, bx1, by1], aabbOfQuad(q).map(Math.round));
});

test('derive：斜墙不参与正交修剪，也不会被当成竖直墙', () => {
  const slanted = wallGeom({ x: 0, y: 0 }, { x: 1000, y: 1000 }, 120, 'n');
  const g = graphFromLegacy({ level, walls: [[0, 0, 1000, 120, 'n'], slanted] });
  const runs = wallRuns(g);
  assert.equal(runs.length, 2);
  assert.equal(runs.filter(r => r.axis === 's').length, 1);
  assert.equal(runs.filter(r => r.axis === 'v').length, 0);
});

/* ---------------- 存档往返 ---------------- */

test('节点往返：斜墙中心线不丢（矩形 → 节点 → 矩形）', () => {
  const w = wallGeom({ x: 0, y: 0 }, { x: 3000, y: 1000 }, 240, 'e');
  const g = graphFromLegacy({ level, walls: [w] });
  const node = Object.values(g.nodes).find(n => n.type === 'wall');

  assert.deepEqual(node.a, [0, 0]);
  assert.deepEqual(node.b, [3000, 1000]);
  assert.equal(node.thickness, 240);

  const back = deltasFromGraph(g).walls[0];
  assert.ok(back[WALL_LINE], '往返后必须还带中心线');
  assert.deepEqual(back[WALL_LINE].a, [0, 0]);
  assert.deepEqual(back[WALL_LINE].b, [3000, 1000]);
  assert.equal(back[WALL_LINE].t, 240);
  assert.deepEqual([back[0], back[1], back[2], back[3]],
    [...rectOfWallNode(node).map(Math.round)]);
  assert.ok(lineOfWallNode(node));
});

test('节点往返：正交墙不产生中心线负载', () => {
  const g = graphFromLegacy({ level, walls: [[0, 0, 1000, 120, 'n']] });
  const back = deltasFromGraph(g).walls[0];
  assert.equal(back[WALL_LINE], undefined);
});

/* ---------------- 角度 ---------------- */

test('wallAngles：斜墙返回真实走向，正交墙仍是 0/90', () => {
  const angles = wallAngles([
    [0, 0, 1000, 120, 'n'],
    [0, 0, 120, 1000, 'n'],
    wallGeom({ x: 0, y: 0 }, { x: 1000, y: 1000 }, 120, 'n')
  ]);
  assert.deepEqual(angles, [0, 90, 45]);
});

test('snapWallDeg：靠近正交时吸到 90°，并带滞后（不抖）', () => {
  resetWallSnap();
  const refs = [0, 90];
  const r1 = snapWallDeg(88, refs, { screenLen: 300, px: 10 });
  assert.equal(r1.deg, 90);
  // 已经吸住：多偏 2° 仍然保持 90（滞后容差 = 1.6 倍）
  const r2 = snapWallDeg(86, refs, { screenLen: 300, px: 10 });
  assert.equal(r2.deg, 90);
  assert.equal(isAxisDeg(r2.deg), true);
});

test('snapWallDeg：不在参考方向上时一律落到 15° 步进（无自由角度）', () => {
  resetWallSnap();
  assert.equal(snapWallDeg(37, [0, 90], { screenLen: 400, px: 10 }).deg, 30);
  resetWallSnap();
  assert.equal(snapWallDeg(31, [0, 90], { screenLen: 400, px: 10 }).deg, 30);
  resetWallSnap();
  assert.equal(snapWallDeg(52.4, [0, 90], { screenLen: 400, px: 10 }).deg, 45);
  resetWallSnap();
  assert.equal(snapWallDeg(53, [0, 90], { screenLen: 400, px: 10 }).deg, 60);
});

test('snapWallDeg：任意输入都不会返回非整数倍角度', () => {
  for (let d = 0; d < 360; d += 0.7){
    resetWallSnap();
    const r = snapWallDeg(d, [0, 90], { screenLen: 500, px: 10 });
    const onGrid = Math.abs(((r.deg % 15) + 15) % 15) < 1e-9;
    assert.ok(onGrid, `${d}° → ${r.deg}° 不在 15° 网格上`);
  }
});

test('snapWallDeg：参考方向（已有斜墙走向）优先于 15° 步进', () => {
  resetWallSnap();
  // 已有墙走向 17°：鼠标 18° 应该吸到 17 而不是 15
  assert.equal(snapWallDeg(18, [0, 90, 17], { screenLen: 500, px: 10 }).deg, 17);
});

test('projectOnRay：沿吸附方向投射，不是取 x/y 差', () => {
  const a = { x: 0, y: 0 };
  const len = projectOnRay(a, { x: 1000, y: 1000 }, 45);
  assert.equal(Math.round(len), 1414);
  assert.equal(Math.round(projectOnRay(a, { x: 1000, y: 1000 }, 0)), 1000);
  assert.equal(projectOnRay(a, { x: -100, y: 0 }, 0), 0, '反方向夹到 0');
});
