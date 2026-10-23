/* ============================================================================
 *  地库审计组合根：车位指标 + 规范自检 + 车道连通性 + 坡道估算 + 土方估算
 *  规则包（preset）在这里集中，UI 与报告都只读 audit 结果。
 * ========================================================================== */
import { parkingStats } from './layout.js';
import { analyzeConnectivity } from './connectivity.js';
import { analyzeSlope, SLOPE_RULES } from './slope.js';
import { garageChecks, GARAGE_RULES } from './check.js';

/** 规则包：示例阈值，可按城市 / 产品线覆盖（不是地方规范原文） */
export const GARAGE_PRESETS = {
  basic: {
    id: 'basic', label: '基础', en: 'Basic',
    rules: { minStallsPerHousehold: .8, minEvShare: .05, minAccessible: 1 }
  },
  standard: {
    id: 'standard', label: '标准', en: 'Standard',
    rules: { ...GARAGE_RULES }
  },
  high: {
    id: 'high', label: '改善 / 高端', en: 'Premium',
    rules: { minStallsPerHousehold: 1.2, minEvShare: .2, minAccessible: 2 }
  }
};

export const presetOf = id => GARAGE_PRESETS[id] || GARAGE_PRESETS.standard;

/**
 * 土方估算：
 *   · 顶板覆土 = 地库顶板面积 × 1.0m
 *   · 基坑开挖 = (顶板 + 模块 + 出入口) 面积 × (地库埋深 + 0.6m 工作面)
 * 埋深取所有地下层标高的最大值；没有地下层时按 3.6m 假定。
 */
export function earthworkStats(items = [], levels = []){
  const area = arr => arr.reduce((a, f) => a + f.w*f.d/1e6, 0);
  const slabArea = area(items.filter(f => f.type === 'garageslab'));
  const moduleArea = area(items.filter(f => f.type === 'garagemodule'));
  const entryArea = area(items.filter(f => f.type === 'garageentry'));
  const basement = levels.filter(l => (l.elev || 0) < 0);
  const depth = basement.length
    ? Math.max(...basement.map(l => Math.abs(l.elev || 0)))/1000
    : ((slabArea || moduleArea) ? 3.6 : 0);
  const excavationArea = slabArea + moduleArea + entryArea;
  return {
    slabArea: Math.round(slabArea),
    moduleArea: Math.round(moduleArea),
    soilVolume: Math.round(slabArea * 1.0),
    depth: Math.round(depth*10)/10,
    excavationArea: Math.round(excavationArea),
    excavationVolume: Math.round(excavationArea * (depth + .6))
  };
}

/**
 * @param {Array<{id:string, elev?:number, items:Array}>} levels 各楼层及其家具
 */
export function garageAudit(levels, { households = 0, preset = 'standard', rules } = {}){
  const list = Array.isArray(levels) ? levels : [{ id: 'L1', items: levels || [] }];
  const items = list.flatMap(l => l.items || []);
  const def = presetOf(preset);
  const r = rules || def.rules;
  const stats = parkingStats(items);
  // 连通性按楼层分别分析，避免 B1 / B2 同坐标被误连
  const byLevel = list.map(l => ({ id: l.id, ...analyzeConnectivity(l.items || []) }));
  const sum = k => byLevel.reduce((a, c) => a + (c[k] || 0), 0);
  const withStalls = byLevel.filter(c => c.stalls > 0);
  const connectivity = {
    stalls: sum('stalls'),
    unreachable: sum('unreachable'),
    segments: sum('segments'),
    components: sum('components'),
    entrances: sum('entrances'),
    isolated: sum('isolated'),
    hasEntry: byLevel.some(c => c.hasEntry),
    ok: withStalls.length ? withStalls.every(c => c.ok) : true,
    byLevel
  };
  const slope = analyzeSlope(items, SLOPE_RULES);
  const earthwork = earthworkStats(items, list);
  const checks = garageChecks(items, { households, rules: r, connectivity, slope, earthwork });
  return { stats, connectivity, slope, earthwork, checks, rules: r, preset: def.id };
}
