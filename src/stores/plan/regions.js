import { ROOMS, WALLS, WINS, DOORS, SLIDES, aabb, clamp } from '@/core/model/plan.js';
import { rectShape, areaOf, bboxOf, overlap, difference, projectOnSeg, shapesTouch } from '@/core/geometry/region.js';
import { uid, isFloorType } from '@/core/library/index.js';
import { tr } from '@/i18n.js';
import { REGION_NAME, REGION_MAT, REGION_MIN_AREA } from './constants.js';

/** 由 stores/plan/index.js 组装：只依赖共享上下文 ctx，不直接持有全局单例 */
export function createRegions(ctx){
  const geo = ctx.geo;
  const base = geo.base;
  const state = ctx.state;
  const ui = ctx.ui;
  const uiStore = ctx.uiStore;
  const syncUserGeom = (...a) => ctx.syncUserGeom(...a);
  const activeLevelMeta = (...a) => ctx.activeLevelMeta(...a);
  const mutate = (...a) => ctx.mutate(...a);

  /* ======================= 区域（房间）绘制 =======================
   * 在「选择」模式下从家具面板的「房间 → 区域绘制」进入：
   *  · A → B 生成矩形（起终点都吸附墙体 / 已有区域的顶点与边线）；
   *  · 矩形内的墙体、门窗默认被扣除，取剩余连通的整块作为区域外轮廓；
   *  · 新区域覆盖到的已有区域会扣掉这部分面积（可被切成多块 / 中间挖洞）。
   */
  const g10 = v => Math.round(v/10)*10;

  /** A / B → 归一化矩形（10mm 网格） */
  function regionRect(a, b){
    return {
      x0: Math.min(g10(a.x), g10(b.x)), x1: Math.max(g10(a.x), g10(b.x)),
      y0: Math.min(g10(a.y), g10(b.y)), y1: Math.max(g10(a.y), g10(b.y))
    };
  }

  /** 绘制矩形内的遮挡物：未拆除的墙体 + 门 / 窗 / 推拉门洞口 + 楼层结构构件
   *  （步梯 / 旋转步梯 / 电梯 / 扶梯）。区域面积会扣掉这些落地占用的部分。 */
  function regionObstacles(r){
    const out = [];
    const add = (x0, y0, x1, y1) => {
      const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
      const ay = Math.min(y0, y1), by = Math.max(y0, y1);
      if (bx <= r.x0 || ax >= r.x1 || by <= r.y0 || ay >= r.y1) return;
      if (bx - ax < 1 || by - ay < 1) return;
      out.push(rectShape([ax, ay, bx, by]));
    };
    WALLS.forEach((w, i) => { if (!state.demolished.includes('w' + i)) add(w[0], w[1], w[2], w[3]); });
    WINS.forEach((w, i) => { if (!state.demolished.includes('nw' + i)) add(w[0], w[1], w[2], w[3]); });
    const upper = (activeLevelMeta()?.elev || 0) > 0;
    DOORS.forEach((d, i) => { if (!state.demolished.includes('nd' + i) && !(d.entry && upper)) add(d.rect[0], d.rect[1], d.rect[2], d.rect[3]); });
    SLIDES.forEach((s, i) => { if (!state.demolished.includes('ns' + i)) add(s.rect[0], s.rect[1], s.rect[2], s.rect[3]); });
    // 楼层结构构件同样落地占用面积，需从区域中扣除（其旋转后的轴对齐包围盒）
    for (const f of state.furniture){
      if (!isFloorType(f.type)) continue;
      const { hw, hh } = aabb(f);
      add(f.cx - hw, f.cy - hh, f.cx + hw, f.cy + hh);
    }
    return out;
  }

  /** 区域必须「接」在墙体（含门窗洞口）或已有区域上，不允许凭空出现 */
  function regionConnected(shape){
    if (!shape) return false;
    const targets = [];
    for (let i = 0; i < WALLS.length; i++)
      if (!state.demolished.includes('w' + i)) targets.push(rectShape(WALLS[i]));
    for (let i = 0; i < WINS.length; i++)
      if (!state.demolished.includes('nw' + i)) targets.push(rectShape(WINS[i]));
    // 门洞也算「墙体」的一部分：入户走廊正是接在入户门上
    for (let i = 0; i < DOORS.length; i++)
      if (!state.demolished.includes('nd' + i)) targets.push(rectShape(DOORS[i].rect));
    for (let i = 0; i < SLIDES.length; i++)
      if (!state.demolished.includes('ns' + i)) targets.push(rectShape(SLIDES[i].rect));
    for (const r of state.regions || []) targets.push({ poly: r.poly, holes: r.holes || [] });
    return targets.some(t => shapesTouch(shape, t, 2));
  }

  /** 绘制预览：原始矩形 + 扣掉墙体门窗后的区域（取面积最大的连通块） */
  function regionPreview(a, b){
    if (!a || !b) return null;
    const rect = regionRect(a, b);
    if (rect.x1 - rect.x0 < 50 || rect.y1 - rect.y0 < 50)
      return { rect, pieces: [], shape: null, area: 0, connected: false };
    const pieces = difference(rectShape([rect.x0, rect.y0, rect.x1, rect.y1]), regionObstacles(rect));
    let shape = null, best = -1;
    for (const p of pieces){
      const ar = areaOf(p);
      if (ar > best){ best = ar; shape = p; }
    }
    return { rect, pieces, shape, area: shape ? best : 0, connected: regionConnected(shape) };
  }

  /** 名称去重：「区域」→「区域 2」→「区域 3」… */
  function uniqueName(taken, base){
    const root = String(base || REGION_NAME).replace(/\s\d+$/, '');
    if (!taken.has(root)){ taken.add(root); return root; }
    let n = 2;
    while (taken.has(`${root} ${n}`)) n++;
    const v = `${root} ${n}`;
    taken.add(v);
    return v;
  }

  /** 创建区域：扣掉遮挡物 → 从已有区域里扣掉被覆盖的面积 → 选中新区域 */
  function addRegion(a, b){
    const pv = regionPreview(a, b);
    if (!pv?.shape || pv.area < REGION_MIN_AREA)
      return uiStore.showToast(tr('区域太小，或已被墙体 / 门窗占满，未创建',
        'The area is too small or fully covered by walls — nothing created'));

    const shape = pv.shape;
    if (!pv.connected)
      return uiStore.showToast(tr('新的区域需要与墙体或已有区域相连，请贴着它们绘制',
        'A new area must touch a wall or an existing area — draw it against one'));
    const id = 'rg' + Date.now().toString(36) + uid().slice(-4);
    const taken = new Set(Object.values(state.rooms).map(r => r.name));
    const name = uniqueName(taken, REGION_NAME);

    const removed = [];                      // 被完全覆盖而删除的区域名（提示 + 可撤销）
    mutate(() => {
      const keep = [], extra = [];
      for (const r of state.regions || []){
        if (!overlap(bboxOf({ poly: r.poly }), bboxOf(shape))){ keep.push(r); continue; }
        const parts = difference({ poly: r.poly, holes: r.holes || [] }, [shape])
          .sort((p, q) => areaOf(q) - areaOf(p));
        if (!parts.length){                                           // 被完全覆盖 → 删除（可撤销）
          removed.push(state.rooms[r.id]?.name || r.name);
          delete state.rooms[r.id];
          continue;
        }
        r.poly = parts[0].poly;
        r.holes = parts[0].holes || [];
        keep.push(r);
        for (const p of parts.slice(1)){                              // 被切成多块时保留其余部分
          if (areaOf(p) < REGION_MIN_AREA) continue;
          extra.push({
            id: 'rg' + Date.now().toString(36) + uid().slice(-4),
            name: uniqueName(taken, r.name), mat: r.mat,
            poly: p.poly, holes: p.holes || []
          });
        }
      }
      for (const e of extra) state.rooms[e.id] = { name: e.name, mat: e.mat, light: 'round' };
      state.regions = [...keep, ...extra, { id, name, mat: REGION_MAT, poly: shape.poly, holes: shape.holes || [] }];
      // 新区域默认配一盏圆形顶灯（3D 里由 buildLamps 按 light 款式生成）
      state.rooms[id] = { name, mat: REGION_MAT, light: 'round' };
    });
    syncUserGeom();
    ui.sel = { kind: 'room', id };                                     // 绘制完成默认选中
    uiStore.showToast(removed.length
      ? tr(`已创建「${name}」${pv.area.toFixed(2)} m²；被完全覆盖的「${removed.join('、')}」已删除（Ctrl+Z 可撤销）`,
           `Created "${name}" — ${pv.area.toFixed(2)} m²; "${removed.join('", "')}" was fully covered and removed (Ctrl+Z to undo)`)
      : tr(`已创建「${name}」${pv.area.toFixed(2)} m²`, `Created "${name}" — ${pv.area.toFixed(2)} m²`));
    return id;
  }

  /** 删除房间 / 区域：
   *  · 用户绘制的区域（在 state.regions 里）→ 直接移除；
   *  · 户型自带的内置房间（ROOMS 静态定义）→ 记进 state.deletedRooms，重建 ROOMS 时跳过。
   *  两者都进撤销栈，可 Ctrl+Z 恢复。飘窗（bay）为特殊构件，不在此处删除。 */
  function deleteRoom(id){
    if (typeof id === 'string' && id.startsWith('bay'))
      return uiStore.showToast(tr('飘窗不可在此删除', 'Bay windows cannot be removed here'));
    const isRegion = (state.regions || []).some(r => r.id === id);
    mutate(() => {
      if (isRegion){
        state.regions = state.regions.filter(r => r.id !== id);
        delete state.rooms[id];
      } else if (!state.deletedRooms.includes(id)){
        state.deletedRooms.push(id);
      }
    });
    syncUserGeom();
    if (ui.sel?.kind === 'room' && ui.sel.id === id) ui.sel = null;
    uiStore.showToast(isRegion
      ? tr('已删除区域', 'Area deleted')
      : tr('已删除房间', 'Room deleted'));
  }

  /* 兼容别名：旧调用方仍可用 deleteRegion 删除用户绘制的区域 */
  function deleteRegion(id){ deleteRoom(id); }

  return { addRegion, deleteRegion, deleteRoom, g10, regionConnected, regionObstacles, regionPreview, regionRect, uniqueName };
}
