/* ============================================================================
 *  线段几何原语（斜墙的地基）
 *
 *  正交户型里「墙 = 矩形」，所以历史代码到处是 Math.abs(w[2]-w[0]) 这种写法。
 *  一旦允许任意角度，矩形只剩「短边 = 厚度」这一层含义，其它判断都要落到
 *  「中心线 + 厚度」上：
 *
 *      命中       →  点到线段距离 - t/2
 *      端点吸附   →  线段投影 / 端点距离
 *      T 接判定   →  线段求交
 *      轮廓       →  中心线沿法向 ±t/2 的四边形
 *
 *  这里只放纯函数（无 Vue / 无全局数组），2D、3D、store、单测共用。
 *  坐标单位 mm，与平面图一致（x 向右，y 向下）。
 * ========================================================================== */

const EPS = 1e-9;

/** 归一化向量，长度为 0 时退化为 (1,0) */
function unit(x, y){
  const L = Math.hypot(x, y);
  return L < EPS ? [1, 0] : [x / L, y / L];
}

/** 点到线段最近点：{ x, y, t（0..1 参数）, d（距离） } */
export function closestOnSeg(p, a, b){
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = L2 > EPS ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + dx * t, y = a.y + dy * t;
  return { x, y, t, d: Math.hypot(p.x - x, p.y - y) };
}

/** 点到线段的距离 */
export function segDist(p, a, b){
  return closestOnSeg(p, a, b).d;
}

/**
 * 线段求交。平行 / 共线时返回 null（调用方按「重叠」另行处理）。
 * @returns {{x:number,y:number,t:number,u:number}|null}
 */
export function segIntersect(p1, p2, q1, q2){
  const rx = p2.x - p1.x, ry = p2.y - p1.y;
  const sx = q2.x - q1.x, sy = q2.y - q1.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return null;
  const t = ((q1.x - p1.x) * sy - (q1.y - p1.y) * sx) / den;
  const u = ((q1.x - p1.x) * ry - (q1.y - p1.y) * rx) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: p1.x + rx * t, y: p1.y + ry * t, t, u };
}

/**
 * 墙轴基底：u 沿墙长（起点 → 终点）、n 为法向。
 * 门窗偏移、厚度展开、角度显示都用这一组。
 */
export function basisOf(a, b){
  const [ux, uy] = unit(b.x - a.x, b.y - a.y);
  return { u: [ux, uy], n: [-uy, ux], len: Math.hypot(b.x - a.x, b.y - a.y), deg: Math.atan2(uy, ux) * 180 / Math.PI };
}

/** 从 a 沿 (ux,uy) 前进 s 得到的点 */
export function pointAt(a, s, u){
  return { x: a.x + u[0] * s, y: a.y + u[1] * s };
}

/** 点在墙轴上的投影参数（沿墙长度，可为负 / 超过全长） */
export function alongOf(p, a, b){
  const { u } = basisOf(a, b);
  return (p.x - a.x) * u[0] + (p.y - a.y) * u[1];
}

/**
 * 中心线 + 厚度 → 四边形（顺序固定：起点法向侧、终点法向侧、终点反侧、起点反侧）
 * @returns {Array<[number,number]>} 4 个顶点
 */
export function quadOf(a, b, t){
  const { n } = basisOf(a, b);
  const h = (t || 0) / 2;
  return [
    [a.x + n[0] * h, a.y + n[1] * h],
    [b.x + n[0] * h, b.y + n[1] * h],
    [b.x - n[0] * h, b.y - n[1] * h],
    [a.x - n[0] * h, a.y - n[1] * h]
  ];
}

/** 四边形 → SVG polygon points */
export function quadPoints(q){
  return q.map(([x, y]) => `${x},${y}`).join(' ');
}

/** 四边形 → SVG path d */
export function quadPathD(q){
  return `M${q[0][0]} ${q[0][1]}L${q[1][0]} ${q[1][1]}L${q[2][0]} ${q[2][1]}L${q[3][0]} ${q[3][1]}Z`;
}

/** 四边形 → 轴对齐包围盒 [x0,y0,x1,y1] */
export function aabbOfQuad(q){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of q){
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
