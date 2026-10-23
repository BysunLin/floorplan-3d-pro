/* ============================================================================
 *  可放进 Worker 的纯计算任务
 *
 *  这里只依赖 core 的纯函数，不碰 DOM / Vue / Three，Worker 与主线程降级路径共用。
 *  · audit  ：车位 / 连通性 / 坡道 / 土方 / 规则自检
 *  · metrics：用地 / 建筑面积 / 容积率 / 密度 / 绿地率
 *  · areas  ：房间被区域布尔切割后的净面积（报告口径，不参与逐帧渲染）
 * ========================================================================== */
import { garageAudit } from '../garage/audit.js';
import { siteMetrics } from '../site/metrics.js';
import { areaOf, bboxOf, overlap, difference } from '../geometry/region.js';

/** 房间净面积：内置房间被区域覆盖时做一次多边形差集 */
export function roomAreasReport(rooms = [], regions = []){
  const regs = (regions || [])
    .filter(r => r && r.poly && r.poly.length >= 3)
    .map(r => ({ poly: r.poly, holes: r.holes || [] }));
  const out = {};
  for (const room of rooms){
    if (!room || !room.poly || room.poly.length < 3) continue;
    const bb = bboxOf(room);
    const hits = regs.filter(g => overlap(bb, bboxOf(g)));
    if (!hits.length){ out[room.id] = areaOf(room); continue; }
    out[room.id] = difference(room, hits).reduce((a, p) => a + areaOf(p), 0);
  }
  return out;
}

/**
 * 一次请求返回三块报告数据，减少 Worker 往返。
 * @param {{levels?:Array, rooms?:Array, regions?:Array, households?:number, preset?:string}} p
 */
export function runReport({ levels = [], rooms = [], regions = [], households = 0, preset = 'standard' } = {}){
  const items = levels.flatMap(l => (l && l.items) || []);
  return {
    audit: garageAudit(levels, { households, preset }),
    metrics: siteMetrics(items, { households }),
    areas: roomAreasReport(rooms, regions)
  };
}
