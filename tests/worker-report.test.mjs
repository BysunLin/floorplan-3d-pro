/* Worker 报告任务回归：结果必须可 structuredClone，并覆盖车位 / 指标 / 房间面积 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { runReport, roomAreasReport } = await import('../src/core/workers/planTasks.js');

const item = (type, w, d, x = 0, y = 0) => ({ id: type + x + y, type, w, d, cx: x, cy: y, rot: 0 });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

test('runReport：结果可 structuredClone（模拟 postMessage）', () => {
  const levels = [{
    id: 'B1', elev: -3600, kind: 'basement',
    items: [
      item('garageslab', 60000, 40000),
      item('garagemodule', 60000, 40000),
      item('garageentry', 8000, 30000, 0, 25000)
    ]
  }];
  const res = runReport({ levels, rooms: [], regions: [], households: 50, preset: 'standard' });
  assert.equal(res.audit.stats.total, 92);
  assert.ok(res.metrics.siteArea > 0);
  assert.doesNotThrow(() => structuredClone(res));
});

test('roomAreasReport：区域覆盖后的净面积参与报告', () => {
  const room = { id: 'r1', poly: rect(0, 0, 4000, 3000) };
  const half = { poly: rect(2000, 0, 4000, 3000) };
  const areas = roomAreasReport([room], [half]);
  assert.equal(Math.round(areas.r1), 6);          // 剩下 2m × 3m = 6m²
  const full = roomAreasReport([room], []);
  assert.equal(Math.round(full.r1), 12);
});

test('runReport：没有地库时也能返回空审计与场地指标', () => {
  const res = runReport({
    levels: [{ id: 'L1', elev: 0, items: [item('tower18', 42000, 18000)] }],
    rooms: [{ id: 'r1', poly: rect(0, 0, 10000, 10000) }],
    regions: [],
    households: 0,
    preset: 'basic'
  });
  assert.equal(res.audit.stats.total, 0);
  assert.equal(res.audit.preset, 'basic');
  assert.ok(res.metrics.gfa > 0);
  assert.equal(Math.round(res.areas.r1), 100);
  assert.doesNotThrow(() => structuredClone(res));
});
