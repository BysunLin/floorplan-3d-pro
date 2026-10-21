import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M } from '@/workspace/view3d/coords.js';
import { mat, glassMat, frameMat, chrome, hwMat, ceramic, glowMat } from './materials.js';

export const asMat = m => typeof m === 'string' ? mat(m) : m;
export const sh = o => { o.castShadow = o.receiveShadow = true; return o; };
export const mesh = (geo, m) => sh(new THREE.Mesh(geo, asMat(m)));
export const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };

/** 立方体：y 为底面高度 */
export function box(w, h, d, m, x = 0, y = 0, z = 0){
  const o = mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h/2, z);
  return o;
}
/** 圆角立方体 */
export function rbox(w, h, d, m, x = 0, y = 0, z = 0, r = .04){
  const o = mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w/2 - .001, h/2 - .001, d/2 - .001)), m);
  o.position.set(x, y + h/2, z);
  return o;
}
/** 圆柱：y 为底面 */
export function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 28){
  const o = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y + h/2, z);
  return o;
}
/** 旋转体：pts = [[半径, 高度], …] 自下而上，y = 底面 */
export function lathe(pts, m, x = 0, y = 0, z = 0, seg = 40){
  const o = mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h)), seg), m);
  o.position.set(x, y, z);
  return o;
}
/** 两点之间的圆杆（收分椅腿、斜撑） */
export function rod(a, b, r0, m, r1 = r0, seg = 12){
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const o = mesh(new THREE.CylinderGeometry(r1, r0, A.distanceTo(B), seg), m);
  o.position.copy(A).add(B).multiplyScalar(.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return o;
}
/** 沿曲线的圆管（水龙头、扶手、灯臂） */
export const tube = (pts, r, m, seg = 40) => mesh(
  new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal'),
    seg, r, 10), m);

/** 椭球（靠垫、叶片、豆袋）：y 为中心 */
export function blob(rx, ry, rz, m, x = 0, y = 0, z = 0, seg = 24){
  const o = mesh(new THREE.SphereGeometry(1, seg, Math.round(seg*.7)), m);
  o.scale.set(rx, ry, rz);
  o.position.set(x, y, z);
  return o;
}
/** 水平圆环：y 为中心 */
export function ring(R, r, m, x = 0, y = 0, z = 0){
  const o = mesh(new THREE.TorusGeometry(R, r, 10, 48), m);
  o.rotation.x = Math.PI/2;
  o.position.set(x, y, z);
  return o;
}
export function rrect(w, d, r){
  const s = new THREE.Shape(), x = -w/2, y = -d/2;
  r = Math.min(r, w/2 - .001, d/2 - .001);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** 中空圆角框（浴缸、水槽沿、椅背框）：外 w×d、壁厚 t、高 h */
export function shell(w, d, h, t, r, m, x = 0, y = 0, z = 0){
  const s = rrect(w, d, r);
  s.holes.push(rrect(w - 2*t, d - 2*t, Math.max(.004, r - t)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 10 });
  geo.rotateX(-Math.PI/2);
  const o = mesh(geo, m);
  o.position.set(x, y, z);
  return o;
}

/** 四条收分腿 */
export const legs = (g, w, d, h, m, inset = .05, r = .02) =>
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(
    rod([a*(w/2 - inset), 0, b*(d/2 - inset)], [a*(w/2 - inset), h, b*(d/2 - inset)], r*.7, m, r)));

/* ======================= 零件 ======================= */
/** 柜门 / 抽屉面板上的拉手 */
export function pull(g, len, vert, x, y, z){
  const m = hwMat(), o = new THREE.Group();
  o.add(vert ? box(.01, len, .01, m, 0, -len/2, .028) : box(len, .01, .01, m, 0, -.005, .028));
  [-1, 1].forEach(s => o.add(
    vert ? box(.008, .008, .028, m, 0, s*(len/2 - .015) - .004, .014)
         : box(.008, .008, .028, m, s*(len/2 - .015), -.004, .014)));
  o.position.set(x, y, z);
  g.add(o);
}

/** 圆钮拉手 */
export function knob(g, x, y, z){
  const k = cyl(.011, .014, .02, hwMat(), x, y - .01, z + .01, 16);
  k.rotation.x = Math.PI/2;
  g.add(k, blob(.014, .014, .008, hwMat(), x, y, z + .022, 12));
}

/**
 * 柜门 / 抽屉面板阵列
 * @param hd 'bar' 金属拉手 | 'knob' 圆钮 | 'edge' 顶部隐形拉槽 | 'none'
 */
export function fronts(g, x0, y0, w, h, z, nx, ny, m, hd = 'bar', hy = null){
  const gap = .005, pw = w/nx, ph = h/ny, fz = z + .018;
  g.add(box(w, h, .002, '#2a2724', x0 + w/2, y0, z + .001));   // 缝隙里透出的暗色
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++){
    const cx = x0 + pw*(i + .5), yb = y0 + ph*j, drawer = ph < .4 && pw >= ph;
    g.add(rbox(pw - gap, ph - gap, .018, m, cx, yb + gap/2, z + .009, .003));
    if (hd === 'none') continue;
    if (hd === 'edge'){ g.add(box(pw - .05, .01, .006, '#3c3a37', cx, yb + ph - gap - .018, fz)); continue; }
    if (drawer){ hd === 'knob' ? knob(g, cx, yb + ph/2, fz) : pull(g, Math.min(.3, pw*.45), false, cx, yb + ph/2, fz); continue; }
    const len = Math.min(.45, ph*.35);
    const hx = nx === 1 ? cx + pw/2 - .045 : (i % 2 ? cx - pw/2 + .04 : cx + pw/2 - .04);
    const y = Math.min(yb + ph - .05 - len/2, Math.max(yb + .05 + len/2, hy ?? yb + ph/2));
    hd === 'knob' ? knob(g, hx, y, fz) : pull(g, len, true, hx, y, fz);
  }
}

