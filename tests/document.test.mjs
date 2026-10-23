/* 方案文档 v2：节点图存档 ⇄ 扁平数组投影（node --test） */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });

const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

const io = await server.ssrLoadModule('/src/core/io/project.js');
const doc = await server.ssrLoadModule('/src/core/nodes/document.js');

test.after(async () => { await server.close(); });

const norm = v => JSON.parse(JSON.stringify(v ?? null));

/** 一份包含各类用户增量的完整 state */
function fixture(){
  return {
    planId: '3b2b',
    activeLevel: 'L1',
    levels: [
      { id: 'L1', no: 1, name: '一层', kind: 'floor', elev: 0, clearH: 2800 },
      { id: 'L2', no: 2, name: '二层', kind: 'floor', elev: 2800, clearH: 2800 }
    ],
    walls: [[0, 0, 1000, 120, 'n'], [1800, 0, 3000, 120, 'n'], [0, 120, 120, 900, 'b']],
    wins: [[400, 0, 700, 120]],
    doors: [{
      name: '房门', rect: [1000, 0, 1800, 120],
      h: [1000, 60], c: [1, 0], o: [0, 1], len: 800, entry: false, dbl: false
    }],
    slides: [{ rect: [2000, 0, 2600, 120], v: false }],
    bays: [{ id: 'bay_x', name: '飘窗', poly: [[0, 0], [100, 0], [100, 100], [0, 100]], mat: 'marble', counted: false }],
    regions: [{
      id: 'r1', name: '厨房', poly: [[0, 0], [500, 0], [500, 500], [0, 500]],
      mat: 'tile600', lift: 8
    }],
    furniture: [
      { id: 'f1', type: 'sofa', cx: 100, cy: 200, w: 1800, d: 800, rot: 0, color: '#fff' },
      { id: 'f2', type: 'stair', cx: 0, cy: 0, w: 1000, d: 900, rot: 90, sdir: -1 }
    ],
    rooms: { r1: { name: '厨房', mat: 'tile600' } },
    demolished: ['w3', 'nd1'],
    elemNames: { nd0: '大门' },
    wallMats: { w2: 'glass' },
    measures: [],
    regionSeed: '',
    geoVersion: 1,
    levelData: {
      L2: {
        walls: [[0, 0, 500, 120, 'n']],
        wins: [], doors: [], slides: [], bays: [], regions: [],
        furniture: [{ id: 'f3', type: 'bed', cx: 0, cy: 0, w: 1500, d: 2000, rot: 0 }],
        rooms: {}, demolished: [], wallMats: {}, elemNames: {}
      }
    }
  };
}

const FIELDS = ['walls', 'wins', 'doors', 'slides', 'bays', 'regions', 'furniture'];

test('v2 文档把增量存成节点图，plan 里不再有墙段数组', () => {
  const raw = io.buildProjectDocument({ plan: fixture() });
  assert.equal(raw.formatVersion, 2);
  assert.equal(raw.plan.walls, undefined, 'plan 不应再存墙段');
  assert.equal(raw.plan.furniture, undefined);
  assert.ok(raw.nodes.L1?.nodes?.wall_0, '节点图里应有 wall_0');
  assert.ok(raw.nodes.L1.nodes.open_nd0, '节点图里应有门 open_nd0');
  assert.ok(raw.nodes.L2?.nodes?.wall_0, '其它楼层也要有节点图');
  // 非投影字段仍然留在 plan 里
  assert.deepEqual(raw.plan.demolished, ['w3', 'nd1']);
  assert.deepEqual(raw.plan.wallMats, { w2: 'glass' });
});

test('v2 往返：JSON 序列化后导入，增量完全一致', () => {
  const src = fixture();
  const raw = JSON.parse(JSON.stringify(io.buildProjectDocument({ plan: src })));
  const { plan } = io.readProjectDocument(raw);

  for (const f of FIELDS) assert.deepEqual(norm(plan[f]), norm(src[f]), `${f} 不一致`);
  assert.deepEqual(norm(plan.demolished), norm(src.demolished));
  assert.deepEqual(norm(plan.elemNames), norm(src.elemNames));
  assert.deepEqual(norm(plan.wallMats), norm(src.wallMats));
  assert.deepEqual(norm(plan.rooms), norm(src.rooms));
  assert.deepEqual(norm(plan.levelData.L2), norm(src.levelData.L2), '二层增量不一致');
});

