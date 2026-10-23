/* ============================================================================
 *  平面图指针交互：平移 / 缩放 / 测量 / 家具移动 / 旋转 / 改尺寸
 *  所有改动只写 store，渲染交给 Vue 响应式系统。
 * ========================================================================== */
import { storeToRefs } from 'pinia';
import { usePlanStore, useUiStore, useViewStore } from '@/stores/index.js';
import { getPlanSvg } from '@/shared/dom/planSvg.js';
import { getEngine } from '@/workspace/view3d/registry.js';
import { TAP, ROOMS, WALLS, esc, axisPoint, clampScale } from '@/core/model/plan.js';
import { snapAngle, wallAngles } from '@/core/geometry/angle.js';
import { snapWallDeg, resetWallSnap, projectOnRay, isAxisDeg, degAxis, wallRefs } from '@/core/geometry/wallSnap.js';
import { lodOf, LOD } from '@/core/model/lod.js';
import { toLocal, ROAD_W } from '@/core/model/site.js';
import { areaOf } from '@/core/geometry/region.js';
import { tr } from '@/i18n.js';

let pinch = null;
const touches = new Map();

const svg = () => getPlanSvg();
/** 屏幕 → 场地（世界）坐标 */
const toW = e => useViewStore().toMM(e, svg());

/**
 * 世界 → 当前楼栋的局部坐标。
 * 室内几何都存在「楼栋局部坐标」里（总图里把楼栋挪开时，几何不动、只改变换），
 * 所以室内的吸附 / 命中 / 绘制都必须先减掉楼栋位移，否则会整体偏一个楼栋偏移量。
 */
function toEdit(wp){
  const b = usePlanStore().activeBuilding;
  return (b && (b.x || b.y)) ? toLocal(b, wp.x, wp.y) : wp;
}
/** 屏幕 → 当前楼栋局部坐标（室内编辑的默认坐标系） */
const toP = e => toEdit(toW(e));

/** 屏幕坐标 → 户型坐标（2D 取平面图，3D 取射线与地面的交点） */
export function dropPoint(x, y){
  const uiStore = useUiStore();
  const viewStore = useViewStore();
  const stage = document.querySelector('#stage');
  const r = stage?.getBoundingClientRect();
  if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  // 落在悬浮卡片或浮层控件上时不接收拖放
  if (document.elementFromPoint(x, y)?.closest('.glass-card,#ctxMenu,#levelBar,#walkOverlay,#joy,#walkExit')) return null;
  if (uiStore.is3D) return getEngine()?.groundAt(x, y) || null;
  // 家具 / 元素都活在「楼栋局部坐标」里：与 toP 一致，先减掉楼栋位移
  const p = toEdit(viewStore.toMM({ clientX: x, clientY: y }, svg()));
  return { x: p.x, y: p.y, s: viewStore.view.s };
}

/** 结束道路绘制并落库（双击 / Esc / 工具条「完成」都走这里） */
export function finishSiteRoad(){
  const ui = useUiStore().ui;
  const plan = usePlanStore();
  const cur = ui.siteRoad;
  if (!cur) return;
  if (cur.pts.length >= 2) plan.addRoad(cur.pts, ROAD_W);
  ui.siteRoad = null;
}

function pinchInfo(){
  const [a, b] = [...touches.values()];
  const r = svg().getBoundingClientRect();
  return {
    d: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    c: [(a.x + b.x)/2 - r.left, (a.y + b.y)/2 - r.top]
  };
}

