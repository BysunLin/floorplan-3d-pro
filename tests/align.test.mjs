/* 画墙墙线对齐：吸附到附近墙体边线 / 中线，并给出延伸辅助线 */
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

test.after(async () => { await server.close(); });

const plan = app.usePlanStore();
const view = app.useViewStore().view;

/** 两块同向墙：y 20000..20120（中线 20060）与 y 21000..21120（中线 21060） */
function setup(){
  const s = plan.state;
  s.walls = [
    [20000, 20000, 22000, 20120, 'n'],
    [20000, 21000, 22000, 21120, 'n']
  ];
  s.wins = []; s.doors = []; s.slides = []; s.bays = []; s.regions = [];
  s.demolished = []; s.wallMats = {}; s.elemNames = {};
  plan.syncUserGeom();
  view.s = 0.1;                 // 8px 容差 → 80mm
}

test('水平墙：墙线吸到附近墙体的中线，并给出延伸辅助线', () => {
  setup();
  const al = plan.alignWallDraw({ x: 20000, y: 20055 }, { x: 21000, y: 20055 }, -1);

  assert.equal(al.snapped, true, '应该发生对齐吸附');
  assert.equal(al.a.y, 20060, '起点落到中线');
  assert.equal(al.b.y, 20060, '终点跟着一起移动（保持正交）');
  assert.equal(al.guides.length, 1);

  const g = al.guides[0];
  assert.equal(g.y1, 20060);
  assert.equal(g.y2, 20060);
  assert.ok(g.x1 <= 20000 && g.x2 >= 21000, '辅助线要覆盖参考墙与新墙');
});

test('水平墙：优先吸附到「面」而不是中线（等距时）', () => {
  setup();
  // 20000 是下皮；中线 20060 距 20000 有 60，故 20000 更近
  const al = plan.alignWallDraw({ x: 20000, y: 20002 }, { x: 21000, y: 20002 }, -1);
  assert.equal(al.snapped, true);
  assert.equal(al.a.y, 20000);
});

test('竖直墙：墙线吸到竖墙边线', () => {
  setup();
  const s = plan.state;
  s.walls.push([30000, 20000, 30120, 22000, 'n']);   // 竖墙 x 30000..30120
  plan.syncUserGeom();

  const al = plan.alignWallDraw({ x: 30110, y: 20000 }, { x: 30110, y: 21000 }, -1);
  assert.equal(al.snapped, true);
  assert.equal(al.a.x, 30120, '吸到更近的那条边');
  assert.equal(al.guides[0].x1, 30120);
  assert.ok(al.guides[0].y1 <= 20000 && al.guides[0].y2 >= 21000);
});

test('距离超出容差不吸附', () => {
  setup();
  const al = plan.alignWallDraw({ x: 20000, y: 20500 }, { x: 21000, y: 20500 }, -1);
  assert.equal(al.snapped, undefined);
  assert.equal(al.a.y, 20500);
  assert.equal(al.guides.length, 0);
});

test('沿起点所在的墙延长时不做其它对齐', () => {
  setup();
  // 起点墙是第一块（横向），新墙也横向 → 视为延长，不应被中线拉走
  const al = plan.alignWallDraw({ x: 22000, y: 20060 }, { x: 23000, y: 20060 }, 0);
  assert.equal(al.snapped, undefined);
  assert.equal(al.a.y, 20060);
});

test('吸附后起终点保持正交（不会画歪）', () => {
  setup();
  const al = plan.alignWallDraw({ x: 20000, y: 20055 }, { x: 21000, y: 20057 }, -1);
  assert.equal(al.a.y, al.b.y);
  assert.notEqual(al.a.x, al.b.x);
});
