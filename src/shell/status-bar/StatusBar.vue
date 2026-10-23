<template>
  <div class="statusbar">
    <span class="only2d">X <b id="cx">{{ cursor.x ?? '—' }}</b></span>
    <span class="only2d">Y <b id="cy">{{ cursor.y ?? '—' }}</b></span>
    <span class="only2d">
      <span>{{ tr('当前比例', 'Scale') }}</span> <b id="ratio">{{ ratioText }}</b>
    </span>
    <span id="hover" class="only2d" v-html="cursor.hover"></span>

    <!-- 3D 性能 HUD：视图 → 性能 HUD 控制显隐 -->
    <span v-if="viewMode === '3d' && opt.perfHud" class="perf only3d">
      <b>{{ perf.fps }}</b> FPS
      · <b>{{ perf.calls }}</b> {{ tr('绘制调用', 'draw calls') }}
      · <b>{{ fmt(perf.tris) }}</b> {{ tr('三角面', 'tris') }}
      · {{ tr('家具', 'furniture') }} <b>{{ perf.furn }}</b>
      · {{ tr('实例', 'instances') }} <b>{{ perf.inst }}</b>
      · {{ tr('墙段', 'wall runs') }} <b>{{ perf.walls }}</b>
      · {{ tr('阴影', 'shadow') }} <b>{{ perf.shadow ? tr('开', 'on') : tr('关', 'off') }}</b>
    </span>

    <span class="spacer"></span>
    <span id="tip">{{ tip }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useUiStore, useViewStore } from '@/stores/index.js';
import { tr } from '@/i18n.js';
import { COARSE } from '@/core/model/plan.js';

/* 状态栏右侧的操作提示：粗指针设备（触屏）与鼠标各一套文案 */
const TIPS = () => COARSE
  ? {'2d': tr('点或拖动家具库添加 · 单指拖动平移 · 双指缩放 · 选中家具后底部工具条可旋转 / 复制 / 删除', 'Tap or drag from the library · 1 finger pans · pinch zooms · bottom bar rotates / duplicates / deletes'),
     '3d': tr('单指旋转 · 双指缩放 / 平移 · 点家具或地面编辑 · 点门开关', '1 finger orbits · 2 fingers zoom / pan · tap furniture or floor to edit · tap doors to open')}
  : {'2d': tr('拖动左侧家具到平面图 · 滚轮缩放 · 拖动空白处平移 · T 切换 3D', 'Drag furniture onto the plan · scroll to zoom · drag empty space to pan · T for 3D'),
     '3d': tr('3D 场景与平面方案实时同步 · 右侧面板修改会立即生效 · T 返回 2D', '3D stays in sync with the plan · panel edits apply instantly · T for 2D')};

const viewStore = useViewStore();
const uiStore = useUiStore();
const { cursor } = viewStore;
const { ratioText } = storeToRefs(viewStore);
const { viewMode, perf, opt } = storeToRefs(uiStore);

const tip = computed(() => TIPS()[viewMode.value]);
const fmt = n => {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v/1e3).toFixed(1) + 'k';
  return String(Math.round(v));
};
</script>
