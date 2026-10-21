/* ============================================================================
 *  Plan Store —— 方案数据的组合根
 *
 *  对外仍然只有 usePlanStore() 一个入口；内部按「一次用户操作会改哪些 state」
 *  拆成若干会话模块，共享 context.js 里的同一份 state 与几何缓存：
 *    · geometry.js  几何重建（静态几何 + 用户增量 → 全局数组）
 *    · levels.js    楼层 / 夹层 / 各层快照与面积
 *    · history.js   撤销栈与快照
 *    · furniture.js 家具增删改、吸附、跨层剪贴板
 *    · walls.js     画墙 / 开洞 / 拆改 / 墙段合并
 *    · regions.js   区域绘制、房间删除
 *    · plans.js     户型切换 / 重置 / 导入
 * ========================================================================== */
import { defineStore } from 'pinia';
import { computed } from 'vue';
import { createPlanContext } from './context.js';
import { createGeometry } from './geometry.js';
import { createHistory } from './history.js';
import { createLevels } from './levels.js';
import { createFurniture } from './furniture.js';
import { createWalls } from './walls.js';
import { createRegions } from './regions.js';
import { createPlans } from './plans.js';

export { ELEM_KINDS } from '@/stores/ui.js';
export { isOpenableType } from '@/core/geometry/wallMath.js';

export const usePlanStore = defineStore('plan', () => {
  const ctx = createPlanContext();

  /* 各会话模块只向 ctx 上挂自己的动作，彼此通过 ctx 调用 */
  const groups = [
    createGeometry(ctx),
    createHistory(ctx),
    createLevels(ctx),
    createFurniture(ctx),
    createWalls(ctx),
    createRegions(ctx),
    createPlans(ctx)
  ];
  for (const g of groups) Object.assign(ctx, g);

  /* 楼层（响应式派生） */
  const levels = computed(() => ctx.state.levels);
  const activeLevel = computed(() => ctx.state.activeLevel);

  return {
    // 状态
    state: ctx.state, planId: ctx.planId, planVersion: ctx.planVersion,
    // 几何
    syncUserGeom: ctx.syncUserGeom, initGeometry: ctx.initGeometry,
    // 户型
    setPlan: ctx.setPlan, applyPlan: ctx.applyPlan, resetPlan: ctx.resetPlan, importPlan: ctx.importPlan,
    // 楼层
    levels, activeLevel,
    switchLevel: ctx.switchLevel, addLevel: ctx.addLevel, addBasement: ctx.addBasement, toggleLoft: ctx.toggleLoft,
    activeLevelMeta: ctx.activeLevelMeta, levelSnapshots: ctx.levelSnapshots,
    baseWalls: ctx.baseWalls,
    levelBelowSnapshot: ctx.levelBelowSnapshot, levelAreas: ctx.levelAreas,
    copySelection: ctx.copySelection, pasteSelection: ctx.pasteSelection,
    // 历史
    canUndo: ctx.canUndo, canRedo: ctx.canRedo,
    snap: ctx.snap, commit: ctx.commit, mutate: ctx.mutate, undo: ctx.undo, redo: ctx.redo,
    // 订阅
    onPlanChange: ctx.onPlanChange,
    // 选择 / 校验
    getF: ctx.getF, validateSel: ctx.validateSel,
    // 家具
    pushOut: ctx.pushOut, addItem: ctx.addItem, rotateSel: ctx.rotateSel, setFloorDir: ctx.setFloorDir,
    deleteSel: ctx.deleteSel, duplicateSel: ctx.duplicateSel,
    bringToFront: ctx.bringToFront, sendToBack: ctx.sendToBack,
    clearLayout: ctx.clearLayout, initLayout: ctx.initLayout,
    // 墙面组件 / 墙体
    activeWall: ctx.activeWall, hitWall: ctx.hitWall, snapWallPoint: ctx.snapWallPoint,
    snapWallEndpoint: ctx.snapWallEndpoint, projectWallT: ctx.projectWallT,
    addWall: ctx.addWall, wallUnderPoint: ctx.wallUnderPoint, resolveWallStart: ctx.resolveWallStart,
    snapAlongHost: ctx.snapAlongHost, snapWallLength: ctx.snapWallLength,
    pointInHouse: ctx.pointInHouse, addOpening: ctx.addOpening, reverseDoor: ctx.reverseDoor,
    // 元素（拆改）
    elemRect: ctx.elemRect, elemSize: ctx.elemSize, elemName: ctx.elemName,
    setElemName: ctx.setElemName, setElemSize: ctx.setElemSize,
    openingPreviewAt: ctx.openingPreviewAt,
    fillOpening: ctx.fillOpening, convertWallTo: ctx.convertWallTo,
    convertWallFromBearing: ctx.convertWallFromBearing, isOuterWall: ctx.isOuterWall,
    deleteElem: ctx.deleteElem,
    // 区域（房间）绘制
    regionRect: ctx.regionRect, regionPreview: ctx.regionPreview, addRegion: ctx.addRegion,
    deleteRoom: ctx.deleteRoom, deleteRegion: ctx.deleteRegion, snapRegionPoint: ctx.snapRegionPoint,
    // 吸附
    snapMove: ctx.snapMove, snapPoint: ctx.snapPoint
  };
});
