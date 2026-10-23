/* ============================================================================
 *  2D 平面家具图例：纯函数，输入类型/尺寸/颜色，返回一段 SVG 片段。
 *  坐标系：家具中心在 (0,0)，+x 向右，+y 向下（与平面图一致）。
 * ========================================================================== */
import { tr } from '@/i18n.js';
import { ICONS } from './assets/icons.js';
import { garageLayout } from '@/core/garage/layout.js';

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
/* 运动场地的白色画线（不随缩放变粗，保证缩到总图比例仍然清晰） */
const WLST = 'fill="none" stroke="#ffffff" stroke-opacity=".82" stroke-width="1.5" vector-effect="non-scaling-stroke"';
const WL = (x1, y1, x2, y2, ex = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-opacity=".82" stroke-width="1.5" vector-effect="non-scaling-stroke" ${ex}/>`;
const WBOX = (x0, y0, x1, y1) => `<rect x="${Math.min(x0, x1)}" y="${Math.min(y0, y1)}" width="${Math.abs(x1 - x0)}" height="${Math.abs(y1 - y0)}" ${WLST}/>`;

/* 沙盘楼栋平面：轮廓 + 单元分隔 + 核心筒 + 入口箭头 + 层数 */
function bldgPlan(w, d, floors, c, opt = {}){
  const x = -w/2, y = -d/2, m = Math.min(w, d);
  let s = rc(x, y, w, d, shade(c, .98), 'rx="18"');
  s += `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="none" stroke="#3d3a34" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
  const n = opt.units || Math.max(1, Math.round(w/12000));
  for (let i = 1; i < n; i++) s += ln(x + w*i/n, y + 40, x + w*i/n, y + d - 40, 'opacity=".45"');
  if (opt.core !== false){
    const cw = Math.min(w*.2, 7000), cd = Math.min(d*.3, 5200);
    s += rc(-cw/2, -cd/2, cw, cd, shade(c, .82), 'rx="6"');
    s += ln(-cw/2, -cd/2, cw/2, cd/2, 'opacity=".45"') + ln(cw/2, -cd/2, -cw/2, cd/2, 'opacity=".45"');
  }
  s += pa(`M${x + w} 0l${-m*.055} ${-m*.035}M${x + w} 0l${-m*.055} ${m*.035}`,
    'none', 'stroke="#b5653a" stroke-width="2" vector-effect="non-scaling-stroke"');
  const fs = Math.max(900, m*.13);
  s += `<text x="${x + w*.05}" y="${y + d*.19}" font-size="${fs}" fill="#8d7f6c" font-weight="700">${floors}F</text>`;
  return s;
}
const treeDot = (cx, cy, r, c) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" ${ST}/>`
  + `<circle cx="${cx}" cy="${cy}" r="${r*.3}" fill="${shade(c, 1.12)}" ${ST}/>`;

