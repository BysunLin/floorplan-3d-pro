import { ROOMS, WALLS, WINS, DOORS, SLIDES, aabb, bbox, snapRectsOf, norm } from '@/core/model/plan.js';
import { uid, F, isClimbType, isFloorType, isSandboxType } from '@/core/library/index.js';
import { garageLayout, parkingInPolygon, aisleSpansInPolygon, columnsInPolygon } from '@/core/garage/layout.js';
import { polyArea, pointInShape } from '@/core/geometry/region.js';
import { makePlan } from '@/core/plans/index.js';
import { tr } from '@/i18n.js';
import { snapRoomEdge, snapLenStep } from '@/core/geometry/wallMath.js';
import { wallOverlapAt, swingOverlap, checkPlacement, pushOutside } from '@/core/geometry/collide.js';

/** 由 stores/plan/index.js 组装：只依赖共享上下文 ctx，不直接持有全局单例 */
export function createFurniture(ctx){
  const geo = ctx.geo;
  const base = geo.base;
  const state = ctx.state;
  const ui = ctx.ui;
  const view = ctx.view;
  const uiStore = ctx.uiStore;
  const planId = ctx.planId;
  const activeLevelMeta = (...a) => ctx.activeLevelMeta(...a);
  const mutate = (...a) => ctx.mutate(...a);
  const deleteRegion = (...a) => ctx.deleteRegion(...a);

  /* ---------- 跨楼层复制粘贴（剪贴板存在 store 内，切换楼层后仍可用） ---------- */
  let clipboard = null;
  function copySelection(){
    if (ui.sel?.kind === 'furn'){
      const f = getF(ui.sel.id);
      if (f) clipboard = [JSON.parse(JSON.stringify(f))];
    }
    uiStore.showToast(clipboard ? tr('已复制所选家具', 'Copied') : tr('请先选中家具', 'Select furniture first'));
  }
  function pasteSelection(){
    if (!clipboard || !clipboard.length)
      return uiStore.showToast(tr('剪贴板为空', 'Clipboard is empty'));
    mutate(() => {
      for (const src of clipboard){
        const n = JSON.parse(JSON.stringify(src));
        n.id = uid();
        n.cx += 200; n.cy += 200;
        state.furniture.push(n);
      }
    });
    uiStore.showToast(tr('已粘贴到当前楼层', 'Pasted to this floor'));
  }
  /* ======================= 选择 / 校验 ======================= */
  function getF(id){ return state.furniture.find(f => f.id === id); }

  function validateSel(){
    if (ui.sel?.kind === 'furn' && !getF(ui.sel.id)) ui.sel = null;
    if (ui.sel?.kind === 'room' && !ROOMS.some(r => r.id === ui.sel.id)) ui.sel = null;
  }
  /* ======================= 家具增删改 ======================= */
  /** 新放下的家具若压在墙 / 窗上，沿穿透较浅的方向推出来，刚好贴墙。
   *  沙盘构件（楼栋 / 地库模块 / 广场）是场地级体量，允许压在轴线上，不参与推出。 */
  function pushOut(f){
    if (isSandboxType(f.type)) return;
    const p = pushOutside(f, snapRectsOf(state));
    f.cx = p.cx;
    f.cy = p.cy;
  }

  /* ---------- loft 户型：楼梯元素保护 ---------- */
  const hasLoft = () => (state.levels || []).some(l => l.kind === 'loft');
  /** loft 户型的最底层（一层）：楼梯必须留在这里 */
  const baseLevelId = () => (state.levels || [])
    .slice().sort((a, b) => (a.elev || 0) - (b.elev || 0))[0]?.id;

  /** 是否「一层最后一处楼梯」：loft 户型必须保留至少一个上楼方式 */
  function isLastLoftStair(f){
    if (!f || !isClimbType(f.type) || !hasLoft()) return false;
    if (baseLevelId() !== state.activeLevel) return false;
    return state.furniture.filter(g => isClimbType(g.type)).length <= 1;
  }

  /** 给 loft 户型补齐楼梯（初始方案缺失时兜底） */
  function ensureLoftStair(){
    if (!hasLoft()) return;
    if (baseLevelId() !== state.activeLevel) return;
    if (state.furniture.some(f => isClimbType(f.type))) return;
    const def = makePlan(planId.value).furniture.find(f => isClimbType(f.type));
    if (def) state.furniture.push({ ...def, id: uid() });
  }

  /**
   * 按房间 / 区域外轮廓自动铺一块地库模块：
   * 长边作为车位排布方向，必要时整体旋转 90°，模块精确填满外接矩形。
   * 返回 { ok, reason?, count? }，失败原因由调用方提示。
   */
  function autoGarage(roomId){
    const r = ROOMS.find(x => x.id === roomId);
    if (!r) return { ok: false, reason: 'room' };
    const b = bbox(r.poly);
    let w = b[2] - b[0], d = b[3] - b[1], rot = 0;
    if (d > w){ const t = w; w = d; d = t; rot = 90; }
    if (w < 14000 || d < 14000) return { ok: false, reason: 'small' };
    const f = F('garagemodule', '地库标准模块',
      Math.round((b[0] + b[2])/2/10)*10, Math.round((b[1] + b[3])/2/10)*10,
      Math.round(w/10)*10, Math.round(d/10)*10, rot, '#b9b6b0');
    const count = garageLayout(f.w, f.d).total;
    ui.sel = { kind: 'furn', id: f.id };
    mutate(() => { state.furniture.push(f); });
    uiStore.showToast(tr(`已按区域铺排地库模块，共 ${count} 个车位`,
      `Garage module fitted — ${count} stalls`));
    return { ok: true, count };
  }

  /**
   * 自动排车位（智能选择）：
   *   · 轮廓接近矩形 → 铺一块地库模块（带通道 / 柱网 / 防火分区）
   *   · 异形轮廓 / 带洞 → 逐位生成车位，只保留四角都在轮廓内的车位
   */
  function autoParking(roomId){
    const r = ROOMS.find(x => x.id === roomId);
    if (!r) return { ok: false, reason: 'room' };
    const b = bbox(r.poly);
    const bw = b[2] - b[0], bd = b[3] - b[1];
    if (bw < 14000 || bd < 14000) return { ok: false, reason: 'small' };
    const holes = r.holes || [];
    const fill = bw*bd > 0 ? Math.abs(polyArea(r.poly))/(bw*bd) : 0;
    const cornersIn = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]
      .every(([x, y]) => pointInShape(x, y, { poly: r.poly, holes }));
    if (!holes.length && fill >= .93 && cornersIn) return { ...autoGarage(roomId), mode: 'module' };

    const cx = (b[0] + b[2])/2, cy = (b[1] + b[3])/2;
    const W = Math.max(bw, bd), D = Math.min(bw, bd), rot = bd > bw ? 90 : 0;
    const { stalls } = parkingInPolygon({ w: W, d: D, poly: r.poly, holes, cx, cy, rot });
    if (!stalls.length) return { ok: false, reason: 'empty' };
    const geo = { w: W, d: D, poly: r.poly, holes, cx, cy, rot };
    const lane = aisleSpansInPolygon(geo).map(s => F('lane', '车道线',
      Math.round(s.cx/10)*10, Math.round(s.cy/10)*10,
      Math.round(s.w/10)*10, 150, s.rot, '#f2f4f5'));
    const cols = columnsInPolygon(geo).map(c => F('garagecol', '地库柱',
      Math.round(c.cx/10)*10, Math.round(c.cy/10)*10,
      Math.round(c.w/10)*10, Math.round(c.d/10)*10, c.rot, '#9aa3a8'));
    const items = stalls.slice(0, 400).map(s => F('parking', '停车位',
      Math.round(s.cx/10)*10, Math.round(s.cy/10)*10,
      Math.round(s.w/10)*10, Math.round(s.d/10)*10, s.rot, '#8d949c'));
    ui.sel = null;
    mutate(() => { state.furniture.push(...lane, ...items, ...cols); });
    uiStore.showToast(tr(`异形区域已逐位排布：${items.length} 个车位、${cols.length} 根柱`,
      `Irregular area — ${items.length} stalls, ${cols.length} columns`));
    return { ok: true, count: items.length, mode: 'stalls' };
  }

  function addItem(it, x, y){
    const [type, name, w, d, color] = it;
    const f = F(type, name, Math.round(x/10)*10, Math.round(y/10)*10, w, d, 0, color);
    if (!isSandboxType(type)){
      [f.cx, f.cy] = snapMove(f, f.cx, f.cy);   // 新摆放的家具同样吸附墙 / 其它家具的边线
      pushOut(f);
    }
    ui.sel = { kind: 'furn', id: f.id };
    mutate(() => { type === 'rug' ? state.furniture.unshift(f) : state.furniture.push(f); });
    uiStore.showToast(tr(`已添加「${name}」${w}×${d}`, `Added "${name}" ${w}×${d}`));
  }

  function rotateSel(d){
    if (ui.sel?.kind !== 'furn') return;
    mutate(() => { getF(ui.sel.id).rot = norm(getF(ui.sel.id).rot + d); });
  }

  /** 楼层元素（步梯 / 旋转步梯 / 扶梯）：切换上行 / 下行（电梯不参与） */
  function setFloorDir(id, sdir){
    const f = getF(id);
    if (!f || !isClimbType(f.type)) return;
    const v = sdir < 0 ? -1 : 1;
    if ((f.sdir ?? 1) === v) return;
    mutate(() => { const g = getF(id); if (g) g.sdir = v; });
  }

  function deleteSel(){
    if (ui.sel?.kind === 'room') return deleteRegion(ui.sel.id);
    if (ui.sel?.kind !== 'furn') return;
    const id = ui.sel.id;
    if (isLastLoftStair(getF(id)))
      return uiStore.showToast(tr('loft 户型必须保留一处楼梯（步梯 / 扶梯等），最后一处不能删除',
        'A loft needs a staircase — the last stair cannot be deleted'));
    ui.sel = null;
    mutate(() => { state.furniture = state.furniture.filter(f => f.id !== id); });
  }

  function duplicateSel(){
    if (ui.sel?.kind !== 'furn') return;
    const f = getF(ui.sel.id), n = { ...f, id: uid(), cx: f.cx + 200, cy: f.cy + 200 };
    ui.sel = { kind: 'furn', id: n.id };
    mutate(() => { state.furniture.push(n); });
  }

  function bringToFront(){
    if (ui.sel?.kind !== 'furn') return;
    mutate(() => {
      const i = state.furniture.findIndex(g => g.id === ui.sel.id);
      state.furniture.push(...state.furniture.splice(i, 1));
    });
  }

  function sendToBack(){
    if (ui.sel?.kind !== 'furn') return;
    mutate(() => {
      const i = state.furniture.findIndex(g => g.id === ui.sel.id);
      state.furniture.unshift(...state.furniture.splice(i, 1));
    });
  }

  function clearLayout(){
    const n = state.furniture.length;
    if (!n) return uiStore.showToast(tr('当前没有布置任何家具', 'There is no furniture to clear'));
    // loft 户型必须保留楼梯：清空时把楼梯留下（其余家具 / 家电全部移除）
    const keepStair = hasLoft();
    if (!confirm(tr(`确定清空全部 ${n} 件家具 / 家电吗？\n墙体、地面材料和测量线会保留，可点「撤销」恢复。${keepStair ? '\n loft 户型的楼梯会保留。' : ''}`,
      `Remove all ${n} furniture / appliance items?\nWalls, flooring and measurements are kept. You can Undo this.${keepStair ? '\nThe loft staircase is kept.' : ''}`))) return;
    ui.sel = null;
    mutate(() => {
      state.furniture = keepStair ? state.furniture.filter(f => isClimbType(f.type)) : [];
    });
    uiStore.showToast(tr('已清空布置，可点「撤销」恢复', 'Layout cleared — Undo to restore'));
  }

  /* 恢复到初始家具布局（保留房间、地面材料与测量线，可撤销） */
  function initLayout(){
    if (!confirm(tr('将家具布局恢复为初始方案？\n房间、地面材料和测量线会保留，可点「撤销」取消。',
      'Restore the initial furniture layout?\nRooms, flooring and measures are kept. You can Undo this.'))) return;
    ui.sel = null;
    mutate(() => { state.furniture = makePlan(planId.value).furniture; });
    uiStore.showToast(tr('已恢复初始家具布局，可点「撤销」取消', 'Initial layout restored — Undo to revert'));
  }
  /* ======================= 吸附 ======================= */
  const GRID = 10;

  /** 边线吸附：把 (cx,cy) 处、半尺寸 hw×hh 的家具紧贴到 rects 的边线外侧。
   *  · 只取「贴在外侧」的位置（家具整块在矩形外），既不会把家具吸进墙里，
   *    也能让椅子顶到书桌 / 餐桌的边缘线上；
   *  · 另一轴有重叠（含 tol 余量）时才吸附，避免吸到斜对面很远的边线；
   *  · 两轴各取最近命中，skipX / skipY 的轴不参与（供「墙体优先」复用）。 */
  function snapEdge(cx, cy, hw, hh, tol, rects, skipX = false, skipY = false){
    let nx = cx, ny = cy, bx = tol, by = tol, sx = false, sy = false;
    for (const r of rects){
      if (!skipX && !(r[3] < cy - hh - tol || r[1] > cy + hh + tol))
        for (const c of [r[0] - hw, r[2] + hw])
          if (Math.abs(c - cx) < bx){ bx = Math.abs(c - cx); nx = c; sx = true; }
      if (!skipY && !(r[2] < cx - hw - tol || r[0] > cx + hw + tol))
        for (const c of [r[1] - hh, r[3] + hh])
          if (Math.abs(c - cy) < by){ by = Math.abs(c - cy); ny = c; sy = true; }
    }
    return { nx, ny, sx, sy };
  }

  /** 参与家具间吸附的矩形（不含正在拖动的自己；地毯是地面铺装，不作为吸附边） */
  function furnRects(except){
    const out = [];
    for (const o of state.furniture){
      if (o === except || o.type === 'rug') continue;
      const a = aabb(o);
      out.push([o.cx - a.hw, o.cy - a.hh, o.cx + a.hw, o.cy + a.hh]);
    }
    return out;
  }

  /* 空间校验统一走 core/geometry/collide.js（2D / 3D / MCP 同一份判定） */
  const goneDoor = key => state.demolished.includes(key);

  /** 家具放在 (cx, cy) 是否压到墙体 / 门窗（沙盘构件豁免） */
  function wallOverlap(f, cx, cy){
    if (isSandboxType(f.type)) return false;
    return wallOverlapAt(f, cx, cy, snapRectsOf(state));
  }

  /** 家具放在 (cx, cy) 是否挡住开门（沙盘构件豁免） */
  function doorOverlap(f, cx, cy){
    if (isSandboxType(f.type)) return false;
    return swingOverlap(f, cx, cy, DOORS, goneDoor);
  }

  /**
   * 落点校验（供 3D 拖动 / 外部调用）：{ ok, reason: ''|'wall'|'door' }
   * 与 2D 拖动时的红框判定完全同源。
   */
  function placementAt(f, cx = f.cx, cy = f.cy){
    if (isSandboxType(f.type)) return { ok: true, reason: '' };
    return checkPlacement(f, cx, cy, {
      rects: snapRectsOf(state), doors: DOORS, gone: goneDoor
    });
  }

  /**
   * 同类家具（如成组椅子）：邻近辅助框 + 边框延长线 + 左/右/上/下/中心对齐吸附。
   *
   * 关键点：对齐是按「边线」而不是「边段」——
   *  · 同一行（另一轴间隙 ≤ PERP）即可让左 / 右 / 中心线对齐，哪怕两者在行内相距很远；
   *  · 对齐后的辅助虚线会向两侧各延长 EXT，形成「边框延长线」，方便继续沿线排布；
   *  · 辅助虚线本身即吸附目标，因此不必两张椅子先贴上才能齐平。
   *
   * 返回 { nx, ny, boxes, guides }：
   *  · boxes  近邻（900mm 内）的包围盒，2D 画虚线框
   *  · guides 同一基准线上的延长虚线
   */
  function sameTypeSnap(f, cx, cy, tol, skipX = false, skipY = false){
    const { hw, hh } = aabb(f);
    const boxes = [], mates = [], guides = [];
    let nx = cx, ny = cy, bx = tol, by = tol;

    const REACH = 2600;      // 参与对齐的最远距离（沿基准线方向）
    const PERP = 800;        // 另一轴的间隙上限：超过就不算「同一行 / 同一列」
    const BOX_GAP = 900;     // 画辅助框的距离
    const EXT = 480;         // 延长线超出两端家具的长度

    for (const o of state.furniture){
      if (o === f || o.type !== f.type) continue;
      const a = aabb(o);
      const gx = Math.max(0, Math.abs(o.cx - cx) - (a.hw + hw));
      const gy = Math.max(0, Math.abs(o.cy - cy) - (a.hh + hh));
      if (gx > REACH || gy > REACH) continue;

      if (gx <= BOX_GAP && gy <= BOX_GAP)
        boxes.push({ id: o.id, cx: o.cx, cy: o.cy, hw: a.hw, hh: a.hh });
      mates.push({ cx: o.cx, cy: o.cy, hw: a.hw, hh: a.hh });

      // 同一行才做左右对齐；同一列才做上下对齐（墙体已吸附的轴不再改写）
      if (!skipX && gy <= PERP) for (const c of [o.cx - a.hw + hw, o.cx + a.hw - hw, o.cx]){
        const d = Math.abs(c - cx);
        if (d < bx){ bx = d; nx = c; }
      }
      if (!skipY && gx <= PERP) for (const c of [o.cy - a.hh + hh, o.cy + a.hh - hh, o.cy]){
        const d = Math.abs(c - cy);
        if (d < by){ by = d; ny = c; }
      }
    }

    // 对齐后，把落在同一基准线上的邻居连成一条「延长虚线」（阈值 1mm 排除浮点误差）
    const EQ = 1;
    for (const b of mates){
      const xs = [nx - hw, nx + hw, nx], bs = [b.cx - b.hw, b.cx + b.hw, b.cx];
      for (let i = 0; i < 3; i++) if (Math.abs(xs[i] - bs[i]) < EQ)
        guides.push({
          x1: xs[i], y1: Math.min(ny - hh, b.cy - b.hh) - EXT,
          x2: xs[i], y2: Math.max(ny + hh, b.cy + b.hh) + EXT
        });
      const ys = [ny - hh, ny + hh, ny], bt = [b.cy - b.hh, b.cy + b.hh, b.cy];
      for (let i = 0; i < 3; i++) if (Math.abs(ys[i] - bt[i]) < EQ)
        guides.push({
          x1: Math.min(nx - hw, b.cx - b.hw) - EXT, y1: ys[i],
          x2: Math.max(nx + hw, b.cx + b.hw) + EXT, y2: ys[i]
        });
    }
    return { nx, ny, boxes, guides };
  }

  /** 拖动家具时的落点吸附：10mm 网格 → 墙体 / 窗（优先）→ 房间 / 区域边线（楼层元素 / 走廊扶手）→ 其它家具
   *  → 同类家具对齐；并给出落点是否压墙 / 压窗（拖拽时写入 ui 供 2D 画红框提示）
   *  scale = 当前视图的 px/mm（3D 拖动时传入该处的实际比例，保证吸附范围按屏幕 ~10px 恒定） */
  function snapMove(f, cx, cy, scale = view.s){
    let nx = Math.round(cx/GRID)*GRID, ny = Math.round(cy/GRID)*GRID;
    // 沙盘构件按 10mm 网格自由摆放：不吸墙 / 不吸其它家具，避免大模块被拉偏
    if (isSandboxType(f.type)){
      if (ui.dragId){ ui.dragBad = false; ui.dragRect = null; ui.assist = []; ui.guides = []; }
      return [nx, ny];
    }
    if (!ui.layers.wallSnap) return [nx, ny];
    const { hw, hh } = aabb(f), tol = 10/Math.max(scale, .001);

    // 1) 墙体 / 窗：优先级最高
    const w = snapEdge(nx, ny, hw, hh, tol, snapRectsOf(state));
    nx = w.nx; ny = w.ny;
    let sx = w.sx, sy = w.sy;

    // 2) 楼层元素（步梯 / 旋转步梯 / 电梯 / 扶梯）与走廊扶手：
    //    额外吸附到房间 / 区域（含楼板洞口）的正交边线（墙体已经命中的轴不再改写）
    if (isFloorType(f.type) || f.type === 'railing'){
      const rings = ROOMS.flatMap(o => [o.poly, ...(o.holes || [])].filter(Boolean));
      const r = snapRoomEdge(nx, ny, hw, hh, tol, rings);
      if (!sx){ nx = r.nx; sx = r.sx; }
      if (!sy){ ny = r.ny; sy = r.sy; }
    }

    // 3) 其它家具：仅在前两步未命中的轴上补位吸附
    const s = snapEdge(nx, ny, hw, hh, tol, furnRects(f), sx, sy);
    nx = s.nx; ny = s.ny;

    // 4) 同类家具：边缘 / 中心对齐（墙体 / 房间边线优先；家具之间的贴合让位给「齐平」）
    const t = sameTypeSnap(f, nx, ny, tol * 1.2, sx, sy);
    nx = t.nx; ny = t.ny;

    // 5) 拖拽反馈：邻近虚线框、对齐辅助线、压墙 / 挡门警示
    if (ui.dragId){
      const badWall = wallOverlap(f, nx, ny);
      const badDoor = !badWall && doorOverlap(f, nx, ny);
      ui.dragBad = badWall || badDoor;
      ui.dragReason = badWall ? 'wall' : badDoor ? 'door' : '';
      ui.dragRect = ui.dragBad ? { x: nx - hw, y: ny - hh, w: hw * 2, h: hh * 2 } : null;
      ui.assist = t.boxes;
      ui.guides = t.guides;
    }
    return [nx, ny];
  }

  /** 测量点吸附：10mm 网格 + 贴墙；shift 时锁定水平/垂直 */
  function snapPoint(p, shift){
    let x = Math.round(p.x/10)*10, y = Math.round(p.y/10)*10;
    const tol = 8/view.s;
    let bx = tol, by = tol;
    for (const r of snapRectsOf(state)){
      for (const ex of [r[0], r[2]]) if (Math.abs(ex - p.x) < bx){ bx = Math.abs(ex - p.x); x = ex; }
      for (const ey of [r[1], r[3]]) if (Math.abs(ey - p.y) < by){ by = Math.abs(ey - p.y); y = ey; }
    }
    if (shift && ui.mA){
      if (Math.abs(x - ui.mA.x) > Math.abs(y - ui.mA.y)) y = ui.mA.y;
      else x = ui.mA.x;
    }
    return { x, y };
  }

  /**
   * 区域绘制的吸附目标矩形：未拆除的墙体 + 门 / 窗 / 推拉门洞口 + 楼层结构构件
   * （步梯 / 旋转步梯 / 电梯 / 扶梯）。返回若干已归一化的 [x0,y0,x1,y1]，供顶点 /
   * 边线吸附复用（这些元素也是区域绘制时要扣掉面积的对象，保持吸附与扣减一致）。
   */
  function regionSnapRects(){
    const out = [];
    const add = (x0, y0, x1, y1) => {
      out.push([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]);
    };
    for (let i = 0; i < WALLS.length; i++){
      if (!state.demolished.includes('w' + i)) add(WALLS[i][0], WALLS[i][1], WALLS[i][2], WALLS[i][3]);
    }
    WINS.forEach((w, i) => { if (!state.demolished.includes('nw' + i)) add(w[0], w[1], w[2], w[3]); });
    const upper = (activeLevelMeta()?.elev || 0) > 0;
    DOORS.forEach((d, i) => { if (!state.demolished.includes('nd' + i) && !(d.entry && upper)) add(d.rect[0], d.rect[1], d.rect[2], d.rect[3]); });
    SLIDES.forEach((s, i) => { if (!state.demolished.includes('ns' + i)) add(s.rect[0], s.rect[1], s.rect[2], s.rect[3]); });
    for (const f of state.furniture){
      if (!isFloorType(f.type)) continue;
      const { hw, hh } = aabb(f);
      add(f.cx - hw, f.cy - hh, f.cx + hw, f.cy + hh);
    }
    return out;
  }

  /**
   * 区域绘制的吸附（起终点通用；B 点传入起点 origin 以获得长度断点吸附）：
   *  ① 顶点：墙体 / 门窗 / 楼层构件拐角、已有房间·区域的多边形顶点（最近者优先）
   *  ② 逐轴墙面 / 边线吸附：墙体 / 门窗 / 构件的立面、已有房间·区域的正交边线
   *     —— 横竖两轴分别取最近者，因此可以同时贴住墙角的两面
   *  ③ 沿墙断点：墙体长轴的 25% / 33% / 50% / 67% / 75% 处
   *  ④ 长度断点：相对起点 origin 的 0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 … m（按比例尺动态取舍）
   *  ⑤ 都没有 → 10mm 网格
   * 返回 { x, y, kind: 'vertex' | 'edge' | null }，kind 供 2D 画吸附指示。
   */
  function snapRegionPoint(p, origin){
    const tol = 12/view.s;
    const rects = regionSnapRects();

    /* ① 顶点吸附：两轴同时吸附，优先级最高 */
    let vBest = null, vDist = tol;
    const vertex = (x, y) => {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d <= vDist){ vDist = d; vBest = { x, y, kind: 'vertex' }; }
    };
    for (const r of ROOMS){
      for (const ring of [r.poly, ...(r.holes || [])]) for (const [x, y] of ring) vertex(x, y);
    }
    for (const r of rects){
      for (const x of [r[0], r[2]]) for (const y of [r[1], r[3]]) vertex(x, y);
    }
    if (vBest) return vBest;

    /* ②③ 逐轴求墙面 / 边线 / 沿墙断点（两轴独立，可同时贴住墙角两面） */
    const RATIOS = [.25, 1/3, .5, 2/3, .75];
    let wx = null, wy = null, dx = tol, dy = tol;
    const takeX = (x, d) => { if (d <= dx){ dx = d; wx = x; } };
    const takeY = (y, d) => { if (d <= dy){ dy = d; wy = y; } };

    for (const r of rects){
      const [x0, y0, x1, y1] = r;
      const horiz = (x1 - x0) >= (y1 - y0);
      // 左右立面 → x；上下立面 → y（另一轴投影落在墙段范围内即可）
      if (p.y >= y0 - tol && p.y <= y1 + tol){
        takeX(x0, Math.abs(p.x - x0));
        takeX(x1, Math.abs(p.x - x1));
        if (horiz) for (const t of RATIOS){ const x = x0 + (x1 - x0)*t; takeX(x, Math.abs(p.x - x)); }
      }
      if (p.x >= x0 - tol && p.x <= x1 + tol){
        takeY(y0, Math.abs(p.y - y0));
        takeY(y1, Math.abs(p.y - y1));
        if (!horiz) for (const t of RATIOS){ const y = y0 + (y1 - y0)*t; takeY(y, Math.abs(p.y - y)); }
      }
    }
    // 已有房间 / 区域的正交边线
    for (const r of ROOMS){
      for (const ring of [r.poly, ...(r.holes || [])]){
        for (let i = 0; i < ring.length; i++){
          const a = ring[i], b = ring[(i + 1) % ring.length];
          if (Math.abs(a[1] - b[1]) < 1){                          // 水平边 → y
            if (p.x >= Math.min(a[0], b[0]) - tol && p.x <= Math.max(a[0], b[0]) + tol)
              takeY(a[1], Math.abs(p.y - a[1]));
          } else if (Math.abs(a[0] - b[0]) < 1){                   // 垂直边 → x
            if (p.y >= Math.min(a[1], b[1]) - tol && p.y <= Math.max(a[1], b[1]) + tol)
              takeX(a[0], Math.abs(p.x - a[0]));
          }
        }
      }
    }

    /* ④ 长度断点：仅在某轴未被墙面吸附时生效，避免抢掉贴墙 */
    let sx = wx, sy = wy;
    if (origin){
      if (sx == null){
        const d0 = p.x - origin.x, ad = Math.abs(d0);
        const s = snapLenStep(ad, view.s, 12);
        if (Math.abs(s - ad) > .5) sx = origin.x + Math.sign(d0)*s;
      }
      if (sy == null){
        const d0 = p.y - origin.y, ad = Math.abs(d0);
        const s = snapLenStep(ad, view.s, 12);
        if (Math.abs(s - ad) > .5) sy = origin.y + Math.sign(d0)*s;
      }
    }

    if (sx != null || sy != null){
      return {
        x: sx != null ? Math.round(sx) : Math.round(p.x/10)*10,
        y: sy != null ? Math.round(sy) : Math.round(p.y/10)*10,
        kind: 'edge'
      };
    }
    return { x: Math.round(p.x/10)*10, y: Math.round(p.y/10)*10, kind: null };
  }

  return { GRID, addItem, baseLevelId, bringToFront, clearLayout, copySelection, deleteSel, duplicateSel, ensureLoftStair, furnRects, getF, hasLoft, initLayout, isLastLoftStair, pasteSelection, placementAt, pushOut, regionSnapRects, rotateSel, sendToBack, setFloorDir, snapEdge, snapMove, snapPoint, snapRegionPoint, validateSel };
}
