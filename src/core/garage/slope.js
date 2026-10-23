/* ============================================================================
 *  地库坡道 / 净高 / 车道宽度的示意校验
 *
 *  说明：项目里的坡道构件只有平面尺寸与方向，没有真实的起终点标高，
 *  因此按「地库层高 3.6m」做估算（可配置）。数值用于方案阶段提示，
 *  不作为施工图依据。
 * ========================================================================== */
import { PARK } from './layout.js';

export const SLOPE_RULES = {
  floorRise: 3.6,       // 估算的单层高差（m）
  maxSlope: 15,         // 直线坡道最大坡度（%）
  minHeadroom: 2.2,     // 最小净高（m）
  minAisle: 5.5         // 双车道最小净宽（m）
};

/**
 * @param {Array} items 同一楼层（或整盘）的家具
 * @param {{floorRise?:number, maxSlope?:number, minAisle?:number}} [rules]
 * @returns {{ok:boolean, count:number, maxSlope:number, entries:object[],
 *   aisleWidth:number|null, aisleOk:boolean}}
 */
export function analyzeSlope(items = [], rules = SLOPE_RULES){
  const ramps = items.filter(f => f.type === 'garageentry' || f.type === 'ramp');
  const entries = ramps.map(f => {
    const length = Math.max(f.w, f.d)/1000;
    const slope = length > 0 ? rules.floorRise/length*100 : 0;
    return {
      type: f.type, length,
      slope: Math.round(slope*10)/10,
      ok: slope <= rules.maxSlope + 1e-6
    };
  });
  const maxSlope = entries.length ? Math.max(...entries.map(e => e.slope)) : 0;
  const hasModule = items.some(f => f.type === 'garagemodule');
  const aisleWidth = hasModule ? PARK.aisle/1000 : null;
  return {
    ok: entries.every(e => e.ok) && (aisleWidth === null || aisleWidth >= rules.minAisle),
    count: entries.length,
    maxSlope,
    entries,
    aisleWidth,
    aisleOk: aisleWidth === null ? true : aisleWidth >= rules.minAisle
  };
}
