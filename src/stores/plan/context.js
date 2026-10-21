/* ============================================================================
 *  方案 store 的共享上下文
 *
 *  只负责「所有会话都要用的那一份东西」：
 *    · 持久化的方案 state / 当前户型 / 版本号；
 *    · 楼层静态几何缓存（base 下标、levelGeo 快照、各层自有几何）；
 *    · 变更订阅（3D 同步）与撤销栈容器。
 *
 *  各会话模块（levels / walls / regions / furniture / history / plans / geometry）
 *  通过 ctx 读写这些共享对象，彼此之间只经 ctx 调用，避免导入环。
 * ========================================================================== */
import { reactive, ref } from 'vue';
import { WALLS, WINS, DOORS, SLIDES, LINTELS, ROOMS, BOUNDS } from '@/core/model/plan.js';
import { load, fixState, defaultState } from '@/core/library/index.js';
import { makePlan, DEFAULT_PLAN } from '@/core/plans/index.js';
import { useUiStore } from '@/stores/ui.js';
import { useViewStore } from '@/stores/view.js';

export function createPlanContext(){
  const uiStore = useUiStore();
  const viewStore = useViewStore();
  const ui = uiStore.ui;
  const view = viewStore.view;

  /* ======================= 状态 ======================= */
  const state = reactive(fixState(load() || defaultState()));

  /* 当前户型（切换户型时自增，让 2D / 3D 重新渲染几何） */
  const planId = ref(state.planId || DEFAULT_PLAN);
  const planVersion = ref(0);

  /* ======================= 楼层静态几何缓存 =======================
   * base.*   用户元素在全局数组里的起始下标（随当前楼层变化）
   * levelGeo 当前楼层的静态几何快照（纯户型数据，用户增量之外的部分）
   * planGeos 户型为某层单独定义的几何（如 loft 夹层的隔断）
   */
  const geo = {
    base: { walls: WALLS.length, wins: WINS.length, doors: DOORS.length, slides: SLIDES.length, rooms: ROOMS.length },
    levelGeo: null,
    planGeos: {}
  };

  const snapshotGeo = () => ({
    walls: WALLS.slice(), wins: WINS.slice(), doors: DOORS.slice(), slides: SLIDES.slice(),
    lintels: LINTELS.slice(), rooms: ROOMS.slice(), bounds: { ...BOUNDS }
  });

  const markBase = () => {
    geo.base.walls = WALLS.length;
    geo.base.wins = WINS.length;
    geo.base.doors = DOORS.length;
    geo.base.slides = SLIDES.length;
    geo.base.rooms = ROOMS.length;
    geo.levelGeo = snapshotGeo();
  };

  const loadPlanGeos = g => { geo.planGeos = (g && g.levelGeos) || {}; };

  const flatGeo = () => ({
    walls: [], wins: [], doors: [], slides: [], lintels: [], rooms: [], bounds: geo.levelGeo.bounds
  });

  const levelGeoOf = lv => (!lv ? geo.levelGeo : (geo.planGeos[lv.id] || (lv.own ? flatGeo() : geo.levelGeo)));

  geo.levelGeo = snapshotGeo();
  try { geo.planGeos = makePlan(state.planId || DEFAULT_PLAN).levelGeos || {}; } catch (e) { geo.planGeos = {}; }

  /* ======================= 变更订阅（3D 同步） ======================= */
  const listeners = new Set();
  function onPlanChange(fn){
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  const emit = () => { for (const fn of listeners) fn(); };

  return {
    uiStore, viewStore, ui, view,
    state, planId, planVersion,
    geo, snapshotGeo, markBase, loadPlanGeos, flatGeo, levelGeoOf,
    onPlanChange, emit
  };
}
