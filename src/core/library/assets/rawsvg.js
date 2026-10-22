/* ============================================================================
 *  icon.svg → 2D 图例函数
 *
 *  约定：SVG 用 viewBox 定义自己的坐标系，导入时按「等比缩放 + 居中」贴进
 *  家具的 w×d 占地矩形（不做非等比拉伸，避免床/沙发变形）。
 *  描边请加 vector-effect="non-scaling-stroke"，否则缩放后线宽会跟着变。
 * ========================================================================== */
const cache = new Map();

function parse(raw){
  const vb = /viewBox\s*=\s*["']([^"']+)["']/i.exec(raw);
  let vw = 0, vh = 0;
  if (vb){
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    vw = p[2]; vh = p[3];
  }
  if (!(vw > 0 && vh > 0)){
    const wm = /width\s*=\s*["']([\d.]+)/i.exec(raw);
    const hm = /height\s*=\s*["']([\d.]+)/i.exec(raw);
    vw = Number(wm?.[1]) || 100;
    vh = Number(hm?.[1]) || 100;
  }
  const body = raw
    .replace(/^[\s\S]*?<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '');
  return { vw, vh, body };
}

export function svgIcon(raw){
  return (w, d) => {
    let info = cache.get(raw);
    if (!info){ info = parse(raw); cache.set(raw, info); }
    const s = Math.min(w / info.vw, d / info.vh);
    const tx = -(info.vw * s) / 2, ty = -(info.vh * s) / 2;
    return `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(4)})">${info.body}</g>`;
  };
}
