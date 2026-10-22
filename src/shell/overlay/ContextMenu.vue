<template>
  <!-- 工作区右键菜单：位置 = 右键点，越界时自动夹回视口内 -->
  <div v-if="ui.menu" id="ctxMenu" ref="el" class="ctx-menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    @contextmenu.prevent @pointerdown.stop>
    <div v-if="title" class="ctx-title">{{ title }}</div>
    <button v-for="(it, i) in items" :key="i" class="ctx-item" :class="{ danger: it.danger }" @click="run(it)">
      <span class="ico" aria-hidden="true">{{ it.ico }}</span>
      <span class="lb">{{ it.label }}</span>
    </button>
  </div>
</template>

<script setup>
/* ============================================================================
 *  工作区右键菜单
 *  原来是「选中后底部出现的快捷操作浮窗」，现在统一收进右键菜单：
 *  家具（旋转 / 复制 / 删除 / 上下行 / 属性）、房间区域（地面 / 删除）、
 *  拆改模式的墙体与门窗（转承重 / 转非承重 / 删除 / 属性）。
 *  选中逻辑由 2D 交互的 onContextMenu 按当前模式的左键命中规则完成。
 * ========================================================================== */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePlanStore, useUiStore, useViewStore, ELEM_KINDS } from '@/stores/index.js';
import { ROOMS, WALLS } from '@/core/model/plan.js';
import { isClimbType } from '@/core/library/index.js';
import { tr, nm } from '@/i18n.js';

const plan = usePlanStore();
const uiStore = useUiStore();
const viewStore = useViewStore();
const {
  state, getF, deleteElem, deleteRoom,
  rotateSel, duplicateSel, deleteSel, elemName, setFloorDir,
  convertWallTo, convertWallFromBearing, isOuterWall
} = plan;
const { ui, select, drawer, closeMenu } = uiStore;

const el = ref(null);
const pos = ref({ x: 0, y: 0 });

/* ---------------- 当前选中项 ---------------- */
const f = computed(() => ui.sel?.kind === 'furn' ? getF(ui.sel.id) : null);
const r = computed(() => ui.sel?.kind === 'room' ? ROOMS.find(x => x.id === ui.sel.id) : null);
const elem = computed(() => ui.sel && ELEM_KINDS.includes(ui.sel.kind) ? ui.sel : null);

const isBay = computed(() => !!r.value && String(r.value.id).startsWith('bay'));
const isRegion = computed(() => !!(r.value && (state.regions || []).some(x => x.id === r.value.id)));
const isClimb = computed(() => !!f.value && isClimbType(f.value.type));

const wallType = computed(() => elem.value?.kind === 'wall' ? WALLS[elem.value.i]?.[4] : null);

const title = computed(() => {
  if (elem.value) return elemName(elem.value.kind, elem.value.i);
  if (f.value) return nm(f.value.name);
  if (r.value) return nm(state.rooms[r.value.id]?.name || r.value.name);
  return '';
});

/* ---------------- 菜单项 ---------------- */
const items = computed(() => {
  const out = [];
  if (elem.value){
    out.push({ ico: '⚙', label: tr('属性', 'Properties'), act: 'props' });
    if (elem.value.kind === 'wall'){
      if (['n', 'g', 'e'].includes(wallType.value))
        out.push({ ico: '▮', label: tr('转为承重墙', 'Make bearing'), act: 'bearing' });
      else if (wallType.value === 'b')
        out.push({ ico: '▯', label: isOuterWall(elem.value.i) ? tr('转为外墙', 'Make exterior') : tr('转为非承重墙', 'Make partition'), act: 'partition' });
    }
    out.push({ ico: '✕', label: tr('删除', 'Delete'), act: 'del', danger: true });
    return out;
  }
  if (f.value){
    out.push({ ico: '⚙', label: tr('属性', 'Properties'), act: 'props' });
    if (isClimb.value)
      out.push({ ico: (f.value.sdir ?? 1) > 0 ? '↑' : '↓',
        label: (f.value.sdir ?? 1) > 0 ? tr('改为下行', 'Set going down') : tr('改为上行', 'Set going up'), act: 'dir' });
    out.push({ ico: '↺', label: tr('逆时针旋转 90°', 'Rotate −90°'), act: 'rotl' });
    out.push({ ico: '↻', label: tr('顺时针旋转 90°', 'Rotate +90°'), act: 'rotr' });
    out.push({ ico: '⧉', label: tr('复制', 'Duplicate'), act: 'dup' });
    out.push({ ico: '✕', label: tr('删除', 'Delete'), act: 'del', danger: true });
    return out;
  }
  if (r.value){
    out.push({ ico: '⚙', label: tr('地面 / 属性', 'Floor / Properties'), act: 'props' });
    if (!isBay.value)
      out.push({ ico: '✕', label: isRegion.value ? tr('删除区域', 'Delete area') : tr('删除房间', 'Delete room'), act: 'delroom', danger: true });
    return out;
  }
  // 空白处：只给视图操作
  out.push({ ico: '⤢', label: tr('适应窗口', 'Fit view'), act: 'fit' });
  return out;
});

function run(it){
  const sel = ui.sel;
  closeMenu();
  switch (it.act){
    case 'props':   drawer('panel', true); break;
    case 'fit':     viewStore.fitView(); break;
    case 'rotl':    rotateSel(-90); break;
    case 'rotr':    rotateSel(90); break;
    case 'dup':     duplicateSel(); break;
    case 'dir':     if (f.value) setFloorDir(f.value.id, (f.value.sdir ?? 1) > 0 ? -1 : 1); break;
    case 'del':     if (sel?.kind === 'furn') deleteSel();
                    else if (elem.value) deleteElem(elem.value.kind, elem.value.i);
                    break;
    case 'delroom': if (sel?.kind === 'room') deleteRoom(sel.id); break;
    case 'bearing': if (elem.value?.kind === 'wall'){ convertWallTo(elem.value.i, 'b'); select(null); } break;
    case 'partition': if (elem.value?.kind === 'wall'){ convertWallFromBearing(elem.value.i); select(null); } break;
  }
}

/* ---------------- 定位（越界夹回视口内） ---------------- */
watch(() => ui.menu, async m => {
  if (!m) return;
  pos.value = { x: m.x, y: m.y };
  await nextTick();
  const box = el.value;
  if (!box) return;
  const pad = 8;
  pos.value = {
    x: Math.max(pad, Math.min(m.x, innerWidth - box.offsetWidth - pad)),
    y: Math.max(pad, Math.min(m.y, innerHeight - box.offsetHeight - pad))
  };
});

/* ---------------- 关闭：点空白 / Esc / 窗口尺寸变化 ---------------- */
function onDocDown(e){
  if (e.target?.closest?.('#ctxMenu')) return;
  closeMenu();
}
function onKey(e){
  if (e.key === 'Escape') closeMenu();
}
function onResize(){ closeMenu(); }

onMounted(() => {
  addEventListener('pointerdown', onDocDown, true);
  addEventListener('keydown', onKey);
  addEventListener('resize', onResize);
  addEventListener('wheel', onResize, { passive: true });
});
onBeforeUnmount(() => {
  removeEventListener('pointerdown', onDocDown, true);
  removeEventListener('keydown', onKey);
  removeEventListener('resize', onResize);
  removeEventListener('wheel', onResize);
});
</script>
