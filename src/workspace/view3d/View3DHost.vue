<template>
  <div id="view3d" ref="hostEl">
    <!-- 漫游开始提示 -->
    <div id="walkOverlay" :style="{display: overlayShow ? 'flex' : 'none'}" @click="onWalkClick">
      <div>
        <h3>{{ tr('漫游模式', 'Walk mode') }}</h3>
        <p v-for="(t, i) in walkTexts" :key="i" v-html="t"></p>
      </div>
    </div>

    <!-- 鼠标锁定时的准星 -->
    <div id="cross" :style="{display: walk.locked ? 'block' : 'none'}"></div>

    <!-- 触屏摇杆 -->
    <div id="joy" ref="joyEl" :style="{display: walk.touch ? 'block' : 'none'}"><i ref="knobEl"></i></div>
    <button class="btn primary" id="walkExit" :style="{display: walk.touch ? 'block' : 'none'}" @click="exitWalk">
      {{ tr('退出漫游', 'Exit walk') }}
    </button>

    <!-- 操作提示：只在漫游时贴着顶部显示；鸟瞰提示改为进入 3D 时弹一次 toast -->
    <div id="hint3d" v-if="hint">{{ hint }}</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { View3D } from '@/workspace/view3d/engine/index.js';
import { setEngine } from '@/workspace/view3d/registry.js';
import { usePlanStore, useUiStore } from '@/stores/index.js';
import { COARSE } from '@/core/model/plan.js';
import { tr } from '@/i18n.js';

const uiStore = useUiStore();
const plan = usePlanStore();
const { opt, walk, joy } = uiStore;
const { onPlanChange } = plan;

const hostEl = ref(null);
const joyEl  = ref(null);
const knobEl = ref(null);
let engine = null;
let stopSync = null;

/* ---------------- 提示文案 ---------------- */
const overlayShow = computed(() => opt.mode === 'walk' && !walk.locked && !walk.touch);

const walkTexts = computed(() => COARSE
  ? [tr('点击开始，从入户门进入', 'Tap to start at the front door'),
     tr('左下摇杆移动 · 在画面上拖动转向', 'Joystick moves · drag on screen to look'),
     tr('点门开关 · 点「退出漫游」回到鸟瞰', 'Tap doors to open · "Exit walk" returns to orbit')]
  : [tr('点击开始，从入户门进入', 'Click to start at the front door'),
     tr('<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> 移动 · 鼠标转向 · <kbd>Shift</kbd> 快走', '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move · mouse looks · <kbd>Shift</kbd> runs'),
     tr('<kbd>E</kbd> 开关正前方的门 · <kbd>Esc</kbd> 暂停', '<kbd>E</kbd> opens the door ahead · <kbd>Esc</kbd> pauses')]);

/** 鸟瞰操作说明：进入 3D 时用 toast 提示一次，几秒后自动消失（不再常驻顶部） */
function orbitHint(){
  return COARSE
    ? tr('单指旋转 · 双指缩放 / 平移 · 点选家具后可拖动摆放 · 点门开关', '1 finger orbits · 2 fingers zoom / pan · select furniture to drag it · tap doors to open')
    : tr('左键旋转 · 右键平移 · 滚轮缩放 · 选中家具后拖动可摆放 · 点击门开关', 'Left-drag orbits · right-drag pans · scroll zooms · select furniture to drag it · click doors to open');
}

/* 顶部常驻提示只保留漫游时的按键提示（鸟瞰改用 toast） */
const hint = computed(() => {
  if (opt.mode !== 'walk') return '';
  if (walk.touch) return tr('左下摇杆移动 · 拖动画面转向 · 点门开关', 'Joystick moves · drag to look · tap doors to open');
  return tr('WASD 移动 · 鼠标转向 · Shift 快走 · E 开关门 · Esc 暂停', 'WASD moves · mouse looks · Shift runs · E opens doors · Esc pauses');
});

/* ---------------- 漫游控制 ---------------- */
function onWalkClick(){
  if (!engine) return;
  if (COARSE) engine.startTouchWalk();
  else engine.walkCtl.lock();
}

function exitWalk(){
  engine?.setMode('orbit');
}

function onPointerLockError(){
  if (engine && opt.mode === 'walk') engine.startTouchWalk();
}

/* ---------------- 摇杆 ---------------- */
const JR = 50;
function updateJoy(e){
  const r = joyEl.value.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2);
  const L = Math.hypot(dx, dy);
  if (L > JR){ dx *= JR/L; dy *= JR/L; }
  joy.x = dx/JR; joy.y = dy/JR;
  knobEl.value.style.transform = `translate(${dx}px,${dy}px)`;
}
function onJoyDown(e){
  e.preventDefault();
  joy.id = e.pointerId;
  joyEl.value.setPointerCapture(e.pointerId);
  updateJoy(e);
}
function onJoyMove(e){ if (e.pointerId === joy.id) updateJoy(e); }
const onJoyEnd = e => {
  if (e.pointerId !== joy.id) return;
  joy.id = null; joy.x = joy.y = 0;
  knobEl.value.style.transform = '';
};

/* ---------------- 生命周期 ---------------- */
onMounted(() => {
  const stage = hostEl.value.closest('#stage');
  engine = new View3D(hostEl.value, stage);
  setEngine(engine);

  // 2D 改了任何东西 → 3D 增量重建
  stopSync = onPlanChange(() => engine.sync());

  joyEl.value.addEventListener('pointerdown', onJoyDown);
  joyEl.value.addEventListener('pointermove', onJoyMove);
  joyEl.value.addEventListener('pointerup', onJoyEnd);
  joyEl.value.addEventListener('pointercancel', onJoyEnd);
  document.addEventListener('pointerlockerror', onPointerLockError);

  // 进入 3D 时提示一次鸟瞰操作说明：4.5s 后自动消失，不占顶部常驻位置
  watch(() => uiStore.viewMode, v => { if (v === '3d') uiStore.showToast(orbitHint(), 4500); });

  // 剖切高度 / 家具显隐 / 标签显隐
  watch(() => opt.cut, () => engine.sync());
  watch(() => opt.furn, v => { if (engine.inited) engine.setFurn(v, true); });
  watch(() => opt.labels, v => {
    if (engine.inited) engine.showLabels(v && opt.mode === 'orbit');
  });
});

onBeforeUnmount(() => {
  stopSync?.();
  document.removeEventListener('pointerlockerror', onPointerLockError);
  engine?.dispose();
  setEngine(null);
  engine = null;
});
</script>
