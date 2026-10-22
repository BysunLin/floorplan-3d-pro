/* ============================================================================
 *  识别结果（像素） → 方案几何（mm）
 *
 *  这一步把「图像域」彻底转成「项目域」，输出可以直接交给 makePlan()/setGeometry()：
 *    · 平移到原点、按用户给定的总宽换算比例
 *    · 量化到 10mm 网格（与画墙 / 区域绘制的网格一致）
 *    · 墙厚吸附到 WALL_T（120 / 240），否则 3D 建墙与开洞判定会不自然
 *    · 墙类型：贴户型外轮廓的判为外墙 'e'，其余为非承重墙 'n'
 *    · 房间多边形直接作为区域（regions），复用区域的地面材质 / 面积统计
 * ========================================================================== */
import { WALL_T } from '@/core/library/wallItems.js';
import { tr } from '@/i18n.js';

const Q = 10;                                     // 量化网格（mm）
const q = v => Math.round(v / Q) * Q;

/** 多边形面积（mm²，绝对值） */
function polyAreaOf(poly){
  let a = 0;
  for (let i = 0; i < poly.length; i++){
    const p = poly[i], r = poly[(i + 1) % poly.length];
    a += p[0] * r[1] - r[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** 去掉重复点与共线点（换算取整后可能出现） */
function simplify(poly){
  const pts = [];
  for (const p of poly){
    const last = pts[pts.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    pts.push(p);
  }
  if (pts.length > 1){
    const f = pts[0], l = pts[pts.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) pts.pop();
  }
  if (pts.length < 4) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++){
    const a = pts[(i - 1 + pts.length) % pts.length];
    const p = pts[i];
    const b = pts[(i + 1) % pts.length];
    const collinear = (a[0] === p[0] && b[0] === p[0]) || (a[1] === p[1] && b[1] === p[1]);
    if (!collinear) out.push(p);
  }
  return out.length >= 3 ? out : pts;
}

/**
 * @param {{walls:Array,rooms:Array,width:number,height:number}} det  像素域识别结果
 * @param {{totalWidthMM?:number, name?:string}} opts
 */
export function toGeo(det, opts = {}){
  const src = (det.walls || []).filter(w => w.x1 - w.x0 >= 2 && w.y1 - w.y0 >= 2);
  if (!src.length) throw new Error('没有识别到墙体');

  const bx0 = Math.min(...src.map(w => w.x0));
  const bx1 = Math.max(...src.map(w => w.x1));
  const by0 = Math.min(...src.map(w => w.y0));
  const by1 = Math.max(...src.map(w => w.y1));
  const bw = Math.max(1, bx1 - bx0);

  // 用户给的「整套实际宽度」÷ 识别出的像素宽度 = 比例
  const totalWidthMM = Math.max(2000, Math.min(60000, opts.totalWidthMM || 10000));
  const mmPerPx = totalWidthMM / bw;
  const toMM = (x, y) => [
    q((x - bx0) * mmPerPx),
    q((y - by0) * mmPerPx)
  ];

  // 墙厚：先取中位数，再吸附到项目里存在的两种厚度
  const tPx = src.map(w => Math.min(w.x1 - w.x0, w.y1 - w.y0) * mmPerPx).sort((a, b) => a - b);
  const med = tPx[Math.floor(tPx.length / 2)] || WALL_T.n;
  const thick = Math.abs(med - WALL_T.b) < Math.abs(med - WALL_T.n) ? WALL_T.b : WALL_T.n;

  const W = q((bx1 - bx0) * mmPerPx);
  const H = q((by1 - by0) * mmPerPx);
  const EDGE_TOL = Math.max(40, thick);

  const walls = [];
  for (const w of src){
    let x0 = q((w.x0 - bx0) * mmPerPx);
    let x1 = q((w.x1 - bx0) * mmPerPx);
    let y0 = q((w.y0 - by0) * mmPerPx);
    let y1 = q((w.y1 - by0) * mmPerPx);
    const horiz = (x1 - x0) >= (y1 - y0);
    // 短边按中线改成标准厚度，长边不动
    if (horiz){
      const cy = (y0 + y1) / 2;
      y0 = q(cy - thick / 2);
      y1 = q(cy + thick / 2);
    } else {
      const cx = (x0 + x1) / 2;
      x0 = q(cx - thick / 2);
      x1 = q(cx + thick / 2);
    }
    if (x1 - x0 < 60 || y1 - y0 < 40) continue;
    // 贴着户型外轮廓的墙判为外墙
    const outer = horiz
      ? (Math.abs(y0) <= EDGE_TOL || Math.abs(y1 - H) <= EDGE_TOL)
      : (Math.abs(x0) <= EDGE_TOL || Math.abs(x1 - W) <= EDGE_TOL);
    walls.push([x0, y0, x1, y1, outer ? 'e' : 'n']);
  }

  // 房间 → 区域（同一套 poly + holes 结构，地面材质交给用户后续修改）
  const regions = [];
  let idx = 0;
  for (const r of det.rooms || []){
    const poly = simplify((r.poly || []).map(([x, y]) => toMM(x, y)));
    if (poly.length < 4) continue;
    const a = polyAreaOf(poly) / 1e6;
    if (a < 0.5) continue;
    idx++;
    regions.push({
      id: 'rg' + idx,
      name: tr('房间 ', 'Room ') + idx,
      mat: 'tile800',
      poly
    });
  }

  const geo = {
    walls,
    wins: [],
    doors: [],
    slides: [],
    lintels: [],
    rooms: [],
    regions,
    bounds: { x: -800, y: -800, w: W + 1600, h: H + 1600 },
    furniture: []
  };

  const area = regions.reduce((s, r) => s + polyAreaOf(r.poly) / 1e6, 0);
  return {
    geo,
    meta: {
      totalWidthMM: W,
      totalHeightMM: H,
      mmPerPx,
      wallThickness: thick,
      wallCount: walls.length,
      regionCount: regions.length,
      area: Math.round(area * 10) / 10
    }
  };
}
