import { computed } from 'vue';
import { WALLS, WINS, DOORS, SLIDES, ROOMS, clamp, wallGeom } from '@/core/model/plan.js';
import { WALL_UID, WIN_UID, WALL_LINE, baseUid } from '@/core/model/uid.js';
import { wallLine, isSlantedWall, isSlantAB } from '@/core/model/wallLine.js';
import { segDist, closestOnSeg, quadOf } from '@/core/geometry/seg.js';
import { WALL_T, WALL_ITEMS, wallItem } from '@/core/library/wallItems.js';
import { DEFAULT_WALL_MAT, WALL_MAT_IDS } from '@/core/library/wallMats.js';
import { tr } from '@/i18n.js';
import {
  spanIsHoriz, horizC, canOpen, spanOnWall, roomSideOf, splitWallForOpening,
  snapLenStep, pointInside as inPoly
} from '@/core/geometry/wallMath.js';
import { ELEM_PFX, OPEN_PFX, OPEN_KEY, WALL_TXT, WALL_EN } from './constants.js';

/** 由 stores/plan/index.js 组装：只依赖共享上下文 ctx，不直接持有全局单例 */
export function createWalls(ctx){
  const geo = ctx.geo;
  const base = geo.base;
  const state = ctx.state;
  const ui = ctx.ui;

  /* ---------- 元素身份：下标 → uid ----------
   * 下标会随开洞 / 合并 / 转墙型变化，名称与墙面材质因此改按 uid 存。 */
  function elemUidOf(k, i){
    if (k === 'wall'){
      const w = WALLS[i];
      if (!w) return '';
      return w[WALL_UID] || (i < base.walls ? baseUid('w', i) : '');
    }
    if (k === 'win'){
      const r = WINS[i];
      if (!r) return '';
      return r[WIN_UID] || (i < base.wins ? baseUid('nw', i) : '');
    }
    if (k === 'door'){
      const d = DOORS[i];
      if (!d) return '';
      return d.uid || (i < base.doors ? baseUid('nd', i) : '');
    }
    if (k === 'slide'){
      const s = SLIDES[i];
      if (!s) return '';
      return s.uid || (i < base.slides ? baseUid('ns', i) : '');
    }
    return '';
  }

  /** 元素在 state.elemNames / state.wallMats 里的键：稳定，不随下标变化 */
  function elemKey(k, i){
    return elemUidOf(k, i) || (ELEM_PFX[k] + i);
  }
  const view = ctx.view;
  const uiStore = ctx.uiStore;
  const syncUserGeom = (...a) => ctx.syncUserGeom(...a);
  const mutate = (...a) => ctx.mutate(...a);

  const ELEM_BASE = { wall: () => base.walls, win: () => base.wins, door: () => base.doors, slide: () => base.slides };
  const OPEN_BASE = { win: () => base.wins, door: () => base.doors, slide: () => base.slides };
  /* ======================= 墙面组件：画墙 / 开洞 ======================= */
  /** 当前选中的墙面组件（null = 没选，此时拆改墙体工具回到「点击拆墙」行为） */
  const activeWall = computed(() => wallItem(ui.wallItem));

  /** 命中测试：返回鼠标下的墙体下标（未命中 -1）；用户自建墙在数组尾部，优先命中 */
  function hitWall(p, tol = 14){
    const t = tol/view.s;
    let best = -1, bd = Infinity;
    for (let i = WALLS.length - 1; i >= 0; i--){
      if (state.demolished.includes('w' + i)) continue;
      const w = WALLS[i];
      let d;
      if (isSlantedWall(w)){
        // 斜墙的 AABB 明显偏大：必须按中心线距离 + 半厚，否则会「点到空气」
        const ln = wallLine(w);
        d = Math.max(0, segDist(p, ln.a, ln.b) - ln.t / 2);
      } else {
        const [x0, y0, x1, y1] = w;
        const dx = Math.max(x0 - p.x, 0, p.x - x1), dy = Math.max(y0 - p.y, 0, p.y - y1);
        d = Math.hypot(dx, dy);
      }
      if (d <= t && d < bd){ bd = d; best = i; }
    }
    return best;
  }

  /** 画墙专用吸附：10mm 网格 + 附近墙体角点（两轴都要靠近，避免吸到很远的墙） */
  function snapWallPoint(p){
    const tol = 14/view.s;
    let x = Math.round(p.x/10)*10, y = Math.round(p.y/10)*10, bd = tol;
    for (const r of snapRectsOf(state)){
      const corners = (r[WALL_LINE] && r[WALL_LINE].a)
        ? quadOf({ x: r[WALL_LINE].a[0], y: r[WALL_LINE].a[1] },
                 { x: r[WALL_LINE].b[0], y: r[WALL_LINE].b[1] }, r[WALL_LINE].t || 120)
        : [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]];
      for (const [ex, ey] of corners){
        const d = Math.hypot(ex - p.x, ey - p.y);
        if (d < bd){ bd = d; x = ex; y = ey; }
      }
    }
    return { x, y };
  }

  /**
   * 画墙终点 B 吸附：B 落在「其它墙」附近时，自动吸附到最近的墙角或墙面，
   * 便于与既有墙体对接（角接 / T 接）。
   *  · 墙角：吸附到顶点；
   *  · 墙面：垂直于墙的那一面吸附（仅当投影落在墙长范围内），保持另一轴在网格上。
   * exclude 为起点所在的墙体下标（起点沿该墙绘制时由 snapAlongHost 处理刻度，
   * 这里排除它，避免两套吸附互相打架）。
   */
  function snapWallEndpoint(b, exclude){
    const tol = 14/view.s;
    let best = { x: b.x, y: b.y }, bd = tol;
    for (let i = 0; i < WALLS.length; i++){
      if (i === exclude || state.demolished.includes('w' + i)) continue;
      const w = WALLS[i];

      // 斜墙：角接吸到两个端点，T 接吸到中心线投影（半厚已扣掉）
      if (isSlantedWall(w)){
        const ln = wallLine(w);
        for (const e of [ln.a, ln.b]){
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d < bd){ bd = d; best = { x: e.x, y: e.y }; }
        }
        const c = closestOnSeg(b, ln.a, ln.b);
        const d = Math.max(0, c.d - ln.t / 2);
        if (d < bd){ bd = d; best = { x: Math.round(c.x), y: Math.round(c.y) }; }
        continue;
      }

      const x0 = Math.min(w[0], w[2]), x1 = Math.max(w[0], w[2]);
      const y0 = Math.min(w[1], w[3]), y1 = Math.max(w[1], w[3]);
      // 墙角：吸附到顶点（角接）
      for (const [ex, ey] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]){
        const d = Math.hypot(ex - b.x, ey - b.y);
        if (d < bd){ bd = d; best = { x: ex, y: ey }; }
      }
      // 墙面：垂直于墙的那一面吸附（T 接）；仅当投影落在墙长范围内
      for (const ex of [x0, x1]){
        if (b.y >= y0 - tol && b.y <= y1 + tol){
          const d = Math.abs(ex - b.x);
          if (d < bd){ bd = d; best = { x: ex, y: Math.round(b.y/10)*10 }; }
        }
      }
      for (const ey of [y0, y1]){
        if (b.x >= x0 - tol && b.x <= x1 + tol){
          const d = Math.abs(ey - b.y);
          if (d < bd){ bd = d; best = { x: Math.round(b.x/10)*10, y: ey }; }
        }
      }
    }
    return best;
  }

  /** 项目里某类墙的主流厚度（读已有墙体，保证新墙与项目一致；读不到则回退到常量） */
  function projectWallT(type){
    const cnt = {};
    for (let i = 0; i < WALLS.length; i++){
      if (state.demolished.includes('w' + i)) continue;
      const w = WALLS[i];
      if (w[4] !== type) continue;
      // 斜墙的 AABB 两边都被放大，不能再取「短边」：厚度只能从中心线负载读
      const t = wallLine(w).t;
      if (t > 0) cnt[t] = (cnt[t] || 0) + 1;
    }
    let best = 0, n = 0;
    for (const k in cnt) if (cnt[k] > n){ n = cnt[k]; best = +k; }
    return best || WALL_T[type] || 120;
  }

  /** A → B 生成一段墙（调用方保证 B 已由 axisPoint 处理为 90° 且夹在轮廓内）
   *  t 可选：延长旧墙时传入旧墙厚度，保证新旧墙厚度连续
   *
   *  · 与已有「同一条墙线」的墙体有长轴重叠时：
   *      同类 → 已是对应墙型，提示「无需绘制」；
   *      异类 → 绘制区域改为所选类型（其余部分按原类型拆分保留）。
   *  · 无重叠时沿用旧逻辑：与「同向、共线且首尾相接」的同类型墙段合并（延长已有墙）。 */
  function addWall(a, b, type, t){
    const thick = t || projectWallT(type);
    const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    if (len < 100) return uiStore.showToast(tr('墙体太短，已忽略', 'Wall is too short — ignored'));

    /* 斜墙：既有「同线重叠 / 同线合并」全部建立在轴对齐矩形上，直接套用会误判
     * （AABB 相交不代表墙线相交）。P1 阶段先按「独立墙体」落库，
     * 合并 / 转换 / 覆盖留到后续阶段按中心线重写。 */
    if (isSlantAB(a, b)){
      const r = wallGeom(a, b, thick, type);
      mutate(() => { state.walls.push(r); });
      syncUserGeom();
      uiStore.showToast(tr(`已添加斜墙 ${len} mm`, `Added a ${len} mm angled wall`));
      return;
    }

    const r = wallGeom(a, b, thick, type);
    const hit = sameLineOverlaps(r, type);

    // 在同类墙内绘制（含从墙端向内覆盖）→ 已是对应墙型，无需绘制
    if (hit.same.length){
      const nm = (WALL_TXT[type] || WALL_TXT.n)();
      return uiStore.showToast(tr(`已是${nm}，无需绘制`, `Already a ${WALL_EN[type] || 'wall'} — no need to draw`));
    }

    // 在异类墙内绘制 → 绘制区域改为所选类型，非绘制区域按原类型拆分保留
    if (hit.other.length){
      const EDGE = 80;
      const pieces = [];
      for (const o of hit.other){
        const o0 = Math.max(o.a0, hit.a0), o1 = Math.min(o.a1, hit.a1);
        const keep = (p0, p1) => {
          if (p1 - p0 < EDGE) return;
          pieces.push(hit.horiz
            ? [Math.round(p0), o.w[1], Math.round(p1), o.w[3], o.w[4]]
            : [o.w[0], Math.round(p0), o.w[2], Math.round(p1), o.w[4]]);
        };
        keep(o.a0, o0);
        keep(o1, o.a1);
      }
      const m = wallSpanMerge(r, type);               // 与相邻同类型墙段合并（覆盖全墙时等价于「转换」）
      // 改成所选类型的这段墙继承原墙身份（名称 / 材质不丢）
      const inherited = elemUidOf('wall', hit.other[0]?.i ?? m.absorbed[0] ?? -1);
      mutate(() => {
        removeWallsOnly([...hit.other.map(o => o.i), ...m.absorbed]);
        for (const p of pieces) state.walls.push(p);  // 非绘制区域拆分保留
        const w = [...m.rect, type];                  // 绘制区域改为所选类型
        if (inherited) w[WALL_UID] = inherited;
        state.walls.push(w);
      });
      syncUserGeom();
      const nm = (WALL_TXT[type] || WALL_TXT.n)();
      return uiStore.showToast(tr(`绘制区域已改为${nm}`, `Drawn area changed to a ${WALL_EN[type] || 'wall'}`));
    }

    mutate(() => {
      const m = wallSpanMerge(r, type);
      if (m.absorbed.length){
        const inherited = elemUidOf('wall', m.absorbed[0]);
        removeWallsOnly(m.absorbed);          // 吸收被延长的旧墙段，并入新墙
        const w = [...m.rect, type];
        if (inherited) w[WALL_UID] = inherited;
        state.walls.push(w);
      } else {
        state.walls.push(r);
      }
    });
    syncUserGeom();
    uiStore.showToast(type === 'b'
      ? tr(`已添加承重墙 ${len} mm`, `Added a ${len} mm bearing wall`)
      : type === 'g'
        ? tr(`已添加玻璃墙面 ${len} mm`, `Added a ${len} mm glass wall`)
        : tr(`已添加非承重墙 ${len} mm`, `Added a ${len} mm partition wall`));
  }

  /**
   * 起点命中的墙体（未拆除，含承重 / 非承重 / 外墙 / 矮墙）。
   * 命中则返回归一化矩形、走向、类型与厚度，供「吸附到墙面 + 垂直绘制 / 延长」使用。
   * 容差按屏幕像素折算，便于判定「点击是否落在墙体上」。
   */
  function wallUnderPoint(p, tolPx = 12){
    const tol = tolPx / view.s;
    let best = null, bd = Infinity;
    for (let i = WALLS.length - 1; i >= 0; i--){
      if (state.demolished.includes('w' + i)) continue;
      const w = WALLS[i];
      const x0 = Math.min(w[0], w[2]), x1 = Math.max(w[0], w[2]);
      const y0 = Math.min(w[1], w[3]), y1 = Math.max(w[1], w[3]);

      if (isSlantedWall(w)){
        const ln = wallLine(w);
        const d = Math.max(0, segDist(p, ln.a, ln.b) - ln.t / 2);
        if (d > tol || d >= bd) continue;
        bd = d;
        best = { i, x0, x1, y0, y1, horiz: false, slanted: true, type: w[4], t: ln.t };
        continue;
      }

      const dx = Math.max(x0 - p.x, 0, p.x - x1), dy = Math.max(y0 - p.y, 0, p.y - y1);
      const d = Math.hypot(dx, dy);
      if (d > tol || d >= bd) continue;
      bd = d;
      const horiz = (x1 - x0) >= (y1 - y0);
      best = { i, x0, x1, y0, y1, horiz, type: w[4], t: horiz ? (y1 - y0) : (x1 - x0) };
    }
    return best;
  }

  /** 起点距墙端在此「屏幕像素」范围内时，视为落在墙的「边缘」（随缩放自适应，易于吸附到端面） */
  const EDGE_PX = 24;

  /** 沿墙方向的吸附刻度：0 / 25% / 33% / 50% / 67% / 75% / 100%
   *  其中 33% / 67% 为新增断点：起点 / 终点落在长边该比例附近时自动吸附。 */
  const ALONG_RATIOS = [0, .25, .33, .5, .67, .75, 1];

  /** 把沿墙坐标吸附到最近的刻度比例点（容差按屏幕像素换算；不夹取，由调用方按场景夹取） */
  function snapRatioBetween(a0, a1, c, tolPx = 10){
    const L = a1 - a0;
    if (L <= 0) return c;
    const tol = tolPx / view.s;
    let best = c, bd = tol;
    for (const r of ALONG_RATIOS){
      const t = a0 + L * r;
      const d = Math.abs(t - c);
      if (d <= bd){ bd = d; best = t; }
    }
    return Math.round(best);
  }

  /** 墙体数组 → 沿墙坐标的刻度吸附（开洞 / 预览用；随后由 spanOnWall 夹在墙内） */
  function snapAlongWall(w, c, tolPx = 10){
    const horiz = spanIsHoriz(w);
    const a0 = horiz ? Math.min(w[0], w[2]) : Math.min(w[1], w[3]);
    const a1 = horiz ? Math.max(w[0], w[2]) : Math.max(w[1], w[3]);
    return snapRatioBetween(a0, a1, c, tolPx);
  }

  /**
   * 画墙终点 B：沿墙绘制时把 B 的沿墙坐标吸附到刻度，并限制在墙体长度内。
   * · 起点在墙端时允许向「墙外」延长（保留原有延长能力）；
   * · 起点在墙内时不允许超出该墙的长度。
   */
  function snapAlongHost(wall, a, b, tolPx = 10){
    const horiz = wall.horiz;
    const a0 = horiz ? wall.x0 : wall.y0;
    const a1 = horiz ? wall.x1 : wall.y1;
    const ac = horiz ? a.x : a.y;
    const bc = horiz ? b.x : b.y;
    // 仅在墙体范围内吸附刻度；墙外（向外延长）保持原值
    let v = (bc >= a0 && bc <= a1) ? snapRatioBetween(a0, a1, bc, tolPx) : bc;
    const EPS = 12;                                             // 容得下 10mm 取整误差
    if (Math.abs(ac - a0) <= EPS)      v = Math.min(v, a1);     // 从低端向外延长，不越过高端
    else if (Math.abs(ac - a1) <= EPS) v = Math.max(v, a0);     // 从高端向外延长，不越过低端
    else                               v = clamp(v, a0, a1);     // 墙内绘制：不超出墙体长度
    return horiz ? { ...b, x: v } : { ...b, y: v };
  }

  /** 点是否落在房子内部（任一室内房间 / 区域轮廓内；入户走廊等 outdoor 区域不算）。
   *  画墙起点据此动态判定：房子内部必须从墙上起笔，户外区域则不限。 */
  function pointInHouse(p){
    for (const r of ROOMS){
      if (r.outdoor) continue;                       // 入户走廊 / 庭院等户外区域
      if (r.poly && inPoly(r.poly, p.x, p.y)) return true;
    }
    return false;
  }

  /**
   * 画墙长度断点吸附：把 A→B 的长度吸附到最近的「整齐长度」。
   * 断点表与动态取舍规则见 wallMath.js 的 snapLenStep（画墙 / 区域绘制共用）。
   */
  function snapWallLength(a, b, tolPx = 12){
    // 沿 a→b 的方向做长度吸附：正交时等价于旧的「只动一个轴」，斜墙时沿真实墙轴缩放
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 60) return b;
    const best = snapLenStep(L, view.s, tolPx);
    if (best === L) return b;
    const k = best / L;
    return { ...b, x: Math.round(a.x + dx * k), y: Math.round(a.y + dy * k) };
  }

  /** 画墙「墙线对齐」的吸附容差（屏幕像素） */
  const ALIGN_PX = 8;

  /**
   * 画墙墙线对齐：把新墙在固定轴上的坐标（水平墙的 y / 竖直墙的 x）
   * 吸附到附近墙体的边线（面）或中线，并给出显示用的虚线辅助线。
   *
   * 例：在走廊里画隔墙，墙线自动落到对面墙的内皮 / 中线上；
   * 画的时候能看到一条从旧墙延伸过来的虚线，不用先画歪再回头量。
   *
   * @param {{x:number,y:number}} a 起点
   * @param {{x:number,y:number}} b 终点（已按 90° 正交）
   * @param {number} hostIdx 起点所吸附的墙体下标（沿它延长时不做其它对齐）
   * @returns {{a,b,guides:Array,snapped?:boolean}}
   */
  function alignWallDraw(a, b, hostIdx = -1){
    if (!a || !b) return { a, b, guides: [] };
    // 斜墙不做墙线对齐：对齐的语义是「把某个轴坐标拉到旧墙边线 / 中线」，
    // 会直接把任意角度掰回正交。正交墙（angle 吸附已保证严格 0/90）仍照旧走。
    if (isSlantAB(a, b)) return { a, b, guides: [] };
    const horiz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);

    // 沿起点所在的墙继续延长：保持共线，避免被别的墙拉歪
    const host = WALLS[hostIdx];
    if (host){
      const hx = Math.abs(host[2] - host[0]), hy = Math.abs(host[3] - host[1]);
      if ((hx >= hy) === horiz) return { a, b, guides: [] };
    }

    const tol = ALIGN_PX / view.s;
    const cur = horiz ? a.y : a.x;
    let best = null, bd = tol;

    for (let i = 0; i < WALLS.length; i++){
      if (i === hostIdx || state.demolished.includes('w' + i)) continue;
      const w = WALLS[i];
      // 斜墙的 AABB 边线不是墙的边线，不能作为对齐参考
      if (isSlantedWall(w)) continue;
      const x0 = Math.min(w[0], w[2]), x1 = Math.max(w[0], w[2]);
      const y0 = Math.min(w[1], w[3]), y1 = Math.max(w[1], w[3]);
      const wHoriz = (x1 - x0) >= (y1 - y0);

      /* 参考线：同向墙取两条边 + 中线；垂直墙取两端（用于 T 接对齐） */
      const lines = [];
      if (horiz){
        if (wHoriz){
          lines.push([y0, x0, x1, false], [y1, x0, x1, false], [(y0 + y1) / 2, x0, x1, true]);
        } else {
          lines.push([y0, x0, x1, false], [y1, x0, x1, false]);
        }
      } else {
        if (!wHoriz){
          lines.push([x0, y0, y1, false], [x1, y0, y1, false], [(x0 + x1) / 2, y0, y1, true]);
        } else {
          lines.push([x0, y0, y1, false], [x1, y0, y1, false]);
        }
      }

      for (const [at, s0, s1, isCenter] of lines){
        const d = Math.abs(at - cur);
        if (d > bd + .01) continue;
        // 等距时优先「面」：贴墙比对齐中线更常用
        if (best && Math.abs(d - bd) < .01 && isCenter && !best.isCenter) continue;
        bd = d;
        best = { at, s0, s1, isCenter };
      }
    }

    if (!best) return { a, b, guides: [] };

    // 起终点直接落到同一条参考线上：既完成吸附，也保证墙仍严格正交
    const na = horiz ? { ...a, y: best.at } : { ...a, x: best.at };
    const nb = horiz ? { ...b, y: best.at } : { ...b, x: best.at };

    // 辅助线：从参考墙段一直延伸到新墙两端（视觉上就是「旧墙边缘被延长」）
    const lo = Math.min(best.s0, horiz ? na.x : na.y, horiz ? nb.x : nb.y);
    const hi = Math.max(best.s1, horiz ? na.x : na.y, horiz ? nb.x : nb.y);
    const guides = [horiz
      ? { x1: lo, y1: best.at, x2: hi, y2: best.at }
      : { x1: best.at, y1: lo, x2: best.at, y2: hi }];

    return { a: na, b: nb, guides, snapped: true };
  }

  /**
   * 起点吸附（画墙）：raw = 当前起点，m = 参考点（鼠标 / 终点），t = 新墙厚度。
   * 返回 { a, axis }：a 为新墙中心线起点，axis 为强制正交方向（'h' / 'v'）。
   *
   *  · 鼠标在墙「中段」：直接落在离鼠标更近的一侧长边上（沿墙轴取鼠标投影），axis 垂直于墙。
   *  · 鼠标在墙端「边缘区」（距端 ≤ EDGE_PX 像素，且不超过墙长 45%）——以该**端面中心**为顶点，
   *    看鼠标方向与墙轴的夹角（等价比较沿轴分量 / 厚度分量，即 45° 分界）：
   *      - 在墙轴 ±45° 内 → 落点在**短边中心**，按「延长已有墙」处理（同轴 + 厚度中心对齐）；
   *      - 超出 ±45°（偏垂直）→ 落点在距端面**半个新墙厚**的长边上（本项目 240 墙厚 → 120mm），
   *        使 90° 新墙外侧表面与旧墙端面齐平。
   * 边缘容差额外保证不小于半个新墙厚，因此落点后再判定仍稳定收敛。
   */
  function resolveWallStart(wall, raw, m, t){
    const g = v => Math.round(v/10)*10;

    // 斜墙作宿主：端面对齐 / 垂直分叉的正交公式不适用，起点直接取中心线上的投影点
    if (wall?.slanted){
      const ln = wallLine(WALLS[wall.i]);
      const c = closestOnSeg(raw, ln.a, ln.b);
      return { a: { x: g(c.x), y: g(c.y) }, axis: null };
    }

    const { x0, x1, y0, y1 } = wall;
    const mid = wall.horiz ? (y0 + y1)/2 : (x0 + x1)/2;

    // 边缘区：屏幕上 EDGE_PX 像素（随缩放自适应），不小于半个新墙厚，并按墙长封顶
    const len = wall.horiz ? (x1 - x0) : (y1 - y0);
    const halfT = (t || wall.t) / 2;
    const edgeTol = Math.min(Math.max(EDGE_PX / view.s, halfT + 2), len * .45);
    const dLo = wall.horiz ? Math.abs(raw.x - x0) : Math.abs(raw.y - y0);
    const dHi = wall.horiz ? Math.abs(raw.x - x1) : Math.abs(raw.y - y1);
    const edge = Math.min(dLo, dHi) <= edgeTol ? (dLo <= dHi ? 'lo' : 'hi') : null;

    // 离鼠标更近的一侧长边
    const nearThick = wall.horiz
      ? (Math.abs(m.y - y0) <= Math.abs(m.y - y1) ? y0 : y1)
      : (Math.abs(m.x - x0) <= Math.abs(m.x - x1) ? x0 : x1);

    if (edge){
      const atEnd = edge === 'lo' ? (wall.horiz ? x0 : y0) : (wall.horiz ? x1 : y1);
      // 以「短边中心」为顶点：鼠标方向在墙轴 ±45° 内 → 延长；超出 → 90° 垂直
      const alongAxis = wall.horiz ? Math.abs(m.x - atEnd) : Math.abs(m.y - atEnd);
      const alongThick = wall.horiz ? Math.abs(m.y - mid) : Math.abs(m.x - mid);
      if (alongAxis >= alongThick){                 // 延长已有墙：落在短边中心（同轴 + 厚度中心）
        return wall.horiz
          ? { a: { x: g(atEnd), y: g(mid) }, axis: 'h' }
          : { a: { x: g(mid), y: g(atEnd) }, axis: 'v' };
      }
      // 90° 垂直：落在距端面半个新墙厚的长边上，使新墙外侧表面与端面齐平
      const ax = edge === 'hi' ? atEnd - halfT : atEnd + halfT;
      return wall.horiz
        ? { a: { x: g(ax), y: g(nearThick) }, axis: 'v' }
        : { a: { x: g(nearThick), y: g(ax) }, axis: 'h' };
    }

    // 墙中段：起点沿墙坐标吸附到 25% / 50% / 75% 等刻度，并按拖动方向区分
    //  · 沿墙拖动（沿轴分量更大）→ 对齐墙中线，用于把覆盖区域改为所选墙型；
    //  · 垂直拖动 → 落在离鼠标更近的一侧长边上，垂直分叉。
    const axIn = clamp(snapRatioBetween(x0, x1, raw.x), x0, x1);
    const ayIn = clamp(snapRatioBetween(y0, y1, raw.y), y0, y1);
    const alongMid  = wall.horiz ? Math.abs(m.x - raw.x) : Math.abs(m.y - raw.y);
    const acrossMid = wall.horiz ? Math.abs(m.y - mid)   : Math.abs(m.x - mid);
    if (alongMid > acrossMid){
      return wall.horiz
        ? { a: { x: g(axIn), y: g(mid) }, axis: 'h' }
        : { a: { x: g(mid), y: g(ayIn) }, axis: 'v' };
    }
    return wall.horiz
      ? { a: { x: g(axIn), y: g(nearThick) }, axis: 'v' }
      : { a: { x: g(nearThick), y: g(ayIn) }, axis: 'h' };
  }

  /** 用若干墙段替换原墙：基础墙标记拆除并追加为「用户墙」；用户墙就地替换。
   *  切出来的各段继承原墙的 uid —— 名称 / 材质跟着整面墙走，不会只剩一半。 */
  function replaceWall(wi, pieces){
    const uid = elemUidOf('wall', wi);
    const out = pieces.map(p => {
      const a = p.slice(0, 5);
      if (uid) a[WALL_UID] = uid;
      return a;
    });
    if (wi < base.walls){
      if (!state.demolished.includes('w' + wi)) state.demolished.push('w' + wi);
      state.walls.push(...out);
    } else {
      state.walls.splice(wi - base.walls, 1, ...out);
    }
  }

  /** 在指定墙上开洞：门 / 入户门 / 推拉门 / 窗 / 飘窗（非承重墙、矮墙、外墙均可，承重墙不可）。
   *  开洞时会把该段墙按洞口裁剪成独立墙段（中部 → 2 段，靠边 → 1 段）。 */
  function addOpening(kind, wi, p){
    const w = WALLS[wi];
    if (!w) return;
    if (!canOpen(w))
      return uiStore.showToast(tr('门窗只能加在非承重墙或外墙上（承重墙不可开洞）',
        'Doors and windows can only be placed on partition or exterior walls (not on bearing walls)'));

    const it = WALL_ITEMS.find(i => i.sub === kind);
    const L = it?.len || 800;
    const [x0, y0, x1, y1] = w;
    const { rect, horiz, len, s0, s1 } = spanOnWall(w, snapAlongWall(w, horizC(w, p)), L);
    const side = roomSideOf(w, horiz);          // -1 小坐标侧 / +1 大坐标侧

    // 洞口两侧的墙体裁剪成独立墙段（中部 → 2 段；靠边 → 1 段）
    const pieces = splitWallForOpening(w, s0, s1, horiz);

    mutate(() => {
      replaceWall(wi, pieces);                   // 先按洞口裁墙
      if (kind === 'win'){
        state.wins.push(rect);
      } else if (kind === 'slide'){
        state.slides.push({ rect, v: !horiz });
      } else if (kind === 'door' || kind === 'entry' || kind === 'double'){
        // h = 铰点（洞口靠房间那一面的端点），c = 沿墙的关门方向，o = 开门方向（朝房间）
        // 双开门：两扇对开，h 只要记住「入口端 + 房间侧那一面」，另一扇由渲染端按洞口另一端对称得出
        const c = horiz ? [1, 0] : [0, 1];
        const o = horiz ? [0, side] : [side, 0];
        const h = horiz ? [s0, side < 0 ? y0 : y1] : [side < 0 ? x0 : x1, s0];
        const name = kind === 'entry' ? '入户门' : kind === 'double' ? '双开门' : '房门';
        state.doors.push({ name, rect, h, c, o, len, entry: kind === 'entry', dbl: kind === 'double' });
      } else if (kind === 'bay'){
        const D = 760, T = 100;                  // 凸出深度 / 窗台厚
        const out = -side;                       // 往房间的反方向凸出
        let poly;
        if (horiz) poly = out < 0
          ? [[s0, y0 - D], [s1, y0 - D], [s1, y0], [s0, y0]]
          : [[s0, y1], [s1, y1], [s1, y1 + D], [s0, y1 + D]];
        else poly = out < 0
          ? [[x0 - D, s0], [x0, s0], [x0, s1], [x0 - D, s1]]
          : [[x1, s0], [x1 + D, s0], [x1 + D, s1], [x1, s1]];
        const bay = { id: 'bay' + Date.now().toString(36), name: '飘窗', poly, mat: 'marble', counted: false };
        state.bays.push(bay);
        state.rooms[bay.id] = { name: '飘窗', mat: 'marble' };
        // 三面窗：凸窗的两个侧面 + 外侧面
        const wins = horiz
          ? (out < 0
            ? [[s0, y0 - D, s0 + T, y0], [s1 - T, y0 - D, s1, y0], [s0, y0 - D, s1, y0 - D + T]]
            : [[s0, y1, s0 + T, y1 + D], [s1 - T, y1, s1, y1 + D], [s0, y1 + D - T, s1, y1 + D]])
          : (out < 0
            ? [[x0 - D, s0, x0, s0 + T], [x0 - D, s1 - T, x0, s1], [x0 - D, s0, x0 - D + T, s1]]
            : [[x1, s0, x1 + D, s0 + T], [x1, s1 - T, x1 + D, s1], [x1 + D - T, s0, x1 + D, s1]]);
        wins.forEach(r => state.wins.push(r));
      }
    });
    syncUserGeom();

    if (kind === 'win')   return uiStore.showToast(tr(`已加窗 ${len} mm`, `Added a ${len} mm window`));
    if (kind === 'slide') return uiStore.showToast(tr(`已加推拉门 ${len} mm`, `Added a ${len} mm sliding door`));
    if (kind === 'door' || kind === 'entry' || kind === 'double'){
      const nm = kind === 'entry' ? tr('入户门', 'entry door') : kind === 'double' ? tr('双开门', 'double door') : tr('房门', 'door');
      return uiStore.showToast(tr(`已加${nm} ${len} mm`, `Added a ${len} mm ${nm}`));
    }
    if (kind === 'bay')   return uiStore.showToast(tr(`已加飘窗 ${len} mm`, `Added a ${len} mm bay window`));
  }

  /**
   * 门的朝向反转：把门的开启方向（o）180° 翻转，并让铰点（h）移到墙的另一面，
   * 使门从「朝房间开」变为「朝外开」（或反之）。单开 / 双开 / 入户门均适用。
   * 基础墙自带门会先转成用户元素，改动可进撤销栈。
   */
  function reverseDoor(i){
    let j = i;
    mutate(() => {
      j = ensureUserElem('door', i);          // 户型自带的门先转成用户元素
      syncUserGeom();                         // 刷新 DOORS 后再按新下标读门
      const d = DOORS[j];
      if (!d) return;
      const [rx0, ry0, rx1, ry1] = d.rect;
      const horiz = (rx1 - rx0) >= (ry1 - ry0);
      const side = horiz ? d.o[1] : d.o[0];   // 当前开门方向所朝的墙侧（即房间侧）
      // 翻转开启方向，并让铰点落到墙的另一面（朝外）
      if (horiz){ d.h = [d.h[0], -side < 0 ? ry0 : ry1]; d.o = [0, -side]; }
      else      { d.h = [-side < 0 ? rx0 : rx1, d.h[1]]; d.o = [-side, 0]; }
    });
    syncUserGeom();
    uiStore.showToast(tr('已反转门朝向', 'Door facing reversed'));
  }

  /* ======================= 拆改墙体：选中 / 删除 / 属性 =======================
   * 点击墙体 / 门窗即直接选中，删除由底部菜单栏或属性面板的「删除」触发：
   * 用户新增的元素直接删除，户型自带的用「标记拆除」（state.demolished）表示。
   * 门窗的拆除标记沿用 state.demolished，前缀与墙体 'w' 区分开。
   */

  /** 元素的矩形 [x0,y0,x1,y1]（墙体只取前 4 位） */
  function elemRect(k, i){
    if (k === 'wall'){ const w = WALLS[i]; return w ? [w[0], w[1], w[2], w[3]] : null; }
    if (k === 'win')   return WINS[i] || null;
    if (k === 'door')  return DOORS[i]?.rect || null;
    if (k === 'slide') return SLIDES[i]?.rect || null;
    return null;
  }

  /** 元素尺寸：宽 = 长轴长度，深 = 墙厚 */
  function elemSize(k, i){
    const r = elemRect(k, i);
    if (!r) return null;
    const dx = Math.abs(r[2] - r[0]), dy = Math.abs(r[3] - r[1]);
    return { w: Math.round(Math.max(dx, dy)), d: Math.round(Math.min(dx, dy)), horiz: dx >= dy };
  }

  /** 元素名称：优先用自定义名，否则按类型给默认名 */
  function elemName(k, i){
    const custom = state.elemNames[elemKey(k, i)] ?? state.elemNames[ELEM_PFX[k] + i];
    if (custom) return custom;
    if (k === 'wall') return (WALL_TXT[WALLS[i]?.[4]] || WALL_TXT.n)();
    if (k === 'door')  return DOORS[i]?.name || tr('房门', 'Door');
    if (k === 'slide') return tr('推拉门', 'Sliding door');
    return tr('窗户', 'Window');
  }

  /** 改名称（走撤销栈）；名称即元素在 state.elemNames 里的键 */
  function setElemName(key, v){
    mutate(() => {
      if (v) state.elemNames[key] = v;
      else delete state.elemNames[key];
    });
  }

  /* ---------------- 墙面材质（仅非承重墙）：{'u12':'glass'} ----------------
   * 键 = 元素 uid（旧存档的 'w3' 仍可读，syncUserGeom 会搬到 uid 键）。 */

  const wallMatKey = i => elemKey('wall', i);

  /** 某段墙的材质 id（未设置 / 无效 → 默认材质） */
  function wallMatId(i){
    const id = state.wallMats?.[wallMatKey(i)] ?? state.wallMats?.['w' + i];
    return WALL_MAT_IDS.includes(id) ? id : DEFAULT_WALL_MAT;
  }

  /** 改墙面材质（走撤销栈）；玻璃材质在 2D / 3D 都按玻璃墙渲染 */
  function setWallMat(i, id){
    mutate(() => {
      if (!state.wallMats) state.wallMats = {};
      const k = wallMatKey(i);
      delete state.wallMats['w' + i];          // 顺手清掉旧存档的按下标键
      if (!id || id === DEFAULT_WALL_MAT) delete state.wallMats[k];
      else state.wallMats[k] = id;
    });
  }

  /** 把户型自带的元素转成「用户元素」（标记原元素拆除 + 追加副本），返回新下标 */
  function ensureUserElem(k, i){
    if (i >= ELEM_BASE[k]()) return i;
    const id = ELEM_PFX[k] + i;
    if (!state.demolished.includes(id)) state.demolished.push(id);
    // 副本继承原元素的 uid：名称 / 墙面材质自动跟着走，不需要按下标搬
    if (k === 'wall'){
      const copy = WALLS[i].slice();
      if (!copy[WALL_UID]) copy[WALL_UID] = baseUid('w', i);
      state.walls.push(copy);
      return base.walls + state.walls.length - 1;
    }
    if (k === 'win'){
      const copy = WINS[i].slice();
      if (!copy[WIN_UID]) copy[WIN_UID] = baseUid('nw', i);
      state.wins.push(copy);
      return base.wins + state.wins.length - 1;
    }
    if (k === 'door'){
      const src = DOORS[i];
      state.doors.push({ ...src, rect: src.rect.slice(), uid: src.uid || baseUid('nd', i) });
      return base.doors + state.doors.length - 1;
    }
    if (k === 'slide'){
      const src = SLIDES[i];
      state.slides.push({ ...src, rect: src.rect.slice(), uid: src.uid || baseUid('ns', i) });
      return base.slides + state.slides.length - 1;
    }
    return i;
  }

  /** 写入元素矩形（下标为 WALLS / WINS / … 的绝对下标） */
  function writeElemRect(k, j, nr){
    if (k === 'wall'){ const w = state.walls[j - base.walls]; if (w){ w[0] = nr[0]; w[1] = nr[1]; w[2] = nr[2]; w[3] = nr[3]; } }
    else if (k === 'win'){
      const u = j - base.wins;
      const old = state.wins[u];
      if (old) state.wins[u] = old[WIN_UID] ? [...nr, old[WIN_UID]] : [...nr];
    }
    else if (k === 'door'){ const d = state.doors[j - base.doors]; if (d){ d.rect = nr; d.len = Math.max(nr[2] - nr[0], nr[3] - nr[1]); } }
    else if (k === 'slide'){ const s = state.slides[j - base.slides]; if (s) s.rect = nr; }
  }

  /** 改尺寸（走撤销栈）：长轴改长度、短轴按中线改厚度。返回元素的新下标 */
  function setElemSize(k, i, W, D){
    let j = i;
    mutate(() => {
      j = ensureUserElem(k, i);          // 户型自带的先转成用户元素，改动才能进撤销栈
      syncUserGeom();                    // 刷新 WALLS 后再按新下标读矩形
      const r = elemRect(k, j);
      if (!r) return;
      const horiz = Math.abs(r[2] - r[0]) >= Math.abs(r[3] - r[1]);
      const cx = (r[0] + r[2])/2, cy = (r[1] + r[3])/2;
      const nw = Math.max(50, Math.round(W)), nd = Math.max(20, Math.round(D));
      writeElemRect(k, j, horiz
        ? [Math.round(r[0]), Math.round(cy - nd/2), Math.round(r[0] + nw), Math.round(cy + nd/2)]
        : [Math.round(cx - nd/2), Math.round(r[1]), Math.round(cx + nd/2), Math.round(r[1] + nw)]);
    });
    syncUserGeom();
    return j;
  }

  /** 门窗放置预览：鼠标落在可开洞的墙（非承重墙 / 矮墙 / 外墙）上时，返回与元素等大的洞口矩形 */
  function openingPreviewAt(wi, p, L){
    const w = WALLS[wi];
    if (!canOpen(w)) return null;
    const { rect, horiz, len } = spanOnWall(w, snapAlongWall(w, horizC(w, p)), L || 800);
    return { rect, horiz, len };
  }

  /* ---------------- 墙段合并 ---------------- */
  /** 只做 state 改动：删掉若干墙（户型自带→标记拆除，用户新增→真删）。调用方负责 mutate */
  function removeWallsOnly(idxs){
    const uniq = [...new Set(idxs)].sort((a, b) => b - a);      // 降序，避免索引漂移
    for (const i of uniq){
      if (i < base.walls){
        if (!state.demolished.includes('w' + i)) state.demolished.push('w' + i);
      } else {
        const u = i - base.walls;
        if (u >= 0 && u < state.walls.length) state.walls.splice(u, 1);
      }
    }
  }

  /** 只做 state 改动：删掉一个门窗洞口 */
  function removeOpeningOnly(k, i){
    if (k === 'wall') return;
    const bc = OPEN_BASE[k](), key = OPEN_KEY[k], pfx = OPEN_PFX[k];
    if (i < bc){
      if (!state.demolished.includes(pfx + i)) state.demolished.push(pfx + i);
    } else {
      const u = i - bc;
      if (u >= 0 && u < state[key].length) state[key].splice(u, 1);
    }
  }

  /**
   * 把一段矩形与「同向、共线且首尾相接」的同类型墙段合并成一个矩形。
   * 返回合并后的矩形与被吸收的墙下标。
   */
  function wallSpanMerge(rect, type){
    let [x0, y0, x1, y1] = rect;
    const horiz = (x1 - x0) >= (y1 - y0);
    const TOL = 2, BAND = 12, absorbed = [], skip = new Set();
    let changed = true;
    while (changed){
      changed = false;
      for (let i = 0; i < WALLS.length; i++){
        if (skip.has(i) || state.demolished.includes('w' + i)) continue;
        const w = WALLS[i];
        if (w[4] !== type) continue;
        const wx0 = Math.min(w[0], w[2]), wx1 = Math.max(w[0], w[2]);
        const wy0 = Math.min(w[1], w[3]), wy1 = Math.max(w[1], w[3]);
        const wHoriz = (wx1 - wx0) >= (wy1 - wy0);
        /* 同一条墙线：要么横截面与本次矩形完全对齐（同一段墙被裁开的碎片，
           碎片可能比墙厚还短，不能只靠 dx>=dy 判方向），要么同向且截面有重叠 */
        const sameLine = horiz
          ? (Math.abs(wy0 - y0) <= BAND && Math.abs(wy1 - y1) <= BAND)
            || (wHoriz && Math.min(wy1, y1) - Math.max(wy0, y0) > TOL)
          : (Math.abs(wx0 - x0) <= BAND && Math.abs(wx1 - x1) <= BAND)
            || (!wHoriz && Math.min(wx1, x1) - Math.max(wx0, x0) > TOL);
        if (!sameLine) continue;
        const touch = horiz
          ? Math.abs(wx1 - x0) <= TOL || Math.abs(wx0 - x1) <= TOL
          : Math.abs(wy1 - y0) <= TOL || Math.abs(wy0 - y1) <= TOL;
        if (!touch) continue;
        x0 = Math.min(x0, wx0); x1 = Math.max(x1, wx1);
        y0 = Math.min(y0, wy0); y1 = Math.max(y1, wy1);
        absorbed.push(i); skip.add(i); changed = true;
        break;
      }
    }
    return { rect: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)], absorbed };
  }

  /**
   * 找出与矩形 r「同向、共线」且在长轴上有重叠的墙体。
   * 返回 { same, other, horiz, a0, a1 }：
   *   same  同类型墙体（绘制同类型墙 → 提示无需绘制）
   *   other 异类型墙体（覆盖绘制 → 需拆分，并把重叠段改为新类型）
   */
  function sameLineOverlaps(r, type){
    const [rx0, ry0, rx1, ry1] = r;
    const horiz = (rx1 - rx0) >= (ry1 - ry0);
    const ra0 = horiz ? rx0 : ry0, ra1 = horiz ? rx1 : ry1;
    const TOL = 2, BAND = 12;
    const same = [], other = [];
    for (let i = 0; i < WALLS.length; i++){
      if (state.demolished.includes('w' + i)) continue;
      const w = WALLS[i];
      const wx0 = Math.min(w[0], w[2]), wx1 = Math.max(w[0], w[2]);
      const wy0 = Math.min(w[1], w[3]), wy1 = Math.max(w[1], w[3]);
      const wHoriz = (wx1 - wx0) >= (wy1 - wy0);
      /* 同一条墙线：截面完全对齐（碎片可能比墙厚还短），或同向且截面有重叠 */
      const aligned = horiz
        ? (Math.abs(wy0 - ry0) <= BAND && Math.abs(wy1 - ry1) <= BAND)
          || (wHoriz && Math.min(wy1, ry1) - Math.max(wy0, ry0) > TOL)
        : (Math.abs(wx0 - rx0) <= BAND && Math.abs(wx1 - rx1) <= BAND)
          || (!wHoriz && Math.min(wx1, rx1) - Math.max(wx0, rx0) > TOL);
      if (!aligned) continue;
      const wa0 = horiz ? wx0 : wy0, wa1 = horiz ? wx1 : wy1;
      if (Math.min(wa1, ra1) - Math.max(wa0, ra0) <= TOL) continue;   // 长轴无重叠
      (w[4] === type ? same : other).push({ i, w, a0: wa0, a1: wa1 });
    }
    return { same, other, horiz, a0: ra0, a1: ra1 };
  }

  /** 矩形是否已被某段未拆除的墙完全覆盖（洞口开在未裁开的墙上时无需补墙） */
  function coveredByWall(r){
    const x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]);
    const y0 = Math.min(r[1], r[3]), y1 = Math.max(r[1], r[3]);
    for (let i = 0; i < WALLS.length; i++){
      if (state.demolished.includes('w' + i)) continue;
      const w = WALLS[i];
      if (Math.min(w[0], w[2]) <= x0 + 1 && Math.max(w[0], w[2]) >= x1 - 1 &&
          Math.min(w[1], w[3]) <= y0 + 1 && Math.max(w[1], w[3]) >= y1 - 1) return true;
    }
    return false;
  }

  /**
   * 判断某段洞口「原本」属于哪类墙：取同向、共线且与洞口首尾相接的相邻墙段类型，
   * 读不到时退回非承重墙。用于删除门窗后按原类型补墙（外墙补回外墙）。
   */
  function openingFillType(r){
    const [x0, y0, x1, y1] = r;
    const horiz = (x1 - x0) >= (y1 - y0);
    const TOL = 2, BAND = 12;
    for (let i = 0; i < WALLS.length; i++){
      if (state.demolished.includes('w' + i)) continue;
      const w = WALLS[i];
      const wx0 = Math.min(w[0], w[2]), wx1 = Math.max(w[0], w[2]);
      const wy0 = Math.min(w[1], w[3]), wy1 = Math.max(w[1], w[3]);
      if (((wx1 - wx0) >= (wy1 - wy0)) !== horiz) continue;
      const aligned = horiz
        ? Math.abs(wy0 - y0) <= BAND && Math.abs(wy1 - y1) <= BAND
        : Math.abs(wx0 - x0) <= BAND && Math.abs(wx1 - x1) <= BAND;
      if (!aligned) continue;
      const touch = horiz
        ? Math.abs(wx1 - x0) <= TOL || Math.abs(wx0 - x1) <= TOL
        : Math.abs(wy1 - y0) <= TOL || Math.abs(wy0 - y1) <= TOL;
      if (touch) return w[4];
    }
    return 'n';
  }

  /**
   * 删除门 / 窗：洞口区域按原墙体类型补回，并与同向共线、首尾相接的
   * 相邻墙段合并成一段完整墙体（外墙补回外墙，非承重墙补回非承重墙）。
   */
  function fillOpening(k, i){
    const r = elemRect(k, i);
    if (!r) return;
    // 洞口开在一段未裁开的墙上（户型自带的门窗）：删掉洞口即可，不用补墙
    if (coveredByWall(r)){
      mutate(() => removeOpeningOnly(k, i));
      syncUserGeom();
      return uiStore.showToast(tr('洞口已移除', 'Opening removed'));
    }
    const x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]);
    const y0 = Math.min(r[1], r[3]), y1 = Math.max(r[1], r[3]);
    const type = openingFillType([x0, y0, x1, y1]);      // 原墙类型：外墙 / 承重墙 / 非承重墙
    const { rect, absorbed } = wallSpanMerge([x0, y0, x1, y1], type);
    mutate(() => {
      removeOpeningOnly(k, i);              // 去掉这个门窗
      removeWallsOnly(absorbed);            // 去掉被合并掉的墙段
      state.walls.push([...rect, type]);    // 按原类型补回墙体
    });
    syncUserGeom();
    uiStore.showToast(type === 'e' ? tr('洞口已补回外墙', 'Opening filled with an exterior wall')
      : type === 'b' ? tr('洞口已补回承重墙', 'Opening filled with a bearing wall')
      : type === 'g' ? tr('洞口已补回玻璃墙面', 'Opening filled with a glass wall')
      : tr('洞口已补回非承重墙', 'Opening filled with a partition wall'));
  }


  /**
   * 该墙是否位于户型「最外侧」（围护结构）：
   * 沿厚度方向在墙两侧各探一探，只有一侧（或两侧都没有）落在房间内 → 最外侧。
   * 每侧探两个距离，容忍房间轮廓与墙面的细小偏差。
   */
  function isOuterWall(i){
    const w = WALLS[i];
    if (!w) return false;
    const x0 = Math.min(w[0], w[2]), x1 = Math.max(w[0], w[2]);
    const y0 = Math.min(w[1], w[3]), y1 = Math.max(w[1], w[3]);
    const horiz = (x1 - x0) >= (y1 - y0);
    const t = horiz ? (y1 - y0) : (x1 - x0);
    const cx = (x0 + x1)/2, cy = (y0 + y1)/2;
    const hit = (dx, dy) => ROOMS.some(r => inPoly(r.poly, cx + dx, cy + dy));
    const side = (near, far) => hit(...near) || hit(...far);
    const d1 = t/2 + 40, d2 = t/2 + 220;
    const hits = horiz
      ? (side([0, -d1], [0, -d2]) ? 1 : 0) + (side([0, d1], [0, d2]) ? 1 : 0)
      : (side([-d1, 0], [-d2, 0]) ? 1 : 0) + (side([d1, 0], [d2, 0]) ? 1 : 0);
    return hits <= 1;
  }

  /** 墙体类型互转：按目标类型的主流厚度改造，并与相邻同类墙段合并成一段 */
  function convertWallTo(i, type = 'b'){
    const w = WALLS[i];
    if (!w) return;
    const x0 = Math.min(w[0], w[2]), x1 = Math.max(w[0], w[2]);
    const y0 = Math.min(w[1], w[3]), y1 = Math.max(w[1], w[3]);
    const horiz = (x1 - x0) >= (y1 - y0);
    const t = projectWallT(type), cx = (x0 + x1)/2, cy = (y0 + y1)/2;
    const rect = horiz ? [x0, cy - t/2, x1, cy + t/2] : [cx - t/2, y0, cx + t/2, y1];
    const uid = elemUidOf('wall', i);                // 身份在改数组前取好
    const m = wallSpanMerge(rect, type);
    let ni = i;
    mutate(() => {
      removeWallsOnly([i, ...m.absorbed]);
      const next = [...m.rect, type];
      if (uid) next[WALL_UID] = uid;
      state.walls.push(next);
      ni = base.walls + state.walls.length - 1;     // 换成了用户墙，下标会变
      // 非承重墙才可设墙面材质：换成承重 / 外墙时清掉
      if (type !== 'n' && state.wallMats) delete state.wallMats[uid || wallMatKey(i)];
    });
    syncUserGeom();
    uiStore.showToast(type === 'b'
      ? tr('已转为承重墙', 'Converted to a bearing wall')
      : type === 'e'
        ? tr('已转为外墙', 'Converted to an exterior wall')
        : tr('已转为非承重墙', 'Converted to a partition wall'));
    return ni;
  }

  /** 承重墙 → 非承重墙；若该墙位于户型最外侧（围护结构）则转为外墙 */
  function convertWallFromBearing(i){
    return convertWallTo(i, isOuterWall(i) ? 'e' : 'n');
  }

  /** 「删除」：删除当前选中的单个元素（门窗会补成非承重墙并与相邻墙段合并） */
  function deleteElem(k, i){
    if (k !== 'wall'){                     // 门 / 窗 / 推拉门 → 补墙
      fillOpening(k, i);
      uiStore.select(null);
      return;
    }
    const w = WALLS[i];
    if (!w) return;
    // 承重墙 / 外墙不允许删除
    if (w[4] === 'b' || w[4] === 'e')
      return uiStore.showToast(tr('承重墙 / 外墙不可拆除', 'Bearing / exterior walls cannot be removed'));
    mutate(() => {
      // 用户新增的真正删除，户型自带的标记拆除（state.demolished）
      if (i < base.walls){
        if (!state.demolished.includes('w' + i)) state.demolished.push('w' + i);
      } else {
        const u = i - base.walls;
        if (u >= 0 && u < state.walls.length) state.walls.splice(u, 1);
      }
    });
    syncUserGeom();
    uiStore.select(null);
    uiStore.showToast(tr('已删除', 'Deleted'));
  }

  return { ALONG_RATIOS, EDGE_PX, ELEM_BASE, OPEN_BASE, activeWall, addOpening, addWall, alignWallDraw, convertWallFromBearing, convertWallTo, coveredByWall, deleteElem, elemKey, elemName, elemRect, elemSize, ensureUserElem, fillOpening, hitWall, isOuterWall, openingFillType, openingPreviewAt, projectWallT, removeOpeningOnly, removeWallsOnly, replaceWall, resolveWallStart, reverseDoor, sameLineOverlaps, setElemName, setElemSize, wallMatId, setWallMat, snapAlongHost, snapAlongWall, snapRatioBetween, snapWallEndpoint, snapWallLength, snapWallPoint, pointInHouse, wallSpanMerge, wallUnderPoint, writeElemRect };
}
