/* ============================================================================
 *  地库排布内核（纯函数，无框架 / 无 Three 依赖）
 *
 *  一套布局同时供三处使用，避免三份公式各自漂移：
 *    · 2D 图例      workspace/plan2d → core/library/furnSvg.js
 *    · 3D 建模      workspace/view3d/build/furniture.js
 *    · 车位指标      shell/right-panel/panels/OverviewPanel.vue
 *
 *  布局规则：以「双排车位 + 中间通道」为一个标准跨（2×5.3m + 6m = 16.6m），
 *  沿进深方向重复；剩余空间够一排车位时补一排。所有尺寸单位 mm。
 * ========================================================================== */

import { pointInShape } from '../geometry/region.js';

export const PARK = {
  stallW: 2500,     // 标准车位宽
  stallD: 5300,     // 标准车位深（垂直停车）
  aisle: 6000,      // 车道净宽（双车道）
  margin: 900,      // 外墙内侧退距
  column: 8100,     // 柱网间距
  columnSize: 600
};

/**
 * 按模块外轮廓计算车位排布。
 * @param {number} w 模块宽（mm）
 * @param {number} d 模块深（mm）
 * @returns {{
 *   rows: {z0:number, depth:number}[],
 *   aisles: {z0:number, depth:number}[],
 *   stallsPerRow: number, stallW: number, total: number,
 *   margin: number, column: number, columnSize: number
 * }}
 */
export function garageLayout(w, d){
  const { stallD: sd, aisle: ad, margin: m, stallW } = PARK;
  const rows = [], aisles = [];
  let z = -d/2 + m, rem = d - 2*m;

  // 标准跨：一排车位 → 通道 → 一排车位
  while (rem >= 2*sd + ad){
    rows.push({ z0: z, depth: sd }); z += sd;
    aisles.push({ z0: z, depth: ad }); z += ad;
    rows.push({ z0: z, depth: sd }); z += sd;
    rem -= 2*sd + ad;
  }
  // 余量够一排时补一排（不再加通道，避免车道贴墙）
  if (rem >= sd){ rows.push({ z0: z, depth: sd }); z += sd; }

  const stallsPerRow = Math.max(0, Math.floor((w - 2*m)/stallW));
  const stallWReal = stallsPerRow ? (w - 2*m)/stallsPerRow : 0;
  return {
    rows, aisles,
    stallsPerRow, stallW: stallWReal,
    total: stallsPerRow * rows.length,
    margin: m,
    column: PARK.column,
    columnSize: PARK.columnSize
  };
}

/**
 * 在不规则轮廓内逐位排车位：先生成规则排布，再用「四角全部落在轮廓内」筛选。
 * 局部坐标：x 沿 W（长边）、z 沿 D；rot 为整体旋转角（度），与平面图 rotate 一致。
 * @returns {{ layout: object, stalls: {cx:number,cy:number,w:number,d:number,rot:number}[] }}
 */
export function parkingInPolygon({ w, d, poly, holes = [], cx = 0, cy = 0, rot = 0, inset = 30 }){
  const L = garageLayout(w, d);
  const a = rot * Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
  const toWorld = (px, pz) => [cx + px*ca - pz*sa, cy + px*sa + pz*ca];
  const shape = { poly, holes };
  const stalls = [];
  if (poly && poly.length >= 3){
    for (const row of L.rows){
      const hd = Math.max(row.depth/2 - inset, row.depth*.3);
      for (let i = 0; i < L.stallsPerRow; i++){
        const lx = -w/2 + L.margin + L.stallW*(i + .5);
        const lz = row.z0 + row.depth/2;
        const hw = Math.max(L.stallW/2 - inset, L.stallW*.3);
        const corners = [[lx - hw, lz - hd], [lx + hw, lz - hd], [lx + hw, lz + hd], [lx - hw, lz + hd]];
        if (!corners.every(([px, pz]) => pointInShape(...toWorld(px, pz), shape))) continue;
        const [wx, wy] = toWorld(lx, lz);
        if (!pointInShape(wx, wy, shape)) continue;      // 中心也要在轮廓内（防止跨洞）
        stalls.push({ cx: wx, cy: wy, w: L.stallW, d: row.depth, rot });
      }
    }
  }
  return { layout: L, stalls };
}

