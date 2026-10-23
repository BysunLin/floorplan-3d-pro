/* 角度吸附：3D 旋转 gizmo / 2D 面板共用 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { normDeg, angleDiff, snapAngle, wallAngles } from '../src/core/geometry/angle.js';

test('normDeg / angleDiff', () => {
  assert.equal(normDeg(370), 10);
  assert.equal(normDeg(-30), 330);
  assert.equal(angleDiff(10, 350), 20);
  assert.equal(angleDiff(0, 180), 180);
});

test('优先吸附到墙体走向（含垂直方向）', () => {
  assert.equal(snapAngle(3, [0, 90]), 0);
  assert.equal(snapAngle(88, [0, 90]), 90);
  assert.equal(snapAngle(182, [0, 90]), 180);
  assert.equal(snapAngle(268, [0, 90]), 270);
  // 参考方向为 45° 的斜墙
  assert.equal(snapAngle(43, [45]), 45);
});

test('远离参考方向时按 15° 取整', () => {
  assert.equal(snapAngle(31, [0, 90]), 30);
  assert.equal(snapAngle(47, [0, 90]), 45);
  // 与 15° 刻度差 3°，在容差内
  assert.equal(snapAngle(48, [0, 90]), 45);
});

test('落在容差之外保留 1° 精度', () => {
  assert.equal(snapAngle(52, [0, 90]), 52);
  assert.equal(snapAngle(52.6, [0, 90]), 53);
});

test('free 模式只取整，不吸附', () => {
  assert.equal(snapAngle(52.4, [0, 90], { free: true }), 52);
  assert.equal(snapAngle(3, [0, 90], { free: true }), 3);
});

test('结果始终在 [0,360)', () => {
  for (const d of [-370, -90, 0, 359.6, 720, 1080]){
    const v = snapAngle(d, [0, 90]);
    assert.ok(v >= 0 && v < 360, `${d} → ${v}`);
  }
});

test('wallAngles：墙是矩形，方向取长边（0 / 90）', () => {
  const refs = wallAngles([
    [0, 0, 1000, 120],     // 水平墙
    [0, 0, 120, 1000]      // 竖直墙
  ]);
  assert.deepEqual(refs, [0, 90]);
});
