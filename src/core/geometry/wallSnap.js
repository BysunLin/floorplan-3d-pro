/* ============================================================================
 *  画墙的「方向吸附」：参考方向 → 15° 步进（不开放自由角度）
 *
 *  正交户型时代，方向是二选一（水平 / 垂直），由一个 if 决定。放开斜墙后
 *  方向变成连续量，但**不放开**：一律落在「参考方向」或「15° 的整数倍」上。
 *  这样画出来的每一面斜墙都是干净的角度，后续贴墙摆放家具、复刻户型、
 *  门窗定位都不会出现 37.4° 这种没法对齐的角度。
 *
 *   1. 优先吸附到参考方向（全局轴 + 已有墙体走向及其垂直方向）；
 *   2. 不在参考方向容差内 → 取最近的 15° 整数倍（兜底，永不留自由角度）。
 *
 *  两个手感细节：
 *    · 容差按**屏幕像素**换算成角度：缩得很小时 1° 就是几百毫米的偏差，
 *      固定角度容差在小图上会「够不着」，在大图上会「太黏」。
 *    · 滞后（hysteresis）：进入吸附容差后，退出要用更宽的容差，
 *      否则鼠标在阈值边缘微动会让方向在两个值之间反复跳。
 *
 *  纯函数 + 一个模块级「上一次吸附结果」做滞后状态；落墙 / 取消时调
 *  resetWallSnap() 复位。
 * ========================================================================== */
import { normDeg, angleDiff } from './angle.js';

/** 像素容差 → 角度容差的上限 / 下限（度） */
const TOL_MIN = 2.5;
const TOL_MAX = 12;
/** 滞后倍数：已经吸住的方向，退出时要走到 1.6 倍容差 */
const HYST = 1.6;
/** 斜墙的固定步进（度）：不开放自由角度 */
export const WALL_STEP = 15;

let last = { deg: null, kind: '' };

/** 复位滞后状态（开始画新墙 / 取消绘制时调用） */
export function resetWallSnap(){
  last.deg = null;
  last.kind = '';
}

/** 当前是否处于吸附状态（预览用：吸住了就把角度数字高亮） */
export const wallSnapLocked = () => last.deg != null;

/**
 * 方向吸附：参考方向优先，否则落到最近的 15° 整数倍。
 * @param {number} deg        鼠标原始方向（度，x 正方向起算，y 向下）
 * @param {number[]} refs     参考方向：全局轴 0 / 90 + 已有墙体走向
 * @param {object} [opts]
 *   screenLen 起点 → 鼠标的屏幕长度（px），用于把像素容差换算成角度
 *   px        容差像素（默认 10）
 *   step      步进角度（默认 15），永远是 15 的整数倍关系
 * @returns {{deg:number, kind:'ref'|'perp'|'step'}}
 */
export function snapWallDeg(deg, refs = [], { screenLen = 0, px = 10, step = WALL_STEP } = {}){
  const d = normDeg(deg);

  // 像素容差 → 角度容差：atan(px / 屏幕长度)
  const tol = Math.min(TOL_MAX, Math.max(TOL_MIN,
    Math.atan2(px, Math.max(screenLen, 1)) * 180 / Math.PI));

  // 滞后：已经吸住的方向，退出容差放宽 —— 避免阈值边缘抖动（窗口封顶，别太黏）
  if (last.deg != null && angleDiff(d, last.deg) <= Math.min(tol * HYST, TOL_MAX))
    return { deg: last.deg, kind: last.kind || 'ref' };

  // ① 参考方向（含墙体走向及其垂直方向）
  let best = null, bd = tol, kind = 'ref';
  for (const r of refs){
    for (const k of [0, 90, 180, 270]){
      const cand = normDeg(r + k);
      const diff = angleDiff(d, cand);
      if (diff <= bd){ bd = diff; best = cand; kind = (k === 0 || k === 180) ? 'ref' : 'perp'; }
    }
  }

  // ② 15° 步进：兜底，无容差判断 —— 不允许停在自由角度上
  if (best == null){
    best = normDeg(Math.round(d / step) * step);
    kind = 'step';
  }

  last.deg = Math.round(normDeg(best));
  last.kind = kind;
  return { deg: last.deg, kind };
}

/** 给定起点与方向角，求鼠标在该方向上的投影长度（沿墙长度，mm） */
export function projectOnRay(a, p, deg){
  const rad = deg * Math.PI / 180;
  const ux = Math.cos(rad), uy = Math.sin(rad);
  return Math.max(0, (p.x - a.x) * ux + (p.y - a.y) * uy);
}

/** 方向角是否落在某个正交轴上 */
export const isAxisDeg = deg => Math.abs(((normDeg(deg) % 90) + 90) % 90) < 0.01;
export const degAxis = deg => (Math.abs(((normDeg(deg) % 180) + 180) % 180) < 0.01 ? 'h' : 'v');

/** 墙体走向列表（度）→ 吸附参考方向；调用方一般传 [0, 90, ...wallAngles(WALLS)] */
export function wallRefs(angles = []){
  return [0, 90, ...angles];
}
