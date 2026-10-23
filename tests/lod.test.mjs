/* ============================================================================
 *  LOD（比例尺分级）回归
 *
 *  重点验两件事：
 *    1. 四档阈值的判定与比例尺换算（1:N ↔ px/mm）；
 *    2. 滞后：临界比例尺上来回滚轮不会反复切换档位（否则整棵 SVG 反复重建）。
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOD, ratioOf, rawLodOf, lodOf, resetLod, detailOf, lodRank, lodAtLeast
} from '../src/core/model/lod.js';

const PX_MM = 25.4 / 96;
/** 比例尺分母 → px/mm */
const sOfN = n => 1 / (n * PX_MM);

test('比例尺换算：ratioOf 与 sOfN 互为逆运算', () => {
  assert.equal(Math.round(ratioOf(sOfN(60))), 60);
  assert.equal(Math.round(ratioOf(sOfN(3000))), 3000);
});

test('rawLodOf：四档阈值', () => {
  assert.equal(rawLodOf(sOfN(50)), LOD.INTERIOR);
  assert.equal(rawLodOf(sOfN(150)), LOD.INTERIOR);
  assert.equal(rawLodOf(sOfN(300)), LOD.BUILDING);
  assert.equal(rawLodOf(sOfN(600)), LOD.BUILDING);
  assert.equal(rawLodOf(sOfN(1200)), LOD.BLOCK);
  assert.equal(rawLodOf(sOfN(2500)), LOD.BLOCK);
  assert.equal(rawLodOf(sOfN(2600)), LOD.SITE);
});

test('lodOf：带滞后，临界附近不会来回抖', () => {
  resetLod();
  // 从室内往外缩：150 以内留在室内，超过 12% 才切到单栋
  assert.equal(lodOf(sOfN(150)), LOD.INTERIOR);
  assert.equal(lodOf(sOfN(160)), LOD.INTERIOR, '160 未超出 150×1.12=168');
  assert.equal(lodOf(sOfN(170)), LOD.BUILDING);

  // 往回放大：要退到 150×0.88=132 以内才回室内
  assert.equal(lodOf(sOfN(150)), LOD.BUILDING, '卡在临界值不应立即回弹');
  assert.equal(lodOf(sOfN(140)), LOD.BUILDING);
  assert.equal(lodOf(sOfN(120)), LOD.INTERIOR);
});

test('lodOf：一路缩到总图，再放大回室内', () => {
  resetLod();
  assert.equal(lodOf(sOfN(200)), LOD.BUILDING);
  assert.equal(lodOf(sOfN(1000)), LOD.BLOCK);
  assert.equal(lodOf(sOfN(4000)), LOD.SITE);
  assert.equal(lodOf(sOfN(1000)), LOD.BLOCK);
  assert.equal(lodOf(sOfN(200)), LOD.BUILDING);
  assert.equal(lodOf(sOfN(60)), LOD.INTERIOR);
});

test('detailOf：总图档只留外墙，且不可编辑', () => {
  const site = detailOf(LOD.SITE);
  assert.equal(site.outerOnly, true);
  assert.equal(site.rooms, false);
  assert.equal(site.walls, false);
  assert.equal(site.furniture, false);
  assert.equal(site.dims, false);
  assert.equal(site.editable, false, '总图档禁止编辑室内');

  const interior = detailOf(LOD.INTERIOR);
  assert.equal(interior.outerOnly, false);
  assert.equal(interior.furniture, true);
  assert.equal(interior.dims, true);
  assert.equal(interior.editable, true);

  const block = detailOf(LOD.BLOCK);
  assert.equal(block.openings, false, '组团档不画门窗');
  assert.equal(block.roomLabels, false, '组团档不画房间名');
  assert.equal(block.editable, true);
});

test('档位排序与比较', () => {
  assert.equal(lodRank(LOD.SITE), 0);
  assert.equal(lodRank(LOD.INTERIOR), 3);
  assert.equal(lodAtLeast(LOD.BLOCK, LOD.BUILDING), false);
  assert.equal(lodAtLeast(LOD.BUILDING, LOD.BLOCK), true);
  assert.equal(lodAtLeast(LOD.INTERIOR, LOD.BUILDING), true);
});
