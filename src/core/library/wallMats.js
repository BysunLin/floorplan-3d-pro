/* ============================================================================
 *  墙面材质（非承重墙的「材质」属性）
 *
 *  拆改墙体里不再单独提供「玻璃墙面」组件：玻璃只是非承重墙的一种材质。
 *
 *  id      材质键（存 state.wallMats['w' + 墙体下标]）
 *  name/en 面板文案
 *  fill    2D 平面图填充色
 *  color   3D 墙面色（玻璃走 glassWall 模型，这里只作面板色块用）
 *  rough   PBR 粗糙度 / metal 金属度（3D 材质）
 *  glass   true = 3D 用「玻璃墙」模型（透明玻璃板 + 铝框），且门窗洞口按玻璃处理
 * ========================================================================== */

export const DEFAULT_WALL_MAT = 'paint';

export const WALL_MATS = [
  { id: 'paint',     name: '乳胶漆',  en: 'Paint',       fill: '#a7a195', color: '#f4f1eb', rough: .92 },
  { id: 'wallpaper', name: '墙纸',    en: 'Wallpaper',   fill: '#b6ad9c', color: '#eee4d4', rough: .96 },
  { id: 'wood',      name: '木饰面',  en: 'Wood panel',  fill: '#c2a480', color: '#c9a678', rough: .55 },
  { id: 'tile',      name: '瓷砖',    en: 'Tile',        fill: '#c3ced3', color: '#e6ebee', rough: .22, metal: .05 },
  { id: 'stone',     name: '石材',    en: 'Stone',       fill: '#c6c2b9', color: '#d8d5cd', rough: .35 },
  { id: 'brick',     name: '文化砖',  en: 'Brick',       fill: '#b8785f', color: '#b9715b', rough: .9 },
  { id: 'glass',     name: '玻璃',    en: 'Glass',       fill: '#dceef5', color: '#cfe6ef', rough: .05, glass: true },
];

export const WALL_MAT_IDS = WALL_MATS.map(m => m.id);

/** 取材质；未知 / 空 → 默认（乳胶漆，与原来的墙体外观一致） */
export const wallMat = id => WALL_MATS.find(m => m.id === id) || WALL_MATS[0];

/** 该材质是否为玻璃（3D 用玻璃墙模型，2D 用玻璃配色，门窗洞口按玻璃处理） */
export const isGlassMat = id => !!wallMat(id).glass;
