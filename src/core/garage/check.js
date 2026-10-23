/* ============================================================================
 *  地库自检：把「车位数 / 户均配比 / 充电 / 无障碍 / 出入口 / 车道」收敛成
 *  一组可配置的规范提示，UI 只负责渲染，规则集中在这里，便于后续接报建规则包。
 * ========================================================================== */
import { parkingStats } from './layout.js';

export const GARAGE_RULES = {
  minStallsPerHousehold: 1.0,   // 户均车位下限（各地不同，可被调用方覆盖）
  minEvShare: .1,               // 充电车位占比下限
  minAccessible: 1              // 无障碍车位下限
};

/**
 * @param {Array<{type:string,w:number,d:number}>} items 跨楼层家具
 * @param {{households?:number, rules?:object}} [opt]
 * @returns {{key:string, level:'ok'|'warn'|'info', value?:number, limit?:number}[]}
 */
export function garageChecks(items = [], {
  households = 0, rules = GARAGE_RULES, connectivity = null, slope = null, earthwork = null
} = {}){
  const s = parkingStats(items);
  if (!s.total) return [];
  const out = [{ key: 'total', level: 'info', value: s.total }];

  if (households > 0){
    const per = s.total / households;
    out.push({
      key: 'perHousehold',
      level: per >= rules.minStallsPerHousehold ? 'ok' : 'warn',
      value: Math.round(per*100)/100,
      limit: rules.minStallsPerHousehold
    });
  } else {
    out.push({ key: 'households', level: 'info' });
  }

  const evShare = s.ev / s.total;
  out.push({
    key: 'evShare',
    level: evShare >= rules.minEvShare ? 'ok' : 'warn',
    value: Math.round(evShare*100),
    limit: Math.round(rules.minEvShare*100)
  });

  out.push({
    key: 'accessible',
    level: s.accessible >= rules.minAccessible ? 'ok' : 'warn',
    value: s.accessible,
    limit: rules.minAccessible
  });

  const hasEntry = items.some(f => f.type === 'garageentry' || f.type === 'ramp');
  out.push({ key: 'entry', level: hasEntry ? 'ok' : 'warn' });

  const hasAisle = items.some(f => f.type === 'garagemodule' || f.type === 'lane');
  out.push({ key: 'aisle', level: hasAisle ? 'ok' : 'warn' });

  if (connectivity && s.total > 0){
    out.push({
      key: 'connectivity',
      level: connectivity.ok ? 'ok' : 'warn',
      value: connectivity.unreachable,
      limit: connectivity.stalls
    });
  }
  if (slope && slope.count > 0){
    out.push({
      key: 'slope',
      level: slope.ok ? 'ok' : 'warn',
      value: slope.maxSlope,
      limit: 15
    });
  }
  if (earthwork && earthwork.slabArea > 0){
    out.push({
      key: 'earthwork',
      level: 'info',
      value: Math.round(earthwork.soilVolume),
      extra: Math.round(earthwork.excavationVolume)
    });
  }

  return out;
}
