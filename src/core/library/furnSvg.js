/* ============================================================================
 *  2D 平面家具图例：纯函数，输入类型/尺寸/颜色，返回一段 SVG 片段。
 *  坐标系：家具中心在 (0,0)，+x 向右，+y 向下（与平面图一致）。
 * ========================================================================== */
import { tr } from '@/i18n.js';
import { ICONS } from './assets/icons.js';

function hex2rgb(h){
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(h, k){
  const f = v => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) * 2 : v * k)));
  return '#' + hex2rgb(h).map(v => f(v).toString(16).padStart(2, '0')).join('');
}

const ST = 'stroke="#3d3a34" stroke-width="1" vector-effect="non-scaling-stroke"';
const rc = (x, y, w, h, f, ex = '') => `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${f}" ${ST} ${ex}/>`;
const ec = (cx, cy, rx, ry, f, ex = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${Math.max(0, rx)}" ry="${Math.max(0, ry)}" fill="${f}" ${ST} ${ex}/>`;
const ln = (x1, y1, x2, y2, ex = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${ST} ${ex}/>`;
const pa = (d, f = 'none', ex = '') => `<path d="${d}" fill="${f}" ${ST} ${ex}/>`;
const DASH = 'stroke-dasharray="4 3"';

/* 楼层元素方向标注：箭头指向升高方向；低端（起步端）写「上 / 下」 */
const DIR_ST = 'stroke="#8d7f6c" stroke-width="2" vector-effect="non-scaling-stroke"';
function dirArrow(up, w, d, y){
  const half = Math.min(w, d)*.055;
  const y0 = up ? y + d*.78 : y + d*.22, y1 = up ? y + d*.22 : y + d*.78;
  const s = up ? 1 : -1;
  return `<line x1="0" y1="${y0}" x2="0" y2="${y1}" ${DIR_ST}/>`
       + `<path d="M${-half} ${y1 + s*half}L0 ${y1}L${half} ${y1 + s*half}" fill="none" ${DIR_ST}/>`;
}
function dirText(up, w, d, y){
  const fs = Math.max(110, Math.min(w, d)*.2);
  const ty = up ? y + d*.84 : y + d*.16;
  return `<text x="${w*.76}" y="${ty}" font-size="${fs}" text-anchor="middle" fill="#8d7f6c" font-weight="600">`
    + (up ? tr('上', 'UP') : tr('下', 'DN')) + '</text>';
}

export function furnSVG(t, w, d, c, sd = 1){
  /* 自定义资产优先：assets/<type>/icon.js（参数化）或 icon.svg（见 assets/manifest.js）。
   * 没有对应资产、或资产函数抛错时，退回下面的内置 case —— 保证任何情况下都有图例。 */
  const custom = ICONS[t];
  if (custom){
    try {
      const s = custom(w, d, c, sd);
      if (s) return s;
    } catch (e){
      console.warn('[furnSVG] 自定义图标失败，回退内置图例：', t, e);
    }
  }

  const x = -w/2, y = -d/2, m = Math.min(w, d);
  switch (t){
    case 'bed': {
      let s = rc(x, y, w, d, '#fbf8f2', 'rx="30"') + rc(x, y, w, Math.min(90, d*.05), shade(c, .62), 'rx="20"');
      const ph = Math.min(360, d*.18), py = y + 150;
      if (w >= 1300){ const pw = (w - 240)/2; s += rc(x + 80, py, pw, ph, '#fff', 'rx="70"') + rc(x + 160 + pw, py, pw, ph, '#fff', 'rx="70"'); }
      else s += rc(x + 80, py, w - 160, ph, '#fff', 'rx="70"');
      const by = py + ph + 110, bh = y + d - 15 - by;
      s += rc(x + 15, by, w - 30, bh, c, 'rx="40"') + pa(`M${x + 15} ${by + 300}H${x + w - 15}`, 'none', DASH);
      s += pa(`M${x + w - 15 - Math.min(420, w*.3)} ${by}L${x + w - 15} ${by}L${x + w - 15} ${by + Math.min(420, w*.3)}Z`, shade(c, 1.12));
      return s;
    }
    case 'sofa': case 'armchair': {
      const b = d*.24, a = Math.min(200, w*.13), n = t === 'armchair' ? 1 : (w > 2200 ? 3 : 2), cw = (w - 2*a)/n, dk = shade(c, .85);
      let s = rc(x, y, w, d, dk, 'rx="60"');
      for (let i = 0; i < n; i++) s += rc(x + a + i*cw, y + b, cw, d - b - 40, c, 'rx="40"');
      return s + rc(x, y, w, b, dk, 'rx="50"') + rc(x, y, a, d, dk, 'rx="50"') + rc(x + w - a, y, a, d, dk, 'rx="50"');
    }
    case 'cornersofa': {
      const k = Math.min(950, d*.56, w*.4), b = 220, dk = shade(c, .85);
      let s = pa(`M${x} ${y}H${x + w}V${y + k}H${x + k}V${y + d}H${x}Z`, dk);
      const cw = (w - b - 200)/2;
      s += rc(x + b, y + b, cw, k - b - 30, c, 'rx="40"') + rc(x + b + cw, y + b, cw, k - b - 30, c, 'rx="40"') + rc(x + b, y + k, k - b - 30, d - k - 200, c, 'rx="40"');
      return s + rc(x, y, w, b, dk, 'rx="50"') + rc(x, y, b, d, dk, 'rx="50"') + rc(x + w - 200, y, 200, k, dk, 'rx="50"') + rc(x, y + d - 200, k, 200, dk, 'rx="50"');
    }
    case 'nightstand': return rc(x, y, w, d, c, 'rx="30"') + `<circle r="${m*.24}" fill="#fff6dd" ${ST}/>` + `<circle r="${m*.08}" fill="${shade(c, .8)}" ${ST}/>`;
    case 'wardrobe': {
      let s = rc(x, y, w, d, c) + ln(x + 50, 0, x + w - 50, 0);
      for (let hx = x + 160; hx < x + w - 100; hx += 180) s += ln(hx - 45, -d*.28, hx + 45, d*.28, 'opacity=".6"');
      return s;
    }
    case 'cabinet': case 'shoecab': return rc(x, y, w, d, c) + ln(x, y + d, x + w, y);
    case 'dresser': return rc(x, y, w, d, c, 'rx="20"') + rc(x + w*.2, y, w*.6, 55, '#dfe9ee') + ec(0, d/2 + 180, 160, 140, shade(c, .9));
    case 'desk': return rc(x, y, w, d, c, 'rx="20"') + rc(-w*.18, y + 50, w*.36, 45, '#555') + rc(-w*.14, y + d*.45, w*.28, d*.28, '#f4f4f4', 'rx="10"');
    case 'chair': return rc(x + 25, y + d*.16, w - 50, d*.84 - 10, c, 'rx="60"') + rc(x, y, w, d*.2, shade(c, .78), 'rx="40"');
    case 'bookshelf': { let s = rc(x, y, w, d, c); for (let bx = x + 400; bx < x + w - 50; bx += 400) s += ln(bx, y, bx, y + d); return s; }
    case 'baycushion': return rc(x, y, w, d, c, 'rx="60"') + rc(x + 60, y + 80, w - 120, Math.min(300, d*.2), '#fff', 'rx="60"') + rc(x + 60, y + d - 80 - Math.min(300, d*.2), w - 120, Math.min(300, d*.2), '#fff', 'rx="60"');
    case 'coffeetable': return rc(x, y, w, d, c, 'rx="80"') + rc(x + 60, y + 60, w - 120, d - 120, shade(c, 1.06), 'rx="50"');
    case 'tvstand': return rc(x, y, w, d, c) + rc(x + w*.15, y + 30, w*.7, 55, '#3a3a3a');
    case 'rug': return rc(x, y, w, d, c, 'rx="40" fill-opacity=".6"') + rc(x + 90, y + 90, w - 180, d - 180, 'none', 'rx="30" stroke-dasharray="3 3" opacity=".6"');
    case 'plant': {
      let s = `<circle r="${m/2}" fill="${c}" fill-opacity=".85" ${ST}/>`;
      for (let k = 0; k < 8; k++) s += `<ellipse cx="0" cy="${-m*.27}" rx="${m*.1}" ry="${m*.21}" transform="rotate(${k*45})" fill="${shade(c, .8)}" ${ST}/>`;
      return s + `<circle r="${m*.1}" fill="#8a6a4a" ${ST}/>`;
    }
    case 'table': return rc(x, y, w, d, c, 'rx="30"') + rc(x + 50, y + 50, w - 100, d - 100, 'none', 'rx="20" opacity=".4"');
    case 'roundtable': return ec(0, 0, w/2, d/2, c) + ec(0, 0, w/2 - 50, d/2 - 50, 'none', 'opacity=".4"');
    case 'counter': return rc(x, y, w, d, c) + ln(x, y + d - 40, x + w, y + d - 40, DASH);
    case 'stove': {
      let s = rc(x, y, w, d, '#2f2f2f', 'rx="20"'); const r = m*.26;
      const pts = w/d > 1.4 ? [[-w/4, 0], [w/4, 0]] : [[-w/4, -d/4], [w/4, -d/4], [-w/4, d/4], [w/4, d/4]];
      pts.forEach(([px, py]) => {
        s += `<circle cx="${px}" cy="${py}" r="${r}" fill="none" stroke="#bbb" stroke-width="1" vector-effect="non-scaling-stroke"/><circle cx="${px}" cy="${py}" r="${r*.45}" fill="#666"/>`;
      });
      return s;
    }
    case 'ksink': return rc(x, y, w, d, c, 'rx="20"') + rc(x + w*.06, y + d*.18, w*.42, d*.66, '#fff', 'rx="50"') + rc(x + w*.52, y + d*.18, w*.42, d*.66, '#fff', 'rx="50"') + `<circle cx="0" cy="${y + d*.09}" r="22" fill="#999"/>`;
    case 'fridge': return rc(x, y, w, d, c, 'rx="30"') + ln(x, y + d*.14, x + w, y + d*.14) + ln(0, y + d*.14, 0, y + d) + rc(-70, y + d*.5, 40, d*.25, '#aab') + rc(30, y + d*.5, 40, d*.25, '#aab');
    case 'toilet': return rc(x + w*.04, y, w*.92, d*.27, c, 'rx="30"') + ec(0, y + d*.27 + d*.36, w*.47, d*.36, c) + ec(0, y + d*.27 + d*.4, w*.3, d*.24, '#eef4f7');
    case 'squattoilet': {
      // 蹲便器：陶瓷台面 + 椭圆便池 + 前端小水箱
      const rx = w*.24, ry = d*.3, tankD = d*.18, cy0 = -d*.05;
      let s = rc(x, y, w, d, c, 'rx="24"');
      s += rc(x + w*.27, y + d - tankD, w*.46, tankD, shade(c, .92), 'rx="6"');   // 前端水箱
      s += ec(0, cy0, rx, ry, '#eef4f7') + ec(0, cy0, rx*.62, ry*.62, 'none', 'opacity=".45"');
      s += `<circle cx="0" cy="${cy0}" r="${m*.055}" fill="#c2ccd1" ${ST}/>`;    // 排水口
      return s;
    }
    case 'vanity': return rc(x, y, w, d, c, 'rx="20"') + ec(0, y + d*.57, Math.min(w*.32, 260), d*.28, '#fff') + `<circle cx="0" cy="${y + d*.17}" r="26" fill="#999"/>`;
    case 'shower': return rc(x, y, w, d, c) + ln(x, y, x + w, y + d, DASH) + ln(x + w, y, x, y + d, DASH) + `<circle r="45" fill="#fff" ${ST}/>`;
    case 'openshower': return rc(x, y, w, d, c)
      + `<circle r="${m*.055}" fill="#fff" ${ST}/>`                                              // 地漏
      + `<circle cx="${x + w*.16}" cy="${y + d*.16}" r="${m*.075}" fill="#9aa1a8" ${ST}/>`;      // 墙角花洒
    case 'dryingrack': {
      // 升降式晾衣杆：虚线安装范围 + 两根晾衣杆 + 四角吊索滑轮 + 手摇升降器
      const ry1 = y + d*.26, ry2 = y + d*.74, pr = m*.045;
      let s = rc(x, y, w, d, 'none', DASH);
      s += ln(x, ry1, x + w, ry1) + ln(x, ry2, x + w, ry2);
      [x + w*.07, x + w*.93].forEach(px => {
        [ry1, ry2].forEach(py => { s += `<circle cx="${px}" cy="${py}" r="${pr}" fill="#fff" ${ST}/>`; });
      });
      s += `<circle cx="${x + w*.84}" cy="0" r="${m*.05}" fill="none" ${ST}/>`;   // 手摇升降器
      return s;
    }
    case 'bathtub': return rc(x, y, w, d, c, 'rx="40"') + rc(x + 80, y + 80, w - 160, d - 160, '#fff', `rx="${m*.33}"`) + `<circle cx="${x + w - 260}" cy="0" r="35" fill="#ccc" ${ST}/>`;
    case 'washer': case 'dryer':
      return rc(x, y, w, d, c, 'rx="30"') + rc(x, y, w, d*.14, shade(c, .9))
        + `<circle cy="${d*.06}" r="${m*.34}" fill="#fff" ${ST}/><circle cy="${d*.06}" r="${m*.24}" fill="${t === 'dryer' ? '#e9dccb' : '#cfdde4'}" ${ST}/>`;
    case 'crib': {
      let s = rc(x, y, w, d, c, 'rx="20"') + rc(x + 45, y + 45, w - 90, d - 90, '#fff', 'rx="20"');
      for (let sx = x + 90; sx < x + w - 60; sx += 90) s += ln(sx, y, sx, y + 45, 'opacity=".5"') + ln(sx, y + d - 45, sx, y + d, 'opacity=".5"');
      return s;
    }
    case 'beanbag': return ec(0, 0, w/2, d/2, c) + ec(-w*.04, -d*.06, w*.3, d*.28, shade(c, 1.12), 'opacity=".9"');
    case 'sidetable': return ec(0, 0, w/2, d/2, c) + ec(0, 0, w*.12, d*.12, 'none', 'opacity=".5"');
    case 'floorlamp': return `<circle r="${m*.5}" fill="#fff6dd" fill-opacity=".85" ${ST}/>` + `<circle r="${m*.32}" fill="none" ${ST} ${DASH}/>` + `<circle r="${m*.07}" fill="${c}" ${ST}/>`;
    case 'island': return rc(x, y, w, d, c) + ln(x, y + d - 250, x + w, y + d - 250, DASH);
    case 'barstool': return `<circle r="${m/2}" fill="${c}" ${ST}/><circle r="${m*.3}" fill="${shade(c, 1.15)}" ${ST}/>`;
    case 'waterheater': return rc(x, y, w, d, c, `rx="${d/2}" ${DASH}`) + ln(x + w*.2, 0, x + w*.8, 0, DASH);
    case 'tv': return rc(x, y, w, d, c, 'rx="10"') + rc(x + w*.3, y + d, w*.4, Math.min(40, d), '#666');
    case 'aircon': return rc(x, y, w, d, c, 'rx="30"') + ln(x + 40, y + d*.72, x + w - 40, y + d*.72) + ln(x + 40, y + d*.86, x + w - 40, y + d*.86);
    case 'acwall': {
      let s = rc(x, y, w, d, c, `rx="30" ${DASH}`);
      [.25, .5, .75].forEach(k => { s += ln(x + w*k, y + d, x + w*k, y + d + 200, `${DASH} opacity=".6"`); });
      return s;
    }
    case 'dishwasher': return rc(x, y, w, d, c, 'rx="15"') + ln(x, y + d - 70, x + w, y + d - 70) + rc(x + w*.3, y + d - 45, w*.4, 25, '#888');
    case 'ovencol': return rc(x, y, w, d, c) + ln(x, y, x + w, y + d) + ln(x + w, y, x, y + d);
    case 'purifier': return rc(x, y, w, d, c, 'rx="60"') + rc(x + 45, y + 45, w - 90, d - 90, 'none', `rx="40" ${DASH}`);
    case 'officechair': {
      let s = '';
      for (let k = 0; k < 5; k++) s += `<line x1="0" y1="0" x2="0" y2="${m*.48}" transform="rotate(${k*72 + 36})" stroke="#555" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      return s + rc(x + w*.12, y + d*.22, w*.76, d*.66, c, 'rx="80"') + rc(x + w*.15, y + d*.04, w*.7, d*.16, shade(c, .78), 'rx="40"')
        + rc(x + w*.02, y + d*.3, w*.1, d*.45, shade(c, .7), 'rx="30"') + rc(x + w*.88, y + d*.3, w*.1, d*.45, shade(c, .7), 'rx="30"');
    }
    case 'piano': {
      let s = rc(x, y, w, d*.55, c, 'rx="10"') + rc(x + 40, y + d*.55, w - 80, d*.4, shade(c, 1.4), 'rx="10"');
      const kx = x + 90, kw = w - 180, kd = d*.2;
      s += rc(kx, y + d*.55, kw, kd, '#faf8f3');
      for (let i = 1; i < 26; i++) s += ln(kx + kw*i/26, y + d*.55, kx + kw*i/26, y + d*.55 + kd, 'opacity=".5"');
      return s;
    }
    case 'treadmill': return rc(x, y, w, d, c, 'rx="50"') + rc(x + 90, y + 320, w - 180, d - 400, '#1c1c1e', 'rx="25"') + rc(x, y, w, 230, shade(c, 1.4), 'rx="40"');
    case 'screen': {
      let s = rc(x, y, w, d, c, 'rx="6"');
      const n = Math.max(3, Math.round(w/500));
      for (let i = 1; i < n; i++) s += ln(x + w*i/n, y, x + w*i/n, y + d);
      return s;
    }
    case 'railing': {
      // 走廊扶手：原木上下压条 + 两端 / 中间立柱 + 玻璃栏板（平面图薄片）
      const t = Math.max(6, Math.min(d*.26, 26));
      const post = Math.max(10, Math.min(w*.022, 26));
      let s = rc(x, y, w, d, '#dfeef4', 'fill-opacity=".45"');          // 玻璃
      s += rc(x, y, w, t, c) + rc(x, y + d - t, w, t, shade(c, .94));   // 原木压条
      s += rc(x, y, post, d, shade(c, .9)) + rc(x + w - post, y, post, d, shade(c, .9));
      const n = Math.max(1, Math.round(w/800));
      for (let i = 1; i < n; i++) s += rc(x + w*i/n - post/2, y, post, d, shade(c, .9));
      return s;
    }
    case 'pillar': return rc(x, y, w, d, c) + rc(x + w*.22, y + d*.22, w*.56, d*.56, 'none', 'opacity=".5"');
    case 'column': return ec(0, 0, w/2, d/2, c) + ec(0, 0, w*.3, d*.3, 'none', 'opacity=".5"');

    /* ---------- 楼层：步梯 / 旋转步梯 / 电梯 / 扶梯 ---------- */
    case 'stair': {
      // 直跑楼梯：向 -y（画面上方）逐级升高；下行时整体反向
      const up = sd >= 0, n = Math.max(6, Math.round(d/300)), sh = d/n;
      let s = rc(x, y, w, d, up ? '#f4efe5' : '#eae6de');
      for (let i = 1; i < n; i++) s += ln(x, y + sh*i, x + w, y + sh*i, 'opacity=".5"');
      s += `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="none" ${ST}/>`;
      return s + dirArrow(up, w, d, y) + dirText(up, w, d, y);
    }
    case 'spiralstair': {
      // 旋转步梯：中心柱 + 放射状踏步 + 旋转方向箭头（下行时反向）
      const R = Math.min(w, d)/2, up = sd >= 0, n = 14;
      let s = `<circle r="${R}" fill="${up ? '#f4efe5' : '#eae6de'}" ${ST}/><circle r="${R*.15}" fill="#b0a28d" ${ST}/>`;
      for (let i = 0; i < n; i++){
        const a = -Math.PI/2 + i/n*Math.PI*2, c0 = Math.cos(a), s0 = Math.sin(a);
        s += `<line x1="${c0*R*.15}" y1="${s0*R*.15}" x2="${c0*R}" y2="${s0*R}" ${ST} opacity=".5"/>`;
      }
      const arrow = `<path d="M${-R*.55} ${-R*.35}A${R*.66} ${R*.66} 0 0 1 ${R*.4} ${-R*.52}" fill="none" ${DIR_ST}/>`
        + `<path d="M${R*.4 - R*.1} ${-R*.62}L${R*.4} ${-R*.52}L${R*.36} ${-R*.34}" fill="none" ${DIR_ST}/>`;
      s += up ? arrow : `<g transform="scale(-1 1)">${arrow}</g>`;
      const fs = Math.max(110, R*.34);
      s += `<text x="0" y="${R*.62}" font-size="${fs}" text-anchor="middle" fill="#8d7f6c" font-weight="600">${up ? tr('上', 'UP') : tr('下', 'DN')}</text>`;
      return s;
    }
    case 'elevator': {
      // 电梯：轿厢轮廓 + 下侧双扇门 + 门洞虚线
      const dw = (w - Math.min(160, w*.18))/2;
      const dx = x + Math.min(80, w*.09), dy = y + d - Math.min(120, d*.14);
      let s = rc(x, y, w, d, '#f1f3f4', 'rx="20"') + rc(x + 55, y + 55, w - 110, d - 110, 'none', 'opacity=".4"');
      s += rc(dx, dy, dw - 6, Math.min(80, d*.12), '#c2c8ce') + rc(dx + dw + 6, dy, dw - 6, Math.min(80, d*.12), '#c2c8ce');
      s += `<line x1="${dx}" y1="${dy - 40}" x2="${dx + 2*dw}" y2="${dy - 40}" stroke="#8d7f6c" stroke-width="1.6" stroke-dasharray="8 6" vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'escalator': {
      // 自动扶梯：两侧裙板 + 梯级 + 方向箭头（下行反向）
      const up = sd >= 0, bw = Math.max(70, w*.14), n = Math.max(8, Math.round(d/260));
      let s = rc(x, y, w, d, up ? '#f4f5f6' : '#eae6de', 'rx="20"')
        + rc(x, y, bw, d, '#c9ced3') + rc(x + w - bw, y, bw, d, '#c9ced3');
      for (let i = 1; i < n; i++) s += ln(x + bw, y + d*i/n, x + w - bw, y + d*i/n, 'opacity=".4"');
      return s + dirArrow(up, w, d, y) + dirText(up, w, d, y);
    }
    case 'lstair': {
      /* L 型步梯（俯视）：西侧一跑自南向北 → 西北转角平台 → 北侧一跑自西向东
       * 梯跑宽 = 0.4 × 对应边长（与 3D 模型、CLIMB.lstair 的比例一致） */
      const up = sd >= 0, FW = .4;
      const fw = w*FW, fd = d*FW;
      const xA = x, xB = x + fw;                 // 西侧一跑
      const yN = y, yS = y + d;                  // 北 / 南
      const yL = y + fd;                         // 平台南边
      const fill = up ? '#f4efe5' : '#eae6de';
      let s = rc(x, y, w, d, fill);
      // 第一跑踏步（西侧条带，自南向北加密）
      const n1 = Math.max(5, Math.round((d - fd)/280));
      for (let i = 1; i < n1; i++) s += ln(xA, yS - (d - fd)*i/n1, xB, yS - (d - fd)*i/n1, 'opacity=".5"');
      // 西北转角平台
      s += rc(xA, yN, fw, fd, shade(fill, .93));
      // 第二跑踏步（北侧条带，自西向东）
      const n2 = Math.max(5, Math.round((w - fw)/280));
      for (let i = 1; i < n2; i++) s += ln(xB + (w - fw)*i/n2, yN, xB + (w - fw)*i/n2, yL, 'opacity=".5"');
      // 楼梯井空角（西南大空腔）打斜线提示
      const gx = xB, gy = yL, gw = x + w - xB, gh = y + d - yL;
      s += rc(gx, gy, gw, gh, 'none', 'opacity=".35"');
      s += pa(`M${gx} ${gy + gh}L${gx + gw} ${gy}`, 'none', 'opacity=".25" stroke-dasharray="6 6"');
      s += `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="none" ${ST}/>`;
      // L 形箭头：起点（西侧跑南端）→ 北 → 东
      const ax = xA + fw/2, ay0 = yS - Math.min(180, (d - fd)*.12);
      const ay1 = yN + fd/2, bx1 = x + w - Math.min(180, w*.08);
      s += pa(`M${ax} ${ay0}V${ay1}H${bx1}`, 'none', DIR_ST);
      const hd2 = Math.max(70, Math.min(w, d)*.05);
      s += pa(`M${bx1 - hd2} ${ay1 - hd2}L${bx1} ${ay1}L${bx1 - hd2} ${ay1 + hd2}`, 'none', DIR_ST);
      // 「上 / 下」写在起点端
      const fs = Math.max(110, Math.min(w, d)*.07);
      s += `<text x="${ax}" y="${ay0 - fs*.8}" font-size="${fs}" text-anchor="middle" `
        + `fill="#8d7f6c" font-weight="600">${up ? tr('上', 'UP') : tr('下', 'DN')}</text>`;
      return s;
    }
    case 'ramp': {
      /* 车行坡道（俯视）：两侧挡土墙 + 坡面 + 横向坡度线（靠远端加密）+ 中线虚线 + 大箭头
       * 局部 +y（画面下方）永远是「地面端」（标高 0），远端画面上方接上层 / 下层。 */
      const up = sd >= 0;
      const wall = Math.max(80, Math.min(w*.1, 260));        // 两侧挡土墙厚（画法）
      const px0 = x + wall, px1 = x + w - wall, iw = Math.max(60, px1 - px0);
      const cxA = (px0 + px1)/2;
      const yG = y + d;                                      // 地面端（下）
      const yF = y;                                          // 远端（上，接上层 / 下层）
      let s = rc(x, y, w, d, '#a9a49b');                     // 挡土墙底色
      s += rc(px0, y, iw, d, up ? '#e4e1da' : '#d7d4cd');    // 坡面（下行略深，暗示下沉）
      // 墙面内侧分界线
      s += ln(px0, y, px0, y + d, 'opacity=".7"') + ln(px1, y, px1, y + d, 'opacity=".7"');
      // 横向坡度线：越靠远端越密（t^1.7），像透视里的等高线
      const n = Math.max(6, Math.min(24, Math.round(d/650)));
      for (let i = 1; i < n; i++){
        const t = i/n, yy = yG - d*Math.pow(t, 1.7);
        s += ln(px0, yy, px1, yy, 'opacity=".38"');
      }
      // 两端断线加粗（起坡 / 收坡）
      s += ln(px0, yG, px1, yG, 'stroke-width="2.6"') + ln(px0, yF, px1, yF, 'stroke-width="2.6"');
      // 中线虚线（白）+ 边线（细白）
      s += pa(`M${cxA} ${yG - d*.05}L${cxA} ${yF + d*.05}`, 'none',
        'stroke="#ffffff" stroke-width="2" stroke-dasharray="16 12" vector-effect="non-scaling-stroke"');
      s += pa(`M${px0 + iw*.13} ${yG - d*.16}L${px0 + iw*.13} ${yF + d*.16}`, 'none',
        'stroke="#ffffff" stroke-width="1.5" opacity=".7" vector-effect="non-scaling-stroke"');
      s += pa(`M${px1 - iw*.13} ${yG - d*.16}L${px1 - iw*.13} ${yF + d*.16}`, 'none',
        'stroke="#ffffff" stroke-width="1.5" opacity=".7" vector-effect="non-scaling-stroke"');
      // 大箭头：从地面端指向远端（车开进去的方向），宽杆 + 大三角头
      const aw = Math.min(iw*.46, d*.05), ah = aw*.85, sw2 = Math.max(3, aw*.16);
      const ay0 = yG - d*.1, ay1 = yF + d*.07;
      s += pa(`M${cxA} ${ay0}L${cxA} ${ay1 + ah}`, 'none',
        `stroke="#8d7f6c" stroke-width="${sw2}" vector-effect="non-scaling-stroke" stroke-linecap="round"`);
      s += pa(`M${cxA - aw/2} ${ay1 + ah}L${cxA} ${ay1}L${cxA + aw/2} ${ay1 + ah}`, 'none',
        `stroke="#8d7f6c" stroke-width="${sw2}" vector-effect="non-scaling-stroke" stroke-linecap="round"`);
      // 「上 / 下」写在地面端（车驶入的那一端）
      const fs = Math.max(120, Math.min(iw*.24, d*.045));
      s += `<text x="${cxA}" y="${yG - d*.13}" font-size="${fs}" text-anchor="middle" `
        + `dominant-baseline="middle" fill="#8d7f6c" font-weight="700">${up ? tr('上', 'UP') : tr('下', 'DN')}</text>`;
      return s;
    }
    /* ---------- 户外 · 车库 ---------- */
    case 'car': case 'suv': case 'mpv': {
      // 车辆俯视：车身圆角矩形 + 车厢（车顶）+ 前后风挡 + 侧窗 + 四轮 + 灯
      const tall = t === 'suv', mpv = t === 'mpv';
      const bw = d * (tall ? .88 : .84), by = -bw/2;
      const glass = shade(c, 1.5);
      const tw = Math.min(d*.16, w*.055), tl = Math.min(d*.3, w*.13);
      let s = '';
      [[x + w*.18, -1], [x + w*.18, 1], [x + w*.82 - tl, -1], [x + w*.82 - tl, 1]].forEach(([px, sg]) => {
        s += rc(px, sg < 0 ? -bw/2 - tw*.35 : bw/2 - tw*.65, tl, tw, '#3a3d42', 'rx="8"');
      });
      s += rc(x, by, w, bw, c, `rx="${bw*.28}"`);
      const cw = w * (mpv ? .62 : tall ? .54 : .48);
      const cx = x + w * (mpv ? .18 : tall ? .26 : .29);
      const cwid = bw * (mpv ? .8 : .76);
      s += rc(cx, -cwid/2, cw, cwid, shade(c, 1.12), `rx="${cwid*.22}"`);
      s += `<path d="M${cx + 6} ${-cwid/2}L${cx + cw*.17} ${-cwid/2}L${cx + cw*.17} ${cwid/2}L${cx + 6} ${cwid/2}Z" fill="${glass}" ${ST}/>`;
      s += `<path d="M${cx + cw - 6} ${-cwid/2}L${cx + cw*.83} ${-cwid/2}L${cx + cw*.83} ${cwid/2}L${cx + cw - 6} ${cwid/2}Z" fill="${glass}" ${ST}/>`;
      s += rc(cx + cw*.2, -cwid/2, cw*.38, cwid*.11, glass) + rc(cx + cw*.2, cwid/2 - cwid*.11, cw*.38, cwid*.11, glass);
      s += rc(cx + cw*.06, -cwid/2 - bw*.09, w*.028, bw*.1, shade(c, 1.2), 'rx="4"')
        + rc(cx + cw*.06, cwid/2 - bw*.01, w*.028, bw*.1, shade(c, 1.2), 'rx="4"');
      s += rc(x + 14, by + bw*.13, w*.032, bw*.15, '#ffe9a8') + rc(x + 14, bw/2 - bw*.28, w*.032, bw*.15, '#ffe9a8');
      s += rc(x + w - 14 - w*.03, by + bw*.13, w*.03, bw*.15, '#c8544a') + rc(x + w - 14 - w*.03, bw/2 - bw*.28, w*.03, bw*.15, '#c8544a');
      return s;
    }
    case 'parking': {
      // 停车位：地面划线（三面边线 + 入口端虚线）+ 车位编号位「P」
      const t = Math.max(30, Math.min(w, d)*.035), fs = Math.min(w, d)*.44;
      const W = 'fill="#ffffff" fill-opacity=".9" stroke="none"';
      let s = `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="${c}" fill-opacity=".22" ${ST}/>`;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${t}" ${W}/>`;
      s += `<rect x="${x}" y="${y}" width="${t}" height="${d}" ${W}/>`;
      s += `<rect x="${x + w - t}" y="${y}" width="${t}" height="${d}" ${W}/>`;
      s += `<line x1="${x}" y1="${y + d - 2}" x2="${x + w}" y2="${y + d - 2}" stroke="#ffffff" stroke-width="2" stroke-dasharray="10 8" vector-effect="non-scaling-stroke"/>`;
      s += `<text x="0" y="0" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="central" `
        + `fill="#ffffff" fill-opacity=".85" transform="rotate(${w > d ? 0 : -90})">P</text>`;
      return s;
    }
    case 'streetlamp': {
      // 路灯俯视：灯杆 + 灯臂 + 光晕
      const r = Math.min(w, d)/2;
      return `<circle r="${r}" fill="#ffe9a8" fill-opacity=".45" ${ST}/>`
        + `<circle r="${r*.42}" fill="#fff6dd" ${ST}/>`
        + ln(0, 0, r*.9, r*.9, 'stroke="#8d949c" opacity=".7"')
        + `<circle r="${r*.16}" fill="${c}" ${ST}/>`;
    }
    case 'shrub': {
      // 灌木：几团交叠的枝叶
      const r = Math.min(w, d)/2;
      let s = `<circle r="${r*.92}" fill="${shade(c, .88)}" ${ST}/>`;
      [[-.3, -.26, .42], [.3, -.18, .36], [.02, .3, .44], [-.36, .24, .3], [.34, .3, .32]].forEach(([dx, dy, k]) => {
        s += `<circle cx="${dx*r}" cy="${dy*r}" r="${r*k}" fill="${c}" fill-opacity=".9" ${ST}/>`;
      });
      return s;
    }
    case 'camphor': {
      // 樟树：分层的树冠 + 中心树干
      const r = Math.min(w, d)/2;
      let s = `<circle r="${r}" fill="${shade(c, .84)}" fill-opacity=".9" ${ST}/>`;
      [[-.34, -.3, .42], [.34, -.26, .4], [-.3, .34, .38], [.32, .32, .4], [0, -.44, .34]].forEach(([dx, dy, k]) => {
        s += `<circle cx="${dx*r}" cy="${dy*r}" r="${r*k}" fill="${shade(c, 1.1)}" fill-opacity=".92" ${ST}/>`;
      });
      s += `<circle r="${r*.42}" fill="${c}" fill-opacity=".95" ${ST}/>`;
      return s + `<circle r="${r*.14}" fill="#6b5442" ${ST}/>`;
    }

    /* ---------- 户外 · 道路（贴地标线） ---------- */
    case 'lane': {
      // 车道线：断续白实线（沿长边方向，按 6m 一段 3 虚 3 实）
      const hz = w >= d, L = hz ? w : d, t = Math.max(20, Math.min(w, d)*.9), n = Math.max(2, Math.round(L/1500));
      let s = '';
      for (let i = 0; i < n; i += 2){
        const p0 = -L/2 + L*i/n, len = L/n;
        s += hz ? rc(x + (p0 + L/2), y + (d - t)/2, Math.min(len, L - (p0 + L/2)), t, c)
                : rc(x + (w - t)/2, y + (p0 + d/2), t, Math.min(len, d - (p0 + d/2)), c);
      }
      return s;
    }
    case 'crosswalk': {
      // 斑马线：横向条纹（人沿 +y 方向过街），两侧各留半条缝
      const n = Math.max(3, Math.round(d/600)), sh = d/n;
      let s = '';
      for (let i = 0; i < n; i++) s += rc(x, y + i*sh + sh*.18, w, sh*.64, c);
      return s;
    }
    case 'manhole': {
      const r = Math.min(w, d)/2;
      return `<circle r="${r}" fill="${c}" ${ST}/><circle r="${r*.78}" fill="none" ${ST}/>`
        + `<circle r="${r*.26}" fill="none" ${ST} opacity=".8"/>`
        + ln(-r*.62, 0, -r*.3, 0, 'opacity=".7"') + ln(r*.3, 0, r*.62, 0, 'opacity=".7"')
        + ln(0, -r*.62, 0, -r*.3, 'opacity=".7"') + ln(0, r*.3, 0, r*.62, 'opacity=".7"');
    }

    /* ---------- 商业 · 公共 ---------- */
    case 'shelf': {
      // 货架：外框 + 分格（俯视像一排货位）
      const n = Math.max(2, Math.round(w/600));
      let s = rc(x, y, w, d, shade(c, 1.06), 'rx="10"');
      for (let i = 1; i < n; i++) s += ln(x + w*i/n, y + 40, x + w*i/n, y + d - 40);
      return s + pa(`M${x + 30} ${y + d/2}H${x + w - 30}`, 'none', DASH);
    }
    case 'cashier': {
      // 收银台：台体 + 收银机 + 侧柜
      let s = rc(x, y, w, d, c, 'rx="16"');
      s += rc(x + w*.06, y + d*.22, Math.min(520, w*.28), d*.56, '#f7f7f5', 'rx="8"');
      return s + rc(x + w*.72, y + 60, Math.min(560, w*.24), d - 120, shade(c, .88), 'rx="6"');
    }
    case 'signpost': {
      // 导视立牌：深色板 + 三条白色信息条
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      let s = rc(x, y, w, d, c, 'rx="8"');
      for (let i = 0; i < 3; i++){
        const len = L*(i === 2 ? .3 : .5), off = L*(i === 2 ? .22 : .26);
        s += hz
          ? rc(x + off, y + T*(.26 + i*.2), len, Math.max(30, T*.12), '#f2f4f5')
          : rc(x + T*(.26 + i*.2), y + off, Math.max(30, T*.12), len, '#f2f4f5');
      }
      return s;
    }
    case 'bin': {
      // 垃圾箱：桶身 + 内胆口
      const r = Math.min(w, d)/2;
      return `<circle r="${r*.92}" fill="${c}" ${ST}/><circle r="${r*.62}" fill="#f7f7f5" ${ST}/>`
        + `<circle r="${r*.3}" fill="${shade(c, .8)}" ${ST}/>`;
    }
    case 'bench': {
      // 长椅：座板 + 靠背虚线 + 支腿
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d), bd = T*.42;
      let s = hz ? rc(x, y + (T - bd)/2, L, bd, c, 'rx="30"') : rc(x + (T - bd)/2, y, bd, L, c, 'rx="30"');
      s += hz ? ln(x + L*.1, y + (T + bd)/2, x + L*.9, y + (T + bd)/2, DASH)
              : ln(x + (T + bd)/2, y + L*.1, x + (T + bd)/2, y + L*.9, DASH);
      for (let i = 0; i < 3; i++){
        const t = L*(.16 + i*.34) - L/2;
        s += hz ? rc(t, y + T*.72, Math.min(90, L*.06), Math.min(60, T*.16), shade(c, .75))
                : rc(x + T*.72, L/2 + t, Math.min(60, T*.16), Math.min(90, L*.06), shade(c, .75));
      }
      return s;
    }

    default: return rc(x, y, w, d, c);
  }
}
