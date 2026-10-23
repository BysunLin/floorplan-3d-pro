/* 强排指标回归：容积率 / 密度 / 绿地率 / 车位户比 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { siteMetrics, BUILDING_FLOORS } = await import('../src/core/site/metrics.js');

const item = (type, w, d, cx = 0, cy = 0) => ({ type, w, d, cx, cy, rot: 0 });

test('siteMetrics：按用地红线计算容积率 / 密度', () => {
  const items = [
    item('landparcel', 100000, 80000),          // 8000 m²
    item('tower18', 40000, 18000),              // 720 m² × 18 = 12960 m²
    item('lawn', 20000, 20000)                  // 400 m²
  ];
  const m = siteMetrics(items);
  assert.equal(m.source, 'parcel');
  assert.equal(m.siteArea, 8000);
  assert.equal(m.gfa, 12960);
  assert.equal(m.footprint, 720);
  assert.equal(m.far, 1.62);
  assert.equal(m.density, 0.09);
  assert.equal(m.greenArea, 400);
  assert.equal(m.greenRatio, 0.05);
});

test('siteMetrics：没有红线时用大型构件外接矩形兜底', () => {
  const items = [
    item('midrise6', 60000, 16000, 0, 0),
    item('plaza', 16000, 12000, 38000, 0)
  ];
  const m = siteMetrics(items);
  assert.equal(m.source, 'bbox');
  assert.ok(m.siteArea > 0);
  assert.equal(m.gfa, 960*6);
});

test('siteMetrics：车位与户均', () => {
  const items = [
    item('landparcel', 80000, 60000),
    item('garagemodule', 60000, 40000),
    item('garageentry', 8000, 20000)
  ];
  const m = siteMetrics(items, { households: 100 });
  assert.equal(m.parking, 92);
  assert.equal(m.perHousehold, 0.92);
});

test('BUILDING_FLOORS：楼栋层数表覆盖全部沙盘楼型', () => {
  for (const t of ['tower18', 'tower26', 'tower33', 'midrise11', 'midrise6', 'townhouse', 'villa', 'podium', 'kindergarten'])
    assert.ok(BUILDING_FLOORS[t] > 0, `${t} 缺少层数`);
});
