/* 地库排布内核回归：同一套公式同时供 2D / 3D / 车位指标使用 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { garageLayout, stallsOf, parkingStats, parkingInPolygon,
  aisleSpansInPolygon, columnsInPolygon, spanAtY, PARK } = await import('../src/core/garage/layout.js');
const { garageChecks } = await import('../src/core/garage/check.js');
const { analyzeConnectivity, stallPointsOf, aisleSegmentsOf } = await import('../src/core/garage/connectivity.js');
const { analyzeSlope } = await import('../src/core/garage/slope.js');
const { garageAudit, earthworkStats, GARAGE_PRESETS } = await import('../src/core/garage/audit.js');
const { buildGarageReportCsv } = await import('../src/core/garage/report.js');
const { pointInShape, pointInRing } = await import('../src/core/geometry/region.js');

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

test('garageLayout：60×40m 标准模块排出 4 排 × 23 个车位', () => {
  const L = garageLayout(60000, 40000);
  assert.equal(L.rows.length, 4);
  assert.equal(L.aisles.length, 2);
  assert.equal(L.stallsPerRow, 23);
  assert.equal(L.total, 92);
});

test('garageLayout：30×30m 模块自动收敛为 3 排 + 1 条通道', () => {
  const L = garageLayout(30000, 30000);
  assert.equal(L.rows.length, 3);
  assert.equal(L.aisles.length, 1);
  assert.equal(L.stallsPerRow, 11);
  assert.equal(L.total, 33);
});

test('garageLayout：所有车位排都落在模块轮廓内', () => {
  for (const [w, d] of [[60000, 40000], [30000, 30000], [12000, 12000], [90000, 26000], [18000, 70000]]){
    const L = garageLayout(w, d);
    for (const r of L.rows){
      assert.ok(r.z0 >= -d/2, '排位越出北侧');
      assert.ok(r.z0 + r.depth <= d/2 + 0.001, '排位越出南侧');
    }
    for (const a of L.aisles){
      assert.ok(a.z0 >= -d/2 && a.z0 + a.depth <= d/2 + 0.001, '通道越出轮廓');
    }
    assert.ok(L.stallW === 0 || Math.abs(L.stallsPerRow*L.stallW - (w - 2*PARK.margin)) < 0.001, '车位宽度未铺满');
  }
});

test('parkingInPolygon：矩形轮廓与整块模块车位数一致', () => {
  const w = 60000, d = 40000;
  const { stalls, layout } = parkingInPolygon({
    w, d, poly: rect(-w/2, -d/2, w/2, d/2), cx: 0, cy: 0, rot: 0
  });
  assert.equal(stalls.length, layout.total);
});

test('parkingInPolygon：L 形轮廓只保留完整落在轮廓内的车位', () => {
  const w = 60000, d = 40000;
  const poly = [[-30000, -20000], [10000, -20000], [10000, 0], [30000, 0], [30000, 20000], [-30000, 20000]];
  const { stalls, layout } = parkingInPolygon({ w, d, poly, cx: 0, cy: 0, rot: 0 });
  assert.ok(stalls.length > 0, 'L 形至少要排出车位');
  assert.ok(stalls.length < layout.total, '缺口处应少排');
  for (const s of stalls) assert.ok(pointInShape(s.cx, s.cy, { poly, holes: [] }));
});

test('parkingInPolygon：中间洞口不排车位', () => {
  const w = 60000, d = 40000;
  const poly = rect(-w/2, -d/2, w/2, d/2);
  const holes = [rect(-5000, -5000, 5000, 5000)];
  const { stalls, layout } = parkingInPolygon({ w, d, poly, holes, cx: 0, cy: 0, rot: 0 });
  assert.ok(stalls.length < layout.total);
  for (const s of stalls){
    assert.ok(!pointInRing(s.cx, s.cy, holes[0]), '车位中心不能落在洞口内');
    assert.ok(pointInShape(s.cx, s.cy, { poly, holes }), '车位中心应在轮廓内');
  }
});

test('parkingInPolygon：旋转 90° 后车位仍落在轮廓内', () => {
  const w = 60000, d = 40000;
  const poly = rect(-20000, -30000, 20000, 30000);      // 40×60m，长边沿 y
  const { stalls } = parkingInPolygon({ w, d, poly, cx: 0, cy: 0, rot: 90 });
  assert.ok(stalls.length > 0);
  for (const s of stalls) assert.ok(pointInShape(s.cx, s.cy, { poly, holes: [] }), '旋转后跑出轮廓');
});

test('spanAtY：水平线在矩形 / L 形轮廓内的区间', () => {
  assert.deepEqual(spanAtY(rect(-1000, -500, 1000, 500), 0), [[-1000, 1000]]);
  const L = [[-1000, -1000], [1000, -1000], [1000, 0], [0, 0], [0, 1000], [-1000, 1000]];
  assert.deepEqual(spanAtY(L, 500), [[-1000, 0]]);
});

test('异形地库：车道中心线按轮廓截断，柱网只落在轮廓内', () => {
  const w = 60000, d = 40000;
  const poly = [[-30000, -20000], [10000, -20000], [10000, 0], [30000, 0], [30000, 20000], [-30000, 20000]];
  const lanes = aisleSpansInPolygon({ w, d, poly });
  assert.ok(lanes.length > 0, '应生成车道线');
  for (const s of lanes) assert.ok(s.w > 0);
  const cols = columnsInPolygon({ w, d, poly });
  assert.ok(cols.length > 0, '应生成柱');
  for (const c of cols) assert.ok(pointInShape(c.cx, c.cy, { poly, holes: [] }));
});

test('garageChecks：户均 / 充电 / 无障碍 / 出入口的通过与否', () => {
  assert.deepEqual(garageChecks([]), []);
  const base = [{ type: 'garagemodule', w: 60000, d: 40000 }, { type: 'garageentry' }];
  const c1 = garageChecks(base, { households: 100 });
  const by = (list, k) => list.find(x => x.key === k);
  assert.equal(by(c1, 'perHousehold').level, 'warn');
  assert.equal(by(c1, 'evShare').level, 'warn');
  assert.equal(by(c1, 'accessible').level, 'warn');
  assert.equal(by(c1, 'entry').level, 'ok');
  assert.equal(by(c1, 'aisle').level, 'ok');

  const more = [
    ...base,
    ...Array.from({ length: 12 }, () => ({ type: 'evparking', w: 2500, d: 5000 })),
    { type: 'parkingaccessible', w: 3500, d: 5000 }
  ];
  const c2 = garageChecks(more, { households: 50 });
  assert.equal(by(c2, 'perHousehold').level, 'ok');
  assert.equal(by(c2, 'evShare').level, 'ok');
  assert.equal(by(c2, 'accessible').level, 'ok');
});

test('车道连通性：模块 + 出入口 → 全部车位可达', () => {
  const items = [
    { id: 'm', type: 'garagemodule', cx: 0, cy: 0, w: 60000, d: 40000, rot: 0 },
    { id: 'e', type: 'garageentry', cx: 0, cy: 25000, w: 8000, d: 20000, rot: 0 }
  ];
  assert.equal(aisleSegmentsOf(items).length, 4);      // 2 条通道 + 两端连接段
  assert.equal(stallPointsOf(items).length, 92);
  const c = analyzeConnectivity(items);
  assert.equal(c.ok, true);
  assert.equal(c.unreachable, 0);
  assert.ok(c.entrances >= 1);
});

test('车道连通性：出入口离得很远 → 车位全部不可达', () => {
  const items = [
    { id: 'm', type: 'garagemodule', cx: 0, cy: 0, w: 60000, d: 40000, rot: 0 },
    { id: 'e', type: 'garageentry', cx: 200000, cy: 0, w: 8000, d: 20000, rot: 0 }
  ];
  const c = analyzeConnectivity(items);
  assert.equal(c.ok, false);
  assert.equal(c.unreachable, 92);
});

test('坡道校验：按层高 3.6m 估算坡度并给出告警', () => {
  const short = analyzeSlope([{ type: 'garageentry', w: 8000, d: 20000, rot: 0 }]);
  assert.equal(short.count, 1);
  assert.equal(short.ok, false);                 // 3.6/20 = 18%
  assert.ok(short.maxSlope > 15);
  const long = analyzeSlope([{ type: 'garageentry', w: 8000, d: 30000, rot: 0 }]);
  assert.equal(long.ok, true);                   // 12%
});

test('地库审计：规则包 / 连通性 / 土方估算 / 报告', () => {
  const items = [
    { id: 's', type: 'garageslab', cx: 0, cy: 0, w: 60000, d: 40000, rot: 0 },
    { id: 'm', type: 'garagemodule', cx: 0, cy: 0, w: 60000, d: 40000, rot: 0 },
    { id: 'e', type: 'garageentry', cx: 0, cy: 25000, w: 8000, d: 30000, rot: 0 }
  ];
  const levels = [{ id: 'B1', elev: -3600, kind: 'basement', items }];
  const audit = garageAudit(levels, { households: 50, preset: 'standard' });
  assert.equal(audit.stats.total, 92);
  assert.equal(audit.checks.find(c => c.key === 'perHousehold').level, 'ok');
  assert.equal(audit.checks.find(c => c.key === 'connectivity').level, 'ok');
  assert.equal(audit.checks.find(c => c.key === 'slope').level, 'ok');
  assert.ok(audit.earthwork.soilVolume > 0);
  assert.ok(audit.earthwork.excavationVolume > audit.earthwork.soilVolume * 2);
  assert.equal(audit.preset, 'standard');

  const csv = buildGarageReportCsv({ audit, name: '测试方案', presetLabel: '标准' });
  assert.ok(csv.startsWith('\ufeff'), 'CSV 需要 BOM，Excel 才不乱码');
  assert.ok(csv.includes('总车位'));
  assert.ok(csv.includes('车道连通性'));
  assert.ok(csv.includes('土方估算'));

  const high = garageAudit(levels, { households: 50, preset: 'high' });
  assert.equal(high.rules.minStallsPerHousehold, GARAGE_PRESETS.high.rules.minStallsPerHousehold);
  assert.equal(earthworkStats([], []).soilVolume, 0);
});

test('stallsOf：子母车位算 2 个，车位组按 2.5m 折算', () => {
  assert.equal(stallsOf('parking', 2500, 5000), 1);
  assert.equal(stallsOf('parkingsub', 2500, 7500), 2);
  assert.equal(stallsOf('parkingrow', 10500, 5000), 4);
  assert.equal(stallsOf('garagemodule', 60000, 40000), 92);
  assert.equal(stallsOf('bed', 1800, 2000), 0);
});

test('parkingStats：分类汇总与总数一致', () => {
  const items = [
    { type: 'parking', w: 2500, d: 5000 },
    { type: 'parking', w: 2500, d: 5000 },
    { type: 'evparking', w: 2500, d: 5000 },
    { type: 'parkingaccessible', w: 3500, d: 5000 },
    { type: 'parkingsub', w: 2500, d: 7500 },
    { type: 'parkingcompact', w: 2200, d: 3800 },
    { type: 'parkingrow', w: 10500, d: 5000 },
    { type: 'garagemodule', w: 60000, d: 40000 }
  ];
  const s = parkingStats(items);
  // 2 个标准 + 车位组 4 个（默认分支计入标准）
  assert.equal(s.standard, 6);
  assert.equal(s.ev, 1);
  assert.equal(s.accessible, 1);
  assert.equal(s.tandem, 2);
  assert.equal(s.compact, 1);
  assert.equal(s.moduleStalls, 92);
  assert.equal(s.modules, 1);
  assert.equal(s.total, s.standard + s.ev + s.accessible + s.tandem + s.compact + s.moduleStalls);
  assert.equal(s.total, 2 + 4 + 1 + 1 + 2 + 1 + 92);
});