/** 世界坐标多边形 → 地库局部坐标（旋转中心 = 模块中心） */
function toLocal(poly, cx, cy, rot){
  const a = -rot*Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
  return poly.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [dx*ca - dy*sa, dx*sa + dy*ca];
  });
}

/** 水平线 y 与多边形的内部区间（射线配对）：[[x0,x1], …] */
export function spanAtY(poly, y){
  const xs = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [x1, y1] = poly[j], [x2, y2] = poly[i];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y))
      xs.push(x1 + (y - y1)*(x2 - x1)/(y2 - y1));
  }
  xs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

/**
 * 异形地库的车道中心线：按每条通道的中心线切轮廓，只在内部生成线段。
 * @returns {{cx:number,cy:number,w:number,d:number,rot:number}[]} 可直接生成 lane 构件
 */
export function aisleSpansInPolygon({ w, d, poly, cx = 0, cy = 0, rot = 0, minLen = 1500 }){
  const L = garageLayout(w, d);
  if (!poly || poly.length < 3) return [];
  const lp = toLocal(poly, cx, cy, rot);
  const a = rot*Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
  const toWorld = (px, pz) => [cx + px*ca - pz*sa, cy + px*sa + pz*ca];
  const out = [];
  for (const aisle of L.aisles){
    const z = aisle.z0 + aisle.depth/2;
    for (const [x0, x1] of spanAtY(lp, z)){
      if (x1 - x0 < minLen) continue;
      const [wx, wy] = toWorld((x0 + x1)/2, z);
      out.push({ cx: wx, cy: wy, w: x1 - x0, d: 150, rot });
    }
  }
  return out;
}

/** 异形地库的柱网：只保留完整落在轮廓内的柱子 */
export function columnsInPolygon({ w, d, poly, holes = [], cx = 0, cy = 0, rot = 0 }){
  const L = garageLayout(w, d);
  if (!poly || poly.length < 3) return [];
  const shape = { poly, holes };
  const a = rot*Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
  const toWorld = (px, pz) => [cx + px*ca - pz*sa, cy + px*sa + pz*ca];
  const zs = [];
  L.aisles.forEach(a2 => zs.push(a2.z0, a2.z0 + a2.depth));
  const half = L.columnSize/2, out = [];
  for (let x = -w/2 + L.column/2; x < w/2 - L.column*.3; x += L.column){
    for (const z of zs){
      const corners = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]];
      if (!corners.every(([px, pz]) => pointInShape(...toWorld(px, pz), shape))) continue;
      if (!pointInShape(...toWorld(x, z), shape)) continue;
      const [wx, wy] = toWorld(x, z);
      out.push({ cx: wx, cy: wy, w: L.columnSize, d: L.columnSize, rot });
    }
  }
  return out;
}

/** 单件家具折算的车位数（地库模块按排布公式折算） */
export function stallsOf(type, w, d){
  switch (type){
    case 'parking': case 'evparking': case 'parkingaccessible': case 'parkingcompact':
      return 1;
    case 'parkingsub':                          // 子母车位：一前一后两辆
      return 2;
    case 'parkingrow':                          // 车位组：按 2.5m 一个折算
      return Math.max(1, Math.round(w / PARK.stallW));
    case 'garagemodule':
      return garageLayout(w, d).total;
    default:
      return 0;
  }
}

/**
 * 汇总一组家具的车位指标。
 * @param {Array<{type:string,w:number,d:number}>} items
 */
export function parkingStats(items = []){
  const s = {
    total: 0, standard: 0, ev: 0, accessible: 0, tandem: 0, compact: 0,
    modules: 0, moduleStalls: 0
  };
  for (const f of items){
    const n = stallsOf(f.type, f.w, f.d);
    if (!n) continue;
    s.total += n;
    switch (f.type){
      case 'evparking': s.ev += n; break;
      case 'parkingaccessible': s.accessible += n; break;
      case 'parkingsub': s.tandem += n; break;
      case 'parkingcompact': s.compact += n; break;
      case 'garagemodule': s.modules += 1; s.moduleStalls += n; break;
      default: s.standard += n;
    }
  }
  return s;
}
