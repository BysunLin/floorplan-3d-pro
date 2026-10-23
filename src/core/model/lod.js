/* ============================================================================
 *  LOD —— 按比例尺分级（小区总图 / 组团 / 单栋 / 室内）
 *
 *  为什么要单独一个模块：
 *    · 2D 画布、楼栋标签、3D 体量、状态栏都要回答同一个问题「现在该画多细」，
 *      判定散在各处一定会漂移；
 *    · 阈值必须带**滞后**（hysteresis）：在临界比例尺上来回滚轮时，
 *      没有滞后会让整棵 SVG 反复重建 / 3D 反复重建，肉眼就是闪。
 *
 *  判据统一用「比例尺分母 N」（1:N）而不是 view.s（px/mm）：
 *      N = 1 / (s × PX_MM)          PX_MM = 25.4/96 ≈ 0.2646 mm/px
 *    s = 0.06 px/mm → N ≈ 63（1:63，室内）；s = 0.0012 → N ≈ 3150（小区总图）
 *
 *  档位与阈值（N）：
 *      interior  N ≤ 150      全量：家具 / 尺寸 / 门窗扇 / 房间名
 *      building  150 < N ≤ 600  单栋：全部墙 + 地面 + 门窗洞口，无家具无尺寸
 *      block     600 < N ≤ 2500 组团：外墙 + 承重墙 + 地面，无门窗无文字
 *      site      N > 2500     总图：外墙轮廓 + 楼栋名 + 层数
 *
 *  纯逻辑 + 一个模块级「当前档位」做滞后；resetLod() 可复位（单测用）。
 * ========================================================================== */

export const LOD = { SITE: 'site', BLOCK: 'block', BUILDING: 'building', INTERIOR: 'interior' };

/** 由细到粗的顺序（rank 越小越粗） */
const ORDER = [LOD.SITE, LOD.BLOCK, LOD.BUILDING, LOD.INTERIOR];

/** 每档的「上边界」比例尺分母：超过它就该降到更粗的档 */
const BOUND = { [LOD.INTERIOR]: 150, [LOD.BUILDING]: 600, [LOD.BLOCK]: 2500, [LOD.SITE]: Infinity };

/** 滞后比例：回退时要多走 12% 才切回去 */
const HYST = 0.12;

/** 与 core/model/plan.js 的 PX_MM 一致（这里独立一份，避免 LOD 判定依赖那份模块） */
const PX_MM = 25.4 / 96;

/** 当前档位；null = 尚未判定，第一次调用直接采用原始档位 */
let current = null;

export const lodRank = l => ORDER.indexOf(l);           // site=0 … interior=3
export const lodAtLeast = (lod, t) => lodRank(lod) >= lodRank(t);
export const isSiteLod = lod => lod === LOD.SITE;

/** 比例尺分母：1:N */
export const ratioOf = (s, pxMm = PX_MM) => 1 / Math.max(s, 1e-9) / pxMm;

/** 不带滞后的原始档位（调试 / 单测用） */
export function rawLodOf(s, pxMm = PX_MM){
  const n = ratioOf(s, pxMm);
  if (n <= BOUND[LOD.INTERIOR]) return LOD.INTERIOR;
  if (n <= BOUND[LOD.BUILDING]) return LOD.BUILDING;
  if (n <= BOUND[LOD.BLOCK]) return LOD.BLOCK;
  return LOD.SITE;
}

/**
 * 当前该用哪一档（带滞后）。
 * 注意：有模块级状态，同一 s 重复调用结果稳定；只在 view.s 变化时调用。
 */
export function lodOf(s, pxMm = PX_MM){
  const raw = rawLodOf(s, pxMm);
  // 第一次判定（首帧 / 刚切换方案）：直接采用，避免从一个陈旧档位开始抖动
  if (current == null){ current = raw; return raw; }
  if (raw === current) return current;

  const coarser = lodRank(raw) < lodRank(current);
  // 变粗要越过「当前档上边界」；变细要退到「目标档上边界」以内
  const lim = coarser ? BOUND[current] : BOUND[raw];
  const n = ratioOf(s, pxMm);
  const beyond = coarser ? n > lim * (1 + HYST) : n < lim * (1 - HYST);
  if (beyond) current = raw;
  return current;
}

/** 复位：下次调用重新判定（切换方案 / 单测用） */
export function resetLod(){ current = null; }

/** 档位 → 需要画到什么程度（渲染层统一读这个，不要各写 if） */
export function detailOf(lod){
  return {
    rooms:  lod !== LOD.SITE,                                  // 房间地面 / 楼板
    walls:  lod !== LOD.SITE,                                  // 全部墙
    outerOnly: lod === LOD.SITE,                               // 只画外墙轮廓
    outerAndBearing: lod === LOD.SITE || lod === LOD.BLOCK,     // 外墙 + 承重墙
    openings: lodAtLeast(lod, LOD.BUILDING),                   // 门窗洞口
    roomLabels: lodAtLeast(lod, LOD.BUILDING),                 // 房间名 / 面积
    furniture: lod === LOD.INTERIOR,
    dims: lod === LOD.INTERIOR,
    editable: lod !== LOD.SITE                                 // 总图档不允许改室内
  };
}