export function usePlanInteraction(){
  const plan = usePlanStore();
  const uiStore = useUiStore();
  const viewStore = useViewStore();

  const {
    state, getF, mutate, commit, snap, snapMove, snapPoint,
    addWall, addOpening, hitWall, projectWallT,
    wallUnderPoint, resolveWallStart, snapAlongHost, snapWallEndpoint, snapWallLength,
    snapWallPoint, pointInHouse, openingPreviewAt, alignWallDraw,
    addRegion, snapRegionPoint
  } = plan;
  const { ui, closeDrawers, select, setWallItem, cancelWallDraw, cancelRegionDraw } = uiStore;
  const { view, cursor } = viewStore;
  const { activeWall } = storeToRefs(plan);

  let drag = null;

  /**
   * 计算画墙终点 B —— 吸附流水线，顺序即优先级：
   *
   *   ① 沿旧墙延长 / 覆盖（起点吸附在墙上且方向与宿主同轴）→ 完全沿用旧的正交逻辑
   *   ② 方向吸附：参考方向（全局轴 + 已有墙体走向）→ 15° 步进（**没有自由角度**）
   *   ③ 吸附结果恰好是 0/90 → 走旧的正交取点，保证端面对齐 / T 接几何与今天一致
   *   ④ 斜向 → 沿吸附方向投射鼠标，长度断点吸附（沿真实墙轴，不是 x/y 差）
   *   ⑤ 端点吸附（墙角 / 墙面 / 斜墙中心线投影）最后覆盖：
   *      吸到真实顶点时角度必须「让位」，这不是自由角度，而是精确连接。
   *
   * Shift：与旧版一致 —— 翻转正交方向（水平 ↔ 垂直）。
   * 容差按屏幕像素换算成角度，并带滞后（见 core/geometry/wallSnap.js）。
   */
  function wallEndpoint(a, p, shift){
    const w = ui.wallSnap;

    // ① 沿宿主墙延长 / 覆盖：正交刻度的语义与旧实现完全一致
    const along = w && !w.slanted && (w.horiz ? ui.wallAxis === 'h' : ui.wallAxis === 'v');
    if (along){
      let bp = axisPoint(a, p, shift, ui.wallAxis, false);
      bp = snapAlongHost(w, a, bp);
      const a0 = w.horiz ? w.x0 : w.y0, a1 = w.horiz ? w.x1 : w.y1;
      const c = w.horiz ? bp.x : bp.y;
      if (c < a0 - 1 || c > a1 + 1) bp = snapWallLength(a, bp);   // 墙段之外：长度断点吸附
      return snapWallEndpoint(bp, w?.i);
    }

    // ② 方向吸附：参考方向 → 15° 步进，永远落在整齐角度上
    const rawDeg = Math.atan2(p.y - a.y, p.x - a.x) * 180 / Math.PI;
    const screenLen = Math.hypot(p.x - a.x, p.y - a.y) * view.s;
    const sn = snapWallDeg(rawDeg, wallRefs(wallAngles(WALLS)), { screenLen, px: 10 });

    // ③ 正交：交给旧逻辑（B 点严格落在轴上，长度 / 端面对齐都是原有行为）
    if (isAxisDeg(sn.deg)){
      const axis = shift ? (degAxis(sn.deg) === 'h' ? 'v' : 'h') : degAxis(sn.deg);
      let bp = axisPoint(a, p, false, axis, false);
      bp = snapWallLength(a, bp);
      return snapWallEndpoint(bp, w?.i);
    }

    // ④ 斜向：沿吸附方向投射鼠标 → 长度断点吸附
    const rad = sn.deg * Math.PI / 180;
    const len0 = projectOnRay(a, p, sn.deg);
    let bp = { x: a.x + Math.cos(rad) * len0, y: a.y + Math.sin(rad) * len0 };
    bp = snapWallLength(a, bp);

    // ⑤ 端点吸附最后覆盖（吸到墙角时角度会「让位」给精确连接，这是期望行为）
    bp = snapWallEndpoint(bp, w?.i);
    return { ...bp, deg: Math.atan2(bp.y - a.y, bp.x - a.x) * 180 / Math.PI };
  }

  /** 结束区域绘制：创建区域（完成后默认选中，退出绘制状态；失败则留在绘制模式，方便重画） */
  function finishRegion(){
    const d = ui.regionDraw;
    if (!d || !d.a || !d.b) return;
    const a = d.a, b = d.b;
    ui.regionDraw = null;
    ui.regionSnap = null;
    const retry = () => { ui.regionDraw = { a: null, b: null }; };
    if (Math.abs(b.x - a.x) < 50 || Math.abs(b.y - a.y) < 50){
      uiStore.showToast(tr('区域太小，请重新绘制', 'Area too small — draw again'));
      retry();
      return;
    }
    if (!addRegion(a, b)) retry();
  }

  /** 结束当前拖动：移动过的家具记入撤销栈 */
  function endDrag(cancel){
    const d = drag;
    drag = null;
    svg()?.classList.remove('panning');
    if (!d) return;
    if (d.kind === 'measure'){
      if (cancel){ ui.mA = ui.mCur = null; return; }
      if (d.moved && ui.mA && ui.mCur && Math.hypot(ui.mCur.x - ui.mA.x, ui.mCur.y - ui.mA.y) > 20){
        const a = ui.mA, b = ui.mCur;
        ui.mA = ui.mCur = null;
        mutate(() => { state.measures.push({ a, b }); });
      }
      return;                                    // 没拖动：保留起点，等第二次点击
    }
    if (d.kind === 'region'){
      if (cancel){ cancelRegionDraw(); return; }
      if (d.moved) finishRegion();
      return;                                    // 没拖动：保留 A 点，等第二次点击
    }
    if (d.kind === 'pan'){
      // 轻点空白 / 房间：选择模式下选中房间或清空选中；拆改墙体模式下清空已选中的墙 / 门窗
      // （与选择态家具的失焦逻辑一致）
      if (!cancel && !d.moved){
        if (ui.tool === 'select') select(d.room ? { kind: 'room', id: d.room } : null);
        else if (ui.tool === 'demolish') select(null);
      }
      return;
    }
    /* 家具：位置压到墙体 / 门窗，或拖动被取消 → 还原到拖动前（保证「不能穿墙」） */
    if (d.kind === 'move' || d.kind === 'rot' || d.kind === 'size'){
      const reason = ui.dragReason;
      const reverted = (cancel || ui.dragBad) ? restoreFurniture(d) : false;
      uiStore.clearDragAssist();
      if (reverted){
        if (!cancel) uiStore.showToast(reason === 'door'
          ? tr('位置挡住了门扇开启范围，已还原', 'Blocks the door swing — reverted')
          : tr('当前位置与墙体 / 门窗重叠，已还原', 'Overlaps a wall or opening — reverted'));
        return;
      }
      if (cancel) return;
    }
    if (d.moved) commit(d.before);
  }

  /** 用拖动前的快照还原单件家具（位置 / 旋转 / 尺寸） */
  function restoreFurniture(d){
    const f = getF(d.id);
    if (!f) return false;
    let src = null;
    try { src = JSON.parse(d.before).furniture.find(x => x.id === d.id); } catch (e) { /* 快照损坏：忽略 */ }
    if (!src) return false;
    f.cx = src.cx; f.cy = src.cy;
    f.rot = src.rot; f.w = src.w; f.d = src.d;
    return true;
  }

  /* ======================= 总图（site 档）交互 =======================
   * 只有三件事：选/拖楼栋、放楼栋、画道路。地面（世界）坐标系，
   * 与室内编辑完全分开，互不影响。 */
  let siteDrag = null;

  function siteDown(e, wp){
    const tool = ui.siteTool;

    // 道路：连续点，双击 / Esc 结束
    if (tool === 'road'){
      if (!ui.siteRoad) ui.siteRoad = { pts: [[Math.round(wp.x), Math.round(wp.y)]], cur: null };
      else ui.siteRoad.pts.push([Math.round(wp.x), Math.round(wp.y)]);
      return;
    }

    // 楼栋：点一下放一栋（模板 = 当前方案）
    if (tool === 'building'){
      const b = plan.addBuilding({ x: Math.round(wp.x), y: Math.round(wp.y) });
      ui.siteSel = { kind: 'building', id: b.id };
      return;
    }

    // 选择 / 拖动：命中框放宽到屏幕上约 4px
    const hit = plan.buildingAt(wp, 4 / view.s);
    ui.siteSel = hit ? { kind: 'building', id: hit.id } : null;
    if (!hit) return;
    siteDrag = { id: hit.id, before: snap(), sx: wp.x, sy: wp.y, ox: hit.x, oy: hit.y, moved: false };
  }

  function siteMove(wp){
    if (ui.siteRoad){
      if (ui.siteRoad.pts.length) ui.siteRoad.cur = [Math.round(wp.x), Math.round(wp.y)];
      return;
    }
    if (!siteDrag) return;
    const dx = wp.x - siteDrag.sx, dy = wp.y - siteDrag.sy;
    if (!siteDrag.moved && Math.hypot(dx, dy) * view.s < TAP) return;   // 抖动容忍
    siteDrag.moved = true;
    plan.setBuildingPos(siteDrag.id, siteDrag.ox + dx, siteDrag.oy + dy);
  }

  function siteUp(){
    if (siteDrag){
      if (siteDrag.moved) commit(siteDrag.before);   // 一次性入撤销栈
      siteDrag = null;
    }
  }

  function onDown(e){
    if (e.button === 1 || e.button === 2) return;
    closeDrawers();
    const s = svg();
    const menu = document.querySelector('details.menu');
    if (menu) menu.open = false;

    if (e.pointerType !== 'mouse'){
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      s.setPointerCapture(e.pointerId);
      if (touches.size >= 2){                  // 第二根手指落下 → 双指缩放 / 平移
        endDrag(drag?.kind === 'measure' || drag?.kind === 'pan');
        const { d, c } = pinchInfo();
        pinch = { d, c, s: view.s, px: view.x0 + c[0]/view.s, py: view.y0 + c[1]/view.s };
        return;
      }
    }
    if (pinch) return;

    /* 总图档（1:N > 2500）：室内元素根本没渲染，只处理场地（楼栋 / 道路）。
     * 否则会在「看不见的墙上」画出几何，属于典型的暗坑。 */
    if (lodOf(view.s) === LOD.SITE){
      siteDown(e, toW(e));
      s.setPointerCapture(e.pointerId);
      return;
    }

    const p = toP(e), t = e.target;

    /* 触屏长按 = 右键（选中指针下的元素并弹出菜单） */
    if (e.pointerType !== 'mouse' && !ui.regionDraw && ui.tool !== 'measure'
        && !(ui.tool === 'demolish' && activeWall.value) && !t.closest?.('[data-handle]'))
      startLongPress(e);

    /* 区域绘制：点 A → 点 B（或按住拖出矩形），起终点都吸附墙体 / 已有区域 */
    if (ui.regionDraw){
      const q = snapRegionPoint(p, ui.regionDraw?.a || null);
      ui.regionSnap = q.kind ? q : null;
      if (!ui.regionDraw.a){
        ui.regionDraw = { a: q, b: q };
        drag = { kind: 'region', sx: e.clientX, sy: e.clientY, moved: false };
        s.setPointerCapture(e.pointerId);
      } else {
        ui.regionDraw = { a: ui.regionDraw.a, b: q };
        finishRegion();
      }
      return;
    }

    if (ui.tool === 'measure'){
      const q = snapPoint(p, e.shiftKey);
      if (!ui.mA){
        ui.mA = q; ui.mCur = q;
        drag = { kind: 'measure', sx: e.clientX, sy: e.clientY, moved: false };
        s.setPointerCapture(e.pointerId);
      } else {
        const a = ui.mA;
        ui.mA = null; ui.mCur = null;
        if (Math.hypot(q.x - a.x, q.y - a.y) > 20) mutate(() => { state.measures.push({ a, b: q }); });
      }
      return;
    }

    /* 拆改墙体：选中了墙面组件时，点击用来「画墙 / 开门窗」而不是拆墙 */
    if (ui.tool === 'demolish' && activeWall.value){
      const it = activeWall.value;
      if (it.kind === 'wall'){
        // 第一下取 A 点，第二下取 B 点（方向可正交也可斜向，见 wallEndpoint）
        if (!ui.wallA){
          resetWallSnap();
          // 起点动态判定：房子内部必须落在墙上；户外区域不受限制
          const wall = wallUnderPoint(p);
          if (wall){
            ui.wallSnap = wall;
            const r = resolveWallStart(wall, p, p, projectWallT(it.sub));
            ui.wallA = r.a; ui.wallAxis = r.axis;
          } else if (pointInHouse(p)){
            select(null);          // 点击空白 → 取消选中（与选择态家具一致）
            uiStore.showToast(tr('请从已有墙体上开始绘制', 'Start drawing from an existing wall'));
            return;
          } else {
            // 户外：自由起点（网格 / 墙角吸附，不夹到户型内）
            ui.wallSnap = null;
            ui.wallA = snapWallPoint(p);
            ui.wallAxis = null;
          }
          ui.wallB = ui.wallA;
        } else {
          // 双击的第二下（含落点与起点重合）→ 结束折线，不再落一段零长墙
          if (e.detail >= 2 || Math.hypot(p.x - ui.wallA.x, p.y - ui.wallA.y) * view.s < 6){
            cancelWallDraw();
            return;
          }

          const wall = ui.wallSnap;
          // 取 B 点时：按 B 的方向重新吸附起点（墙面 / 墙端边缘 / 延长）
          if (wall){
            const r = resolveWallStart(wall, ui.wallA, p, projectWallT(it.sub));
            ui.wallA = r.a; ui.wallAxis = r.axis;
          }
          // 沿旧墙同轴绘制（从墙端向内覆盖 / 向外延长）：
          //  · 所选类型与旧墙一致 → 沿用旧墙厚度，便于合并成同一段墙（延长）；
          //  · 所选类型不同       → 按所选类型绘制，由 addWall 把覆盖区域转为该类型并拆分其余部分。
          const along = wall && !wall.slanted && (wall.horiz ? ui.wallAxis === 'h' : ui.wallAxis === 'v');
          const sameType = along && wall.type === it.sub;
          const bp = wallEndpoint(ui.wallA, p, e.shiftKey);
          // 落墙前做同样的墙线对齐，保证落点与预览完全一致（斜墙内部自行跳过）
          const al = alignWallDraw(ui.wallA, bp, wall?.i ?? -1);
          addWall(al.a, al.b, it.sub, sameType ? wall.t : 0);

          // 折线连续绘制：落完一段后以 B 为新起点，可以一笔画完整户型；
          // Esc / 右键 / 双击结束（见 cancelWallDraw / onDblClick）。
          resetWallSnap();
          ui.wallA = { x: al.b.x, y: al.b.y };
          ui.wallB = { ...ui.wallA };
          ui.wallSnap = null;          // 新一段不再受上一段宿主墙的正交约束
          ui.wallAxis = null;
          ui.align = [];
        }
        return;
      }
      // 门 / 窗等非墙体组件：点在墙上即放置（单次放置后取消选中），未点在墙上则平移画布
      const wi = hitWall(p);
      if (wi < 0){
        // 与选择态家具库放置一致：未命中目标不强制放置，而是触发画布拖拽
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: view.x0, y0: view.y0, room: null, moved: false };
        s.setPointerCapture(e.pointerId);
        return;
      }
      addOpening(it.sub, wi, p);
      setWallItem(null);   // 单次放置即可，放置后取消选中墙面组件
      return;
    }

    const h = t.closest?.('[data-handle]');
    if (h && ui.sel?.kind === 'furn'){
      drag = { kind: h.dataset.handle, id: ui.sel.id, sx: e.clientX, sy: e.clientY, before: snap(), moved: false };
      ui.dragId = ui.sel.id;
    } else if (ui.tool === 'demolish' && t.closest?.('[data-open]')){
      // 拆改墙体：点击门 / 窗 / 推拉门 → 直接选中
      const [k, idx] = t.closest('[data-open]').dataset.open.split(':');
      uiStore.select({ kind: k, i: +idx });
      return;
    } else if (ui.tool === 'demolish' && t.closest?.('[data-wall]')){
      // 拆改墙体：点击墙体 → 直接选中
      uiStore.select({ kind: 'wall', i: +t.closest('[data-wall]').dataset.wall.slice(1) });
      return;
    } else if (ui.tool === 'select' && t.closest?.('[data-fid]')){
      const f = getF(t.closest('[data-fid]').dataset.fid);
      if (!f) return;
      if (ui.sel?.id !== f.id) select({ kind: 'furn', id: f.id });
      drag = { kind: 'move', id: f.id, sx: e.clientX, sy: e.clientY, ox: p.x - f.cx, oy: p.y - f.cy, before: snap(), moved: false };
      ui.dragId = f.id;
    } else {
      const room = t.closest?.('[data-room]');
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: view.x0, y0: view.y0, room: room && room.dataset.room, moved: false };
    }
    s.setPointerCapture(e.pointerId);
  }

  function onMove(e){
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch){
      if (touches.size < 2) return;
      const { d, c } = pinchInfo();
      const ns = clampScale(pinch.s*d/pinch.d);
      view.s = ns;
      view.x0 = pinch.px - c[0]/ns;
      view.y0 = pinch.py - c[1]/ns;
      return;
    }
    /* 总图档 / 正在画道路：只更新场地状态 */
    if (lodOf(view.s) === LOD.SITE || ui.siteRoad){
      siteMove(toW(e));
      return;
    }

    const p = toP(e);
    cursor.x = Math.round(p.x);
    cursor.y = Math.round(p.y);

    if (!drag){
      // 区域绘制：实时吸附 + 预览（A 已落下时更新 B）
      if (ui.regionDraw){
        const q = snapRegionPoint(p, ui.regionDraw?.a || null);
        ui.regionSnap = q.kind ? q : null;
        if (ui.regionDraw.a) ui.regionDraw.b = q;
        cursor.hover = '';
        return;
      }
      const room = e.target.closest?.('[data-room]');
      if (room){
        const r = ROOMS.find(x => x.id === room.dataset.room);
        cursor.hover = `<b>${esc(state.rooms[room.dataset.room]?.name || r.name)}</b> ${areaOf(r).toFixed(2)} m²`;
      } else cursor.hover = '';
      if (ui.tool === 'measure' && ui.mA) ui.mCur = snapPoint(p, e.shiftKey);
      // 画墙预览：实时算出 90° 且夹在户型外轮廓内的 B 点
      // 起点吸附在墙上时，随鼠标方向重新吸附到离 B 更近的那一面，并强制垂直
      if (ui.tool === 'demolish' && ui.wallA && activeWall.value?.kind === 'wall'){
        if (ui.wallSnap){
          const r = resolveWallStart(ui.wallSnap, ui.wallA, p, projectWallT(activeWall.value.sub));
          ui.wallA = r.a; ui.wallAxis = r.axis;
        }
        // 墙线对齐：附近墙体的边线 / 中线会把新墙「拉正」，并给出一条延伸虚线
        const al = alignWallDraw(ui.wallA, wallEndpoint(ui.wallA, p, e.shiftKey), ui.wallSnap?.i ?? -1);
        ui.wallA = al.a;
        ui.wallB = al.b;
        ui.align = al.guides;
      }
      // 画墙起点提示：已有墙体上显示吸附点；户外区域显示自由起点
      if (ui.tool === 'demolish' && activeWall.value?.kind === 'wall' && !ui.wallA){
        const wall = wallUnderPoint(p);
        ui.wallHover = wall ? resolveWallStart(wall, p, p).a
          : (pointInHouse(p) ? null : snapWallPoint(p));
      } else if (ui.wallHover){
        ui.wallHover = null;
      }
      // 门窗放置预览：鼠标在可开洞的墙（非承重墙 / 外墙）上时，显示与元素等大的可放置区域（绿色）
      if (ui.tool === 'demolish' && activeWall.value && activeWall.value.kind !== 'wall'){
        const wi = hitWall(p);
        ui.openHover = wi >= 0 ? openingPreviewAt(wi, p, activeWall.value.len) : null;
      } else if (ui.openHover){
        ui.openHover = null;
      }
      return;
    }

    const far = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) >= TAP;
    if (far){ cancelLongPress(); uiStore.closeMenu(); }   // 一移动就不算长按（顺手收起菜单）
    if (drag.kind === 'measure'){
      if (far) drag.moved = true;
      ui.mCur = snapPoint(p, e.shiftKey);
      return;
    }
    if (drag.kind === 'region'){
      if (far) drag.moved = true;
      const q = snapRegionPoint(p, ui.regionDraw?.a || null);
      ui.regionSnap = q.kind ? q : null;
      if (ui.regionDraw) ui.regionDraw.b = q;
      return;
    }
    if (drag.kind === 'pan'){
      if (!drag.moved && !far) return;
      drag.moved = true;
      svg().classList.add('panning');
      view.x0 = drag.x0 - (e.clientX - drag.sx)/view.s;
      view.y0 = drag.y0 - (e.clientY - drag.sy)/view.s;
      return;
    }

    const f = getF(drag.id);
    if (!f) return;
    if (!drag.moved && !far) return;          // 轻点家具不应让它抖动一下
    drag.moved = true;
    if (drag.kind === 'move'){
      [f.cx, f.cy] = snapMove(f, p.x - drag.ox, p.y - drag.oy);
    } else if (drag.kind === 'rot'){
      const a = Math.atan2(p.y - f.cy, p.x - f.cx)*180/Math.PI + 90;
      // 与 3D 旋转 gizmo 共用同一套吸附规则：墙体走向优先，其次 15°；Shift 自由转
      f.rot = snapAngle(a, wallAngles(WALLS), { step: 15, tol: 6, free: e.shiftKey });
    } else if (drag.kind === 'size'){
      const a = f.rot*Math.PI/180, c = Math.cos(a), s = Math.sin(a);
      const dx = p.x - f.cx, dy = p.y - f.cy;
      const lx = dx*c + dy*s, ly = -dx*s + dy*c;
      const ax = -f.w/2, ay = -f.d/2;
      const nw = Math.max(100, Math.round((lx - ax)/10)*10);
      const nd = Math.max(100, Math.round((ly - ay)/10)*10);
      const mx = ax + nw/2, my = ay + nd/2;
      f.cx += mx*c - my*s;
      f.cy += mx*s + my*c;
      f.w = nw; f.d = nd;
    }
  }

  function onUp(e){
    touches.delete(e.pointerId);
    cancelLongPress();
    if (pinch){ if (touches.size < 2) pinch = null; return; }
    if (lodOf(view.s) === LOD.SITE){ siteUp(); return; }
    if (lpFired){                     // 长按已弹出菜单：抬手不再触发「轻点选中」/ 平移
      lpFired = false;
      if (!drag || !drag.moved){       // 长按后没有拖动 → 丢弃这次指针操作
        drag = null;
        svg()?.classList.remove('panning');
        return;
      }
    }
    endDrag(e.type === 'pointercancel');
  }

  function onWheel(e){
    const r = svg().getBoundingClientRect();
    const ns = view.s*Math.exp(-e.deltaY*(e.ctrlKey ? .01 : .0015));
    const s = clampScale(ns);
    const px = view.x0 + (e.clientX - r.left)/view.s;
    const py = view.y0 + (e.clientY - r.top)/view.s;
    view.s = s;
    view.x0 = px - (e.clientX - r.left)/s;
    view.y0 = py - (e.clientY - r.top)/s;
  }

  function onDblClick(e){
    // 总图档：双击结束道路折线
    if (lodOf(view.s) === LOD.SITE){ finishSiteRoad(); return; }
    // 正在画墙：双击 = 结束折线（连续绘制模式下的收笔动作）
    if (ui.wallA){ cancelWallDraw(); return; }
    if (ui.tool === 'select' && e.target.closest?.('[data-fid]')){
      const f = getF(e.target.closest('[data-fid]').dataset.fid);
      if (f) mutate(() => { f.rot = (f.rot + 90) % 360; });
    }
  }

  /**
   * 「右键 / 触屏长按」公共逻辑：
   * · 正在画区域 / 画墙 / 测量 → 取消当前绘制（不弹菜单）；
   * · 否则按「当前模式的左键选中逻辑」选中指针下的元素（家具 → 房间；拆改模式 → 门窗 / 墙体），
   *   空白处清空选中；随后在该位置打开右键菜单（操作与原来底部浮窗一致）。
   */
  function menuAt(e){
    cancelLongPress();
    if (ui.regionDraw){ cancelRegionDraw(); uiStore.closeMenu(); return; }
    if (ui.wallA){ cancelWallDraw(); uiStore.closeMenu(); return; }
    if (ui.tool === 'measure'){ ui.mA = null; ui.mCur = null; uiStore.closeMenu(); return; }

    // 墙面组件仍处于「待放置」状态：右键先取消它（与原先右键取消的行为一致）
    if (ui.tool === 'demolish' && activeWall.value) setWallItem(null);

    const p = toP(e), t = e.target;
    if (ui.tool === 'demolish'){
      const open = t.closest?.('[data-open]');
      const wallEl = t.closest?.('[data-wall]');
      if (open){
        const [k, idx] = open.dataset.open.split(':');
        select({ kind: k, i: +idx });
      } else if (wallEl){
        select({ kind: 'wall', i: +wallEl.dataset.wall.slice(1) });
      } else {
        // DOM 命中不到时用几何兜底（墙很窄、被其它图层盖住的情况）
        const wi = hitWall(p);
        select(wi >= 0 ? { kind: 'wall', i: wi } : null);
      }
    } else {
      const fid = t.closest?.('[data-fid]');
      const roomEl = t.closest?.('[data-room]');
      if (fid) select({ kind: 'furn', id: fid.dataset.fid });
      else if (roomEl) select({ kind: 'room', id: roomEl.dataset.room });
      else select(null);
    }
    uiStore.openMenu(e.clientX, e.clientY);
  }

  function onContextMenu(e){
    e.preventDefault();                       // 禁用工作区里的浏览器原生菜单
    menuAt(e);
  }

  /* 触屏没有右键：长按 0.5s 等价于右键（选中 + 打开菜单） */
  let lpTimer = null, lpFired = false;
  const LP_MS = 500;
  function cancelLongPress(){
    if (lpTimer){ clearTimeout(lpTimer); lpTimer = null; }
  }
  function startLongPress(e){
    cancelLongPress();
    lpFired = false;
    const ev = { clientX: e.clientX, clientY: e.clientY, target: e.target };
    lpTimer = setTimeout(() => {
      lpTimer = null;
      lpFired = true;
      menuAt(ev);
    }, LP_MS);
  }

  return { onDown, onMove, onUp, onWheel, onDblClick, onContextMenu };
}
