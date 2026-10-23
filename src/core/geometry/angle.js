/* ============================================================================
 *  角度工具：规范化 + 吸附
 *
 *  家具旋转原来只有 90° 步进（2D 的 R 键、面板按钮）。放开任意角度之后，
 *  「转到多少度」需要一个统一的吸附规则：
 *    · 优先吸附到参考方向（墙体走向及其垂直方向）——贴墙摆放时最常用；
 *    · 其次按 step（默认 15°）取整——手转时容易停在整齐的角度；
 *    · 都不在容差内则保留 1° 精度（配合 Shift 可自由旋转）。
 *
 *  纯函数，2D 面板输入、3D gizmo、MCP 都可复用。
 * ========================================================================== */
import { wallLine } from '../model/wallLine.js';

/** 归一化到 [0, 360) */
export const normDeg = d => ((Number(d) || 0) % 360 + 360) % 360;

/** 两个角度之间的最小夹角（0..180） */
export function angleDiff(a, b){
  return Math.abs(((normDeg(a) - normDeg(b) + 540) % 360) - 180);
}

/**
 * 角度吸附。
 * @param {number} deg        原始角度（度，顺时针为正）
 * @param {number[]} refs     参考方向（度）：墙体走向等；会同时尝试 +90 / +180 / +270
 * @param {{step?:number, tol?:number, free?:boolean}} [opts]
 *   step 步进角度（15）；tol 吸附容差（6°）；free=true 时不吸附，只取整到 1°
 * @returns {number} 0..359 的整数角度
 */
export function snapAngle(deg, refs = [], { step = 15, tol = 6, free = false } = {}){
  const d = normDeg(deg);
  if (free) return Math.round(d) % 360;

  let best = null, bd = tol;
  for (const r of refs){
    for (const k of [0, 90, 180, 270]){
      const cand = normDeg(r + k);
      const diff = angleDiff(d, cand);
      if (diff <= bd){ bd = diff; best = cand; }
    }
  }
  if (best != null) return Math.round(normDeg(best));

  if (step > 0){
    const cand = normDeg(Math.round(d / step) * step);
    if (angleDiff(d, cand) <= Math.min(tol, step / 2)) return Math.round(cand);
  }
  return Math.round(d) % 360;
}

/**
 * 墙体走向（度）：按中心线计算。
 *  - 正交墙仍得到 0 / 90（与旧实现一致）；
 *  - 斜墙得到真实走向，家具「贴斜墙摆放」与画墙的角度吸附都能直接用。
 * 返回归一化到 (-180, 180] 的角度，去重前不做特殊处理（调用方只当参考方向用）。
 */
export function wallAngles(walls = []){
  const out = [];
  for (const w of walls){
    const ln = wallLine(w);
    if (!ln) continue;
    const dx = ln.b.x - ln.a.x, dy = ln.b.y - ln.a.y;
    if (!dx && !dy) continue;
    out.push(Math.round(Math.atan2(dy, dx) * 180 / Math.PI) % 180);
  }
  return out;
}
