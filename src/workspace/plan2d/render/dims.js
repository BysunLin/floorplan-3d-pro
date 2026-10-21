/* 2D 尺寸标注：默认户型手绘尺寸链 / 其他户型按几何推导 */
/* ---------- 尺寸链绘制 ---------- */
export const DIM_C = '#7d7160';
/* 尺寸链经常压在户外区域上（草坪浅绿、柏油深灰、绿篱深绿），单色细线 + 文字很容易糊掉。
 * 这里给线和字都加一层「白色底衬 / 描边」：
 *   · 线：先铺一遍 6px 白线，再叠 1.3px 本色线（所有白线先画，避免白线压住别的尺寸线）；
 *   · 文字：白描边 + paint-order="stroke"（描边在填充下面）→ 形成一圈白边，
 *     深色底和浅色底上都能看清。 */
const DIM_CASE = '#ffffff';
const DIM_VE = 'vector-effect="non-scaling-stroke"';     // 线宽按屏幕像素，缩放时不变粗
const dimLine = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${DIM_VE}/>`;
const dimWrap = inner =>
  `<g fill="none" stroke="${DIM_CASE}" stroke-width="6" stroke-opacity=".9" stroke-linecap="round">${inner}</g>`
  + `<g fill="none" stroke="${DIM_C}" stroke-width="1.3" stroke-linecap="round">${inner}</g>`;
/* 多条尺寸链：白衬线统一在前、本色线居中、文字最后 → 交叉处不会互相切断 */
const dimWrapAll = parts =>
  dimWrap(parts.map(p => p[0]).join('')) + parts.map(p => p[1]).join('');

export const dimTxt = (x, y, v, r) => {
  const fs = v < 400 ? 140 : 200;
  const rot = r ? ` transform="rotate(-90 ${x} ${y})"` : '';
  return `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="middle" fill="${DIM_C}"`
    + ` stroke="${DIM_CASE}" stroke-width="${Math.round(fs*.3)}" stroke-linejoin="round"`
    + ` stroke-opacity=".92" paint-order="stroke"${rot}>${v}</text>`;
};

/* 单条尺寸链 → [线条几何, 文字] */
function chainParts(horiz, at, start, segs){
  const pts = [start];
  segs.forEach(v => pts.push(pts[pts.length - 1] + v));
  let geo = '';
  const L = (x1, y1, x2, y2) => { geo += dimLine(x1, y1, x2, y2); };
  // 尺寸线
  if (horiz) L(pts[0], at, pts[pts.length - 1], at);
  else L(at, pts[0], at, pts[pts.length - 1]);
  // 分段界线 + 斜端头
  pts.forEach(p => {
    if (horiz){
      L(p, at - 170, p, at + 170);
      L(p - 80, at + 80, p + 80, at - 80);
    } else {
      L(at - 170, p, at + 170, p);
      L(at - 80, p + 80, at + 80, p - 80);
    }
  });
  // 文字（带白边）
  let txt = '';
  segs.forEach((v, i) => {
    const mid = (pts[i] + pts[i + 1])/2;
    txt += horiz ? dimTxt(mid, at - 70, v) : dimTxt(at - 70, mid, v, true);
  });
  return [geo, txt];
}

export function dimChain(horiz, at, start, segs){
  const [geo, txt] = chainParts(horiz, at, start, segs);
  return dimWrap(geo) + txt;
}

/* 默认户型的手绘静态尺寸链（贴合原图分段） */
export const staticDimsSvg = dimWrapAll([
  chainParts(true, -750, 0, [1580, 240, 2760, 240, 1540, 240, 3670]), chainParts(true, -1250, 0, [10270]),
  chainParts(true, 11350, 0, [2180, 240, 2160, 240, 5450, 240, 1340]), chainParts(true, 11850, 0, [11850]),
  chainParts(false, -800, 0, [3370, 1580, 240, 2770, 240, 2360]), chainParts(false, -1300, 0, [10560]),
  chainParts(false, 12750, 0, [3370, 240, 2760, 240, 3950]), chainParts(false, 13250, 0, [10560])
]);

/* 依据当前几何自动推导尺寸链：
 * 以房间内轮廓为基准，竖直墙的 x（水平墙的 y）作为分段点，画在四周；
 * 分段多于一段时，再在外侧补一条总尺寸。 */
export function autoDimsSvg(ROOMS, WALLS, DOORS, gone){
  const polys = ROOMS.filter(r => r.counted !== false).map(r => r.poly);
  if (!polys.length) return '';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const [px, py] of poly){
    x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
  }
  if (!(x1 > x0) || !(y1 > y0)) return '';

  const EPS = 1;
  const xs = new Set([x0, x1]), ys = new Set([y0, y1]);
  for (const w of WALLS){
    const vertical = Math.abs(w[3] - w[1]) >= Math.abs(w[2] - w[0]);
    const lo = vertical ? x0 : y0, hi = vertical ? x1 : y1, set = vertical ? xs : ys;
    for (const e of vertical ? [w[0], w[2]] : [w[1], w[3]])
      if (e > lo + EPS && e < hi - EPS) set.add(e);
  }
  const segments = set => {
    const pts = [...set].sort((a, b) => a - b), segs = [];
    for (let i = 1; i < pts.length; i++){ const d = pts[i] - pts[i - 1]; if (d > EPS) segs.push(Math.round(d)); }
    return segs;
  };
  const xsSeg = segments(xs), ysSeg = segments(ys);

  // 入户门箭头 + 「入户」文案等外凸标注的包围盒：尺寸链要让开它们
  let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity;
  DOORS.forEach((d, i) => {
    if (!d.entry || gone('nd', i)) return;
    const [rx0, ry0, rx1, ry1] = d.rect;
    const mx = (rx0 + rx1)/2, my = (ry0 + ry1)/2;
    const GAP = 230, LEN = 1000;
    let bx0, by0, bx1, by1;
    if ((ry1 - ry0) > (rx1 - rx0)){                       // 门洞沿 y → 箭头水平
      const dir = Math.sign(-d.o[0]) || -1;
      const apex = (dir > 0 ? rx1 : rx0) + dir*GAP, tail = apex + dir*LEN;
      bx0 = Math.min(tail, apex) - 150; bx1 = Math.max(tail, apex) + 150;
      by0 = my - 350; by1 = my + 250;                     // 「入户」文案在 my-155
    } else {                                              // 门洞沿 x → 箭头竖直
      const dir = Math.sign(-d.o[1]) || -1;
      const apex = (dir > 0 ? ry1 : ry0) + dir*GAP, tail = apex + dir*LEN;
      bx0 = mx - 250; bx1 = mx + 700;                     // 「入户」文案自 mx+220 起
      by0 = Math.min(tail, apex) - 150; by1 = Math.max(tail, apex) + 150;
    }
    ax0 = Math.min(ax0, bx0); ax1 = Math.max(ax1, bx1);
    ay0 = Math.min(ay0, by0); ay1 = Math.max(ay1, by1);
  });
  const hasAnn = ax1 > -Infinity;
  const ANNOT_GAP = 120;                                  // 尺寸链与上述标注至少留出的间距
  const base = Math.max(600, Math.round(Math.min(x1 - x0, y1 - y0)*.08));
  const offT = hasAnn ? Math.max(base, Math.round(y0 - ay0 + ANNOT_GAP)) : base;
  const offB = hasAnn ? Math.max(base, Math.round(ay1 - y1 + ANNOT_GAP)) : base;
  const offL = hasAnn ? Math.max(base, Math.round(x0 - ax0 + ANNOT_GAP)) : base;
  const offR = hasAnn ? Math.max(base, Math.round(ax1 - x1 + ANNOT_GAP)) : base;
  const step = 500;                                       // 内外两条尺寸链的间距
  const parts = [
    chainParts(true, y0 - offT, x0, xsSeg), chainParts(true, y1 + offB, x0, xsSeg),
    chainParts(false, x0 - offL, y0, ysSeg), chainParts(false, x1 + offR, y0, ysSeg)
  ];
  if (xsSeg.length > 1) parts.push(chainParts(true, y0 - offT - step, x0, [x1 - x0]), chainParts(true, y1 + offB + step, x0, [x1 - x0]));
  if (ysSeg.length > 1) parts.push(chainParts(false, x0 - offL - step, y0, [y1 - y0]), chainParts(false, x1 + offR + step, y0, [y1 - y0]));
  return dimWrapAll(parts);
}
