import * as THREE from 'three';
import { M, wx, wz, H } from '@/workspace/view3d/coords.js';
import { mat, glassMat, metal, chrome, hwMat, blackMetal, mirror, ceramic, fabric, woodM, screenMat, glowMat, darker, lighter, rng } from './materials.js';
import { sh, mesh, rot, box, rbox, cyl, lathe, rod, tube, blob, ring, shell, legs, pull, knob, fronts, vase, tableLamp, plate, showerModel, ovalPan } from './primitives.js';
import { MODELS } from '@/core/library/assets/models.js';
import { ASSET_META } from '@/core/library/assets/manifest.js';
import { garageLayout } from '@/core/garage/layout.js';
import { bakeGroup } from './bake.js';

/* 停车位中央的大号 “P”：canvas 生成白色字形贴图（无光照材质，贴地显示），只建一次 */
let parkLetter = null;
function parkLetterMat(){
  if (parkLetter) return parkLetter;
  if (typeof document === 'undefined' || !document.createElement) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g2 = cv.getContext('2d');
  g2.clearRect(0, 0, 256, 256);
  g2.fillStyle = '#ffffff';
  g2.font = 'bold 210px "Helvetica Neue", Arial, sans-serif';
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillText('P', 128, 136);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  parkLetter = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: .92, depthWrite: false });
  return parkLetter;
}

/* 书本：共用一份「顶点色」材质，颜色写进顶点色而不是各自换材质。
 * 原来一本书一个 Mesh + 一种材质（书架 196 个 Mesh），烘焙合并后整架只剩 1 个书本 Mesh。 */
const bookMat = () => mat('#ffffff', { roughness: .75, vertexColors: true });
function bookBox(w, h, d, color, x, y, z){
  const geo = new THREE.BoxGeometry(w, h, d);
  const n = geo.attributes.position.count, c = new THREE.Color(color);
  const arr = new Float32Array(n*3);
  for (let i = 0; i < n; i++){ arr[i*3] = c.r; arr[i*3 + 1] = c.g; arr[i*3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  const o = mesh(geo, bookMat());
  o.position.set(x, y + h/2, z);
  return o;
}

/* ---------- 户外场地：贴地画线 / 围网（与 lane、parking 同一套薄板做法） ---------- */
const GY = .012;
/** 贴地直线：中心线 (x0,z0)→(x1,z1)，宽 tw（米） */
function flatLine(g, x0, z0, x1, z1, tw, m, y = GY + .008){
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  if (L < 1e-4) return;
  const o = box(L, .004, tw, m, (x0 + x1)/2, y, (z0 + z1)/2);
  o.rotation.y = -Math.atan2(dz, dx);
  g.add(o);
}
/** 贴地空心矩形（球场边线） */
function flatRect(g, x0, z0, x1, z1, tw, m, y = GY + .008){
  flatLine(g, x0, z0, x1, z0, tw, m, y);
  flatLine(g, x1, z0, x1, z1, tw, m, y);
  flatLine(g, x1, z1, x0, z1, tw, m, y);
  flatLine(g, x0, z1, x0, z0, tw, m, y);
}
/** 贴地圆弧（三分线、中圈等）：用短直线段拟合 */
function flatArc(g, cx, cz, R, a0, a1, tw, m, y = GY + .008){
  const n = Math.max(4, Math.ceil(Math.abs(a1 - a0)*R/.4));
  for (let i = 0; i < n; i++){
    const t0 = a0 + (a1 - a0)*i/n, t1 = a0 + (a1 - a0)*(i + 1)/n;
    flatLine(g, cx + Math.cos(t0)*R, cz + Math.sin(t0)*R,
      cx + Math.cos(t1)*R, cz + Math.sin(t1)*R, tw, m, y);
  }
}
/** 场地四周的围网：半透明网片 + 等距立柱 */
function courtFence(g, w, d, h, m){
  const panel = mat('#c8d2d6', { transparent: true, opacity: .12, roughness: .9, side: THREE.DoubleSide });
  const t = .02;
  [[0, -d/2, w], [0, d/2, w], [-w/2, 0, 0], [w/2, 0, 0]].forEach(([px, pz, pw]) => {
    const p = pw ? box(pw, h, t, panel, px, 0, pz) : box(t, h, d, panel, px, 0, pz);
    p.castShadow = false; p.receiveShadow = false; g.add(p);
  });
  const step = 2.8;
  for (let x0 = -w/2; x0 <= w/2 + .01; x0 += step)
    [-1, 1].forEach(s => g.add(cyl(.04, .04, h, m, Math.min(x0, w/2), 0, s*d/2, 8)));
  for (let z0 = -d/2 + step; z0 < d/2 - .01; z0 += step)
    [-1, 1].forEach(s => g.add(cyl(.04, .04, h, m, s*w/2, 0, z0, 8)));
}

/* ---------- 沙盘：楼栋体量生成（层数参数化，避免为每栋楼单独建模） ---------- */
/** 四坡屋顶：底 w×d、高 h，y 为檐口标高 */
function pyramidRoof(w, d, h, m, x, y){
  const hw = w/2, hd = d/2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd, 0, h, 0
  ], 3));
  geo.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 2, 1, 0, 3, 2]);
  geo.computeVertexNormals();
  const o = mesh(geo, m); o.position.set(x, y, 0); return o;
}
/** 四面窗带 + 层间线脚（楼栋通用） */
function facadeGrid(g, w, d, floors, fh, baseY, glass, trim, opt = {}){
  const winH = fh*(opt.winH || .42), bay = opt.bay || 3.4;
  const nW = Math.max(2, Math.round(w/bay)), nD = Math.max(1, Math.round(d/bay));
  for (let f = 0; f < floors; f++){
    const y = baseY + f*fh + fh*.42;
    for (let i = 0; i < nW; i++){
      const px = -w/2 + w*(i + .5)/nW;
      g.add(box(w/nW*.62, winH, .06, glass, px, y, d/2 + .01),
            box(w/nW*.62, winH, .06, glass, px, y, -d/2 - .01));
    }
    for (let i = 0; i < nD; i++){
      const pz = -d/2 + d*(i + .5)/nD;
      g.add(box(.06, winH, d/nD*.62, glass, w/2 + .01, y, pz),
            box(.06, winH, d/nD*.62, glass, -w/2 - .01, y, pz));
    }
    if (f > 0) g.add(box(w + .18, .1, d + .18, trim, 0, baseY + f*fh - .05, 0));
  }
}
/** 住宅楼栋：基座 + 标准层生成 + 阳台 + 屋顶（平屋面 / 四坡） + 入口雨棚 */
function towerModel(g, w, d, floors, c, opt = {}){
  const fh = opt.fh || 2.9, baseH = opt.baseH ?? .45, bodyH = floors*fh;
  const paint = mat(c, { roughness: .8 });
  const trim = mat(lighter(c, .4), { roughness: .6 });
  const glass = mat(opt.glass || '#7fa7bd', { metalness: .45, roughness: .12, transparent: true, opacity: .72 });
  g.add(rbox(w, baseH, d, mat('#cfc7b8', { roughness: .6 }), 0, 0, 0, .1));
  g.add(rbox(w, bodyH, d, paint, 0, baseH, 0, .05));
  facadeGrid(g, w, d, floors, fh, baseH, glass, trim, opt);
  const nV = Math.max(2, Math.round(w/7));
  for (let i = 0; i <= nV; i++){
    const px = -w/2 + w*i/nV;
    g.add(box(.14, bodyH, .14, trim, px, baseH, d/2 + .02),
          box(.14, bodyH, .14, trim, px, baseH, -d/2 - .02));
  }
  if (opt.balcony){
    for (let f = 1; f < floors; f++){
      [-1, 1].forEach(sg => {
        const bx = sg*w*.24, by = baseH + f*fh + .02;
        g.add(box(w*.24, .1, 1.05, trim, bx, by, d/2 + .55));
        g.add(box(w*.24, .85, .04, glass, bx, by + .12, d/2 + 1.05));
      });
    }
  }
  const topY = baseH + bodyH;
  if (opt.roof === 'hip'){
    g.add(box(w + .7, .18, d + .7, trim, 0, topY - .02, 0));
    g.add(pyramidRoof(w + .4, d + .4, opt.roofH || 3.2,
      mat(darker(c, .62), { roughness: .7, side: THREE.DoubleSide }), 0, topY + .16));
    g.add(box(.45, .45, .45, mat('#b5653a', { roughness: .8 }), 0, topY + (opt.roofH || 3.2), 0));
  } else {
    const pw = .25, ph = 1;
    g.add(box(w, ph, pw, trim, 0, topY, -d/2 + pw/2), box(w, ph, pw, trim, 0, topY, d/2 - pw/2),
          box(pw, ph, d, trim, -w/2 + pw/2, topY, 0), box(pw, ph, d, trim, w/2 - pw/2, topY, 0));
    g.add(rbox(w*.22, 2.2, d*.34, paint, w*.2, topY, 0, .05),
          box(w*.12, 2.7, d*.2, paint, -w*.28, topY, d*.08));
  }
  g.add(box(w*.32, .16, 1.7, trim, 0, 2.9, d/2 + .85));
  [-1, 1].forEach(sg => g.add(cyl(.08, .08, 2.9, metal(), sg*w*.13, 0, d/2 + 1.5, 10)));
}

/* ---------- 沙盘：道路 / 树木通用建模 ---------- */
/** 城市道路：沥青 + 车道虚线 + 中央双黄线 + 边线 */
function roadModel(g, w, d, lanes){
  const hz = w >= d, L = hz ? w : d, A = hz ? d : w, lh = A/lanes;
  const white = mat('#f2f4f5', { roughness: .85 });
  const yellow = mat('#e8c14f', { roughness: .8 });
  g.add(box(w, .08, d, mat('#3f4247', { roughness: .95 }), 0, 0, 0));
  for (let i = 1; i < lanes; i++){
    const p = -A/2 + lh*i;
    if (i*2 === lanes){
      if (hz){
        flatLine(g, -w/2, p - .16, w/2, p - .16, .12, yellow, .085);
        flatLine(g, -w/2, p + .16, w/2, p + .16, .12, yellow, .085);
      } else {
        flatLine(g, p - .16, -d/2, p - .16, d/2, .12, yellow, .085);
        flatLine(g, p + .16, -d/2, p + .16, d/2, .12, yellow, .085);
      }
    } else {
      for (let q = -L/2; q < L/2; q += 6){
        const q1 = Math.min(q + 3.5, L/2);
        if (hz) flatLine(g, q, p, q1, p, .12, white, .085);
        else flatLine(g, p, q, p, q1, .12, white, .085);
      }
    }
  }
  if (hz){
    flatLine(g, -w/2, -d/2 + .09, w/2, -d/2 + .09, .1, white, .085);
    flatLine(g, -w/2, d/2 - .09, w/2, d/2 - .09, .1, white, .085);
  } else {
    flatLine(g, -w/2 + .09, -d/2, -w/2 + .09, d/2, .1, white, .085);
    flatLine(g, w/2 - .09, -d/2, w/2 - .09, d/2, .1, white, .085);
  }
}

/** 沙盘树：round / columnar / palm / bamboo 四种形态 */
function treeModel(g, w, d, c, style = 'round', x = 0, z = 0, scale = 1){
  const R = Math.min(w, d)/2*scale;
  const bark = mat('#6b5442', { roughness: .95 });
  const leaf = [mat(c, { roughness: .85 }), mat(lighter(c, .15), { roughness: .85 }), mat(darker(c, .9), { roughness: .85 })];
  const th = (2.6 + R*.35)*scale;
  if (style === 'bamboo'){
    for (let i = 0; i < 9; i++){
      const a = i*2.2, rr = R*(.2 + (i%3)*.22);
      g.add(cyl(.03, .045, th*(.8 + (i%3)*.12), mat('#6f8a4a', { roughness: .9 }),
        x + Math.cos(a)*rr, 0, z + Math.sin(a)*rr, 8));
      g.add(blob(R*.28, R*.2, R*.28, leaf[i%3], x + Math.cos(a)*rr, th*.72, z + Math.sin(a)*rr, 10));
    }
    return;
  }
  g.add(cyl(.16*scale, .28*scale, .5*scale, bark, x, 0, z, 12),
        cyl(.08*scale, .14*scale, th, bark, x, .4*scale, z, 12));
  if (style === 'palm'){
    for (let i = 0; i < 8; i++){
      const a = i/8*Math.PI*2;
      g.add(rod([x, th, z], [x + Math.cos(a)*R*.95, th + .45, z + Math.sin(a)*R*.95], .045, leaf[0]));
      g.add(blob(R*.3, R*.06, R*.16, leaf[1], x + Math.cos(a)*R*.55, th + .28, z + Math.sin(a)*R*.55, 10));
    }
    return;
  }
  if (style === 'columnar'){
    for (let i = 0; i < 4; i++){
      const rr = R*(.55 - i*.11), yy = th*.85 + i*R*.32;
      g.add(blob(rr*.8, rr*.42, rr*.8, leaf[i%3], x, yy, z, 14));
    }
    return;
  }
  for (let i = 0; i < 5; i++){
    const a = i*1.6 + .3, rr = R*(.4 + (i%3)*.08);
    g.add(blob(rr, rr*.8, rr, leaf[i%3], x + Math.cos(a)*R*.3, th + .35 + (i%2)*R*.22, z + Math.sin(a)*R*.3, 12));
  }
}

/** 统一收尾：世界坐标 + 顺时针旋转 + 命中 id（自定义资产与内置建模共用） */
function placeGroup(g, f){
  g.position.set(wx(f.cx), 0, wz(f.cy));
  g.rotation.y = -f.rot * Math.PI/180;      // 平面顺时针旋转 → 绕 Y 轴负向
  g.userData.fid = f.id;
  return g;
}

/** 自定义资产建模函数收到的上下文：图元 + 材质 + 实例参数，避免资产里写 import */
function assetCtx(f, w, d, c, sd){
  return {
    f, w, d, c, sd,
    h: ((ASSET_META[f.type] && ASSET_META[f.type].h) || 800) / 1000,
    THREE,
    box, rbox, cyl, lathe, rod, tube, blob, ring, shell, legs, pull, knob, fronts,
    plate, vase, tableLamp,
    mat, glassMat, metal, chrome, hwMat, blackMetal, mirror, ceramic, fabric,
    woodM, screenMat, glowMat, darker, lighter
  };
}

