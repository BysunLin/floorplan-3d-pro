<template>
  <section>
    <h3>{{ tr('墙面元素属性', 'Wall element') }}<small>{{ kindText }}</small></h3>
    <div class="form">
      <label class="full">{{ tr('名称', 'Name') }}
        <input :value="name" @focus="onNameFocus" @input="onNameInput" @change="onNameChange">
      </label>
      <label>{{ tr('宽', 'Width') }} (mm)
        <input type="number" :value="size?.w" min="50" step="10" @change="setNum('w', $event)"></label>
      <label>{{ tr('深', 'Depth') }} (mm)
        <input type="number" :value="size?.d" min="20" step="10" @change="setNum('d', $event)"></label>
      <label class="full">{{ tr('占地面积', 'Footprint') }} {{ areaText }}</label>
    </div>
    <div class="actions">
      <button class="btn" v-if="isDoor" @click="reverse">{{ tr('朝向反转', 'Reverse facing') }}</button>
      <button class="btn" v-if="canConvert" @click="convert">{{ tr('转为承重墙', 'Make bearing') }}</button>
      <button class="btn" v-if="canConvertDown" @click="convertDown">{{ downLabel }}</button>
      <button class="btn danger" :disabled="blocked" :title="blocked ? tr('承重墙 / 外墙不可拆除', 'Bearing / exterior walls cannot be removed') : ''"
        @click="del">{{ tr('删除', 'Delete') }}</button>
      <button class="btn" @click="select(null)">{{ tr('← 返回', '← Back') }}</button>
    </div>
  </section>

  <section class="muted" style="font-size:12px">
    {{ tr('宽 = 沿墙方向的长度，深 = 墙厚。承重墙与外墙不可删除。',
          'Width = length along the wall, depth = wall thickness. Bearing and exterior walls cannot be removed.') }}
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { usePlanStore, useUiStore } from '@/stores/index.js';
import { WALLS } from '@/core/model/plan.js';
import { tr } from '@/i18n.js';

const plan = usePlanStore();
const uiStore = useUiStore();
const {
  state, commit, snap,
  elemSize, elemName, setElemSize, deleteElem, reverseDoor,
  convertWallTo, convertWallFromBearing, isOuterWall
} = plan;
const { select, showToast } = uiStore;

const props = defineProps({
  kind: { type: String, required: true },   // wall | win | door | slide
  i:    { type: Number, required: true }
});

const KEY  = computed(() => ({ wall: 'w', win: 'nw', door: 'nd', slide: 'ns' }[props.kind] + props.i));
const size = computed(() => elemSize(props.kind, props.i));
const name = computed(() => elemName(props.kind, props.i));
const areaText = computed(() => size.value ? (size.value.w*size.value.d/1e6).toFixed(3) + ' m²' : '—');
const kindText = computed(() => ({
  wall: tr('墙体', 'Wall'), win: tr('窗', 'Window'),
  door: tr('门', 'Door'), slide: tr('推拉门', 'Sliding door')
}[props.kind]));

/* 门：面板额外提供「朝向反转」 */
const isDoor = computed(() => props.kind === 'door');

/* 承重墙 / 外墙不可删除 */
const blocked = computed(() => props.kind === 'wall' && ['b', 'e'].includes(WALLS[props.i]?.[4]));
/* 当前选中墙的类型 */
const wallType = computed(() => props.kind === 'wall' ? WALLS[props.i]?.[4] : null);
/* 「非承重墙 / 玻璃墙面 / 外墙」可转为承重墙 */
const canConvert = computed(() => ['n', 'g', 'e'].includes(wallType.value));
/* 「承重墙」可转为非承重墙（位于最外侧时转为外墙） */
const canConvertDown = computed(() => wallType.value === 'b');
const downLabel = computed(() => props.kind === 'wall' && isOuterWall(props.i)
  ? tr('转为外墙', 'Make exterior')
  : tr('转为非承重墙', 'Make partition'));

/* 尺寸：改完可能因为「转成用户元素」而改变下标，需要同步选中项 */
function setNum(key, e){
  const v = parseFloat(e.target.value);
  if (Number.isNaN(v) || !size.value) return;
  const nw = key === 'w' ? v : size.value.w;
  const nd = key === 'd' ? v : size.value.d;
  const j = setElemSize(props.kind, props.i, nw, nd);
  if (j !== props.i) select({ kind: props.kind, i: j });
}

/* 名称：输入时即时生效，失焦 / 回车时记入撤销栈（与家具、房间面板一致） */
let nameBefore = null;
function onNameFocus(){ nameBefore = snap(); }
function onNameInput(e){
  if (nameBefore === null) nameBefore = snap();
  state.elemNames[KEY.value] = e.target.value;
}
function onNameChange(e){
  const v = e.target.value.trim();
  if (v) state.elemNames[KEY.value] = v;
  else delete state.elemNames[KEY.value];
  if (nameBefore !== null){ commit(nameBefore); nameBefore = null; }
}

function del(){
  if (blocked.value) return showToast(tr('承重墙 / 外墙不可拆除', 'Bearing / exterior walls cannot be removed'));
  deleteElem(props.kind, props.i);
}

/* 门：180° 反转开启方向（朝房间开 ↔ 朝外开） */
function reverse(){
  if (!isDoor.value) return;
  reverseDoor(props.i);
}

/* 非承重墙 / 外墙 → 承重墙（会与相邻承重墙合并），转换后取消选中 */
function convert(){
  if (!canConvert.value) return;
  convertWallTo(props.i, 'b');
  select(null);
}

/* 承重墙 → 非承重墙（位于最外侧则转为外墙），转换后取消选中 */
function convertDown(){
  if (!canConvertDown.value) return;
  convertWallFromBearing(props.i);
  select(null);
}
</script>
