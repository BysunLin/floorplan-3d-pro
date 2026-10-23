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

  <!-- 材质：仅非承重墙可改（玻璃只是墙面材质的一种，2D / 3D 都按玻璃墙渲染） -->
  <section v-if="canSetMat">
    <h3>{{ tr('材质', 'Material') }}</h3>
    <div class="mats">
      <button v-for="m in WALL_MATS" :key="m.id" class="mat" :class="{on: matId === m.id}"
        :data-wall-mat="m.id" @click="pickMat(m.id)">
        <i :style="{ background: m.fill }"></i>
        <span>{{ tr(m.name, m.en) }}</span>
      </button>
    </div>
    <div class="muted" style="font-size:12px">
      {{ tr('玻璃材质按玻璃隔断建模（铝框 + 透明玻璃），门窗洞口上方同样补玻璃；其它材质只改变墙面色泽。',
            'Glass is modelled as a glazed partition (aluminium frame + clear glass) and openings above it get glass too; other materials only change the surface finish.') }}
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
import { WALL_MATS, DEFAULT_WALL_MAT } from '@/core/library/wallMats.js';
import { tr } from '@/i18n.js';

const plan = usePlanStore();
const uiStore = useUiStore();
const {
  state, commit, snap,
  elemSize, elemName, setElemSize, deleteElem, reverseDoor,
  convertWallTo, convertWallFromBearing, isOuterWall, setWallMat
} = plan;
const { select, showToast } = uiStore;

const props = defineProps({
  kind: { type: String, required: true },   // wall | win | door | slide
  i:    { type: Number, required: true }
});

// 名称按元素 uid 存（下标会随开洞 / 合并变化），所以键要由 store 给
const KEY  = computed(() => plan.elemKey(props.kind, props.i));
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

/* ---------- 材质（仅非承重墙；玻璃 = 非承重墙的一种材质） ---------- */
const canSetMat = computed(() => props.kind === 'wall' && ['n', 'g'].includes(wallType.value));
const matId = computed(() => {
  if (props.kind !== 'wall') return '';
  const set = state.wallMats?.['w' + props.i];
  if (set) return set;
  return wallType.value === 'g' ? 'glass' : DEFAULT_WALL_MAT;   // 旧存档的 'g' 玻璃墙面等价于玻璃材质
});
function pickMat(id){
  if (!canSetMat.value || id === matId.value) return;
  if (wallType.value === 'g'){
    // 旧的玻璃墙类型：先转成普通非承重墙（下标会变），再按材质渲染
    const j = convertWallTo(props.i, 'n');
    setWallMat(j, id);
    return select({ kind: 'wall', i: j });
  }
  setWallMat(props.i, id);
}

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
