<template>
  <!-- 属性面板内容：随选中对象切换，卡片外观由 AppShell 的 GlassCard 提供 -->
  <div id="panel">
    <!-- 面板头：宽屏点击收起为工作区右上角浮层按钮，窄屏关闭抽屉 -->
    <div class="pane-head">
      <b>{{ tr('属性', 'Properties') }}</b>
      <button class="pane-fold" :title="tr('收起为工作区右上角的浮层按钮', 'Collapse to a floating button at the top-right')"
        @click="collapsePane('panel')">» {{ tr('收起', 'Hide') }}</button>
    </div>

    <ElemPanel     v-if="elem" :key="elem.kind + elem.i" :kind="elem.kind" :i="elem.i"/>
    <FurnPanel     v-else-if="ui.sel?.kind === 'furn'" :key="'f' + ui.sel.id" :id="ui.sel.id"/>
    <RoomPanel v-else-if="roomSel" :key="'r' + ui.sel.id" :id="ui.sel.id"/>
    <OverviewPanel   v-else/>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useUiStore, ELEM_KINDS } from '@/stores/index.js';
import { ROOMS } from '@/core/model/plan.js';
import { tr } from '@/i18n.js';
import OverviewPanel from '@/shell/right-panel/panels/OverviewPanel.vue';
import RoomPanel from '@/shell/right-panel/panels/RoomPanel.vue';
import FurnPanel from '@/shell/right-panel/panels/FurnPanel.vue';
import ElemPanel from '@/shell/right-panel/panels/ElemPanel.vue';

const uiStore = useUiStore();
const { ui } = uiStore;
const { collapsePane } = uiStore;

/* 拆改墙体模式下选中的墙体 / 门窗 */
const elem = computed(() => ui.sel && ELEM_KINDS.includes(ui.sel.kind) ? ui.sel : null);
/* 选中的房间 / 区域（撤销、删区域后可能已不存在，避免面板读到空对象） */
const roomSel = computed(() => ui.sel?.kind === 'room' && ROOMS.some(r => r.id === ui.sel.id));
</script>
