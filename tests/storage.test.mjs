/* localStorage 存档：v2 节点图 ⇄ 运行时数组（node --test） */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: k => { mem.delete(k); }
};

const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const lib = await server.ssrLoadModule('/src/core/library/index.js');

test.after(async () => { await server.close(); });

const STORE = 'huxing-design-v1';
const norm = v => JSON.parse(JSON.stringify(v ?? null));

function fixture(){
  return {
    planId: '3b2b',
    activeLevel: 'L1',
    levels: [{ id: 'L1', no: 1, name: '一层', kind: 'floor', elev: 0, clearH: 2800 }],
    walls: [[0, 0, 1000, 120, 'n'], [1800, 0, 3000, 120, 'n']],
    wins: [[400, 0, 700, 120]],
    doors: [{ name: '房门', rect: [1000, 0, 1800, 120], h: [1000, 60], c: [1, 0], o: [0, 1], len: 800, entry: false, dbl: false }],
    slides: [],
    bays: [],
    regions: [{ id: 'r1', poly: [[0, 0], [500, 0], [500, 500], [0, 500]], mat: 'tile600' }],
    furniture: [{ id: 'f1', type: 'sofa', cx: 100, cy: 200, w: 1800, d: 800, rot: 0 }],
    rooms: { r1: { name: '厨房', mat: 'tile600', light: 'round' } },
    demolished: ['w5'],
    elemNames: { w0: '隔墙' },
    wallMats: { w1: 'glass' },
    measures: [],
    deletedRooms: [],
    regionSeed: '',
    geoVersion: 1,
    levelData: {}
  };
}

test('save：写进 localStorage 的是节点图，不是墙段数组', () => {
  mem.clear();
  lib.save(fixture());
  const raw = JSON.parse(mem.get(STORE));
  assert.equal(raw.__planDoc, 2);
  assert.equal(raw.plan.walls, undefined);
  assert.equal(raw.plan.furniture, undefined);
  assert.ok(Object.values(raw.nodes.L1.nodes).some(n => n.type === 'wall'));
  assert.ok(Object.values(raw.nodes.L1.nodes).some(n => n.type === 'opening'));
});

test('load：节点图投影回数组，增量与保存前一致', () => {
  mem.clear();
  const src = fixture();
  lib.save(src);
  const back = lib.load();
  for (const f of ['walls', 'wins', 'doors', 'slides', 'bays', 'regions', 'furniture']){
    assert.deepEqual(norm(back[f]), norm(src[f]), `${f} 不一致`);
  }
  assert.deepEqual(norm(back.demolished), norm(src.demolished));
  assert.deepEqual(norm(back.elemNames), norm(src.elemNames));
  assert.deepEqual(norm(back.wallMats), norm(src.wallMats));
});

test('load：旧版 v1 存档（顶层直接是 state）仍可读', () => {
  mem.clear();
  const src = fixture();
  mem.set(STORE, JSON.stringify(src));
  const back = lib.load();
  assert.deepEqual(norm(back.walls), norm(src.walls));
  assert.deepEqual(norm(back.furniture), norm(src.furniture));
});

test('load：v2 存档损坏时返回 null（由上层回落到默认方案）', () => {
  mem.clear();
  lib.save(fixture());
  const raw = JSON.parse(mem.get(STORE));
  raw.nodes.L1.nodes.wall_0.thickness = -1;
  mem.set(STORE, JSON.stringify(raw));
  assert.equal(lib.load(), null);
});

test('save / load 往返两次仍然稳定', () => {
  mem.clear();
  lib.save(fixture());
  const once = lib.load();
  lib.save(once);
  const twice = lib.load();
  for (const f of ['walls', 'wins', 'doors', 'regions', 'furniture']){
    assert.deepEqual(norm(twice[f]), norm(once[f]), `${f} 第二次往返漂移`);
  }
});
