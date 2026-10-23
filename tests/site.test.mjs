/* ============================================================================
 *  场地几何（core/model/site.js）回归
 *
 *  楼栋变换是"局部 → 场地"的唯一入口：室内编辑吃局部坐标，总图吃世界坐标，
 *  两边靠 toWorld / toLocal 对齐。这里把往返一致性与 AABB 变换钉死。
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toWorld, toLocal, buildingTransform, transformedAabb, hitAabb,
  roadPath, roadAabb, ROAD_W
} from '../src/core/model/site.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('toWorld / toLocal：平移 + 旋转互为逆运算', () => {
  const b = { x: 12000, y: -3000, rot: 90 };
  for (const p of [[0, 0], [1000, 500], [-2300, 800]]){
    const w = toWorld(b, p[0], p[1]);
    const l = toLocal(b, w.x, w.y);
    assert.ok(near(l.x, p[0], 1e-6) && near(l.y, p[1], 1e-6), `往返误差 ${l.x},${l.y}`);
  }
});

test('toWorld：90° 旋转把 (x,y) 变成 (-y,x)', () => {
  const w = toWorld({ x: 0, y: 0, rot: 90 }, 1000, 0);
  assert.ok(near(w.x, 0, 1e-6) && near(w.y, 1000, 1e-6));
});

test('transformedAabb：90° 旋转后宽高互换', () => {
  const bb = { x: 0, y: 0, w: 10000, h: 4000 };
  const [x0, y0, x1, y1] = transformedAabb({ x: 50000, y: 20000, rot: 90 }, bb);
  assert.equal(Math.round(x1 - x0), 4000);
  assert.equal(Math.round(y1 - y0), 10000);
  assert.equal(Math.round(x0), 46000);
  assert.equal(Math.round(y0), 20000);
});

test('hitAabb：容差外扩', () => {
  const bb = [0, 0, 1000, 1000];
  assert.equal(hitAabb(bb, { x: 500, y: 500 }), true);
  assert.equal(hitAabb(bb, { x: 1100, y: 500 }), false);
  assert.equal(hitAabb(bb, { x: 1100, y: 500 }, 200), true);
});

test('buildingTransform：SVG 变换串', () => {
  assert.equal(buildingTransform({ x: 1200, y: -300, rot: 90 }), 'translate(1200 -300) rotate(90)');
  assert.equal(buildingTransform({}), 'translate(0 0) rotate(0)');
});

test('roadPath / roadAabb', () => {
  assert.equal(roadPath([[0, 0], [1000, 500]]), 'M0 0L1000 500');
  assert.equal(roadPath([]), '');
  const [x0, y0, x1, y1] = roadAabb({ pts: [[0, 0], [10000, 0]], w: ROAD_W });
  assert.equal(x0, -ROAD_W / 2);
  assert.equal(y0, -ROAD_W / 2);
  assert.equal(x1, 10000 + ROAD_W / 2);
  assert.equal(y1, ROAD_W / 2);
});
