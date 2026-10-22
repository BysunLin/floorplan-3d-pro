/* ============================================================================
 *  View Store —— 2D 平面图视口
 *
 *  只负责「怎么看」：平移 / 缩放变换、画布尺寸、鼠标坐标，以及由它们派生
 *  出来的 viewBox、比例文字、比例尺。不碰任何方案数据或编辑逻辑。
 * ========================================================================== */
import { reactive, computed } from 'vue';
import { defineStore } from 'pinia';
import { PX_MM, BOUNDS, clampScale } from '@/core/model/plan.js';

export const useViewStore = defineStore('view', () => {
  /* 视口变换：x0/y0 为画布左上角对应的户型坐标(mm)，s 为缩放（px/mm） */
  const view = reactive({ x0: 0, y0: 0, s: 0.06 });
  /* 画布尺寸（由 PlanCanvas 的 ResizeObserver 写入） */
  const size = reactive({ w: 0, h: 0 });
  /* 鼠标位置 / 悬停房间（页脚显示） */
  const cursor = reactive({ x: null, y: null, hover: '' });

  /** viewBox 随 view 与画布尺寸自动计算，无需手动写 DOM */
  const viewBox = computed(() =>
    `${view.x0} ${view.y0} ${(size.w || 1)/view.s} ${(size.h || 1)/view.s}`);

  /** 当前显示比例，如 1:60 */
  const ratioText = computed(() => '1:' + Math.round(1/(view.s * PX_MM)));

  /** 比例尺：挑一个「长度不小于 60px」的整齐刻度（大平面会用到 10~100 m 档） */
  const scaleBar = computed(() => {
    const nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]
      .find(v => v * view.s >= 60) || 100000;
    return { px: nice * view.s, text: nice >= 1000 ? `${nice/1000} m` : `${nice} mm` };
  });

  /** 适应窗口：铺满视口；大平面下把缩放下限放开到 MIN_SCALE（商场 / 厂房也能整屏看） */
  function fitView(){
    if (!size.w || !size.h) return;
    view.s = clampScale(Math.min(size.w/BOUNDS.w, size.h/BOUNDS.h));
    view.x0 = BOUNDS.x - (size.w/view.s - BOUNDS.w)/2;
    view.y0 = BOUNDS.y - (size.h/view.s - BOUNDS.h)/2;
  }

  /** 以屏幕点 (mx,my) 为锚点缩放到 ns */
  function zoomAt(ns, mx, my){
    ns = clampScale(ns);
    const px = view.x0 + mx/view.s, py = view.y0 + my/view.s;
    view.s = ns;
    view.x0 = px - mx/ns;
    view.y0 = py - my/ns;
  }

  const zoomCenter = k => zoomAt(view.s * k, size.w/2, size.h/2);
  const setRatio  = r => zoomAt(1/(r * PX_MM), size.w/2, size.h/2);

  /** 屏幕坐标 → 户型坐标（mm） */
  function toMM(e, svgEl){
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  }

  return {
    view, size, cursor,
    viewBox, ratioText, scaleBar,
    fitView, zoomAt, zoomCenter, setRatio, toMM
  };
});
