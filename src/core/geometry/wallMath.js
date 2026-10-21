import { ROOMS, inPoly, clamp } from '@/core/model/plan.js';

/* ---------------- 纯几何辅助（不依赖 store 状态） ---------------- */
export const spanIsHoriz = w => (w[2] - w[0]) >= (w[3] - w[1]);
export const horizC = (w, p) => spanIsHoriz(w) ? p.x : p.y;

/** 可开洞的墙体类型：非承重墙 / 玻璃墙面 / 矮墙 / 外墙（承重墙「黑」不可开洞）。
 *  最外圈多为外墙 'e'，因此门窗同样可以落在这一圈墙体上。 */
export const OPENABLE = new Set(['n', 'g', 'low', 'e']);
export const canOpen = w => !!w && OPENABLE.has(w[4]);
/** 该墙体类型是否可开洞（供 UI 高亮时复用同一判定，避免规则分散） */
export const isOpenableType = type => OPENABLE.has(type);

/** 在墙上取一段洞口：沿长轴以 c 为中心、长度 L，并保证不越出墙体两端 */
export function spanOnWall(w, c, L){
  const [x0, y0, x1, y1] = w;
  const horiz = (x1 - x0) >= (y1 - y0);
  const a0 = horiz ? x0 : y0, a1 = horiz ? x1 : y1;
  const len = Math.min(L, a1 - a0);
  const cc = (a1 - a0) <= len ? (a0 + a1)/2 : clamp(c, a0 + len/2, a1 - len/2);
  const s0 = Math.round(cc - len/2), s1 = Math.round(cc + len/2);
  return { rect: horiz ? [s0, y0, s1, y1] : [x0, s0, x1, s1], horiz, len, s0, s1 };
}

/** 判断墙的哪一侧是房间（门往房间里开，飘窗往房间外凸） */
export function roomSideOf(w, horiz){
  const [x0, y0, x1, y1] = w;
  const mx = (x0 + x1)/2, my = (y0 + y1)/2;
  const probe = horiz
    ? [[mx, y0 - 120, -1], [mx, y1 + 120, 1]]
    : [[x0 - 120, my, -1], [x1 + 120, my, 1]];
  for (const [px, py, sgn] of probe) if (ROOMS.some(r => inPoly(px, py, r.poly))) return sgn;
  return -1;
}

/** 计算一段墙在开洞 [s0,s1] 后残留的墙段：
 *  中间开洞 → 洞口两侧各留一段（2 段）；靠边开洞（某一侧墙段 < EDGE）→ 仅留另一侧一段，
 *  使洞口与墙端齐平。返回若干 [x0,y0,x1,y1,type] 矩形。 */
export function splitWallForOpening(w, s0, s1, horiz){
  const EDGE = 80;                              // 短于此的墙段视为「靠边」，并入洞口不保留
  const a0 = horiz ? w[0] : w[1];
  const a1 = horiz ? w[2] : w[3];
  const type = w[4];
  const pieces = [];
  const add = (c0, c1) => {
    if (c1 - c0 < EDGE) return;                 // 太短：靠边，不保留
    pieces.push(horiz
      ? [Math.round(c0), w[1], Math.round(c1), w[3], type]
      : [w[0], Math.round(c0), w[2], Math.round(c1), type]);
  };
  add(a0, s0);
  add(s1, a1);
  return pieces;
}
/**
 * 房间 / 区域边线吸附：把家具的某条边贴到房间（含区域、飘窗）的正交边线上。
 * 与 store 内的 snapEdge 同构：返回 { nx, ny, sx, sy }，只取最近的一侧。
 */
export function snapRoomEdge(cx, cy, hw, hh, tol, polys){
  let nx = cx, ny = cy, bx = tol, by = tol, sx = false, sy = false;
  for (const poly of polys){
    for (let i = 0; i < poly.length; i++){
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (Math.abs(a[1] - b[1]) < 1){                        // 水平边
        const x0 = Math.min(a[0], b[0]) - tol, x1 = Math.max(a[0], b[0]) + tol;
        if (x1 < cx - hw || x0 > cx + hw) continue;
        for (const c of [a[1] - hh, a[1] + hh])
          if (Math.abs(c - cy) < by){ by = Math.abs(c - cy); ny = c; sy = true; }
      } else if (Math.abs(a[0] - b[0]) < 1){                 // 垂直边
        const y0 = Math.min(a[1], b[1]) - tol, y1 = Math.max(a[1], b[1]) + tol;
        if (y1 < cy - hh || y0 > cy + hh) continue;
        for (const c of [a[0] - hw, a[0] + hw])
          if (Math.abs(c - cx) < bx){ bx = Math.abs(c - cx); nx = c; sx = true; }
      }
    }
  }
  return { nx, ny, sx, sy };
}
  /** 点是否落在多边形内（射线法），用于判断墙体两侧是否有房间 */
  export function pointInside(poly, x, y){
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi)*(y - yi)/(yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

/* ---------------- 长度断点吸附（画墙 / 区域绘制共用） ---------------- */
/* 断点（mm）：0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 / 4 / 5 m … */
export const LEN_STEPS = [
  100, 200, 250, 300, 400, 500, 600, 750, 800,
  1000, 1200, 1500, 1800, 2000, 2500,
  3000, 3500, 4000, 4500, 5000,
  6000, 7000, 8000, 10000, 12000, 15000
];

/**
 * 把长度吸附到最近的「整齐长度」断点。
 * 断点按当前比例尺动态取舍：屏幕上间隔不足 minPx 的小断点不参与，
 * 因此放大时更容易吸到 0.25 / 0.5 m，缩小时只吸 1 / 2 / 3 m 这类大断点。
 * @param L     长度（mm，正数）
 * @param scale 当前缩放（mm → px，即 view.s）
 * @returns 吸附后的长度；未命中任何断点时原样返回 L
 */
export function snapLenStep(L, scale, tolPx = 12, minPx = 30){
  if (L < 60) return L;
  const tol = tolPx / scale;
  let best = L, bd = tol;
  for (const s of LEN_STEPS){
    if (s * scale < minPx) continue;                 // 当前缩放下太密，跳过该断点
    const d = Math.abs(s - L);
    if (d < bd){ bd = d; best = s; }
  }
  return best;
}
