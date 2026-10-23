/* ============================================================================
 *  导出落盘（顶部菜单与启动界面共用）
 *
 *  · downloadBlob  浏览器下载
 *  · saveProjectJSON 方案 JSON（楼层 / 家具 / 区域 / 墙体）
 *  · exportPlanPNG  2D 平面图 → PNG（依赖编辑器里的 #plan SVG，未挂载时返回 false）
 * ========================================================================== */
import { BOUNDS } from '@/core/model/plan.js';
import { useUiStore } from '@/stores/index.js';
import { tr } from '@/i18n.js';
import { exportProjectJSON } from './useProjectFile.js';

/** 触发浏览器下载 */
export function downloadBlob(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 导出方案 JSON；失败时抛错由调用方提示 */
export function saveProjectJSON(){
  const { name, text } = exportProjectJSON();
  downloadBlob(name, new Blob([text], { type: 'application/json' }));
  return name;
}

/**
 * 2D 平面图导出 PNG。
 * @returns {boolean} 是否成功发起导出（页面上没有 #plan 时 false）
 */
export function exportPlanPNG(){
  const { ui } = useUiStore();
  const svg = document.querySelector('#plan');
  if (!svg) return false;

  const clone = svg.cloneNode(true), W = 3200, H = Math.round(W * BOUNDS.h / BOUNDS.w);
  clone.setAttribute('viewBox', `${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}`);
  clone.setAttribute('width', W);
  clone.setAttribute('height', H);
  const selEl = clone.querySelector('#gSel');
  if (selEl) selEl.innerHTML = '';
  const gridEl = clone.querySelector('#gGrid');
  if (gridEl){
    gridEl.innerHTML = `<rect x="-20000" y="-20000" width="55000" height="55000" fill="${ui.layers.grid ? 'url(#grid)' : '#f7f4ee'}"/>`;
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x: -20000, y: -20000, width: 55000, height: 55000, fill: '#f7f4ee' })
      .forEach(([k, v]) => bg.setAttribute(k, v));
    clone.insertBefore(bg, gridEl);
  }
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(img, 0, 0, W, H);
    cv.toBlob(b => downloadBlob(tr('户型装修方案', 'floor-plan-design') + '.png', b));
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  return true;
}
