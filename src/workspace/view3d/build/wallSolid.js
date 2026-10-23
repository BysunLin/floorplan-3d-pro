/* ============================================================================
 *  整段墙的实体几何（Shape 带洞 → 挤出）
 *
 *  旧做法：一面墙按门窗切成若干盒子，门洞上方再补一个「过梁」盒子。
 *  新做法：墙 = 一条立面轮廓（u 沿墙长、v 为高度），洞口是轮廓上的洞，
 *          沿墙厚方向一次挤出。于是：
 *    · 一面墙 = 1 个 mesh，没有盒子接缝、没有 z-fighting；
 *    · 洞口就是真的洞，窗台墙 / 窗上墙由墙体自身提供，不需要补过梁；
 *    · 墙体换材质时整面墙一起换，不会出现「过梁还是旧材质」。
 *
 *  代价：每次墙或洞口变化都要重新三角化 → 由 engine 的 wallCache 按签名复用，
 *        只有真正变了的墙才会重建。
 * ========================================================================== */
import * as THREE from 'three';
import { M, wx, wz } from '@/workspace/view3d/coords.js';

/**
 * @param {object} run      derive.js 推导出的整段墙
 * @param {object} opts
 * @param {number} opts.yb      墙体下沿（m，可为负，用于层间搭接）
 * @param {number} opts.yt      墙体上沿（m）
 * @param {object} opts.wallMat 墙面材质
 * @param {object} [opts.capMat] 墙顶截面材质（原来的深色顶面）
 * @param {boolean} [opts.alpha] 半透明外墙：不投影、不加顶盖
 * @param {boolean} [opts.walk]  漫游模式：加棱线便于分辨墙角
 * @param {object} [opts.edgeMat] 棱线材质
 * @returns {THREE.Group|null}
 */
export function buildWallSolid(run, opts = {}){
  const { yb, yt, wallMat, capMat, alpha = false, walk = false, edgeMat } = opts;
  const len = M(run.span[1] - run.span[0]);
  const depth = M(run.thickness);
  if (!(len > .001) || !(depth > .001) || !(yt - yb > .001)) return null;

  /* ---------- 立面轮廓：外框 + 洞口 ---------- */
  const shape = new THREE.Shape();
  shape.moveTo(0, yb);
  shape.lineTo(len, yb);
  shape.lineTo(len, yt);
  shape.lineTo(0, yt);
  shape.closePath();

  for (const h of run.holes || []){
    const a = M(Math.max(h.a, run.span[0]) - run.span[0]);
    const b = M(Math.min(h.b, run.span[1]) - run.span[0]);
    const sill = Math.max(h.sill, yb);
    const head = Math.min(h.head, yt);
    if (b - a < .01 || head - sill < .01) continue;
    const hole = new THREE.Path();
    hole.moveTo(a, sill);
    hole.lineTo(b, sill);
    hole.lineTo(b, head);
    hole.lineTo(a, head);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geo.computeVertexNormals();

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, wallMat);
  mesh.castShadow = !alpha;
  mesh.receiveShadow = !alpha;
  group.add(mesh);

  /* ---------- 墙顶截面：保持原来「深色压顶」的观感 ----------
   * 压顶整体抬到 yt 之上：与挤出体的顶面不再共面，否则俯视会闪出一层条纹。 */
  if (!alpha && capMat){
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len, .008, depth), capMat);
    cap.position.set(len / 2, yt + .004, depth / 2);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);
  }

  /* ---------- 漫游棱线 ---------- */
  if (walk && edgeMat){
    const ln = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), edgeMat);
    ln.userData.walkOnly = true;
    group.add(ln);
  }

  /* ---------- 摆到平面位置 ----------
   * 统一公式（正交墙的结果与原来的 h / v 两个分支逐值相同）：
   *   局部 +x = 墙轴 u = (cosθ, sinθ)；局部 +z = 法向 n = (-sinθ, cosθ)
   *   绕 Y 转 -θ 后 local x → (cosθ, 0, sinθ)、local z → (-sinθ, 0, cosθ)
   *   所以把挤出体放到「起点 - n·t/2」，厚度就从 -t/2 铺到 +t/2。 */
  const rad = (run.deg ?? (run.axis === 'h' ? 0 : 90)) * Math.PI / 180;
  const ax = run.line ? run.line.a[0] : (run.axis === 'h' ? run.span[0] : run.c);
  const ay = run.line ? run.line.a[1] : (run.axis === 'h' ? run.c : run.span[0]);
  const half = run.thickness / 2;
  group.rotation.y = -rad;
  group.position.set(
    wx(ax + Math.sin(rad) * half), 0,
    wz(ay - Math.cos(rad) * half)
  );
  return group;
}
