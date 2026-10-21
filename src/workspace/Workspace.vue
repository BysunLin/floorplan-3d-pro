<template>
  <!-- 工作区：铺满整个屏幕，2D 平面图与 3D 场景都在这里叠放 -->
  <main id="stage" class="workspace">
    <PlanCanvas/>
    <View3DHost/>
  </main>
</template>

<script setup>
/* ============================================================================
 *  工作区：整屏画布层
 *  只负责承载 2D / 3D 两套渲染，不参与任何面板布局；
 *  is3d / animating 这两个类由 3D 引擎在场景切换时直接写到 #stage 上。
 * ========================================================================== */
import PlanCanvas from '@/workspace/plan2d/PlanCanvas.vue';
import View3DHost from '@/workspace/view3d/View3DHost.vue';
</script>
