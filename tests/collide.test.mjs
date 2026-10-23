/* 空间校验：家具 ↔ 墙体 / 门扇（2D / 3D / MCP 共用同一份实现） */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  furnAabb, wallOverlapAt, swingOverlap, checkPlacement, pushOutside, doorLeaves
} from '../src/core/geometry/collide.js';

const furn = (cx, cy, w = 400, d = 400, rot = 0) => ({ cx, cy, w, d, rot });

const WALL = [0, 0, 1000, 120];                 // 水平墙带 y 0..120
const DOOR = { rect: [1000, 0, 1800, 120], h: [1000, 60], c: [1, 0], o: [0, 1], len: 800 };

test('furnAabb：旋转 90° 后宽深互换', () => {
  const a = furnAabb({ w: 1800, d: 300, rot: 0 });
  assert.equal(a.hw, 900);
  assert.equal(a.hh, 150);

  const b = furnAabb({ w: 1800, d: 300, rot: 90 });
  assert.ok(Math.abs(b.hw - 150) < 1e-6);
  assert.ok(Math.abs(b.hh - 900) < 1e-6);
});

test('wallOverlapAt：压墙为 true，贴边不算', () => {
  assert.equal(wallOverlapAt(furn(500, 60), 500, 60, [WALL]), true);
  // 底边正好贴墙：cy - hh = 120
  assert.equal(wallOverlapAt(furn(500, 320), 500, 320, [WALL]), false);
  // 越过 2mm 容差就算压墙
  assert.equal(wallOverlapAt(furn(500, 300), 500, 300, [WALL]), true);
});

test('swingOverlap：只算门扇开启的那 90°', () => {
  const inside = furn(1200, 400);       // +x / +y 象限
  const outside = furn(1200, -400);     // 门背面
  assert.equal(swingOverlap(inside, inside.cx, inside.cy, [DOOR]), true);
  assert.equal(swingOverlap(outside, outside.cx, outside.cy, [DOOR]), false);
});

test('swingOverlap：半径之外不算', () => {
  const far = furn(1000 + 1200, 60 + 1200, 100, 100);
  assert.equal(swingOverlap(far, far.cx, far.cy, [DOOR]), false);
});

test('swingOverlap：双开门两扇都算', () => {
  const dbl = { ...DOOR, dbl: true, len: 800 };
  // 两扇各 400，铰点在洞口两端；远侧端点 1800 附近仍应挡住
  const near = furn(1100, 300);
  assert.equal(swingOverlap(near, near.cx, near.cy, [dbl]), true);
  assert.equal(doorLeaves(dbl).length, 2);
});

test('checkPlacement：先判墙，再判门', () => {
  const onWall = furn(500, 60);
  assert.deepEqual(checkPlacement(onWall, 500, 60, { rects: [WALL], doors: [DOOR] }),
    { ok: false, reason: 'wall' });

  const atDoor = furn(1200, 400);
  assert.deepEqual(checkPlacement(atDoor, 1200, 400, { rects: [WALL], doors: [DOOR] }),
    { ok: false, reason: 'door' });

  const free = furn(500, 900);
  assert.deepEqual(checkPlacement(free, 500, 900, { rects: [WALL], doors: [DOOR] }),
    { ok: true, reason: '' });
});

test('checkPlacement：已拆除的门不再挡', () => {
  const atDoor = furn(1200, 400);
  assert.equal(checkPlacement(atDoor, 1200, 400, { doors: [DOOR], gone: k => k === 'nd0' }).ok, true);
});

test('pushOutside：沿穿透较浅的方向推出来', () => {
  const f = furn(500, 60, 200, 200);
  const p = pushOutside(f, [WALL]);
  assert.equal(p.cx, 500);
  assert.equal(p.cy, 220, '从下沿推出到墙下侧');
  assert.equal(f.cy, 60, '不改入参');
  // 推完之后不再重叠
  assert.equal(wallOverlapAt(f, p.cx, p.cy, [WALL]), false);
});

test('pushOutside：不在墙上时原样返回', () => {
  const f = furn(500, 900);
  assert.deepEqual(pushOutside(f, [WALL]), { cx: 500, cy: 900 });
});
