<template>
  <AppShell/>
  <AiConfigDialog/>
  <ToastHost/>
</template>

<script setup>
/* ============================================================================
 *  应用入口：只负责全局生命周期与快捷键，
 *  界面结构全部在 components/layout/AppShell.vue 里按区域组装。
 * ========================================================================== */
import { watch, onMounted, onBeforeUnmount } from 'vue';
import AppShell from '@/app/AppShell.vue';
import ToastHost from '@/shared/ui/ToastHost.vue';
import AiConfigDialog from '@/ai/AiConfigDialog.vue';
import { storeToRefs } from 'pinia';
import { useUiStore } from '@/stores/index.js';
import { initLang } from '@/i18n.js';
import { narrow } from '@/core/model/plan.js';
import { installShortcuts } from '@/app/providers/useShortcuts.js';
import { installFullscreenSync } from '@/app/providers/useFullscreen.js';
import { maybeStartAgentBridge } from '@/bridge/agentBridge.js';

const uiStore = useUiStore();
const { viewMode, narrowMode, drawerOpen } = storeToRefs(uiStore);
const { drawer } = uiStore;

let removeShortcuts = null;
let removeFsSync = null;
let stopAgentBridge = null;

/* body.m3d —— 控制 only2d / only3d 的显示 */
watch(viewMode, m => document.body.classList.toggle('m3d', m === '3d'), { immediate: true });

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
  removeShortcuts = installShortcuts();
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
