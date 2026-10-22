/* ============================================================================
 *  导入户型图 → 方案
 *
 *  识别结果是一整套新几何，不是「在现有户型上加几段墙」，所以走「注册运行时户型 +
 *  切换户型」而不是往 state.walls 里 push：
 *    · 墙成为静态几何 → 3D 建墙 / 楼板 / 天花、面积统计、房间列表全部现成可用；
 *    · 用户后续编辑会自动转成用户增量（ensureUserElem 机制）；
 *    · 几何同时写进 state.customGeo，刷新后由 applyGeometryOnly 重建。
 *
 *  换掉整套几何后旧快照已无意义，因此清空撤销栈（导入前请在弹窗里确认）。
 * ========================================================================== */
import { registerPlan } from '@/core/plans/index.js';
import { tr } from '@/i18n.js';

export function createImported(ctx){
  const state = ctx.state;
  const uiStore = ctx.uiStore;
  const applyPlan = (...a) => ctx.applyPlan(...a);
  const clearHistory = (...a) => ctx.clearHistory(...a);

  /**
   * @param {object} geo  { walls, wins, doors, slides, lintels, rooms, regions, bounds }
   * @param {object} meta { wallCount, regionCount, area, totalWidthMM }
   * @returns {string} 新户型 id
   */
  function applyImportedGeo(geo, meta = {}){
    if (!geo || !Array.isArray(geo.walls) || !geo.walls.length)
      throw new Error(tr('导入内容为空：没有可用的墙体', 'Nothing to import — no walls found'));

    const id = 'imported-' + Date.now().toString(36);
    const name = tr('导入户型', 'Imported layout');

    // 先落到 state，applyPlan 结尾的 save() 会一起写进本地存储
    state.customGeo = geo;
    registerPlan(id, geo, name);
    applyPlan(id, { confirmMsg: false, silent: true });
    clearHistory();

    const n = meta.wallCount ?? geo.walls.length;
    const m = meta.regionCount ?? (geo.regions || []).length;
    const a = meta.area != null ? `，约 ${meta.area} m²` : '';
    uiStore.showToast(tr(
      `已导入户型：${n} 段墙体 / ${m} 个房间${a}`,
      `Layout imported — ${n} walls, ${m} rooms`
    ), 2600);
    return id;
  }

  return { applyImportedGeo };
}
