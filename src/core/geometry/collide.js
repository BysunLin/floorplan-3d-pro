/* ============================================================================
 *  空间校验（家具 ↔ 墙体 / 门窗 / 门扇）—— 纯函数
 *
 *  原来这套判定散在三处：
 *    · stores/plan/furniture.js：2D 拖动时的压墙 / 挡门判定与「推出来」；
 *    · workspace/view3d/engine/lifecycle.js：3D 拖动（此前完全没有校验）；
 *    · mcp/src/validate.mjs：AI 排完后的方案检查（自己又写了一份矩形重叠）。
 *
 *  这里统一成一份无依赖的实现，UI / 3D / MCP 都调它：
 *    · 输入是「家具 + 落点 + 墙体矩形 + 门对象」，不依赖 Vue / Three；
 *    · 判定与「推出来」用同一套 AABB，避免两处结果不一致。
 * ========================================================================== */

/** 家具旋转后的半宽 / 半深（AABB） */
export function furnAabb(f){
  const a = (f.rot || 0) * Math.PI / 180;
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { hw: f.w / 2 * c + f.d / 2 * s, hh: f.w / 2 * s + f.d / 2 * c };
}

/**
 * 家具放在 (cx, cy) 时是否压到任一矩形（墙体 / 门窗）。
 * 贴边不算：留 eps 容差，避免「刚好贴着墙」被误判。
 */
export function wallOverlapAt(f, cx, cy, rects = [], eps = 2){
  const { hw, hh } = furnAabb(f);
  for (const r of rects){
    if (cx - hw < r[2] - eps && cx + hw > r[0] + eps &&
        cy - hh < r[3] - eps && cy + hh > r[1] + eps) return true;
  }
  return false;
}

/** 点是否落在门扇开启的 90° 扇形内（c = 关门方向，o = 开门方向，L = 门宽） */
export function inSwing(px, py, h, c, o, L){
  const dx = px - h[0], dy = py - h[1];
  if (dx * dx + dy * dy > L * L) return false;
  return (dx * c[0] + dy * c[1]) >= 0 && (dx * o[0] + dy * o[1]) >= 0;
}

/** 门扇的开启扇形（双开门两扇对开） */
export function doorLeaves(d){
  if (!d?.dbl) return [[d.h, d.c, d.len]];
  const [rx0, ry0, rx1, ry1] = d.rect;
  const [hx, hy] = d.h;
  const hz = (rx1 - rx0) >= (ry1 - ry0);
  const h2 = hz
    ? [Math.abs(hx - rx0) <= Math.abs(hx - rx1) ? rx1 : rx0, hy]
    : [hx, Math.abs(hy - ry0) <= Math.abs(hy - ry1) ? ry1 : ry0];
  const L = Math.max(rx1 - rx0, ry1 - ry0) / 2;
  return [[d.h, d.c, L], [h2, [-d.c[0], -d.c[1]], L]];
}

/**
 * 家具落点是否挡住开门（5×5 采样覆盖家具的旋转矩形）。
 * @param {Array} doors  门对象数组（含 rect / h / c / o / len / dbl）
 * @param {(key:string)=>boolean} [gone] 判断某个门是否已拆除，key 形如 'nd0'
 */
export function swingOverlap(f, cx, cy, doors = [], gone){
  const a = (f.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const hw = f.w / 2, hd = f.d / 2;
  const pts = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++){
    const lx = -hw + f.w * i / 4, ly = -hd + f.d * j / 4;
    pts.push([cx + lx * ca - ly * sa, cy + lx * sa + ly * ca]);
  }
  for (let k = 0; k < doors.length; k++){
    const d = doors[k];
    if (!d?.h || !d?.c || !d?.o) continue;
    if (gone && gone('nd' + k)) continue;
    for (const [h, c, L] of doorLeaves(d)){
      for (const [px, py] of pts) if (inSwing(px, py, h, c, d.o, L)) return true;
    }
  }
  return false;
}

/**
 * 落点是否可用。
 * @returns {{ok:boolean, reason:''|'wall'|'door'}}
 */
export function checkPlacement(f, cx, cy, { rects = [], doors = [], gone } = {}){
  if (wallOverlapAt(f, cx, cy, rects)) return { ok: false, reason: 'wall' };
  if (swingOverlap(f, cx, cy, doors, gone)) return { ok: false, reason: 'door' };
  return { ok: true, reason: '' };
}

/**
 * 把压在墙上的家具沿穿透较浅的方向推出来，刚好贴墙。
 * 返回新落点（不改入参）；无重叠时原样返回。
 */
export function pushOutside(f, rects = [], rounds = 4){
  const out = { cx: f.cx, cy: f.cy };
  const { hw, hh } = furnAabb(f);
  for (let n = 0; n < rounds; n++){
    let moved = false;
    for (const r of rects){
      const ox = Math.min(out.cx + hw, r[2]) - Math.max(out.cx - hw, r[0]);
      const oy = Math.min(out.cy + hh, r[3]) - Math.max(out.cy - hh, r[1]);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) out.cx = out.cx < (r[0] + r[2]) / 2 ? r[0] - hw : r[2] + hw;
      else         out.cy = out.cy < (r[1] + r[3]) / 2 ? r[1] - hh : r[3] + hh;
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}