export function buildFurniture(f, riseH = H, clipTop = Infinity){
  /* 自定义资产优先（assets/<type>/model.js）：成功就返回，失败回退内置建模。
   * 注意：这里必须兜住异常 —— 资产代码有问题时整个 3D 场景不能跟着挂。 */
  const custom = MODELS[f.type];
  if (custom){
    try {
      const w0 = M(f.w), d0 = M(f.d);
      const out = custom(assetCtx(f, w0, d0, f.color || '#ddd', f.sdir < 0 ? -1 : 1));
      if (out && out.isObject3D){
        if (out.isGroup) bakeGroup(out);      // 自定义资产同样按材质合并，省 draw call
        return placeGroup(out, f);
      }
      console.warn('[buildFurniture] 自定义模型未返回 Object3D，回退内置建模：', f.type);
    } catch (e){
      console.warn('[buildFurniture] 自定义模型失败，回退内置建模：', f.type, e);
    }
  }

  const g = new THREE.Group(), w = M(f.w), d = M(f.d);
  const c = f.color || '#ddd', bz = -d/2;
  const sd = f.sdir < 0 ? -1 : 1;          // 楼梯类：1 上行（升到上一层）/ -1 下行（降到下一层）
  const R = rng(Math.round(f.w*7 + f.d*13 + f.cx + f.cy));
  switch (f.type){
    case 'bed': {
      const fr = woodM('#8d7258'), fab = fabric(c), fh = .3, mt = .22, top = fh + mt;
      const n = Math.max(3, Math.round(w/.28)), sw = (w - .04)/n;
      g.add(box(w - .12, .06, d - .14, '#4a3e33', 0, 0, .03),
            rbox(w, fh - .06, d - .08, fr, 0, .06, .04, .015));      // 内缩踢脚 + 床箱
      g.add(rbox(w, 1.08, .06, fr, 0, 0, bz + .03, .012));           // 床头板
      for (let i = 0; i < n; i++) g.add(
        rbox(sw - .006, .62, .06, fabric(darker(c, .8)), -w/2 + .02 + sw*(i + .5), .42, bz + .08, .025));
      const md = d - .13, dd = md*.66, dz = d/2 - .015 - dd/2;
      g.add(rbox(w - .06, mt, md, '#f6f3ee', 0, fh, bz + .11 + md/2, .07));                       // 床垫
      g.add(rbox(w + .02, .27, dd, fab, 0, top - .2, dz, .04),
            rbox(w + .024, .06, .22, fabric('#fbfaf7'), 0, top + .025, dz - dd/2 + .11, .025));   // 被子 + 翻边
      g.add(rbox(w + .05, .285, .42, fabric(darker(c, .62)), 0, top - .205, d/2 - .35, .03));    // 床尾巾
      const np = w >= 1.3 ? 2 : 1, pw = (w - .16 - (np - 1)*.06)/np;
      for (let i = 0; i < np; i++){
        const x = -w/2 + .08 + pw/2 + i*(pw + .06);
        g.add(rot(rbox(pw, .15, .42, fabric('#ffffff'), x, top - .01, bz + .34, .07), -.28),
              rot(rbox(pw*.62, .3, .1, fabric(i ? '#efe7da' : darker(c, .7)), x, top, bz + .54, .045), -.3));
      }
      break;
    }
    case 'sofa': case 'armchair': {
      const fab = fabric(c), dk = fabric(darker(c, .88));
      const a = Math.min(.18, w*.14);
      const n = f.type === 'armchair' ? 1 : (w > 2.2 ? 3 : 2);
      const cw = (w - 2*a)/n, bd = Math.min(.2, d*.24), lh = .12, sd = d - bd - .02;
      legs(g, w, d, lh, woodM('#3a3027'), .07, .018);
      g.add(rbox(w, .16, d, dk, 0, lh, 0, .03), rbox(w, .73, bd, dk, 0, lh, bz + bd/2, .06));
      [-1, 1].forEach(s => g.add(rbox(a, .5, d, dk, s*(w/2 - a/2), lh, 0, .07)));
      for (let i = 0; i < n; i++){
        const x = -w/2 + a + cw/2 + i*cw;
        g.add(rbox(cw - .012, .15, sd, fab, x, lh + .16, bz + bd + sd/2, .055),
              rot(rbox(cw - .03, .44, .16, fab, x, lh + .3, bz + bd + .08, .07), -.16));
      }
      if (n > 1) [-1, 1].forEach(s => g.add(rot(
        rbox(.42, .42, .12, fabric(s < 0 ? '#ece5d8' : darker(c, .7)), s*(w/2 - a - .26), lh + .32, bz + bd + .22, .06), -.3, s*-.25)));
      else g.add(rot(rbox(.4, .26, .1, fabric('#ece5d8'), 0, lh + .33, bz + bd + .2, .05), -.25));
      break;
    }
    case 'cornersofa': {
      const k = Math.min(.95, d*.56, w*.4), b = .2, fab = fabric(c), dk = fabric(darker(c, .88));
      const lh = .1, sw = (w - b - .2)/2;
      [[-w/2 + .07, bz + .07], [w/2 - .07, bz + .07], [w/2 - .07, bz + k - .07],
       [-w/2 + .07, d/2 - .07], [-w/2 + k - .07, d/2 - .07], [-w/2 + k - .07, bz + k - .07]]
        .forEach(([x, z]) => g.add(rod([x, 0, z], [x, lh, z], .012, woodM('#3a3027'), .018)));
      g.add(rbox(w, .18, k, dk, 0, lh, bz + k/2, .03),
            rbox(k, .18, d - k + .02, dk, -w/2 + k/2, lh, bz + k + (d - k)/2 - .01, .03));
      g.add(rbox(w, .72, b, dk, 0, lh, bz + b/2, .06), rbox(b, .72, d, dk, -w/2 + b/2, lh, 0, .06),
            rbox(.2, .5, k, dk, w/2 - .1, lh, bz + k/2, .07), rbox(k, .5, .2, dk, -w/2 + k/2, lh, d/2 - .1, .07));
      for (let i = 0; i < 2; i++){
        const x = -w/2 + b + sw/2 + i*sw;
        g.add(rbox(sw - .012, .15, k - b - .02, fab, x, lh + .18, bz + b + (k - b)/2, .055),
              rot(rbox(sw - .04, .42, .16, fab, x, lh + .3, bz + b + .07, .07), -.16));
      }
      g.add(rbox(k - b - .02, .15, d - k - .22, fab, -w/2 + b + (k - b)/2, lh + .18, bz + k + (d - k - .2)/2, .055));
      const L = d - .2 - b - .18, nl = Math.max(1, Math.round(L/.75));
      for (let i = 0; i < nl; i++) g.add(rot(
        rbox(.16, .42, L/nl - .03, fab, -w/2 + b + .07, lh + .3, bz + b + .18 + L/nl*(i + .5), .07), 0, 0, .16));
      g.add(rot(rbox(.42, .42, .12, fabric('#ece5d8'), -w/2 + b + .3, lh + .34, bz + b + .24, .06), -.35, .6),
            rot(rbox(.4, .4, .12, fabric(darker(c, .7)), w/2 - .5, lh + .34, bz + b + .2, .06), -.3, -.25));
      break;
    }
    case 'nightstand': {
      const wm = woodM(c);
      legs(g, w, d, .1, woodM('#5a4a3b'), .04, .014);
      g.add(rbox(w, .4, d - .02, wm, 0, .1, -.01, .012));
      fronts(g, -w/2 + .02, .12, w - .04, .36, d/2 - .02, 1, 2, wm, 'bar');
      tableLamp(g, -w*.12, .5, -d*.12);
      g.add(box(.16, .025, .22, '#2f5d62', w*.24, .5, .04),
            box(.14, .02, .2, '#e6dccd', w*.24, .525, .04));
      break;
    }
    case 'wardrobe': case 'cabinet': case 'shoecab': {
      const cm = mat(c, { roughness: .55 }), fz = d/2 - .02;
      if (f.type === 'wardrobe'){
        const h = 2.2, n = Math.max(1, Math.round(w/.5));
        g.add(box(w - .02, .08, d - .06, '#4a4641', 0, 0, -.03), box(w, h - .08, d - .02, cm, 0, .08, -.01));
        fronts(g, -w/2, .08, w, h - .1, fz, n, 1, cm, 'bar', 1.05);
        g.add(box(w, .02, d - .02, darker(c, .9), 0, h - .02, -.01));
      } else if (f.type === 'shoecab'){
        const h = 1.0, y0 = .16, n = Math.max(1, Math.round(w/.45));
        g.add(box(w, h - y0, d - .02, cm, 0, y0, -.01),
              box(w - .04, .01, .03, glowMat('#fff7e6', '#ffe9c4', .8), 0, y0 - .01, fz - .06));  // 悬空 + 底部灯带
        fronts(g, -w/2, y0, w, h - y0, fz, n, 1, cm, 'edge');
        g.add(rbox(w + .01, .025, d, woodM(darker(c, .8)), 0, h, 0, .006));
        g.add(rbox(.22, .015, .14, woodM('#6b543f'), -w*.25, h + .025, 0, .006));
        vase(g, w*.28, h + .025, -.03, .05, .2, '#d8cfc2', R);
      } else {
        const h = .85, n = Math.max(1, Math.round(w/.5));
        legs(g, w, d, .1, woodM('#3a3027'), .05, .016);
        g.add(box(w, h - .13, d - .02, cm, 0, .1, -.01));
        fronts(g, -w/2, .62, w, .2, fz, n, 1, cm, 'bar');
        fronts(g, -w/2, .1, w, .52, fz, n, 1, cm, 'bar', .52);
        g.add(rbox(w + .02, .03, d + .01, woodM(darker(c, .78)), 0, h - .03, 0, .008));
        vase(g, w*.3, h, 0, .07, .24, '#e9e2d6', R);
        g.add(rot(box(.3, .38, .02, woodM('#3a3027'), -w*.25, h, bz + .06), -.12),
              rot(box(.25, .33, .005, '#d9cfbf', -w*.25, h + .03, bz + .075), -.12));   // 靠墙画框
        g.add(lathe([[0, 0], [.05, 0], [.12, .06], [.13, .07]], mat('#b8a58c', { roughness: .5, side: THREE.DoubleSide }), 0, h, .02, 32));
        for (let k = 0; k < 3; k++) g.add(blob(.035, .035, .035, ['#d98c4a', '#c9ad4f', '#b5463a'][k], Math.cos(k*2.1)*.04, h + .045, .02 + Math.sin(k*2.1)*.04, 14));
      }
      break;
    }
    case 'dresser': {
      const wm = woodM(c), r = Math.min(.34, w*.3);
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(
        rod([a*(w/2 - .04), 0, b*(d/2 - .04)], [a*(w/2 - .05), .58, b*(d/2 - .05)], .012, wm, .02)));
      g.add(box(w - .04, .14, d - .04, wm, 0, .58), rbox(w, .03, d, wm, 0, .72, 0, .008));
      fronts(g, -w/2 + .03, .585, w - .06, .13, d/2 - .02, 2, 1, wm, 'knob');
      const mr = new THREE.Mesh(new THREE.TorusGeometry(r, .018, 12, 64), woodM(darker(c, .7)));
      mr.position.set(0, .77 + r, bz + .04); sh(mr);
      const mg = new THREE.Mesh(new THREE.CircleGeometry(r, 64), mirror());
      mg.position.set(0, .77 + r, bz + .035);
      g.add(mr, mg, box(.08, .03, .06, woodM(darker(c, .7)), 0, .75, bz + .04));
      [['#e7c9b5', .03, .09], ['#b9d0d8', .025, .12], ['#f0e3cf', .02, .07]].forEach(([cc, rr, hh], i) => g.add(
        cyl(rr, rr, hh, mat(cc, { roughness: .15, transparent: true, opacity: .8 }), w*.25 + i*.06, .75, .02)));
      g.add(rbox(.16, .06, .1, woodM('#6b543f'), -w*.28, .75, .03, .01));
      const sz = d/2 + .25;
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(
        rod([a*.13, 0, sz + b*.13], [a*.12, .4, sz + b*.12], .01, wm, .014)));
      g.add(rbox(.34, .08, .34, fabric('#e8ddd0'), 0, .4, sz, .035));
      break;
    }
    case 'desk': {
      const tm = woodM(c), bm = blackMetal();
      g.add(rbox(w, .025, d, tm, 0, .72, 0, .006));
      [-1, 1].forEach(s => {
        const x = s*(w/2 - .06);
        g.add(box(.03, .72, .03, bm, x, 0, d/2 - .06), box(.03, .72, .03, bm, x, 0, bz + .06),
              box(.03, .03, d - .1, bm, x, 0, 0), box(.03, .03, d - .1, bm, x, .69, 0));
      });
      g.add(box(w - .12, .04, .015, bm, 0, .66, bz + .06), box(.4, .09, d - .12, tm, w/2 - .32, .63, 0));
      pull(g, .16, false, w/2 - .32, .675, d/2 - .06);
      const my = .745, mz = bz + .15;
      g.add(rbox(.22, .012, .16, bm, 0, my, mz, .004), rod([0, my, mz - .02], [0, my + .2, mz - .03], .012, bm));
      g.add(rbox(.62, .37, .02, '#1d1d1f', 0, my + .12, mz - .04, .006),
            box(.6, .33, .002, screenMat('#27405c'), 0, my + .15, mz - .029));
      g.add(rbox(.42, .015, .13, '#e8e8ea', 0, my, .06, .004),
            rbox(.4, .004, .11, '#d2d2d6', 0, my + .014, .06, .002),
            blob(.03, .015, .05, '#e8e8ea', .3, my + .012, .07, 16));
      const lx = -w/2 + .15, lz = bz + .12;
      g.add(cyl(.07, .075, .02, bm, lx, my, lz, 28),
            tube([[lx, my + .02, lz], [lx, my + .3, lz + .03], [lx + .12, my + .42, lz + .1]], .008, bm));
      const hd = cyl(.02, .06, .1, bm, lx + .14, my + .34, lz + .12, 24); hd.rotation.x = .5; g.add(hd);
      g.add(cyl(.04, .038, .09, ceramic({ roughness: .3 }), w/2 - .15, my, .05, 20),
            rbox(.2, .015, .28, '#3b5566', -w*.3, my, .1, .004));
      break;
    }
    case 'chair': {
      const lw = woodM('#6b543f'), fab = fabric(c), sy = .44;
      [[-1, 1], [1, 1]].forEach(([s]) => g.add(
        rod([s*(w/2 - .04), 0, d/2 - .05], [s*(w/2 - .05), sy, d/2 - .07], .012, lw, .018)));
      [-1, 1].forEach(s => g.add(
        rod([s*(w/2 - .04), 0, bz + .03], [s*(w/2 - .05), .86, bz + .07], .012, lw, .018)));
      g.add(box(w - .08, .025, .02, lw, 0, .15, d/2 - .06), box(w - .08, .025, .02, lw, 0, .15, bz + .05));
      [-1, 1].forEach(s => g.add(box(.02, .025, d - .12, lw, s*(w/2 - .045), .18, 0)));
      g.add(box(w - .06, .04, d - .1, lw, 0, sy - .03, 0), rbox(w - .04, .05, d - .08, fab, 0, sy, .005, .022));
      g.add(rot(rbox(w - .08, .15, .025, lw, 0, .66, bz + .065, .012), -.12),
            rot(box(w - .08, .025, .02, lw, 0, .52, bz + .055), -.12));
      break;
    }
    case 'bookshelf': {
      const h = 1.8, t = .022, ns = 5, wm = woodM(c), sh0 = (h - .06 - t)/ns;
      const cols = ['#b88a6a', '#6f8f8a', '#d9c08c', '#9aa58c', '#a8675e', '#e6dccd', '#7d8ea3', '#c9bfae'];
      g.add(box(w, h, .012, woodM(darker(c, .85)), 0, 0, bz + .006), box(t, h, d, wm, -w/2 + t/2),
            box(t, h, d, wm, w/2 - t/2), box(w - 2*t, .06, d - .03, wm, 0, 0, .0));
      for (let s = 0; s <= ns; s++){
        const y = s < ns ? .06 + s*sh0 : h - t;
        g.add(box(w - 2*t, t, d - .012, wm, 0, y, .006));
        if (s === ns) break;
        const yb = y + t, end = w/2 - t - .01;
        let x = -w/2 + t + .01, deco = R() < .55 ? x + R()*(w - .45) : 99;
        while (x < end - .03){
          if (x >= deco){
            deco = 99;
            if (R() < .5) vase(g, x + .07, yb, 0, .045, .16, cols[Math.floor(R()*8)], R, false);
            else for (let k = 0; k < 3; k++) g.add(
              box(.2 - k*.02, .028, d*.7, mat(cols[Math.floor(R()*8)], { roughness: .8 }), x + .1, yb + k*.028, .01));
            x += .2; continue;
          }
          if (R() < .07){ x += .03 + R()*.05; continue; }
          const bw = .018 + R()*.03, bh = Math.min(sh0 - t - .03, .17 + R()*.13), bd = d*(.62 + R()*.22);
          if (x + bw > end) break;
          g.add(bookBox(bw, bh, bd, cols[Math.floor(R()*8)], x + bw/2, yb, d/2 - .015 - bd/2));
          x += bw + .002;
        }
      }
      break;
    }
    case 'baycushion':
      g.add(rbox(w, .08, d, fabric(c), 0, .45, 0, .03));
      g.add(rot(rbox(w - .1, .34, .14, fabric('#ffffff'), 0, .52, bz + .14, .06), .25),
            rot(rbox(w - .1, .34, .14, fabric('#f0e6d6'), 0, .52, d/2 - .14, .06), -.25));
      g.add(rbox(w*.8, .04, .3, fabric(darker(c, .7)), 0, .53, d*.12, .02),
            rbox(.28, .015, .2, woodM('#8d7258'), 0, .53, -d*.15, .006),
            cyl(.035, .03, .06, ceramic(), 0, .545, -d*.15, 20));
      break;
    case 'coffeetable': {
      const tm = mat(c, { roughness: .35 }), lw = woodM('#3a3027');
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(rod(
        [a*(w/2 - .05), 0, b*(d/2 - .05)], [a*(w/2 - .07), .365, b*(d/2 - .07)], .012, lw, .02)));
      g.add(rbox(w, .035, d, tm, 0, .365, 0, .015), rbox(w - .12, .02, d - .12, woodM(darker(c, .85)), 0, .12, 0, .006));
      g.add(box(.3, .03, .22, '#2f5d62', w*.2, .14, 0), box(.26, .025, .19, '#d9b36c', w*.2, .17, .01));
      g.add(rbox(.38, .015, .24, woodM('#6b543f'), -w*.2, .4, 0, .006),
            box(.22, .025, .16, '#e6dccd', -w*.22, .415, 0));
      g.add(lathe([[0, 0], [.025, 0], [.035, .07], [.034, .08]], ceramic({ side: THREE.DoubleSide }), -w*.12, .415, .06, 20));
      vase(g, w*.24, .4, -.05, .055, .18, '#e9e2d6', R);
      break;
    }
    case 'tvstand': {
      const sm = mat(c, { roughness: .5 }), n = Math.max(2, Math.round(w/.6));
      legs(g, w, d, .1, blackMetal(), .08, .012);
      g.add(rbox(w, .4, d - .02, sm, 0, .1, -.01, .01));
      fronts(g, -w/2 + .005, .105, w - .01, .39, d/2 - .02, n, 1, sm, 'edge');
      g.add(rbox(1.45, .84, .025, mat('#18181a', { roughness: .4, metalness: .3 }), 0, .95, bz + .03, .004),
            box(1.43, .81, .002, screenMat(), 0, .962, bz + .0435));
      g.add(rbox(.9, .06, .09, '#2a2a2c', 0, .5, -.02, .02), box(.86, .045, .002, fabric('#3a3a3c'), 0, .507, .026));
      vase(g, w/2 - .25, .5, 0, .06, .26, '#d8cfc2', R);
      g.add(box(.25, .035, .18, '#a9433b', -w/2 + .3, .5, 0), box(.22, .03, .16, '#e6dccd', -w/2 + .3, .535, 0));
      break;
    }
    case 'rug':
      [[w, d, .01, c, 0], [w - .16, d - .16, .002, darker(c, .82), .01], [w - .26, d - .26, .002, lighter(c, .12), .0115]]
        .forEach(([a, b, h, cc, y]) => {
          const r = box(a, h, b, mat(cc, { roughness: 1 }), 0, y + .002);
          r.castShadow = false; g.add(r);
        });
      break;
    case 'plant': {
      const r = Math.min(w, d)/2, H = .9 + r*1.6, pot = mat('#d9d2c5', { roughness: .6 });
      const lm = [mat('#5f8f4e', { roughness: .6, side: THREE.DoubleSide }), mat('#79a862', { roughness: .6, side: THREE.DoubleSide })];
      g.add(lathe([[0, 0], [r*.4, 0], [r*.44, .02], [r*.54, .36], [r*.57, .4], [r*.52, .4], [r*.5, .37], [0, .37]], pot, 0, 0, 0, 36),
            cyl(r*.49, r*.49, .005, '#4a3a2c', 0, .368, 0, 28));
      g.add(rod([0, .37, 0], [.02, H*.62, -.01], .016, '#6b5540', .009));
      /* 叶片数 / 球面段数都收敛：原来一盆 500mm 绿植近 1.1 万三角面（园林场景里是最大头），
       * 段数 16→8 后单叶 352→96 面，肉眼看不出差别 */
      const N = 12 + Math.round(r*20), sc = Math.sqrt(r/.25);
      for (let k = 0; k < N; k++){
        const t = k/N, a = k*2.399 + R()*.3, len = (.14 + R()*.08)*(1.1 - t*.4)*sc, s0 = .03 + R()*.08*sc;
        const p = new THREE.Group();
        p.position.set(0, H*(.42 + .58*t), 0);
        p.rotation.set(0, -a, .1 + t*.5 + R()*.3, 'YXZ');
        const lf = blob(len/2, .005, len*.27, lm[k % 2], s0 + len/2, 0, 0, 8);
        lf.rotation.z = -.3;
        p.add(box(s0, .005, .005, '#6f8f4a', s0/2, 0, 0), lf);
        g.add(p);
      }
      break;
    }
    case 'table': {
      const tm = mat(c, { roughness: .4 }), lw = woodM(darker(c, .55));
      const ns = Math.max(1, Math.round(w/.62)), top = .75;
      /* 桌腿插入桌面 7 mm：腿端面与桌面底面共面同样会闪 */
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(rod(
        [a*(w/2 - .08), 0, b*(d/2 - .08)], [a*(w/2 - .1), .722, b*(d/2 - .1)], .016, lw, .026)));
      /* 台面 → 桌布 → 餐垫 → 餐盘逐层留 2 mm 间隙：
       * 桌布与餐垫在平面上有重叠，若同高则上下表面完全共面（近距预览会明显闪烁）。 */
      const clothY = top + .002;
      const matY   = clothY + .003 + .002;
      const dishY  = matY + .003 + .002;
      g.add(rbox(w, .035, d, tm, 0, .715, 0, .012), box(w - .22, .072, d - .22, lw, 0, .645));
      g.add(box(w*.7, .003, .32, fabric('#b9a58c'), 0, clothY, 0));
      for (let i = 0; i < ns; i++) [-1, 1].forEach(s => {
        const x = -w/2 + w/ns*(i + .5), z = s*(d/2 - .17);
        g.add(box(.38, .003, .28, fabric('#e7dfd1'), x, matY, z)); plate(g, .12, x, dishY, z);
        g.add(cyl(.03, .026, .1, mat('#dfeef3', { transparent: true, opacity: .35, roughness: .05 }), x + .15, dishY, z - s*.1, 16));
      });
      vase(g, 0, matY, 0, .06, .2, '#e9e2d6', R);
      break;
    }
    case 'roundtable': {
      const b = Math.min(.25, w*.3), lw = woodM('#4a3e33'), top = .75;
      g.add(lathe([[b, 0], [b, .015], [b*.8, .035], [.06, .12], [.045, .35], [.05, .6], [.12, .69], [.18, .715]], lw, 0, 0, 0, 40),
            cyl(w/2, w/2, .035, mat(c, { roughness: .4 }), 0, .715, 0, 64));
      /* 餐盘 / 花瓶与桌面留 2 mm：0.8 mm 在近距预览里仍可能打平 */
      for (let k = 0; k < 4; k++){ const a = k*Math.PI/2 + .4, rr = w/2 - .17; plate(g, .11, Math.cos(a)*rr, top + .002, Math.sin(a)*rr); }
      vase(g, 0, top + .002, 0, .05, .18, '#e9e2d6', R);
      break;
    }
    case 'counter': {
      const cm = mat(c, { roughness: .45 }), stone = mat('#dcd7cf', { roughness: .22 });
      const n = Math.max(1, Math.round(w/.6)), fz = d/2 - .04;
      g.add(box(w - .01, .1, d - .1, '#4a4641', 0, 0, -.05), box(w, .72, d - .04, cm, 0, .1, -.02));
      fronts(g, -w/2, .64, w, .18, fz, n, 1, cm, 'bar');
      fronts(g, -w/2, .1, w, .54, fz, n, 1, cm, 'bar', .56);
      g.add(rbox(w + .01, .04, d, stone, 0, .82, 0, .004), box(w, .62, .01, mat('#efece6', { roughness: .3 }), 0, .86, bz + .005));
      g.add(box(w, .7, .33, cm, 0, 1.48, bz + .165));
      fronts(g, -w/2, 1.48, w, .7, bz + .33, n, 1, cm, 'bar', 1.56);
      g.add(box(w - .04, .01, .02, glowMat('#fff7e6', '#ffe9c4', .8), 0, 1.47, bz + .29));
      if (w >= .8){
        g.add(rbox(.36, .018, .25, woodM('#c9a27a'), -w/2 + .3, .86, .0, .005));
        [.07, .06, .05].forEach((r, i) => g.add(
          cyl(r, r, .16 - i*.03, mat(['#e9e2d6', '#d6cfc3', '#bfb6a8'][i], { roughness: .4 }), w/2 - .15 - i*.15, .86, bz + .1, 24)));
        g.add(cyl(.05, .045, .14, ceramic({ roughness: .3 }), w/2 - .6, .86, bz + .1, 20));
        for (let k = 0; k < 4; k++) g.add(rod(
          [w/2 - .6, .9, bz + .1], [w/2 - .6 + (k - 1.5)*.018, 1.1, bz + .1 + (k % 2 - .5)*.02], .005, woodM('#8d7258'), .006, 6));
      }
      break;
    }
    case 'stove': {
      const sm = mat('#b9bec3', { metalness: .8, roughness: .3 });
      g.add(rbox(w, .012, d, mat('#0d0d0e', { roughness: .06, metalness: .3 }), 0, .862, 0, .004));
      (w/d > 1.4 ? [[-w/4, 0], [w/4, 0]] : [[-w/4, -d/4], [w/4, -d/4], [-w/4, d/4], [w/4, d/4]])
        .forEach(([x, z]) => {
          g.add(cyl(.085, .09, .008, '#2b2b2b', x, .874, z, 32),
                cyl(.045, .05, .014, mat('#6b5a45', { metalness: .7, roughness: .35 }), x, .874, z, 28),
                cyl(.028, .028, .022, '#1a1a1a', x, .874, z, 20));
          for (let k = 0; k < 5; k++){
            const a = k*Math.PI*2/5;
            g.add(rot(box(.07, .014, .012, '#1c1c1c', x + Math.cos(a)*.1, .874, z + Math.sin(a)*.1), 0, -a));
          }
          g.add(cyl(.02, .022, .018, '#222', x, .874, d/2 - .04, 20));
        });
      g.add(rbox(w, .06, .5, sm, 0, 1.55, bz + .25, .01), box(.3, .72, .26, sm, 0, 1.61, bz + .13));
      g.add(rot(box(w - .02, .3, .008, mat('#15181b', { roughness: .05, metalness: .5 }), 0, 1.58, bz + .38), -.9),
            box(.16, .012, .003, mat('#101214', { emissive: '#6fd0ff', emissiveIntensity: .6 }), 0, 1.575, bz + .502));
      break;
    }
    case 'ksink': {
      const st = mat('#c7ccd1', { metalness: .85, roughness: .28 });
      const inner = mat('#9aa1a8', { metalness: .8, roughness: .35 });
      const two = w >= .75, bw = two ? w*.42 : w*.7, bd = d*.66;
      g.add(box(w, .008, d, st, 0, .862, 0));
      (two ? [-w*.23, w*.23] : [0]).forEach(x => g.add(
        shell(bw, bd, .02, .015, .04, st, x, .862, .03),
        box(bw - .03, .002, bd - .03, inner, x, .87, .03),
        cyl(.03, .03, .003, chrome(), x, .872, .03, 20)));
      const fx = two ? 0 : w*.3, cm = chrome();
      g.add(cyl(.025, .028, .03, cm, fx, .87, bz + .06, 20),
            tube([[fx, .9, bz + .06], [fx, 1.12, bz + .06], [fx, 1.17, bz + .1], [fx, 1.14, bz + .18], [fx, 1.08, bz + .2]], .012, cm));
      g.add(rot(box(.012, .012, .09, cm, fx + .035, .98, bz + .09), -.3));
      break;
    }
    case 'fridge': {
      const fm = mat(c, { metalness: .45, roughness: .28 }), h = 1.8, fz = d/2 - .05;
      g.add(box(w - .02, .06, d - .06, '#2a2c2e', 0, 0, -.03), rbox(w, h - .06, d - .05, fm, 0, .06, -.025, .02),
            box(w - .01, h - .07, .003, '#2a2c2e', 0, .065, fz + .0015));
      if (w > .85){
        [-1, 1].forEach(s => {
          g.add(rbox(w/2 - .004, h - .08, .04, fm, s*w/4, .07, fz + .023, .012));
          pull(g, .8, true, s*.035, 1.05, fz + .043);
        });
        g.add(box(.1, .14, .003, screenMat('#2a6f8f'), -w/4, 1.25, fz + .044));
      } else {
        g.add(rbox(w - .006, 1.06, .04, fm, 0, .72, fz + .023, .012), rbox(w - .006, .64, .04, fm, 0, .07, fz + .023, .012));
        pull(g, .5, true, -w/2 + .06, 1.05, fz + .043);
        pull(g, w*.5, false, 0, .64, fz + .043);
        g.add(box(.08, .1, .003, screenMat('#2a6f8f'), w*.22, 1.4, fz + .044));
      }
      break;
    }
    case 'toilet': {
      const cer = ceramic(), Rb = w*.45, zc = bz + d*.62, kz = (d*.37)/Rb, cm = chrome();
      g.add(rbox(w*.88, .4, d*.24, cer, 0, .36, bz + d*.12, .04),
            rbox(w*.92, .03, d*.27, cer, 0, .76, bz + d*.135, .012),
            cyl(.022, .022, .006, cm, 0, .79, bz + d*.135, 20));
      const ped  = lathe([[0, 0], [Rb*.62, 0], [Rb*.66, .02], [Rb*.56, .12], [Rb*.62, .22], [Rb*.92, .33], [Rb, .37]], cer, 0, 0, zc, 40);
      const seat = cyl(Rb*1.01, Rb*1.01, .022, mat('#f4f4f2', { roughness: .2 }), 0, .37, zc, 40);
      const lid  = cyl(Rb*.97, Rb*.99, .02, mat('#f4f4f2', { roughness: .2 }), 0, .392, zc, 40);
      ped.scale.z = seat.scale.z = lid.scale.z = kz;
      g.add(ped, seat, lid);
      [-1, 1].forEach(s => g.add(box(.03, .02, .03, cm, s*w*.18, .39, zc - Rb*kz - .005)));
      break;
    }
    case 'squattoilet': {
      // 家用蹲便器：带椭圆便池的陶瓷台面 + 内胆 + 两侧防滑踏面 + 前端小水箱
      const cer = ceramic(), cds = mat('#e6eef1', { roughness: .22, side: THREE.DoubleSide });
      const Rb = w*.24, kz = (d*.3)/Rb;         // 便池椭圆半轴（纵向拉长）
      const H0 = .11;                            // 台面高度
      // 1) 带椭圆开孔的陶瓷台面
      g.add(ovalPan(w, d, Rb, kz, H0, .04, cer));
      // 2) 便池内胆（椭圆碗，向下凹到接近地面）
      const bowl = lathe([[Rb, 0], [Rb*.9, -.03], [Rb*.58, -.07], [Rb*.28, -.095], [1e-4, -.105]], cds, 0, H0, 0, 48);
      bowl.scale.z = kz; g.add(bowl);
      // 3) 底部排水口
      g.add(cyl(Rb*.24, Rb*.2, .01, mat('#8f9aa0', { roughness: .5 }), 0, H0 - .11, 0, 20));
      // 4) 两侧防滑脚踏（略高于台面，带横向防滑纹）
      [-1, 1].forEach(sx => {
        const px = sx*(w/2 - .06);
        g.add(rbox(.09, .02, d*.7, cer, px, H0, 0, .012));
        for (let i = -2; i <= 2; i++)
          g.add(box(.078, .005, .014, mat('#c6ced2', { roughness: .55 }), px, H0 + .02, i*d*.11));
      });
      // 5) 前端小水箱（加高、更醒目）+ 箱盖 + 冲水按钮 + 侧面进水件
      const tw = w*.54, th = .3, td = .11, tz = d/2 - td/2 - .005;
      g.add(rbox(tw, th, td, cer, 0, 0, tz, .03),                        // 箱体
            rbox(tw*1.02, .024, td*1.06, cer, 0, th, tz, .01),           // 箱盖（略外挑）
            cyl(.032, .032, .014, chrome(), 0, th + .024, tz, 20));      // 冲水按钮
      // 侧面进水阀 / 水件（竖向镀铬管）
      g.add(cyl(.022, .022, .16, chrome(), tw/2 + .015, .02, tz, 16));
      break;
    }
    case 'vanity': {
      const vm = mat(c, { roughness: .5 }), stone = mat('#fafafa', { roughness: .18 });
      const nb = w >= 1.1 ? 2 : 1, cd = d - .04, cm = chrome();
      g.add(rbox(w, .45, cd, vm, 0, .33, bz + cd/2, .008));
      fronts(g, -w/2 + .005, .335, w - .01, .44, d/2 - .04, nb, 2, vm, 'edge');
      g.add(rbox(w, .03, d, stone, 0, .78, 0, .006));
      const rb = Math.min(.19, w/nb*.36);
      for (let i = 0; i < nb; i++){
        const x = nb === 1 ? 0 : (i ? w/4 : -w/4);
        g.add(lathe([[0, 0], [rb*.55, 0], [rb*.85, .03], [rb, .1], [rb*.97, .12]], ceramic({ side: THREE.DoubleSide }), x, .81, .03, 40),
              cyl(.018, .018, .003, cm, x, .812, .03, 16));
        g.add(cyl(.02, .022, .02, cm, x, .81, bz + .06, 16),
              tube([[x, .83, bz + .06], [x, 1.03, bz + .06], [x, 1.07, bz + .11], [x, 1.03, bz + .15]], .01, cm),
              rot(box(.01, .01, .06, cm, x, 1.05, bz + .04), .4));
      }
      const mw = Math.min(w*.9, nb*.7);
      g.add(rbox(mw + .02, .82, .02, glowMat('#fff7e6', '#ffe9c4', .9), 0, 1.14, bz + .01, .01),
            box(mw, .8, .01, mirror(), 0, 1.15, bz + .025));
      g.add(cyl(.028, .028, .12, mat('#c8b8a6', { roughness: .3 }), w/2 - .08, .81, bz + .1, 16),
            rbox(.18, .03, .12, fabric('#e9e2d6'), -w/2 + .12, .81, .05, .012));
      break;
    }
    case 'shower': showerModel(g, w, d, bz, true); break;
    case 'openshower': showerModel(g, w, d, bz, false); break;
    case 'dryingrack': {
      // 升降式晾衣杆：两根平行晾衣杆 + 两端连接架 + 四根吊索 + 天花固定座 + 手摇升降机构
      const met = mat('#c9ced3', { metalness: .55, roughness: .4 });
      const yR = 1.92, zf = d/2;
      [-1, 1].forEach(s => g.add(rod([-w/2, yR, s*zf], [w/2, yR, s*zf], .012, met)));            // 晾衣杆
      [-1, 1].forEach(sx => g.add(rbox(.05, .04, d + .02, met, sx*(w/2 - .025), yR - .02, 0, .012))); // 端架
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx, sz]) => {                                     // 吊索 + 固定座
        const px = sx*(w/2 - .08), pz = sz*zf;
        g.add(rod([px, yR + .01, pz], [px, H, pz], .0045, met));
        g.add(rbox(.07, .05, .07, met, px, H - .05, pz, .012));
      });
      // 手摇升降机构（右端）
      const gx = w/2 - .01;
      g.add(rbox(.08, .09, .09, mat('#b7bdc2', { metalness: .5, roughness: .45 }), gx, yR - .045, 0, .012),
            rod([gx + .04, yR - .02, 0], [gx + .04, yR - .16, 0], .009, met),
            rod([gx + .04, yR - .16, 0], [gx - .06, yR - .16, 0], .011, met));
      break;
    }
    case 'bathtub': {
      const cer = ceramic(), h = .56, t = .07, cm = chrome();
      g.add(shell(w, d, h, t, .14, cer), box(w - .1, .12, d - .1, cer, 0, 0, 0),
            box(w - 2*t + .004, .004, d - 2*t + .004, mat('#bfe0ea', { roughness: .03, transparent: true, opacity: .6 }), 0, .4, 0));
      const fx = w/2 - t/2;
      g.add(tube([[fx, h - .02, 0], [fx, h + .1, 0], [fx - .06, h + .13, 0], [fx - .13, h + .09, 0]], .014, cm));
      [-1, 1].forEach(s => g.add(cyl(.02, .02, .04, cm, fx, h, s*.1, 16)));
      g.add(rot(rbox(.08, .16, .3, cer, -w/2 + t + .06, h - .12, 0, .04), 0, 0, -.5),
            rbox(.22, .05, .16, fabric('#e9e6d6'), fx - .05, h, d/2 - .1, .02));
      break;
    }
    case 'washer': case 'dryer': {
      const bm = mat(c, { roughness: .35 }), R0 = Math.min(w, d)*.25, fz = d/2 - .02;
      g.add(box(w - .02, .04, d - .04, '#8f969b', 0, 0, -.02), rbox(w, .81, d - .02, bm, 0, .04, -.01, .025));
      g.add(box(w - .04, .1, .006, lighter(c, .3), 0, .72, fz + .003),
            rbox(.18, .07, .01, bm, -w/2 + .12, .735, fz + .006, .004));
      g.add(box(.12, .035, .003, screenMat('#1f6f6a'), w*.14, .745, fz + .007));
      const kn = cyl(.03, .03, .02, chrome(), -w*.02, .75, fz + .016, 28);
      kn.rotation.x = Math.PI/2; g.add(kn);
      const dr = new THREE.Mesh(new THREE.CircleGeometry(R0, 40), mat('#1b1f22', { roughness: .6 }));
      dr.position.set(0, .4, fz + .004); g.add(dr);
      const rg = new THREE.Mesh(new THREE.TorusGeometry(R0 + .02, .022, 14, 48), mat('#c7cfd5', { metalness: .7, roughness: .25 }));
      rg.position.set(0, .4, fz + .016); sh(rg); g.add(rg);
      const Rs = R0*1.42;
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(Rs, 32, 12, 0, Math.PI*2, 0, .78),
        mat(f.type === 'dryer' ? '#4a4038' : '#26343d', { roughness: .04, metalness: .2, transparent: true, opacity: .8 }));
      cap.rotation.x = Math.PI/2;
      cap.position.set(0, .4, fz + .012 - Rs*Math.cos(.78));
      g.add(cap);
      g.add(box(w - .06, .004, .003, '#b9c3ca', 0, .08, fz + .002));
      break;
    }
    case 'crib': {
      const wm = woodM(c);
      g.add(rbox(w - .09, .12, d - .09, fabric('#ffffff'), 0, .3, 0, .04), box(w - .06, .025, d - .06, wm, 0, .28));
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(
        rbox(.045, .95, .045, wm, a*(w/2 - .022), 0, b*(d/2 - .022), .008),
        blob(.028, .028, .028, wm, a*(w/2 - .022), .97, b*(d/2 - .022), 14)));
      [-1, 1].forEach(s => {
        const z = s*(d/2 - .022), x = s*(w/2 - .022);
        g.add(rbox(w - .05, .035, .03, wm, 0, .88, z, .008), rbox(w - .05, .035, .03, wm, 0, .25, z, .008),
              rbox(.03, .035, d - .05, wm, x, .88, 0, .008), rbox(.03, .035, d - .05, wm, x, .25, 0, .008));
        for (let p = -w/2 + .09; p < w/2 - .05; p += .075) g.add(rod([p, .28, z], [p, .88, z], .009, wm, .009, 8));
        for (let p = -d/2 + .09; p < d/2 - .05; p += .075) g.add(rod([x, .28, p], [x, .88, p], .009, wm, .009, 8));
      });
      g.add(rbox(w*.5, .03, d - .14, fabric('#f3d9c9'), w*.12, .42, 0, .015),
            rbox(.3, .06, .2, fabric('#fbfaf7'), -w/2 + .22, .42, 0, .03));
      const bx = -w*.3 + .1, bear = '#c9a27a';
      g.add(blob(.05, .06, .045, bear, bx, .5, .12), blob(.045, .042, .04, bear, bx, .59, .12),
            blob(.016, .016, .01, bear, bx - .032, .625, .12), blob(.016, .016, .01, bear, bx + .032, .625, .12));
      break;
    }
    case 'beanbag': {
      const fab = mat(c, { roughness: .95 });
      g.add(blob(w*.5, .3, d*.5, fab, 0, .3, 0, 40), blob(w*.42, .22, d*.22, fab, 0, .5, bz + d*.26, 32));
      break;
    }
    case 'sidetable': {
      const r = Math.min(w, d)/2, bm = blackMetal();
      g.add(lathe([[r*.55, 0], [r*.55, .012], [.03, .035], [.018, .3], [.025, .5], [.08, .52]], bm, 0, 0, 0, 40),
            cyl(r, r*.98, .025, mat(c, { roughness: .35 }), 0, .52, 0, 48));
      g.add(box(.16, .02, .12, '#4f6b8a', -r*.25, .545, 0));
      vase(g, r*.35, .545, -r*.1, .035, .12, '#e9e2d6', R, false);
      break;
    }
    case 'floorlamp': {
      const r = Math.min(w, d)/2, lm = mat(c, { roughness: .35, metalness: .5 });
      g.add(lathe([[0, 0], [r*.55, 0], [r*.58, .012], [r*.5, .03], [.02, .035]], lm, 0, 0, 0, 40),
            rod([0, .03, 0], [0, 1.36, 0], .011, lm));
      g.add(lathe([[r*.85, 0], [r*.55, .36]], glowMat('#f6ecd9', '#ffdca0', .45), 0, 1.22, 0, 48),
            blob(.035, .035, .035, glowMat('#fff', '#ffe2b0', 1.2), 0, 1.36, 0, 12));
      g.add(ring(r*.85, .004, lm, 0, 1.22, 0), ring(r*.55, .004, lm, 0, 1.58, 0));
      break;
    }
    case 'island': {
      const cm = mat(c, { roughness: .45 }), stone = mat('#dcd7cf', { roughness: .2 });
      const cd = d - .3, n = Math.max(1, Math.round((w - .1)/.6));
      const cab = new THREE.Group(), fz = cd/2 - .03;
      cab.add(box(w - .12, .1, cd - .08, '#4a4641', 0, 0, -.04), box(w - .1, .74, cd - .03, cm, 0, .1, -.015));
      fronts(cab, -w/2 + .05, .64, w - .1, .2, fz, n, 1, cm, 'bar');
      fronts(cab, -w/2 + .05, .1, w - .1, .54, fz, n, 1, cm, 'bar', .56);
      cab.rotation.y = Math.PI; cab.position.z = bz + cd/2; g.add(cab);   // 柜门朝 -z，+z 侧留出吧台挑空
      g.add(rbox(w, .05, d, stone, 0, .84, 0, .006));
      [-1, 1].forEach(s => g.add(box(.04, .84, d, stone, s*(w/2 - .02), 0, 0)));
      g.add(lathe([[0, 0], [.06, 0], [.14, .06], [.15, .07]], mat('#6b543f', { roughness: .5, side: THREE.DoubleSide }), w*.22, .89, 0, 32));
      for (let k = 0; k < 4; k++) g.add(blob(.04, .04, .04,
        ['#d98c4a', '#9fbf5a', '#b5463a', '#e6c14f'][k],
        w*.22 + Math.cos(k*1.6)*.05, .935 + (k === 3 ? .04 : 0), Math.sin(k*1.6)*.05, 14));
      vase(g, -w*.25, .89, -.05, .05, .22, '#e9e2d6', R);
      break;
    }
    case 'barstool': {
      const r = Math.min(w, d)/2, bm = blackMetal(), sy = .7;
      [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([a, b]) => g.add(
      rod([a*r*.72, 0, b*r*.72], [a*r*.4, sy, b*r*.4], .011, bm)));
      g.add(ring(Math.SQRT2*r*(.72 - .32*.4), .008, bm, 0, .28, 0),
            cyl(r*.55, r*.55, .02, bm, 0, sy - .01, 0, 32));
      g.add(lathe([[0, 0], [r*.85, 0], [r*.95, .02], [r*.97, .045], [r*.9, .07], [0, .075]], mat(c, { roughness: .6 }), 0, sy, 0, 40));
      break;
    }
    case 'waterheater': {
      const r = Math.min(d/2, .23), L = w - .06, yc = 1.95, zc = bz + r + .02;
      const tm = mat(c, { roughness: .35 }), cp = mat('#cfd4d8', { roughness: .4 });
      const tank = mesh(new THREE.CylinderGeometry(r, r, L, 40), tm);
      tank.rotation.z = Math.PI/2; tank.position.set(0, yc, zc); g.add(tank);
      [-1, 1].forEach(s => g.add(
        blob(.035, r*.99, r*.99, cp, s*L/2, yc, zc, 32),
        box(.05, r*1.1, .02, '#9a9ea3', s*L*.3, yc - r*.55, bz + .01)));
      g.add(rbox(.2, .09, .02, '#e7eaec', L*.18, yc - .05, zc + r*.93, .008),
            box(.07, .03, .002, screenMat('#2f8f7a'), L*.18 - .04, yc - .02, zc + r*.93 + .011));
      [[-L*.3, '#3b7bbf'], [-L*.18, '#c0463a']].forEach(([x, cc]) => g.add(
        rod([x, yc - r*.8, zc], [x, 1.3, zc], .012, metal()),
        cyl(.02, .02, .03, cc, x, 1.5, zc, 12)));
      break;
    }
    case 'tv': {
      const th = w*.5625, yb = 1.2 - th/2, z = bz + .03;
      g.add(rbox(w*.6, th*.6, .03, '#222', 0, yb + th*.2, bz + .015, .01));
      g.add(rbox(w, th, .025, mat('#18181a', { roughness: .4, metalness: .3 }), 0, yb, z + .01, .004),
            box(w - .016, th - .022, .002, screenMat('#1f2b3a'), 0, yb + .014, z + .0235),
            box(.04, .006, .002, '#8a8a8e', 0, yb + .004, z + .0235));
      break;
    }
    case 'aircon': {
      const am = mat(c, { roughness: .3 }), h = 1.8, fz = d/2 - .005;
      g.add(rbox(w, .06, d, '#cfd3d6', 0, 0, 0, .015), rbox(w - .01, h - .06, d - .01, am, 0, .06, 0, .06));
      g.add(rbox(w - .06, 1.0, .01, mat(lighter(c, .4), { roughness: .12 }), 0, .22, fz, .005),
            box(w - .1, .42, .01, '#3d4145', 0, 1.28, fz));
      for (let i = 0; i < 8; i++) g.add(rot(box(w - .11, .012, .03, '#e4e7ea', 0, 1.3 + i*.05, fz + .008), -.35));
      g.add(box(.1, .035, .003, mat('#101214', { emissive: '#4fb3a5', emissiveIntensity: .7 }), 0, 1.12, fz + .006));
      for (let i = 0; i < 8; i++) g.add(box(w - .12, .005, .004, '#b9bfc4', 0, .09 + i*.015, fz + .002));
      break;
    }
    case 'dishwasher': {
      const dm = mat(c, { metalness: .55, roughness: .28 }), fz = d/2 - .02;
      g.add(box(w - .01, .08, d - .07, '#3a3834', 0, 0, -.035), box(w - .005, .76, d - .03, '#8b9095', 0, .08, -.015));
      g.add(rbox(w - .006, .7, .02, dm, 0, .085, fz, .004),
            box(w - .006, .055, .02, '#26282a', 0, .785, fz));
      for (let i = 0; i < 4; i++) g.add(box(.012, .006, .002,
        mat('#101214', { emissive: i ? '#6fd0ff' : '#7fe08a', emissiveIntensity: .8 }), w*.1 + i*.03, .81, fz + .011));
      pull(g, w*.6, false, 0, .74, fz + .01);
      break;
    }
    case 'ovencol': {
      const cm = mat(c, { roughness: .5 }), h = 2.1, fz = d/2 - .02;
      const frm = mat('#1c1d1f', { roughness: .3, metalness: .5 });
      const gl  = mat('#0b0c0d', { roughness: .03, metalness: .6 });
      g.add(box(w - .02, .08, d - .06, '#4a4641', 0, 0, -.03), box(w, h - .08, d - .02, cm, 0, .08, -.01));
      fronts(g, -w/2, .08, w, .6, fz, 1, 2, cm, 'bar');
      fronts(g, -w/2, 1.78, w, h - 1.8, fz, 1, 1, cm, 'bar', 1.84);
      [[.7, .58], [1.3, .46]].forEach(([y, ah]) => {
        g.add(box(w - .02, ah - .01, .02, frm, 0, y, fz + .01),
              box(w - .1, ah*.52, .003, gl, 0, y + ah*.1, fz + .021),
              box(w - .04, .06, .003, '#2a2c2e', 0, y + ah - .075, fz + .021));
        g.add(box(.08, .022, .002, mat('#101214', { emissive: '#ff9a3c', emissiveIntensity: .7 }), 0, y + ah - .056, fz + .023));
        pull(g, w*.7, false, 0, y + ah*.72, fz + .02);
      });
      break;
    }
    case 'purifier': {
      const pm = mat(c, { roughness: .45 }), h = .72;
      g.add(rbox(w, h, d, pm, 0, 0, 0, Math.min(w, d)*.2),
            rbox(w - .05, .006, d - .05, '#8d959b', 0, h - .002, 0, .02));
      for (let i = 0; i < 7; i++) g.add(box(w - .07, .004, .006, '#6f777d', 0, h + .002, -d/2 + .05 + i*(d - .1)/6));
      g.add(rbox(w - .06, .42, .006, fabric('#c8ccd0'), 0, .06, d/2 - .001, .01));
      const rg = new THREE.Mesh(new THREE.TorusGeometry(.03, .004, 8, 32), mat('#101214', { emissive: '#4fb3a5', emissiveIntensity: .8 }));
      rg.position.set(0, .6, d/2 + .002); g.add(rg);
      break;
    }
    case 'officechair': {
      const r = Math.min(w, d)*.46, dk = darker(c, .75);
      const bm = mat('#2b2b2d', { roughness: .45 }), cm = chrome();
      for (let k = 0; k < 5; k++){
        const a = k*Math.PI*2/5, tx = Math.sin(a)*r*.95, tz = Math.cos(a)*r*.95;
        g.add(rod([0, .1, 0], [tx, .07, tz], .022, bm, .014, 10),
              cyl(.008, .008, .03, bm, tx, .04, tz, 8),
              rot(cyl(.026, .026, .03, '#111', tx, .026 - .015, tz, 16), 0, a, Math.PI/2));
      }
      g.add(cyl(.05, .06, .05, bm, 0, .08, 0, 20), cyl(.025, .025, .22, cm, 0, .12, 0, 16),
            cyl(.036, .036, .12, bm, 0, .12, 0, 16), rbox(.22, .05, .22, bm, 0, .34, .02, .01));
      g.add(rbox(w*.78, .03, d*.72, bm, 0, .38, .04, .01),
            rbox(w*.8, .08, d*.74, fabric(c), 0, .4, .05, .035));
      g.add(tube([[0, .36, 0], [0, .38, bz + .12], [0, .6, bz + .07]], .02, bm));
      const bf = shell(w*.72, .6, .03, .025, .08, bm);
      bf.rotation.x = Math.PI/2 - .12; bf.position.set(0, .88, bz + .06); g.add(bf);
      g.add(rot(box(w*.68, .56, .006, mat(dk, { roughness: .85, transparent: true, opacity: .88, side: THREE.DoubleSide }), 0, .6, bz + .085), -.12),
            rot(rbox(w*.5, .08, .03, fabric(c), 0, .66, bz + .11, .015), -.12));
      g.add(rod([-.05, 1.14, bz + .025], [-.05, 1.22, bz + .015], .008, bm),
            rod([.05, 1.14, bz + .025], [.05, 1.22, bz + .015], .008, bm),
            rbox(w*.45, .12, .05, fabric(dk), 0, 1.2, bz + .02, .025));
      [-1, 1].forEach(s => g.add(
        box(.035, .22, .035, bm, s*w*.4, .42, .04),
        rbox(.07, .03, d*.4, bm, s*w*.4, .63, .04, .012)));
      break;
    }
    case 'piano': {
      const pk = mat(c, { roughness: .12, metalness: .1 }), bd = d*.5, kz = bz + bd;
      const h = 1.25, kd = d*.22 - .03, iv = mat('#faf8f3', { roughness: .3 });
      const eb = mat('#111', { roughness: .25 }), kw = (w - .12)/52;
      g.add(box(w, h, bd, pk, 0, 0, bz + bd/2), rbox(w + .02, .03, bd + .03, pk, 0, h, bz + bd/2 + .01, .008));
      [-1, 1].forEach(s => g.add(
        rbox(.06, .13, kd + .06, pk, s*(w/2 - .03), .6, kz + (kd + .06)/2, .01),
        box(.05, .6, .05, pk, s*(w/2 - .08), 0, kz + kd + .01),
        box(.06, .04, d - bd, pk, s*(w/2 - .08), 0, kz + (d - bd)/2)));
      g.add(box(w - .12, .08, kd + .05, pk, 0, .6, kz + (kd + .05)/2), box(w - .12, .1, .03, pk, 0, .68, kz + .015));
      for (let i = 0; i < 52; i++){
        const x = -w/2 + .06 + kw*(i + .5);
        g.add(box(kw - .0015, .022, kd, iv, x, .68, kz + .03 + kd/2));
        if (i < 51 && 'ACDFG'.includes('ABCDEFG'[i % 7]))
          g.add(box(kw*.58, .02, kd*.62, eb, x + kw/2, .7, kz + .03 + kd*.31));
      }
      g.add(rot(box(w*.42, .18, .012, pk, 0, .84, kz + .012), -.25));
      [-.06, 0, .06].forEach(x => g.add(box(.025, .012, .07, mat('#c9a35a', { metalness: .9, roughness: .3 }), x, .05, kz + .03)));
      const mt = cyl(.0, .05, .2, woodM('#5a3e2b'), w*.3, h + .03, bz + bd/2, 4);
      mt.rotation.y = Math.PI/4; g.add(mt);
      g.add(rot(box(.14, .18, .015, woodM('#c9a27a'), -w*.3, h + .03, bz + .06), -.15),
            rot(box(.11, .14, .002, '#9fb3c2', -w*.3, h + .05, bz + .07), -.15));
      break;
    }
    case 'treadmill': {
      const tm = mat(c, { roughness: .55 }), bm = mat('#2a2a2c', { roughness: .5 });
      const al = mat('#9a9ea3', { metalness: .6, roughness: .4 });
      g.add(rbox(w, .14, d - .25, tm, 0, .03, .125, .03),
            box(w - .16, .006, d - .5, '#141414', 0, .17, .15));
      [-1, 1].forEach(s => g.add(box(.07, .008, d - .45, al, s*(w/2 - .05), .17, .15)));
      [bz + .06, d/2 - .06].forEach(z => [-1, 1].forEach(s => g.add(box(.06, .03, .06, bm, s*(w/2 - .06), 0, z))));
      g.add(rbox(w, .22, .32, tm, 0, 0, bz + .16, .05));
      [-1, 1].forEach(s => g.add(
        rod([s*(w/2 - .06), .15, bz + .2], [s*(w/2 - .06), 1.15, bz + .3], .025, bm, .022),
        tube([[s*(w/2 - .06), 1.0, bz + .28], [s*(w/2 - .06), 1.0, bz + .5], [s*(w/2 - .07), .97, bz + .62]], .018, bm)));
      const cg = new THREE.Group();
      cg.position.set(0, 1.2, bz + .31); cg.rotation.x = -.5;
      cg.add(rbox(w*.8, .2, .08, bm, 0, -.1, 0, .02),
             box(w*.4, .11, .004, screenMat('#2a5d8f'), 0, -.055, .041));
      g.add(cg);
      break;
    }
    case 'screen': {
      // 屏风：木框 + 布面，等分为若干可折面板，面板间以合页相连
      const Hh = 1.8, fr = woodM('#6b543f'), fill = fabric(c), t = .028;
      const n = Math.max(3, Math.round(w/.5)), pw = w/n;
      g.add(box(w, .05, d, fr, 0, 0, 0), box(w, .05, d, fr, 0, Hh - .05, 0));
      for (let i = 0; i < n; i++){
        const x = -w/2 + pw*(i + .5);
        g.add(box(pw - .03, Hh - .1, t, fill, x, .05, 0));                       // 面板芯
        [-1, 1].forEach(s => g.add(box(.05, Hh, d, fr, x + s*(pw/2 - .025), 0, 0))); // 立柱
        if (i < n - 1) g.add(cyl(.015, .015, .06, hwMat(), x + pw/2, .45, 0, 12),
                             cyl(.015, .015, .06, hwMat(), x + pw/2, 1.15, 0, 12)); // 合页
      }
      break;
    }
    case 'pillar': {
      // 方柱：柱础 + 柱身 + 柱头，通高到顶
      const Hh = H - .02, m = mat(c, { roughness: .7 }), tm = mat(darker(c, .9), { roughness: .6 });
      g.add(box(w + .06, .08, d + .06, tm, 0, 0, 0));
      g.add(box(w, Hh - .16, d, m, 0, .08, 0));
      g.add(box(w + .06, .08, d + .06, tm, 0, Hh - .08, 0));
      break;
    }
    case 'column': {
      // 圆柱：圆形柱础 + 柱身 + 柱头，通高到顶
      const Hh = H - .02, r = Math.min(w, d)/2, m = mat(c, { roughness: .5 }), st = mat(darker(c, .9), { roughness: .55 });
      const baseH = .14, capH = .14;
      g.add(lathe([[r*1.3, 0], [r*1.3, .05], [r*1.18, .09], [r*1.02, baseH]], st, 0, 0, 0, 48));
      g.add(cyl(r, r, Hh - baseH - capH + .04, m, 0, baseH - .02, 0, 48));
      g.add(lathe([[r*1.02, 0], [r*1.18, .05], [r*1.3, .09], [r*1.3, capH]], st, 0, Hh - capH, 0, 48));
      break;
    }

    case 'railing': {
      // 走廊扶手：原木立柱 / 上下压条 + 玻璃栏板（可贴墙、贴区域边缘摆放）
      const Hr = 1.05, t = Math.max(.05, Math.min(d, .14));
      const wm = woodM(c || '#c9a06a');
      const gm = glassMat || mat('#cfe7f0', { transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide });
      g.add(rbox(w, .06, t, wm, 0, .03, 0, .008));                     // 下压条
      g.add(rbox(w + .02, .055, t + .02, wm, 0, Hr - .055, 0, .012));  // 上扶手
      const pane = box(Math.max(.02, w - .08), Hr - .18, .012, gm, 0, .09, 0);
      pane.castShadow = false; g.add(pane);                            // 玻璃栏板
      const n = Math.max(2, Math.round(w/.9));
      for (let i = 0; i <= n; i++)
        g.add(rbox(.05, Hr, t, wm, -w/2 + w*i/n, 0, 0, .006));         // 原木立柱
      break;
    }
    /* ============ 楼层：步梯 / 旋转步梯 / 电梯 / 扶梯 ============
     * 约定：踏步由局部 +z（近端）向 -z（远端）升高，顶端标高 = 层高 H，
     * 与漫游时 engine.walkSupport() 的高度函数一一对应。 */
    case 'stair': {
      // sd = 1：从近端 (z = +d/2) 向远端升高到目标层；sd = -1：同样线路向下走一层
      // riseH = 本层到目标层的标高差（米），由引擎按 to.elev - from.elev 传入
      const n = Math.max(6, Math.round(d/.28)), stepH = riseH/n, run = d/n;
      const treadM = woodM('#d6c7b2'), riserM = mat('#e6dfd3', { roughness: .85 }), beamM = woodM('#6b543f');
      for (let i = 0; i < n; i++){
        const yTop = sd*stepH*(i + 1), z = d/2 - run*(i + .5);
        g.add(box(w, .05, run + .03, treadM, 0, yTop - .05, z));                    // 踏面板
        g.add(box(w - .02, stepH, .035, riserM, 0, sd > 0 ? yTop - stepH : yTop, z + run/2)); // 踢面
      }
      const th = Math.atan2(riseH, d), L = Math.hypot(d, riseH);
      [-1, 1].forEach(s => {
        const x = s*(w/2 - .025);
        const beam = box(.05, .2, L, beamM, 0, 0, 0);                                // 斜梁（与踏步同向）
        beam.rotation.x = sd*th;
        beam.position.set(x, sd*riseH/2 - .16, 0);
        g.add(beam);
        [0, .5, 1].forEach(t => {                                                    // 扶手立杆
          const y = sd*riseH*t, z = d/2 - d*t;
          const yTop = Math.min(y + .9, clipTop);                                     // 超出上层楼面（clipTop）的部分不画
          if (yTop - y > .01) g.add(rod([x, y, z], [x, yTop, z], .012, beamM));
        });
        // 扶手：到上层楼面（clipTop）为止，避免从夹层看过来时扶手冲出地面
        const y0 = .9, y1 = sd*riseH + .9;
        if (y0 < clipTop - .01){
          if (y1 > clipTop){
            const t = (clipTop - y0)/(y1 - y0);
            g.add(rod([x, y0, d/2], [x, clipTop, d/2 - d*t], .018, beamM));
          } else {
            g.add(rod([x, y0, d/2], [x, y1, -d/2], .018, beamM));
          }
        }
      });
      break;
    }
    case 'lstair': {
      /* L 型步梯（直角双跑）：西侧一跑自南向北 → 西北转角平台（半层）→ 北侧一跑自西向东。
       * 梯跑宽 = 0.4 × 对应边长，与 CLIMB.lstair、2D 图例保持一致；
       * 楼梯井（东南空角）留空，从上层俯视能看到井道。 */
      const FW = .4, H1 = riseH/2;
      const treadM = woodM('#d6c7b2'), riserM = mat('#e6dfd3', { roughness: .85 });
      const beamM = woodM('#6b543f'), landM = woodM('#e6dccb'), hndM = hwMat();
      const fw = w*FW, fd = d*FW;                       // 第一跑宽（x）/ 第二跑宽（z）
      const run1 = Math.max(.6, d - fd), run2 = Math.max(.6, w - fw);
      const n1 = Math.max(5, Math.round(run1/.28)), s1 = run1/n1, st1 = H1/n1;
      const n2 = Math.max(5, Math.round(run2/.28)), s2 = run2/n2, st2 = H1/n2;
      const x1 = -w/2 + fw, z1 = -d/2 + fd;             // 楼梯井的内角
      const cx1 = -w/2 + fw/2, cz2 = -d/2 + fd/2;

      // 第一跑：沿 -z 逐级升高（sd < 0 时整体向下）
      for (let i = 0; i < n1; i++){
        const yTop = sd*H1*(i + 1)/n1, z = d/2 - s1*(i + .5);
        g.add(box(fw, .05, s1 + .03, treadM, cx1, yTop - .05, z));
        g.add(box(fw - .02, st1, .035, riserM, cx1, sd > 0 ? yTop - st1 : yTop, z + s1/2));
      }
      // 转角平台（西北角）
      g.add(box(fw, .12, fd, landM, cx1, sd*H1 - .12, cz2));
      // 第二跑：沿 +x 逐级升高
      for (let i = 0; i < n2; i++){
        const yTop = sd*(H1 + H1*(i + 1)/n2), x = x1 + s2*(i + .5);
        g.add(box(s2 + .03, .05, fd, treadM, x, yTop - .05, cz2));
        g.add(box(.035, st2, fd - .02, riserM, x + s2/2, sd > 0 ? yTop - st2 : yTop, cz2));
      }
      // 楼梯井一侧的连续扶手：先沿西边北上、过平台、再沿北边东行
      const yR = y => Math.min(y + .9, clipTop);
      const pts = [[x1, yR(0), d/2]];
      for (let i = 1; i <= 4; i++){
        const t = i/4;
        pts.push([x1, yR(sd*H1*t), d/2 - run1*t]);
      }
      for (let i = 1; i <= 4; i++){
        const t = i/4;
        pts.push([x1 + run2*t, yR(sd*(H1 + H1*t)), z1]);
      }
      g.add(tube(pts, .018, hndM, 96));
      // 扶手立杆：起点、转角、终点
      [[x1, 0, d/2], [x1, sd*H1, z1], [w/2, sd*riseH, z1]].forEach(([x, y, z]) => {
        const top = yR(y);
        if (top - y > .02) g.add(rod([x, y, z], [x, top, z], .014, beamM));
      });
      break;
    }
    case 'spiralstair': {
      const R = Math.min(w, d)/2, n = 14, treadM = woodM('#d6c7b2');
      const colBase = sd < 0 ? -riseH : 0;
      const colTop = Math.min(riseH + .95, clipTop);
      g.add(cyl(R*.1, R*.1, Math.max(.05, colTop - colBase), metal(), 0, colBase, 0, 24)); // 中柱（截到 clipTop）
      const pts = [];
      for (let i = 0; i < n; i++){
        const a = i/n*Math.PI*2, y = sd*(i/n*riseH) + .02, tw = Math.min(.34, 2*Math.PI*R/n*.86);
        const p = new THREE.Group();
        p.position.y = y;
        p.rotation.y = -a;                                                          // 局部 +x 指向该级踏步的径向
        p.add(box(R*.9, .05, tw, treadM, R*.55, 0, 0));
        g.add(p);
        const ox = Math.cos(a)*R*.96, oz = Math.sin(a)*R*.96;
        const top = Math.min(y + .9, clipTop);
        if (top - y > .01) g.add(rod([ox, y, oz], [ox, top, oz], .011, hwMat()));
        if (top - y > .01) pts.push([ox, top, oz]);
      }
      pts.push([R*.96, Math.min(sd*riseH + .9, clipTop), 0]);                       // 扶手闭合
      g.add(tube(pts, .016, hwMat(), 96));
      break;
    }
    case 'elevator': {
      const met = mat('#b9bec3', { metalness: .8, roughness: .28 });
      const wallM = mat('#eae7e1', { roughness: .6 }), frameM = mat('#4d5155', { roughness: .45, metalness: .5 });
      const Hc = Math.min(2.3, H - .3), t = .06, fz = d/2;
      g.add(box(w - .06, .03, d - .06, mat('#8d9195', { roughness: .5 }), 0, 0, 0));   // 轿底
      /* 壁面插入顶板 2 mm、顶灯下沉 2 mm：避免与顶板底面共面产生 z-fighting */
      g.add(box(w, Hc + .002, t, wallM, 0, 0, bz + t/2));                             // 后壁
      [-1, 1].forEach(s => g.add(box(t, Hc + .002, d, wallM, s*(w/2 - t/2), 0, 0)));  // 侧壁
      g.add(box(w, .07, d, wallM, 0, Hc, 0));                                         // 顶板
      g.add(box(w*.55, .012, d*.5, glowMat('#fff', '#ffe9c4', .8), 0, Hc - .014, 0)); // 顶灯
      const dw = Math.min(w*.34, .6);
      /* 门套 / 门楣比固定板外凸 2 mm：两者正面原来同处 z = fz，重叠区会共面闪烁 */
      const frameZ = fz - t*.8 + .002;
      [-1, 1].forEach(s => {
        g.add(box(w/2 - dw, Hc + .002, t, wallM, s*(dw + (w/2 - dw)/2), 0, fz - t/2)); // 门两侧固定板（插入顶板）
        g.add(box(dw - .008, Hc - .26, .04, met, s*(dw/2), 0, fz - .06));             // 双扇滑门
        g.add(box(.018, .46, .02, chrome(), s*.045, 1.02, fz - .028));                // 门缝把手（离门面 2 mm）
        g.add(box(t, Hc + .002, t*1.6, frameM, s*(dw + t*.8), 0, frameZ));            // 门套（插入顶板）
      });
      g.add(box(2*dw + t*3, .238, t*1.6, frameM, 0, Hc - .24, frameZ));               // 门楣（顶部留 2 mm 缝）
      g.add(box(.16, .09, .022, '#1d1f21', -w/2 + .18, 1.15, fz - .012));             // 呼梯面板
      g.add(box(.05, .03, .004, mat('#101214', { emissive: '#6fd0ff', emissiveIntensity: .8 }), -w/2 + .18, 1.18, fz - .001));
      break;
    }
    case 'escalator': {
      /* 商场式自动扶梯：金属梯级（含齿条 / 前缘黄边 / 踢面） + 内裙板（黄色安全线） +
         金属栏板座 + 玻璃栏板 + 黑色扶手带（端部回弯 / 立杆） + 侧面桁架包板 + 扶手灯带 */
      const rise = riseH, th = Math.atan2(rise, d), L = Math.hypot(d, rise);
      const stepM  = mat('#d2d6d9', { metalness: .35, roughness: .45 });
      const cleatM = mat('#9aa0a5', { metalness: .5, roughness: .35 });
      const riserM = mat('#b6bbbf', { metalness: .45, roughness: .4 });
      const skirtM = mat('#c8cdd1', { metalness: .4, roughness: .38 });
      const cladM  = mat('#c6cbcf', { metalness: .25, roughness: .55 });
      const railM  = mat('#a8adb2', { metalness: .55, roughness: .35 });
      const beltM  = mat('#232325', { roughness: .55 });
      const combM  = mat('#d8dde1', { metalness: .5, roughness: .3 });
      const yellow = mat('#e8b23a', { roughness: .5 });
      const glass  = glassMat || mat('#cfe6ef', { transparent: true, opacity: .3 });

      const OUT = w/2;
      const X = OUT - .055;                                // 裙板 / 玻璃 / 扶手中心线
      const hw = X - .06;                                  // 梯级半宽
      const n = Math.max(10, Math.round(d/.3)), run = d/n;
      const vh = v => v/Math.cos(th);                      // 需要的竖向高度 → 沿坡法向的局部高度

      /* ---- 梯级带：踏板 + 防滑齿条 + 前缘黄边 + 踢面 ---- */
      for (let i = 0; i < n; i++){
        const t = (i + .5)/n, y = sd*rise*t, z = d/2 - d*t;
        g.add(box(hw*2, .045, run*.96, stepM, 0, y, z));
        for (let k = 0; k < 3; k++)                        // 踏板横向防滑齿条
          g.add(box(hw*2 - .04, .006, .016, cleatM, 0, y + .045, z - run*.26 + k*run*.24));
        g.add(box(hw*2 - .03, .008, .022, yellow, 0, y + .045, z + run*.40));
        g.add(box(hw*2 - .03, .10, .02, riserM, 0, y - .055, z + run*.48));
      }

      /* ---- 两侧：裙板 / 黄线 / 栏板座 / 玻璃 / 扶手带 / 包板 / 灯带 ----
       * along(mesh, h)：沿坡度倾斜，h = 相对踏步面的竖向抬升（两端自动对齐） */
      const along = (mesh, h) => {
        mesh.rotation.x = sd*th;
        mesh.position.set(0, sd*rise/2 + h, 0);
        return mesh;
      };
      [-1, 1].forEach(s => {
        const x = s*X;
        // 内侧裙板（含下沿黄色安全线）
        const skirt = along(box(.05, vh(.30), L - .06, skirtM, 0, 0, 0), .15);
        skirt.position.x = x; g.add(skirt);
        const line = along(box(.008, .024, L - .16, yellow, 0, 0, 0), .06);
        line.position.x = s*(hw + .034); g.add(line);
        // 栏板座（金属型材）
        const base = along(box(.055, vh(.12), L - .06, railM, 0, 0, 0), .36);
        base.position.x = x; g.add(base);
        // 玻璃栏板 + 下沿压条 + 顶部与扶手连接件
        const gl = along(box(.014, vh(.53), L - .20, glass, 0, 0, 0), .685);
        gl.position.x = x; gl.castShadow = false; g.add(gl);
        const trim = along(box(.03, .028, L - .20, railM, 0, 0, 0), .435);
        trim.position.x = x; g.add(trim);
        // 扶手带（圆角橡胶）+ 金属导轨 + 蓝色灯带
        const belt = along(rbox(.10, vh(.07), L - .12, beltM, 0, 0, 0, .03), .985);
        belt.position.x = x; g.add(belt);
        const guide = along(box(.055, .025, L - .12, railM, 0, 0, 0), .935);
        guide.position.x = x; g.add(guide);
        const led = along(box(.012, .015, L - .30, glowMat('#eaf6ff', '#bfe6ff', .7), 0, 0, 0), .90);
        led.position.x = s*(X - .033); led.castShadow = false; g.add(led);
        // 侧面桁架包板：把梯级下方封起来，像商场里那样是一整块斜板
        const clad = along(box(.05, vh(.55), L - .06, cladM, 0, 0, 0), -.275);
        clad.position.x = s*(OUT - .025); g.add(clad);
      });

      /* ---- 两端：扶手带回弯 + 立杆 + 端部封板 + 梳齿板 ---- */
      [-1, 1].forEach(s => {
        const x = s*X;
        [0, 1].forEach(e => {
          const zEnd = (e ? -d/2 : d/2) - (e ? -.02 : .02);
          const floorY = e ? sd*rise : 0;                   // 该端的楼面标高
          const yEnd = floorY + .985;                       // 扶手带端头标高
          const dir = e ? -1 : 1;
          // 扶手带端部向下回弯
          g.add(tube([
            [x, yEnd, zEnd],
            [x, yEnd - .02, zEnd + dir*.10],
            [x, yEnd - .13, zEnd + dir*.20],
            [x, yEnd - .32, zEnd + dir*.26]
          ], .04, beltM, 24));
          // 回弯端的栏板端头（从楼面到扶手带，收口）
          g.add(box(.05, yEnd - floorY, .18, railM, x, floorY, zEnd + dir*.18));
        });
      });
      // 端部封板（近端 / 远端各一块，封住梯级与地面之间的开口）
      g.add(box(hw*2 + .10, .30, .06, cladM, 0, -.30, d/2 - .03));
      g.add(box(hw*2 + .10, .30, .06, cladM, 0, sd*rise - .30, -d/2 + .03));
      // 梳齿板（两端与梯级交接的金属板 + 黄线）
      [0, 1].forEach(e => {
        const z = e ? -d/2 + .10 : d/2 - .10;
        const y = e ? sd*rise : 0;
        g.add(box(hw*2 + .06, .012, .11, combM, 0, y + .003, z));
        g.add(box(hw*2 + .04, .006, .02, yellow, 0, y + .015, z + (e ? .05 : -.05)));
      });
      break;
    }

    /* ============ 户外 · 车库 ============
     * 车辆：车长沿局部 x，车宽沿局部 z；底盘离地 .16，轮子压在 y = 0 上。 */
    case 'ramp': {
      /* 车行坡道（下沉式车道）：
       *   · 坡面：单面四边形（双面材质），近端 +z 在室外地坪 0，远端 -z 到 -rise（下车库）或 +rise（上平台）；
       *   · 两侧挡土墙：从坡底砌到「地坪 +120」，形成下沉坡道，墙顶带压顶条；
       *   · 路面：中线虚线、两侧边线、横向防滑槽、端部黄色警示带；
       *   · 坡道不参与「上层楼板开洞」（NO_OPENING_TYPES）。 */
      const rise = Math.abs(riseH) > .2 ? Math.abs(riseH) : 2.8;
      const sd2 = f.sdir < 0 ? -1 : 1;
      const hw = w/2, hd = d/2;
      const yF = sd2 * rise;                            // 远端标高（负 = 下车库）
      const slope = yF / (2*hd);                        // dy/dz
      const ang = Math.atan(slope);
      const at = z => slope * (hd - z);                 // 坡面在 z 处的标高
      const surfM = mat(c || '#c2beb6', { roughness: .92, side: THREE.DoubleSide });
      const wallM = mat('#8f8a80', { roughness: .96 });  // 两侧挡土墙
      const capM  = mat('#a9a49b', { roughness: .88 });  // 墙顶压顶
      const lineM = mat('#f2f0ea', { roughness: .8 });   // 标线
      const warnM = mat('#d8b23c', { roughness: .8 });   // 警示黄
      const slotM = mat('#948f86', { roughness: .96 });  // 防滑槽

      // 1) 坡面：一个四边形（法线朝上）
      {
        const v = [];
        const V = (x, y, z) => v.push(x, y, z);
        V(-hw, 0, hd); V(hw, 0, hd); V(hw, yF, -hd);
        V(-hw, 0, hd); V(hw, yF, -hd); V(-hw, yF, -hd);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.computeVertexNormals();
        const s = new THREE.Mesh(geo, surfM);
        s.receiveShadow = true; s.castShadow = true;
        g.add(s);
      }

      // 2) 两侧挡土墙：下坡从坡底砌到地坪 +120；上坡则是抬高坡道的护栏墙（到坡顶 +120）
      const WT = Math.min(.22, w * .12);
      const upRamp = yF > 0;
      const wTop = upRamp ? yF + .12 : .12;
      const wBot = upRamp ? 0 : Math.min(0, yF) - .35;
      [-1, 1].forEach(s => {
        const xw = s * (hw - WT/2);
        g.add(box(WT, wTop - wBot, d, wallM, xw, wBot, 0));
        g.add(box(WT + .05, .06, d, capM, xw, wTop, 0));
      });

      // 3) 坡面标线：贴坡的薄片都按坡度倾斜
      const strip = (bw, bd, mx, mz, m, dy = .004, bh = .012) => {
        const b = box(bw, bh, bd, m, mx, at(mz) + dy, mz);
        b.rotation.x = ang;
        b.receiveShadow = true;
        g.add(b);
      };
      // 中线虚线
      const nD = Math.max(4, Math.round(d / 1.1));
      for (let i = 0; i < nD; i += 2){
        const step = d/nD, zc = -hd + step*(i + .5);
        strip(.13, step * .92, 0, zc, lineM);
      }
      // 两侧边线（连续，分成若干段贴合坡面）
      [-1, 1].forEach(s => {
        const xe = s * (hw - WT - .09);
        for (let i = 0; i < nD; i++){
          const step = d/nD, zc = -hd + step*(i + .5);
          strip(.1, step * 1.02, xe, zc, lineM, .004, .01);
        }
      });
      // 横向防滑槽（每 1.6m 一道）
      const nS = Math.max(2, Math.round(d / 1.6));
      for (let i = 1; i < nS; i++){
        const zc = -hd + (d/nS) * i;
        strip(w - 2*WT - .1, .06, 0, zc, slotM, .003, .008);
      }
      // 4) 地面端：黄色警示带 + 止水线
      {
        const zb = hd - .55;
        strip(w - 2*WT - .06, .16, 0, zb, warnM, .006, .014);
        strip(w - 2*WT - .06, .16, 0, hd - .95, warnM, .006, .014);
      }
      // 5) 远端：落地端平齐的收边 + 端部挡块（上行时才需要挡墙）
      strip(w - 2*WT - .06, .12, 0, -hd + .12, lineM, .004, .01);
      if (yF > 0) g.add(box(w, yF, .16, wallM, 0, 0, -hd + .08));   // 升起坡道的端立面
      break;
    }
    case 'car': case 'suv': case 'mpv': {
      /* 三种车型分开塑形：轿车流线低趴、SUV 方正高底盘、MPV 单厢长轴距 */
      const tall = f.type === 'suv', mpv = f.type === 'mpv';
      const paint = mat(c, { metalness: .55, roughness: .3 });
      const trim = mat('#2b2f34', { roughness: .55, metalness: .2 });
      const dark = mat('#1e2124', { roughness: .7 });
      const glass = mat('#1c2831', { metalness: .4, roughness: .08, transparent: true, opacity: .82 });
      const tyre = mat('#17181a', { roughness: .95 });
      const rimM = chrome();
      const headM = mat('#fff8e6', { emissive: '#fff0c8', emissiveIntensity: .5, roughness: .2 });
      const tailM = mat('#c0392b', { emissive: '#7d1d13', emissiveIntensity: .45, roughness: .3 });

      const rr = tall ? .38 : mpv ? .35 : .33;                 // 轮胎半径
      const bodyY = tall ? .38 : mpv ? .32 : .28;              // 车身底（离地）
      const bodyH = tall ? .62 : mpv ? .58 : .5;               // 下车身高度
      const roofY = bodyY + bodyH - .02;
      const cabL = w * (mpv ? .66 : tall ? .56 : .46);         // 车顶长度
      const cabX = -w * (mpv ? .04 : tall ? .03 : .02);        // 车顶中心（略偏后）
      const cabH = tall ? .5 : mpv ? .52 : .4;
      const cabW = d * (mpv ? .84 : tall ? .82 : .76);

      // 车轮：轮胎 + 轮辋 + 轮心（轴线沿 z），先画以便被车身遮挡内半
      [[w*.3, -1], [w*.3, 1], [-w*.3, -1], [-w*.3, 1]].forEach(([px, s]) => {
        const p = new THREE.Group();
        p.position.set(px, rr, s*(d/2 - .13));
        const t0 = mesh(new THREE.CylinderGeometry(rr, rr, .22, 22), tyre);
        const r0 = mesh(new THREE.CylinderGeometry(rr*.62, rr*.62, .225, 18), rimM);
        const r1 = mesh(new THREE.CylinderGeometry(rr*.2, rr*.2, .23, 12), dark);
        t0.rotation.x = r0.rotation.x = r1.rotation.x = Math.PI/2;
        sh(t0); sh(r0); p.add(t0, r0, r1); g.add(p);
      });
      // 下车身 + 前后保险杠 + 侧裙
      g.add(rbox(w*.98, bodyH, d*.94, paint, 0, bodyY, 0, .12));
      g.add(box(.16, bodyH*.42, d*.92, trim, w/2 - .06, bodyY - .02, 0),
            box(.16, bodyH*.42, d*.92, trim, -w/2 + .06, bodyY - .02, 0),
            box(w*.66, .1, d*.97, trim, 0, bodyY - .05, 0));
      if (tall){
        // SUV：黑色轮眉包围 + 银色前护板
        g.add(box(w*.92, .12, d*.99, trim, 0, bodyY - .03, 0),
              box(.12, .14, d*.6, mat('#b9c0c5', { metalness: .6, roughness: .35 }), w/2 - .04, bodyY - .06, 0));
      }
      // 引擎盖 / 行李厢（MPV 是单厢式，不另做）
      if (!mpv){
        g.add(rbox(w*.3, .09, d*.9, paint, w*.32, roofY - .11, 0, .04),
              rbox(w*.22, .1, d*.9, paint, -w*.38, roofY - .09, 0, .04));
      }
      // 车顶 + 倾斜的前后风挡
      g.add(rbox(cabL, cabH, cabW, paint, cabX, roofY, 0, .14));
      const winH = cabH*.62, wsA = tall ? .36 : mpv ? .55 : .6;
      g.add(rot(box(.02, winH, cabW*.88, glass, cabX + cabL/2 - .01, roofY + .04, 0), 0, 0, wsA));
      g.add(rot(box(.02, winH*.88, cabW*.86, glass, cabX - cabL/2 + .01, roofY + .06, 0), 0, 0, -wsA*.85));
      // 侧窗（B 柱留缝）+ 后视镜
      [-1, 1].forEach(s => {
        const wz = s*(cabW/2 + .006);
        g.add(box(cabL*.42, cabH*.34, .012, glass, cabX + cabL*.2, roofY + cabH*.34, wz),
              box(cabL*.3, cabH*.32, .012, glass, cabX - cabL*.2, roofY + cabH*.36, wz),
              box(.05, cabH*.45, .02, trim, cabX + cabL*.02, roofY + cabH*.2, wz));
        g.add(box(.12, .06, .16, trim, cabX + cabL/2 - .16, roofY + cabH*.55, s*(cabW/2 + .09)));
      });
      // 车型特征：SUV 车顶行李架 / MPV 侧滑门轨道 + 尾部扰流
      if (tall) [-1, 1].forEach(s => g.add(box(cabL*.86, .04, .05, trim, cabX, roofY + cabH, s*(cabW*.36))));
      if (mpv){
        [-1, 1].forEach(s => g.add(box(w*.4, .02, .012, dark, w*.02, bodyY + bodyH*.62, s*(d*.47))));
        g.add(box(cabL*.8, .05, cabW*.9, trim, cabX - cabL*.44, roofY + cabH*.92, 0));
      }
      // 前格栅 / 车灯 / 牌照
      g.add(box(.04, .22, d*.5, dark, w/2 - .015, bodyY + bodyH*.34, 0),
            box(.05, .03, d*.52, rimM, w/2 - .01, bodyY + bodyH*.6, 0));
      [-1, 1].forEach(s => {
        g.add(rbox(.06, .1, .3, headM, w/2 - .02, bodyY + bodyH*.62, s*d*.3, .02),
              rbox(.05, .09, .28, tailM, -w/2 + .02, bodyY + bodyH*.62, s*d*.3, .02));
      });
      g.add(box(.02, .11, .4, mat('#e8eaec', { roughness: .5 }), -w/2 + .01, bodyY + bodyH*.3, 0),
            box(.02, .08, .3, mat('#e8eaec', { roughness: .5 }), w/2 - .01, bodyY + bodyH*.26, 0));
      break;
    }
    case 'parking': {
      // 停车位划线：极薄的白色条带，抬高到区域地面（+8mm）之上避免被遮住
      const t = Math.max(.06, Math.min(w, d) * .035), yb = .012;
      const m = mat('#f4f5f6', { roughness: .9 });
      const bar = (bw, bd, bx, bz) => g.add(box(bw, .006, bd, m, bx, yb, bz));
      bar(w, t, 0, -d/2 + t/2);
      bar(t, d, -w/2 + t/2, 0);
      bar(t, d, w/2 - t/2, 0);
      // 入口端虚线（分界提示）
      const n = Math.max(3, Math.round(w / .5));
      for (let i = 0; i < n; i++) bar(.22, .05, -w/2 + .14 + (w - .28) * (i + .5)/n, d/2 - .03);
      // 车位中央的大号 “P”：贴地贴图（白色字形，随车位长向自动转向）
      const pm = parkLetterMat();
      if (pm){
        const s = Math.min(w, d) * .62;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(s, s), pm);
        face.rotation.z = w >= d ? 0 : -Math.PI/2;
        face.rotation.x = -Math.PI/2;
        face.position.set(0, yb + .004, 0);
        face.renderOrder = 2;
        g.add(face);
      }
      break;
    }
    case 'lane': case 'crosswalk': {
      /* 贴地标线（车道线 / 斑马线）：极薄白色条带，抬到区域地面（+8mm）之上，避免被地面遮住 */
      const m = mat(c || '#f2f4f5', { roughness: .9 });
      const yb = .012, t = .006;
      if (f.type === 'lane'){
        const hz = w >= d, L = hz ? w : d, tw = Math.max(.06, Math.min(w, d)*.9), n = Math.max(2, Math.round(L/1.5));
        for (let i = 0; i < n; i += 2){
          const len = L/n, p0 = -L/2 + len*i;
          if (hz) g.add(box(len*.86, t, tw, m, p0 + len*.43, yb, 0));
          else    g.add(box(tw, t, len*.86, m, 0, yb, p0 + len*.43));
        }
      } else {
        const n = Math.max(3, Math.round(d/.6)), sh = d/n;
        for (let i = 0; i < n; i++) g.add(box(w, t, sh*.64, m, 0, yb, -d/2 + i*sh + sh*.32));
      }
      break;
    }
    case 'manhole': {
      // 井盖：铸铁圆盘（略高出地面 1cm，边缘一圈压边）
      const r = Math.min(w, d)/2;
      const iron = mat(c || '#4a4d51', { metalness: .55, roughness: .55 });
      g.add(cyl(r, r, .012, iron, 0, .006, 0, 24));
      g.add(cyl(r*.82, r*.82, .014, mat('#3b3e42', { metalness: .6, roughness: .5 }), 0, .012, 0, 24));
      g.add(cyl(r*.26, r*.26, .016, mat('#2f3236', { metalness: .6, roughness: .5 }), 0, .014, 0, 18));
      break;
    }
    case 'streetlamp': {
      const h = 4.3, poleM = mat('#4b5057', { metalness: .6, roughness: .4 });
      g.add(cyl(.17, .21, .3, mat('#6a7076', { roughness: .7 }), 0, 0, 0, 20));          // 灯座
      g.add(cyl(.07, .085, h, poleM, 0, .28, 0, 16));                                    // 灯杆
      g.add(tube([[0, h, .02], [0, h + .16, .3], [0, h + .1, .62]], .042, poleM, 20));   // 弯灯臂
      g.add(cyl(.09, .27, .16, mat('#7c8288', { metalness: .45, roughness: .45 }), 0, h + .04, .62, 22));  // 灯罩
      g.add(cyl(.21, .21, .02, glowMat('#fffbe8', '#ffe9a8', .95), 0, h + .025, .62, 22));                 // 发光面
      g.add(cyl(.05, .05, .05, mat('#3d4249', { roughness: .6 }), 0, h + .2, .62, 12));                    // 灯顶帽
      break;
    }
    case 'shrub': {
      const r = Math.min(w, d)/2, H = r * 2.6;
      const leaf = [mat('#4c7a3c', { roughness: .85 }), mat('#5d8f46', { roughness: .85 }), mat('#6da353', { roughness: .85 })];
      g.add(cyl(r * .5, r * .72, H * .12, mat('#5a4a3a', { roughness: 1 }), 0, 0, 0, 12));
      const N = 10;
      for (let i = 0; i < N; i++){
        const a = i * 2.399 + R(), rr = r * (.24 + R() * .34), yy = H * (.22 + R() * .5);
        g.add(blob(rr, rr * .82, rr, leaf[i % 3], Math.cos(a) * r * .4, yy, Math.sin(a) * r * .4, 12));
      }
      break;
    }
    case 'camphor': {
      /* 樟树：板根 + 树干 + 三五主枝 + 分层大冠 */
      const r = Math.min(w, d)/2, trunkH = 2.4 + r * .45;
      const bark = mat('#6b5442', { roughness: .95 }), rootM = mat('#4e4136', { roughness: 1 });
      const leaf = [mat('#3f6b34', { roughness: .85 }), mat('#4e7c3f', { roughness: .85 }), mat('#5f8f4a', { roughness: .85 })];
      g.add(cyl(.2, .34, .45, rootM, 0, 0, 0, 14));
      g.add(cyl(.11, .17, trunkH, bark, 0, .4, 0, 14));
      for (let i = 0; i < 4; i++){
        const a = i * 1.57 + .5, tx = Math.cos(a) * r * .34, tz = Math.sin(a) * r * .34;
        g.add(rod([0, trunkH * .72, 0], [tx, trunkH + .45, tz], .075, bark, .035));
        g.add(blob(r * .34, r * .22, r * .34, leaf[i % 3], tx, trunkH + .55, tz, 14));
      }
      // 冠层：三层，越往上越小
      g.add(blob(r * .78, r * .34, r * .78, leaf[0], 0, trunkH + .95, 0, 18));
      g.add(blob(r * .62, r * .3, r * .62, leaf[1], r * .16, trunkH + 1.42, -r * .12, 18));
      g.add(blob(r * .42, r * .22, r * .42, leaf[2], -r * .12, trunkH + 1.8, r * .1, 16));
      break;
    }

    /* ---------- 户外 · 运动 ---------- */
    case 'tennis': {
      /* 网球场：缓冲带面层 + 比赛区 + 全套白线 + 球网 + 围网 */
      const white = mat('#f4f7f4', { roughness: .85 });
      const L = Math.min(w*.68, 23.77), Wd = Math.min(d*.62, L/2.167), k = L/23.77;
      const ins = 1.37*k, sl = 6.4*k, tw = .05, y = .044;
      g.add(rbox(w, .03, d, mat(c, { roughness: .95 }), 0, 0, 0, .12));
      g.add(rbox(L, .012, Wd, mat(darker(c, .9), { roughness: .95 }), 0, .03, 0, .04));
      flatRect(g, -L/2, -Wd/2, L/2, Wd/2, tw, white, y);
      flatLine(g, -L/2, -Wd/2 + ins, L/2, -Wd/2 + ins, tw, white, y);
      flatLine(g, -L/2, Wd/2 - ins, L/2, Wd/2 - ins, tw, white, y);
      flatLine(g, -L/2 + sl, -Wd/2 + ins, -L/2 + sl, Wd/2 - ins, tw, white, y);
      flatLine(g, L/2 - sl, -Wd/2 + ins, L/2 - sl, Wd/2 - ins, tw, white, y);
      flatLine(g, -L/2 + sl, 0, L/2 - sl, 0, tw, white, y);
      const netW = Wd + 1.8, netM = mat('#eef2ee', { transparent: true, opacity: .3, side: THREE.DoubleSide });
      g.add(box(.02, .92, netW, netM, 0, .045, 0), box(.05, .06, netW, white, 0, .97, 0));
      [-1, 1].forEach(sg => g.add(cyl(.045, .045, 1.07, metal(), 0, .045, sg*netW/2, 12)));
      courtFence(g, w, d, 3.4, metal());
      break;
    }
    case 'basketball': {
      /* 篮球场：全场 + 中圈 + 三秒区 / 罚球圈 + 三分弧 + 两副篮架 + 围网 */
      const white = mat('#f4f7f4', { roughness: .85 });
      const L = Math.min(w*.88, 28), Wd = Math.min(d*.8, L*15/28), k = L/28, tw = .05, y = .044;
      g.add(rbox(w, .03, d, mat(c, { roughness: .95 }), 0, 0, 0, .12));
      g.add(rbox(L, .012, Wd, mat(darker(c, .88), { roughness: .95 }), 0, .03, 0, .03));
      flatRect(g, -L/2, -Wd/2, L/2, Wd/2, tw, white, y);
      flatLine(g, 0, -Wd/2, 0, Wd/2, tw, white, y);
      flatArc(g, 0, 0, 1.8*k, 0, Math.PI*2, tw, white, y);
      [-1, 1].forEach(sg => {
        const laneL = 5.8*k, laneW = 4.9*k, ftR = 1.8*k;
        const bx = sg < 0 ? -L/2 : L/2 - laneL;
        flatRect(g, bx, -laneW/2, bx + laneL, laneW/2, tw, white, y);
        flatArc(g, bx + (sg < 0 ? laneL : 0), 0, ftR,
          sg < 0 ? -Math.PI/2 : Math.PI/2, sg < 0 ? Math.PI/2 : Math.PI*1.5, tw, white, y);
        const hx = sg*(L/2 - 1.575*k);
        flatArc(g, hx, 0, 6.75*k, sg < 0 ? -1.18 : Math.PI - 1.18, sg < 0 ? 1.18 : Math.PI + 1.18, tw, white, y);
        // 篮架：立柱 + 悬臂 + 篮板 + 篮圈 + 网
        const px = sg*(L/2 + .8), bx2 = sg*(L/2 - 1.2*k);
        g.add(cyl(.11, .13, 3.05, metal(), px, 0, 0, 14));
        g.add(rod([px, 3.05, 0], [bx2, 3.05, 0], .07, metal()));
        g.add(box(.05, .9, 1.8, mat('#e9eef0', { roughness: .5 }), bx2, 2.9, 0));
        g.add(ring(.23, .02, mat('#e0662f', { metalness: .5, roughness: .4 }), hx, 3.05, 0));
        g.add(cyl(.23, .12, .42, mat('#e8eef0', { transparent: true, opacity: .35 }), hx, 2.62, 0, 12));
      });
      courtFence(g, w, d, 3.6, metal());
      break;
    }
    case 'football': {
      /* 足球场：深浅草皮条纹 + 全套白线 + 球门（含球网） */
      const white = mat('#f4f7f4', { roughness: .85 });
      const L = Math.min(w*.9, 40), Wd = Math.min(d*.82, L*.52), k = L/40, tw = .06, y = .044;
      g.add(rbox(w, .03, d, mat(darker(c, .84), { roughness: .98 }), 0, 0, 0, .15));
      const n = 8, sw = L/n;
      for (let i = 0; i < n; i++)
        g.add(box(sw, .012, Wd, mat(i%2 ? lighter(c, .08) : c, { roughness: .95 }), -L/2 + sw*(i + .5), .03, 0));
      flatRect(g, -L/2, -Wd/2, L/2, Wd/2, tw, white, y);
      flatLine(g, 0, -Wd/2, 0, Wd/2, tw, white, y);
      flatArc(g, 0, 0, 4*k, 0, Math.PI*2, tw, white, y);
      [-1, 1].forEach(sg => {
        const gd = 3.4*k, gw = 12*k, gx = sg < 0 ? -L/2 : L/2 - gd;
        flatRect(g, gx, -gw/2, gx + gd, gw/2, tw, white, y);
        const gx0 = sg < 0 ? -L/2 : L/2, gx1 = gx0 + sg*1.3*k, goalW = 3*k, goalH = 2*k;
        [-1, 1].forEach(s => g.add(cyl(.06, .06, goalH, mat('#f2f4f5', { roughness: .4 }), gx0, 0, s*goalW/2, 12)));
        g.add(rod([gx0, goalH, -goalW/2], [gx0, goalH, goalW/2], .06, mat('#f2f4f5', { roughness: .4 })));
        const net = box(Math.abs(gx1 - gx0), goalH, goalW, mat('#e8eef0', { transparent: true, opacity: .22 }), (gx0 + gx1)/2, 0, 0);
        net.castShadow = false; g.add(net);
      });
      courtFence(g, w, d, 3, metal());
      break;
    }
    case 'badminton': {
      /* 羽毛球场：地胶 + 全套边线 + 球网 */
      const white = mat('#f4f7f4', { roughness: .85 });
      const L = Math.min(w*.78, 13.4), Wd = Math.min(d*.6, L*.455), k = L/13.4, tw = .04, y = .044;
      g.add(rbox(w, .03, d, mat(c, { roughness: .95 }), 0, 0, 0, .12));
      g.add(rbox(L, .012, Wd, mat(darker(c, .9), { roughness: .95 }), 0, .03, 0, .03));
      const ins = .46*k;
      flatRect(g, -L/2, -Wd/2, L/2, Wd/2, tw, white, y);
      flatLine(g, -L/2, -Wd/2 + ins, L/2, -Wd/2 + ins, tw, white, y);
      flatLine(g, -L/2, Wd/2 - ins, L/2, Wd/2 - ins, tw, white, y);
      flatLine(g, -L/2 + 1.98*k, -Wd/2, -L/2 + 1.98*k, Wd/2, tw, white, y);
      flatLine(g, L/2 - 1.98*k, -Wd/2, L/2 - 1.98*k, Wd/2, tw, white, y);
      flatLine(g, -L/2 + .76*k, -Wd/2 + ins, -L/2 + .76*k, Wd/2 - ins, tw, white, y);
      flatLine(g, L/2 - .76*k, -Wd/2 + ins, L/2 - .76*k, Wd/2 - ins, tw, white, y);
      flatLine(g, -L/2 + 1.98*k, 0, L/2 - 1.98*k, 0, tw, white, y);
      const netW = Wd + .9, netM = mat('#eef2ee', { transparent: true, opacity: .34, side: THREE.DoubleSide });
      g.add(box(.02, 1.5, netW, netM, 0, .05, 0), box(.04, .05, netW, white, 0, 1.55, 0));
      [-1, 1].forEach(sg => g.add(cyl(.04, .04, 1.6, metal(), 0, .04, sg*netW/2, 12)));
      break;
    }
    case 'pingpong': {
      /* 乒乓球场：蓝色地胶 + 两张球台 */
      const white = mat('#f4f7f4', { roughness: .85 });
      g.add(rbox(w, .02, d, mat(c, { roughness: .92 }), 0, 0, 0, .1));
      flatRect(g, -w/2 + .4, -d/2 + .4, w/2 - .4, d/2 - .4, .05, white, .03);
      const TL = Math.min(2.74, w*.36), TW = Math.min(1.525, d*.32);
      const rows = (d*.62) > TW*2 ? 2 : 1;
      const top = mat('#2f6f8f', { roughness: .35 }), legM = metal();
      for (let r2 = 0; r2 < rows; r2++){
        const cz = rows === 1 ? 0 : (r2 ? d*.24 : -d*.24);
        g.add(rbox(TL, .04, TW, top, 0, .74, cz, .01));
        flatRect(g, -TL/2, cz - TW/2, TL/2, cz + TW/2, .03, white, .785);
        g.add(box(.02, .14, TW, mat('#e8eef0', { transparent: true, opacity: .5 }), 0, .78, cz));
        g.add(box(.12, .74, .05, legM, -TL*.34, 0, cz - TW*.32),
              box(.12, .74, .05, legM, TL*.34, 0, cz - TW*.32),
              box(.12, .74, .05, legM, -TL*.34, 0, cz + TW*.32),
              box(.12, .74, .05, legM, TL*.34, 0, cz + TW*.32));
      }
      break;
    }
    case 'track': {
      /* 塑胶跑道：红色道面 + 分道线 + 起终点线 */
      const n = 4, lw = d/n;
      g.add(rbox(w, .03, d, mat(c, { roughness: .9 }), 0, 0, 0, .06));
      const white = mat('#f4f7f4', { roughness: .85 });
      for (let i = 1; i < n; i++) flatLine(g, -w/2, -d/2 + lw*i, w/2, -d/2 + lw*i, .05, white, .044);
      flatLine(g, -w/2 + .6, -d/2, -w/2 + .6, d/2, .08, white, .044);
      flatLine(g, w/2 - .6, -d/2, w/2 - .6, d/2, .08, white, .044);
      break;
    }
    case 'outgym': {
      /* 户外健身区：橡胶地垫 + 椭圆机 / 单杠 / 扭腰器 */
      const railM = mat('#5d666d', { metalness: .6, roughness: .4 }), padM = mat('#c98d5f', { roughness: .95 });
      g.add(rbox(w, .02, d, mat(c, { roughness: .95 }), 0, 0, 0, .1));
      g.add(rbox(w - .3, .012, d - .3, padM, 0, .02, 0, .12));
      const ex = -w*.28, ez = 0, rr = Math.min(w, d)*.11;
      [-1, 1].forEach(sg => {
        g.add(cyl(rr, rr, .05, railM, ex, .03, ez + sg*d*.18, 18));
        g.add(rod([ex, .05, ez + sg*d*.18], [ex + w*.06, 1.1, ez + sg*d*.18], .04, railM));
      });
      g.add(rod([ex - w*.04, 1.1, ez - d*.18], [ex - w*.04, 1.1, ez + d*.18], .04, railM));
      const bx = w*.12;
      [-1, 1].forEach(sg => g.add(rod([bx, 0, sg*d*.16], [bx, 2.1, sg*d*.16], .05, railM)));
      g.add(rod([bx, 2.1, -d*.16], [bx, 2.1, d*.16], .035, railM));
      const tx = w*.34;
      g.add(cyl(.3, .34, .12, mat('#4a5158', { roughness: .6 }), tx, 0, 0, 20));
      g.add(rod([tx, .12, 0], [tx, 1.2, 0], .05, railM), rod([tx, 1.2, 0], [tx + .3, 1.2, 0], .035, railM));
      break;
    }

    /* ---------- 户外 · 水景 ---------- */
    case 'pool': {
      /* 泳池：石材池沿（中空）+ 池底 + 水面 + 泳道线 + 台阶 + 不锈钢扶梯 */
      const stone = mat('#d9d2c6', { roughness: .55, metalness: .05 });
      const waterM = mat(c, { transparent: true, opacity: .72, roughness: .12, metalness: .15 });
      g.add(shell(w, d, .18, .35, .08, stone));
      const iw = w - .7, id = d - .7;
      g.add(box(iw, .02, id, mat(darker(c, .55), { roughness: .8 }), 0, .02, 0));
      g.add(box(iw, .01, id, waterM, 0, .12, 0));
      const white = mat('#ffffff', { roughness: .8 });
      for (let i = 1; i < 5; i++)
        flatLine(g, -iw/2 + .3, -id/2 + id*i/5, iw/2 - .3, -id/2 + id*i/5, .06, white, .036);
      for (let i = 0; i < 3; i++)
        g.add(box(.9, .04, id*.18, mat('#e8eef0', { roughness: .6 }), -iw/2 + .45, .02 + i*.04, -id*.16));
      [-1, 1].forEach(sg => {
        const lx = iw/2 - .45, lz = sg*id*.16;
        g.add(rod([lx - .15, .18, lz], [lx - .15, 1.02, lz], .03, chrome()),
              rod([lx + .15, .18, lz], [lx + .15, 1.02, lz], .03, chrome()),
              rod([lx - .15, 1.02, lz], [lx + .15, 1.02, lz], .03, chrome()));
      });
      break;
    }
    case 'fountain': {
      /* 喷泉花坛：环形花池 + 水面 + 中央水钵 + 水柱 + 四季花卉 */
      const R = Math.min(w, d)/2, stone = mat(c, { roughness: .6 });
      const waterM = mat('#8fd2e4', { transparent: true, opacity: .76, roughness: .1 });
      g.add(cyl(R, R, .04, mat(darker(c, .8), { roughness: .7 }), 0, 0, 0, 32));
      g.add(cyl(R, R, .32, stone, 0, .02, 0, 36));
      g.add(cyl(R - .12, R - .12, .02, waterM, 0, .3, 0, 32));
      g.add(ring(R - .06, .055, mat(lighter(c, .12), { roughness: .5 }), 0, .335, 0));
      g.add(cyl(R*.1, R*.16, .55, stone, 0, .3, 0, 20));
      g.add(lathe([[0, 0], [R*.34, 0], [R*.36, .08], [R*.3, .12], [R*.06, .14]], stone, 0, .84, 0, 32));
      const jetM = mat('#ffffff', { transparent: true, opacity: .5, emissive: '#cfeef8', emissiveIntensity: .4 });
      const jets = [];
      for (let i = 0; i < 8; i++){
        const a = i/8*Math.PI*2, jh = .5;
        const jet = new THREE.Group();
        jet.position.set(Math.cos(a)*R*.22, .32, Math.sin(a)*R*.22);
        jet.add(cyl(.012, .02, jh, jetM, 0, jh/2, 0, 6));
        jet.userData.fx = { kind: 'jet', phase: i*.8, speed: 2.4, base: 1 };
        g.add(jet);
        jets.push(jet);
      }
      const cj = new THREE.Group();
      cj.position.set(0, .96, 0);
      cj.add(cyl(.02, .03, .62, jetM, 0, .31, 0, 8));
      cj.userData.fx = { kind: 'jet', phase: .3, speed: 2.9, base: 1 };
      g.add(cj);
      jets.push(cj);
      g.userData.animKeep = jets;
      const flowers = ['#d96b8a', '#e0a94a', '#8fbf7a', '#c98ad0'];
      for (let i = 0; i < 16; i++){
        const a = i/16*Math.PI*2, rr = R*(i%2 ? .6 : .68);
        g.add(blob(R*.09, R*.05, R*.09, mat(flowers[i%4], { roughness: .9 }),
          Math.cos(a)*rr, .38, Math.sin(a)*rr, 10));
      }
      break;
    }

    /* ---------- 户外 · 儿童 ---------- */
    case 'playground': {
      /* 儿童乐园：彩色软垫 + 游乐塔（顶棚/栏杆）+ 滑梯 + 秋千 + 沙池 + 摇马 */
      const wood = woodM('#c98d5f'), postM = mat('#5d666d', { metalness: .4, roughness: .5 });
      g.add(rbox(w, .04, d, mat(c, { roughness: .95 }), 0, 0, 0, .35));
      g.add(rbox(w*.36, .012, d*.34, mat('#7fb6d9', { roughness: .9 }), -w*.26, .04, -d*.2, .16));
      g.add(rbox(w*.28, .012, d*.3, mat('#8fbf7a', { roughness: .9 }), w*.2, .04, d*.22, .14));
      // 游乐塔
      const tw = w*.2, td = d*.24, tx = -w*.24, tz = -d*.18, ph = 1.5;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) =>
        g.add(cyl(.06, .06, ph, postM, tx + a*tw/2, .04, tz + b*td/2, 10)));
      g.add(box(tw, .08, td, wood, tx, ph - .08, tz));
      const roof = cyl(.02, tw*.8, .7, mat('#c4553f', { roughness: .6 }), tx, ph, tz, 4);
      roof.rotation.y = Math.PI/4; g.add(roof);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([a, b]) =>
        g.add(box(a ? .03 : tw, .5, b ? .03 : td, metal(), tx + a*tw/2, ph - .58, tz + b*td/2)));
      // 滑梯
      const sx0 = tx + tw/2, sx1 = tx + tw*1.8, sy = ph - .35, sz = tz + td*.12;
      const len = Math.hypot(sx1 - sx0, sy - .1), ang = Math.atan2(sy - .1, sx1 - sx0);
      const slide = rbox(len, .06, td*.5, mat('#e9b949', { roughness: .5 }), (sx0 + sx1)/2, (sy + .1)/2, sz, .02);
      slide.rotation.z = ang; g.add(slide);
      [-1, 1].forEach(sg => {
        const rail = box(len, .06, .05, mat('#e9b949', { roughness: .5 }), (sx0 + sx1)/2, (sy + .1)/2 + .12, sz + sg*td*.25);
        rail.rotation.z = ang; g.add(rail);
      });
      // 秋千（A 字架 + 吊座）
      const swx = w*.24, swz = -d*.2, sh = 2.2;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) =>
        g.add(rod([swx + a*w*.06, 0, swz + b*d*.06], [swx, sh, swz], .035, metal())));
      g.add(rod([swx - w*.07, sh, swz], [swx + w*.07, sh, swz], .03, metal()));
      [-1, 1].forEach(sg => {
        g.add(rod([swx + sg*.3, sh, swz], [swx + sg*.3, .62, swz], .009, metal()),
              box(.4, .05, .16, mat('#c4553f', { roughness: .6 }), swx + sg*.3, .58, swz));
      });
      // 沙池 + 摇马
      g.add(cyl(Math.min(w, d)*.13, Math.min(w, d)*.13, .02, mat('#e8d5a8', { roughness: .95 }), w*.28, .04, d*.26, 24));
      g.add(blob(.16, .1, .18, mat('#d96b5a', { roughness: .6 }), -w*.02, .16, d*.22, 12));
      break;
    }
    case 'sandpit': {
      /* 儿童沙池：木框 + 沙面 + 沙堆 + 水桶 / 铲子 */
      const wood = woodM('#b98a5a');
      g.add(box(w, .2, .1, wood, 0, 0, -d/2 + .05), box(w, .2, .1, wood, 0, 0, d/2 - .05),
            box(.1, .2, d - .2, wood, -w/2 + .05, 0, 0), box(.1, .2, d - .2, wood, w/2 - .05, 0, 0));
      g.add(box(w - .2, .12, d - .2, mat(c, { roughness: 1 }), 0, 0, 0));
      g.add(blob(w*.16, .05, d*.16, mat(darker(c, .94), { roughness: 1 }), -w*.15, .13, -d*.1, 12));
      g.add(cyl(.14, .12, .18, mat('#d96b5a', { roughness: .6 }), w*.22, .12, d*.16, 14));
      g.add(rod([w*.14, .14, -d*.2], [w*.28, .16, -d*.08], .02, mat('#e8b84a', { roughness: .5 })));
      break;
    }

    /* ---------- 户外 · 景观 ---------- */
    case 'pavilion': {
      /* 景观亭：台基 + 四柱 + 额枋 + 四坡屋顶 + 宝顶 + 坐凳 */
      const stone = mat('#e9e2d4', { roughness: .6 }), wood = woodM(c), beam = woodM(darker(c, .85));
      g.add(rbox(w, .1, d, stone, 0, 0, 0, .08));
      const cx2 = w/2 - .38, cz2 = d/2 - .38;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) =>
        g.add(cyl(.1, .12, 2.9, wood, a*cx2, .1, b*cz2, 12)));
      g.add(box(w - .5, .16, .14, beam, 0, 2.84, -cz2), box(w - .5, .16, .14, beam, 0, 2.84, cz2),
            box(.14, .16, d - .5, beam, -cx2, 2.84, 0), box(.14, .16, d - .5, beam, cx2, 2.84, 0));
      g.add(box(w*.98, .08, d*.98, beam, 0, 2.98, 0));
      const roofR = Math.min(w, d)*.74;
      const roof = cyl(.03, roofR, 1.05, mat(darker(c, .7), { roughness: .55 }), 0, 3.06, 0, 4);
      roof.rotation.y = Math.PI/4; g.add(roof);
      g.add(cyl(.05, .08, .3, mat('#c9a24a', { metalness: .5, roughness: .35 }), 0, 4.1, 0, 12),
            blob(.1, .1, .1, mat('#c9a24a', { metalness: .5, roughness: .35 }), 0, 4.46, 0, 12));
      // 美人靠 / 坐凳
      [-1, 1].forEach(sg => g.add(box(w*.62, .08, .3, wood, 0, .5, sg*d*.24),
        box(w*.62, .45, .05, wood, 0, .58, sg*(d*.24 + .14))));
      break;
    }
    case 'pergola': {
      /* 景观廊架：立柱 + 主梁 + 顶部格栅 + 藤蔓 */
      const wood = woodM(c), dark = woodM(darker(c, .8));
      g.add(rbox(w, .05, d, mat('#e5ddcd', { roughness: .8 }), 0, 0, 0, .05));
      const px = w*.08, pz = d*.14;
      for (let i = 0; i <= 2; i++) [-1, 1].forEach(sg =>
        g.add(box(.14, 2.5, .14, wood, -w/2 + px + (w - 2*px)*i/2, 0, sg*(d/2 - pz))));
      [-1, 1].forEach(sg => g.add(box(w - 2*px + .3, .14, .16, dark, 0, 2.45, sg*(d/2 - pz))));
      const n = Math.max(5, Math.round(w/.55));
      for (let i = 0; i < n; i++)
        g.add(box(.06, .1, d, wood, -w/2 + px + (w - 2*px)*i/(n - 1), 2.58, 0));
      [[-w/2 + px, -d/2 + pz], [w/2 - px, -d/2 + pz], [-w/2 + px, d/2 - pz], [w/2 - px, d/2 - pz]].forEach(([fx, fz]) => {
        for (let i = 0; i < 4; i++)
          g.add(blob(.28, .2, .28, mat(i%2 ? '#6f9b57' : '#7fa86a', { roughness: .9 }),
            fx + Math.cos(i*1.6)*.3, 2.5 + (i%2)*.18, fz + Math.sin(i*1.6)*.3, 10));
      });
      break;
    }
    case 'planter': {
      /* 树池花钵：石框 + 种植土 + 灌木球 + 点缀花 */
      const stone = mat(c, { roughness: .7 }), tw = Math.min(w, d)*.12;
      [[0, -d/2 + tw/2, w], [0, d/2 - tw/2, w], [-w/2 + tw/2, 0, 0], [w/2 - tw/2, 0, 0]].forEach(([px, pz, pw]) =>
        g.add(box(pw || tw, .45, pw ? tw : d, stone, px, 0, pz)));
      g.add(box(w - 2*tw, .06, d - 2*tw, mat('#5d4a3a', { roughness: 1 }), 0, .36, 0));
      const R = Math.min(w, d)/2;
      g.add(blob(R*.42, R*.3, R*.42, mat('#7fa86a', { roughness: .9 }), 0, .58, 0, 14));
      [[-.35, -.25], [.32, .22], [-.2, .34]].forEach(([dx, dz], i) =>
        g.add(blob(R*.22, R*.17, R*.22, mat(i%2 ? '#8fbf7a' : '#6f9b57', { roughness: .9 }), dx*R, .56, dz*R, 12)));
      for (let i = 0; i < 4; i++)
        g.add(blob(R*.07, R*.05, R*.07, mat(['#d96b8a', '#e0a94a'][i%2], { roughness: .9 }),
          Math.cos(i*1.7)*R*.55, .52, Math.sin(i*1.7)*R*.55, 8));
      break;
    }
    case 'rock': {
      /* 景观石：几块叠置的天然石 + 草丛 */
      const R = Math.min(w, d)/2;
      const stone = [mat('#8c8f8a', { roughness: .95 }), mat('#9aa09b', { roughness: .95 }), mat('#767b78', { roughness: .95 })];
      g.add(blob(R*.72, R*.52, R*.58, stone[0], 0, R*.5, 0, 14));
      g.add(blob(R*.46, R*.36, R*.44, stone[1], R*.3, R*.34, -R*.15, 12));
      g.add(blob(R*.34, R*.26, R*.32, stone[2], -R*.4, R*.24, R*.22, 12));
      for (let i = 0; i < 5; i++){
        const a = i*1.3 + .4;
        g.add(blob(.1, .16, .1, mat('#8fbf7a', { roughness: .9 }), Math.cos(a)*R*.9, .16, Math.sin(a)*R*.9, 8));
      }
      break;
    }
    case 'lounge': {
      /* 泳池躺椅：框架 + 坐垫 + 倾斜靠背 + 扶手 */
      const frame = metal(), pad = fabric(c);
      g.add(rbox(w*.9, .08, d*.8, pad, 0, .34, 0, .03));
      g.add(box(.05, .34, .05, frame, w/2 - .12, 0, -d*.3), box(.05, .34, .05, frame, w/2 - .12, 0, d*.3),
            box(.05, .34, .05, frame, -w/2 + .12, 0, -d*.3), box(.05, .34, .05, frame, -w/2 + .12, 0, d*.3));
      const back = rbox(w*.34, .08, d*.76, pad, -w*.3, .38, 0, .03);
      back.rotation.z = -.9; g.add(back);
      g.add(box(w*.9, .03, d*.84, frame, 0, .3, 0));
      break;
    }
    case 'parasol': {
      /* 遮阳伞：伞座 + 伞杆 + 八瓣伞面 + 伞骨 */
      const R = Math.min(w, d)/2, fab = fabric(c);
      g.add(cyl(R*.22, R*.26, .1, mat('#8d8a84', { roughness: .7 }), 0, 0, 0, 16));
      g.add(cyl(.035, .04, 2.3, metal(), 0, 0, 0, 12));
      g.add(cyl(.06, R, .36, fab, 0, 2.2, 0, 8));
      for (let i = 0; i < 8; i++){
        const a = i/8*Math.PI*2;
        g.add(rod([0, 2.52, 0], [Math.cos(a)*R*.97, 2.22, Math.sin(a)*R*.97], .015, mat('#d8d2c6', { roughness: .6 })));
      }
      g.add(blob(.05, .05, .05, metal(), 0, 2.58, 0, 8));
      break;
    }

    /* ---------- 沙盘 · 建筑 ---------- */
    case 'tower18': {
      towerModel(g, w, d, 18, c, { balcony: true });
      break;
    }
    case 'tower26': {
      towerModel(g, w, d, 26, c, { balcony: true });
      break;
    }
    case 'tower33': {
      towerModel(g, w, d, 33, c, { balcony: true });
      break;
    }
    case 'midrise11': {
      towerModel(g, w, d, 11, c, { balcony: true, fh: 2.95 });
      break;
    }
    case 'midrise6': {
      towerModel(g, w, d, 6, c, { balcony: true, fh: 3, roof: 'hip', roofH: 3.4 });
      break;
    }
    case 'townhouse': {
      towerModel(g, w, d, 3, c, { balcony: true, fh: 3.1, bay: 3, roof: 'hip', roofH: 2.6 });
      // 车库门与入户门廊
      const gd = mat('#3b3f44', { roughness: .6 }), gtrim = mat('#e6e0d4', { roughness: .6 });
      g.add(box(w*.28, 2.3, .1, gd, -w*.23, .1, d/2 + .03));
      for (let i = 1; i < 4; i++) g.add(box(w*.28, .04, .02, gtrim, -w*.23, .1 + i*.57, d/2 + .09));
      g.add(box(w*.22, .14, 1.4, gtrim, w*.22, 2.6, d/2 + .7));
      break;
    }
    case 'villa': {
      /* 独栋别墅：主楼 + 侧翼 + 四坡屋顶 + 门廊 + 车库 */
      const paint = mat(c, { roughness: .8 }), trim = mat(lighter(c, .5), { roughness: .6 });
      const roofM = mat(darker(c, .55), { roughness: .7, side: THREE.DoubleSide });
      const glass = mat('#7fa7bd', { metalness: .4, roughness: .12, transparent: true, opacity: .72 });
      const mainH = 6.6;
      g.add(rbox(w*.8, mainH, d*.62, paint, -w*.04, .3, -d*.1, .08));
      g.add(rbox(w*.32, 3.8, d*.46, paint, w*.26, .3, d*.1, .06));
      for (let f = 0; f < 2; f++) for (let i = 0; i < 4; i++)
        g.add(box(w*.1, 1.5, .06, glass, -w*.32 + i*w*.18, 1.3 + f*3.3, d*.21 + .01));
      for (let i = 0; i < 3; i++)
        g.add(box(.06, 1.2, d*.1, glass, w*.42 + .01, 1.3, -d*.24 + i*d*.16));
      g.add(box(w*.84, .18, d*.66, trim, -w*.04, mainH + .28, -d*.1));
      g.add(pyramidRoof(w*.88, d*.7, 2.9, roofM, -w*.04, mainH + .46));
      g.add(pyramidRoof(w*.38, d*.52, 2.2, roofM, w*.26, 4.1));
      g.add(box(.5, .5, .5, roofM, -w*.04, mainH + 3.36, -d*.1));
      // 门廊
      g.add(box(w*.26, .16, 1.6, trim, w*.04, 3.2, d*.24));
      [-1, 1].forEach(sg => g.add(cyl(.11, .11, 3.2, trim, w*.04 + sg*w*.09, 0, d*.3, 12)));
      // 车库门
      g.add(box(w*.24, 2.3, .1, mat('#3b3f44', { roughness: .6 }), w*.26, .1, d*.33));
      break;
    }
    case 'podium': {
      /* 商业裙楼：两层退台 + 一层玻璃店面 + 店招 + 雨棚 + 屋顶栏板 */
      const h1 = 4.2, h2 = 3.6;
      const glass = mat('#5f8fa8', { metalness: .5, roughness: .1, transparent: true, opacity: .68 });
      const stone = mat(c, { roughness: .55 }), dark = mat('#2f3338', { roughness: .5 });
      const trim = mat(lighter(c, .35), { roughness: .5 });
      g.add(rbox(w, h1, d, stone, 0, 0, 0, .08));
      g.add(rbox(w*.94, h2, d*.9, mat(lighter(c, .18), { roughness: .65 }), 0, h1, -d*.05, .08));
      const n = Math.max(3, Math.round(w/8)), sw = w/n;
      for (let i = 0; i < n; i++){
        const px = -w/2 + sw*(i + .5);
        g.add(box(sw*.72, 3.1, .08, glass, px, .35, d/2 + .02));                    // 一层橱窗
        g.add(box(sw*.8, .62, .16, dark, px, 3.42, d/2 + .1));                      // 店招底板
        g.add(box(sw*.64, .34, .02, mat('#f2f6f8', { roughness: .5, emissive: '#dfeefa', emissiveIntensity: .35 }),
          px, 3.56, d/2 + .19));                                                    // 发光店名
        g.add(box(sw*.7, .06, .05, chrome(), px, 2.05, d/2 + .04));                 // 门头横档
      }
      g.add(box(w + .6, .16, 1.8, trim, 0, 3.95, d/2 + .9));                       // 骑楼雨棚
      const np = Math.max(3, Math.round(w/10));
      for (let i = 0; i <= np; i++)
        g.add(cyl(.1, .1, 3.95, trim, -w/2 + .4 + (w - .8)*i/np, 0, d/2 + 1.6, 10));
      // 二层窗带（沿退台前脸）
      const nw = Math.max(4, Math.round(w/8));
      for (let i = 0; i < nw; i++)
        g.add(box(w*.06, 1.6, .06, glass, -w/2 + w*(i + .5)/nw, h1 + .9, d*.4 + .01));
      // 屋顶栏板 + 设备
      g.add(box(w*.94, .7, .12, trim, 0, h1 + h2, -d*.5), box(w*.94, .7, .12, trim, 0, h1 + h2, d*.35));
      [[-.4, .0], [.1, .1]].forEach(([fx, fz]) =>
        g.add(box(w*.1, 1.2, d*.14, mat('#b9c0c5', { metalness: .4, roughness: .5 }), fx*w, h1 + h2, fz*d)));
      break;
    }
    case 'kindergarten': {
      /* 幼儿园：三层彩色体量 + 活动场地（软垫 / 滑梯 / 沙池） + 围栏 */
      const bw = w*.58, paint = mat(c, { roughness: .8 }), trim = mat('#f6f0e2', { roughness: .6 });
      const glass = mat('#8fb8c8', { metalness: .35, roughness: .15, transparent: true, opacity: .7 });
      const bg = new THREE.Group();
      bg.position.set(-w/2 + bw/2 + .4, 0, 0);
      g.add(bg);
      bg.add(rbox(bw, 11.2, d*.82, paint, 0, 0, 0, .1));
      [2.2, 5.2, 8.2].forEach((y, i) => bg.add(box(bw*.98, .55, d*.84,
        mat(['#e06b5a', '#4f9d8a', '#e8b04a'][i], { roughness: .7 }), 0, y, 0)));
      facadeGrid(bg, bw*.98, d*.82, 3, 3.6, .6, glass, trim, { bay: 3, winH: .5 });
      bg.add(pyramidRoof(bw + .8, d*.9, 2.2, mat('#c4553f', { roughness: .7, side: THREE.DoubleSide }), 0, 11.2));
      // 活动场地
      const px = -w/2 + bw + w*.03, pw = w - bw - w*.08;
      g.add(rbox(pw, .03, d*.8, mat('#8fbf7a', { roughness: .95 }), px + pw/2, 0, 0, .2));
      const slide = rbox(pw*.5, .06, d*.16, mat('#e9b949', { roughness: .5 }), px + pw*.3, .9, -d*.1, .02);
      slide.rotation.z = .28; g.add(slide);
      g.add(cyl(pw*.13, pw*.13, .02, mat('#e8d5a8', { roughness: .95 }), px + pw*.45, .04, d*.2, 18));
      g.add(box(pw*.9, 1.1, .06, mat('#c9d3d8', { transparent: true, opacity: .3 }), px + pw/2, 0, d*.42));
      break;
    }

    /* ---------- 沙盘 · 配套 ---------- */
    case 'gate': {
      /* 小区大门：门柱 + 雨棚 + 岗亭 + 道闸 + 景墙 */
      const stone = mat(c, { roughness: .65 }), trim = mat(lighter(c, .45), { roughness: .6 });
      const glass = mat('#7fa7bd', { metalness: .35, roughness: .12, transparent: true, opacity: .7 });
      const pw = Math.min(w*.11, 2.4), ph = 4.6;
      [-1, 1].forEach(sg => {
        g.add(rbox(pw, ph, Math.min(d*.8, 3), stone, sg*(w/2 - pw/2), 0, 0, .06));
        g.add(box(pw*.8, .5, .5, mat('#c9a24a', { metalness: .5, roughness: .4 }), sg*(w/2 - pw/2), ph, 0));
      });
      g.add(box(w - 2*pw, .45, 3.2, trim, 0, ph - .45, 0));
      // 岗亭
      g.add(rbox(w*.16, 2.8, 2.6, stone, 0, 0, d*.12, .06));
      [-1, 1].forEach(sg => g.add(box(w*.15, 1.2, .06, glass, 0, 1, sg*d*.12 + .0)));
      g.add(box(w*.17, .16, 2.8, trim, 0, 2.8, d*.12));
      // 道闸（一进一出）
      [-1, 1].forEach(sg => {
        g.add(cyl(.09, .09, 1.1, metal(), sg*w*.22, 0, d*.02, 10));
        g.add(box(w*.18, .11, .11, mat('#e8e6e0', { roughness: .5 }), sg*w*.31, 1.02, d*.02));
        g.add(box(w*.03, .13, .13, mat('#c4553f', { roughness: .5 }), sg*w*.255, 1.01, d*.02));
      });
      // 可开启大门：左扇固定、右扇电动推拉（叠到左扇上，开口让出右半边）
      const leafM = mat('#3b4045', { metalness: .55, roughness: .45 });
      const leafW = Math.max(1.2, (w - 2*pw)/2 - .1);
      const makeLeaf = () => {
        const leaf = new THREE.Group();
        leaf.add(box(leafW, .1, .14, leafM, 0, 2.2, 0), box(leafW, .1, .14, leafM, 0, .12, 0));
        const n = 8;
        for (let k = 0; k <= n; k++)
          leaf.add(box(.06, 2.06, .09, leafM, -leafW/2 + leafW*k/n, .1, 0));
        return leaf;
      };
      const fixedLeaf = makeLeaf();
      fixedLeaf.position.set(-leafW/2, 0, 0);
      g.add(fixedLeaf);
      const slideLeaf = makeLeaf();
      const closed = leafW/2, open = -leafW/2;
      slideLeaf.position.set(closed, 0, 0);
      slideLeaf.userData.fx = { kind: 'gate', closed, open };
      g.add(slideLeaf);
      g.userData.animKeep = [slideLeaf];
      // 入口景墙 + 小区名
      g.add(box(w*.34, 1.6, .3, stone, 0, 0, -d*.42));
      g.add(box(w*.28, .8, .02, mat('#f2f4f5', { roughness: .5 }), 0, .45, -d*.42 + .16));
      break;
    }
    case 'evparking': {
      /* 充电车位：车位划线 + 挡轮器 + 充电桩 + 充电线 */
      const white = mat('#f4f5f6', { roughness: .9 });
      g.add(box(w, .02, d, mat(c, { roughness: .9 }), 0, 0, 0));
      flatLine(g, -w/2, -d/2, w/2, -d/2, .06, white, .03);
      flatLine(g, -w/2, -d/2, -w/2, d/2, .06, white, .03);
      flatLine(g, w/2, -d/2, w/2, d/2, .06, white, .03);
      g.add(box(w*.5, .1, .16, mat('#8d949c', { roughness: .8 }), 0, .02, d*.3));
      const dark = mat('#3b4045', { roughness: .5 }), green = mat('#3fc98a', { emissive: '#1f8f5e', emissiveIntensity: .5, roughness: .4 });
      g.add(rbox(.4, 1.35, .28, dark, w/2 - .55, .02, -d/2 + .5, .04));
      g.add(box(.22, .3, .02, green, w/2 - .55, .85, -d/2 + .37));
      g.add(rod([w/2 - .55, .8, -d/2 + .38], [w*.1, .12, d*.1], .018, mat('#24282c', { roughness: .7 })));
      break;
    }
    case 'parkingrow': {
      /* 车位组 ×4：四条分隔线 + 挡轮器 + 两个充电桩 */
      const n = 4, sw = w/n, white = mat('#f4f5f6', { roughness: .9 });
      g.add(box(w, .02, d, mat(c, { roughness: .9 }), 0, 0, 0));
      for (let i = 0; i <= n; i++)
        flatLine(g, -w/2 + sw*i, -d/2, -w/2 + sw*i, d/2, .06, white, .03);
      flatLine(g, -w/2, -d/2, w/2, -d/2, .06, white, .03);
      flatLine(g, -w/2, d/2, w/2, d/2, .06, white, .03);
      const dark = mat('#3b4045', { roughness: .5 }), green = mat('#3fc98a', { emissive: '#1f8f5e', emissiveIntensity: .5, roughness: .4 });
      for (let i = 0; i < n; i++){
        const cx = -w/2 + sw*(i + .5);
        g.add(box(sw*.5, .1, .16, mat('#8d949c', { roughness: .8 }), cx, .02, d*.3));
        if (i === 0 || i === n - 1){
          g.add(rbox(.36, 1.3, .26, dark, cx + sw*.3, .02, -d/2 + .5, .04));
          g.add(box(.2, .26, .02, green, cx + sw*.3, .82, -d/2 + .38));
        }
      }
      break;
    }

    /* ---------- 沙盘 · 景观 ---------- */
    case 'plaza': {
      /* 入口广场：双色铺装 + 中央水景 + 四角树池 + 庭院灯 */
      const stone = mat(c, { roughness: .75 }), light = mat(lighter(c, .35), { roughness: .8 });
      g.add(rbox(w, .05, d, stone, 0, 0, 0, .04));
      const n = 6;
      for (let i = 0; i < n; i++)
        g.add(box(w, .012, d/n, i%2 ? light : mat(darker(c, .92), { roughness: .8 }), 0, .05, -d/2 + d*(i + .5)/n));
      g.add(cyl(Math.min(w, d)*.16, Math.min(w, d)*.16, .4, mat('#cfc7b8', { roughness: .6 }), 0, .05, 0, 28));
      g.add(cyl(Math.min(w, d)*.13, Math.min(w, d)*.13, .02, mat('#7fc6dc', { metalness: .7, roughness: .08, transparent: true, opacity: .8 }), 0, .42, 0, 28));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
        const px = a*w*.36, pz = b*d*.34;
        g.add(box(1.6, .5, 1.6, stone, px, .05, pz), box(1.3, .1, 1.3, mat('#5d4a3a', { roughness: 1 }), px, .5, pz));
        g.add(blob(.8, .55, .8, mat('#6f9b57', { roughness: .9 }), px, .95, pz, 12));
        g.add(cyl(.09, .11, 1.0, metal(), px + 1.1, .05, pz, 10),
              cyl(.16, .13, .18, glowMat('#fffbe8', '#ffe9a8', .7), px + 1.1, 1.05, pz, 12));
      });
      break;
    }
    case 'mirrorpool': {
      /* 镜面水池：石材池沿 + 高反射水面 + 汀步 + 水下灯 */
      const stone = mat('#d9d2c6', { roughness: .55 });
      const water = mat(c, { metalness: .92, roughness: .06, transparent: true, opacity: .88 });
      const iw = w - .9, id = d - .9;
      g.add(box(w, .1, .28, stone, 0, 0, -d/2 + .14), box(w, .1, .28, stone, 0, 0, d/2 - .14),
            box(.28, .1, d, stone, -w/2 + .14, 0, 0), box(.28, .1, d, stone, w/2 - .14, 0, 0));
      g.add(box(iw, .02, id, water, 0, .03, 0));
      [[-w*.24, 0], [-w*.02, 0], [w*.2, 0]].forEach(([px, pz]) =>
        g.add(box(.84, .12, .52, mat('#c9c2b6', { roughness: .5 }), px, .02, pz)));
      for (let i = 0; i < 6; i++)
        g.add(cyl(.08, .08, .01, glowMat('#cdeffa', '#8fd8f0', .8),
          -w/2 + .9 + (w - 1.8)*i/5, .055, d/2 - .6, 10));
      break;
    }
    case 'cascade': {
      /* 跌水景墙：石墙 + 三层出水口 + 水幕 + 下游水池 + 水下灯 */
      const stone = mat(c, { roughness: .6 });
      const water = mat('#9fd6e4', { metalness: .4, roughness: .08, transparent: true, opacity: .7 });
      g.add(box(w, 2.4, .5, stone, 0, 0, -d*.28));
      [.6, 1.25, 1.9].forEach((y, i) =>
        g.add(box(w*.2, .06, .16, mat('#e8eef0', { roughness: .4 }), -w*.25 + i*w*.25, y, -d*.28 + .3)));
      g.add(box(w*.86, 2.1, .04, water, 0, .15, -d*.28 + .3));
      g.add(box(w, .38, d*.46, stone, 0, 0, d*.22));
      g.add(box(w - .6, .02, d*.38, water, 0, .34, d*.22));
      for (let i = 0; i < 4; i++)
        g.add(cyl(.07, .07, .01, glowMat('#dff6ff', '#9fdcf0', .8), -w/2 + .8 + (w - 1.6)*i/3, .37, d*.22, 8));
      break;
    }
    case 'lawn': {
      /* 草坪：草皮 + 修剪条纹 + 石材收边 */
      g.add(rbox(w, .04, d, mat(c, { roughness: 1 }), 0, 0, 0, .1));
      const n = 6;
      for (let i = 0; i < n; i += 2)
        g.add(box(w - .3, .01, (d - .3)/n, mat(lighter(c, .06), { roughness: 1 }), 0, .04, -d/2 + .15 + (d - .3)*(i + .5)/n));
      const curb = mat('#cfc7b8', { roughness: .7 });
      g.add(box(w, .1, .12, curb, 0, 0, -d/2 + .06), box(w, .1, .12, curb, 0, 0, d/2 - .06),
            box(.12, .1, d, curb, -w/2 + .06, 0, 0), box(.12, .1, d, curb, w/2 - .06, 0, 0));
      break;
    }
    case 'hedge': {
      /* 绿篱：种植土 + 修剪体 + 顶部起伏枝叶 */
      const soil = mat('#5d4a3a', { roughness: 1 });
      g.add(box(w, .12, d, soil, 0, 0, 0));
      g.add(rbox(w*.94, .95, d*.8, mat(c, { roughness: .95 }), 0, .1, 0, .18));
      const n = Math.max(4, Math.round(w/1.2));
      for (let i = 0; i < n; i++)
        g.add(blob(Math.min(w, d)*.4, .28, d*.4, mat(i%2 ? lighter(c, .08) : darker(c, .92), { roughness: .95 }),
          -w/2 + w*(i + .5)/n, 1.02, (i%2 ? .1 : -.1)*d, 10));
      break;
    }
    case 'ginkgo': {
      /* 银杏：塔形树冠，秋季金黄 */
      const R2 = Math.min(w, d)/2, bark = mat('#6b5442', { roughness: .95 });
      const leaf = [mat(c, { roughness: .85 }), mat(lighter(c, .18), { roughness: .85 }), mat(darker(c, .9), { roughness: .85 })];
      const th = 4 + R2*.5;
      g.add(cyl(.18, .28, .5, bark, 0, 0, 0, 12), cyl(.1, .16, th, bark, 0, .4, 0, 12));
      for (let i = 0; i < 7; i++){
        const t = i/6, rr = R2*(.7 - t*.42), yy = th*.75 + t*4.6;
        g.add(blob(rr, rr*.42, rr, leaf[i%3], 0, yy, 0, 14));
      }
      break;
    }
    case 'cherry': {
      /* 樱花：低矮舒展，粉色花团 */
      const R2 = Math.min(w, d)/2, bark = mat('#6b5442', { roughness: .95 });
      const leaf = [mat(c, { roughness: .9 }), mat(lighter(c, .16), { roughness: .9 }), mat(lighter(c, .3), { roughness: .9 })];
      const th = 2.2 + R2*.3;
      g.add(cyl(.16, .26, .5, bark, 0, 0, 0, 12), cyl(.09, .15, th, bark, 0, .4, 0, 12));
      for (let i = 0; i < 4; i++){
        const a = i*1.6 + .4, tx = Math.cos(a)*R2*.3, tz = Math.sin(a)*R2*.3;
        g.add(rod([0, th*.8, 0], [tx, th + .7, tz], .07, bark));
        g.add(blob(R2*.4, R2*.24, R2*.4, leaf[i%3], tx, th + .85, tz, 14));
      }
      g.add(blob(R2*.55, R2*.28, R2*.55, leaf[0], 0, th + 1.1, 0, 16));
      break;
    }
    case 'osmanthus': {
      /* 桂花：常绿球冠，暗绿有光泽 */
      const R2 = Math.min(w, d)/2, bark = mat('#5a4a3a', { roughness: .95 });
      const leaf = [mat(c, { roughness: .8 }), mat(lighter(c, .12), { roughness: .8 }), mat(darker(c, .88), { roughness: .8 })];
      const th = 2.0 + R2*.4;
      g.add(cyl(.16, .26, .45, bark, 0, 0, 0, 12), cyl(.09, .15, th, bark, 0, .35, 0, 12));
      for (let i = 0; i < 7; i++){
        const a = i*2.1, rr = R2*(.4 + (i%3)*.12);
        g.add(blob(rr, rr*.82, rr, leaf[i%3], Math.cos(a)*R2*.26, th + .5 + (i%2)*.35, Math.sin(a)*R2*.26, 14));
      }
      // 桂花点缀
      for (let i = 0; i < 6; i++){
        const a = i*1.9;
        g.add(blob(.06, .06, .06, mat('#e8c96a', { roughness: .8 }), Math.cos(a)*R2*.5, th + .7, Math.sin(a)*R2*.5, 8));
      }
      break;
    }

    /* ---------- 沙盘 · 城市 ---------- */
    case 'cityblock': {
      /* 周边建筑体量：三栋灰模 + 玻璃窗带 + 屋顶设备，用于渲染背景 */
      const base = mat('#c9c7c1', { roughness: .9 });
      const grey = [mat(c, { roughness: .85 }), mat(darker(c, .92), { roughness: .85 }), mat(lighter(c, .08), { roughness: .85 })];
      const glass = mat('#7d8b94', { metalness: .3, roughness: .3, transparent: true, opacity: .55 });
      g.add(rbox(w, .1, d, base, 0, 0, 0, .1));
      const blocks = [
        [-w*.24, -d*.12, w*.3, d*.5, 30],
        [w*.08, -d*.22, w*.26, d*.4, 45],
        [w*.3, d*.14, w*.24, d*.34, 22]
      ];
      const trim = mat(lighter(c, .2), { roughness: .7 });
      blocks.forEach(([px, pz, bw2, bd2, hh], idx) => {
        const bg = new THREE.Group();
        bg.position.set(px, .1, pz);
        g.add(bg);
        bg.add(rbox(bw2, hh, bd2, grey[idx], 0, 0, 0, .08));
        facadeGrid(bg, bw2, bd2, Math.round(hh/3), 3, 0, glass, trim, { bay: 4, winH: .4 });
        bg.add(box(bw2*.3, 2, bd2*.3, grey[idx], 0, hh, 0));
      });
      break;
    }

    /* ---------- 沙盘 · 地库 ---------- */
    case 'garageslab': {
      /* 地库顶板覆土：混凝土顶板 + 种植土 + 草坪 + 石材收边 + 通风井 + 灌木 */
      const conc = mat('#8d8a84', { roughness: .95 });
      const soil = mat('#6b5540', { roughness: 1 });
      const grass = mat(c, { roughness: 1 });
      const curb = mat('#cfc7b8', { roughness: .7 });
      g.add(box(w, .35, d, conc, 0, 0, 0));
      g.add(box(w - .24, 1.0, d - .24, soil, 0, .35, 0));
      g.add(box(w - .34, .06, d - .34, grass, 0, 1.35, 0));
      g.add(box(w, .5, .25, curb, 0, 0, -d/2 + .125), box(w, .5, .25, curb, 0, 0, d/2 - .125),
            box(.25, .5, d, curb, -w/2 + .125, 0, 0), box(.25, .5, d, curb, w/2 - .125, 0, 0));
      // 通风井 / 采光井
      [[-1, -1], [1, 1]].forEach(([a, b]) => {
        const px = a*w*.3, pz = b*d*.3;
        g.add(box(1.2, 1.7, 1.2, conc, px, 1.3, pz));
        for (let i = 0; i < 4; i++)
          g.add(box(1.1, .08, .06, mat('#6f6b64', { roughness: .7 }), px, 1.5 + i*.2, pz + .63));
      });
      // 成组灌木
      const leaf = [mat('#6f9b57', { roughness: .95 }), mat('#7fa86a', { roughness: .95 }), mat('#5d8f46', { roughness: .95 })];
      for (let i = 0; i < 8; i++){
        const a = i*1.7 + .4;
        g.add(blob(.65, .42, .65, leaf[i%3], Math.cos(a)*w*.24, 1.52, Math.sin(a)*d*.26, 10));
      }
      break;
    }
    case 'garagemodule': {
      /* 地库标准模块：地坪 + 周圈压边 + 4 排车位 + 双通道 + 柱网 + 防火分区 + 悬挂诱导牌 */
      const conc = mat('#b9b6b0', { roughness: .95 });
      const stallM = mat('#a8a5a0', { roughness: .95 });
      const lineM = mat('#f4f5f6', { roughness: .85 });
      const darkM = mat('#6f6b64', { roughness: .9 });
      const yellow = mat('#e8b04a', { roughness: .7 });
      const L = garageLayout(f.w, f.d);
      const m = M(L.margin), top = .12;
      g.add(box(w, top, d, conc, 0, 0, 0));
      g.add(box(w, .35, .3, darkM, 0, 0, -d/2 + .15), box(w, .35, .3, darkM, 0, 0, d/2 - .15),
            box(.3, .35, d, darkM, -w/2 + .15, 0, 0), box(.3, .35, d, darkM, w/2 - .15, 0, 0));
      L.rows.forEach(r => {
        const z0 = M(r.z0), sd = M(r.depth);
        g.add(box(w - 2*m, .006, sd, stallM, 0, top, z0 + sd/2));
        for (let i = 0; i <= L.stallsPerRow; i++)
          flatLine(g, -w/2 + m + M(L.stallW)*i, z0, -w/2 + m + M(L.stallW)*i, z0 + sd, .06, lineM, top + .01);
        flatLine(g, -w/2 + m, z0, w/2 - m, z0, .06, lineM, top + .01);
        flatLine(g, -w/2 + m, z0 + sd, w/2 - m, z0 + sd, .06, lineM, top + .01);
      });
      // 通道 + 行车人字箭头
      L.aisles.forEach(a => {
        const z0 = M(a.z0), az = z0 + M(a.depth)/2;
        flatLine(g, -w/2 + m, az, w/2 - m, az, .05, lineM, top + .01);
        for (let i = 0; i < 3; i++){
          const ax = -w/2 + m + (w - 2*m)*(i + .5)/3;
          flatLine(g, ax - .7, az - .3, ax, az, .12, lineM, top + .015);
          flatLine(g, ax, az, ax - .7, az + .3, .12, lineM, top + .015);
        }
      });
      // 柱网：沿每条通道两侧边线，柱底黄色警示带
      const colZ = [];
      L.aisles.forEach(a => colZ.push(M(a.z0), M(a.z0 + a.depth)));
      const colStep = M(L.column), colSize = M(L.columnSize);
      for (let px = -w/2 + colStep/2; px < w/2 - colStep*.3; px += colStep)
        colZ.forEach(pz => {
          g.add(box(colSize, 2.9, colSize, conc, px, top, pz),
                box(colSize + .04, .3, colSize + .04, yellow, px, top, pz));
        });
      // 防火分区：地面橙色虚线段
      for (let z0 = -d/2 + 1; z0 < d/2 - 1; z0 += 1.6)
        flatLine(g, 0, z0, 0, Math.min(z0 + .9, d/2 - 1), .14, yellow, top + .012);
      // 悬挂车位诱导牌
      [-w*.22, w*.22].forEach(px => {
        g.add(rod([px, 2.4, -d*.28], [px, 2.9, -d*.28], .02, metal()),
              rod([px, 2.4, -d*.28 + 1.8], [px, 2.9, -d*.28 + 1.8], .02, metal()),
              box(1.8, .4, .06, mat('#2f3338', { roughness: .5 }), px, 2.4, -d*.28 + .9),
              box(1.2, .12, .02, glowMat('#d8ffe8', '#5fe0a0', .6), px, 2.55, -d*.28 + .94));
      });
      break;
    }
    case 'garageentry': {
      /* 地库出入口：挡墙 + 坡道 + 警示斜纹 + 限高门架 + 雨棚 + 排水沟 */
      const wallM = mat('#9aa3a8', { roughness: .85 }), roadM = mat('#b4b1ab', { roughness: .95 });
      const yellow = mat('#e8b04a', { roughness: .7 }), darkM = mat('#3a3f44', { roughness: .6 });
      const lineM = mat('#f4f5f6', { roughness: .85 });
      g.add(box(w, .1, d, roadM, 0, 0, 0));
      g.add(box(.4, 1.3, d, wallM, -w/2 + .2, 0, 0), box(.4, 1.3, d, wallM, w/2 - .2, 0, 0));
      // 入口警示斜纹
      for (let i = 0; i < 6; i++)
        flatLine(g, -w/2 + .4 + (w - .8)*i/6, -d/2 + .6,
          -w/2 + .4 + (w - .8)*(i + 1)/6, -d/2 + 1.5, .35, yellow, .11);
      // 中线虚线
      for (let z0 = -d/2 + 2.4; z0 < d/2 - .5; z0 += 1.8)
        flatLine(g, 0, z0, 0, Math.min(z0 + 1, d/2 - .5), .1, lineM, .11);
      // 限高门架（黄黑相间横杆）
      const gy = 2.2;
      [-1, 1].forEach(sg => g.add(cyl(.1, .1, gy + .4, metal(), sg*(w/2 - .45), .1, -d/2 + 1.1, 10)));
      for (let i = 0; i < 8; i++)
        g.add(box((w - .9)/8, .16, .16, i%2 ? darkM : yellow, -w/2 + .45 + (w - .9)*(i + .5)/8, gy, -d/2 + 1.1));
      // 入口雨棚
      g.add(box(w, .2, 4.2, mat('#c9ced3', { roughness: .5 }), 0, 3.1, d/2 - 2.1));
      [-1, 1].forEach(sg => g.add(cyl(.12, .12, 3.1, metal(), sg*(w/2 - .5), .1, d/2 - .4, 10)));
      // 排水沟
      g.add(box(w - .9, .04, .35, darkM, 0, .1, d/2 - 4.6));
      for (let i = 0; i < 10; i++)
        g.add(box((w - 1)/10*.7, .02, .3, metal(), -w/2 + .6 + (w - 1)*i/10, .14, d/2 - 4.6));
      break;
    }
    case 'garagecore': {
      /* 出地面楼梯间：混凝土外墙 + 门洞 + 屋面板 + 玻璃雨棚 + 通风格栅 */
      const conc = mat('#b9b6b0', { roughness: .9 }), t = .25, hh = 3.2;
      g.add(box(w, .15, d, conc, 0, 0, 0));
      g.add(box(w, hh, t, conc, 0, 0, -d/2 + t/2), box(t, hh, d, conc, -w/2 + t/2, 0, 0), box(t, hh, d, conc, w/2 - t/2, 0, 0));
      // 前墙留门洞
      g.add(box(w*.3, hh, t, conc, -w*.35, 0, d/2 - t/2), box(w*.3, hh, t, conc, w*.35, 0, d/2 - t/2));
      g.add(box(w*.4, hh - .6, t, mat('#3b4045', { roughness: .5 }), 0, 0, d/2 - t/2));
      g.add(box(w + .2, .2, d + .2, conc, 0, hh, 0));
      // 玻璃雨棚
      const glass = mat('#9fd6e4', { metalness: .4, roughness: .1, transparent: true, opacity: .6 });
      g.add(box(w + 1.2, .08, 2.2, glass, 0, hh - .2, d/2 + 1.1));
      [-1, 1].forEach(sg => g.add(cyl(.08, .08, hh - .2, metal(), sg*(w/2 + .3), 0, d/2 + 1.9, 10)));
      // 侧面通风格栅
      for (let i = 0; i < 4; i++)
        g.add(box(.06, .1, d*.6, mat('#6f6b64', { roughness: .7 }), -w/2 - .02, .8 + i*.3, 0));
      break;
    }
    case 'ventwell': {
      /* 通风采光井：混凝土井圈 + 百叶 + 安全格栅 */
      const conc = mat('#b9b6b0', { roughness: .9 }), t = .28;
      g.add(box(w, .6, t, conc, 0, 0, -d/2 + t/2), box(w, .6, t, conc, 0, 0, d/2 - t/2),
            box(t, .6, d, conc, -w/2 + t/2, 0, 0), box(t, .6, d, conc, w/2 - t/2, 0, 0));
      g.add(box(w - 2*t, .04, d - 2*t, mat('#1e2124', { roughness: 1 }), 0, .1, 0));
      const louver = mat('#8d949c', { metalness: .5, roughness: .4 });
      for (let i = 0; i < 5; i++) g.add(box(w - 2*t, .05, .06, louver, 0, .18 + i*.09, -d/2 + t + .06));
      break;
    }
    case 'skylight': {
      /* 车库采光顶：井圈 + 玻璃 + 铝框分格 */
      const conc = mat('#b9b6b0', { roughness: .9 }), alu = metal();
      const glass = mat(c, { metalness: .5, roughness: .06, transparent: true, opacity: .45 });
      const t = .3;
      g.add(box(w, .45, t, conc, 0, 0, -d/2 + t/2), box(w, .45, t, conc, 0, 0, d/2 - t/2),
            box(t, .45, d, conc, -w/2 + t/2, 0, 0), box(t, .45, d, conc, w/2 - t/2, 0, 0));
      g.add(box(w - 2*t, .04, d - 2*t, glass, 0, .42, 0));
      for (let i = 1; i < 4; i++){
        g.add(box(.06, .06, d - 2*t, alu, -w/2 + t + (w - 2*t)*i/4, .46, 0));
        g.add(box(w - 2*t, .06, .06, alu, 0, .46, -d/2 + t + (d - 2*t)*i/4));
      }
      break;
    }
    case 'garagecol': {
      const conc = mat('#9aa3a8', { roughness: .9 }), yellow = mat('#e8b04a', { roughness: .7 });
      g.add(box(w, 2.9, d, conc, 0, 0, 0), box(w + .04, .35, d + .04, yellow, 0, 0, 0),
            box(w + .04, .12, d + .04, yellow, 0, 2.1, 0));
      g.add(box(w*.7, .22, .02, mat('#f2f4f5', { roughness: .6 }), 0, 1.6, d/2 + .01));
      break;
    }
    case 'garagefan': {
      /* 风机房：墙体 + 两台风机 + 百叶门 */
      const conc = mat('#b9b6b0', { roughness: .9 }), t = .25, hh = 2.8;
      g.add(box(w, .12, d, conc, 0, 0, 0));
      g.add(box(w, hh, t, conc, 0, 0, -d/2 + t/2), box(t, hh, d, conc, -w/2 + t/2, 0, 0), box(t, hh, d, conc, w/2 - t/2, 0, 0));
      g.add(box(w*.3, hh, t, conc, -w*.35, 0, d/2 - t/2), box(w*.3, hh, t, conc, w*.35, 0, d/2 - t/2));
      g.add(box(w + .2, .18, d + .2, conc, 0, hh, 0));
      const fanM = mat('#5d666d', { metalness: .6, roughness: .4 });
      [-1, 1].forEach(sg => {
        g.add(cyl(.55, .55, .7, mat('#8d949c', { metalness: .5, roughness: .5 }), sg*w*.24, .12, -d*.16, 20));
        g.add(cyl(.1, .1, .75, fanM, sg*w*.24, .12, -d*.16, 12));
      });
      // 百叶门
      for (let i = 0; i < 6; i++)
        g.add(box(w*.3, .06, .04, mat('#8d949c', { roughness: .5 }), 0, .4 + i*.34, d/2 - .02));
      break;
    }
    case 'fireroll': {
      /* 防火卷帘：两侧墙垛 + 卷轴 + 导轨 + 地面警戒线 */
      const wallM = mat('#b9b6b0', { roughness: .9 }), steel = metal();
      const t = Math.min(d, .3);
      g.add(box(w*.16, 2.5, t, wallM, -w*.42, 0, 0), box(w*.16, 2.5, t, wallM, w*.42, 0, 0));
      const roll = cyl(.14, .14, w*.66, steel, 0, 0, 0, 14);
      roll.rotation.z = Math.PI/2; roll.position.y = 2.45; g.add(roll);
      [-1, 1].forEach(sg => g.add(box(.06, 2.5, .06, steel, sg*w*.33, 0, 0)));
      g.add(box(w*.66, .03, .1, mat('#c4553f', { roughness: .7 }), 0, .01, 0));
      break;
    }
    case 'parkingaccessible': {
      /* 无障碍车位：划线 + 轮椅标识 + 蓝色立柱牌 + 挡轮器 */
      const white = mat('#f4f5f6', { roughness: .9 }), blue = mat('#2f6fa8', { roughness: .5 });
      g.add(box(w, .02, d, mat(c, { roughness: .9 }), 0, 0, 0));
      flatLine(g, -w/2, -d/2, w/2, -d/2, .06, white, .03);
      flatLine(g, -w/2, d/2, w/2, d/2, .06, white, .03);
      flatLine(g, -w/2, -d/2, -w/2, d/2, .06, white, .03);
      g.add(box(w*.55, .08, d*.12, white, 0, .02, d*.3));
      g.add(box(.12, 2.2, .12, metal(), -w/2 + .3, .02, -d/2 + .3));
      g.add(box(.6, .6, .05, blue, -w/2 + .3, 1.7, -d/2 + .24));
      break;
    }
    case 'parkingsub': {
      /* 子母车位：外框 + 前后两段 + 中间虚线 + 两个挡轮器 */
      const white = mat('#f4f5f6', { roughness: .9 });
      g.add(box(w, .02, d, mat(c, { roughness: .9 }), 0, 0, 0));
      flatLine(g, -w/2, -d/2, w/2, -d/2, .06, white, .03);
      flatLine(g, -w/2, d/2, w/2, d/2, .06, white, .03);
      flatLine(g, -w/2, -d/2, -w/2, d/2, .06, white, .03);
      flatLine(g, w/2, -d/2, w/2, d/2, .06, white, .03);
      for (let z0 = -d/2 + .6; z0 < d/2 - .3; z0 += 1.2)
        flatLine(g, -w/2 + .15, z0, -w/2 + .9, z0, .05, white, .03);
      g.add(box(w*.5, .1, .16, mat('#8d949c', { roughness: .8 }), 0, .02, -d*.28),
            box(w*.5, .1, .16, mat('#8d949c', { roughness: .8 }), 0, .02, d*.28));
      break;
    }
    case 'parkingcompact': {
      /* 微型车位：划线 + 挡轮器 */
      const white = mat('#f4f5f6', { roughness: .9 });
      g.add(box(w, .02, d, mat(c, { roughness: .9 }), 0, 0, 0));
      flatLine(g, -w/2, -d/2, w/2, -d/2, .05, white, .03);
      flatLine(g, -w/2, d/2, w/2, d/2, .05, white, .03);
      flatLine(g, -w/2, -d/2, -w/2, d/2, .05, white, .03);
      flatLine(g, w/2, -d/2, w/2, d/2, .05, white, .03);
      g.add(box(w*.5, .1, .16, mat('#8d949c', { roughness: .8 }), 0, .02, d*.3));
      break;
    }
    case 'speedbump': {
      /* 减速带：黄黑相间橡胶凸起 + 端部收头 */
      const n = Math.max(4, Math.round(w/.45)), sw = w/n;
      for (let i = 0; i < n; i++)
        g.add(box(sw*.96, .06, d, mat(i%2 ? '#2f3338' : c, { roughness: .8 }), -w/2 + sw*(i + .5), 0, 0));
      break;
    }
    case 'garagemirror': {
      /* 广角镜：红白立柱 + 圆形镜面 */
      g.add(cyl(.06, .07, 2.6, mat('#d9d2c6', { roughness: .6 }), 0, 0, 0, 10));
      for (let i = 0; i < 4; i++)
        g.add(cyl(.075, .075, .2, mat(i%2 ? '#c4553f' : '#f2f4f5', { roughness: .6 }), 0, .5 + i*.2, 0, 10));
      const mir = cyl(.4, .4, .05, mirror(), 0, 0, 0, 24);
      mir.rotation.x = Math.PI/2; mir.position.set(0, 2.5, 0); g.add(mir);
      const rim = ring(.4, .04, metal(), 0, 0, 0);
      rim.rotation.x = 0; rim.position.set(0, 2.5, 0); g.add(rim);
      break;
    }
    case 'garagesign': {
      /* 车位引导屏：吊杆 + 深色屏体 + 绿色箭头/数字灯箱 */
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d), ph = 2.4;
      [-1, 1].forEach(sg => g.add(rod([sg*L*.3, ph, 0], [sg*L*.3, 3, 0], .02, metal())));
      g.add(box(hz ? L : T, T*.9, hz ? T*.14 : L, mat('#24282c', { roughness: .5 }), 0, ph, 0));
      const n = Math.max(2, Math.round(L/700));
      for (let i = 0; i < n; i++){
        const px = hz ? -L/2 + L*(i + .5)/n : 0, pz = hz ? 0 : -L/2 + L*(i + .5)/n;
        g.add(hz ? box(L/n*.6, T*.5, .02, glowMat('#d8ffe8', '#5fe0a0', .7), px, ph + T*.15, -T*.09)
                 : box(.02, T*.5, L/n*.6, glowMat('#d8ffe8', '#5fe0a0', .7), -T*.09, ph + T*.15, pz));
      }
      break;
    }

    /* ---------- 沙盘 · 交通 ---------- */
    case 'road4': case 'road6': {
      roadModel(g, w, d, f.type === 'road6' ? 6 : 4);
      break;
    }
    case 'crossroad': {
      const asphalt = mat('#3f4247', { roughness: .95 }), white = mat('#f2f4f5', { roughness: .85 });
      g.add(box(w, .08, d*.26, asphalt, 0, 0, 0), box(w*.26, .08, d, asphalt, 0, 0, 0));
      // 四向斑马线
      const n = 6;
      for (let i = 0; i < n; i++){
        const t0 = i/n;
        g.add(box(w*.88/n*.55, .012, .7, white, -w*.44 + w*.88*t0 + w*.04, .08, d*.42),
              box(w*.88/n*.55, .012, .7, white, -w*.44 + w*.88*t0 + w*.04, .08, -d*.42),
              box(.7, .012, d*.88/n*.55, white, w*.42, .08, -d*.44 + d*.88*t0 + d*.04),
              box(.7, .012, d*.88/n*.55, white, -w*.42, .08, -d*.44 + d*.88*t0 + d*.04));
      }
      break;
    }
    case 'trafficlight': {
      const R = Math.min(w, d)/2, dark = mat('#2f3338', { roughness: .5 });
      g.add(cyl(.09, .12, 3.2, metal(), 0, 0, 0, 10),
            box(.32, .9, .28, dark, 0, 3.2, 0));
      const cols = ['#c4553f', '#e8b04a', '#4f9d6a'];
      cols.forEach((cc, i) => g.add(cyl(.1, .1, .04, glowMat(cc, cc, .55), 0, 3.28 + i*.27, .16, 12)));
      break;
    }
    case 'busstop': {
      const stone = mat('#d9d2c6', { roughness: .7 }), roofM = mat(c, { roughness: .6 });
      const glass = mat('#9fd6e4', { metalness: .35, roughness: .1, transparent: true, opacity: .5 });
      g.add(box(w, .05, d, stone, 0, 0, 0));
      const pw = .12, ph = 2.7;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) =>
        g.add(cyl(pw, pw, ph, metal(), a*(w*.26), .05, b*(d*.36), 10)));
      g.add(box(w*.62, .16, d*.92, roofM, 0, ph, 0));
      g.add(box(w*.6, 1.6, .04, glass, 0, .7, -d*.4));
      g.add(box(w*.44, .08, .45, woodM('#c9a678'), 0, .48, -d*.2),
            box(w*.44, .45, .06, woodM('#c9a678'), 0, .55, -d*.42));
      g.add(cyl(.06, .07, 2.6, metal(), w*.32, .05, 0, 10),
            box(.5, .9, .08, mat('#2f6fa8', { roughness: .5 }), w*.32, 2.3, 0));
      break;
    }
    case 'metroexit': {
      const conc = mat('#b9b6b0', { roughness: .9 }), glass = mat('#9fd6e4', { metalness: .4, roughness: .1, transparent: true, opacity: .55 });
      g.add(box(w, .12, d, conc, 0, 0, 0));
      // 下行台阶（局部下沉，作为示意）
      for (let i = 0; i < 6; i++)
        g.add(box(w*.56, .12, d*.5/6, conc, 0, .02 - i*.12, -d*.18 + d*.5*i/6));
      const pw = .14, ph = 3.1;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) =>
        g.add(cyl(pw, pw, ph, metal(), a*w*.38, .12, b*d*.4, 10)));
      g.add(box(w, .18, d, glass, 0, ph, 0));
      g.add(box(.9, 2.2, .06, mat('#2f6fa8', { roughness: .5 }), 0, .4, d*.42),
            box(.5, .04, .02, glowMat('#eaf6ff', '#bfe6ff', .6), 0, 1.9, d*.46));
      break;
    }
    case 'barrier': {
      /* 道闸：机箱固定，摆臂单独成组（绕机箱顶抬起，供引擎逐帧驱动） */
      const dark = mat('#3a3f44', { roughness: .5 });
      g.add(box(w*.14, 1.1, d*.8, dark, -w*.4, 0, 0));
      const pivot = new THREE.Group();
      pivot.position.set(-w*.4, .95, 0);
      const armM = mat('#e8e6e0', { roughness: .5 });
      pivot.add(box(w*.8, .14, .14, armM, w*.42, 0, 0));
      for (let i = 0; i < 4; i++)
        pivot.add(box(w*.08, .15, .15, mat('#c4553f', { roughness: .5 }), w*.12 + i*w*.2, -.005, 0));
      pivot.userData.fx = { kind: 'barrier', openAngle: -Math.PI*.52, target: 0, cur: 0 };
      g.add(pivot);
      g.userData.animKeep = [pivot];
      break;
    }
    case 'bikeshed': case 'evshed': {
      const roofM = mat(c, { roughness: .6 }), metalM = metal();
      g.add(box(w, .05, d, mat('#cfc7b8', { roughness: .8 }), 0, 0, 0));
      const ph = 2.5;
      for (let i = 0; i <= 3; i++)
        [-1, 1].forEach(s => g.add(cyl(.07, .07, ph, metalM, -w*.45 + w*.9*i/3, .05, s*d*.4, 8)));
      g.add(box(w, .12, d, roofM, 0, ph, 0));
      if (f.type === 'evshed'){
        for (let i = 0; i < 4; i++){
          const px = -w*.36 + w*.24*i;
          g.add(box(.32, 1.2, .24, mat('#3a3f44', { roughness: .5 }), px, .05, -d*.34),
                box(.2, .26, .02, mat('#3fc98a', { emissive: '#1f8f5e', emissiveIntensity: .5 }),
                  px, .85, -d*.22));
        }
      } else {
        for (let i = 0; i < 5; i++)
          g.add(box(.06, .8, .5, mat('#5d666d', { metalness: .6, roughness: .4 }), -w*.36 + w*.18*i, .05, 0));
      }
      break;
    }
    case 'firelane': {
      const red = mat('#9c4a3a', { roughness: .9 }), white = mat('#f2f4f5', { roughness: .85 });
      g.add(box(w, .03, d, red, 0, 0, 0));
      for (let x0 = -w/2; x0 < w/2; x0 += 4)
        flatLine(g, x0, -d/2 + .1, Math.min(x0 + 2.2, w/2), -d/2 + .1, .12, white, .04);
      flatLine(g, -w/2, 0, w/2, 0, .12, white, .04);
      break;
    }
    case 'turnaround': {
      g.add(cyl(Math.min(w, d)/2, Math.min(w, d)/2, .08, mat('#6f6b64', { roughness: .95 }), 0, 0, 0, 28));
      g.add(cyl(Math.min(w, d)*.3, Math.min(w, d)*.3, .2, mat('#7a8a5a', { roughness: .95 }), 0, .08, 0, 24));
      treeModel(g, Math.min(w, d)*.34, Math.min(w, d)*.34, '#4e7c46', 'round', 0, 0, .9);
      break;
    }
    case 'firelanehidden': {
      g.add(box(w, .02, d, mat(c, { roughness: 1 }), 0, 0, 0));
      for (let x0 = -w/2; x0 < w/2; x0 += 3)
        flatLine(g, x0, -d/2 + .1, Math.min(x0 + 1.6, w/2), -d/2 + .1, .1, mat('#c4553f', { roughness: .8 }), .03);
      flatLine(g, -w/2, 0, w/2, 0, .1, mat('#f2f4f5', { roughness: .85 }), .03);
      break;
    }
    case 'accessramp': {
      const conc = mat('#cfc7b8', { roughness: .8 });
      const ramp = box(w, .1, d, conc, 0, 0, 0);
      ramp.rotation.z = -.08; g.add(ramp);
      [-1, 1].forEach(s => g.add(rod([-w/2 + .1, .1, s*d*.46], [w/2 - .1, .7, s*d*.46], .04, metal())));
      break;
    }
    case 'gardenpath': {
      const stone = mat(c, { roughness: .9 }), edge = mat('#cfc7b8', { roughness: .7 });
      g.add(box(w, .04, d, stone, 0, 0, 0));
      for (let i = 1; i < 6; i++)
        flatLine(g, -w/2 + w*i/6, -d/2, -w/2 + w*i/6, d/2, .05, edge, .045);
      break;
    }
    case 'steppingstones': {
      const stone = mat(c, { roughness: .9 }), hz = w >= d, L = hz ? w : d, T = Math.min(w, d), n = 6;
      for (let i = 0; i < n; i++){
        const p = -L/2 + L*(i + .5)/n, off = (i%2 ? -1 : 1)*T*.14;
        g.add(hz
          ? rbox(L/n*.55, .08, T*.36, stone, p, .01, off, .12)
          : rbox(T*.36, .08, L/n*.55, stone, off, .01, p, .12));
      }
      break;
    }
    case 'boardwalk': {
      const wood = woodM(c), post = woodM('#8d6a44');
      g.add(box(w, .12, d, wood, 0, 0, 0));
      const n = Math.max(4, Math.round(w/.5));
      for (let i = 1; i < n; i++) g.add(box(.03, .01, d, post, -w/2 + w*i/n, .12, 0));
      [-1, 1].forEach(s => {
        for (let i = 0; i <= 4; i++)
          g.add(cyl(.05, .05, .9, post, -w/2 + w*i/4, .12, s*d*.46, 8));
        g.add(box(w, .06, .06, post, 0, .95, s*d*.46));
      });
      break;
    }

    /* ---------- 沙盘 · 景观基元 ---------- */
    case 'landparcel': {
      const red = mat('#c4553f', { roughness: .8 });
      g.add(box(w, .05, .18, red, 0, .01, -d/2 + .09), box(w, .05, .18, red, 0, .01, d/2 - .09),
            box(.18, .05, d, red, -w/2 + .09, .01, 0), box(.18, .05, d, red, w/2 - .09, .01, 0));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) =>
        g.add(cyl(.12, .16, 1.2, red, a*(w/2 - .4), .01, b*(d/2 - .4), 10)));
      break;
    }
    case 'dryfountain': {
      const R = Math.min(w, d)/2, stone = mat('#cfc7b8', { roughness: .55 });
      g.add(cyl(R, R, .08, stone, 0, 0, 0, 36));
      g.add(cyl(R*.9, R*.9, .02, mat(c, { metalness: .5, roughness: .15 }), 0, .08, 0, 36));
      const jets = [];
      for (let i = 0; i < 12; i++){
        const a = i/12*Math.PI*2, rr = R*(i%2 ? .42 : .6), jh = .5 + (i%3)*.2;
        g.add(cyl(.05, .05, .02, metal(), Math.cos(a)*rr, .1, Math.sin(a)*rr, 8));
        const jet = new THREE.Group();
        jet.position.set(Math.cos(a)*rr, .1, Math.sin(a)*rr);
        jet.add(cyl(.02, .03, jh, glowMat('#eaf8ff', '#9fdcf0', .5), 0, jh/2, 0, 6));
        jet.userData.fx = { kind: 'jet', phase: i*.55, speed: 2 + (i%3)*.4, base: 1 };
        g.add(jet);
        jets.push(jet);
      }
      g.userData.animKeep = jets;
      break;
    }
    case 'stream': {
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      const water = mat(c, { metalness: .35, roughness: .1, transparent: true, opacity: .78 });
      g.add(hz ? box(w, .02, T*.64, water, 0, .02, 0) : box(T*.64, .02, d, water, 0, .02, 0));
      const stone = mat('#d9d2c6', { roughness: .8 });
      for (let i = 0; i < 8; i++){
        const p = -L/2 + L*(i + .5)/8;
        g.add(hz ? rbox(L/8*.9, .14, T*.16, stone, p, 0, -T*.42, .06)
                 : rbox(T*.16, .14, L/8*.9, stone, -T*.42, 0, p, .06));
        g.add(hz ? rbox(L/8*.9, .14, T*.16, stone, p, 0, T*.42, .06)
                 : rbox(T*.16, .14, L/8*.9, stone, T*.42, 0, p, .06));
      }
      for (let i = 0; i < 4; i++)
        g.add(blob(.35, .18, .3, stone, -L/2 + L*(i + .5)/4, .1, 0, 10));
      break;
    }
    case 'deck': {
      const wood = woodM(c), rail = woodM('#8d6a44');
      g.add(box(w, .16, d, wood, 0, 0, 0));
      for (let i = 1; i < 8; i++) g.add(box(.03, .01, d, mat('#8d6a44', { roughness: .8 }), -w/2 + w*i/8, .16, 0));
      [-1, 1].forEach(s => {
        for (let i = 0; i <= 4; i++) g.add(cyl(.05, .05, 1.0, rail, -w/2 + w*i/4, .16, s*d*.46, 8));
        g.add(box(w, .06, .06, rail, 0, 1.1, s*d*.46));
      });
      for (let i = 0; i < 3; i++) g.add(box(w*.3, .12*(3 - i), .5, wood, 0, Math.max(0, .16 - .12*i), d/2 + .3 + .5*i));
      break;
    }
    case 'revetment': {
      const stone = mat('#8d8a84', { roughness: .9 });
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d), n = Math.max(4, Math.round(L/1.2));
      for (let i = 0; i < n; i++){
        const p = -L/2 + L*(i + .5)/n;
        g.add(hz ? rbox(L/n*.92, .35, T*.4, stone, p, 0, -T*.18, .05)
                 : rbox(T*.4, .35, L/n*.92, stone, -T*.18, 0, p, .05));
        g.add(hz ? rbox(L/n*.92, .3, T*.4, mat(lighter('#8d8a84', .1), { roughness: .9 }), p, .35, -T*.18, .05)
                 : rbox(T*.4, .3, L/n*.92, mat(lighter('#8d8a84', .1), { roughness: .9 }), -T*.18, .35, p, .05));
      }
      g.add(hz ? box(w, .04, T*.3, mat('#6fb6c8', { metalness: .3, roughness: .1, transparent: true, opacity: .75 }), 0, 0, T*.3)
               : box(T*.3, .04, d, mat('#6fb6c8', { metalness: .3, roughness: .1, transparent: true, opacity: .75 }), T*.3, 0, 0));
      break;
    }
    case 'featurewall': {
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d), H = 2.6;
      const wall = mat(c, { roughness: .6 });
      g.add(hz ? box(w, H, T, wall, 0, 0, 0) : box(T, H, d, wall, 0, 0, 0));
      g.add(hz ? box(w + .1, .12, T + .16, mat(lighter(c, .35), { roughness: .5 }), 0, H, 0)
               : box(T + .16, .12, d + .1, mat(lighter(c, .35), { roughness: .5 }), 0, H, 0));
      for (let i = 0; i < 3; i++)
        g.add(hz ? box(.5, .5, .04, glowMat('#fff3cf', '#ffe3a0', .6), -w/2 + w*(i + .5)/3, .8, T/2 + .03)
                 : box(.04, .5, .5, glowMat('#fff3cf', '#ffe3a0', .6), T/2 + .03, .8, -d/2 + d*(i + .5)/3));
      break;
    }
    case 'sculpture': {
      const R = Math.min(w, d)/2, stone = mat('#cfc7b8', { roughness: .5 }), gold = mat(c, { metalness: .7, roughness: .3 });
      g.add(cyl(R*.7, R*.8, .35, stone, 0, 0, 0, 24),
            cyl(R*.16, R*.22, .9, stone, 0, .35, 0, 16));
      g.add(ring(R*.45, R*.07, gold, 0, 1.1, 0));
      g.add(blob(R*.3, R*.4, R*.3, gold, 0, 1.5, 0, 16));
      break;
    }
    case 'fence': {
      const hz = w >= d, L = hz ? w : d, H = 1.6;
      const m = metal(), panel = mat('#c8d2d6', { transparent: true, opacity: .16, side: THREE.DoubleSide });
      const n = Math.max(3, Math.round(L/2));
      for (let i = 0; i <= n; i++)
        g.add(cyl(.05, .05, H, m, hz ? -L/2 + L*i/n : 0, 0, hz ? 0 : -L/2 + L*i/n, 8));
      g.add(hz ? box(w, H, .02, panel, 0, 0, 0) : box(.02, H, d, panel, 0, 0, 0));
      g.add(hz ? box(w, .06, .06, m, 0, H - .1, 0) : box(.06, .06, d, m, 0, H - .1, 0));
      break;
    }
    case 'signage': {
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d), H = 2.2;
      const dark = mat('#2f3338', { roughness: .5 });
      g.add(cyl(.06, .07, H, metal(), hz ? -L*.3 : 0, 0, hz ? 0 : -L*.3, 8),
            cyl(.06, .07, H, metal(), hz ? L*.3 : 0, 0, hz ? 0 : L*.3, 8));
      g.add(hz ? box(L, T, .08, dark, 0, H - .5, 0) : box(.08, T, L, dark, 0, H - .5, 0));
      for (let i = 0; i < 3; i++)
        g.add(hz ? box(L*.6, .1, .02, glowMat('#eaf6ff', '#bfe6ff', .5), -L*.05, H - .3 + i*.18, .05)
                 : box(.02, .1, L*.6, glowMat('#eaf6ff', '#bfe6ff', .5), .05, H - .3 + i*.18, -L*.05));
      break;
    }
    case 'lawnlamp': {
      g.add(cyl(.05, .06, .9, metal(), 0, 0, 0, 8),
            cyl(.14, .11, .22, glowMat('#fffbe8', '#ffe9a8', .8), 0, .9, 0, 12));
      break;
    }
    case 'gardenlamp': {
      g.add(cyl(.06, .08, 2.8, metal(), 0, 0, 0, 10));
      for (let i = 0; i < 3; i++){
        const a = i/3*Math.PI*2;
        g.add(rod([0, 2.6, 0], [Math.cos(a)*.35, 2.5, Math.sin(a)*.35], .03, metal()),
              blob(.1, .14, .1, glowMat('#fffbe8', '#ffe9a8', .8), Math.cos(a)*.4, 2.45, Math.sin(a)*.4, 10));
      }
      break;
    }
    case 'flowerbed': {
      const bed = mat('#5d4a3a', { roughness: 1 });
      g.add(rbox(w, .25, d, bed, 0, 0, 0, .1));
      const cols = ['#d96b8a', '#e0a94a', '#8fbf7a', '#c98ad0', '#e8c14f'];
      for (let i = 0; i < 18; i++){
        const a = i*2.4, rr = .22 + (i%3)*.12;
        g.add(blob(.22, .16, .22, mat(cols[i%5], { roughness: .9 }),
          Math.cos(a)*w*rr, .28 + (i%2)*.1, Math.sin(a)*d*rr, 8));
      }
      break;
    }
    case 'aquatic': {
      const water = mat('#6fb6c8', { transparent: true, opacity: .55, roughness: .2 });
      g.add(box(w, .06, d, water, 0, 0, 0));
      for (let i = 0; i < 7; i++){
        const a = i*1.9;
        g.add(cyl(.28, .28, .02, mat('#7fa86a', { roughness: .9 }), Math.cos(a)*w*.28, .07, Math.sin(a)*d*.28, 14));
      }
      for (let i = 0; i < 7; i++)
        g.add(rod([-w*.35 + w*.12*i, .06, d*.4], [-w*.35 + w*.12*i, 1.1, d*.4], .02, mat('#4f8a4a', { roughness: .9 })));
      break;
    }
    case 'treegrid': {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        treeModel(g, w/4, d/4, c, 'round', -w*.3 + i*w*.3, -d*.3 + j*d*.3, .8);
      break;
    }
    case 'streetrow': {
      const hz = w >= d, L = hz ? w : d, n = Math.max(3, Math.round(L/3));
      for (let i = 0; i < n; i++){
        const p = -L/2 + L*(i + .5)/n;
        treeModel(g, Math.min(w, d)*1.2, Math.min(w, d)*1.2, c, 'round', hz ? p : 0, hz ? 0 : p, .9);
      }
      break;
    }
    case 'zelkova': {
      treeModel(g, w, d, c, 'columnar');
      break;
    }
    case 'tallow': {
      treeModel(g, w, d, c, 'round');
      break;
    }
    case 'palm': {
      treeModel(g, w, d, c, 'palm');
      break;
    }
    case 'bamboo': {
      treeModel(g, w, d, c, 'bamboo');
      break;
    }

    /* ---------- 沙盘 · 城市背景 ---------- */
    case 'slabblock': {
      towerModel(g, w, d, 18, c, { bay: 4, fh: 3, balcony: false });
      break;
    }
    case 'citytower': {
      towerModel(g, w, d, 30, c, { bay: 4.2, fh: 3.4, balcony: false });
      break;
    }
    case 'school': {
      const paint = mat(c, { roughness: .8 }), trim = mat(lighter(c, .4), { roughness: .6 });
      const glass = mat('#7fa7bd', { metalness: .4, roughness: .15, transparent: true, opacity: .7 });
      // 两栋教学楼 + 体育馆
      [[-w*.2, -d*.16, w*.42, d*.2, 4], [-w*.2, d*.12, w*.42, d*.2, 4], [w*.26, -d*.1, w*.24, d*.5, 2]].forEach(([px, pz, bw, bd, fl]) => {
        const bg = new THREE.Group(); bg.position.set(px, 0, pz); g.add(bg);
        const h = fl*3.6;
        bg.add(rbox(bw, h, bd, paint, 0, 0, 0, .06));
        facadeGrid(bg, bw, bd, fl, 3.6, 0, glass, trim, { bay: 3.4, winH: .5 });
        bg.add(box(bw + .3, .2, bd + .3, trim, 0, h, 0));
      });
      // 操场
      g.add(rbox(w*.34, .02, d*.42, mat('#b4623f', { roughness: .95 }), w*.35, 0, 0, .1));
      g.add(box(w*.28, .012, d*.3, mat('#3f7c52', { roughness: .95 }), w*.35, .02, 0));
      break;
    }
    case 'hospital': {
      const paint = mat(c, { roughness: .8 }), trim = mat(lighter(c, .4), { roughness: .6 });
      const glass = mat('#7fa7bd', { metalness: .4, roughness: .15, transparent: true, opacity: .7 });
      const bg = new THREE.Group(); bg.position.set(-w*.12, 0, 0); g.add(bg);
      bg.add(rbox(w*.4, 28, d*.5, paint, 0, 0, 0, .08));
      facadeGrid(bg, w*.4, d*.5, 9, 3.1, 0, glass, trim, { bay: 3.6, winH: .45 });
      bg.add(box(w*.42, .3, d*.52, trim, 0, 28, 0));
      // 屋顶红十字
      bg.add(box(w*.04, 3, .5, mat('#c4553f', { roughness: .5 }), 0, 28.3, 0),
             box(.5, 3, w*.04, mat('#c4553f', { roughness: .5 }), 0, 28.3, 0));
      g.add(rbox(w*.34, 11, d*.36, paint, w*.28, 0, d*.1, .08));
      break;
    }
    case 'retailblock': {
      const paint = mat(c, { roughness: .6 }), trim = mat(lighter(c, .35), { roughness: .5 });
      const glass = mat('#5f8fa8', { metalness: .5, roughness: .1, transparent: true, opacity: .65 });
      g.add(rbox(w*.9, 18, d*.8, paint, -w*.03, 0, -d*.03, .1));
      for (let i = 0; i < 3; i++)
        g.add(box(w*.86, 1.6, .08, glass, -w*.03, 1.2 + i*5.2, d*.37));
      g.add(box(w*.5, .3, d*.3, mat('#9fd6e4', { metalness: .4, roughness: .1, transparent: true, opacity: .6 }), 0, 18.2, 0));
      g.add(box(w*.2, 4, .4, mat('#2f6fa8', { roughness: .5 }), w*.22, 18.2, -d*.2));
      break;
    }
    case 'citygrid': {
      const asphalt = mat('#4a4d51', { roughness: .95 }), white = mat('#f2f4f5', { roughness: .85 });
      const rw = Math.min(w, d)*.07;
      for (let i = 1; i < 4; i++){
        g.add(box(rw, .06, d, asphalt, -w/2 + w*i/4, 0, 0), box(w, .06, rw, asphalt, 0, 0, -d/2 + d*i/4));
        for (let q = -w/2; q < w/2; q += 5)
          flatLine(g, q, -d/2 + d*i/4, Math.min(q + 3, w/2), -d/2 + d*i/4, .1, white, .065);
      }
      g.add(box(w, .01, d, mat('#cfc7b8', { roughness: .9 }), 0, 0, 0));
      break;
    }
    case 'river': {
      const water = mat(c, { metalness: .35, roughness: .08, transparent: true, opacity: .8 });
      const stone = mat('#d9d2c6', { roughness: .85 });
      g.add(box(w, .02, d*.56, water, 0, .02, 0));
      g.add(box(w, .2, d*.16, stone, 0, 0, -d*.36), box(w, .2, d*.16, stone, 0, 0, d*.36));
      for (let i = 0; i < 2; i++){
        const px = -w*.2 + w*.4*i;
        g.add(box(w*.05, .7, d, stone, px, .1, 0));
        [-1, 1].forEach(s => g.add(box(w*.05, .5, .3, stone, px, .7, s*d*.42)));
      }
      break;
    }
    case 'lake': {
      const R = Math.min(w, d)/2;
      const water = mat(c, { metalness: .3, roughness: .08, transparent: true, opacity: .82 });
      g.add(blob(w*.48, .02, d*.44, water, 0, .03, 0, 40));
      const rimM = mat('#d9d2c6', { roughness: .85 }), nRim = 40;
      for (let i = 0; i < nRim; i++){
        const a0 = i/nRim*Math.PI*2, a1 = (i + 1)/nRim*Math.PI*2;
        flatLine(g, Math.cos(a0)*w*.45, Math.sin(a0)*d*.4, Math.cos(a1)*w*.45, Math.sin(a1)*d*.4,
          .24, rimM, .045);
      }
      g.add(blob(R*.16, .1, R*.16, mat('#7fa86a', { roughness: .95 }), -w*.14, .08, -d*.06, 16));
      break;
    }
    case 'park': {
      g.add(rbox(w, .04, d, mat(c, { roughness: 1 }), 0, 0, 0, .2));
      const pathM = mat('#e8e2d6', { roughness: .9 });
      flatLine(g, -w*.45, d*.1, w*.45, d*.1, 3, pathM, .05);
      flatLine(g, w*.1, -d*.4, w*.1, d*.4, 2.4, pathM, .051);
      g.add(cyl(Math.min(w, d)*.12, Math.min(w, d)*.12, .02, mat('#6fb6c8', { metalness: .3, roughness: .1, transparent: true, opacity: .8 }), w*.28, .04, d*.24, 28));
      for (let i = 0; i < 9; i++){
        const a = i*2.1, rr = .3 + (i%3)*.08;
        treeModel(g, w*.1, d*.1, '#4e7c46', 'round', Math.cos(a)*w*rr, Math.sin(a)*d*rr, .9);
      }
      break;
    }
    case 'hill': {
      const rock = [mat(c, { roughness: 1 }), mat(lighter(c, .08), { roughness: 1 }), mat(darker(c, .9), { roughness: 1 })];
      g.add(blob(w*.46, 9, d*.44, rock[0], 0, 1, 0, 28));
      g.add(blob(w*.3, 12, d*.26, rock[1], -w*.14, 2, -d*.06, 24));
      g.add(blob(w*.22, 8, d*.2, rock[2], w*.2, 1.5, d*.12, 20));
      for (let i = 0; i < 8; i++)
        treeModel(g, w*.06, d*.06, '#3f6b34', 'round', Math.cos(i*2.1)*w*.3, Math.sin(i*2.1)*d*.28, .8);
      break;
    }
    case 'metroline': {
      const conc = mat('#b9b6b0', { roughness: .85 }), steel = metal();
      g.add(box(w, .2, 2.6, conc, 0, 8.2, 0));
      g.add(box(w, .06, .18, steel, 0, 8.4, -1));
      for (let i = 0; i < 8; i++)
        g.add(cyl(.35, .45, 8.2, conc, -w/2 + w*(i + .5)/8, 0, 0, 12));
      g.add(rbox(w*.18, 4.2, 5.2, mat('#d9d2c6', { roughness: .7 }), w*.42, 8.4, 0, .08));
      g.add(box(1.2, 2.4, .1, mat('#2f6fa8', { roughness: .5 }), w*.42, 9.4, 2.65));
      break;
    }
    case 'powerline': {
      const steel = mat('#5d666d', { metalness: .6, roughness: .4 });
      const pts = [];
      for (let i = 0; i < 5; i++){
        const px = -w/2 + w*(.08 + .21*i);
        g.add(cyl(.18, .3, 18, steel, px, 0, 0, 8));
        [-1, 1].forEach(s => g.add(box(4.2, .18, .18, steel, px, 15, s*1.2)));
        pts.push([px, 15.2, 0]);
      }
      for (let i = 0; i < pts.length - 1; i++){
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        for (let k = 0; k <= 8; k++){
          const t0 = k/8, t1 = (k + 1)/8;
          const sag = (t) => y0 + (y1 - y0)*t - Math.sin(Math.PI*t)*1.2;
          if (k < 8) g.add(rod([x0 + (x1 - x0)*t0, sag(t0), 0], [x0 + (x1 - x0)*t1, sag(t1), 0], .03, blackMetal()));
        }
      }
      break;
    }
    case 'substation': {
      const conc = mat('#b9b6b0', { roughness: .9 }), panel = mat('#c8d2d6', { transparent: true, opacity: .2, side: THREE.DoubleSide });
      g.add(box(w, .06, d, mat('#cfc7b8', { roughness: .9 }), 0, 0, 0));
      g.add(box(w*.34, 4, d*.4, mat(c, { roughness: .7 }), -w*.24, .06, -d*.1));
      [[.18, -.18], [.18, .2]].forEach(([fx, fz]) => g.add(rbox(w*.24, 2.2, d*.22, mat('#8d949c', { metalness: .4, roughness: .5 }), w*fx, .06, d*fz, .05)));
      [-1, 1].forEach(s => g.add(box(w, 1.6, .02, panel, 0, .06, s*d*.46), box(.02, 1.6, d, panel, s*w*.46, .06, 0)));
      break;
    }

    /* ---------- 沙盘 · 营销展示 ---------- */
    case 'salescenter': {
      const glass = mat('#9fd6e4', { metalness: .5, roughness: .08, transparent: true, opacity: .55 });
      const white = mat('#e8e2d6', { roughness: .55 }), stone = mat('#cfc7b8', { roughness: .6 });
      g.add(rbox(w, .3, d, stone, 0, 0, 0, .08));
      g.add(rbox(w*.52, 5.2, d*.4, white, -w*.12, .3, -d*.1, .08),
            box(w*.5, 4.2, .06, glass, -w*.12, 1, d*.1));
      g.add(rbox(w*.28, 7.5, d*.5, mat(c, { roughness: .6 }), w*.3, .3, 0, .08));
      g.add(box(w*.9, .25, d*.7, white, 0, 6.2, 0));
      g.add(box(w*.8, .12, 4, glass, 0, .3, d*.42));
      for (let i = 0; i < 6; i++) g.add(cyl(.08, .08, .3, metal(), -w*.4 + w*.16*i, .3, d*.55, 8));
      g.add(box(1.2, 3, .3, mat('#2f6fa8', { roughness: .5 }), w*.34, 7.8, 0));
      break;
    }
    case 'modelhouse': {
      const paint = mat(c, { roughness: .8 }), trim = mat(lighter(c, .45), { roughness: .6 });
      const glass = mat('#7fa7bd', { metalness: .4, roughness: .12, transparent: true, opacity: .7 });
      g.add(rbox(w*.5, 3.6, d*.48, paint, -w*.1, .15, 0, .06));
      facadeGrid(g, w*.5, d*.48, 1, 3.6, .15, glass, trim, { bay: 3, winH: .55 });
      g.add(box(w*.54, .16, d*.52, trim, -w*.1, 3.75, 0));
      g.add(pyramidRoof(w*.58, d*.56, 2.6, mat(darker(c, .6), { roughness: .7, side: THREE.DoubleSide }), -w*.1, 3.9));
      flatLine(g, w*.16, -d*.4, w*.16, d*.4, 1.6, mat('#e8e2d6', { roughness: .9 }), .05);
      break;
    }
    case 'viewpath': {
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      const wood = woodM('#b98a5a'), post = metal();
      g.add(hz ? box(w, .08, T, wood, 0, 0, 0) : box(T, .08, d, wood, 0, 0, 0));
      const n = Math.max(3, Math.round(L/2.5));
      for (let i = 0; i <= n; i++){
        const p = -L/2 + L*i/n;
        [-1, 1].forEach(s => g.add(hz
          ? cyl(.06, .06, 2.8, post, p, .08, s*T*.4, 8)
          : cyl(.06, .06, 2.8, post, s*T*.4, .08, p, 8)));
      }
      g.add(hz ? box(w, .12, T*.9, wood, 0, 2.88, 0) : box(T*.9, .12, d, wood, 0, 2.88, 0));
      break;
    }
    case 'hoarding': {
      const hz = w >= d, L = hz ? w : d, H = 3;
      const panel = mat(c, { roughness: .7 });
      const cols = ['#c4553f', '#2f6fa8', '#4f9d6a'];
      const n = Math.max(3, Math.round(L/3));
      for (let i = 0; i < n; i++){
        const p = -L/2 + L*(i + .5)/n;
        g.add(hz ? box(L/n*.92, H, .12, panel, p, 0, 0) : box(.12, H, L/n*.92, panel, 0, 0, p));
        g.add(hz ? box(L/n*.7, 1.2, .02, mat(cols[i%3], { roughness: .6 }), p, 1.2, d/2 + .01)
                 : box(.02, 1.2, L/n*.7, mat(cols[i%3], { roughness: .6 }), w/2 + .01, 1.2, p));
      }
      break;
    }
    case 'banner': {
      const R = Math.min(w, d)/2;
      g.add(cyl(.05, .06, 5, metal(), 0, 0, 0, 8),
            box(.03, 1.6, R*1.4, mat(c, { roughness: .7 }), 0, 3.2, R*.7));
      break;
    }
    case 'lightbox': {
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      g.add(cyl(.06, .07, 2.4, metal(), -L*.35, 0, 0, 8), cyl(.06, .07, 2.4, metal(), L*.35, 0, 0, 8));
      g.add(hz ? box(L, T*.8, .18, mat('#24282c', { roughness: .5 }), 0, 2.4, 0)
               : box(.18, T*.8, L, mat('#24282c', { roughness: .5 }), 0, 2.4, 0));
      g.add(hz ? box(L*.9, T*.6, .02, glowMat('#eaf6ff', '#bfe6ff', .6), 0, 2.5, .1)
               : box(.02, T*.6, L*.9, glowMat('#eaf6ff', '#bfe6ff', .6), .1, 2.5, 0));
      break;
    }

    /* ---------- 沙盘 · 运动补充 ---------- */
    case 'halfcourt': {
      const white = mat('#f4f7f4', { roughness: .85 });
      const L = Math.min(w*.86, 15), Wd = Math.min(d*.8, L*.58), k = L/15;
      g.add(rbox(w, .03, d, mat(c, { roughness: .95 }), 0, 0, 0, .1));
      g.add(rbox(L, .012, Wd, mat(darker(c, .9), { roughness: .95 }), 0, .03, 0, .02));
      flatRect(g, -L/2, -Wd/2, L/2, Wd/2, .05, white, .044);
      flatArc(g, -L/2, 0, 1.8*k, -Math.PI/2, Math.PI/2, .05, white, .044);
      const hx = L/2 - 1.575*k;
      g.add(cyl(.11, .13, 3.05, metal(), L/2 + .5, 0, 0, 12),
            rod([L/2 + .5, 3.05, 0], [hx + .3, 3.05, 0], .06, metal()),
            box(.05, .9, 1.8, mat('#e9eef0', { roughness: .5 }), hx + .3, 2.9, 0),
            ring(.23, .02, mat('#e0662f', { metalness: .5, roughness: .4 }), hx, 3.05, 0));
      break;
    }
    case 'gateball': {
      const white = mat('#f4f7f4', { roughness: .85 });
      const L = Math.min(w*.9, 20), Wd = Math.min(d*.75, 15);
      g.add(rbox(w, .03, d, mat(c, { roughness: .95 }), 0, 0, 0, .1));
      flatRect(g, -L/2, -Wd/2, L/2, Wd/2, .05, white, .044);
      [[-L/2 + .5, 0], [L/2 - .5, -Wd*.3], [L/2 - .5, Wd*.3]].forEach(([px, pz]) =>
        g.add(rbox(.5, .5, 1.2, mat('#c4553f', { roughness: .7 }), px, .04, pz, .02)));
      break;
    }
    case 'skatepark': {
      const conc = mat('#9aa3a8', { roughness: .9 }), rail = metal();
      g.add(rbox(w, .06, d, conc, 0, 0, 0, .2));
      g.add(lathe([[2, 0], [2.2, .6], [1.2, 1.2], [0, 1.3]], mat('#8d949c', { roughness: .85 }), -w*.2, .06, -d*.08, 24));
      g.add(lathe([[2.6, 0], [2.4, .5], [1.4, 1], [0, 1.1]], mat('#b0b6ba', { roughness: .85 }), w*.2, .06, d*.1, 24));
      for (let i = 0; i < 2; i++) g.add(rod([-w*.1 + i*w*.2, .06, d*.32], [-w*.02 + i*w*.2, 1.1, d*.32], .04, rail));
      break;
    }
    case 'loopwalk': {
      const rx = w*.44, rz = d*.4, n = 48;
      for (let i = 0; i < n; i++){
        const a0 = i/n*Math.PI*2, a1 = (i + 1)/n*Math.PI*2;
        flatLine(g, Math.cos(a0)*rx, Math.sin(a0)*rz, Math.cos(a1)*rx, Math.sin(a1)*rz, 4, mat(c, { roughness: .95 }), .03);
      }
      g.add(blob(rx*.92, .02, rz*.92, mat('#7fa86a', { roughness: .98 }), 0, .01, 0, 32));
      break;
    }
    case 'petpark': {
      const fence = mat('#b98a5a', { roughness: .7 }), grass = mat(c, { roughness: .95 });
      g.add(rbox(w, .03, d, grass, 0, 0, 0, .3));
      const n = Math.max(4, Math.round(w/2));
      for (let i = 0; i <= n; i++){
        g.add(cyl(.05, .05, 1.2, fence, -w/2 + w*i/n, .03, -d/2, 6),
              cyl(.05, .05, 1.2, fence, -w/2 + w*i/n, .03, d/2, 6));
      }
      g.add(ring(1.1, .12, mat('#c4553f', { roughness: .6 }), -w*.2, .03, 0),
            ring(1.0, .12, mat('#2f6fa8', { roughness: .6 }), w*.15, .03, d*.1));
      g.add(cyl(.45, .55, .18, mat('#6fb6c8', { roughness: .4 }), w*.3, .03, -d*.2, 16));
      break;
    }
    case 'seniorarea': {
      const stone = mat(c, { roughness: .8 }), steel = metal();
      g.add(rbox(w, .04, d, stone, 0, 0, 0, .2));
      for (let i = 0; i < 4; i++){
        const px = -w*.3 + w*.2*i;
        g.add(rod([px, 0, -d*.2], [px, 1.6, -d*.2], .05, steel), rod([px - .5, 1.6, -d*.2], [px + .5, 1.6, -d*.2], .04, steel));
      }
      g.add(box(w*.4, .45, .5, woodM('#b98a5a'), -w*.2, .04, d*.24),
            box(w*.4, .45, .08, woodM('#b98a5a'), -w*.2, .5, d*.44));
      break;
    }

    /* ---------- 沙盘 · 地下补充 ---------- */
    case 'civildefense': {
      const conc = mat('#b9b6b0', { roughness: .9 }), t = .4;
      g.add(box(w, .12, d, conc, 0, 0, 0));
      g.add(box(w, 2.8, t, conc, 0, 0, -d/2 + t/2), box(w, 2.8, t, conc, 0, 0, d/2 - t/2),
            box(t, 2.8, d, conc, -w/2 + t/2, 0, 0), box(t, 2.8, d, conc, w/2 - t/2, 0, 0));
      g.add(box(2.4, 2.4, .25, mat('#5d666d', { metalness: .5, roughness: .4 }), w*.42, .12, d/2 - t/2));
      g.add(box(w*.86, .1, d*.86, mat('#8d8a84', { roughness: .9 }), 0, .12, 0));
      break;
    }
    case 'storageroom': {
      const conc = mat('#b9b6b0', { roughness: .9 }), shelf = metal(), t = .15;
      g.add(box(w, .1, d, conc, 0, 0, 0));
      g.add(box(w, 2.6, t, conc, 0, 0, -d/2 + t/2), box(w, 2.6, t, conc, 0, 0, d/2 - t/2),
            box(t, 2.6, d, conc, -w/2 + t/2, 0, 0), box(t, 2.6, d, conc, w/2 - t/2, 0, 0));
      for (let i = 0; i < 3; i++){
        g.add(box(w*.84, .04, .5, shelf, 0, .5 + i*.6, -d*.2),
              box(w*.84, .04, .5, shelf, 0, .5 + i*.6, d*.2));
      }
      break;
    }
    case 'equipmentroom': {
      const conc = mat('#b9b6b0', { roughness: .9 }), t = .2, steel = metal();
      g.add(box(w, .1, d, conc, 0, 0, 0));
      g.add(box(w, 2.8, t, conc, 0, 0, -d/2 + t/2), box(w, 2.8, t, conc, 0, 0, d/2 - t/2),
            box(t, 2.8, d, conc, -w/2 + t/2, 0, 0), box(t, 2.8, d, conc, w/2 - t/2, 0, 0));
      [-1, 1].forEach(s => {
        g.add(rbox(w*.3, 1.4, d*.26, mat('#8d949c', { metalness: .4, roughness: .5 }), s*w*.22, .1, -d*.16, .05));
        g.add(cyl(.28, .28, .5, steel, s*w*.22, 1.5, -d*.16, 12));
      });
      break;
    }

    /* ---------- 沙盘 · 施工 ---------- */
    case 'crane': {
      const steel = mat('#e8b04a', { metalness: .5, roughness: .5 }), dark = mat('#3a3f44', { roughness: .6 });
      g.add(box(w, .6, d, dark, 0, 0, 0));
      for (let i = 0; i < 16; i++)
        g.add(box(.18, 2.5, .18, steel, -w*.22 + w*.44*(i%2), .6 + i*2.5, -d*.18 + d*.36*(i%2)));
      // 起重臂（约 24m）与平衡臂
      g.add(box(w*8, .35, .35, steel, w*3.4, 40.6, 0));
      g.add(box(w*2, .5, .5, dark, -w*1.2, 40.4, 0));
      g.add(rod([w*7.4, 40.9, 0], [w*7.4, 33, 0], .025, dark));
      g.add(box(.5, .5, .5, mat('#c4553f', { roughness: .6 }), w*7.4, 32.7, 0));
      break;
    }
    case 'foundationpit': {
      const soil = mat('#8d8a84', { roughness: 1 }), conc = mat('#b9b6b0', { roughness: .9 });
      g.add(box(w, .2, d*.12, soil, 0, 0, -d*.44), box(w, .2, d*.12, soil, 0, 0, d*.44),
            box(w*.12, .2, d, soil, -w*.44, 0, 0), box(w*.12, .2, d, soil, w*.44, 0, 0));
      g.add(box(w*.76, .1, d*.76, mat('#6f6b64', { roughness: 1 }), 0, -4, 0));
      [-1, 1].forEach(s => {
        g.add(box(w*.76, 4, .2, conc, 0, -4, s*d*.38));
        g.add(box(.2, 4, d*.76, conc, s*w*.38, -4, 0));
      });
      for (let i = 0; i < 4; i++) g.add(box(w*.7, .18, .18, metal(), 0, -1.2, -d*.3 + d*.2*i));
      break;
    }
    case 'constructionroad': {
      g.add(box(w, .06, d, mat(c, { roughness: 1 }), 0, 0, 0));
      [-1, 1].forEach(s => {
        for (let q = -w/2; q < w/2; q += 2.4)
          flatLine(g, q, s*d*.22, Math.min(q + 1.2, w/2), s*d*.22, .25, mat('#8d8a84', { roughness: 1 }), .07);
      });
      break;
    }
    case 'materialyard': {
      const pipe = mat('#8d949c', { metalness: .4, roughness: .6 }), brick = mat('#b98a5a', { roughness: .8 }), soil = mat('#6b5540', { roughness: 1 });
      g.add(box(w, .04, d, mat(c, { roughness: 1 }), 0, 0, 0));
      for (let i = 0; i < 5; i++){
        const p = cyl(.3, .3, 6, pipe, -w*.3 + i*.7, 0, -d*.24, 14);
        p.rotation.z = Math.PI/2;
        p.position.y = .34;
        g.add(p);
      }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
        g.add(rbox(2.2, .5, 1.2, brick, w*.2 + j*2.4, .04 + i*.5, 0, .03));
      g.add(blob(w*.14, 1.2, d*.16, soil, 0, .04, d*.28, 16));
      break;
    }

    /* ---------- 商业 · 公共 ---------- */
    case 'shelf': {
      // 货架：铝型材立柱 + 三层木搁板 + 顶部价签条
      const fm = metal(), wm2 = woodM('#c8b49a');
      [-1, 1].forEach(sx => [-1, 1].forEach(sz =>
        g.add(box(.04, 1.9, .04, fm, sx*(w/2 - .03), 0, sz*(d/2 - .03)))));
      [.32, .86, 1.4].forEach(y => g.add(box(w - .02, .028, d - .02, wm2, 0, y, 0)));
      g.add(box(w - .02, .09, .03, mat('#e9e6df', { roughness: .8 }), 0, 1.6, -d/2 + .02));
      g.add(box(w - .02, .04, d - .02, fm, 0, 1.9, 0));
      break;
    }
    case 'cashier': {
      // 收银台：柜台体 + 台面 + 收银机 + 屏幕
      g.add(rbox(w, .88, d*.9, mat(darker(c, .92), { roughness: .7 }), 0, 0, -.02, .03));
      g.add(box(w + .03, .05, d*.94, ceramic('#f0ebe2'), 0, .88));
      g.add(rbox(.34, .3, .3, mat('#2b2b2d', { roughness: .45 }), w*.24, .93, 0, .02));
      g.add(box(.24, .15, .012, screenMat('#274a63'), w*.24, 1.1, -.08));
      g.add(box(w*.92, .03, .05, metal(), 0, .93, d*.36));
      break;
    }
    case 'signpost': {
      // 导视立牌：底座 + 深色立板 + 三条发光信息条
      const hz = w >= d, L = hz ? w : d, T = Math.max(.06, Math.min(w, d));
      const dark = mat('#34383c', { roughness: .45, metalness: .25 });
      g.add(box(hz ? L*.6 : T*1.1, .05, hz ? T*1.1 : L*.6, metal(), 0, 0, 0));
      g.add(box(hz ? L : T, 1.85, hz ? T : L, dark, 0, .05, 0));
      [.7, 1.05, 1.4].forEach(y => {
        const len = L*(y > 1.3 ? .34 : .58);
        const lm = mat('#f4f8fb', { roughness: .5, emissive: '#cfe2ee', emissiveIntensity: .5 });
        g.add(hz ? box(len, .1, .012, lm, 0, y, -T/2 - .006)
                 : box(.012, .1, len, lm, -T/2 - .006, y, 0));
      });
      break;
    }
    case 'bin': {
      // 垃圾箱：桶身 + 桶盖 + 内胆口
      const r = Math.min(w, d)/2;
      g.add(cyl(r*.95, r*.88, .72, mat(c, { roughness: .6, metalness: .2 }), 0, 0, 0));
      g.add(cyl(r*.99, r*.99, .05, blackMetal(), 0, .72, 0));
      g.add(cyl(r*.66, r*.66, .045, mat('#22252a', { roughness: .85 }), 0, .735, 0));
      break;
    }
    case 'bench': {
      // 长椅：座板 + 靠背 + 两条钢腿
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d), bd = T*.42, wk = woodM(c);
      g.add(hz ? box(L, .06, bd, wk, 0, .42, 0) : box(bd, .06, L, wk, 0, .42, 0));
      g.add(hz ? box(L, .1, .05, wk, 0, .72, bd/2 - .02) : box(.05, .1, L, wk, bd/2 - .02, .72, 0));
      [-1, 1].forEach(s => g.add(hz
        ? box(.06, .42, bd*.9, metal(), s*(L/2 - .3), 0, 0)
        : box(bd*.9, .42, .06, metal(), 0, 0, s*(L/2 - .3))));
      break;
    }
    case 'kiosk': {
      // 中岛摊位：柜台 + 台面 + 四角立柱 + 发光顶棚 + 台面陈列
      const cm = mat(c, { roughness: .5 }), stone = mat('#f4efe6', { roughness: .25 }), hh = 1.0;
      const n = Math.max(1, Math.round((w - .2)/.8));
      g.add(box(w, hh - .1, .1, cm, 0, 0, bz + .05),
            box(.1, hh - .1, d, cm, -w/2 + .05, 0, 0),
            box(.1, hh - .1, d, cm, w/2 - .05, 0, 0),
            box(w*.4, hh - .1, .1, cm, 0, 0, d/2 - .05));
      g.add(rbox(w, .06, d, stone, 0, hh - .06, 0, .01));
      g.add(box(w, .08, d, mat(darker(c, .85), { roughness: .6 }), 0, 2.1, 0),
            box(w*.7, .02, d*.7, glowMat('#fffdf6', '#ffe9c4', .6), 0, 2.08, 0));
      [-1, 1].forEach(s => {
        g.add(cyl(.05, .05, 2.08, metal(), s*(w/2 - .12), 0, bz + .12, 12),
              cyl(.05, .05, 2.08, metal(), s*(w/2 - .12), 0, d/2 - .12, 12));
      });
      const goods = ['#d9b36c', '#b5463a', '#6f8f8a'];
      for (let i = 0; i < n; i++)
        g.add(rbox(.28, .1, .28, mat(goods[i % 3], { roughness: .6 }), -w/2 + .45 + i*.8, hh, -.1, .02));
      break;
    }

    /* ---------- 商业 · 餐饮 ---------- */
    case 'hotpot': {
      // 火锅桌：方桌 + 中央铜锅（红汤 + 烟囱）+ 四角小料碗与菜品
      const tm = woodM(c), lw = woodM(darker(c, .5)), top = .75, R = Math.min(w, d)*.28;
      legs(g, w, d, top - .05, lw, .08, .024);
      g.add(rbox(w, .05, d, tm, 0, top - .05, 0, .015));
      const cop = mat('#b9793f', { metalness: .78, roughness: .3 });
      g.add(lathe([[R*.55, 0], [R*.98, 0], [R*1.02, .03], [R*1.04, .2]], cop, 0, top, 0, 40),
            cyl(R*.95, R*.95, .012, mat('#c2452c', { roughness: .22 }), 0, top + .2, 0, 40),
            cyl(R*.3, R*.34, .3, cop, 0, top + .2, 0, 24),
            cyl(R*.36, R*.36, .02, mat('#8d5a2c', { metalness: .7, roughness: .35 }), 0, top + .5, 0, 24));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
        const px = a*(w/2 - .16), pz = b*(d/2 - .16);
        g.add(lathe([[0, 0], [.05, 0], [.065, .03], [.05, .05]], ceramic({ side: THREE.DoubleSide }), px, top, pz, 24),
              rod([px - .08, top + .012, pz + .1], [px + .08, top + .012, pz + .07], .004, woodM('#8d7258')));
      });
      [0, 1, 2].forEach(k => {
        const a = k*2.1 + .6;
        plate(g, .1, Math.cos(a)*R*1.4, top + .002, Math.sin(a)*R*1.4);
      });
      break;
    }
    case 'chinesetable': {
      // 中餐圆桌：独腿圆桌 + 中心转盘 + 一圈餐椅（整桌一件家具）
      const R = Math.min(w, d)/2, top = .76, lw = woodM(darker(c, .62));
      g.add(lathe([[R*.3, 0], [R*.3, .02], [R*.24, .05], [.09, .2], [.07, .5], [.12, top - .1], [R*.55, top - .03]], lw, 0, 0, 0, 40),
            cyl(R, R, .04, mat(c, { roughness: .42 }), 0, top - .04, 0, 64),
            cyl(R*.42, R*.42, .04, mat('#f0e6d6', { roughness: .3 }), 0, top, 0, 48));
      for (let k = 0; k < 8; k++){
        const a = k*Math.PI/4 + .2;
        plate(g, .1, Math.cos(a)*R*.7, top + .002, Math.sin(a)*R*.7);
        plate(g, .08, Math.cos(a)*R*.3, top + .045, Math.sin(a)*R*.3);
      }
      for (let k = 0; k < 10; k++){
        const a = k/10*Math.PI*2, px = Math.cos(a)*R*1.06, pz = Math.sin(a)*R*1.06;
        g.add(cyl(.1, .13, .42, lw, px, 0, pz, 16),
              cyl(.19, .19, .05, fabric('#cfc6b8'), px, .42, pz, 24));
      }
      break;
    }
    case 'diningbooth': {
      // 卡座：两侧软包靠背 + 座垫 + 中间餐桌
      const bh = Math.min(.62, d*.24), fab = fabric(c), lw = woodM(darker(c, .62));
      g.add(rbox(w, bh, .16, fab, 0, 0, bz + .08, .035),
            rbox(w, bh, .16, fab, 0, 0, d/2 - .08, .035),
            rbox(w*.94, .12, d*.28, fabric(darker(c, .92)), 0, .44, bz + d*.18, .03),
            rbox(w*.94, .12, d*.28, fabric(darker(c, .92)), 0, .44, d/2 - d*.18, .03));
      g.add(rbox(w*.9, .05, d*.36, woodM('#e6dccb'), 0, .72, 0, .012),
            box(.1, .7, d*.2, lw, 0, 0, 0));
      [-1, 1].forEach(s => plate(g, .1, s*w*.22, .75, 0));
      break;
    }
    case 'barcounter': {
      // 吧台：台体 + 石材台面 + 脚踏杆 + 背吧酒架 + 外侧吧椅
      const cm = mat(c, { roughness: .5 }), stone = mat('#2f3338', { roughness: .18 });
      const hh = 1.05, n = Math.max(2, Math.round(w/.7));
      g.add(box(w - .02, hh - .06, d - .06, cm, 0, 0, -.02),
            box(w, .06, d, stone, 0, hh - .06, 0),
            box(w - .1, .1, d - .14, '#3a3834', 0, 0, -.04),
            rod([-w/2 + .12, .24, d/2 - .07], [w/2 - .12, .24, d/2 - .07], .012, chrome()));
      // 背吧：高柜 + 两层酒瓶
      g.add(box(w, 1.5, .18, mat(darker(c, .78), { roughness: .6 }), 0, 0, bz + .09));
      const cols = ['#a8452f', '#c9a24a', '#6f8f4a', '#8d94a3'];
      const nb = n*3;
      for (let i = 0; i < nb; i++){
        const x = -w/2 + .18 + (w - .36)*i/Math.max(1, nb - 1);
        g.add(cyl(.035, .035, .24, mat(cols[i % 4], { roughness: .2, metalness: .2 }), x, 1.02, bz + .2, 14),
              cyl(.03, .03, .22, mat(cols[(i + 2) % 4], { roughness: .2 }), x, .76, bz + .2, 14));
      }
      for (let i = 0; i < n; i++){
        const x = -w/2 + w*(i + .5)/n, pz = d/2 + .3;
        g.add(cyl(.04, .06, .72, blackMetal(), x, 0, pz, 12),
              cyl(.18, .18, .06, fabric('#6b5d4c'), x, .72, pz, 20));
      }
      break;
    }
    case 'teabar': {
      // 奶茶操作台：柜体 + 台面设备（封口机 / 制冰机 / 果糖机）+ 取餐台 + 菜单灯箱
      const cm = mat(c, { roughness: .45 }), stone = mat('#efeae0', { roughness: .2 }), hh = .95;
      g.add(box(w - .02, hh - .08, d - .06, cm, 0, 0, -.02),
            box(w, .05, d, stone, 0, hh - .05, 0),
            box(w, .06, .22, stone, 0, hh - .05, d/2 - .11));
      [['#cfd8dd', .3], ['#9fb3bd', .42], ['#d8cfc2', .26]].forEach(([cc, dh], i) => {
        const x = -w/2 + w*(.22 + i*.28);
        g.add(rbox(.38, dh, .34, mat(cc, { roughness: .35 }), x, hh, -.02, .03),
              box(.2, .06, .012, screenMat('#2f8f7a'), x, hh + dh*.55, .15));
      });
      g.add(box(w, .9, .06, mat(darker(c, .85), { roughness: .6 }), 0, 1.2, bz + .03));
      [0, 1, 2].forEach(i => g.add(
        box(w*.7, .1, .012, glowMat('#fffdf6', '#ffe9c4', .5), 0, 1.26 + i*.16, bz + .07)));
      break;
    }
    case 'kitchenline': {
      // 商用操作台：不锈钢柜体 + 台面（水池 / 灶眼）+ 上方排烟罩
      const st = mat('#c7ccd1', { metalness: .85, roughness: .3 }), hh = .88;
      const n = Math.max(2, Math.round(w/.9));
      g.add(box(w, .1, d - .1, '#4a4641', 0, 0, -.04),
            box(w, hh - .12, d - .04, st, 0, .1, -.02),
            rbox(w + .02, .05, d, st, 0, hh - .01, 0, .004),
            box(w, .1, .02, st, 0, hh + .04, bz + .01));
      for (let i = 0; i < n; i++){
        const x0 = -w/2 + w*i/n, cw = w/n;
        if (i % 3 === 1) g.add(shell(cw*.6, d*.6, .02, .015, .04, st, x0 + cw/2, hh + .04, .02));
        else for (let k = 0; k < 2; k++)
          g.add(cyl(.11, .12, .012, mat('#2b2b2b', { roughness: .4 }), x0 + cw*(.3 + k*.4), hh + .04, .02, 24));
      }
      g.add(box(w, .06, d*.8, mat('#d5d9dc', { metalness: .6, roughness: .35 }), 0, 1.98, -.05));
      break;
    }

    /* ---------- 商业 · 零售 ---------- */
    case 'clothesrack': {
      // 服装陈列架：底框 + 立柱 + 挂衣杆 + 一排衣架与衣身
      const mt = metal(), hh = 1.55;
      [-1, 1].forEach(s => {
        g.add(rbox(.05, hh, .05, mt, s*(w/2 - .04), 0, 0, .01),
              box(.14, .03, d*.7, mt, s*(w/2 - .04), 0, 0));
      });
      g.add(rod([-w/2 + .04, hh, 0], [w/2 - .04, hh, 0], .016, chrome()));
      const n = Math.max(4, Math.round(w/.22));
      const cols = ['#c9d6df', '#d8c7dc', '#e8d5b5', '#b7c4b0', '#c3cbd6', '#e2cfb4'];
      for (let i = 0; i < n; i++){
        const x = -w/2 + .1 + (w - .2)*(i + .5)/n, cc = cols[i % cols.length];
        g.add(rod([x, hh, 0], [x, hh - .09, 0], .006, hwMat(), .004, 6),
              box(w/n*.7, .6, .035, fabric(cc), x, hh - .66, 0),
              box(w/n*.82, .09, .05, fabric(darker(cc, .85)), x, hh - .2, 0));
      }
      break;
    }
    case 'mannequin': {
      // 模特：圆底座 + 支撑杆 + 躯干 + 下身 + 头与手臂
      const r = Math.min(w, d)/2, m = mat(c, { roughness: .5 });
      g.add(cyl(r*.62, r*.74, .04, mat('#8d8070', { roughness: .6 }), 0, 0, 0, 20),
            rod([0, .03, 0], [0, .42, 0], .02, chrome()),
            cyl(r*.32, r*.46, .5, m, 0, .42, 0, 16),
            blob(r*.6, .3, r*.34, m, 0, .98, 0, 20),
            rod([0, 1.22, 0], [0, 1.3, 0], .05, m),
            blob(.075, .09, .075, m, 0, 1.38, 0, 16));
      [-1, 1].forEach(s => g.add(rod([s*r*.52, 1.12, 0], [s*r*.66, .78, 0], .045, m, .034)));
      break;
    }
    case 'fittingroom': {
      // 试衣间：三面隔板 + 顶板 + 拉帘 + 内侧镜子
      const wm = woodM(c), hh = 2.1, t = .06;
      g.add(box(w, hh, t, wm, 0, 0, bz + t/2),
            box(t, hh, d, wm, -w/2 + t/2, 0, 0),
            box(t, hh, d, wm, w/2 - t/2, 0, 0),
            box(w, .05, d, wm, 0, hh, 0));
      for (let i = 0; i < 6; i++)
        g.add(rbox(w/7, hh - .16, .05, fabric('#e9e0d2'), -w/2 + .1 + i*w/7, .06, d/2 - .05, .02));
      g.add(rod([-w/2 + .04, hh - .06, d/2 - .05], [w/2 - .04, hh - .06, d/2 - .05], .012, chrome()),
            box(w*.64, 1.4, .02, mat('#1d1d1f', { roughness: .4 }), 0, .35, bz + t + .01),
            box(w*.6, 1.34, .004, mirror(), 0, .38, bz + t + .022));
      break;
    }
    case 'displaycounter': {
      // 展示柜：柜体 + 玻璃罩（三面）+ 金属压条 + 展品
      const cm = mat(c, { roughness: .5 }), hh = .92, gh = .38;
      const n = Math.max(2, Math.round(w/.45));
      g.add(box(w, .1, d - .06, '#3a3834', 0, 0, -.03),
            box(w, hh - .16, d - .02, cm, 0, .1, -.01),
            box(w, .04, d, mat('#e9e3d8', { roughness: .35 }), 0, hh, 0));
      const gy = hh + .04;
      [[w, .02, 0, bz + .01], [.02, d, -w/2 + .01, 0], [.02, d, w/2 - .01, 0]].forEach(([gw, gd, px, pz]) => {
        const pane = box(gw, gh, gd, glassMat, px, gy, pz);
        pane.castShadow = false; g.add(pane);
      });
      g.add(box(w, .03, .03, metal(), 0, gy + gh, bz + .015));
      for (let i = 0; i < n; i++)
        g.add(rbox(w/n*.6, .12, d*.4, mat('#e8eef2', { roughness: .3 }), -w/2 + w*(i + .5)/n, gy + .02, 0, .02));
      break;
    }
    case 'phonestand': {
      // 手机展台：深色台体 + 台面金属压边 + 两排样机托架 + 台边灯带
      const dm = mat(c, { roughness: .3, metalness: .35 }), hh = .78;
      g.add(box(w, .1, d - .1, '#22262a', 0, 0, -.05),
            rbox(w, hh - .1, d - .06, dm, 0, .1, -.03, .05),
            rbox(w + .02, .03, d + .02, mat('#4a4f55', { roughness: .25, metalness: .5 }), 0, hh, 0, .015));
      const cols = Math.max(4, Math.round(w/.55)), pw = w/cols;
      for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++){
        const x = -w/2 + pw*(i + .5), z = bz + d*(.28 + j*.36);
        g.add(rbox(pw*.3, .02, .16, chrome(), x, hh + .03, z, .006),
              rbox(pw*.26, .1, .012, mat('#1d1f22', { roughness: .2, metalness: .4 }), x, hh + .05, z, .004));
      }
      g.add(box(w*.5, .006, .02, glowMat('#eaf6ff', '#bfe6ff', .7), 0, hh + .03, d/2 - .06));
      break;
    }
    case 'carstand': {
      // 汽车展台：矮平台 + 四面灯带 + 四角射灯
      const hh = .12, pm = mat(c, { roughness: .35 });
      g.add(rbox(w, hh, d, pm, 0, 0, 0, .06));
      const led = glowMat('#eaf6ff', '#bfe6ff', .8);
      [-1, 1].forEach(s => {
        g.add(box(w, .012, .05, led, 0, hh - .012, s*(d/2 - .03)),
              box(.05, .012, d, led, s*(w/2 - .03), hh - .012, 0));
      });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
        g.add(cyl(.16, .16, .01, glowMat('#fffbe8', '#ffe9a8', .9), a*(w*.28), hh + .001, b*(d*.28), 24));
      });
      break;
    }
    case 'gondola': {
      // 超市中岛货架：中间背板 + 两侧层板与商品 + 底座
      const mt = metal(), wm2 = woodM('#c8b49a'), hh = 1.45;
      const goods = ['#d9b36c', '#b5463a', '#6f8f8a', '#e6dccd', '#8d94a3'];
      g.add(box(w - .04, hh, .04, mt, 0, 0, 0),
            box(w - .04, .1, d, mat('#dfe4e8', { roughness: .7 }), 0, 0, 0));
      [-1, 1].forEach(s => {
        [.38, .78, 1.18].forEach(y => {
          g.add(box(w - .04, .028, d*.44, wm2, 0, y, s*d*.24));
          for (let i = 0; i < 5; i++)
            g.add(box((w - .4)/5*.82, .13, d*.3, mat(goods[i % 5], { roughness: .7 }),
              -w/2 + .2 + (w - .4)*i/4, y + .03, s*d*.24));
        });
      });
      break;
    }
    case 'freezer': {
      // 冷藏柜：柜体 + 台面 + 玻璃上盖 + 柜内商品
      const bm = mat('#c9ced3', { roughness: .35, metalness: .3 }), hh = .9;
      g.add(box(w - .02, hh - .08, d - .04, bm, 0, 0, 0),
            rbox(w, .08, d, mat('#eef3f6', { roughness: .3 }), 0, hh - .08, 0, .02),
            box(w - .06, .02, d - .06, mat('#dfe8ec', { roughness: .5 }), 0, hh - .06, 0));
      const pane = box(w - .1, .02, d - .1, glassMat, 0, hh + .02, 0);
      pane.castShadow = false; g.add(pane);
      ['#d0523f', '#e0a23a', '#7aa94f', '#c4577d'].forEach((cc, i) => {
        g.add(box(w*.18, .14, d*.5, mat(cc, { roughness: .7 }), -w/2 + .12 + (w - .24)*i/3, hh - .2, 0));
      });
      break;
    }
    case 'produce': {
      // 果蔬陈列台：台体 + 两层倾斜料槽 + 果蔬 + 价签
      const wm2 = woodM(c), hh = .78;
      const cols = Math.max(2, Math.round(w/.6)), fruit = ['#d0523f', '#e0a23a', '#7aa94f', '#c4577d', '#e8c14f'];
      g.add(rbox(w, hh - .06, d, wm2, 0, 0, 0, .03));
      for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++){
        const x = -w/2 + w*(i + .5)/cols, z = bz + d*(.25 + j*.5);
        g.add(box(w/cols*.86, .04, d*.4, mat('#f6f2e8', { roughness: .7 }), x, hh - .06, z));
        for (let k = 0; k < 5; k++){
          const a = k*1.26 + i + j;
          g.add(blob(.05, .045, .05, mat(fruit[(k + i) % 5], { roughness: .75 }),
            x + Math.cos(a)*w/cols*.3, hh + .01, z + Math.sin(a)*d*.14, 12));
        }
      }
      g.add(box(w*.3, .12, .012, mat('#f2f4f5', { roughness: .5 }), -w*.2, hh + .02, d/2 - .05));
      break;
    }
    case 'cart': {
      // 购物车：车篮三面 + 底网 + 推杆 + 四轮
      const mt = metal(), hw = w/2, hd = d/2;
      const netM = mat(darker(c, .8), { roughness: .5, metalness: .4 });
      g.add(box(w*.84, .5, .03, netM, 0, .35, -hd*.5),
            box(.03, .5, d*.7, netM, -hw*.42, .35, 0),
            box(.03, .5, d*.7, netM, hw*.42, .35, 0),
            box(w*.84, .03, d*.7, mt, 0, .32, 0));
      g.add(rod([-hw*.42, .35, hd*.5], [-hw*.36, 1.0, hd*.4], .02, mt),
            rod([hw*.42, .35, hd*.5], [hw*.36, 1.0, hd*.4], .02, mt),
            rod([-hw*.36, 1.0, hd*.4], [hw*.36, 1.0, hd*.4], .022, mat('#2b2e33', { roughness: .6 })));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(
        rot(cyl(.05, .05, .03, mat('#2b2e33', { roughness: .8 }), a*hw*.8, .05, b*hd*.7, 12), Math.PI/2, 0, 0)));
      break;
    }
    default: g.add(box(w, .8, d, c));
  }
  // 零件级几何合并：一件家具从几十上百个 Mesh 压到「材质数」个 Mesh（详见 bake.js）。
  // 可交互动画件（道闸摆臂 / 大门门扇 / 喷泉水柱）要保留独立 Group 才能逐帧改 transform，
  // 先从合并里摘出来，等静态部分烘焙完再挂回去。
  const keep = g.userData.animKeep;
  if (keep && keep.length){
    for (const o of keep) o.removeFromParent();
    bakeGroup(g);
    for (const o of keep) g.add(o);
  } else {
    bakeGroup(g);
  }
  return placeGroup(g, f);
}

