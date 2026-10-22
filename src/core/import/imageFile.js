/* ============================================================================
 *  读取用户选择的户型图片
 *
 *  只在内存里处理：File → ImageBitmap → 降采样 canvas → ImageData，
 *  不做任何持久化（方案里只保存识别出来的几何，原始图片随会话丢弃）。
 * ========================================================================== */

/** 建一个离屏画布（优先 OffscreenCanvas，避免往 DOM 里塞临时节点） */
function makeCanvas(w, h){
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/**
 * 解码 + 降采样。
 * @param {File|Blob} file
 * @param {number} maxEdge 长边上限（像素）；越大越准，越慢
 * @returns {Promise<{data:Uint8ClampedArray,width:number,height:number,scale:number}>}
 */
export async function readImage(file, maxEdge = 1400){
  let bmp;
  try {
    // imageOrientation: 手机拍照的 EXIF 方向要在这里纠正，否则识别会整体转向
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e){
    bmp = await createImageBitmap(file);
  }

  const scale = Math.min(1, maxEdge / Math.max(bmp.width || 1, bmp.height || 1));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);              // 透明 PNG 先垫白底，否则灰度会全黑
  ctx.drawImage(bmp, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  bmp.close?.();
  return { data: img.data, width: w, height: h, scale };
}

/** 原生尺寸（用于弹窗里等比显示原图，避免二次解码） */
export async function imageSize(file){
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return size;
  } catch (e){
    return { width: 1, height: 1 };
  }
}
