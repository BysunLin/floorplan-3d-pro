/* ============================================================================
 *  强排指标（纯函数）：用地面积 / 总建筑面积 / 容积率 / 建筑密度 / 绿地率 / 车位
 *
 *  口径：
 *    · 用地面积：优先取「用地红线」构件面积；没有红线时用大型场地构件的外接矩形
 *    · 总建筑面积：楼栋体量按「轮廓面积 × 层数」估算（沙盘阶段，不含地下室）
 *    · 建筑密度：楼栋轮廓面积 / 用地面积
 *    · 绿地率：草坪 / 花境 / 树阵 / 水生植物 / 隐形消防车道 / 顶板覆土 面积 / 用地面积
 * ========================================================================== */
import { parkingStats } from '../garage/layout.js';
import { furnAabb } from '../geometry/collide.js';

/** 楼栋体量：层数表（用于反算建筑面积） */
export const BUILDING_FLOORS = {
  tower18: 18, tower26: 26, tower33: 33,
  midrise11: 11, midrise6: 6,
  townhouse: 3, villa: 2,
  podium: 2, kindergarten: 3
};

const GREEN_TYPES = new Set([
  'lawn', 'flowerbed', 'treegrid', 'aquatic', 'firelanehidden', 'garageslab'
]);

const round2 = v => Math.round(v*100)/100;

/**
 * @param {Array<{type:string,w:number,d:number,cx:number,cy:number}>} items
 * @param {{households?:number}} [opt]
 */
export function siteMetrics(items = [], { households = 0 } = {}){
  const area = f => Math.abs(f.w*f.d)/1e6;      // m²

  const parcelArea = items.filter(f => f.type === 'landparcel').reduce((a, f) => a + area(f), 0);
  let siteArea = parcelArea, source = 'parcel';
  if (!siteArea){
    // 没有红线：用大型场地构件（≥ 100m²）的外接矩形兜底
    const big = items.filter(f => f.w*f.d >= 1e8);
    if (big.length){
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const f of big){
        const { hw, hh } = furnAabb(f);
        x0 = Math.min(x0, f.cx - hw); x1 = Math.max(x1, f.cx + hw);
        y0 = Math.min(y0, f.cy - hh); y1 = Math.max(y1, f.cy + hh);
      }
      siteArea = Math.max(0, (x1 - x0)*(y1 - y0)/1e6);
      source = 'bbox';
    }
  }

  let gfa = 0, footprint = 0, buildings = 0;
  for (const f of items){
    const floors = BUILDING_FLOORS[f.type];
    if (!floors) continue;
    const a = area(f);
    footprint += a;
    gfa += a*floors;
    buildings++;
  }

  const greenArea = items.filter(f => GREEN_TYPES.has(f.type)).reduce((a, f) => a + area(f), 0);
  const park = parkingStats(items);

  return {
    siteArea: Math.round(siteArea),
    source,
    gfa: Math.round(gfa),
    footprint: Math.round(footprint),
    buildings,
    far: siteArea ? round2(gfa/siteArea) : 0,
    density: siteArea ? round2(footprint/siteArea) : 0,
    greenArea: Math.round(greenArea),
    greenRatio: siteArea ? round2(greenArea/siteArea) : 0,
    parking: park.total,
    perHousehold: households ? round2(park.total/households) : 0
  };
}
