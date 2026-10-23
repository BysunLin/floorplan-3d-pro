/* ============================================================================
 *  墙体几何的统一入口：中心线 view
 *
 *  数据里墙仍然是 [x0,y0,x1,y1,类型,uid]（全项目 100+ 处按下标消费），
 *  斜墙额外在第 7 位带一个中心线负载：
 *
 *      正交墙：[x0,y0,x1,y1,'n',uid]                          ← 旧数据，逐字节不变
 *      斜  墙：[bx0,by0,bx1,by1,'n',uid,{a,b,t}]              ← 前 4 位是 AABB
 *
 *  为什么保留 AABB：命中区、视口裁剪、视锥剔除、旧代码 fallback 都只需要包围盒，
 *  真正要精度的地方（吸附 / 渲染 / 3D 摆位）才走中心线。
 *
 *  约定：**任何新代码都不要自己算墙的长边短边**，一律 wallLine(w)。
 * ========================================================================== */
import { WALL_LINE } from './uid.js';
import { basisOf, quadOf, aabbOfQuad } from '../geometry/seg.js';

export { WALL_LINE };

/**
 * 斜墙判定用「角度差」而不是「坐标差」：
 * 一条 10 m 长、端点差 2 mm 的墙显然是水平墙（0.011°），
 * 用固定 mm 阈值会把它误判成斜墙，进而丢掉正交合并 / 对齐等全部优化。
 */
export const SLANT_DEG = 0.5;

/** 退化墙的最小厚度（与 legacy.js 保持一致，避免除零） */
const MIN_T = 40;

/** 端点坐标 → 是否斜向（离两条轴都超过 SLANT_DEG） */
export function isSlantXY(ax, ay, bx, by, tolDeg = SLANT_DEG){
  const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
  if (dx < 1e-6 && dy < 1e-6) return false;
  const L = Math.hypot(dx, dy);
  return Math.min(dx, dy) / L > Math.sin(tolDeg * Math.PI / 180);
}

/** a → b 是否为斜向 */
export function isSlantAB(a, b, tolDeg = SLANT_DEG){
  return isSlantXY(a.x, a.y, b.x, b.y, tolDeg);
}

/** 该墙是否带斜墙负载 */
export const isSlantedWall = w => !!(w && w[WALL_LINE] && w[WALL_LINE].a);

/**
 * 墙 → 中心线 view。
 * @returns {{a:{x,y}, b:{x,y}, t:number, slanted:boolean}}
 */
export function wallLine(w){
  if (!w) return null;
  const seg = w[WALL_LINE];
  if (seg && seg.a){
    const t = Number(seg.t) > 0 ? seg.t : Math.max(MIN_T, Math.min(Math.abs(w[2] - w[0]), Math.abs(w[3] - w[1])));
    return {
      a: { x: seg.a[0], y: seg.a[1] },
      b: { x: seg.b[0], y: seg.b[1] },
      t,
      slanted: true
    };
  }
  // 正交墙：由矩形反推中心线（结论与 legacy.js 的 spanOf 完全一致）
  const horiz = Math.abs(w[2] - w[0]) >= Math.abs(w[3] - w[1]);
  return horiz
    ? {
        a: { x: w[0], y: (w[1] + w[3]) / 2 },
        b: { x: w[2], y: (w[1] + w[3]) / 2 },
        t: Math.max(MIN_T, Math.abs(w[3] - w[1])),
        slanted: false
      }
    : {
        a: { x: (w[0] + w[2]) / 2, y: w[1] },
        b: { x: (w[0] + w[2]) / 2, y: w[3] },
        t: Math.max(MIN_T, Math.abs(w[2] - w[0])),
        slanted: false
      };
}

/** 写入斜墙中心线负载（同时把前 4 位更新为 AABB，保证旧代码仍然可读） */
export function setWallLine(w, a, b, t){
  const [x0, y0, x1, y1] = aabbOfQuad(quadOf(a, b, t));
  w[0] = Math.round(x0); w[1] = Math.round(y0);
  w[2] = Math.round(x1); w[3] = Math.round(y1);
  w[WALL_LINE] = { a: [a.x, a.y], b: [b.x, b.y], t };
  return w;
}

/** 墙 → 四边形（2D 轮廓 / 3D 摆位 / OBB 碰撞共用） */
export function wallQuad(w){
  const ln = wallLine(w);
  return ln ? quadOf(ln.a, ln.b, ln.t) : null;
}

/** 墙轴基底（u 沿墙长、n 法向、len、deg） */
export function wallBasis(w){
  const ln = wallLine(w);
  return ln ? basisOf(ln.a, ln.b) : null;
}

/** 墙体类型字符（'b' / 'e' / 'n' / 'low' / 'g'），永远在第 5 位 */
export const wallKind = w => (w ? w[4] || 'n' : 'n');
