/* 自动生成 —— 由 mcp 的 asset_create / asset_update 维护，请勿手改。
 * 每项 = 参数化图标函数 (w, d, color, sdir) => svg 片段。 */
import a0 from './sideboard/icon.js';
import r1 from './plantstand/icon.svg?raw';
import { svgIcon } from './rawsvg.js';

export const ICONS = {
  'sideboard': a0,
  'plantstand': svgIcon(r1)
};
