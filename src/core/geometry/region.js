/* ============================================================================
 *  区域（房间）几何：矩形 / 多边形差集 / 面积 / 路径
 *
 *  区域用「外轮廓 + 可选的洞」表示：{ poly, holes }
 *  · poly / holes 都是 [[x, y], …]，单位 mm，y 轴向下（与平面图一致）；
 *  · 绘制区域时先做「矩形 − 墙体/门窗」差集，再把结果从已有区域里扣掉；
 *  · 差集 = 坐标压缩网格 + 边界追踪，结果仍是横平竖直、顶点落在
 *    原始墙体 / 区域边线上的直线多边形，便于再次吸附与拼接。
 * ========================================================================== */

const EPS = 1e-6;
const R3 = v => Math.round(v * 1000) / 1000;

/* ---------- 基本构造 ---------- */

/** 矩形 [x0,y0,x1,y1] → 区域形状 */
export const rectShape = r => ({
  poly: [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]
});

/** 去掉重复点 / 闭合点（不改动几何） */
function normRing(poly){
  const out = [];
  for (const p of poly || []){
    const q = [R3(p[0]), R3(p[1])];
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - q[0]) < EPS && Math.abs(last[1] - q[1]) < EPS) continue;
    out.push(q);
  }
  const first = out[0], last = out[out.length - 1];
  if (out.length > 1 && first && last && Math.abs(first[0] - last[0]) < EPS && Math.abs(first[1] - last[1]) < EPS) out.pop();
  return out;
}

/** 去掉共线点（追踪出来的直角多边形有大量多余顶点） */
function cleanRing(poly){
  const ring = normRing(poly);
  if (ring.length < 4) return ring;
  const out = [];
  for (let i = 0; i < ring.length; i++){
    const a = ring[(i - 1 + ring.length) % ring.length];
    const b = ring[i];
    const c = ring[(i + 1) % ring.length];
    const cross = (b[0] - a[0])*(c[1] - b[1]) - (b[1] - a[1])*(c[0] - b[0]);
    if (Math.abs(cross) < EPS) continue;
    out.push(b);
  }
  return out.length >= 3 ? out : ring;
}

/* ---------- 面积 / 包围盒 ---------- */

/** 有向面积（mm²）：正 = 本项目的「外轮廓」绕向 */
export function polyArea(poly){
  let s = 0;
  for (let i = 0; i < poly.length; i++){
    const p = poly[i], q = poly[(i + 1) % poly.length];
    s += p[0]*q[1] - q[0]*p[1];
  }
  return s/2;
}

/** 区域面积（m²）= 外轮廓 − 洞 */
export function areaOf(shape){
  if (!shape?.poly || shape.poly.length < 3) return 0;
  let a = Math.abs(polyArea(shape.poly));
  for (const h of shape.holes || []) a -= Math.abs(polyArea(h));
  return Math.max(0, a)/1e6;
}

/** 区域周长（m，含洞的边长） */
export function perimeterOf(shape){
  const one = ring => ring.reduce((a, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return a + Math.hypot(q[0] - p[0], q[1] - p[1]);
  }, 0);
  if (!shape?.poly || shape.poly.length < 3) return 0;
  return (one(shape.poly) + (shape.holes || []).reduce((a, h) => a + one(h), 0))/1000;
}

/** 外轮廓包围盒 [x0,y0,x1,y1] */
export function bboxOf(shape){
  const poly = shape?.poly;
  if (!poly || !poly.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly){
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export const overlap = (a, b) => !!a && !!b
  && a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS;

/** 两个包围盒的间距（相交 / 包含 → 0） */
export const bboxGap = (a, b) => Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3], 0);

/** 房间显示面积：被区域覆盖的部分已扣除（netArea），没有则按形状直接算 */
export const roomArea = r => (r && r.netArea != null ? r.netArea : areaOf(r));

