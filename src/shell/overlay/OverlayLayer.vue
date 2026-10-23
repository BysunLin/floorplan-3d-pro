<template>
  <!-- 辅助浮层：工作区上方的浮动控件（楼层切换 / 模式提示 / 比例尺 / 选中工具条） -->
  <div class="overlay-layer">
    <!-- 左上角：收起的左侧面板（浮层按钮）+ 楼层切换 -->
    <div class="overlay-corner tl">
      <button v-if="libCollapsed" class="pane-chip" :title="tr('展开家具库', 'Show library')"
        @click="expandPane('lib')">
        <span class="ico" aria-hidden="true">◧</span>{{ tr('家具库', 'Library') }}
      </button>
      <LevelBar/>
      <!-- 总图档工具条：选择 / 放楼栋 / 画道路 -->
      <SiteBar v-if="siteMode"/>
    </div>

    <!-- 右上角：收起的右侧属性面板 -->
    <div class="overlay-corner tr">
      <button v-if="panelCollapsed" class="pane-chip" :title="tr('展开属性面板', 'Show properties')"
        @click="expandPane('panel')">
        <span class="ico" aria-hidden="true">◨</span>{{ tr('属性', 'Properties') }}
      </button>
    </div>

    <div class="modehint" :class="{show: !!modeHint}">{{ modeHint }}</div>

    <div class="scalebar">
      <span>{{ scaleBar.text }}</span>
      <div class="bar" :style="{width: scaleBar.px + 'px'}"></div>
    </div>

    <!-- 右下角：AI 设计助手（与比例尺 / 楼层浮窗同一套定位，跟随属性面板） -->
    <AiPanel/>

    <!-- 右键菜单（替代原来的底部选中浮窗） -->
    <ContextMenu/>
  </div>
</template>

<script setup>
/* ============================================================================
 *  辅助浮层：悬浮在工作区上方、但不属于任何面板的控件集合。
 *  该层自身不接收指针事件，只有具体控件接收，点击空白处仍作用于平面图。
 * ========================================================================== */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import LevelBar from '@/shell/overlay/LevelBar.vue';
import SiteBar from '@/shell/overlay/SiteBar.vue';
import ContextMenu from '@/shell/overlay/ContextMenu.vue';
import AiPanel from '@/ai/AiPanel.vue';
import { useUiStore, useViewStore } from '@/stores/index.js';
import { COARSE } from '@/core/model/plan.js';
import { lodOf, LOD } from '@/core/model/lod.js';
import { tr } from '@/i18n.js';

const uiStore = useUiStore();
const viewStore = useViewStore();
const { ui } = uiStore;
const { view, scaleBar } = storeToRefs(viewStore);
const { expandPane, paneCollapsed } = uiStore;

/** 总图档（缩到 1:N > 2500）：换成总图工具条 */
const siteMode = computed(() => lodOf(view.value.s) === LOD.SITE);

/* 宽屏下左侧 / 右侧面板收起后，在对应角落显示浮层按钮（窄屏为抽屉，不显示） */
const libCollapsed   = computed(() => paneCollapsed('lib'));
const panelCollapsed = computed(() => paneCollapsed('panel'));

/* 当前操作模式的顶部提示条 */
const modeHint = computed(() => {
  if (ui.regionDraw && ui.regionDraw.a){
    return tr('点第二点确定区域 B · 吸附墙体 / 已有区域的顶点与边线 · 区域内墙体门窗自动扣除 · 右键 / Esc 取消',
      'Click the second point to finish · snaps to wall / area corners and edges · walls and openings are cut out · right-click / Esc cancels');
  }
  if (ui.regionDraw){
    return tr('点击或拖出区域的起点 A · 靠近墙体拐角、墙体边缘、已有区域顶点 / 边线会自动吸附 · 区域必须与墙体或已有区域相连 · 右键 / Esc 取消',
      'Click or drag the start point A · snaps to wall corners / edges and existing area corners / edges · the area must touch a wall or an existing area · right-click / Esc cancels');
  }
  if (ui.tool === 'measure'){
    return COARSE
      ? tr('按住拖出测量线，或依次点两点 · 靠近墙面自动吸附 · 点「选择」退出', 'Hold and drag a line, or tap two points · snaps to walls · tap "Select" to exit')
      : tr('点击两点（或按住拖动）测量距离 · 靠近墙面自动吸附 · Shift 锁定水平/垂直 · Esc 取消', 'Click two points (or drag) to measure · snaps to walls · Shift locks horizontal/vertical · Esc cancels');
  }
  return '';
});
</script>