test('v2 往返：门扇朝向 / 家具附加字段 / 区域高差都要保住', () => {
  const raw = JSON.parse(JSON.stringify(io.buildProjectDocument({ plan: fixture() })));
  const { plan } = io.readProjectDocument(raw);

  const door = plan.doors[0];
  assert.deepEqual(door.h, [1000, 60]);
  assert.deepEqual(door.o, [0, 1]);
  assert.equal(door.len, 800);
  assert.equal(door.entry, false);
  assert.equal(door.dbl, false);
  assert.equal(door.name, '房门');

  const stair = plan.furniture.find(f => f.type === 'stair');
  assert.equal(stair.sdir, -1, '楼梯上下行方向不能丢');

  const region = plan.regions[0];
  assert.equal(region.lift, 8);
  assert.equal(region.name, '厨房');
});

test('v1 文档（数组直存）仍然可读', () => {
  const src = fixture();
  const raw = {
    format: 'floorplan-3d-pro', formatVersion: 1,
    plan: { ...src }
  };
  const { plan, legacy } = io.readProjectDocument(raw);
  assert.equal(legacy, false);
  assert.deepEqual(norm(plan.walls), norm(src.walls));
});

test('旧版裸 state 仍然可读', () => {
  const src = fixture();
  const { plan, legacy } = io.readProjectDocument(src);
  assert.equal(legacy, true);
  assert.deepEqual(norm(plan.walls), norm(src.walls));
});

test('节点图损坏时拒绝导入，并指出出错的字段', () => {
  const raw = JSON.parse(JSON.stringify(io.buildProjectDocument({ plan: fixture() })));
  raw.nodes.L1.nodes.wall_0.thickness = -5;
  assert.throws(() => io.readProjectDocument(raw), /方案数据损坏/);
});

test('缺节点图的 v2 文档不会被静默接受', () => {
  const raw = JSON.parse(JSON.stringify(io.buildProjectDocument({ plan: fixture() })));
  delete raw.nodes;
  assert.throws(() => io.readProjectDocument(raw), /方案数据不完整/);
});

test('真实户型：初始家具 / 户外区域当作增量，往返不丢字段', async () => {
  const { makePlan } = await server.ssrLoadModule('/src/core/plans/index.js');
  const p = makePlan('garden');
  const src = {
    planId: 'garden', activeLevel: 'L1',
    levels: p.levels || [{ id: 'L1', name: '一层', kind: 'floor', elev: 0, clearH: 2800 }],
    walls: [], wins: [], doors: [], slides: [], bays: [],
    regions: p.regions || [], furniture: p.furniture || [],
    levelData: {}
  };
  const raw = JSON.parse(JSON.stringify(io.buildProjectDocument({ plan: src })));
  const { plan } = io.readProjectDocument(raw);
  assert.ok(plan.furniture.length > 20, '家具应该都在');
  assert.deepEqual(norm(plan.furniture), norm(src.furniture));
  assert.deepEqual(norm(plan.regions), norm(src.regions));
});

test('文档往返保留元素 uid（名称 / 墙面材质靠它索引）', () => {
  const src = fixture();
  src.walls[0][5] = 'u1';
  src.wins[0][4] = 'u2';
  src.doors[0].uid = 'u3';
  src.slides[0].uid = 'u4';
  src.uidSeq = 4;

  const raw = JSON.parse(JSON.stringify(io.buildProjectDocument({ plan: src })));
  const { plan } = io.readProjectDocument(raw);

  assert.equal(plan.walls[0][5], 'u1');
  assert.equal(plan.wins[0][4], 'u2');
  assert.equal(plan.doors[0].uid, 'u3');
  assert.equal(plan.slides[0].uid, 'u4');
});

test('split / join 是纯函数：不改动输入', () => {
  const src = fixture();
  const snapshot = JSON.stringify(src);
  const { plan, nodes } = doc.splitDocumentPlan(src);
  doc.joinDocumentPlan(plan, nodes, { strict: true });
  assert.equal(JSON.stringify(src), snapshot, '输入 state 被改动了');
});