/** 房间的实际几何块：被区域切开后可能是多块（netPieces），否则就是自身 */
export const shapePieces = r => {
  if (!r) return [];
  if (r.netPieces) return r.netPieces;
  return r.poly && r.poly.length >= 3 ? [{ poly: r.poly, holes: r.holes || [] }] : [];
};

/** 房间显示周长（按扣掉区域后的几何块累计） */
export const roomPerimeter = r => shapePieces(r).reduce((a, p) => a + perimeterOf(p), 0);

/* ---------- 点 / 边测试 ---------- */

/** 射线法：点是否在环内 */
export function pointInRing(x, y, ring){
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi)*(y - yi)/(yj - yi) + xi) c = !c;
  }
  return c;
}

/** 点是否在区域内（外轮廓内且不在洞里） */
export function pointInShape(x, y, shape){
  if (!shape?.poly || shape.poly.length < 3) return false;
  if (!pointInRing(x, y, shape.poly)) return false;
  for (const h of shape.holes || []) if (pointInRing(x, y, h)) return false;
  return true;
}

/** 点到线段的距离与最近点 */
export function projectOnSeg(p, a, b){
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx*dx + dy*dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a[0])*dx + (p.y - a[1])*dy)/L2)) : 0;
  const x = a[0] + dx*t, y = a[1] + dy*t;
  return { x, y, d: Math.hypot(p.x - x, p.y - y) };
}

/** 两条线段是否相交（含端点接触的常规判定） */
function segsCross(a, b, c, d){
  const cr = (o, p, q) => (p[0] - o[0])*(q[1] - o[1]) - (p[1] - o[1])*(q[0] - o[0]);
  const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/**
 * 两个形状是否「相接」：边线相交 / 顶点落在对方内部 / 边线间距 ≤ tol。
 * 区域绘制要求新区域必须接在墙体或已有区域上，用这个判定。
 */
export function shapesTouch(a, b, tol = 2){
  if (!a?.poly || !b?.poly) return false;
  const ga = bboxGap(bboxOf(a), bboxOf(b));
  if (ga > tol) return false;
  if (pointInShape(a.poly[0][0], a.poly[0][1], b)) return true;
  if (pointInShape(b.poly[0][0], b.poly[0][1], a)) return true;
  const ringsA = [a.poly, ...(a.holes || [])], ringsB = [b.poly, ...(b.holes || [])];
  for (const ra of ringsA){
    for (let i = 0; i < ra.length; i++){
      const p = ra[i], q = ra[(i + 1) % ra.length];
      for (const rb of ringsB){
        for (let j = 0; j < rb.length; j++){
          const r = rb[j], s = rb[(j + 1) % rb.length];
          if (segsCross(p, q, r, s)) return true;
          if (projectOnSeg({ x: p[0], y: p[1] }, r, s).d <= tol) return true;
          if (projectOnSeg({ x: q[0], y: q[1] }, r, s).d <= tol) return true;
          if (projectOnSeg({ x: r[0], y: r[1] }, p, q).d <= tol) return true;
          if (projectOnSeg({ x: s[0], y: s[1] }, p, q).d <= tol) return true;
        }
      }
    }
  }
  return false;
}

/* ---------- 标签锚点 ---------- */

/** 区域名标签的位置：包围盒中心；若中心落在洞里（环形区域），在内部取最近点 */
export function labelPoint(shape){
  const bb = bboxOf(shape);
  if (!bb) return [0, 0];
  const [x0, y0, x1, y1] = bb;
  const cx = (x0 + x1)/2, cy = (y0 + y1)/2;
  if (pointInShape(cx, cy, shape)) return [cx, cy];
  const N = 12;
  let best = [cx, cy], bd = Infinity;
  for (let i = 0; i <= N; i++){
    for (let j = 0; j <= N; j++){
      const x = x0 + (x1 - x0)*i/N, y = y0 + (y1 - y0)*j/N;
      if (!pointInShape(x, y, shape)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bd){ bd = d; best = [x, y]; }
    }
  }
  return best;
}

/* ---------- SVG 路径 ---------- */

/** 区域 → SVG path（配合 fill-rule="evenodd" 支持洞） */
export function shapePath(shape){
  if (!shape?.poly || shape.poly.length < 3) return '';
  const ring = r => r.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('') + 'Z';
  return [shape.poly, ...(shape.holes || [])].map(ring).join('');
}

/* ============================================================================
 *  差集：shape − clips
 *  返回若干区域（可能被切成多块）；洞里、被裁掉的部分都会被扣除。
 * ========================================================================== */

const idxOf = (arr, v) => {                       // 第一个 >= v 的下标（二分）
  let lo = 0, hi = arr.length;
  while (lo < hi){
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v - 1e-9) lo = mid + 1; else hi = mid;
  }
  return lo;
};

