/* ============================================================================
 *  3D 画质档位（性能）
 *
 *  菜单：3D 场景 → 视图 → 性能 → 推荐 / 低 / 中 / 高
 *  「推荐」按当前平台与机器配置自动落到 低 / 中 / 高 之一（触屏或低配 → 低）。
 *
 *  档位只控制「渲染开销」，不影响方案数据：
 *    dpr        渲染像素比上限（devicePixelRatio 封顶）
 *    aa         抗锯齿（仅创建渲染器时生效，运行期切换需重新进入 3D）
 *    shadow     是否投影阴影；shadowType / shadowSize 为阴影贴图类型与分辨率
 *    lampDay    白天点光源上限（每盏点光源都会进入所有材质的着色循环）
 *    lampNight  夜景点光源上限
 *    env        是否生成环境反射贴图（PMREM，主要影响金属 / 玻璃质感）
 * ========================================================================== */
import { COARSE } from '@/core/model/plan.js';
import { tr } from '@/i18n.js';

/** 菜单项：'auto' = 推荐（按设备在低 / 中 / 高里挑一个直接应用，不是一个独立档位） */
export const QUALITY_ITEMS = [
  { k: 'auto', name: '推荐', en: 'Auto' },
  { k: 'low',  name: '低',   en: 'Low' },
  { k: 'mid',  name: '中',   en: 'Medium' },
  { k: 'high', name: '高',   en: 'High' },
];

export const QUALITY_PRESETS = {
  low:  { dpr: 1,   aa: false, shadow: false, shadowType: 'basic', shadowSize: 512,
          lampDay: 0, lampNight: 4,        env: false },
  mid:  { dpr: 1.5, aa: true,  shadow: true,  shadowType: 'pcf',   shadowSize: 1024,
          lampDay: 4, lampNight: 8,        env: true },
  high: { dpr: 2,   aa: true,  shadow: true,  shadowType: 'soft',  shadowSize: 2048,
          lampDay: 4, lampNight: Infinity, env: true },
};

/**
 * 设备能力探测 → 推荐档位。
 * 触屏 / 低核心 / 低内存 → 低；多核且内存充足 → 高；其余 → 中。
 * 注：`deviceMemory` 仅 Chromium 支持，其它浏览器按 8GB 估计。
 */
export function detectQuality(){
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || (COARSE ? 2 : 8);
  if (COARSE || cores <= 4 || mem <= 4) return 'low';
  if (cores >= 12 && mem >= 8) return 'high';
  return 'mid';
}

/** 'auto'（或非法值）→ 探测出来的实际档位 */
export const resolveQuality = q => (q === 'auto' || !QUALITY_PRESETS[q]) ? detectQuality() : q;

/** 档位 → 预设（'auto' 也会被解析成具体档位） */
export const qualityPreset = q => QUALITY_PRESETS[resolveQuality(q)];

/** 档位文案：'low' → 低（用于提示条 / 悬停说明） */
export const qualityName = k => {
  const it = QUALITY_ITEMS.find(i => i.k === k);
  return it ? tr(it.name, it.en) : k;
};

/** 档位按钮的悬停说明（「推荐」里附带当前探测到的档位） */
export function qualityTitle(k){
  const auto = resolveQuality('auto');
  const txt = { low: tr('低', 'Low'), mid: tr('中', 'Medium'), high: tr('高', 'High') }[auto];
  if (k === 'auto')
    return tr(`按当前设备自动选择画质（推荐：${txt}）`, `Pick a quality level from this device (suggested: ${txt})`);
  if (k === 'low')
    return tr('低画质：关闭阴影与环境反射、降低像素比与灯光数量（最省资源，适合低配 / 卡顿时）',
      'Low: no shadows or reflections, lower pixel ratio and light count (best for weak devices)');
  if (k === 'mid')
    return tr('中画质：基础阴影 + 4 盏室内灯 + 环境反射（默认平衡档）',
      'Medium: basic shadows, up to 4 interior lights and reflections (balanced)');
  return tr('高画质：柔和阴影 + 更多灯光 + 2× 像素比（最清晰，也最吃性能）',
    'High: soft shadows, more lights and 2× pixel ratio (sharpest, heaviest)');
}
