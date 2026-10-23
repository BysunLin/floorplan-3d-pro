/* 真实户型回归：用 Vite SSR 加载户型库，检查整段墙推导的几何不变量 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });

const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

const { makePlan, DEFAULT_PLAN } = await server.ssrLoadModule('/src/core/plans/index.js');
const { graphFromLegacy } = await server.ssrLoadModule('/src/core/nodes/legacy.js');
const { wallRuns, runRect } = await server.ssrLoadModule('/src/core/nodes/derive.js');

test.after(async () => { await server.close(); });

const rectOverlap = (a, b) => {
  const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return ox > 3 && oy > 3;
};

function checkPlan(id){
  const p = makePlan(id);
  const graph = graphFromLegacy({
    planId: id,
    level: { id: 'L1', name: '一层', kind: 'floor', elev: 0, clearH: 2800 },
    walls: p.walls, wins: p.wins, doors: p.doors, slides: p.slides, rooms: p.rooms,
    furniture: p.furniture || []
  });
  const runs = wallRuns(graph);
  const rects = runs.map(runRect);
  const covered = new Set(runs.flatMap(r => r.wallIds));

  return { p, graph, runs, rects, covered };
}

for (const id of [...new Set(['3b2b', 'loft', 'house', 'garden', 'mall', 'villa', DEFAULT_PLAN])]){
  test(`plan ${id}: 墙体推导保持几何不变量`, () => {
    const { p, runs, rects, covered } = checkPlan(id);

    assert.ok(runs.length > 0, '至少要推导出一段墙');

    // 1. 洞口全部落在墙段内，且高度合法
    for (const r of runs){
      for (const h of r.holes){
        assert.ok(h.a >= r.span[0] - 1 && h.b <= r.span[1] + 1, `${r.id} 洞口越界`);
        assert.ok(h.b > h.a && h.head > h.sill, `${r.id} 洞口尺寸非法`);
      }
    }

    // 2. 墙段矩形之间不重叠（转角去重）
    for (let i = 0; i < rects.length; i++){
      for (let j = i + 1; j < rects.length; j++){
        assert.equal(rectOverlap(rects[i], rects[j]), false, `${runs[i].id} 与 ${runs[j].id} 重叠`);
      }
    }

    // 3. 每段可见墙都被某段整墙接管（不会漏画）
    p.walls.forEach((_, i) => {
      assert.ok(covered.has(i), `墙段 ${i} 没有被整墙接管`);
    });

    // 4. 没被接管的墙体不能被墙段覆盖（不会重复绘制）
    p.walls.forEach((w, i) => {
      if (covered.has(i)) return;
      const r = [Math.min(w[0], w[2]), Math.min(w[1], w[3]), Math.max(w[0], w[2]), Math.max(w[1], w[3])];
      for (const rect of rects) assert.equal(rectOverlap(r, rect), false, `墙段 ${i} 与整墙重复`);
    });
  });
}