/** 裁剪形状本身是否就是轴对齐矩形（可以用刷格子的快路径） */
function isAxisRect(shape){
  if ((shape.holes || []).length) return false;
  const poly = shape.poly;
  if (poly.length !== 4) return false;
  const xs = new Set(poly.map(p => p[0])), ys = new Set(poly.map(p => p[1]));
  return xs.size === 2 && ys.size === 2;
}

/** 沿「实心在左」的绕向，在分叉顶点选下一条边（选转角最大的，保证环不自交） */
function pickNext(prev, cands){
  if (cands.length === 1) return cands[0];
  const dx = Math.sign(prev.x1 - prev.x0), dy = Math.sign(prev.y1 - prev.y0);
  let best = cands[0], bc = -Infinity;
  for (const c of cands){
    const cross = dx*Math.sign(c.y1 - c.y0) - dy*Math.sign(c.x1 - c.x0);
    if (cross > bc){ bc = cross; best = c; }
  }
  return best;
}

/** 取环内侧的一点（用于判断洞属于哪个外轮廓） */
function representative(ring){
  const a = ring[0], b = ring[1] || ring[0];
  const mx = (a[0] + b[0])/2, my = (a[1] + b[1])/2;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const s = polyArea(ring) > 0 ? 1 : -1;
  return [mx - dy/L*0.25*s, my + dx/L*0.25*s];
}

