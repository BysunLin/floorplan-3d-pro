import { reactive, computed } from 'vue';
import { defaultState, save as savePlan, isClimbType } from '@/core/library/index.js';
import { planGeoVersion } from '@/core/plans/index.js';
import { tr } from '@/i18n.js';
import { ELEM_KINDS } from '@/stores/ui.js';

/** 由 stores/plan/index.js 组装：只依赖共享上下文 ctx，不直接持有全局单例 */
export function createHistory(ctx){
  const geo = ctx.geo;
  const base = geo.base;
  const state = ctx.state;
  const ui = ctx.ui;
  const uiStore = ctx.uiStore;
  const planId = ctx.planId;
  const emit = (...a) => ctx.emit(...a);
  const syncUserGeom = (...a) => ctx.syncUserGeom(...a);
  const validateSel = (...a) => ctx.validateSel(...a);

  /* ======================= 历史 ======================= */
  // 必须是响应式数组，否则 canUndo / canRedo 不会随入栈/出栈重新求值
  const undoStack = reactive([]), redoStack = reactive([]);
  const canUndo = computed(() => undoStack.length > 0);
  const canRedo = computed(() => redoStack.length > 0);

  const snap = () => JSON.stringify(state);

  /* 楼梯（位置 / 尺寸 / 旋转 / 上下行）会影响上层楼板的开洞：变化后重算当前层几何。
   * 只比较楼梯类家具，普通家具拖动不触发重算。 */
  function climbSig(){
    return JSON.stringify(state.furniture
      .filter(f => isClimbType(f.type))
      .map(f => [f.id, f.cx, f.cy, f.w, f.d, f.rot, f.sdir ?? 1]));
  }
  let lastClimbSig = climbSig();

  function commit(before){
    if (climbSig() !== lastClimbSig){
      lastClimbSig = climbSig();
      syncUserGeom();                 // 先更新楼板开洞，再保存 / 通知 3D
    }
    undoStack.push(before);
    if (undoStack.length > 150) undoStack.shift();
    redoStack.length = 0;
    savePlan(state);
    emit();
  }

  /** 带撤销的修改 */
  function mutate(fn){
    const before = snap();
    fn();
    commit(before);
  }

  function restore(json){
    const next = JSON.parse(json);
    state.furniture.splice(0, state.furniture.length, ...next.furniture);
    state.rooms = Object.assign(defaultState().rooms, next.rooms);
    state.demolished.splice(0, state.demolished.length, ...next.demolished);
    state.measures.splice(0, state.measures.length, ...next.measures);
    state.walls  = next.walls  || [];
    state.wins   = next.wins   || [];
    state.doors  = next.doors  || [];
    state.slides = next.slides || [];
    state.bays   = next.bays   || [];
    state.regions = next.regions || [];
    state.deletedRooms = next.deletedRooms || [];
    state.regionSeed = next.regionSeed || '';
    state.elemNames = next.elemNames || {};
    state.wallMats = next.wallMats || {};
    state.planId = next.planId || state.planId;
    state.geoVersion = next.geoVersion || planGeoVersion(state.planId);
    // 楼层（Phase 1）：撤销 / 重做同样要还原楼层结构与当前楼层
    state.levels = (Array.isArray(next.levels) && next.levels.length)
      ? next.levels
      : [{ id: 'L1', no: 1, name: '一层', kind: 'floor', elev: 0, clearH: 2800 }];
    state.activeLevel = (next.activeLevel && state.levels.some(l => l.id === next.activeLevel))
      ? next.activeLevel
      : state.levels[0].id;
    state.levelData = next.levelData || {};
    // 导入户型图的几何随快照一起还原（否则撤销后 planId 回去了、几何还是新的）
    if (next.customGeo) state.customGeo = next.customGeo;
    syncUserGeom();
    lastClimbSig = climbSig();
    validateSel();
    savePlan(state);
    emit();
  }

  function undo(){
    // 拆改墙体模式下选中元素不进撤销栈；
    // 此时 Ctrl+Z 等价于取消选中，避免看起来像撤销失灵
    if (!undoStack.length){
      if (ui.sel && ELEM_KINDS.includes(ui.sel.kind)){
        uiStore.dropElemSel();
        return uiStore.showToast(tr('已取消选中', 'Selection cleared'));
      }
      return uiStore.showToast(tr('没有可撤销的操作', 'Nothing to undo'));
    }
    redoStack.push(snap());
    restore(undoStack.pop());
    uiStore.dropElemSel();
  }

  function redo(){
    if (!redoStack.length) return;
    undoStack.push(snap());
    restore(redoStack.pop());
    uiStore.dropElemSel();
  }

  /** 清空撤销 / 重做栈：换了一整套几何（如导入户型图）后，旧快照已经没有意义，
   *  继续保留会让撤销把旧户型的墙体增量套到新几何上 */
  function clearHistory(){
    undoStack.length = 0;
    redoStack.length = 0;
  }

  return { canRedo, canUndo, clearHistory, climbSig, commit, mutate, redo, restore, snap, undo, undoStack };
}