export const vasePts = (r, h) => [[0, 0], [r*.65, 0], [r, h*.32], [r*.92, h*.62], [r*.42, h*.86], [r*.5, h]];

export function vase(g, x, y, z, r, h, c, R, flowers = true){
  g.add(lathe(vasePts(r, h), mat(c, { roughness: .35, side: THREE.DoubleSide }), x, y, z, 32));
  if (!flowers) return;
  const cols = ['#f3e6d8', '#e8b4a0', '#f6d27a', '#ffffff'];
  for (let k = 0; k < 5; k++){
    const a = k*1.26 + R()*.4, s = .03 + R()*.05;
    const top = [x + Math.cos(a)*s, y + h + .12 + R()*.14, z + Math.sin(a)*s];
    g.add(rod([x, y + h*.6, z], top, .003, '#6f8f4a', .003, 6),
          blob(.022, .018, .022, cols[k % 4], ...top, 12));
  }
}

export function tableLamp(g, x, y, z, s = 1){
  g.add(lathe([[0, 0], [.06*s, 0], [.075*s, .05*s], [.08*s, .12*s], [.055*s, .2*s], [.018*s, .25*s], [.012*s, .3*s]],
    ceramic({ roughness: .3 }), x, y, z, 32));
  g.add(lathe([[.13*s, 0], [.1*s, .18*s]], glowMat('#f6ecd9', '#ffdca0', .35), x, y + .26*s, z, 40),
      blob(.03*s, .03*s, .03*s, glowMat('#fff', '#ffe2b0', 1), x, y + .31*s, z, 12));
}

export const plate = (g, r, x, y, z) => g.add(
  lathe([[0, 0], [r*.6, 0], [r*.72, .008], [r, .02]], ceramic({ side: THREE.DoubleSide }), x, y, z, 32));

/* ============================================================================
 *  家具模型：局部坐标（中心原点，y=0 地面，背面朝 -z）
 *  w/d 为米（已由 M() 换算），c 为颜色
 * ========================================================================== */
/** 淋浴房 / 开放式淋浴房通用建模：withGlass=false 时不生成玻璃隔断与边框 */
export function showerModel(g, w, d, bz, withGlass){
  const cm = chrome(), x = -w/4;
  g.add(rbox(w, .05, d, mat('#f4f4f2', { roughness: .3 }), 0, 0, 0, .01),
        box(w*.6, .003, .05, mat('#9aa1a8', { metalness: .8, roughness: .3 }), 0, .05, bz + .08));
  if (withGlass){
    [[w, .01, 0, d/2 - .005], [.01, d, w/2 - .005, 0]].forEach(([gw, gd, px, pz]) => {
      const p = box(gw, 1.95, gd, glassMat, px, .05, pz);
      p.castShadow = false; g.add(p);
    });
    g.add(box(.02, 1.95, .02, frameMat, w/2 - .01, .05, d/2 - .01),
          box(.02, 1.95, .03, frameMat, -w/2 + .01, .05, d/2 - .005),
          box(.03, 1.95, .02, frameMat, w/2 - .005, .05, bz + .01));
    g.add(box(w, .015, .02, frameMat, 0, 1.985, d/2 - .005), box(.02, .015, d, frameMat, w/2 - .005, 1.985, 0));
  }
  g.add(rbox(.14, .1, .04, cm, x, 1.0, bz + .02, .01), rod([x, 1.1, bz + .03], [x, 1.95, bz + .03], .012, cm));
  g.add(tube([[x, 1.95, bz + .03], [x, 2.02, bz + .06], [x, 2.03, bz + .22]], .01, cm),
        rbox(.24, .012, .24, cm, x, 2.02, bz + .25, .004));
  g.add(rot(cyl(.015, .02, .2, cm, x + .1, 1.25, bz + .05, 16), .25),
        blob(.03, .012, .03, cm, x + .1, 1.47, bz + .08, 16));
  g.add(box(.26, .012, .1, ceramic(), w/2 - .2, 1.2, bz + .05));
  [['#e6dccd', .03, .18], ['#2f5d62', .025, .15], ['#f4f4f2', .028, .12]]
    .forEach(([cc, r, hh], i) => g.add(
      cyl(r, r, hh, mat(cc, { roughness: .3 }), w/2 - .28 + i*.07, 1.212, bz + .05, 16)));
}

/** 带椭圆开孔的陶瓷台面（蹲便器用）：圆角矩形外形 + 椭圆孔，挤出为实体 */
export function ovalPan(w, d, Rb, kz, h, rimT, m){
  const hw = w/2, hd = d/2, r = Math.min(rimT, hw*.9, hd*.9);
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd); s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  s.closePath();
  const hole = new THREE.Path();
  hole.absellipse(0, 0, Rb, Rb*kz, 0, Math.PI*2, false);
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 48 });
  geo.rotateX(-Math.PI/2);                 // 平铺到地面，挤出方向变为高度 +y
  const o = new THREE.Mesh(geo, m);
  o.castShadow = o.receiveShadow = true;
  return o;
}

