<template>
  <div id="fab" :class="{show: visible}">
    <!-- 拆改墙体：选中的墙体 / 门窗元素 -->
    <template v-if="showDemolish">
      <span class="name">{{ elemLabel }}</span>
      <button class="btn" @click="drawer('panel', true)">{{ tr('属性', 'Properties') }}</button>
      <button class="btn" v-if="canConvert" @click="convert">{{ tr('转为承重墙', 'Make bearing') }}</button>
      <button class="btn" v-if="canConvertDown" @click="convertDown">{{ downLabel }}</button>
      <button class="btn danger" @click="del">{{ tr('删除', 'Delete') }}</button>
      <button class="btn" @click="done">{{ tr('完成', 'Done') }}</button>
    </template>

    <!-- 选中家具 -->
    <template v-else-if="f">
      <span class="name">{{ nm(f.name) }}</span>
      <button v-if="isClimb" class="btn" @click="toggleDir">{{ (f.sdir ?? 1) > 0 ? tr('↑ 上行', '↑ Up') : tr('↓ 下行', '↓ Down') }}</button>
      <button class="btn" @click="rotateSel(-90)">↺</button>
      <button class="btn" @click="rotateSel(90)">↻ {{ tr('旋转', 'Rotate') }}</button>
      <button class="btn" @click="duplicateSel()">{{ tr('复制', 'Duplicate') }}</button>
      <button class="btn danger" @click="deleteSel()">{{ tr('删除', 'Delete') }}</button>
      <span class="sep"></span>
      <button class="btn narrow-only" @click="drawer('panel', true)">{{ tr('属性', 'Properties') }}</button>
      <button class="btn" @click="done">{{ tr('完成', 'Done') }}</button>
    </template>

    <!-- 选中房间 / 区域 -->
    <template v-else-if="r">
      <span class="name">{{ nm(state.rooms[r.id]?.name || r.name) }}</span>
      <button class="btn narrow-only" @click="drawer('panel', true)">{{ tr('地面 / 属性', 'Floor / Properties') }}</button>
      <button v-if="isRoom && !isBay" class="btn danger" @click="delRoom">{{ delRoomLabel }}</button>
      <button class="btn" @click="done">{{ tr('完成', 'Done') }}</button>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { usePlanStore, useUiStore, ELEM_KINDS } from '@/stores/index.js';
import { ROOMS, WALLS } from '@/core/model/plan.js';
import { isClimbType } from '@/core/library/index.js';
import { tr, nm } from '@/i18n.js';

const plan = usePlanStore();
const uiStore = useUiStore();
const {
  state, getF, deleteElem, deleteRoom,
  rotateSel, duplicateSel, deleteSel, elemName, setFloorDir,
  convertWallTo, convertWallFromBearing, isOuterWall
} = plan;
const { ui, select, drawer, closeDrawers } = uiStore;

const f = computed(() => ui.sel?.kind === 'furn' ? getF(ui.sel.id) : null);
const r = computed(() => ui.sel?.kind === 'room' ? ROOMS.find(x => x.id === ui.sel.id) : null);
/* 选中的房间 / 区域（内置房间与用户区域都允许删除） */
const isRoom = computed(() => !!r.value);
const isBay  = computed(() => !!r.value && typeof r.value.id === 'string' && r.value.id.startsWith('bay'));
const isRegion = computed(() => !!(ui.sel?.kind === 'room' && (state.regions || []).some(x => x.id === ui.sel.id)));
const delRoomLabel = computed(() => isRegion.value ? tr('删除区域', 'Delete area') : tr('删除房间', 'Delete room'));
function delRoom(){ if (ui.sel?.kind === 'room') deleteRoom(ui.sel.id); }
/* 拆改墙体：当前选中的墙体 / 门窗 */
const elem = computed(() => ui.sel && ELEM_KINDS.includes(ui.sel.kind) ? ui.sel : null);
const showDemolish = computed(() => !!elem.value);
const visible = computed(() => !!(showDemolish.value || f.value || r.value));

const elemLabel = computed(() => elem.value ? elemName(elem.value.kind, elem.value.i) : '');

/* 楼层元素（步梯 / 旋转步梯 / 扶梯）：上行 / 下行切换 */
const isClimb = computed(() => !!f.value && isClimbType(f.value.type));
const toggleDir = () => { if (f.value) setFloorDir(f.value.id, (f.value.sdir ?? 1) > 0 ? -1 : 1); };

/* 当前选中墙的类型 */
const wallType = computed(() => elem.value?.kind === 'wall' ? WALLS[elem.value.i]?.[4] : null);
/* 「非承重墙 / 玻璃墙面 / 外墙」可转为承重墙 */
const canConvert = computed(() => ['n', 'g', 'e'].includes(wallType.value));
/* 「承重墙」可转为非承重墙（位于最外侧时转为外墙） */
const canConvertDown = computed(() => wallType.value === 'b');
const downLabel = computed(() => elem.value && isOuterWall(elem.value.i)
  ? tr('转为外墙', 'Make exterior')
  : tr('转为非承重墙', 'Make partition'));

function convert(){
  if (!canConvert.value) return;
  convertWallTo(elem.value.i, 'b');
  select(null);                                 // 转成用户墙后下标会变，直接取消选中
}

function convertDown(){
  if (!canConvertDown.value) return;
  convertWallFromBearing(elem.value.i);
  select(null);
}

function del(){
  if (elem.value) deleteElem(elem.value.kind, elem.value.i);
}

/* 「完成」：取消选中并隐藏菜单栏，不触发删除 */
function done(){
  select(null);
  closeDrawers();
}
</script>