export function difference(shape, clips = []){
  const outer = normRing(shape?.poly || []);
  if (outer.length < 3) return [];
  const holes = (shape.holes || []).map(normRing).filter(r => r.length >= 3);
  const base = { poly: outer, holes };
  const cl = (clips || [])
    .map(c => ({ poly: normRing(c?.poly || []), holes: (c?.holes || []).map(normRing).filter(r => r.length >= 3) }))
    .filter(c => c.poly.length >= 3);
  if (!cl.length) return [base];

  const bb = bboxOf(base);
  if (!cl.some(c => overlap(bb, bboxOf(c)))) return [base];

  /* 1) 坐标压缩：所有顶点 / 边线都作为网格断点，保证结果精确贴合原几何 */
  const xsSet = new Set(), ysSet = new Set();
  const addRing = ring => ring.forEach(([x, y]) => { xsSet.add(x); ysSet.add(y); });
  addRing(outer); holes.forEach(addRing);
  cl.forEach(c => { addRing(c.poly); c.holes.forEach(addRing); });
  const xs = [...xsSet].sort((a, b) => a - b), ys = [...ysSet].sort((a, b) => a - b);
  const nx = xs.length - 1, ny = ys.length - 1;
  if (nx < 1 || ny < 1) return [base];

  /* 2) 标记被裁掉的格子 */
  const blocked = new Uint8Array(nx*ny);
  for (const c of cl){
    const cb = bboxOf(c);
    if (!overlap(bb, cb)) continue;
    const i0 = Math.max(0, idxOf(xs, cb[0])), i1 = Math.min(nx, idxOf(xs, cb[2]));
    const j0 = Math.max(0, idxOf(ys, cb[1])), j1 = Math.min(ny, idxOf(ys, cb[3]));
    if (isAxisRect(c)){
      for (let j = j0; j < j1; j++){
        const row = j*nx;
        for (let i = i0; i < i1; i++) blocked[row + i] = 1;
      }
      continue;
    }
    for (let j = j0; j < j1; j++){
      const cy = (ys[j] + ys[j + 1])/2;
      for (let i = i0; i < i1; i++){
        const cx = (xs[i] + xs[i + 1])/2;
        if (pointInShape(cx, cy, c)) blocked[j*nx + i] = 1;
      }
    }
  }

  /* 3) 实心格子 = 在区域内且未被裁掉 */
  const solid = new Uint8Array(nx*ny);
  const si0 = Math.max(0, idxOf(xs, bb[0])), si1 = Math.min(nx, idxOf(xs, bb[2]));
  const sj0 = Math.max(0, idxOf(ys, bb[1])), sj1 = Math.min(ny, idxOf(ys, bb[3]));
  let count = 0;
  for (let j = sj0; j < sj1; j++){
    const cy = (ys[j] + ys[j + 1])/2, row = j*nx;
    for (let i = si0; i < si1; i++){
      if (blocked[row + i]) continue;
      const cx = (xs[i] + xs[i + 1])/2;
      if (!pointInShape(cx, cy, base)) continue;
      solid[row + i] = 1;
      count++;
    }
  }
  if (!count) return [];

  /* 4) 边界追踪：每个实心格子朝向空格子的那条边，按「实心在左」定向 */
  const on = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && solid[j*nx + i] === 1;
  const key = (x, y) => `${x}|${y}`;
  const adj = new Map();
  const addEdge = (x0, y0, x1, y1) => {
    const k = key(x0, y0);
    let list = adj.get(k);
    if (!list) adj.set(k, list = []);
    list.push({ x0, y0, x1, y1, used: false });
  };
  for (let i = 0; i < nx; i++){
    for (let j = 0; j < ny; j++){
      if (!on(i, j)) continue;
      const xa = xs[i], xb = xs[i + 1], ya = ys[j], yb = ys[j + 1];
      if (!on(i, j - 1)) addEdge(xa, ya, xb, ya);
      if (!on(i + 1, j)) addEdge(xb, ya, xb, yb);
      if (!on(i, j + 1)) addEdge(xb, yb, xa, yb);
      if (!on(i - 1, j)) addEdge(xa, yb, xa, ya);
    }
  }

  const rings = [];
  for (const list of adj.values()){
    for (const e of list){
      if (e.used) continue;
      const start = key(e.x0, e.y0);
      const pts = [];
      let cur = e, guard = 0;
      while (cur && guard++ < 200000){
        cur.used = true;
        pts.push([cur.x0, cur.y0]);
        if (key(cur.x1, cur.y1) === start) break;
        const next = (adj.get(key(cur.x1, cur.y1)) || []).filter(c => !c.used);
        if (!next.length){ cur = null; break; }
        cur = pickNext(cur, next);
      }
      if (pts.length < 4) continue;
      const ring = cleanRing(pts);
      if (ring.length >= 4 && Math.abs(polyArea(ring)) > 1) rings.push(ring);
    }
  }
  if (!rings.length) return [];

  /* 5) 正绕向 = 外轮廓，负绕向 = 洞；洞归到包含它的最小外轮廓 */
  const outers = [], holeRings = [];
  for (const r of rings) (polyArea(r) > 0 ? outers : holeRings).push(r);
  if (!outers.length) return [];
  const result = outers.map(poly => ({ poly, holes: [] }));
  for (const h of holeRings){
    const p = representative(h);
    let target = null, ta = Infinity;
    for (const o of result){
      if (!pointInRing(p[0], p[1], o.poly)) continue;
      const a = Math.abs(polyArea(o.poly));
      if (a < ta){ ta = a; target = o; }
    }
    (target || result[0]).holes.push(h);
  }
  return result;
}
