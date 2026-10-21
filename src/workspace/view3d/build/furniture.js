import * as THREE from 'three';
import { M, wx, wz, H } from '@/workspace/view3d/coords.js';
import { mat, glassMat, metal, chrome, hwMat, blackMetal, mirror, ceramic, fabric, woodM, screenMat, glowMat, darker, lighter, rng } from './materials.js';
import { sh, mesh, rot, box, rbox, cyl, lathe, rod, tube, blob, ring, shell, legs, pull, knob, fronts, vase, tableLamp, plate, showerModel, ovalPan } from './primitives.js';

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

export function buildFurniture(f, riseH = H, clipTop = Infinity){
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
          g.add(box(bw, bh, bd, mat(cols[Math.floor(R()*8)], { roughness: .75 }), x + bw/2, yb, d/2 - .015 - bd/2));
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
      const N = 20 + Math.round(r*36), sc = Math.sqrt(r/.25);
      for (let k = 0; k < N; k++){
        const t = k/N, a = k*2.399 + R()*.3, len = (.14 + R()*.08)*(1.1 - t*.4)*sc, s0 = .03 + R()*.08*sc;
        const p = new THREE.Group();
        p.position.set(0, H*(.42 + .58*t), 0);
        p.rotation.set(0, -a, .1 + t*.5 + R()*.3, 'YXZ');
        const lf = blob(len/2, .005, len*.27, lm[k % 2], s0 + len/2, 0, 0, 16);
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
      const tall = f.type === 'suv', mpv = f.type === 'mpv';
      const paint = mat(c, { metalness: .5, roughness: .32 });
      const trimM = mat('#2b2e33', { roughness: .55 });
      const glass = mat('#202c34', { metalness: .35, roughness: .1, transparent: true, opacity: .88 });
      const tyre = mat('#191a1c', { roughness: .95 });
      const rimM = chrome();
      const headM = mat('#fff8e6', { emissive: '#fff0c8', emissiveIntensity: .45, roughness: .25 });
      const tailM = mat('#c0392b', { emissive: '#7d1d13', emissiveIntensity: .4, roughness: .35 });
      const y0 = .16, lowH = tall ? .74 : mpv ? .64 : .46, cabH = tall ? .74 : mpv ? .8 : .5;
      const cabL = w * (mpv ? .64 : tall ? .56 : .5);
      const cabX = -w/2 + w * (mpv ? .17 : tall ? .24 : .27) + cabL/2;
      const cwid = d * (mpv ? .84 : tall ? .82 : .8);

      // 下车身 + 前后保险杠 + 侧裙
      g.add(rbox(w - .05, lowH, d - .06, paint, 0, y0, 0, .11));
      g.add(box(.12, lowH * .46, d - .2, trimM, w/2 - .06, y0 + .03, 0),
            box(.12, lowH * .46, d - .2, trimM, -w/2 + .06, y0 + .03, 0),
            box(w * .74, .09, d - .02, trimM, 0, y0 - .06, 0));
      // 车厢（车顶）+ 玻璃
      g.add(rbox(cabL, cabH, cwid, paint, cabX, y0 + lowH - .02, 0, .15));
      g.add(box(.018, cabH * .56, cwid * .82, glass, cabX + cabL/2 - .05, y0 + lowH + cabH * .2, 0));   // 前风挡
      g.add(box(.018, cabH * .48, cwid * .78, glass, cabX - cabL/2 + .05, y0 + lowH + cabH * .24, 0));  // 后风挡
      [-1, 1].forEach(s => {
        g.add(box(cabL * .66, cabH * .4, .016, glass, cabX, y0 + lowH + cabH * .28, s * cwid/2));       // 侧窗
        g.add(box(.1, .05, .12, trimM, cabX + cabL/2 - .14, y0 + lowH + cabH * .34, s * (cwid/2 + .06))); // 后视镜
      });
      if (tall) [-1, 1].forEach(s => g.add(box(cabL * .8, .03, .05, trimM, cabX, y0 + lowH + cabH, s * cwid * .34)));  // 车顶行李架
      // 四轮（轮胎 + 轮毂），轴线沿 z
      const rr = tall ? .37 : mpv ? .35 : .33;
      [[w * .32, -1], [w * .32, 1], [-w * .32, -1], [-w * .32, 1]].forEach(([px, s]) => {
        const p = new THREE.Group();
        p.position.set(px, rr, s * (d/2 - .16));
        const t0 = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, .24, 20), tyre);
        const r0 = new THREE.Mesh(new THREE.CylinderGeometry(rr * .58, rr * .58, .25, 18), rimM);
        t0.rotation.x = r0.rotation.x = Math.PI/2;
        sh(t0); sh(r0); p.add(t0, r0); g.add(p);
        // 轮眉
        g.add(box(rr * 1.5, .06, .06, trimM, px, rr + rr * .92, s * (d/2 - .1)));
      });
      // 前照灯 / 尾灯 / 牌照
      [-1, 1].forEach(s => {
        g.add(box(.05, .13, .34, headM, w/2 - .03, y0 + lowH * .58, s * d * .3));
        g.add(box(.05, .12, .3, tailM, -w/2 + .03, y0 + lowH * .58, s * d * .3));
      });
      g.add(box(.02, .12, .42, mat('#e8eaec', { roughness: .5 }), -w/2 + .01, y0 + lowH * .3, 0));
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

    default: g.add(box(w, .8, d, c));
  }
  g.position.set(wx(f.cx), 0, wz(f.cy));
  g.rotation.y = -f.rot * Math.PI/180;      // 平面顺时针旋转 → 绕 Y 轴负向
  g.userData.fid = f.id;
  return g;
}

