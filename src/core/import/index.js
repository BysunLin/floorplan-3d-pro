/* ============================================================================
 *  户型图导入的门面
 *
 *  对外只暴露两个函数：
 *    analyzeFloorPlan(file)   选图后跑一遍识别（Web 轻量版）
 *    buildGeo(det, widthMM)   按「实际总宽」重新换算一次几何（弹窗里调比例，
 *                             不重新识别，纯标量缩放，毫秒级）
 *
 *  桌面版（Electron + Python）以后只需要新增一个 detect 实现，
 *  返回同样结构的 det，这里以下全部逻辑可直接复用。
 * ========================================================================== */
import { tr } from '@/i18n.js';
import { readImage } from './imageFile.js';
import { detectFloorPlan } from './web/detect.js';
import { toGeo } from './toGeo.js';

/**
 * 识别一张户型图。
 * @param {File|Blob} file
 * @param {{maxEdge?:number,totalWidthMM?:number,window?:number,bias?:number}} opts
 * @returns {Promise<{det:Object, geo:Object, meta:Object}>}
 */
export async function analyzeFloorPlan(file, opts = {}){
  const img = await readImage(file, opts.maxEdge || 1400);
  const det = detectFloorPlan(img, opts);

  if (!det.walls.length)
    throw new Error(tr(
      '没有识别到墙体，请换一张对比度更高、墙体更清楚的户型图',
      'No walls detected — try a clearer, higher-contrast floor plan'
    ));

  det.image = { width: img.width, height: img.height };
  const { geo, meta } = toGeo(det, { totalWidthMM: opts.totalWidthMM });
  return { det, geo, meta };
}

/** 批量调整比例：只做像素 → 毫米的重新换算，不重新识别 */
export function buildGeo(det, totalWidthMM){
  return toGeo(det, { totalWidthMM });
}

export { detectFloorPlan, readImage };
