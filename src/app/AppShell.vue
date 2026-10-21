<template>
  <div class="app" ref="rootEl"
    :class="{ 'hide-lib': panes.hideLib, 'hide-panel': panes.hidePanel, 'drawer-panel': drawerPanel }">

    <!-- 工作区：整屏铺满，2D 平面 / 3D 场景 -->
    <Workspace/>

    <!-- 界面骨架：所有区域都是悬浮的磨砂卡片 -->
    <div class="ui-layer">

      <!-- 标题菜单栏 -->
      <GlassCard tag="header" class="ui-top">
        <AppHeader/>
      </GlassCard>

      <div class="ui-middle">
        <!-- 组件面板 -->
        <GlassCard tag="aside" class="ui-left" :class="{ open: drawerOpen === 'lib' }">
          <LibPanel/>
        </GlassCard>

        <!-- 辅助浮层（工作区浮动控件） -->
        <OverlayLayer class="ui-center"/>

        <!-- 属性面板 -->
        <GlassCard tag="aside" class="ui-right" :class="{ open: drawerOpen === 'panel' }">
          <PropPanel/>
        </GlassCard>
      </div>

      <!-- 状态栏 -->
      <GlassCard tag="footer" class="ui-bottom">
        <StatusBar/>
      </GlassCard>
    </div>
  </div>
</template>

<script setup>
/* ============================================================================
 *  应用骨架：把界面分成五个区域
 *
 *    ┌──────────── 标题菜单栏 ────────────┐
 *    │ 组件面板 │      工作区      │ 属性面板 │
 *    └────────────── 状态栏 ──────────────┘
 *
 *  - 工作区（Workspace）绝对定位铺满整屏，最底层
 *  - 其余区域放在 .ui-layer 中，用 flex 排布成一层层悬浮卡片
 *  - .ui-layer / .ui-center 不接收指针事件，空白处仍可操作画布
 *  - 窄屏下左右面板转为抽屉，卡片细节全部由样式表描述
 * ========================================================================== */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import GlassCard from '@/shared/ui/GlassCard.vue';
import Workspace from '@/workspace/Workspace.vue';
import OverlayLayer from '@/shell/overlay/OverlayLayer.vue';
import AppHeader from '@/shell/header/AppHeader.vue';
import LibPanel from '@/shell/left-panel/LibPanel.vue';
import PropPanel from '@/shell/right-panel/PropPanel.vue';
import StatusBar from '@/shell/status-bar/StatusBar.vue';
import { useUiStore } from '@/stores/index.js';

const uiStore = useUiStore();
const { panes, drawerOpen, narrowMode } = storeToRefs(uiStore);

/* 窄屏：属性抽屉打开时让出底部工具条 */
const drawerPanel = computed(() => narrowMode.value && drawerOpen.value === 'panel');

/* 标题栏 / 状态栏实际高度写入 CSS 变量，供工作区内的浮层避让 */
const rootEl = ref(null);
let ro = null;

function syncVars(){
  const root = rootEl.value;
  if (!root) return;
  const top = root.querySelector('.ui-top');
  const bottom = root.querySelector('.ui-bottom');
  root.style.setProperty('--ui-top-h', (top ? top.offsetHeight : 0) + 'px');
  root.style.setProperty('--ui-bottom-h', (bottom ? bottom.offsetHeight : 0) + 'px');
}

onMounted(() => {
  ro = new ResizeObserver(syncVars);
  const top = rootEl.value?.querySelector('.ui-top');
  const bottom = rootEl.value?.querySelector('.ui-bottom');
  if (top) ro.observe(top);
  if (bottom) ro.observe(bottom);
  syncVars();
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
});
</script>
