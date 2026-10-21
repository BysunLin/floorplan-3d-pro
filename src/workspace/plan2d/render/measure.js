/* 2D 测量线：已完成的测量 + 进行中的预览 */
export function measureSvg(measures, ui, scale){
  const k = 1/scale, fs = 12*k;
  const one = (a, b, tmp) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) return '';
    let ang = Math.atan2(b.y - a.y, b.x - a.x)*180/Math.PI;
    if (ang > 90 || ang < -90) ang += 180;
    const mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
    const nx = -(b.y - a.y)/L*5*k, ny = (b.x - a.x)/L*5*k;
    const col = tmp ? '#2f5d62' : '#b5653a';
    const S = `stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"`;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${S}/>`
      + `<line x1="${a.x - nx}" y1="${a.y - ny}" x2="${a.x + nx}" y2="${a.y + ny}" ${S}/>`
      + `<line x1="${b.x - nx}" y1="${b.y - ny}" x2="${b.x + nx}" y2="${b.y + ny}" ${S}/>`
      + `<text x="${mx}" y="${my - 5*k}" font-size="${fs}" text-anchor="middle" fill="${col}" font-weight="600" transform="rotate(${ang} ${mx} ${my})" stroke="#fff" stroke-width="${3.5*k}" paint-order="stroke">${Math.round(L)} mm</text>`;
  };
  let s = measures.map(m => one(m.a, m.b)).join('');
  if (ui.mA && ui.mCur) s += one(ui.mA, ui.mCur, true);
  if (ui.mA) s += `<circle cx="${ui.mA.x}" cy="${ui.mA.y}" r="${3*k}" fill="#2f5d62"/>`;
  return s;
}
