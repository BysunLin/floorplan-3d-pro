import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ============================================================================
 *  几何烘焙：把一棵子树里成百上千个 Mesh 按「材质 + 阴影设置」合并成几个 Mesh
 *
 *  3D 场景的瓶颈从来不是三角面，而是 draw call：
 *    · 一件家具由几十个零件组成（书架 196 个、扶梯 104 个、绿植 65 个…），
 *      商场三层 772 件家具 → 2 万多个 Mesh；
 *    · 每个 Mesh 每帧都要一次 JS → 驱动的提交，鸟瞰时又几乎全在视锥里，
 *      实测 1.95 万 draw call / 帧、60+ ms 一帧。
 *
 *  烘焙后每件家具只剩 1~N 个 Mesh（N = 用到的材质数），
 *  父子关系与 userData 保留，拾取 / 拖动 / 选中框（按 group 的 fid 找）全部不受影响。
 * ========================================================================== */

/* 合并只保留这几种属性：不同图元（Box / Cylinder / Lathe / Extrude…）
 * 的属性集合不一致，直接 mergeGeometries 会整组返回 null。
 * color 供「顶点色」模型（书架的书脊）使用：同材质不同颜色也能合并成一个 Mesh。 */
const KEEP = ['position', 'normal', 'uv', 'color'];

/** 归一化一份几何：只留标准属性，缺法线/UV 的补齐，清掉分组信息 */
function normalized(src){
  const g = src.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv){
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n*2), 2));
  }
  g.morphAttributes = {};
  if (g.groups.length) g.clearGroups();
  return g;
}

/** 递归剪掉合并后变空的组（保留 root 本身，也就不会误删穿插在里面的线框 / 实例网格） */
function pruneEmpty(node, root){
  for (let i = node.children.length - 1; i >= 0; i--){
    const c = node.children[i];
    if (c.isGroup){ pruneEmpty(c, root); if (!c.children.length) node.remove(c); }
  }
}

/**
 * 合并 root 下的所有普通 Mesh（局部坐标），返回合并出来的 Mesh 数组。
 * · root 自身的 transform / userData 保持不变（家具靠 root 的 fid 做拾取）
 * · InstancedMesh、多材质网格、隐藏对象、线框一律跳过（保持原样）
 * · 任何一组合并失败就整体放弃，保证不会出现「零件凭空消失」
 */
export function bakeGroup(root, { minMerge = 2 } = {}){
  if (!root || !root.isObject3D) return [];
  const meshes = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
    if (Array.isArray(o.material)) return;                 // 多材质网格（墙体单元）不动
    if (!o.geometry || !o.geometry.attributes?.position) return;
    meshes.push(o);
  });
  if (meshes.length < minMerge) return [];

  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  /* 分组键必须带上阴影开关：同样的材质，跳过投影的玻璃件不能和实心件混在一起 */
  const buckets = new Map();
  for (const m of meshes){
    const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, list: [] });
    b.list.push(m);
  }

  /* 先全部合并好，再动原来的层级：中途失败就原样返回 */
  const built = [];
  const local = new THREE.Matrix4();
  try {
    for (const b of buckets.values()){
      const geos = [];
      const allIndexed = b.list.every(m => !!m.geometry.index);
      for (const m of b.list){
        const g = normalized(m.geometry);
        local.multiplyMatrices(inv, m.matrixWorld);
        g.applyMatrix4(local);
        if (!allIndexed && g.index){                 // 索引 / 非索引混在一起时统一转成非索引
          const flat = g.toNonIndexed();
          g.dispose();
          geos.push(flat);
        } else geos.push(g);
      }
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged){                                  // 这一组失败：整套放弃，保持原样
        geos.forEach(g => g.dispose());
        built.forEach(it => it.geometry.dispose());
        return [];
      }
      if (geos.length > 1) geos.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.recv;
      built.push(mesh);
    }
  } catch (e){
    built.forEach(it => it.geometry.dispose());
    return [];
  }
  if (!built.length) return [];

  for (const m of meshes) m.removeFromParent();
  pruneEmpty(root, root);
  for (const m of built) root.add(m);
  return built;
}
