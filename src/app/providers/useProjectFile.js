/* ============================================================================
 *  方案文件读写（导出 / 导入）
 *
 *  导出内容 = 方案数据本身：所有楼层（levels + levelData）、家具、房间与区域、
 *  墙体 / 门窗、拆改记录、测量线等。不包含 2D/3D 视图状态。
 *
 *  导入复用 plan.importPlan：负责版本迁移、户型几何切换、几何重建与撤销栈。
 *  旧版裸 state 文件、以及带 view 字段的旧导出文件仍然可读（忽略 view）。
 * ========================================================================== */
import { usePlanStore } from '@/stores/index.js';
import { buildProjectDocument, readProjectDocument, projectFileName } from '@/core/io/project.js';
import { planName } from '@/core/plans/index.js';
import { lang } from '@/i18n.js';

/** 导出文档：返回 { name, text }，由调用方负责落盘 */
export function exportProjectJSON(){
  const plan = usePlanStore();
  /* planId 决定导入时切到哪套户型几何：默认户型下 state 里可能没有这个字段，这里补上 */
  const doc = buildProjectDocument({ plan: { ...plan.state, planId: plan.planId } });
  return {
    name: projectFileName(planName(plan.planId, lang.value)),
    text: JSON.stringify(doc, null, 2)
  };
}

/**
 * 应用文档（raw 为已解析的 JSON）。
 * 抛出异常时调用方负责提示；成功时返回 { legacy }。
 */
export function applyProjectDocument(raw){
  const plan = usePlanStore();
  const { plan: planState, legacy } = readProjectDocument(raw);
  plan.importPlan(planState);
  return { legacy };
}
