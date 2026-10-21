import { setGeometry } from '@/core/model/plan.js';
import { makePlan, DEFAULT_PLAN, planName, planGeoVersion } from '@/core/plans/index.js';
import { fixState, save as savePlan } from '@/core/library/index.js';
import { tr, lang } from '@/i18n.js';
import { getEngine } from '@/workspace/view3d/registry.js';

/** 由 stores/plan/index.js 组装：只依赖共享上下文 ctx，不直接持有全局单例 */
export function createPlans(ctx){
  const geo = ctx.geo;
  const base = geo.base;
  const state = ctx.state;
  const ui = ctx.ui;
  const uiStore = ctx.uiStore;
  const viewStore = ctx.viewStore;
  const planId = ctx.planId;
  const planVersion = ctx.planVersion;
  const markBase = (...a) => ctx.markBase(...a);
  const loadPlanGeos = (...a) => ctx.loadPlanGeos(...a);
  const syncUserGeom = (...a) => ctx.syncUserGeom(...a);
  const seedPlanRegions = (...a) => ctx.seedPlanRegions(...a);
  const regionSeedKey = (...a) => ctx.regionSeedKey(...a);
  const newLevelData = (...a) => ctx.newLevelData(...a);
  const cloneData = (...a) => ctx.cloneData(...a);
  const commit = (...a) => ctx.commit(...a);
  const restore = (...a) => ctx.restore(...a);
  const snap = (...a) => ctx.snap(...a);
  const ensureLoftStair = (...a) => ctx.ensureLoftStair(...a);
  const LEVEL_FIELDS = ctx.LEVEL_FIELDS;

  /* ======================= 户型 ======================= */
  /* 切换 / 重置户型：替换几何 + 重置房间名/材质 + 载入该户型初始家具
   * fit=false 时保持当前视口（重置同一户型时用，避免画面跳回全览） */
  function applyPlan(id, { silent = false, confirmMsg = true, fit = true } = {}){
    if (confirmMsg && !confirm(tr(`切换到「${planName(id, lang.value)}」户型？\n当前布置将替换为该户型的初始方案（可继续编辑）。`,
      `Switch to the "${planName(id, 'en')}" layout? Your current arrangement will be replaced by this layout's default (editable).`))) return false;
    const g = makePlan(id);
    setGeometry(g);
    loadPlanGeos(g);
    markBase();
    planId.value = id;
    const rooms = {};
    g.rooms.forEach(r => { rooms[r.id] = { name: r.name, mat: r.mat, light: 'round' }; });
    state.rooms = rooms;
    state.furniture = g.furniture;
    state.demolished = [];
    state.measures = [];
    // 换户型 = 换一套几何，用户自建的墙体 / 门窗清空，区域回到该户型自带的（入户走廊）
    state.walls = []; state.wins = []; state.doors = []; state.slides = []; state.bays = [];
    state.regions = g.regions || [];
    state.deletedRooms = [];                 // 不同户型的房间 id 不同，清空内置房间删除记录
    state.regionSeed = regionSeedKey(id);
    // 换户型 = 换一栋楼：样板可自带多楼层（如 loft 的一层 + 夹层），否则单层 L1
    if (Array.isArray(g.levels) && g.levels.length){
      state.levels = g.levels;
      // 打开户型时落在「最矮的地上楼层」：带地下车库的别墅不要一进来就在负一层
      state.activeLevel = (g.levels.find(l => (l.elev || 0) >= 0) || g.levels[0]).id;
      state.levelData = g.levelData || {};
    } else {
      state.levels = [{ id: 'L1', no: 1, name: '一层', kind: 'floor', elev: 0, clearH: 2800 }];
      state.activeLevel = 'L1';
      state.levelData = {};
    }
    ensureLoftStair();                   // loft 户型必须有一处楼梯
    syncUserGeom();
    state.planId = id;
    state.geoVersion = planGeoVersion(id);
    ui.sel = null;
    planVersion.value++;
    const engine = getEngine();
    engine?.sync(true);
    if (fit){
      viewStore.fitView();
      engine?.resetView();               // 3D 里切换户型：镜头重新对准新户型的整体
    }
    savePlan(state);
    if (!silent) uiStore.showToast(tr(`已切换到「${planName(id, lang.value)}」户型`, `Switched to "${planName(id, lang.value)}" layout`));
    return true;
  }

  /* 仅替换几何（用于刷新页面后还原已保存户型的墙体/房间，保留已编辑的家具） */
  function applyGeometryOnly(id){
    const g = makePlan(id);
    setGeometry(g);
    loadPlanGeos(g);
    markBase();
    planId.value = id;
    // 房间表按「当前楼层」的静态几何取：带独立平面的楼层（独栋洋房二 / 三层、loft 夹层）
    // 房间 id 与基准层不同，用基准层覆盖会把该层的房间名 / 地面材质丢掉。
    const activeGeo = (g.levelGeos && g.levelGeos[state.activeLevel]) || g;
    const rooms = {};
    activeGeo.rooms.forEach(r => { rooms[r.id] = { name: r.name, mat: r.mat, light: 'round' }; });
    const prevRooms = state.rooms;
    for (const k in prevRooms) if (rooms[k]) rooms[k] = prevRooms[k];   // 保留自定义名/材质
    for (const r of state.regions || []) if (prevRooms[r.id]) rooms[r.id] = prevRooms[r.id];   // 区域名 / 地面
    state.rooms = rooms;
    state.planId = id;
    // 内置户型几何版本变化（调整过墙体定义）：旧存档里的拆改增量已失效，
    // 直接丢弃，避免它与新几何叠加出越界 / 错位的墙体。
    if (state.geoVersion !== planGeoVersion(id)){
      const fresh = g.levelData || {};
      const prevFurniture = cloneData(state.furniture);
      // 楼层的标高 / 净高同样属于户型几何：版本升级后以新定义为准，
      // 否则旧存档里的层高（例如曾用 3000）会与新的剖切 / 楼板高度错开，外墙留缝。
      if (Array.isArray(g.levels) && g.levels.length){
        for (const nl of g.levels){
          const cur = state.levels.find(l => l.id === nl.id);
          // 新版户型新增的楼层（例如地下车库）也要补进旧存档
          if (cur) Object.assign(cur, { name: nl.name, kind: nl.kind, elev: nl.elev, clearH: nl.clearH });
          else state.levels.push(Object.assign({}, nl));
        }
        state.levels.sort((a, b) => (a.elev || 0) - (b.elev || 0) || (b.no || 0) - (a.no || 0));
        state.activeLevel = state.levels.some(l => l.id === state.activeLevel)
          ? state.activeLevel : state.levels[0].id;
      }
      // 当前楼层：清掉旧增量；若该层在新版户型里自带数据（如夹层），直接载入新版
      state.walls = []; state.wins = []; state.doors = []; state.slides = []; state.bays = [];
      state.regions = []; state.demolished = []; state.deletedRooms = []; state.measures = [];
      if (fresh[state.activeLevel]){
        const d = Object.assign(newLevelData(), cloneData(fresh[state.activeLevel]));
        for (const k of LEVEL_FIELDS) state[k] = cloneData(d[k]);
        // 几何变了但家具布置仍可用：保留用户的摆放
        if (prevFurniture.length) state.furniture = prevFurniture;
      } else {
        // 基准层没有自带数据：区域回到户型自带的（入户走廊），否则 regionSeed 会拦住补种
        const cur = state.levels.find(l => l.id === state.activeLevel);
        if (!state.levels.some(l => (l.elev || 0) < (cur?.elev || 0))){
          state.regions = cloneData(g.regions || []);
          state.regionSeed = regionSeedKey(id);
        }
      }
      // 其它楼层的拆改增量同样失效：新版户型自带数据的楼层用新版，其余重置为初始数据
      const prevData = state.levelData || {};
      state.levelData = {};
      for (const lv of state.levels){
        if (lv.id === state.activeLevel) continue;
        const d = fresh[lv.id] ? cloneData(fresh[lv.id]) : newLevelData();
        if (prevData[lv.id]?.furniture?.length) d.furniture = prevData[lv.id].furniture;
        state.levelData[lv.id] = d;
      }
      state.geoVersion = planGeoVersion(id);
    }
    // 注：不再按「户型包围盒」过滤用户墙段 —— 户外（如入户走廊、庭院）绘制的墙体
    // 本来就会落在包围盒之外。跨户型残留的错位墙已由上面的 geoVersion 版本校验
    // 与 importPlan 的户型切换解决。
    seedPlanRegions(id);               // 旧存档 / 首次进入：补上入户走廊
    ensureLoftStair();                 // 旧存档里楼梯被删过：loft 户型补回一处楼梯
    syncUserGeom();                    // 把本地存储里的自建墙体 / 门窗追加回去
    planVersion.value++;
    getEngine()?.sync(true);
    viewStore.fitView();
  }

  /** 刷新后还原几何（默认户型：把本地存储里自建的墙体 / 门窗追加回去） */
  function initGeometry(){
    if (state.planId && state.planId !== DEFAULT_PLAN) applyGeometryOnly(state.planId);
    else {
      seedPlanRegions(planId.value || DEFAULT_PLAN);
      syncUserGeom();
    }
  }

  function setPlan(id){
    if (id === planId.value) return;
    applyPlan(id);
  }

  /** 重置「当前户型」：家具布局、墙体 / 门窗 / 房间都恢复为该户型的初始定义
   *  （不切换户型；记入撤销栈，可 Ctrl+Z 撤销） */
  function resetPlan(){
    const id = planId.value || DEFAULT_PLAN;
    if (!confirm(tr(`恢复「${planName(id, lang.value)}」的默认方案？\n家具布局、墙体与门窗都会重置为该户型的初始状态，可用 Ctrl+Z 撤销。`,
      `Reset "${planName(id, 'en')}" to its default design?\nFurniture, walls, doors and windows will return to this layout's initial state — press Ctrl+Z to undo.`))) return;
    const before = snap();
    applyPlan(id, { confirmMsg: false, silent: true, fit: false });
    commit(before);                      // 记录重置前的快照，使其可撤销
    uiStore.showToast(tr(`已重置「${planName(id, lang.value)}」为默认方案（可撤销）`,
      `"${planName(id, 'en')}" reset to its default design (undoable)`));
  }

  function importPlan(s){
    const next = fixState(s);
    // 导入的方案可能属于另一个户型：先把几何切到该户型并重置 base，
    // 否则它的墙体增量会叠加到当前户型的几何上，产生越界 / 错位的墙。
    let planChanged = false;
    if (next.planId && next.planId !== planId.value){
      const g = makePlan(next.planId);
      setGeometry(g);
      loadPlanGeos(g);
      markBase();
      planId.value = next.planId;
      planChanged = true;
    }
    const before = snap();
    restore(JSON.stringify(next));
    ui.sel = null;
    commit(before);
    // 换了户型：2D / 3D 的视口都回到整体全览
    if (planChanged){
      viewStore.fitView();
      getEngine()?.resetView();
    }
  }

  return { applyGeometryOnly, applyPlan, importPlan, initGeometry, resetPlan, setPlan };
}
