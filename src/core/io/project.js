/* ============================================================================
 *  方案文件格式（导出 / 导入共用）
 *
 *  只保存「方案本身」：楼层、家具、房间与区域、墙体门窗、拆改与测量等。
 *  不保存 2D/3D 视图状态（当前模式、视口、相机、图层开关），
 *  导入后由应用按默认视图展示。
 *
 *  v2（当前）：墙 / 门窗 / 区域 / 家具以节点图（nodes[levelId]）保存，
 *             对应的扁平数组在导入时由 core/nodes/document.js 投影出来。
 *  v1：plan 里直接存扁平数组。
 *
 *  兼容：v1 文件、旧版裸 state（顶层直接是 furniture / levels …）都能读；
 *  带 view 字段的旧文件也能读，只是忽略其中的显示状态。
 * ========================================================================== */
import { splitDocumentPlan, joinDocumentPlan } from '@/core/nodes/document.js';

export const PROJECT_FORMAT = 'floorplan-3d-pro';
export const PROJECT_VERSION = 2;

/**
 * 组装导出文档：plan 去掉投影字段，节点图单独放在 nodes。
 * @param {{ plan: object, appVersion?: string }} input
 */
export function buildProjectDocument({ plan, appVersion = '' } = {}){
  const { plan: docPlan, nodes } = splitDocumentPlan(plan || {});
  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_VERSION,
    app: { name: 'floorplan-3d-pro', version: appVersion },
    exportedAt: new Date().toISOString(),
    plan: docPlan,
    nodes
  };
}

/**
 * 读取并校验文档，返回 { plan, legacy }。
 * 同时兼容：新格式 / 旧版裸 state / 带 view 的旧文件（忽略 view）。
 */
export function readProjectDocument(raw){
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('文件内容不是有效的方案');

  const wrapped = raw.format === PROJECT_FORMAT
    || (!!raw.plan && typeof raw.plan === 'object' && !Array.isArray(raw.plan));

  if (!wrapped){
    if (!Array.isArray(raw.furniture)) throw new Error('缺少家具数据，可能不是方案文件');
    return { plan: raw, legacy: true };
  }

  const version = Number(raw.formatVersion) || 0;
  if (version > PROJECT_VERSION)
    throw new Error(`方案版本过高（v${version}），请升级应用后再打开`);
  if (!raw.plan || typeof raw.plan !== 'object')
    throw new Error('方案数据不完整');

  // v2：以节点图为主数据，投影出墙 / 门窗 / 区域 / 家具
  if (version >= 2 && raw.nodes && typeof raw.nodes === 'object')
    return { plan: joinDocumentPlan(raw.plan, raw.nodes, { strict: true }), legacy: false };

  if (!Array.isArray(raw.plan.furniture))
    throw new Error('方案数据不完整');

  return { plan: raw.plan, legacy: false };
}

/** 导出文件名：<户型名>-YYYYMMDD-HHmm.json */
export function projectFileName(name, date = new Date()){
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}`;
  const base = String(name || 'floor-plan').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60) || 'floor-plan';
  return `${base}-${stamp}.json`;
}
