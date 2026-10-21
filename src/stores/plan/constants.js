import { tr } from '@/i18n.js';

/* 各类元素在 state.demolished / state.elemNames 里用的 id 前缀 */
export const ELEM_PFX   = { wall: 'w', win: 'nw', door: 'nd', slide: 'ns' };
export const OPEN_PFX   = ELEM_PFX;
export const OPEN_KEY   = { win: 'wins', door: 'doors', slide: 'slides' };
export const WALL_TXT   = { b: () => tr('承重墙', 'Bearing wall'), e: () => tr('外墙', 'Exterior wall'),
                     n: () => tr('非承重墙', 'Partition wall'), g: () => tr('玻璃墙面', 'Glass wall'),
                     low: () => tr('矮墙', 'Low wall') };
export const WALL_EN    = { b: 'bearing wall', e: 'exterior wall', n: 'partition wall', g: 'glass wall', low: 'low wall' };

/* 用户绘制的「区域」：默认名称 / 默认地面材料（暖色地砖） */
export const REGION_NAME = '区域';
export const REGION_MAT  = 'tile800';
export const REGION_MIN_AREA = 0.02;            // m²：小于此面积的碎片直接丢弃

/* 户型自带区域的版本号：+1 时会把旧版本内置区域换成新版本（当前：入户区 → 入户走廊） */
export const REGION_SEED_VER = 2;
export const LEGACY_REGION_IDS = ['entry'];     // 旧版本内置区域 id（只可能是内置的，用户区域都是 rg…）
