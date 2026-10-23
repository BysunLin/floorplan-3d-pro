/* ============================================================================
 *  场地（Site）—— 楼栋摆放与道路的纯几何工具
 *
 *  坐标约定（很重要）：
 *    · **当前编辑的楼栋**：几何就躺在全局 WALLS / ROOMS 里，坐标是"楼栋局部坐标"；
 *      画布用一个 <g transform> 把它映射到场地（世界）坐标。
 *    · **其它楼栋**：只有 { planId 模板, x, y, rot }，渲染时把模板几何套同一个变换。
 *
 *  这样做的代价是 3D 目前只认当前楼栋（P1 不涉及场地的 3D），好处是
 *  所有室内编辑（吸附 / 命中 / 撤销 / 门窗）**一行都不用改** —— 它们本来就工作在局部坐标。
 *
 *  楼栋变换：先绕自身原点旋转 rot 度，再平移到 (x, y)。
 * ========================================================================== */

/** 小区道路默认宽度（mm）：双向单车道 + 人行道 */
export const ROAD_W = 6000;

const rad = d => (Number(d) || 0) * Math.PI / 180;

/** 楼栋局部 → 世界 */
export function toWorld(b, x, y){
  const r = rad(b?.rot), c = Math.cos(r), s = Math.sin(r);
  return { x: (b?.x || 0) + x * c - y * s, y: (b?.y || 0) + x * s + y * c };
}

/** 世界 → 楼栋局部（室内编辑的鼠标点要用它换算） */
export function toLocal(b, x, y){
  const r = rad(b?.rot), c = Math.cos(r), s = Math.sin(r);
  const dx = x - (b?.x || 0), dy = y - (b?.y || 0);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** SVG / CSS 变换串（局部 → 世界） */
export const buildingTransform = b =>
  `translate(${b?.x || 0} ${b?.y || 0}) rotate(${b?.rot || 0})`;

/** 局部 AABB 经楼栋变换后的世界 AABB：[x0,y0,x1,y1] */
export function transformedAabb(b, bb){
  if (!bb) return [0, 0, 0, 0];
  const pts = [
    toWorld(b, bb.x, bb.y),
    toWorld(b, bb.x + bb.w, bb.y),
    toWorld(b, bb.x + bb.w, bb.y + bb.h),
    toWorld(b, bb.x, bb.y + bb.h)
  ];
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** 点是否落在世界 AABB 内（tol 为向外放宽，mm） */
export function hitAabb(aabb, p, tol = 0){
  return p.x >= aabb[0] - tol && p.x <= aabb[2] + tol
    && p.y >= aabb[1] - tol && p.y <= aabb[3] + tol;
}

/** 折线 → SVG path */
export function roadPath(pts = []){
  if (!pts.length) return '';
  return pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p[0])} ${Math.round(p[1])}`).join('');
}

/** 折线的包围盒（命中 / 视口裁剪用） */
export function roadAabb(road, tol = 0){
  const pts = road?.pts || [];
  if (!pts.length) return [0, 0, 0, 0];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const w = (road.w || ROAD_W) / 2 + tol;
  return [Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) + w, Math.max(...ys) + w];
}
