/* 玄关条案 · 2D 图例（参数化：随实例 w/d 自适应，中心在 (0,0)） */
const ST = 'stroke="#3d3a34" stroke-width="1" vector-effect="non-scaling-stroke"';

export default function icon(w, d, c){
  const x = -w/2, y = -d/2;
  const sh = Math.min(d*.16, 120);            // 台面进深
  const dy = y + sh, dh = d - sh;
  return `<rect x="${x}" y="${y}" width="${w}" height="${d}" rx="10" fill="${c}" ${ST}/>`
    + `<line x1="${x}" y1="${dy}" x2="${x + w}" y2="${dy}" ${ST}/>`
    + `<rect x="${x + w*.06}" y="${dy + dh*.12}" width="${w*.41}" height="${dh*.76}" rx="6" fill="#fff" fill-opacity=".32" ${ST}/>`
    + `<rect x="${x + w*.53}" y="${dy + dh*.12}" width="${w*.41}" height="${dh*.76}" rx="6" fill="#fff" fill-opacity=".32" ${ST}/>`;
}
