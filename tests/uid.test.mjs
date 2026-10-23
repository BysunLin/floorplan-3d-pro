/* 元素身份（uid）：名称 / 墙面材质不再随数组下标漂移 */
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
const app = await server.ssrLoadModule('/src/stores/index.js');
const { WALLS, WINS } = await server.ssrLoadModule('/src/core/model/plan.js');

test.after(async () => { await server.close(); });

const plan = app.usePlanStore();

function reset(){
  const s = plan.state;
  s.walls = []; s.wins = []; s.doors = []; s.slides = []; s.bays = [];
  s.wallMats = {}; s.elemNames = {}; s.demolished = [];
  s.uidSeq = 0;
  plan.syncUserGeom();
  return WALLS.length;
}

test('用户墙补 uid；给 A 开洞后 B 的材质仍挂在 B 上', () => {
  const n0 = reset();

  plan.addWall({ x: 13000, y: 13000 }, { x: 13000, y: 14000 }, 'n');
  plan.addWall({ x: 13000, y: 15000 }, { x: 14000, y: 15000 }, 'n');
  plan.syncUserGeom();

  const uidA = WALLS[n0][5], uidB = WALLS[n0 + 1][5];
  assert.ok(uidA && uidB, '用户墙应有 uid');
  assert.notEqual(uidA, uidB, '两段墙 uid 不能相同');

  plan.setWallMat(n0 + 1, 'glass');
  assert.equal(plan.wallMatId(n0 + 1), 'glass');

  // A 上开门 → A 被切段、B 的下标会往后挪
  plan.addOpening('door', n0, { x: 13000, y: 13500 });
  plan.syncUserGeom();

  const idxB = WALLS.findIndex(w => w[5] === uidB);
  assert.ok(idxB >= 0, 'B 墙仍然存在，只是下标变了');
  assert.equal(plan.wallMatId(idxB), 'glass', '材质跟着 B 的 uid 走，不会被 A 的切段挤走');
  assert.equal(WALLS.filter(w => w[5] === uidB).length, 1, 'B 墙没有被误切');
  assert.ok(WALLS.filter(w => w[5] === uidA).length >= 1, 'A 的切段共享同一个 uid');
});

test('户型自带墙转成用户元素后，名称 / 材质跟着 uid 保留', () => {
  reset();
  const i = WALLS.findIndex(w => w[4] === 'n');
  assert.ok(i >= 0, '需要一个非承重墙做样本');

  const key = plan.elemKey('wall', i);
  plan.state.elemNames[key] = '主卧隔墙';
  plan.state.wallMats[key] = 'glass';

  // 改尺寸会先把自带墙转成用户墙（内部走 ensureUserElem），下标随之变化
  const ni = plan.setElemSize('wall', i, 900, 120);
  plan.syncUserGeom();

  assert.notEqual(ni, i, '应该复制成新的用户墙');
  assert.equal(plan.elemName('wall', ni), '主卧隔墙', '名称不能丢');
  assert.equal(plan.wallMatId(ni), 'glass', '材质不能丢');
});

test('旧存档的按下标键会迁移到 uid 键，且能继续读到', () => {
  reset();
  const i = WALLS.findIndex(w => w[4] === 'n');
  const legacy = 'w' + i;

  plan.state.elemNames[legacy] = '旧名字';
  plan.state.wallMats[legacy] = 'glass';
  plan.syncUserGeom();

  const uid = plan.elemKey('wall', i);
  assert.equal(uid, `bw${i}`, '自带墙的 uid 由下标虚拟出来');
  assert.equal(plan.state.elemNames[uid], '旧名字');
  assert.equal(plan.state.wallMats[uid], 'glass');
  assert.equal(plan.state.elemNames[legacy], undefined, '旧键应被清理');
  assert.equal(plan.elemName('wall', i), '旧名字');
  assert.equal(plan.wallMatId(i), 'glass');
});

test('用户窗改尺寸后 uid 仍然保留', () => {
  const n0 = reset();
  plan.addWall({ x: 13000, y: 13000 }, { x: 13000, y: 14000 }, 'n');
  plan.syncUserGeom();

  plan.addOpening('win', n0, { x: 13000, y: 13500 });
  plan.syncUserGeom();

  const uid = plan.state.wins.at(-1)?.[4];
  assert.ok(uid, '用户窗应有 uid');

  const abs = WINS.findIndex(r => r[4] === uid);
  assert.ok(abs >= 0, '窗应该在解析结果里');

  plan.setElemSize('win', abs, 1500, 240);
  plan.syncUserGeom();

  assert.ok(WINS.some(r => r[4] === uid), '改尺寸（整段替换矩形）后 uid 仍在');
});
