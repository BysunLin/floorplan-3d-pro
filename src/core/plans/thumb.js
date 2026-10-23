/* ============================================================================
 *  户型 → 2D 缩略图 SVG（纯函数，不碰 store / 全局几何）
 *
 *  用在哪：
 *    · 顶部「从样板间开始」弹窗（原来写在 AppHeader.vue 里的局部函数）
 *    · 启动首页的样板间卡片 / 「正在编辑」卡片
 *
 *  为什么单独抽出来：缩略图只吃几何（bounds + walls + rooms + regions），
 *  不依赖 view / ui / state —— 于是可以在编辑器还没挂载的首页里直接用。
 * ========================================================================== */
import { makePlan } from './index.js';
import { wallQuad } from '../model/wallLine.js';

/** 区域底面配色（与 3D 的材质保持一致观感） */
const MAT_FILL = {
  lawn: '#bcd49b', cement: '#c9c6bf', pond: '#9cc9d8', asphalt: '#5a5a5e'
};

const ringOf = poly => poly.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('') + 'Z';

/** 房间 / 区域：外轮廓 + 洞口，evenodd 挖空 */
function shapeOf(r){
  const d = [r.poly || [], ...(r.holes || [])].filter(p => p.length).map(ringOf).join('');
  return d ? `<path d="${d}" fill="${MAT_FILL[r.mat] || '#efe9dd'}" fill-rule="evenodd"/>` : '';
}

/** 单面墙：中心线 ±t/2 的四边形（正交墙就是矩形，斜墙也天然支持） */
function wallOf(w){
  const q = wallQuad(w);
  if (!q || q.length !== 4) return '';
  const fill = w[4] === 'b' ? '#26241f' : '#a7a195';
  const pts = q.map(p => `${Math.round(p[0])},${Math.round(p[1])}`).join(' ');
  return `<polygon points="${pts}" fill="${fill}"/>`;
}

/**
 * 几何 → SVG 字符串。
 * @param {object} g { bounds:{x,y,w,h}, walls, rooms, regions }
 * @returns {string} 完整的 <svg> 字符串（外层容器负责尺寸）
 */
export function geoThumbSvg(g = {}){
  const b = g.bounds || { x: 0, y: 0, w: 1000, h: 1000 };
  const regions = (g.regions || []).map(shapeOf).join('');
  const rooms = (g.rooms || []).map(shapeOf).join('');
  const walls = (g.walls || []).filter(Boolean).map(wallOf).join('');
  return `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet">`
    + `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#f7f4ee"/>`
    + `${regions}${rooms}${walls}</svg>`;
}

/** 内置 / 运行时户型 → 缩略图（取该户型的原始几何，不含用户改动） */
export function planThumbSvg(id){
  try {
    return geoThumbSvg(makePlan(id));
  } catch {
    return '';
  }
}
