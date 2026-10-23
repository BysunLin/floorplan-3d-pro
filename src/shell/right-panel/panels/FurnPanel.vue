<template>
  <section>
    <h3>{{ tr('家具属性', 'Furniture') }}</h3>
    <div class="form">
      <label class="full">{{ tr('名称', 'Name') }}
        <input id="fName" :value="f.name" @input="onNameInput" @change="onNameChange">
      </label>
      <label>{{ tr('宽', 'Width') }} (mm)
        <input type="number" id="fW" :value="f.w" min="50" step="10" @change="setNum('w', $event)"></label>
      <label>{{ tr('深', 'Depth') }} (mm)
        <input type="number" id="fD" :value="f.d" min="50" step="10" @change="setNum('d', $event)"></label>
      <label>{{ tr('中心', 'Center') }} X (mm)
        <input type="number" id="fX" :value="Math.round(f.cx)" step="10" @change="setNum('cx', $event)"></label>
      <label>{{ tr('中心', 'Center') }} Y (mm)
        <input type="number" id="fY" :value="Math.round(f.cy)" step="10" @change="setNum('cy', $event)"></label>
      <label>{{ tr('旋转', 'Rotation') }} (°)
        <input type="number" id="fR" :value="f.rot" step="15" @change="setRot"></label>
      <label>{{ tr('颜色', 'Color') }}
        <input type="color" id="fC" :value="f.color" @change="onColor"></label>
    </div>
    <div class="muted" style="margin-top:8px">
      {{ tr('占地面积', 'Footprint') }} {{ (f.w*f.d/1e6).toFixed(2) }} m²
    </div>

    <!-- 楼层元素：上行 / 下行（电梯固定平层，不显示） -->
    <div class="actions" v-if="isClimb" style="margin-top:8px">
      <button class="btn" v-show="dir < 0" :class="{on: dir > 0}" @click="setDir(1)">{{ tr('↑ 改为上行（去上一层）', '↑ edit to Up (to floor above)') }}</button>
      <button class="btn" v-show="dir > 0" :class="{on: dir < 0}" @click="setDir(-1)">{{ tr('↓ 改为下行（去下一层）', '↓ edit to Down (to floor below)') }}</button>
    </div>
    <div class="actions">
      <button class="btn" id="aRot" @click="rotateSel(90)">{{ tr('旋转 90°', 'Rotate 90°') }}</button>
      <button class="btn" id="aDup" @click="duplicateSel()">{{ tr('复制', 'Duplicate') }}</button>
      <button class="btn" id="aTop" @click="bringToFront()">{{ tr('置于顶层', 'Bring to front') }}</button>
      <button class="btn" id="aBot" @click="sendToBack()">{{ tr('置于底层', 'Send to back') }}</button>
      <button class="btn danger" id="aDel" @click="deleteSel()">{{ tr('删除', 'Delete') }}</button>
      <button class="btn" id="back" @click="select(null)">{{ tr('← 返回', '← Back') }}</button>
    </div>
  </section>

  <section class="muted" style="font-size:12px">
    {{ tr('拖动家具移动；拖动上方圆点旋转；拖动右下角方块调整尺寸。开启「贴墙吸附」后，靠近墙面会贴齐墙体，靠近其它家具（如书桌、餐桌）会贴齐其边缘线，墙体优先。',
          'Drag to move; drag the top dot to rotate; drag the bottom-right square to resize. With "Wall snap" on, items snap flush to walls and to the edges of nearby furniture (desks, tables…), walls taking priority.') }}
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { usePlanStore, useUiStore } from '@/stores/index.js';
import { WALLS } from '@/core/model/plan.js';
import { isClimbType } from '@/core/library/index.js';
import { snapAngle, wallAngles } from '@/core/geometry/angle.js';
import { tr } from '@/i18n.js';

const plan = usePlanStore();
const {
  mutate, commit, snap, getF, setFloorDir,
  rotateSel, duplicateSel, deleteSel, bringToFront, sendToBack
} = plan;
const { select } = useUiStore();

const props = defineProps({ id: { type: String, required: true } });
const f = computed(() => getF(props.id));
/* 楼梯类元素才有「上行 / 下行」 */
const isClimb = computed(() => !!f.value && isClimbType(f.value.type));
const dir = computed(() => (f.value?.sdir ?? 1) > 0 ? 1 : -1);
const setDir = v => setFloorDir(props.id, v);

/** 所有带撤销的字段修改统一走这里 */
function apply(fn){
  mutate(() => { const g = getF(props.id); if (g) fn(g); });
}

function setNum(key, e){
  const v = parseFloat(e.target.value);
  if (Number.isNaN(v)) return;
  apply(g => { g[key] = Math.max(50, Math.round(v)); });
}

/** 角度：失焦 / 回车时吸附（墙体走向优先，其次 15°），与 3D 旋转 gizmo 同一规则 */
function setRot(e){
  const v = parseFloat(e.target.value);
  if (Number.isNaN(v)) return;
  const deg = snapAngle(v, wallAngles(WALLS));
  if (deg === (f.value?.rot || 0)){ e.target.value = deg; return; }   // 没变化就不进撤销栈
  e.target.value = deg;
  apply(g => { g.rot = deg; });
}

function onColor(e){ const v = e.target.value; apply(g => { g.color = v; }); }

/* 名称：输入时即时生效，失焦/回车时记入撤销栈 */
let nameBefore = null;
function onNameInput(e){
  if (nameBefore === null) nameBefore = snap();
  const g = getF(props.id);
  if (g) g.name = e.target.value;
}
function onNameChange(e){
  const v = e.target.value.trim();
  const g = getF(props.id);
  if (g) g.name = v || g.name;
  if (nameBefore !== null){ commit(nameBefore); nameBefore = null; }
}
</script>
