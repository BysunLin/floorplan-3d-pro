<template>
  <!-- 启动首页：选样板间 / 继续编辑；进入后才挂载编辑器 -->
  <StartScreen v-if="showStart" mode="boot" @enter="enterEditor"/>
  <AppShell v-else/>
  <!-- 编辑中从顶部「开始」打开：盖在编辑器上，可 Esc / × 返回编辑 -->
  <StartScreen v-if="!showStart && ui.startOpen" mode="overlay" @close="closeStart"/>
  <AiConfigDialog/>
  <ToastHost/>
</template>

<script setup>
/* ============================================================================
 *  应用入口：只负责全局生命周期与快捷键，
 *  界面结构全部在 components/layout/AppShell.vue 里按区域组装。
 * ========================================================================== */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import AppShell from '@/app/AppShell.vue';
import StartScreen from '@/app/StartScreen.vue';
import ToastHost from '@/shared/ui/ToastHost.vue';
import AiConfigDialog from '@/ai/AiConfigDialog.vue';
import { storeToRefs } from 'pinia';
import { useUiStore } from '@/stores/index.js';
import { initLang } from '@/i18n.js';
import { narrow } from '@/core/model/plan.js';
import { installShortcuts } from '@/app/providers/useShortcuts.js';
import { installFullscreenSync } from '@/app/providers/useFullscreen.js';
import { maybeStartAgentBridge } from '@/bridge/agentBridge.js';
import { markEditingSession } from '@/app/providers/useSession.js';

const uiStore = useUiStore();
const { viewMode, narrowMode, drawerOpen } = storeToRefs(uiStore);
const { ui } = uiStore;
const { drawer, closeStart } = uiStore;

let removeShortcuts = null;
let removeFsSync = null;
let stopAgentBridge = null;

/* 启动首页：默认展示，选完样板间 / 继续编辑后进入编辑器 */
const showStart = ref(true);

/* body.m3d —— 控制 only2d / only3d 的显示 */
watch(viewMode, m => document.body.classList.toggle('m3d', m === '3d'), { immediate: true });

/** 进入编辑器：挂载 AppShell 并接管快捷键（首页上不响应 Delete / Ctrl+Z 之类） */
function enterEditor(){
  showStart.value = false;
  markEditingSession();        // 下次打开时「正在编辑」才会出现
  if (!removeShortcuts) removeShortcuts = installShortcuts();
}

/* ---------------- 生命周期 ---------------- */
function onResize(){
  const n = narrow();
  if (n !== narrowMode.value){
    narrowMode.value = n;
    if (!n) drawerOpen.value = '';
    else drawer(null);
  }
}

/* 点击菜单或其子菜单以外的任何位置时收起所有下拉菜单 */
function onDocPointerDown(e){
  document.querySelectorAll('details.menu').forEach(d => {
    if (d.open && !d.contains(e.target)) d.open = false;
  });
}

onMounted(() => {
  initLang();
  // 快捷键等编辑器挂载后再装：首页上按 Delete / Ctrl+Z 不该动到方案数据
  removeFsSync = installFullscreenSync();
  /* MCP 实时预览桥：只有 ?agent=1 或 localStorage 开启时才生效 */
  stopAgentBridge = maybeStartAgentBridge();
  addEventListener('resize', onResize);
  document.addEventListener('pointerdown', onDocPointerDown);
  onResize();
});

onBeforeUnmount(() => {
  removeShortcuts?.();
  removeFsSync?.();
  stopAgentBridge?.();
  removeEventListener('resize', onResize);
  document.removeEventListener('pointerdown', onDocPointerDown);
  document.body.classList.remove('m3d');
});
</script>
