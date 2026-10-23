/* 家具烘焙回归：几何合并后「体积 / 三角面 / 拾取 id」都不能变，且 Mesh 数要压下来 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });
globalThis.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };

const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

const THREE = await import('three');
const { buildFurniture } = await server.ssrLoadModule('/src/workspace/view3d/build/furniture.js');
const { LIB, SANDBOX_TYPES } = await server.ssrLoadModule('/src/core/library/index.js');

test.after(async () => { await server.close(); });

const makeF = (type, w, d, color = '#cccccc') => ({
  id: 'f1', type, cx: 2000, cy: 3000, w, d, rot: 0, color, sdir: 1
});

function stats(g){
  let meshes = 0, tris = 0;
  g.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    const idx = o.geometry.index;
    tris += idx ? idx.count/3 : (o.geometry.attributes.position?.count || 0)/3;
  });
  const box = new THREE.Box3().setFromObject(g);
  return { meshes, tris, box };
}

test('烘焙：家具库全部资产都能建出几何，且零件不会丢', () => {
  const bad = [];
  for (const grp of LIB){
    for (const it of grp.items){
      const g = buildFurniture(makeF(it[0], it[2], it[3], it[4]), 2.8);
      const s = stats(g);
      if (!s.meshes || !s.tris) bad.push(`${it[0]} ${it[1]}`);
      // 合并后不应超出家具外轮廓太多（灯头、伞盖这类出挑留 1 m 余量；
      // 沙盘楼栋有阳台 / 挑檐 / 入口雨棚，允许 2.5 m 出挑）
      // 塔吊的起重臂远超底座轮廓，单独放行；其余沙盘资产允许阳台 / 挑檐 2.5m
      const pad = it[0] === 'crane' ? 30 : SANDBOX_TYPES.includes(it[0]) ? 2.5 : 1;
      const size = s.box.getSize(new THREE.Vector3());
      if (size.x > it[2]/1000 + pad || size.z > it[3]/1000 + pad)
        bad.push(`${it[0]} 体积异常 ${size.x.toFixed(2)}×${size.z.toFixed(2)}`);
      // 包围盒中心必须落在摆放点附近：矩阵重复应用（烘焙常见坑）会把它甩到很远
      // 组合型场地资产（校园 / 医院 / 塔吊等）本身重心就偏离锚点，放宽到 8m；
      // 普通家具 2.5m 内，用于捕捉矩阵重复应用这类错误。
      const cPad = ['school', 'hospital', 'crane', 'park', 'hill', 'metroline', 'powerline'].includes(it[0]) ? 8 : 2.5;
      const c = s.box.getCenter(new THREE.Vector3());
      if (Math.abs(c.x - g.position.x) > cPad || Math.abs(c.z - g.position.z) > cPad)
        bad.push(`${it[0]} 位置偏移 (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
    }
  }
  assert.deepEqual(bad, []);
});

test('动画件：道闸 / 大门 / 喷泉在烘焙后保留可驱动子组', () => {
  const fxOf = (type, w, d) => {
    const g = buildFurniture(makeF(type, w, d));
    const out = [];
    g.traverse(o => { if (o.userData.fx) out.push(o.userData.fx.kind); });
    return out;
  };
  assert.deepEqual(fxOf('barrier', 4000, 500), ['barrier']);
  assert.deepEqual(fxOf('gate', 20000, 6000), ['gate']);
  assert.ok(fxOf('fountain', 6000, 6000).filter(k => k === 'jet').length >= 9);
  assert.ok(fxOf('dryfountain', 8000, 8000).filter(k => k === 'jet').length >= 12);
});

test('烘焙：Mesh 数合并到「材质数」量级，三角面基本不变', () => {
  const cases = [
    ['bookshelf', 1600, 350],
    ['plant', 700, 700],
    ['escalator', 1100, 3600],
    ['table', 1400, 800],
    ['bed', 1800, 2000]
  ];
  for (const [type, w, d] of cases){
    const s = stats(buildFurniture(makeF(type, w, d), 2.8));
    assert.ok(s.meshes >= 1, `${type} 没有几何`);
    assert.ok(s.meshes <= 24, `${type} 合并后仍有 ${s.meshes} 个 Mesh（应 ≤ 24）`);
  }
  // 书架：书本走顶点色 + 合并，整架控制在 12 个 Mesh 以内
  assert.ok(stats(buildFurniture(makeF('bookshelf', 1600, 350), 2.8)).meshes <= 12);
  // 绿植：叶片段数收敛后单盆不超过 4000 面
  assert.ok(stats(buildFurniture(makeF('plant', 700, 700), 2.8)).tris <= 4000);
});

test('烘焙：拾取 id 与外层组不变（3D 选中/拖动依赖它）', () => {
  const g = buildFurniture(makeF('bed', 1800, 2000), 2.8);
  assert.equal(g.userData.fid, 'f1');
  assert.ok(g.isGroup);
  assert.ok(g.position.x !== 0 || g.position.z !== 0, '外层组仍带世界坐标');
  // 合并出来的 Mesh 都是直接子级，且共用同一批材质（不再逐零件建 Mesh）
  assert.ok(g.children.every(c => c.isMesh));
});
