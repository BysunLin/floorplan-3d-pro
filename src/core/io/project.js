/* ============================================================================
 *  方案文件格式（导出 / 导入共用）
 *
 *  只保存「方案本身」：楼层、家具、房间与区域、墙体门窗、拆改与测量等。
 *  不保存 2D/3D 视图状态（当前模式、视口、相机、图层开关），
 *  导入后由应用按默认视图展示。
 *
 *  兼容：旧版本导出的是裸 state（顶层直接是 furniture / levels …），读取时自动识别；
 *  带 view 字段的旧文件也能读，只是忽略其中的显示状态。
 * ========================================================================== */
export const PROJECT_FORMAT = 'floorplan-3d-pro';
export const PROJECT_VERSION = 1;

/**
 * 组装导出文档。
 * @param {{ plan: object, appVersion?: string }} input
 */
export function buildProjectDocument({ plan, appVersion = '' } = {}){
  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_VERSION,
    app: { name: 'floorplan-3d-pro', version: appVersion },
    exportedAt: new Date().toISOString(),
    plan
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
  if (!raw.plan || !Array.isArray(raw.plan.furniture))
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
