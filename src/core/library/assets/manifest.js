/* 自动生成 + 手工可读 —— 由 mcp 的 asset_create / asset_update 维护。
 * 目录约定：assets/<type>/{icon.js|icon.svg, model.js}；详见 mcp/docs/asset-authoring.md
 * ========================================================================== */

export const ASSET_MANIFEST = [
  { type: 'sideboard', name: '玄关条案', cat: '客厅', w: 1400, d: 420, h: 800, color: '#e2cfb4' },
  { type: 'plantstand', name: '花架', cat: '客厅', w: 400, d: 400, h: 1180, color: '#c9a06a' }
];

/** type → 元数据，供 3D 建模读取高度等信息 */
export const ASSET_META = Object.fromEntries(ASSET_MANIFEST.map(a => [a.type, a]));