/* 沙盘树木平面：树冠 + 层次 + 树干 */
function treePlan(w, d, c, layers = 3){
  const r = Math.min(w, d)/2;
  let s = `<circle r="${r*.92}" fill="${shade(c, .86)}" ${ST}/>`;
  for (let i = 0; i < 6; i++){
    const a = i/6*Math.PI*2 + .3;
    s += `<circle cx="${Math.cos(a)*r*.34}" cy="${Math.sin(a)*r*.34}" r="${r*(.34 + (i%3)*.03)}" fill="${i%2 ? shade(c, 1.12) : c}" fill-opacity=".9" ${ST}/>`;
  }
  if (layers > 1) s += `<circle r="${r*.3}" fill="${shade(c, 1.05)}" fill-opacity=".95" ${ST}/>`;
  return s + `<circle r="${r*.09}" fill="#6b5442" ${ST}/>`;
}

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
      /* 车辆俯视：三种车身形态分别塑形 ——
       * 轿车：头尾收窄、长车头 + 短行李厢、后倾前后风挡；
       * SUV：方正车身、黑色包围、车顶行李架、更大的轮胎；
       * MPV：单厢式、短鼻长厢、侧滑门轨道、尾部扰流。 */
      const tall = t === 'suv', mpv = t === 'mpv';
      const glass = shade(c, 1.52), dark = '#3a3f45';
      const bw = d * (tall ? .9 : mpv ? .88 : .84), by = -bw/2;
      const tw = Math.min(d*.17, w*.07), tl = Math.min(d*.34, w*.17);
      const axF = x + w*(tall ? .22 : .2), axR = x + w*(tall ? .78 : .8) - tl;
      let s = '';
      /* 轮胎 + 轮毂（先画，车身盖住内侧） */
      [[axF, -1], [axF, 1], [axR, -1], [axR, 1]].forEach(([px, sg]) => {
        const ty = sg < 0 ? by - tw*.2 : by + bw - tw*.8;
        s += rc(px, ty, tl, tw, '#2f3237', 'rx="9"');
        s += rc(px + tl*.3, sg < 0 ? ty + tw*.26 : ty + tw*.32, tl*.4, tw*.42, '#aab2b8', 'rx="6"');
      });
      if (tall){
        /* SUV：方正外壳 + 前后护板 + 侧裙包围 + 车顶行李架 */
        s += rc(x + 8, by + bw*.02, w - 16, bw*.96, c, `rx="${bw*.22}"`);
        s += rc(x + w*.015, by + bw*.1, w*.07, bw*.8, dark, 'opacity=".55"')
          + rc(x + w*.915, by + bw*.1, w*.07, bw*.8, dark, 'opacity=".55"');
        s += ln(x + w*.12, by + bw*.14, x + w*.88, by + bw*.14, 'stroke="#ffffff" stroke-opacity=".35"')
          + ln(x + w*.12, by + bw*.86, x + w*.88, by + bw*.86, 'stroke="#ffffff" stroke-opacity=".35"');
        s += rc(x + w*.24, by + bw*.05, w*.6, bw*.05, shade(c, .72))
          + rc(x + w*.24, by + bw*.9, w*.6, bw*.05, shade(c, .72));
      } else if (mpv){
        /* MPV：单厢式，车头短、车厢长，腰线贯穿 */
        s += rc(x + 6, by + bw*.01, w - 12, bw*.98, c, `rx="${bw*.3}"`);
        s += ln(x + w*.1, by + bw*.5, x + w*.97, by + bw*.5, DASH);
        s += ln(x + w*.62, by + bw*.06, x + w*.62, by + bw*.94, 'stroke="#3a3f45" stroke-opacity=".55"');
      } else {
        /* 轿车：头尾收窄的流线车身 */
        const r = bw*.34;
        s += pa(`M${x + w*.11} ${by}L${x + w - w*.09} ${by}Q${x + w} ${by} ${x + w} ${by + r}`
          + `L${x + w} ${by + bw - r}Q${x + w} ${by + bw} ${x + w - w*.09} ${by + bw}`
          + `L${x + w*.11} ${by + bw}Q${x} ${by + bw} ${x} ${by + bw - r}`
          + `L${x} ${by + r}Q${x} ${by} ${x + w*.11} ${by}Z`, c);
        s += ln(x + w*.66, by + bw*.06, x + w*.66, by + bw*.94, 'stroke="#ffffff" stroke-opacity=".3"');
        s += ln(x + w*.24, by + bw*.06, x + w*.24, by + bw*.94, 'stroke="#ffffff" stroke-opacity=".3"');
      }
      /* 车顶（按车型给不同的前后倾斜量） */
      const cwL = w * (mpv ? .66 : tall ? .56 : .48);
      const cx0 = x + w * (mpv ? .22 : tall ? .27 : .3);
      const cx1 = cx0 + cwL;
      const cwid = bw * (mpv ? .82 : tall ? .8 : .74);
      const wSlant = w * (mpv ? .045 : tall ? .03 : .06);
      s += pa(`M${cx0} ${-cwid/2}L${cx1 - wSlant} ${-cwid/2}L${cx1} ${-cwid*.36}`
        + `L${cx1} ${cwid*.36}L${cx1 - wSlant} ${cwid/2}L${cx0} ${cwid/2}`
        + `L${cx0 + wSlant*.6} ${cwid*.4}L${cx0 + wSlant*.6} ${-cwid*.4}Z`, shade(c, 1.14));
      /* 前后风挡玻璃 */
      s += pa(`M${cx1 - wSlant} ${-cwid*.46}L${cx1} ${-cwid*.34}L${cx1} ${cwid*.34}L${cx1 - wSlant} ${cwid*.46}Z`, glass);
      s += pa(`M${cx0 + wSlant*.6} ${-cwid*.42}L${cx0} ${-cwid*.3}L${cx0} ${cwid*.3}L${cx0 + wSlant*.6} ${cwid*.42}Z`, glass);
      /* 侧窗：B 柱留缝 */
      const wy = Math.max(12, bw*.045);
      s += rc(cx0 + cwL*.14, -cwid/2 - wy*.6, cwL*.36, wy, glass)
        + rc(cx0 + cwL*.14, cwid/2 - wy*.4, cwL*.36, wy, glass);
      s += rc(cx0 + cwL*.56, -cwid/2 - wy*.6, cwL*.3, wy, glass)
        + rc(cx0 + cwL*.56, cwid/2 - wy*.4, cwL*.3, wy, glass);
      /* 后视镜 */
      s += rc(cx1 - w*.03, -cwid/2 - bw*.1, w*.022, bw*.1, shade(c, 1.2), 'rx="4"')
        + rc(cx1 - w*.03, cwid/2, w*.022, bw*.1, shade(c, 1.2), 'rx="4"');
      /* 车灯 + 牌照（车头在 +x） */
      s += rc(x + w - w*.035, by + bw*.12, w*.028, bw*.17, '#ffe9a8')
        + rc(x + w - w*.035, by + bw*.71, w*.028, bw*.17, '#ffe9a8');
      s += rc(x + w*.007, by + bw*.12, w*.025, bw*.15, '#c8544a')
        + rc(x + w*.007, by + bw*.73, w*.025, bw*.15, '#c8544a');
      s += rc(x + w*.5 - w*.035, by + bw*.28, w*.07, bw*.16, '#f4f6f8', 'opacity=".85"');
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

    /* ---------- 户外 · 运动 ---------- */
    case 'tennis': {
      /* 网球场：缓冲带底色 + 双打/单打边线 + 发球线 + 中线 + 球网 */
      const L = Math.min(w*.68, 23770), Wd = Math.min(d*.62, L/2.167), k = L/23.77;
      const ins = 1.37*k, sl = 6.4*k;
      let s = rc(x, y, w, d, shade(c, .88), 'rx="180"');
      s += rc(-L/2, -Wd/2, L, Wd, c, 'rx="40"');
      s += WBOX(-L/2, -Wd/2, L/2, Wd/2);
      s += WBOX(-L/2, -Wd/2 + ins, L/2, Wd/2 - ins);
      s += WL(-L/2 + sl, -Wd/2 + ins, -L/2 + sl, Wd/2 - ins)
        + WL(L/2 - sl, -Wd/2 + ins, L/2 - sl, Wd/2 - ins);
      s += WL(-L/2 + sl, 0, L/2 - sl, 0);
      s += `<line x1="0" y1="${-Wd/2 - ins*.7}" x2="0" y2="${Wd/2 + ins*.7}" stroke="#ffffff" stroke-width="2.6" stroke-dasharray="10 8" vector-effect="non-scaling-stroke"/>`;
      s += `<circle cx="0" cy="${-Wd/2 - ins*.7}" r="${Math.max(18, k*.05)}" fill="#e8eaec" ${ST}/>`
        + `<circle cx="0" cy="${Wd/2 + ins*.7}" r="${Math.max(18, k*.05)}" fill="#e8eaec" ${ST}/>`;
      return s;
    }
    case 'basketball': {
      /* 篮球场：边线 + 中线 + 中圈 + 三秒区/罚球圈 + 三分弧 + 篮板 */
      const L = Math.min(w*.88, 28000), Wd = Math.min(d*.8, L*15/28), k = L/28;
      let s = rc(x, y, w, d, shade(c, .88), 'rx="200"');
      s += rc(-L/2, -Wd/2, L, Wd, c, 'rx="30"');
      s += WBOX(-L/2, -Wd/2, L/2, Wd/2);
      s += WL(0, -Wd/2, 0, Wd/2);
      s += `<circle cx="0" cy="0" r="${1.8*k}" ${WLST}/>`
        + `<circle cx="0" cy="0" r="${Math.max(12, .18*k)}" fill="#ffffff" fill-opacity=".8"/>`;
      [-1, 1].forEach(sg => {
        const laneL = 5.8*k, laneW = 4.9*k, ftR = 1.8*k;
        const bx = sg < 0 ? -L/2 : L/2 - laneL;
        s += `<rect x="${bx}" y="${-laneW/2}" width="${laneL}" height="${laneW}" ${WLST}/>`;
        s += `<path d="M${bx + (sg < 0 ? laneL : 0)} ${-ftR}A${ftR} ${ftR} 0 0 ${sg < 0 ? 1 : 0} ${bx + (sg < 0 ? laneL : 0)} ${ftR}" ${WLST}/>`;
        const hx = sg*(L/2 - 1.575*k);
        s += `<path d="M${hx} ${-6.55*k}A${6.75*k} ${6.75*k} 0 0 ${sg < 0 ? 1 : 0} ${hx} ${6.55*k}" ${WLST}/>`;
        s += `<circle cx="${hx}" cy="0" r="${.24*k}" fill="none" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
        s += rc(hx - .09*k, -0.9*k, .18*k, 1.8*k, '#ffffff', 'opacity=".85"');
      });
      return s;
    }
    case 'football': {
      /* 足球场：深浅草皮条纹 + 边界 + 中圈 + 球门区 + 球门 */
      const L = Math.min(w*.9, 40000), Wd = Math.min(d*.82, L*.52), k = L/40, n = 8, sw = L/n;
      let s = rc(x, y, w, d, shade(c, .82), 'rx="220"');
      for (let i = 0; i < n; i++) s += rc(-L/2 + sw*i, -Wd/2, sw, Wd, i%2 ? shade(c, 1.07) : c);
      s += WBOX(-L/2, -Wd/2, L/2, Wd/2);
      s += WL(0, -Wd/2, 0, Wd/2) + `<circle cx="0" cy="0" r="${4*k}" ${WLST}/>`;
      [-1, 1].forEach(sg => {
        const gd = 3.4*k, gw = 12*k, gx = sg < 0 ? -L/2 : L/2 - gd;
        s += `<rect x="${gx}" y="${-gw/2}" width="${gd}" height="${gw}" ${WLST}/>`;
        const gx0 = sg < 0 ? -L/2 : L/2, gx1 = gx0 + sg*1.2*k, goalW = 3*k;
        s += WL(gx0, -goalW/2, gx1, -goalW/2) + WL(gx0, goalW/2, gx1, goalW/2) + WL(gx1, -goalW/2, gx1, goalW/2);
      });
      return s;
    }
    case 'badminton': {
      /* 羽毛球场：双打/单打边线 + 前发球线 / 双打后发球线 + 中线 + 球网 */
      const L = Math.min(w*.78, 13400), Wd = Math.min(d*.6, L*.455), k = L/13.4, ins = .46*k;
      let s = rc(x, y, w, d, shade(c, .9), 'rx="160"');
      s += rc(-L/2, -Wd/2, L, Wd, c, 'rx="30"');
      s += WBOX(-L/2, -Wd/2, L/2, Wd/2);
      s += WBOX(-L/2, -Wd/2 + ins, L/2, Wd/2 - ins);
      s += WL(-L/2 + 1.98*k, -Wd/2, -L/2 + 1.98*k, Wd/2)
        + WL(L/2 - 1.98*k, -Wd/2, L/2 - 1.98*k, Wd/2);
      s += WL(-L/2 + .76*k, -Wd/2 + ins, -L/2 + .76*k, Wd/2 - ins)
        + WL(L/2 - .76*k, -Wd/2 + ins, L/2 - .76*k, Wd/2 - ins);
      s += WL(-L/2 + 1.98*k, 0, L/2 - 1.98*k, 0);
      s += `<line x1="0" y1="${-Wd/2 - ins*1.4}" x2="0" y2="${Wd/2 + ins*1.4}" stroke="#ffffff" stroke-width="2.4" stroke-dasharray="10 8" vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'pingpong': {
      /* 乒乓球场：场地边界 + 两张球台（台面 / 中线 / 球网） */
      const TL = Math.min(2740, w*.36), TW = Math.min(1525, d*.32);
      const rows = (d*.62) > TW*2 ? 2 : 1;
      let s = rc(x, y, w, d, shade(c, .92), 'rx="120"');
      s += `<rect x="${x + 50}" y="${y + 50}" width="${w - 100}" height="${d - 100}" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="10 8"/>`;
      for (let r2 = 0; r2 < rows; r2++){
        const cy = rows === 1 ? 0 : (r2 ? d*.24 : -d*.24);
        s += rc(-TL/2, cy - TW/2, TL, TW, '#2f6f8f', 'rx="18"');
        s += `<rect x="${-TL/2}" y="${cy - TW/2}" width="${TL}" height="${TW}" fill="none" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
        s += `<line x1="0" y1="${cy - TW/2}" x2="0" y2="${cy + TW/2}" stroke="#ffffff" stroke-width="2.4" vector-effect="non-scaling-stroke"/>`;
        s += WL(-TL/2, cy, TL/2, cy, 'stroke-opacity=".55" stroke-width="1"');
      }
      return s;
    }
    case 'track': {
      /* 塑胶跑道：红色道面 + 4 条分道线 + 起终点线 */
      const n = 4, lw = d/n;
      let s = rc(x, y, w, d, c, 'rx="40"');
      s += rc(x + 50, y + 50, w - 100, d - 100, shade(c, 1.08), 'rx="30"');
      for (let i = 1; i < n; i++) s += WL(x, y + lw*i, x + w, y + lw*i);
      s += `<line x1="${x + w*.06}" y1="${y}" x2="${x + w*.06}" y2="${y + d}" stroke="#ffffff" stroke-width="2.4" vector-effect="non-scaling-stroke"/>`;
      s += `<line x1="${x + w*.92}" y1="${y}" x2="${x + w*.92}" y2="${y + d}" stroke="#ffffff" stroke-opacity=".5" stroke-width="1.6" stroke-dasharray="10 8" vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'outgym': {
      /* 户外健身区：橡胶场地 + 椭圆机 / 单杠 / 扭腰器 */
      const railSt = 'stroke="#8d949c" stroke-width="2" vector-effect="non-scaling-stroke"';
      let s = rc(x, y, w, d, shade(c, .85), 'rx="120"');
      s += rc(x + 80, y + 80, w - 160, d - 160, '#c98d5f', 'rx="80"');
      s += ec(x + w*.2, y + d*.5, w*.07, d*.09, '#5d666d') + ec(x + w*.3, y + d*.5, w*.07, d*.09, '#5d666d');
      s += ln(x + w*.2, y + d*.5, x + w*.3, y + d*.5, railSt);
      s += ln(x + w*.53, y + d*.26, x + w*.53, y + d*.74, railSt)
        + ln(x + w*.59, y + d*.26, x + w*.59, y + d*.74, railSt)
        + ln(x + w*.53, y + d*.36, x + w*.59, y + d*.36, railSt);
      s += `<circle cx="${x + w*.8}" cy="${y + d*.5}" r="${Math.min(w, d)*.1}" fill="#5d666d" ${ST}/>`;
      s += ln(x + w*.8, y + d*.5, x + w*.87, y + d*.34, railSt);
      return s;
    }

    /* ---------- 户外 · 水景 ---------- */
    case 'pool': {
      /* 泳池：石材池边 + 池壁 + 水面 + 泳道线 + 入水台阶 + 扶梯 */
      const iw = w - 1400, id = d - 1400;
      let s = rc(x, y, w, d, '#d9d2c6', 'rx="200"');
      s += rc(-iw/2, -id/2, iw, id, shade(c, .7), 'rx="60"');
      s += rc(-iw/2 + 180, -id/2 + 180, iw - 360, id - 360, c, 'rx="30"');
      for (let i = 1; i < 5; i++)
        s += WL(-iw/2 + 300, -id/2 + 180 + (id - 360)*i/5, iw/2 - 300, -id/2 + 180 + (id - 360)*i/5,
          'stroke-opacity=".38" stroke-dasharray="16 12"');
      for (let i = 0; i < 3; i++)
        s += rc(-iw/2 + 200, -id*.16 + i*260, 900, 220, shade(c, .82), 'rx="8"');
      [-1, 1].forEach(sg => {
        s += ln(iw/2 - 600, sg*id*.16 - 180, iw/2 - 600, sg*id*.16 + 180, 'stroke="#e8eef0" stroke-width="2.4"')
          + ln(iw/2 - 380, sg*id*.16 - 180, iw/2 - 380, sg*id*.16 + 180, 'stroke="#e8eef0" stroke-width="2.4"');
      });
      return s;
    }
    case 'fountain': {
      /* 喷泉花坛：环形花池 + 水池 + 中央水钵 + 水柱 + 四季花卉 */
      const R = Math.min(w, d)/2;
      let s = `<circle r="${R}" fill="${shade(c, .92)}" ${ST}/>`
        + `<circle r="${R*.87}" fill="${shade(c, .74)}" ${ST}/>`;
      const flowers = ['#d96b8a', '#e0a94a', '#8fbf7a', '#c98ad0'];
      for (let i = 0; i < 16; i++){
        const a = i/16*Math.PI*2, rr = R*(i%2 ? .6 : .68);
        s += `<circle cx="${Math.cos(a)*rr}" cy="${Math.sin(a)*rr}" r="${R*.085}" fill="${flowers[i%4]}" ${ST}/>`;
      }
      s += `<circle r="${R*.5}" fill="${c}" ${ST}/><circle r="${R*.4}" fill="#9fd6e4" ${ST}/>`
        + `<circle r="${R*.24}" fill="${shade(c, .8)}" ${ST}/><circle r="${R*.11}" fill="#eef4f6" ${ST}/>`;
      for (let i = 0; i < 8; i++){
        const a = i/8*Math.PI*2;
        s += ln(Math.cos(a)*R*.12, Math.sin(a)*R*.12, Math.cos(a)*R*.35, Math.sin(a)*R*.35,
          'stroke="#ffffff" stroke-opacity=".7" stroke-dasharray="8 6"');
      }
      return s;
    }

    /* ---------- 户外 · 儿童 ---------- */
    case 'playground': {
      /* 儿童乐园：彩色软垫 + 游乐塔 + 滑梯 + 秋千 + 沙池 + 摇马 */
      let s = rc(x, y, w, d, shade(c, .92), 'rx="260"');
      s += rc(x + w*.04, y + d*.05, w*.92, d*.9, c, 'rx="220"');
      s += rc(x + w*.07, y + d*.1, w*.34, d*.36, '#7fb6d9', 'rx="80"');
      s += rc(x + w*.5, y + d*.56, w*.28, d*.3, '#8fbf7a', 'rx="80"');
      const tx = x + w*.16, ty = y + d*.3, tw2 = w*.16, td2 = d*.24;
      s += rc(tx, ty, tw2, td2, shade(c, .72), 'rx="30"');
      s += `<path d="M${tx + tw2*.12} ${ty + td2*.12}L${tx + tw2*.5} ${ty + td2*.5}L${tx + tw2*.88} ${ty + td2*.12}" ${WLST}/>`;
      s += `<path d="M${tx + tw2*.12} ${ty + td2*.88}L${tx + tw2*.5} ${ty + td2*.5}L${tx + tw2*.88} ${ty + td2*.88}" ${WLST}/>`;
      s += pa(`M${tx + tw2} ${ty + td2*.26}L${tx + tw2*2.2} ${ty + td2*.6}L${tx + tw2*2.2} ${ty + td2*.86}L${tx + tw2} ${ty + td2*.56}Z`, '#e9b949');
      s += ln(x + w*.66, y + d*.14, x + w*.86, y + d*.14) + ln(x + w*.66, y + d*.26, x + w*.86, y + d*.26);
      s += ln(x + w*.68, y + d*.14, x + w*.68, y + d*.26) + ln(x + w*.84, y + d*.14, x + w*.84, y + d*.26);
      s += `<circle cx="${x + w*.76}" cy="${y + d*.74}" r="${Math.min(w, d)*.12}" fill="#e8d5a8" ${ST}/>`;
      s += ec(x + w*.45, y + d*.3, w*.05, w*.05, '#d96b5a');
      return s;
    }
    case 'sandpit': {
      /* 儿童沙池：木框 + 沙面 + 沙堆 + 水桶 / 铲子 */
      let s = rc(x, y, w, d, shade(c, .72), 'rx="40"');
      s += rc(x + 120, y + 120, w - 240, d - 240, c, 'rx="30"');
      s += ec(x + w*.3, y + d*.42, w*.09, d*.1, shade(c, .92));
      s += ec(x + w*.44, y + d*.64, w*.07, d*.08, shade(c, .92));
      s += `<circle cx="${x + w*.72}" cy="${y + d*.4}" r="${Math.min(w, d)*.07}" fill="#d96b5a" ${ST}/>`;
      s += ln(x + w*.66, y + d*.62, x + w*.76, y + d*.72, 'stroke="#e8b84a" stroke-width="2.4"');
      return s;
    }

    /* ---------- 户外 · 景观 ---------- */
    case 'pavilion': {
      /* 景观亭：台基 + 四坡屋顶 + 屋脊线 + 四角立柱 + 宝顶 */
      let s = rc(x + 80, y + 80, w - 160, d - 160, '#e9e2d4', 'rx="40"');
      s += rc(x + 40, y + 40, w - 80, d - 80, c, 'rx="60"');
      s += `<path d="M${x + 40} ${y + 40}L0 0L${x + w - 40} ${y + 40}M${x + 40} ${y + d - 40}L0 0L${x + w - 40} ${y + d - 40}" fill="none" stroke="${shade(c, .62)}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
      const cr = Math.min(w, d)*.055;
      [[x + 70, y + 70], [x + w - 70, y + 70], [x + 70, y + d - 70], [x + w - 70, y + d - 70]].forEach(([px, py]) => {
        s += `<circle cx="${px}" cy="${py}" r="${cr}" fill="${shade(c, .45)}" ${ST}/>`;
      });
      s += `<circle r="${cr*1.2}" fill="${shade(c, .5)}" ${ST}/>`;
      return s;
    }
    case 'pergola': {
      /* 景观廊架：柱 + 顶部格栅 + 藤蔓 */
      const px = w*.1, py = d*.14;
      let s = rc(x + 40, y + 40, w - 80, d - 80, '#e5ddcd', 'rx="30"');
      for (let i = 0; i <= 7; i++)
        s += `<line x1="${x + px}" y1="${y + py + i*(d - 2*py)/7}" x2="${x + w - px}" y2="${y + py + i*(d - 2*py)/7}" stroke="${shade(c, .78)}" stroke-width="1.2" vector-effect="non-scaling-stroke" opacity=".8"/>`;
      [[x + px, y + py], [x + w/2, y + py], [x + w - px, y + py],
        [x + px, y + d - py], [x + w/2, y + d - py], [x + w - px, y + d - py]].forEach(([cx, cy]) => {
        s += rc(cx - Math.min(w, d)*.045, cy - Math.min(w, d)*.045, Math.min(w, d)*.09, Math.min(w, d)*.09, shade(c, .7));
      });
      [[x + px, y + py], [x + w - px, y + d - py]].forEach(([cx, cy]) => {
        s += `<circle cx="${cx}" cy="${cy}" r="${Math.min(w, d)*.09}" fill="#7fa86a" fill-opacity=".85" ${ST}/>`;
      });
      return s;
    }
    case 'planter': {
      /* 树池花钵：石框 + 种植土 + 灌木球 */
      let s = rc(x, y, w, d, shade(c, .88), 'rx="30"');
      s += rc(x + 140, y + 140, w - 280, d - 280, '#5d4a3a', 'rx="20"');
      s += `<circle r="${m*.26}" fill="#7fa86a" ${ST}/>`
        + `<circle cx="${-m*.12}" cy="${-m*.08}" r="${m*.15}" fill="#8fbf7a" ${ST}/>`
        + `<circle cx="${m*.13}" cy="${m*.13}" r="${m*.13}" fill="#6f9b57" ${ST}/>`;
      return s;
    }
    case 'rock': {
      /* 景观石：不规则轮廓 + 高光棱线 + 旁边点缀草丛 */
      const R = Math.min(w, d)/2;
      let s = pa(`M${-R*.95} ${R*.15}Q${-R*1.02} ${-R*.35} ${-R*.3} ${-R*.78}Q${R*.38} ${-R*.98} ${R*.82} ${-R*.28}`
        + `Q${R*1.02} ${R*.22} ${R*.35} ${R*.62}Q${-R*.42} ${R*.9} ${-R*.95} ${R*.15}Z`, c);
      s += pa(`M${-R*.45} ${-R*.2}Q${0} ${-R*.55} ${R*.45} ${-R*.12}`, 'none', 'stroke="#ffffff" stroke-opacity=".35"');
      s += `<circle cx="${R*.55}" cy="${R*.6}" r="${R*.2}" fill="#8fbf7a" opacity=".85"/>`;
      return s;
    }
    case 'lounge': {
      /* 泳池躺椅：座面 + 靠背 + 坐垫 + 横撑 */
      let s = rc(x + 60, y + d*.16, w - 120, d*.68, '#e8e2d6', 'rx="60"');
      s += rc(x + w*.04, y + d*.16, w*.22, d*.68, c, 'rx="30"');
      s += rc(x + w*.3, y + d*.24, w*.42, d*.28, '#f4f0e8', 'rx="40"');
      s += ln(x + w*.3, y + d*.66, x + w*.94, y + d*.66, DASH);
      return s;
    }
    case 'parasol': {
      /* 遮阳伞：伞面 + 伞骨 + 伞杆 + 伞座 */
      const R = Math.min(w, d)/2;
      let s = `<circle r="${R}" fill="${c}" fill-opacity=".85" ${ST}/>`;
      for (let i = 0; i < 8; i++){
        const a = i/8*Math.PI*2;
        s += ln(0, 0, Math.cos(a)*R*.98, Math.sin(a)*R*.98, 'opacity=".4"');
      }
      s += `<circle r="${R*.17}" fill="${shade(c, 1.22)}" ${ST}/>`
        + `<circle r="${R*.05}" fill="#6b6560" ${ST}/>`;
      return s;
    }

    /* ---------- 沙盘 · 建筑 ---------- */
    case 'tower18': return bldgPlan(w, d, 18, c, { units: 2 });
    case 'tower26': return bldgPlan(w, d, 26, c, { units: 2 });
    case 'tower33': return bldgPlan(w, d, 33, c, { units: 2 });
    case 'midrise11': return bldgPlan(w, d, 11, c, { units: 3 });
    case 'midrise6': {
      let s = bldgPlan(w, d, 6, c, { units: 4 });
      s += `<line x1="${-w/2}" y1="0" x2="${w/2}" y2="0" stroke="${shade(c, .7)}" stroke-width="1.2" stroke-dasharray="8 5" vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'townhouse': {
      let s = bldgPlan(w, d, 3, c, { units: 3, core: false });
      const n = 3, gw = w/n;
      for (let i = 0; i < n; i++)
        s += rc(-w/2 + gw*i + gw*.28, d/2 - 620, gw*.44, 520, '#8d949c', 'rx="6"');
      return s;
    }
    case 'villa': {
      let s = bldgPlan(w, d, 2, c, { units: 1, core: false });
      s += `<path d="M${-w/2} ${-d/2}L0 0L${w/2} ${-d/2}M${-w/2} ${d/2}L0 0L${w/2} ${d/2}" fill="none" stroke="${shade(c, .68)}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
      s += `<circle cx="${-w*.3}" cy="${d*.28}" r="${Math.min(w, d)*.09}" fill="#7fb6d9" ${ST}/>`;
      return s;
    }
    case 'podium': {
      const x = -w/2, y = -d/2, n = Math.max(3, Math.round(w/8000)), sw = w/n;
      let s = rc(x, y, w, d, shade(c, 1.04), 'rx="20"');
      s += `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="none" stroke="#3d3a34" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
      for (let i = 1; i < n; i++) s += ln(x + sw*i, y, x + sw*i, y + d*.62);
      s += `<rect x="${x + 60}" y="${y + 60}" width="${w - 120}" height="${d*.42}" fill="none" stroke="${shade(c, .72)}" stroke-width="1.2" stroke-dasharray="10 6" vector-effect="non-scaling-stroke"/>`;
      for (let i = 0; i < n; i++) s += rc(x + sw*i + sw*.34, y + d*.02, sw*.32, 260, '#f2f4f5', 'opacity=".9"');
      return s;
    }
    case 'kindergarten': {
      let s = rc(x, y, w, d, shade(c, .9), 'rx="26"');
      const bw = w*.58;
      s += rc(x + 80, y + 80, bw - 160, d - 160, c, 'rx="20"');
      for (let i = 1; i < 3; i++) s += ln(x + 80, y + 80 + (d - 160)*i/3, x + bw - 80, y + 80 + (d - 160)*i/3, 'opacity=".45"');
      const px = x + bw + w*.06, pw = w - bw - w*.12;
      s += `<rect x="${px}" y="${y + d*.12}" width="${pw}" height="${d*.7}" fill="#8fbf7a" fill-opacity=".55" ${ST}/>`;
      s += pa(`M${px + pw*.15} ${y + d*.6}L${px + pw*.55} ${y + d*.3}L${px + pw*.55} ${y + d*.46}L${px + pw*.2} ${y + d*.7}Z`, '#e9b949');
      s += `<circle cx="${px + pw*.78}" cy="${y + d*.32}" r="${Math.min(pw, d)*.1}" fill="#7fb6d9" ${ST}/>`;
      return s;
    }

    /* ---------- 沙盘 · 配套 ---------- */
    case 'gate': {
      const x = -w/2, y = -d/2, pw = Math.min(w*.1, 2200);
      let s = rc(x, y + d*.24, w, d*.52, '#d9d2c6', 'rx="10"');
      s += rc(x, y + d*.24, pw, d*.52, c) + rc(x + w - pw, y + d*.24, pw, d*.52, c);
      s += `<rect x="${x + pw}" y="${y + d*.34}" width="${w - 2*pw}" height="${d*.32}" fill="none" stroke="${shade(c, .6)}" stroke-width="1.4" stroke-dasharray="10 6" vector-effect="non-scaling-stroke"/>`;
      s += rc(x + w*.42, y + d*.05, w*.16, d*.34, '#f2f4f5', 'rx="6"');
      s += ln(x + pw, y + d*.5, x + w*.42, y + d*.5, 'stroke="#c4553f" stroke-width="3"') + ln(x + w*.58, y + d*.5, x + w - pw, y + d*.5, 'stroke="#c4553f" stroke-width="3"');
      return s;
    }
    case 'evparking': {
      const t = Math.max(30, Math.min(w, d)*.035), W = 'fill="#ffffff" fill-opacity=".9" stroke="none"';
      let s = `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" fill="${c}" fill-opacity=".22" ${ST}/>`;
      s += `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${t}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${-d/2}" width="${t}" height="${d}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${d/2 - t}" width="${w}" height="${t}" ${W}/>`;
      s += rc(w/2 - 620, -d/2 + 60, 520, 720, '#5d666d', 'rx="8"');
      s += `<circle cx="${w/2 - 360}" cy="${-d/2 + 840}" r="200" fill="#6fe0a8" ${ST}/>`;
      s += pa(`M${w/2 - 520} ${d/2 - 200}l80 160l80 -160`, 'none', 'stroke="#6fe0a8" stroke-width="2.4"');
      return s;
    }
    case 'parkingrow': {
      const n = 4, sw = w/n, t = Math.max(25, Math.min(sw, d)*.03), W = 'fill="#ffffff" fill-opacity=".9" stroke="none"';
      let s = `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" fill="${c}" fill-opacity=".18" ${ST}/>`;
      for (let i = 0; i <= n; i++) s += `<rect x="${-w/2 + i*sw - t/2}" y="${-d/2}" width="${t}" height="${d}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${t}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${d/2 - t}" width="${w}" height="${t}" ${W}/>`;
      for (let i = 0; i < n; i++) s += `<text x="${-w/2 + sw*(i + .5)}" y="0" font-size="${Math.min(sw, d)*.3}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" fill-opacity=".75">P</text>`;
      return s;
    }

    /* ---------- 沙盘 · 景观 ---------- */
    case 'plaza': {
      let s = rc(x, y, w, d, c, 'rx="20"');
      for (let i = 1; i < 6; i++) s += ln(x, y + d*i/6, x + w, y + d*i/6, 'stroke="#ffffff" stroke-opacity=".35" stroke-width="1.2"');
      s += `<circle r="${Math.min(w, d)*.16}" fill="${shade(c, .82)}" ${ST}/>`
        + `<circle r="${Math.min(w, d)*.1}" fill="#9fd6e4" ${ST}/>`;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
        s += rc(a*w*.38 - 900, b*d*.36 - 900, 1800, 1800, '#8a6a4a', 'rx="30"');
      });
      return s;
    }
    case 'mirrorpool': {
      const iw = w - 900, id = d - 900;
      let s = rc(x, y, w, d, '#d9d2c6', 'rx="160"');
      s += rc(-iw/2, -id/2, iw, id, c, 'rx="30"');
      for (let i = 1; i < 4; i++) s += ln(-iw/2, -id/2 + id*i/4, iw/2, -id/2 + id*i/4, 'stroke="#ffffff" stroke-opacity=".28" stroke-width="1.2"');
      [[-w*.24, 0], [-w*.02, 0], [w*.2, 0]].forEach(([px, py]) => s += rc(px - 420, py - 260, 840, 520, '#c9c2b6', 'rx="18"'));
      return s;
    }
    case 'cascade': {
      let s = rc(x, y, w, d, '#d9d2c6', 'rx="40"');
      s += rc(x + 100, y + 100, w - 200, d*.4, c, 'rx="20"');
      for (let i = 1; i < 5; i++) s += ln(x + 100, y + 100 + d*.4*i/5, x + w - 100, y + 100 + d*.4*i/5, 'stroke="#ffffff" stroke-opacity=".45"');
      s += rc(x + w*.08, y + d*.58, w*.84, d*.3, '#9fd6e4', 'rx="20"');
      return s;
    }
    case 'lawn': {
      let s = rc(x, y, w, d, c, 'rx="40"');
      for (let i = 0; i < 6; i++) s += rc(x, y + d*i/6, w, d/12, shade(c, 1.06), 'opacity=".6"');
      s += `<rect x="${x + 30}" y="${y + 30}" width="${w - 60}" height="${d - 60}" fill="none" stroke="${shade(c, .75)}" stroke-width="1.2" ${DASH} vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'hedge': {
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      let s = hz ? rc(x, y, w, d, c, 'rx="30"') : rc(x, y, w, d, c, 'rx="30"');
      const n = Math.max(4, Math.round(L/1200));
      for (let i = 0; i < n; i++){
        const px = hz ? x + L*(i + .5)/n : 0, py = hz ? 0 : y + L*(i + .5)/n;
        s += `<circle cx="${px}" cy="${py}" r="${T*.42}" fill="${i%2 ? shade(c, 1.1) : shade(c, .92)}" fill-opacity=".85" ${ST}/>`;
      }
      return s;
    }
    case 'ginkgo': return treePlan(w, d, c);
    case 'cherry': return treePlan(w, d, c);
    case 'osmanthus': return treePlan(w, d, c);

    /* ---------- 沙盘 · 城市 ---------- */
    case 'cityblock': {
      let s = rc(x, y, w, d, shade(c, .86), 'rx="20"');
      const blocks = [[.04, .08, .34, .52, 1.02], [.42, .04, .3, .4, .9], [.42, .52, .3, .42, 1.1], [.76, .18, .2, .64, .96]];
      blocks.forEach(([bx, by, bw, bd, sh]) => {
        s += rc(x + w*bx, y + d*by, w*bw, d*bd, shade(c, sh), 'rx="8"');
      });
      s += `<path d="M${x} ${y + d*.5}H${x + w}" stroke="${shade(c, .7)}" stroke-width="1.4" stroke-dasharray="10 8" vector-effect="non-scaling-stroke"/>`;
      return s;
    }

    /* ---------- 沙盘 · 地库 ---------- */
    case 'garageslab': {
      /* 地库顶板覆土：混凝土收边 + 覆土草坪 + 种植条纹 + 通风井 */
      const x = -w/2, y = -d/2;
      let s = rc(x, y, w, d, '#8d8a84', 'rx="24"');
      s += rc(x + 300, y + 300, w - 600, d - 600, c, 'rx="18"');
      for (let i = 0; i < 5; i++)
        s += rc(x + 300, y + 300 + (d - 600)*i/5, w - 600, (d - 600)*.1, shade(c, 1.07), 'opacity=".55"');
      s += `<rect x="${x + 900}" y="${y + 900}" width="${w - 1800}" height="${d - 1800}" fill="none" stroke="${shade(c, .8)}" stroke-width="1.4" stroke-dasharray="18 12" vector-effect="non-scaling-stroke"/>`;
      [[-1, -1], [1, 1]].forEach(([a, b]) =>
        s += rc(a*w*.3 - 500, b*d*.3 - 500, 1000, 1000, '#b9b6b0', 'rx="10"'));
      return s;
    }
    case 'garagemodule': {
      /* 地库标准模块：外墙 + 按进深自适应排车位 + 通道 + 柱网 + 防火分区
       * 排布公式与 3D 建模 / 车位统计共用 core/garage/layout.js */
      const x = -w/2, y = -d/2, L = garageLayout(w, d), m = L.margin;
      let s = rc(x, y, w, d, '#c9c6c0', 'rx="16"');
      s += `<rect x="${x + 150}" y="${y + 150}" width="${w - 300}" height="${d - 300}" fill="none" stroke="#6f6b64" stroke-width="4" vector-effect="non-scaling-stroke"/>`;
      L.rows.forEach(r => {
        s += `<rect x="${x + m}" y="${r.z0}" width="${w - 2*m}" height="${r.depth}" fill="#b4b1ab" fill-opacity=".45"/>`;
        for (let i = 0; i <= L.stallsPerRow; i++)
          s += ln(x + m + L.stallW*i, r.z0, x + m + L.stallW*i, r.z0 + r.depth,
            'stroke="#ffffff" stroke-opacity=".8" stroke-width="1.2"');
        s += ln(x + m, r.z0, x + w - m, r.z0, 'stroke="#ffffff" stroke-opacity=".6" stroke-width="1.2"');
        s += ln(x + m, r.z0 + r.depth, x + w - m, r.z0 + r.depth, 'stroke="#ffffff" stroke-opacity=".6" stroke-width="1.2"');
      });
      // 通道中线 + 行车箭头
      L.aisles.forEach(a => {
        const az = a.z0 + a.depth/2;
        s += ln(x + m, az, x + w - m, az, 'stroke="#ffffff" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="14 10"');
        for (let i = 0; i < 3; i++){
          const ax = x + m + (w - 2*m)*(i + .5)/3;
          s += pa(`M${ax - 320} ${az - 140}L${ax + 200} ${az}L${ax - 320} ${az + 140}`, 'none',
            'stroke="#ffffff" stroke-opacity=".75" stroke-width="2" stroke-linejoin="round"');
        }
      });
      // 柱网：沿每条通道两侧边线
      const colZ = [];
      L.aisles.forEach(a => { colZ.push(a.z0, a.z0 + a.depth); });
      for (let px = x + L.column/2; px < x + w - L.column*.4; px += L.column)
        colZ.forEach(pz => {
          s += rc(px - L.columnSize/2, pz - L.columnSize/2, L.columnSize, L.columnSize, '#6f6b64', 'rx="6"');
        });
      // 防火分区（虚线）
      s += `<line x1="${x + w*.5}" y1="${y + 150}" x2="${x + w*.5}" y2="${y + d - 150}" stroke="#c4553f" stroke-width="2" stroke-dasharray="16 10" vector-effect="non-scaling-stroke" opacity=".8"/>`;
      const fs = Math.max(900, Math.min(w, d)*.06);
      s += `<text x="${x + m + Math.max(L.stallW*.5, 300)}" y="${y + d - 400}" font-size="${fs}" fill="#8d7f6c" font-weight="700">B1</text>`;
      return s;
    }
    case 'garageentry': {
      /* 地库出入口：挡墙 + 坡道 + 居中虚线 + 顶部警示斜纹 + 限高杆 */
      const x = -w/2, y = -d/2, wall = Math.max(300, w*.06);
      let s = rc(x, y, w, d, '#b4b1ab', 'rx="10"');
      s += rc(x, y, wall, d, '#8d8a84') + rc(x + w - wall, y, wall, d, '#8d8a84');
      const iw = w - 2*wall;
      s += ln(0, y + 500, 0, y + d - 500, 'stroke="#ffffff" stroke-opacity=".6" stroke-width="1.6" stroke-dasharray="18 12"');
      for (let i = 0; i < 6; i++)
        s += pa(`M${x + wall + iw*i/6} ${y + 1200}l${iw/6} 700`, 'none',
          'stroke="#e8b04a" stroke-width="10" stroke-opacity=".85"');
      s += rc(x + wall + 200, y + d*.14, iw - 400, 500, '#3a3f44', 'rx="6"');
      s += `<text x="0" y="${y + d*.14 + 360}" font-size="${Math.min(iw*.16, 700)}" text-anchor="middle" fill="#f2f4f5" font-weight="700">P 2.2m</text>`;
      s += ln(x + wall, y + d*.36, x + w - wall, y + d*.36, 'stroke="#c4553f" stroke-width="6"');
      return s;
    }
    case 'garagecore': {
      /* 出地面楼梯间：混凝土外墙 + 楼梯踏步 + 门洞 + 玻璃雨棚 */
      const x = -w/2, y = -d/2, t = Math.max(250, Math.min(w, d)*.06);
      let s = rc(x, y, w, d, '#c9c6c0', 'rx="10"');
      s += `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="none" stroke="#6f6b64" stroke-width="5" vector-effect="non-scaling-stroke"/>`;
      s += `<rect x="${x + t}" y="${y + t}" width="${w - 2*t}" height="${d - 2*t}" fill="none" stroke="#8d8a84" stroke-width="1.4" stroke-dasharray="8 6" vector-effect="non-scaling-stroke"/>`;
      const n = 7;
      for (let i = 1; i <= n; i++) s += ln(x + t, y + t + (d - 2*t)*i/(n + 1), x + w - t, y + t + (d - 2*t)*i/(n + 1), 'opacity=".5"');
      s += ln(w/2 - 120, y + t, w/2 - 120, y + d - t, 'stroke="#6f6b64" stroke-width="1.4"');
      s += pa(`M${x + w*.18} ${y + d} l0 ${-Math.min(w, d)*.18}`, 'none', 'stroke="#b5653a" stroke-width="3"');
      s += rc(x - 200, y - 200, w + 400, 260, 'none', 'stroke="#8d7f6c" stroke-width="1.4" stroke-dasharray="10 7"');
      return s;
    }
    case 'ventwell': {
      const t = Math.max(220, Math.min(w, d)*.12);
      let s = rc(x, y, w, d, '#c9c6c0', 'rx="16"');
      s += rc(x + t, y + t, w - 2*t, d - 2*t, '#8d8a84', 'rx="6"');
      for (let i = 1; i < 6; i++) s += ln(x + t, y + t + (d - 2*t)*i/6, x + w - t, y + t + (d - 2*t)*i/6, 'stroke="#f2f4f5" stroke-opacity=".5" stroke-width="1.5"');
      return s;
    }
    case 'skylight': {
      const t = Math.max(300, Math.min(w, d)*.08);
      let s = rc(x, y, w, d, '#c9c6c0', 'rx="20"');
      s += rc(x + t, y + t, w - 2*t, d - 2*t, '#9fd6e4', 'rx="10"');
      for (let i = 1; i < 4; i++){
        s += ln(x + t + (w - 2*t)*i/4, y + t, x + t + (w - 2*t)*i/4, y + d - t, 'stroke="#ffffff" stroke-opacity=".65" stroke-width="1.6"');
        s += ln(x + t, y + t + (d - 2*t)*i/4, x + w - t, y + t + (d - 2*t)*i/4, 'stroke="#ffffff" stroke-opacity=".65" stroke-width="1.6"');
      }
      s += pa(`M${x + t} ${y + d - t}L${x + w - t} ${y + t}`, 'none', 'stroke="#ffffff" stroke-opacity=".45" stroke-width="2"');
      return s;
    }
    case 'garagecol': {
      let s = rc(x, y, w, d, '#8d949c');
      s += `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + d}" stroke="#e8b04a" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      s += rc(-w*.24, -d*.24, w*.48, d*.48, '#6f6b64');
      return s;
    }
    case 'garagefan': {
      const x = -w/2, y = -d/2, t = Math.max(250, Math.min(w, d)*.06);
      let s = rc(x, y, w, d, '#c9c6c0', 'rx="8"');
      s += `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="none" stroke="#6f6b64" stroke-width="5" vector-effect="non-scaling-stroke"/>`;
      const r = Math.min(w, d)*.16;
      [[-1, -1], [1, 1]].forEach(([a, b]) => {
        const cx = a*w*.24, cy = b*d*.22;
        s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#9aa3a8" ${ST}/><circle cx="${cx}" cy="${cy}" r="${r*.36}" fill="#5d666d" ${ST}/>`;
      });
      s += rc(x + w*.36, y + d - t*1.4, w*.28, t*.9, '#8d8a84');
      for (let i = 0; i < 4; i++) s += ln(x + w*.36, y + d - t*1.3 + i*t*.22, x + w*.64, y + d - t*1.3 + i*t*.22, 'stroke="#f2f4f5" stroke-opacity=".5"');
      return s;
    }
    case 'fireroll': {
      let s = rc(x, y, w, d, '#b4b1ab');
      s += rc(x, y, w*.16, d, '#8d8a84') + rc(x + w*.84, y, w*.16, d, '#8d8a84');
      s += rc(x + w*.16, y - d*.2, w*.68, d*1.4, '#9aa3a8', 'rx="6"');
      s += `<line x1="${x + w*.16}" y1="${y + d*.9}" x2="${x + w*.84}" y2="${y + d*.9}" stroke="#c4553f" stroke-width="2" stroke-dasharray="14 8" vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'parkingaccessible': {
      const t = Math.max(30, Math.min(w, d)*.03), W = 'fill="#ffffff" fill-opacity=".9" stroke="none"';
      let s = `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" fill="${c}" fill-opacity=".2" ${ST}/>`;
      s += `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${t}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${d/2 - t}" width="${w}" height="${t}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${-d/2}" width="${t}" height="${d}" ${W}/>`;
      s += `<circle cx="${w*.26}" cy="${-d*.18}" r="${Math.min(w, d)*.1}" fill="none" stroke="#ffffff" stroke-width="2.4" vector-effect="non-scaling-stroke"/>`;
      s += `<path d="M${w*.26} ${-d*.1}L${w*.26} ${d*.06}L${w*.4} ${d*.2}M${w*.26} ${d*.02}L${w*.12} ${d*.16}M${w*.26} ${-d*.24}L${w*.26} ${-d*.3}" stroke="#ffffff" stroke-width="2.6" fill="none" vector-effect="non-scaling-stroke"/>`;
      s += rc(-w*.4, -d*.34, w*.5, d*.62, 'none', 'stroke="#ffffff" stroke-width="2" stroke-dasharray="10 8"');
      return s;
    }
    case 'parkingsub': {
      const t = Math.max(30, Math.min(w, d)*.025), W = 'fill="#ffffff" fill-opacity=".9" stroke="none"';
      let s = `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" fill="${c}" fill-opacity=".2" ${ST}/>`;
      s += `<rect x="${-w/2}" y="${-d/2}" width="${t}" height="${d}" ${W}/>`;
      s += `<rect x="${w/2 - t}" y="${-d/2}" width="${t}" height="${d}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${t}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${d/2 - t}" width="${w}" height="${t}" ${W}/>`;
      s += `<line x1="${-w/2}" y1="0" x2="${w/2}" y2="0" stroke="#ffffff" stroke-width="1.6" stroke-dasharray="12 8" vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'parkingcompact': {
      const t = Math.max(30, Math.min(w, d)*.04), W = 'fill="#ffffff" fill-opacity=".9" stroke="none"';
      let s = `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" fill="${c}" fill-opacity=".2" ${ST}/>`;
      s += `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${t}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${d/2 - t}" width="${w}" height="${t}" ${W}/>`;
      s += `<rect x="${-w/2}" y="${-d/2}" width="${t}" height="${d}" ${W}/>`;
      s += `<rect x="${w/2 - t}" y="${-d/2}" width="${t}" height="${d}" ${W}/>`;
      s += `<text x="0" y="0" font-size="${Math.min(w, d)*.3}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" fill-opacity=".8" font-weight="700">S</text>`;
      return s;
    }
    case 'speedbump': {
      const n = Math.max(4, Math.round(w/450));
      let s = rc(x, y, w, d, c, 'rx="20"');
      for (let i = 0; i < n; i += 2)
        s += rc(x + w*i/n, y, w/n, d, '#3a3f44', 'opacity=".85"');
      return s;
    }
    case 'garagemirror': {
      const R = Math.min(w, d)/2;
      return `<circle r="${R*.92}" fill="#dfeaee" ${ST}/><circle r="${R*.7}" fill="#bcd6e2" ${ST}/>`
        + pa(`M${-R*.3} ${R*.2}L${R*.32} ${-R*.24}`, 'none', 'stroke="#ffffff" stroke-opacity=".8" stroke-width="3"')
        + `<circle r="${R*.12}" fill="${c}" ${ST}/>`;
    }
    case 'garagesign': {
      const hz = w >= d;
      let s = hz ? rc(x, y, w, d, c, 'rx="8"') : rc(x, y, w, d, c, 'rx="8"');
      const n = Math.max(2, Math.round((hz ? w : d)/700));
      for (let i = 0; i < n; i++){
        const px = hz ? x + (w/n)*(i + .5) : 0, py = hz ? 0 : y + (d/n)*(i + .5);
        s += `<circle cx="${px}" cy="${py}" r="${Math.min(w, d)*.16}" fill="#3fc98a" ${ST}/>`;
        s += pa(hz ? `M${px - 60} ${py}h120M${px + 20} ${py - 50}l50 50l-50 50`
                   : `M${px} ${py - 60}v120M${px - 50} ${py + 20}l50 50l50 -50`,
          'none', 'stroke="#1d3b30" stroke-width="2.4"');
      }
      return s;
    }

    /* ---------- 沙盘 · 交通 ---------- */
    case 'road4': case 'road6': {
      /* 城市道路：沥青 + 车道虚线 + 中央双黄线 + 两侧边线（长边自动作为行车方向） */
      const lanes = t === 'road6' ? 6 : 4, hz = w >= d;
      const L = hz ? w : d, A = hz ? d : w, lh = A/lanes;
      const yellow = 'stroke="#e8c14f" stroke-opacity=".9" stroke-width="1.6" vector-effect="non-scaling-stroke"';
      let s = rc(x, y, w, d, '#3f4247', 'rx="4"');
      for (let i = 1; i < lanes; i++){
        const p = -A/2 + A*i/lanes;
        if (i*2 === lanes){
          if (hz){
            s += ln(x, y + A/2 + lh*i - A/2 - 160, x + w, y + A/2 + lh*i - A/2 - 160, yellow);
            s += ln(x, y + A/2 + lh*i - A/2 + 160, x + w, y + A/2 + lh*i - A/2 + 160, yellow);
          } else {
            s += ln(x + A/2 + lh*i - A/2 - 160, y, x + A/2 + lh*i - A/2 - 160, y + d, yellow);
            s += ln(x + A/2 + lh*i - A/2 + 160, y, x + A/2 + lh*i - A/2 + 160, y + d, yellow);
          }
        } else {
          s += hz
            ? `<line x1="${x}" y1="${p}" x2="${x + L}" y2="${p}" stroke="#f2f4f5" stroke-opacity=".75" stroke-width="1.4" stroke-dasharray="60 46" vector-effect="non-scaling-stroke"/>`
            : `<line x1="${p}" y1="${y}" x2="${p}" y2="${y + L}" stroke="#f2f4f5" stroke-opacity=".75" stroke-width="1.4" stroke-dasharray="60 46" vector-effect="non-scaling-stroke"/>`;
        }
      }
      if (hz){
        s += ln(x, y + 90, x + w, y + 90, 'stroke="#f2f4f5" stroke-opacity=".65" stroke-width="1.4" vector-effect="non-scaling-stroke"');
        s += ln(x, y + d - 90, x + w, y + d - 90, 'stroke="#f2f4f5" stroke-opacity=".65" stroke-width="1.4" vector-effect="non-scaling-stroke"');
      } else {
        s += ln(x + 90, y, x + 90, y + d, 'stroke="#f2f4f5" stroke-opacity=".65" stroke-width="1.4" vector-effect="non-scaling-stroke"');
        s += ln(x + w - 90, y, x + w - 90, y + d, 'stroke="#f2f4f5" stroke-opacity=".65" stroke-width="1.4" vector-effect="non-scaling-stroke"');
      }
      return s;
    }
    case 'crossroad': {
      /* 平交路口：十字沥青 + 四向斑马线 + 中心导流虚线 */
      let s = rc(x, y, w, d, '#3f4247');
      const sw = w*.26, sh = d*.26, bw = w*.07, bh = d*.07;
      const zebra = (z0, z1, vertical) => {
        const n = 6;
        let o = '';
        for (let i = 0; i < n; i++){
          const t0 = i/n;
          o += vertical
            ? rc(z0, y + d*(.06 + .88*t0), bw, d*.88/n*.55, '#f2f4f5', 'opacity=".85"')
            : rc(x + w*(.06 + .88*t0), z0, w*.88/n*.55, bh, '#f2f4f5', 'opacity=".85"');
        }
        return o;
      };
      s += zebra(y + d*.04, 0, false) + zebra(y + d*.89, 0, false);
      s += zebra(x + w*.04, 0, true) + zebra(x + w*.89, 0, true);
      s += `<rect x="${-sw/2}" y="${-sh/2}" width="${sw}" height="${sh}" fill="none" stroke="#f2f4f5" stroke-width="1.4" stroke-dasharray="40 30" vector-effect="non-scaling-stroke" opacity=".55"/>`;
      return s;
    }
    case 'trafficlight': {
      const R = Math.min(w, d)/2;
      return `<circle r="${R*.85}" fill="#3a3f44" ${ST}/>`
        + rc(-R*.16, -R*.9, R*.32, R*1.8, '#2f3338', 'rx="6"')
        + `<circle cx="0" cy="${-R*.5}" r="${R*.15}" fill="#c4553f" ${ST}/>`
        + `<circle cx="0" cy="0" r="${R*.15}" fill="#e8b04a" ${ST}/>`
        + `<circle cx="0" cy="${R*.5}" r="${R*.15}" fill="#4f9d6a" ${ST}/>`;
    }
    case 'busstop': {
      /* 公交站：候车亭 + 长椅 + 站牌 + 停车湾 */
      let s = rc(x, y, w, d, '#d9d2c6', 'rx="10"');
      s += rc(x + w*.05, y + d*.14, w*.56, d*.72, '#9aa3a8', 'rx="8"');
      s += ln(x + w*.08, y + d*.8, x + w*.58, y + d*.8, 'stroke="#c9a678" stroke-width="4"');
      s += ln(x + w*.74, y + d*.26, x + w*.74, y + d*.74, 'stroke="#3a3f44" stroke-width="3"');
      s += rc(x + w*.72, y + d*.26, w*.07, d*.2, '#2f6fa8', 'rx="4"');
      s += `<line x1="${x + w*.05}" y1="${y + d*.96}" x2="${x + w*.95}" y2="${y + d*.96}" stroke="#ffffff" stroke-opacity=".6" stroke-dasharray="18 12" vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'metroexit': {
      /* 地铁出入口：楼梯口 + 雨棚 + 地铁标识 */
      let s = rc(x, y, w, d, '#d9d2c6', 'rx="12"');
      s += rc(x + w*.16, y + d*.12, w*.68, d*.56, '#8d949c', 'rx="8"');
      for (let i = 1; i < 6; i++)
        s += ln(x + w*.16, y + d*.12 + d*.56*i/6, x + w*.84, y + d*.12 + d*.56*i/6, 'stroke="#f2f4f5" stroke-opacity=".55" stroke-width="1.4"');
      s += `<circle cx="${x + w*.5}" cy="${y + d*.82}" r="${m*.15}" fill="#2f6fa8" ${ST}/>`;
      s += `<text x="${x + w*.5}" y="${y + d*.82}" font-size="${m*.18}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-weight="700">M</text>`;
      return s;
    }
    case 'barrier': {
      const hz = w >= d;
      let s = hz ? rc(x, y + d*.18, w*.18, d*.64, '#3a3f44', 'rx="5"') : rc(x + w*.18, y, w*.64, d*.18, '#3a3f44', 'rx="5"');
      s += hz ? rc(x + w*.18, y + d*.42, w*.76, d*.16, '#e8e6e0', 'rx="4"') : rc(x + w*.42, y + d*.18, w*.16, d*.76, '#e8e6e0', 'rx="4"');
      for (let i = 0; i < 4; i++)
        s += hz ? rc(x + w*(.24 + .18*i), y + d*.42, w*.08, d*.16, '#c4553f', 'opacity=".85"')
                : rc(x + w*.42, y + d*(.24 + .18*i), w*.16, d*.08, '#c4553f', 'opacity=".85"');
      return s;
    }
    case 'bikeshed': case 'evshed': {
      let s = rc(x, y, w, d, '#cfc7b8', 'rx="10"');
      s += `<rect x="${x + 120}" y="${y + 120}" width="${w - 240}" height="${d - 240}" fill="none" stroke="#8d8a84" stroke-width="1.4" stroke-dasharray="14 10" vector-effect="non-scaling-stroke"/>`;
      for (let i = 0; i <= 3; i++)
        s += `<circle cx="${x + 120 + (w - 240)*i/3}" cy="${y + 120}" r="${Math.min(w, d)*.035}" fill="#8d8a84" ${ST}/>`
          + `<circle cx="${x + 120 + (w - 240)*i/3}" cy="${y + d - 120}" r="${Math.min(w, d)*.035}" fill="#8d8a84" ${ST}/>`;
      if (t === 'evshed'){
        for (let i = 0; i < 4; i++)
          s += rc(x + w*(.12 + .2*i), y + d*.3, w*.05, d*.18, '#3fc98a', 'rx="4"');
      } else {
        for (let i = 0; i < 5; i++)
          s += ln(x + w*(.12 + .18*i), y + d*.3, x + w*(.12 + .18*i), y + d*.72, 'stroke="#5d666d" stroke-width="2.4"');
      }
      return s;
    }
    case 'firelane': {
      let s = rc(x, y, w, d, '#9c4a3a', 'fill-opacity=".16" rx="6"');
      s += `<rect x="${x + 80}" y="${y + 80}" width="${w - 160}" height="${d - 160}" fill="none" stroke="#c4553f" stroke-width="2.2" stroke-dasharray="26 14" vector-effect="non-scaling-stroke"/>`;
      s += ln(x, 0, x + w, 0, 'stroke="#ffffff" stroke-opacity=".5" stroke-dasharray="20 16"');
      s += `<text x="0" y="${y + d - 500}" font-size="${Math.min(w, d)*.22}" text-anchor="middle" fill="#c4553f" font-weight="700" opacity=".75">消防车道</text>`;
      return s;
    }
    case 'turnaround': {
      let s = rc(x, y, w, d, '#6f6b64', 'rx="20"');
      s += `<circle r="${m*.42}" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="24 16" vector-effect="non-scaling-stroke"/>`;
      s += `<circle r="${m*.3}" fill="#7a8a5a" ${ST}/>`
        + `<circle r="${m*.16}" fill="#4e7c46" ${ST}/>`
        + `<circle r="${m*.05}" fill="#6b5442" ${ST}/>`;
      return s;
    }
    case 'firelanehidden': {
      let s = rc(x, y, w, d, c, 'rx="6"');
      for (let i = 0; i < 4; i++) s += rc(x, y + d*i/4, w, d/8, shade(c, 1.06), 'opacity=".5"');
      s += `<rect x="${x + 60}" y="${y + 60}" width="${w - 120}" height="${d - 120}" fill="none" stroke="#c4553f" stroke-width="2" stroke-dasharray="22 14" vector-effect="non-scaling-stroke" opacity=".7"/>`;
      s += `<text x="0" y="0" font-size="${Math.min(w, d)*.2}" text-anchor="middle" dominant-baseline="central" fill="#c4553f" opacity=".55" font-weight="700">隐形消防车道</text>`;
      return s;
    }
    case 'accessramp': {
      let s = rc(x, y, w, d, '#cfc7b8', 'rx="8"');
      for (let i = 1; i < 6; i++) s += ln(x + w*i/6, y, x + w*i/6, y + d, 'opacity=".3"');
      s += ln(x, y + d*.12, x + w, y + d*.12, 'stroke="#9aa3a8" stroke-width="2.4"');
      s += ln(x, y + d*.88, x + w, y + d*.88, 'stroke="#9aa3a8" stroke-width="2.4"');
      s += `<text x="0" y="0" font-size="${Math.min(w, d)*.28}" text-anchor="middle" dominant-baseline="central" fill="#8d7f6c" font-weight="700">1:12</text>`;
      return s;
    }
    case 'gardenpath': {
      const hz = w >= d;
      let s = rc(x, y, w, d, c, 'rx="40"');
      s += rc(x + 80, y + 80, w - 160, d - 160, 'none', 'rx="30" stroke-dasharray="18 12" opacity=".5"');
      const n = Math.max(4, Math.round((hz ? w : d)/900));
      for (let i = 1; i < n; i++)
        s += hz ? ln(x + w*i/n, y + 80, x + w*i/n, y + d - 80, 'opacity=".35"')
                : ln(x + 80, y + d*i/n, x + w - 80, y + d*i/n, 'opacity=".35"');
      return s;
    }
    case 'steppingstones': {
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      let s = '';
      const n = 6;
      for (let i = 0; i < n; i++){
        const p = -L/2 + L*(i + .5)/n, off = (i%2 ? -1 : 1)*T*.14;
        s += hz
          ? rc(p - L/n*.3, off - T*.18, L/n*.55, T*.36, c, 'rx="30"')
          : rc(off - T*.18, p - L/n*.3, T*.36, L/n*.55, c, 'rx="30"');
      }
      return s;
    }
    case 'boardwalk': {
      const hz = w >= d;
      let s = rc(x, y, w, d, c, 'rx="10"');
      const n = Math.max(4, Math.round((hz ? w : d)/500));
      for (let i = 1; i < n; i++)
        s += hz ? ln(x + w*i/n, y + 60, x + w*i/n, y + d - 60, 'stroke="#8d6a44" opacity=".45"')
                : ln(x + 60, y + d*i/n, x + w - 60, y + d*i/n, 'stroke="#8d6a44" opacity=".45"');
      if (hz) s += ln(x, y + 80, x + w, y + 80, 'stroke="#9aa3a8" stroke-width="1.6"') + ln(x, y + d - 80, x + w, y + d - 80, 'stroke="#9aa3a8" stroke-width="1.6"');
      return s;
    }

    /* ---------- 沙盘 · 景观（新增基元） ---------- */
    case 'dryfountain': {
      const R = Math.min(w, d)/2;
      let s = `<circle r="${R*.95}" fill="${shade(c, .55)}" ${ST}/>`
        + `<circle r="${R*.78}" fill="${shade(c, .8)}" ${ST}/>`;
      for (let i = 0; i < 5; i++)
        s += `<circle r="${R*.78 - R*.14*i}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="14 10" ${ST}/>`;
      for (let i = 0; i < 12; i++){
        const a = i/12*Math.PI*2, rr = R*(i%2 ? .42 : .6);
        s += `<circle cx="${Math.cos(a)*rr}" cy="${Math.sin(a)*rr}" r="${R*.035}" fill="#ffffff" fill-opacity=".85" ${ST}/>`;
      }
      s += `<circle r="${R*.08}" fill="#eef4f6" ${ST}/>`;
      return s;
    }
    case 'stream': {
      /* 溪流：水体带 + 两侧石砌驳岸 + 水面波纹 + 水中置石 */
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      let s = rc(x, y, w, d, '#d9d2c6', 'rx="40"');
      s += hz ? rc(x, y + T*.18, w, T*.64, c, 'rx="30"') : rc(x + T*.18, y, T*.64, d, c, 'rx="30"');
      for (let i = 0; i < 6; i++){
        const p = -L/2 + L*(i + .5)/6;
        s += hz ? ln(p, y + T*.28, p + L*.06, y + T*.28, 'stroke="#ffffff" stroke-opacity=".45"')
                : ln(x + T*.28, p, x + T*.28, p + L*.06, 'stroke="#ffffff" stroke-opacity=".45"');
      }
      for (let i = 0; i < 5; i++){
        const p = -L/2 + L*(i + .5)/5;
        s += `<circle cx="${hz ? p : 0}" cy="${hz ? 0 : p}" r="${T*.09}" fill="#9aa3a8" ${ST}/>`;
      }
      return s;
    }
    case 'deck': {
      let s = rc(x, y, w, d, c, 'rx="8"');
      const n = Math.max(4, Math.round(w/600));
      for (let i = 1; i < n; i++) s += ln(x + w*i/n, y + 60, x + w*i/n, y + d - 60, 'stroke="#8d6a44" opacity=".4"');
      s += ln(x + 60, y + 60, x + w - 60, y + 60, 'stroke="#9aa3a8" stroke-width="2"')
        + ln(x + 60, y + d - 60, x + w - 60, y + d - 60, 'stroke="#9aa3a8" stroke-width="2"');
      for (let i = 0; i <= 4; i++) s += `<circle cx="${x + 60 + (w - 120)*i/4}" cy="${y + 60}" r="${m*.02}" fill="#8d8a84" ${ST}/>`;
      s += rc(-w*.18, y + d - 200, w*.36, 160, '#d9d2c6', 'rx="4"');
      return s;
    }
    case 'revetment': {
      const hz = w >= d;
      let s = rc(x, y, w, d, '#8d8a84', 'rx="6"');
      const n = Math.max(4, Math.round((hz ? w : d)/1200));
      for (let i = 0; i < n; i++){
        const p = -((hz ? w : d)/2) + (hz ? w : d)*(i + .5)/n;
        s += hz ? rc(p - (hz ? w : d)/n*.38, y + 60, (hz ? w : d)/n*.72, d*.42, '#9a9791', 'rx="6"')
                : rc(x + 60, p - (hz ? w : d)/n*.38, w*.42, (hz ? w : d)/n*.72, '#9a9791', 'rx="6"');
      }
      s += hz ? rc(x, y + d*.62, w, d*.32, '#6fb6c8', 'opacity=".55"') : rc(x + w*.62, y, w*.32, d, '#6fb6c8', 'opacity=".55"');
      return s;
    }
    case 'featurewall': {
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      let s = hz ? rc(x, y, w, d, c, 'rx="4"') : rc(x, y, w, d, c, 'rx="4"');
      const n = Math.max(3, Math.round(L/1200));
      for (let i = 1; i < n; i++)
        s += hz ? ln(x + L*i/n, y, x + L*i/n, y + T, 'opacity=".4"') : ln(x, y + L*i/n, x + T, y + L*i/n, 'opacity=".4"');
      for (let i = 0; i < 3; i++)
        s += hz ? `<circle cx="${x + L*(i + .5)/3}" cy="0" r="${T*.2}" fill="#fff3cf" ${ST}/>`
                : `<circle cx="0" cy="${y + L*(i + .5)/3}" r="${T*.2}" fill="#fff3cf" ${ST}/>`;
      return s;
    }
    case 'sculpture': {
      const R = Math.min(w, d)/2;
      let s = `<circle r="${R*.6}" fill="${shade(c, .85)}" ${ST}/>`
        + `<circle r="${R*.34}" fill="${c}" ${ST}/>`;
      for (let i = 0; i < 3; i++){
        const a = i*2.1;
        s += pa(`M0 0Q${Math.cos(a)*R*.9} ${Math.sin(a)*R*.9} ${Math.cos(a + .7)*R*.75} ${Math.sin(a + .7)*R*.75}`,
          'none', `stroke="${shade(c, 1.2)}" stroke-width="${R*.1}" stroke-linecap="round"`);
      }
      return s;
    }
    case 'fence': {
      const hz = w >= d, L = hz ? w : d;
      let s = hz ? ln(x, 0, x + w, 0, 'stroke="#9aa3a8" stroke-width="2.6"') : ln(0, y, 0, y + d, 'stroke="#9aa3a8" stroke-width="2.6"');
      const n = Math.max(3, Math.round(L/2000));
      for (let i = 0; i <= n; i++)
        s += hz ? `<circle cx="${x + L*i/n}" cy="0" r="${Math.max(40, L*.012)}" fill="#5d666d" ${ST}/>`
                : `<circle cx="0" cy="${y + L*i/n}" r="${Math.max(40, L*.012)}" fill="#5d666d" ${ST}/>`;
      return s;
    }
    case 'signage': {
      const hz = w >= d;
      let s = rc(x, y, w, d, '#3a3f44', 'rx="6"');
      for (let i = 0; i < 3; i++)
        s += hz ? rc(x + w*.08, y + d*(.2 + i*.24), w*.6, d*.1, '#f2f4f5', 'rx="3"')
                : rc(x + w*(.2 + i*.24), y + d*.08, w*.1, d*.6, '#f2f4f5', 'rx="3"');
      s += hz ? rc(x + w*.05, y + d*.05, w*.06, d*.9, '#8d8a84') : rc(x + w*.05, y + d*.05, w*.9, d*.06, '#8d8a84');
      return s;
    }
    case 'lawnlamp': {
      const R = Math.min(w, d)/2;
      return `<circle r="${R}" fill="#ffe9a8" fill-opacity=".5" ${ST}/>`
        + `<circle r="${R*.42}" fill="#fff6dd" ${ST}/>`
        + `<circle r="${R*.16}" fill="${c}" ${ST}/>`;
    }
    case 'gardenlamp': {
      const R = Math.min(w, d)/2;
      let s = `<circle r="${R}" fill="#ffe9a8" fill-opacity=".4" ${ST}/>`;
      for (let i = 0; i < 3; i++){
        const a = i/3*Math.PI*2;
        s += `<circle cx="${Math.cos(a)*R*.45}" cy="${Math.sin(a)*R*.45}" r="${R*.18}" fill="#fff6dd" ${ST}/>`;
      }
      return s + `<circle r="${R*.2}" fill="${c}" ${ST}/>`;
    }
    case 'flowerbed': {
      let s = rc(x, y, w, d, '#5d4a3a', 'rx="30"');
      s += rc(x + 100, y + 100, w - 200, d - 200, c, 'opacity=".35"', 'rx="24"');
      const cols = ['#d96b8a', '#e0a94a', '#8fbf7a', '#c98ad0', '#e8c14f'];
      const n = Math.max(6, Math.round(w*d/600000));
      for (let i = 0; i < n; i++){
        const a = i*2.4;
        s += `<circle cx="${Math.cos(a)*w*.3}" cy="${Math.sin(a)*d*.3}" r="${Math.min(w, d)*.07}" fill="${cols[i%5]}" ${ST}/>`;
      }
      return s;
    }
    case 'aquatic': {
      let s = rc(x, y, w, d, '#6fb6c8', 'fill-opacity=".45" rx="30"');
      for (let i = 0; i < 7; i++){
        const a = i*1.9;
        s += `<circle cx="${Math.cos(a)*w*.28}" cy="${Math.sin(a)*d*.28}" r="${Math.min(w, d)*.1}" fill="#7fa86a" fill-opacity=".85" ${ST}/>`;
        s += `<path d="M${Math.cos(a)*w*.28} ${Math.sin(a)*d*.28}l${Math.min(w, d)*.1} 0" stroke="#ffffff" stroke-opacity=".5"/>`;
      }
      for (let i = 0; i < 6; i++)
        s += ln(x + w*(.1 + .15*i), y + d*.85, x + w*(.1 + .15*i), y + d*.95, 'stroke="#4f8a4a" stroke-width="2"');
      return s;
    }
    case 'treegrid': {
      const R = Math.min(w, d)/8;
      let s = '';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        s += treeDot(-w*.3 + i*w*.3, -d*.3 + j*d*.3, R, c);
      return s;
    }
    case 'streetrow': {
      const hz = w >= d, L = hz ? w : d, R = Math.min(w, d)*.28;
      const n = Math.max(3, Math.round(L/3000));
      let s = '';
      for (let i = 0; i < n; i++){
        const p = -L/2 + L*(i + .5)/n;
        s += treeDot(hz ? p : 0, hz ? 0 : p, R, c);
      }
      return s;
    }
    case 'zelkova': return treePlan(w, d, c);
    case 'tallow': return treePlan(w, d, c);
    case 'palm': {
      const R = Math.min(w, d)/2;
      let s = `<circle r="${R*.3}" fill="${shade(c, .9)}" ${ST}/>`;
      for (let i = 0; i < 7; i++){
        const a = i/7*Math.PI*2;
        s += `<ellipse cx="${Math.cos(a)*R*.55}" cy="${Math.sin(a)*R*.55}" rx="${R*.34}" ry="${R*.12}"
          transform="rotate(${a*180/Math.PI} ${Math.cos(a)*R*.55} ${Math.sin(a)*R*.55})" fill="${i%2 ? c : shade(c, 1.12)}" ${ST}/>`;
      }
      return s + `<circle r="${R*.1}" fill="#6b5442" ${ST}/>`;
    }
    case 'bamboo': {
      const R = Math.min(w, d)/2;
      let s = `<circle r="${R*.9}" fill="${shade(c, .9)}" fill-opacity=".55" ${ST}/>`;
      for (let i = 0; i < 9; i++){
        const a = i*2.2, rr = R*(.2 + (i%3)*.22);
        s += ln(Math.cos(a)*rr, Math.sin(a)*rr, Math.cos(a)*rr, Math.sin(a)*rr, 'stroke="#4f7a3a" stroke-width="2.4"');
        s += `<circle cx="${Math.cos(a)*rr}" cy="${Math.sin(a)*rr}" r="${R*.16}" fill="${shade(c, 1.1)}" ${ST}/>`;
      }
      return s;
    }

    /* ---------- 沙盘 · 城市（用地红线） ---------- */
    case 'landparcel': {
      const fs = Math.min(w, d)*.035;
      let s = `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="${c}" fill-opacity=".05"
        stroke="${c}" stroke-width="2.4" stroke-dasharray="30 14" vector-effect="non-scaling-stroke"/>`;
      [[x, y], [x + w, y], [x + w, y + d], [x, y + d]].forEach(([px, py]) =>
        s += `<circle cx="${px}" cy="${py}" r="${Math.max(120, fs*.2)}" fill="${c}" ${ST}/>`);
      s += `<text x="0" y="${y + fs*1.4}" font-size="${fs}" text-anchor="middle" fill="${c}" font-weight="700" opacity=".8">用地红线</text>`;
      return s;
    }

    /* ---------- 沙盘 · 城市背景 ---------- */
    case 'slabblock': return bldgPlan(w, d, 18, c, { units: 6 });
    case 'citytower': return bldgPlan(w, d, 30, c, { units: 3 });
    case 'school': {
      let s = rc(x, y, w, d, '#e8e2d6', 'rx="30"');
      s += rc(x + w*.05, y + d*.1, w*.5, d*.22, c, 'rx="12"');
      s += rc(x + w*.05, y + d*.4, w*.5, d*.22, c, 'rx="12"');
      s += rc(x + w*.05, y + d*.7, w*.3, d*.22, c, 'rx="12"');
      s += rc(x + w*.6, y + d*.12, w*.34, d*.5, '#b4623f', 'rx="10"');
      s += `<rect x="${x + w*.64}" y="${y + d*.2}" width="${w*.26}" height="${d*.34}" fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
      s += rc(x + w*.72, y + d*.72, w*.18, d*.18, '#d9d2c6', 'rx="8"');
      return s;
    }
    case 'hospital': {
      let s = rc(x, y, w, d, '#e8e6e0', 'rx="30"');
      s += rc(x + w*.08, y + d*.1, w*.4, d*.55, c, 'rx="10"');
      s += rc(x + w*.54, y + d*.12, w*.36, d*.34, c, 'rx="10"');
      s += rc(x + w*.54, y + d*.54, w*.36, d*.32, '#d9d2c6', 'rx="10"');
      s += rc(-w*.03, -d*.03, w*.06, d*.06, '#c4553f') + rc(-w*.012, -d*.045, w*.024, d*.09, '#ffffff')
        + rc(-w*.045, -d*.012, w*.09, d*.024, '#ffffff');
      return s;
    }
    case 'retailblock': {
      let s = rc(x, y, w, d, '#d9d2c6', 'rx="24"');
      s += rc(x + w*.07, y + d*.07, w*.86, d*.62, c, 'rx="16"');
      s += rc(x + w*.22, y + d*.22, w*.56, d*.16, '#9fd6e4', 'rx="8"');
      for (let i = 0; i < 8; i++) s += ln(x + w*.1 + w*.1*i, y + d*.74, x + w*.1 + w*.1*i, y + d*.94, 'stroke="#ffffff" stroke-opacity=".6"');
      s += `<circle cx="${x + w*.78}" cy="${y + d*.78}" r="${Math.min(w, d)*.08}" fill="#2f6fa8" ${ST}/>`;
      return s;
    }
    case 'citygrid': {
      const rw = Math.min(w, d)*.07;
      let s = rc(x, y, w, d, c, 'rx="10"');
      for (let i = 1; i < 4; i++){
        s += rc(x + w*i/4 - rw/2, y, rw, d, '#4a4d51');
        s += rc(x, y + d*i/4 - rw/2, w, rw, '#4a4d51');
      }
      for (let i = 1; i < 4; i++){
        s += ln(x + w*i/4, y, x + w*i/4, y + d, 'stroke="#ffffff" stroke-opacity=".45" stroke-dasharray="20 16"');
        s += ln(x, y + d*i/4, x + w, y + d*i/4, 'stroke="#ffffff" stroke-opacity=".45" stroke-dasharray="20 16"');
      }
      return s;
    }
    case 'river': {
      let s = rc(x, y, w, d, '#d9d2c6', 'rx="20"');
      s += rc(x, y + d*.22, w, d*.56, c, 'rx="20"');
      for (let i = 0; i < 10; i++) s += ln(x + w*i/10, y + d*.3, x + w*(i + .5)/10, y + d*.7, 'stroke="#ffffff" stroke-opacity=".25"');
      for (let i = 0; i < 2; i++) s += rc(x + w*(.28 + .4*i), y + d*.16, w*.04, d*.68, '#cfc7b8');
      return s;
    }
    case 'lake': {
      const R = Math.min(w, d)/2;
      let s = `<path d="M${-w*.46} ${R*.1}Q${-w*.5} ${-R*.7} ${-w*.12} ${-R*.85}Q${w*.4} ${-R*.95} ${w*.46} ${-R*.2}Q${w*.5} ${R*.55} ${w*.1} ${R*.82}Q${-w*.35} ${R*.95} ${-w*.46} ${R*.1}Z" fill="#d9d2c6" ${ST}/>`;
      s += `<path d="M${-w*.42} ${R*.08}Q${-w*.45} ${-R*.62} ${-w*.1} ${-R*.75}Q${w*.35} ${-R*.85} ${w*.4} ${-R*.16}Q${w*.44} ${R*.48} ${w*.08} ${R*.72}Q${-w*.3} ${R*.82} ${-w*.42} ${R*.08}Z" fill="${c}" ${ST}/>`;
      s += `<circle cx="${-w*.15}" cy="${-d*.06}" r="${R*.16}" fill="#7fa86a" ${ST}/>`
        + `<circle cx="${w*.18}" cy="${d*.1}" r="${R*.08}" fill="#7fa86a" ${ST}/>`;
      return s;
    }
    case 'park': {
      let s = rc(x, y, w, d, c, 'rx="40"');
      s += pa(`M${x} ${d*.1}Q${x + w*.35} ${-d*.15} ${x + w*.55} ${d*.05}T${x + w} ${-d*.12}`,
        'none', 'stroke="#e8e2d6" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linecap="round"');
      s += `<circle cx="${w*.12}" cy="${d*.2}" r="${Math.min(w, d)*.12}" fill="#6fb6c8" ${ST}/>`;
      for (let i = 0; i < 8; i++){
        const a = i*2.1, rr = .26 + (i%3)*.08;
        s += treeDot(Math.cos(a)*w*rr, Math.sin(a)*d*rr, Math.min(w, d)*.07, '#4e7c46');
      }
      s += `<circle cx="${-w*.3}" cy="${-d*.28}" r="${Math.min(w, d)*.06}" fill="#8a5b3f" ${ST}/>`;
      return s;
    }
    case 'hill': {
      let s = `<path d="M${x} ${y + d*.7}Q${x + w*.2} ${y + d*.05} ${x + w*.5} ${y + d*.1}Q${x + w*.82} ${y + d*.15} ${x + w} ${y + d*.7}Z" fill="${c}" ${ST}/>`;
      s += `<path d="M${x + w*.14} ${y + d*.62}Q${x + w*.32} ${y + d*.24} ${x + w*.56} ${y + d*.26}Q${x + w*.76} ${y + d*.28} ${x + w*.88} ${y + d*.62}Z"
        fill="${shade(c, 1.12)}" fill-opacity=".9" ${ST}/>`;
      for (let i = 0; i < 7; i++) s += treeDot(x + w*(.2 + .1*i), y + d*(.62 - .04*(i%3)), Math.min(w, d)*.025, '#3f6b34');
      return s;
    }
    case 'metroline': {
      let s = rc(x, y, w, d, '#cfc7b8', 'rx="10"');
      s += rc(x, y + d*.38, w, d*.24, '#9aa3a8');
      s += ln(x, 0, x + w, 0, 'stroke="#ffffff" stroke-opacity=".6" stroke-dasharray="30 24"');
      s += rc(x + w*.42, y + d*.06, w*.16, d*.88, '#d9d2c6', 'rx="8"');
      s += `<circle cx="${x + w*.5}" cy="0" r="${Math.min(w, d)*.22}" fill="#2f6fa8" ${ST}/>`;
      s += `<text x="${x + w*.5}" y="0" font-size="${Math.min(w, d)*.3}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-weight="700">M</text>`;
      return s;
    }
    case 'powerline': {
      const y0 = -d*.1, y1 = d*.1;
      let s = `<rect x="${x}" y="${y - d*.5}" width="${w}" height="${d}" fill="none" stroke="#c4553f" stroke-opacity=".5" stroke-width="1.4" stroke-dasharray="24 16" vector-effect="non-scaling-stroke"/>`;
      for (let i = 0; i < 5; i++){
        const px = x + w*(.08 + .21*i);
        s += `<circle cx="${px}" cy="0" r="${Math.min(w, d)*.16}" fill="#8d949c" ${ST}/>`
          + ln(px - Math.min(w, d)*.16, 0, px + Math.min(w, d)*.16, 0, 'stroke="#5d666d" stroke-width="2"');
      }
      s += ln(x + w*.08, y0, x + w*.92, y1, 'stroke="#5d666d" stroke-width="1.4"')
        + ln(x + w*.08, y1, x + w*.92, y0, 'stroke="#5d666d" stroke-width="1.4"');
      return s;
    }
    case 'substation': {
      let s = rc(x, y, w, d, '#d9d2c6', 'rx="10"');
      s += `<rect x="${x + 120}" y="${y + 120}" width="${w - 240}" height="${d - 240}" fill="none" stroke="#8d8a84" stroke-width="1.6" stroke-dasharray="16 10" vector-effect="non-scaling-stroke"/>`;
      s += rc(x + w*.08, y + d*.2, w*.36, d*.4, c, 'rx="6"');
      [[.56, .2], [.56, .56]].forEach(([fx, fy]) => s += rc(x + w*fx, y + d*fy, w*.3, d*.2, '#8d949c', 'rx="4"'));
      s += ln(x + w*.08, y + d*.8, x + w*.9, y + d*.8, 'stroke="#c4553f" stroke-width="2"');
      return s;
    }

    /* ---------- 沙盘 · 营销展示 ---------- */
    case 'salescenter': {
      let s = rc(x, y, w, d, '#e8e2d6', 'rx="20"');
      s += rc(x + w*.06, y + d*.1, w*.52, d*.4, '#9fd6e4', 'rx="10"');
      s += rc(x + w*.62, y + d*.08, w*.3, d*.58, c, 'rx="10"');
      s += rc(x + w*.06, y + d*.62, w*.86, d*.26, '#6fb6c8', 'rx="12"');
      s += rc(x + w*.08, y + d*.9, w*.84, d*.07, '#cfc7b8', 'rx="4"');
      s += `<circle cx="${x + w*.78}" cy="${y + d*.34}" r="${Math.min(w, d)*.05}" fill="#2f6fa8" ${ST}/>`;
      return s;
    }
    case 'modelhouse': {
      let s = rc(x, y, w, d, '#e8e2d6', 'rx="20"');
      s += rc(x + w*.16, y + d*.16, w*.44, d*.44, c, 'rx="10"');
      s += `<circle cx="${w*.08}" cy="${d*.18}" r="${Math.min(w, d)*.1}" fill="#7fa86a" ${ST}/>`;
      s += pa(`M${-w*.1} ${d*.42}Q0 ${d*.1} ${w*.3} ${d*.34}`, 'none', 'stroke="#e8e2d6" stroke-width="3" vector-effect="non-scaling-stroke"');
      s += rc(-w*.1, d*.36, w*.5, d*.06, '#cfc7b8', 'rx="4"');
      return s;
    }
    case 'viewpath': {
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      let s = hz ? rc(x, y, w, d, '#d9d2c6', 'rx="8"') : rc(x, y, w, d, '#d9d2c6', 'rx="8"');
      const n = Math.max(3, Math.round(L/2500));
      for (let i = 0; i <= n; i++){
        const p = -L/2 + L*i/n;
        s += hz ? `<circle cx="${p}" cy="${-T*.4}" r="${T*.16}" fill="#8d8a84" ${ST}/>`
                : `<circle cx="${-T*.4}" cy="${p}" r="${T*.16}" fill="#8d8a84" ${ST}/>`;
      }
      s += hz ? `<line x1="${x}" y1="${y + T*.1}" x2="${x + w}" y2="${y + T*.1}" stroke="#b98a5a" stroke-width="2.4" stroke-dasharray="18 10" vector-effect="non-scaling-stroke"/>`
              : `<line x1="${x + T*.1}" y1="${y}" x2="${x + T*.1}" y2="${y + d}" stroke="#b98a5a" stroke-width="2.4" stroke-dasharray="18 10" vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'hoarding': {
      const hz = w >= d, L = hz ? w : d;
      let s = hz ? rc(x, y, w, d, c, 'rx="3"') : rc(x, y, w, d, c, 'rx="3"');
      const n = Math.max(3, Math.round(L/3000));
      for (let i = 0; i < n; i++){
        const p = -L/2 + L*(i + .5)/n;
        s += hz ? rc(p - L/n*.34, y + d*.1, L/n*.62, d*.8, i%2 ? '#c4553f' : '#2f6fa8', 'rx="3"')
                : rc(x + w*.1, p - L/n*.34, w*.8, L/n*.62, i%2 ? '#c4553f' : '#2f6fa8', 'rx="3"');
      }
      return s;
    }
    case 'banner': {
      const R = Math.min(w, d)/2;
      return `<circle r="${R*.2}" fill="${c}" ${ST}/>`
        + ln(0, 0, 0, -R*.6, 'stroke="#8d8a84" stroke-width="2"')
        + pa(`M0 ${-R*.6}L${R*.8} ${-R*.4}L0 ${-R*.2}Z`, c);
    }
    case 'lightbox': {
      const hz = w >= d;
      let s = rc(x, y, w, d, '#2f3338', 'rx="6"');
      s += hz ? rc(x + 60, y + d*.15, w - 120, d*.7, '#eaf6ff', 'rx="4"')
              : rc(x + w*.15, y + 60, w*.7, d - 120, '#eaf6ff', 'rx="4"');
      s += hz ? rc(x + w*.45, y + d*.3, w*.1, d*.4, c) : rc(x + w*.3, y + d*.45, w*.4, d*.1, c);
      return s;
    }

    /* ---------- 沙盘 · 运动补充 ---------- */
    case 'halfcourt': {
      const L = Math.min(w*.86, 15000), Wd = Math.min(d*.8, L*.58), k = L/15;
      let s = rc(x, y, w, d, '#b4623f', 'rx="120"');
      s += `<rect x="${-L/2}" y="${-Wd/2}" width="${L}" height="${Wd}" ${WLST}/>`;
      s += `<path d="M${-L/2} ${-1.8*k}A${1.8*k} ${1.8*k} 0 0 1 ${-L/2} ${1.8*k}" ${WLST}/>`;
      s += `<circle cx="${L/2 - 1.575*k}" cy="0" r="${.24*k}" fill="none" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      s += rc(L/2 - 1.2*k, -1.8*k, .12*k, 3.6*k, '#ffffff', 'opacity=".85"');
      return s;
    }
    case 'gateball': {
      const L = Math.min(w*.9, 20000), Wd = Math.min(d*.75, 15000);
      let s = rc(x, y, w, d, '#3f7c52', 'rx="120"');
      s += `<rect x="${-L/2}" y="${-Wd/2}" width="${L}" height="${Wd}" ${WLST}/>`;
      [[-L/2 + 500, 0], [L/2 - 500, -Wd*.3], [L/2 - 500, Wd*.3]].forEach(([px, py]) => {
        s += `<rect x="${px - 250}" y="${py - 600}" width="500" height="1200" fill="none" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      });
      s += `<line x1="0" y1="${-Wd/2}" x2="0" y2="${Wd/2}" stroke="#ffffff" stroke-opacity=".6" stroke-dasharray="16 12" vector-effect="non-scaling-stroke"/>`;
      return s;
    }
    case 'skatepark': {
      let s = rc(x, y, w, d, '#9aa3a8', 'rx="30"');
      s += `<circle cx="${-w*.2}" cy="${-d*.08}" r="${Math.min(w, d)*.22}" fill="none" stroke="#f2f4f5" stroke-width="2" ${ST}/>`;
      s += `<ellipse cx="${w*.2}" cy="${d*.1}" rx="${Math.min(w, d)*.26}" ry="${Math.min(w, d)*.16}" fill="none" stroke="#f2f4f5" stroke-width="2" ${ST}/>`;
      for (let i = 0; i < 3; i++) s += ln(x + w*(.12 + .2*i), y + d*.78, x + w*(.2 + .2*i), y + d*.62, 'stroke="#e8b04a" stroke-width="3"');
      return s;
    }
    case 'loopwalk': {
      let s = `<ellipse cx="0" cy="0" rx="${w*.46}" ry="${d*.42}" fill="${c}" ${ST}/>`;
      s += `<ellipse cx="0" cy="0" rx="${w*.34}" ry="${d*.28}" fill="#7fa86a" ${ST}/>`;
      for (let i = 1; i < 3; i++) s += `<ellipse cx="0" cy="0" rx="${w*(.46 - .04*i)}" ry="${d*(.42 - .047*i)}" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="1.2" ${ST}/>`;
      return s;
    }
    case 'petpark': {
      let s = rc(x, y, w, d, c, 'rx="40"');
      s += `<rect x="${x + 150}" y="${y + 150}" width="${w - 300}" height="${d - 300}" fill="none" stroke="#8d8a84" stroke-width="2" stroke-dasharray="18 12" vector-effect="non-scaling-stroke"/>`;
      for (let i = 0; i < 3; i++) s += `<circle cx="${x + w*(.24 + .24*i)}" cy="${y + d*.3}" r="${Math.min(w, d)*.1}" fill="none" stroke="#b98a5a" stroke-width="2.4" ${ST}/>`;
      s += `<circle cx="${x + w*.7}" cy="${y + d*.68}" r="${Math.min(w, d)*.08}" fill="#6fb6c8" ${ST}/>`;
      s += ln(x + w*.2, y + d*.72, x + w*.38, y + d*.72, 'stroke="#b98a5a" stroke-width="4"');
      return s;
    }
    case 'seniorarea': {
      let s = rc(x, y, w, d, c, 'rx="30"');
      s += rc(x + 200, y + 200, w*.44, d*.36, '#c9c6c0', 'rx="20"');
      for (let i = 0; i < 4; i++) s += `<circle cx="${x + w*(.58 + .1*(i%2))}" cy="${y + d*(.3 + .26*Math.floor(i/2))}" r="${Math.min(w, d)*.06}" fill="#5d666d" ${ST}/>`;
      s += ln(x + w*.12, y + d*.78, x + w*.5, y + d*.78, 'stroke="#b98a5a" stroke-width="5"');
      return s;
    }

    /* ---------- 沙盘 · 地下补充 ---------- */
    case 'civildefense': {
      const t = Math.max(300, Math.min(w, d)*.05);
      let s = rc(x, y, w, d, '#c9c6c0', 'rx="6"');
      s += `<rect x="${x + t}" y="${y + t}" width="${w - 2*t}" height="${d - 2*t}" fill="none" stroke="#6f6b64" stroke-width="1.6" stroke-dasharray="14 10" vector-effect="non-scaling-stroke"/>`;
      for (let i = 1; i < 6; i++) s += ln(x + t, y + t + (d - 2*t)*i/6, x + w - t, y + t + (d - 2*t)*i/6, 'opacity=".35"');
      s += rc(x + w*.42, y + d - t*1.6, w*.16, t*1.4, '#8d8a84', 'rx="4"');
      s += `<text x="0" y="0" font-size="${Math.min(w, d)*.16}" text-anchor="middle" dominant-baseline="central" fill="#6f6b64" font-weight="700">人防</text>`;
      return s;
    }
    case 'storageroom': {
      const t = Math.max(150, Math.min(w, d)*.06);
      let s = rc(x, y, w, d, c, 'rx="4"');
      s += `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="none" stroke="#6f6b64" stroke-width="4" vector-effect="non-scaling-stroke"/>`;
      for (let i = 1; i < 4; i++) s += ln(x + t, y + d*i/4, x + w - t, y + d*i/4, 'opacity=".45"');
      s += rc(x + w*.72, y + d*.72, w*.24, d*.24, '#b5653a', 'rx="2"');
      return s;
    }
    case 'equipmentroom': {
      const t = Math.max(180, Math.min(w, d)*.05);
      let s = rc(x, y, w, d, c, 'rx="6"');
      s += `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="none" stroke="#6f6b64" stroke-width="5" vector-effect="non-scaling-stroke"/>`;
      [[-1, -1], [1, 1]].forEach(([a, b]) => {
        s += `<circle cx="${a*w*.24}" cy="${b*d*.2}" r="${Math.min(w, d)*.13}" fill="#8d949c" ${ST}/>`
          + `<circle cx="${a*w*.24}" cy="${b*d*.2}" r="${Math.min(w, d)*.05}" fill="#5d666d" ${ST}/>`;
      });
      s += rc(x + w*.34, y + d - t*1.5, w*.3, t*.9, '#8d8a84');
      return s;
    }

    /* ---------- 沙盘 · 施工 ---------- */
    case 'crane': {
      const R = Math.min(w, d)/2;
      return rc(-R*.2, -R*.2, R*.4, R*.4, c, 'rx="3"')
        + ln(0, 0, R*.9, -R*.7, 'stroke="#e8b04a" stroke-width="6"')
        + rc(-R*.8, -R*.2, R*.6, R*.4, '#5d666d', 'rx="3"')
        + ln(R*.9, -R*.7, R*.9, -R*.1, 'stroke="#3a3f44" stroke-width="1.6"')
        + `<circle cx="${R*.9}" cy="${-R*.05}" r="${R*.08}" fill="#c4553f" ${ST}/>`;
    }
    case 'foundationpit': {
      const m2 = Math.min(w, d)*.12;
      let s = rc(x, y, w, d, '#8d8a84', 'rx="10"');
      s += rc(x + m2, y + m2, w - 2*m2, d - 2*m2, '#6f6b64', 'rx="6"');
      for (let i = 0; i < 8; i++){
        s += ln(x + w*i/8, y, x + m2 + (w - 2*m2)*i/8, y + m2, 'stroke="#e8b04a" stroke-opacity=".8" stroke-width="2"');
        s += ln(x + w*i/8, y + d, x + m2 + (w - 2*m2)*i/8, y + d - m2, 'stroke="#e8b04a" stroke-opacity=".8" stroke-width="2"');
      }
      for (let i = 1; i < 4; i++) s += ln(x + m2, y + d*i/4, x + w - m2, y + d*i/4, 'stroke="#9aa3a8" stroke-width="2"');
      return s;
    }
    case 'constructionroad': {
      let s = rc(x, y, w, d, c, 'rx="10"');
      s += ln(x, y + d*.3, x + w, y + d*.3, 'stroke="#8d8a84" stroke-width="2" stroke-dasharray="18 14"')
        + ln(x, y + d*.7, x + w, y + d*.7, 'stroke="#8d8a84" stroke-width="2" stroke-dasharray="18 14"');
      for (let i = 0; i < 5; i++) s += `<ellipse cx="${x + w*(.1 + .2*i)}" cy="${y + d*.5}" rx="${w*.04}" ry="${d*.18}" fill="#9a948a" fill-opacity=".4" ${ST}/>`;
      return s;
    }
    case 'materialyard': {
      let s = rc(x, y, w, d, c, 'rx="10"');
      s += `<rect x="${x + 120}" y="${y + 120}" width="${w - 240}" height="${d - 240}" fill="none" stroke="#8d8a84" stroke-width="1.6" stroke-dasharray="16 10" vector-effect="non-scaling-stroke"/>`;
      for (let i = 0; i < 5; i++) s += `<circle cx="${x + w*(.16 + .08*i)}" cy="${y + d*.24}" r="${Math.min(w, d)*.055}" fill="#8d949c" ${ST}/>`;
      for (let i = 0; i < 4; i++) s += rc(x + w*.55, y + d*(.18 + .16*i), w*.3, d*.1, i%2 ? '#b98a5a' : '#9aa3a8', 'rx="3"');
      return s;
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
    case 'kiosk': {
      // 中岛摊位：柜台体 + 顶棚（虚线）+ 陈列品
      let s = rc(x, y, w, d, c, 'rx="16"');
      s += rc(x + 80, y + 80, w - 160, d - 160, '#f7f3ea', 'rx="10"');
      s += `<rect x="${x + 60}" y="${y + 60}" width="${w - 120}" height="${d - 120}" fill="none" ${ST} ${DASH} opacity=".6"/>`;
      const n = Math.max(2, Math.round(w/800));
      for (let i = 0; i < n; i++)
        s += `<circle cx="${x + w*(i + .5)/n}" cy="${y + d*.5}" r="${m*.07}" fill="#d8cfc2" ${ST}/>`;
      return s;
    }

    /* ---------- 商业 · 餐饮 ---------- */
    case 'hotpot': {
      // 火锅桌：方桌 + 中央铜锅（红汤 / 锅体）+ 四角小料碗
      const R = m*.3;
      let s = rc(x, y, w, d, c, 'rx="40"');
      s += `<circle r="${R}" fill="${shade(c, .72)}" ${ST}/><circle r="${R*.82}" fill="#c2452c" ${ST}/>`
        + `<circle r="${R*.32}" fill="#8a5a3c" ${ST}/>`;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
        s += `<circle cx="${a*(w/2 - m*.15)}" cy="${b*(d/2 - m*.15)}" r="${R*.24}" fill="#fff" ${ST}/>`;
      });
      return s;
    }
    case 'chinesetable': {
      // 中餐圆桌：桌面 + 中心转盘 + 一圈座位
      const R = Math.min(w, d)/2;
      let s = ec(0, 0, R, R, c) + ec(0, 0, R*.84, R*.84, 'none', 'opacity=".4"');
      s += `<circle r="${R*.34}" fill="${shade(c, 1.1)}" ${ST}/>`;
      for (let k = 0; k < 10; k++){
        const a = k/10*Math.PI*2;
        s += `<circle cx="${Math.cos(a)*R*.93}" cy="${Math.sin(a)*R*.93}" r="${R*.11}" fill="#cfc6b8" ${ST}/>`;
      }
      return s;
    }
    case 'diningbooth': {
      // 卡座：两侧靠背 + 中间桌面 + 座垫
      const bh = d*.24;
      let s = rc(x, y, w, d, '#f4efe6', 'rx="10"');
      s += rc(x, y, w, bh, c) + rc(x, y + d - bh, w, bh, c);
      s += rc(x + w*.1, y + bh, w*.8, d - 2*bh, '#fffaf2', 'rx="20"');
      s += rc(x + w*.1, y + bh + (d - 2*bh)*.34, w*.8, (d - 2*bh)*.32, shade(c, 1.15), 'rx="10"');
      return s;
    }
    case 'barcounter': {
      // 吧台：台体 + 台面前沿虚线 + 外侧吧椅
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      let s = rc(x, y, w, d, c, 'rx="8"');
      s += hz ? ln(x + 40, y + d*.7, x + w - 40, y + d*.7, DASH) : ln(x + w*.7, y + 40, x + w*.7, y + d - 40, DASH);
      const n = Math.max(2, Math.round(L/900)), sr = Math.min(T*.2, 110);
      for (let i = 0; i < n; i++){
        const t = -L/2 + L*(i + .5)/n;
        s += hz ? `<circle cx="${t}" cy="${d/2 + sr*.6}" r="${sr}" fill="#6b5d4c" ${ST}/>`
                : `<circle cx="${w/2 + sr*.6}" cy="${t}" r="${sr}" fill="#6b5d4c" ${ST}/>`;
      }
      return s;
    }
    case 'teabar': {
      // 奶茶操作台：台体 + 封口机 / 制冰机 / 果糖机 + 顾客侧取餐台
      let s = rc(x, y, w, d, c, 'rx="10"');
      [[.2, '#cfd8dd'], [.5, '#9fb3bd'], [.8, '#d8cfc2']].forEach(([k, cc]) => {
        s += rc(x + w*(k - .09), y + d*.12, w*.18, d*.44, cc, 'rx="8"');
      });
      s += ln(x + 40, y + d*.82, x + w - 40, y + d*.82, DASH);
      return s;
    }
    case 'kitchenline': {
      // 商用操作台：不锈钢台面 + 灶眼 / 水池分格 + 排烟罩投影
      const n = Math.max(2, Math.round(w/900));
      let s = rc(x, y, w, d, c, 'rx="8"');
      for (let i = 1; i < n; i++) s += ln(x + w*i/n, y + 40, x + w*i/n, y + d - 40, 'opacity=".45"');
      s += ec(x + w*.22, 0, Math.min(d*.2, w*.1), Math.min(d*.2, w*.1), '#7d8a90')
        + ec(x + w*.56, 0, Math.min(d*.2, w*.1), Math.min(d*.2, w*.1), '#7d8a90');
      return s + rc(x, y, w, d, 'none', 'stroke-dasharray="10 6" opacity=".5"');
    }

    /* ---------- 商业 · 零售 ---------- */
    case 'clothesrack': {
      // 服装陈列架：挂衣杆 + 两侧衣架 + 衣服块
      const hz = w >= d, L = hz ? w : d, T = Math.min(w, d);
      const gx0 = hz ? x + 40 : x + T/2, gy0 = hz ? y + T/2 : y + 40;
      const gx1 = hz ? x + w - 40 : x + T/2, gy1 = hz ? y + T/2 : y + d - 40;
      let s = ln(gx0, gy0, gx1, gy1, 'stroke-width="2"');
      const n = Math.max(4, Math.round(L/240));
      for (let i = 0; i < n; i++){
        const t = (i + .5)/n;
        const px = gx0 + (gx1 - gx0)*t, py = gy0 + (gy1 - gy0)*t;
        s += hz ? rc(px - L/n*.28, py - T*.42, L/n*.56, T*.84, i % 2 ? shade(c, .82) : '#8d94a3', 'rx="6"')
                : rc(px - T*.42, py - L/n*.28, T*.84, L/n*.56, i % 2 ? shade(c, .82) : '#8d94a3', 'rx="6"');
      }
      return s + rc(x, y, w, d, 'none', DASH);
    }
    case 'mannequin': {
      const r = m/2;
      return `<circle r="${r*.9}" fill="${shade(c, .9)}" fill-opacity=".5" ${ST}/>`
        + `<circle r="${r*.24}" fill="${c}" ${ST}/>`
        + `<ellipse rx="${r*.44}" ry="${r*.3}" fill="${shade(c, .96)}" ${ST} transform="rotate(-18)"/>`;
    }
    case 'fittingroom': {
      // 试衣间：三面围合 + 拉帘线 + 挂钩
      let s = rc(x, y, w, d, c);
      s += rc(x + 50, y + 50, w - 100, d - 100, '#fffaf2', 'rx="8"');
      s += ln(x + w*.5, y + d - 50, x + w*.5, y + d*.24, DASH);
      return s + `<circle cx="${x + w*.5}" cy="${y + d - 30}" r="${m*.05}" fill="#8a8378" ${ST}/>`;
    }
    case 'displaycounter': {
      // 展示柜：柜体 + 玻璃罩 + 展品位
      let s = rc(x, y, w, d, c, 'rx="6"');
      s += rc(x + 35, y + 35, w - 70, d - 70, '#eef6fa', 'rx="4"');
      const n = Math.max(2, Math.round(w/450));
      for (let i = 0; i < n; i++)
        s += rc(x + w*(i + .5)/n - w*.07, y + d*.24, w*.14, d*.52, '#cfd8dd', 'rx="4"');
      return s;
    }
    case 'phonestand': {
      // 手机展台：深色台体 + 两排样机托架
      let s = rc(x, y, w, d, c, 'rx="20"');
      const cols = Math.max(3, Math.round(w/500)), rows = 2;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++){
        const px = -w/2 + w*(i + .5)/cols, py = -d/2 + d*(j + .5)/rows;
        s += rc(px - w*.07, py - d*.2, w*.14, d*.4, '#e8eef2', 'rx="6"');
        s += `<circle cx="${px}" cy="${py}" r="${m*.04}" fill="#8d94a3" ${ST}/>`;
      }
      return s;
    }
    case 'carstand': {
      // 汽车展台：台面 + 内圈虚线 + 边缘射灯
      let s = rc(x, y, w, d, c, 'rx="30"');
      s += rc(x + 140, y + 140, w - 280, d - 280, 'none', 'rx="20" stroke-dasharray="14 10" opacity=".7"');
      for (let k = 0; k < 4; k++)
        s += `<circle cx="${x + w*(.2 + k*.2)}" cy="${y + d*.5}" r="${m*.022}" fill="#ffe9a8" ${ST}/>`;
      return s;
    }
    case 'gondola': {
      // 超市中岛货架：中间隔板 + 两侧货位
      let s = rc(x, y, w, d, c);
      s += ln(x, y + d*.5, x + w, y + d*.5, 'stroke-width="1.6"');
      const n = Math.max(3, Math.round(w/320));
      for (let i = 1; i < n; i++) s += ln(x + w*i/n, y + 30, x + w*i/n, y + d - 30, 'opacity=".35"');
      return s + rc(x, y, w, d, 'none');
    }
    case 'freezer': {
      // 冷藏柜：柜体 + 玻璃门分格 + 前侧取货口
      const n = Math.max(2, Math.round(w/600));
      let s = rc(x, y, w, d, c, 'rx="10"');
      for (let i = 0; i < n; i++)
        s += rc(x + w*(i + .5)/n - w*.4/n, y + d*.14, w*.8/n, d*.7, '#eaf5f9', 'rx="6"');
      return s + ln(x + 30, y + d*.9, x + w - 30, y + d*.9, DASH);
    }
    case 'produce': {
      // 果蔬陈列台：台体 + 若干倾斜料槽 + 果蔬
      const cols = Math.max(2, Math.round(w/600));
      let s = rc(x, y, w, d, c, 'rx="14"');
      for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++){
        const px = -w/2 + w*(i + .5)/cols, py = -d/2 + d*(j + .5)/2;
        s += rc(px - w*.4/cols, py - d*.34, w*.8/cols, d*.68, '#f6f2e8', 'rx="8"');
        for (let k = 0; k < 4; k++){
          const a = k*1.57 + i + j*2;
          s += `<circle cx="${px + Math.cos(a)*w*.12/cols}" cy="${py + Math.sin(a)*d*.12}" r="${m*.035}" fill="${['#d0523f', '#e0a23a', '#7aa94f', '#c4577d'][k]}" ${ST}/>`;
        }
      }
      return s;
    }
    case 'cart': {
      // 购物车：梯形车篮 + 推杆 + 四轮
      const hw = w/2, hd = d/2;
      let s = pa(`M${-hw} ${-hd*.6}L${hw} ${-hd*.6}L${hw*.84} ${hd*.7}L${-hw*.84} ${hd*.7}Z`, shade(c, 1.12));
      s += ln(-hw*.84, hd*.7, hw*.84, hd*.7, 'stroke-width="2"');
      s += rc(-hw*.72, -hd*.94, hw*1.44, hd*.22, shade(c, .8), 'rx="6"');
      return s;
    }

    default: return rc(x, y, w, d, c);
  }
}
