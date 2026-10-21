<template>
  <section>
    <div class="panel-head">
      <h3>{{ tr('房间', 'Room') }}</h3>
      <button v-if="!isBay" class="btn danger sm" @click="del">{{ isRegion ? tr('删除区域', 'Delete area') : tr('删除房间', 'Delete room') }}</button>
    </div>
    <div class="form">
      <label class="full">{{ tr('名称', 'Name') }}
        <input id="rName" :value="room.name" @focus="onNameFocus" @input="onNameInput" @change="onNameChange">
      </label>
    </div>
    <div class="stats" style="margin-top:10px">
      <div><small>{{ tr('使用面积', 'Floor area') }}</small><span class="big">{{ a.toFixed(2) }}</span> m²</div>
      <div><small>{{ tr('周长', 'Perimeter') }}</small><span class="big">{{ p.toFixed(1) }}</span> m</div>
      <div><small>{{ tr('开间', 'Width') }}</small><span class="big">{{ bb[2] - bb[0] }}</span> mm</div>
      <div><small>{{ tr('进深', 'Depth') }}</small><span class="big">{{ bb[3] - bb[1] }}</span> mm</div>
    </div>
    <div class="muted">
      {{ tr(`墙面面积（层高 2.8m，未扣门窗）约 ${(p*2.8).toFixed(1)} m²`, `Wall area (2.8m ceiling, openings not deducted) ≈ ${(p*2.8).toFixed(1)} m²`) }}
    </div>
  </section>

  <section>
    <h3>{{ tr('地面材料', 'Flooring') }}</h3>
    <div class="mats">
      <button v-for="[k, m] in MAT_LIST" :key="k" class="mat" :class="{on: room.mat === k}"
        :data-mat="k" @click="setMat(k)">
        <i :style="{background: m.sw}"></i>
        <span>{{ nm(m.name) }}<small v-if="k !== 'void'">¥{{ m.price }}/m²</small></span>
      </button>
    </div>
    <div class="total">
      <span>{{ tr('材料估价', 'Estimated cost') }}</span>
      <b>¥{{ cost.toLocaleString() }}</b>
    </div>
  </section>

  <section v-if="isRegion">
    <h3>{{ tr('地面高差', 'Ground offset') }}</h3>
    <div class="actions">
      <button v-for="o in LIFTS" :key="o.v" class="btn" :class="{on: lift === o.v}" @click="setLift(o.v)">{{ o.label() }}</button>
    </div>
    <div class="muted">{{ tr('人行道 / 路缘石可抬高，车行道保持齐平', 'Raise sidewalks / curbs; keep roads flush') }}</div>
  </section>

  <section v-if="!isBay">
    <h3>{{ tr('顶灯款式', 'Ceiling light') }}</h3>
    <div class="mats">
      <button v-for="s in LIGHTS" :key="s.k" class="mat" :class="{on: light === s.k}"
        :data-light="s.k" @click="setLight(s.k)">
        <i :style="s.style"></i>
        <span>{{ tr(s.cn, s.en) }}</span>
      </button>
    </div>
  </section>

  <section>
    <h3>
      {{ tr('房间内家具', 'Furniture in room') }}
      <small>{{ inside.length }} {{ tr('件', 'items') }}</small>
    </h3>
    <table>
      <tr v-for="f in inside" :key="f.id" class="click" @click="select({kind: 'furn', id: f.id})">
        <td>{{ nm(f.name) }}</td>
        <td class="r muted">{{ f.w }}×{{ f.d }}</td>
      </tr>
      <tr v-if="!inside.length"><td class="muted">{{ tr('暂无', 'None') }}</td></tr>
    </table>
    <div class="actions">
      <button class="btn" @click="select(null)">{{ tr('← 返回总览', '← Back to overview') }}</button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { usePlanStore, useUiStore } from '@/stores/index.js';
import { ROOMS, MATS, bbox } from '@/core/model/plan.js';
import { roomArea, roomPerimeter } from '@/core/geometry/region.js';
import { tr, nm } from '@/i18n.js';

const plan = usePlanStore();
const { state, mutate, commit, snap, deleteRoom } = plan;
const { select } = useUiStore();

const props = defineProps({ id: { type: String, required: true } });

const geo  = computed(() => ROOMS.find(r => r.id === props.id));
const room = computed(() => state.rooms[props.id]);
/* 用户绘制的区域（可删除）；飘窗为特殊构件，不在此删除 */
const isRegion = computed(() => (state.regions || []).some(r => r.id === props.id));
const isBay = computed(() => typeof props.id === 'string' && props.id.startsWith('bay'));

/* 「挑空」仅在夹层及以上楼层可选 */
const levelMeta = computed(() => plan.state.levels.find(l => l.id === plan.state.activeLevel));
const canVoid = computed(() => !!levelMeta.value && (levelMeta.value.kind === 'loft' || (levelMeta.value.elev || 0) > 0));
const MAT_LIST = computed(() => Object.entries(MATS).filter(([k]) => k !== 'void' || canVoid.value));

/* 顶灯款式：圆形（默认）/ 正方形 / 长方形 / 无 */
const LIGHTS = [
  { k: 'round',  cn: '圆形',   en: 'Round',     style: { background: '#fff4d6', borderRadius: '50%' } },
  { k: 'square', cn: '正方形', en: 'Square',    style: { background: '#fff4d6', borderRadius: '4px' } },
  { k: 'rect',   cn: '长方形', en: 'Rectangle', style: { background: '#fff4d6', borderRadius: '4px', width: '34px' } },
  { k: 'none',   cn: '无',     en: 'None',      style: { background: 'transparent', border: '1px dashed #c3bdb2', borderRadius: '4px' } },
];
/* 户外区域的地面高差（mm）：3D 按此抬高地面（人行道 / 路缘石），默认 8mm 防共面 */
const LIFTS = [
  { v: 0,   label: () => tr('齐平', 'Flush') },
  { v: 8,   label: () => '8 mm' },
  { v: 80,  label: () => '80 mm' },
  { v: 150, label: () => '150 mm' },
];
const lift = computed(() => Number(state.rooms[props.id]?.lift ?? 8));
function setLift(v){ mutate(() => { state.rooms[props.id].lift = v; }); }

const light = computed(() => state.rooms[props.id]?.light || 'round');
function setLight(k){
  if (!room.value) return;
  mutate(() => { state.rooms[props.id].light = k; });
}
const a    = computed(() => roomArea(geo.value));
const p    = computed(() => roomPerimeter(geo.value));
const bb   = computed(() => bbox(geo.value.poly));
const cost = computed(() => Math.round(a.value*MATS[room.value.mat].price*1.05));

const inside = computed(() => state.furniture.filter(f =>
  f.cx > bb.value[0] && f.cx < bb.value[2] && f.cy > bb.value[1] && f.cy < bb.value[3]));

function setMat(k){
  mutate(() => { state.rooms[props.id].mat = k; });
}

function del(){ deleteRoom(props.id); }

/* 名称：输入时即时生效（房间标签实时更新），失焦/回车时记入撤销栈 */
let nameBefore = null;
function onNameFocus(){ nameBefore = snap(); }
function onNameInput(e){ state.rooms[props.id].name = e.target.value; }
function onNameChange(e){
  const v = e.target.value.trim();
  state.rooms[props.id].name = v || state.rooms[props.id].name;
  if (nameBefore){ commit(nameBefore); nameBefore = null; }
}
</script>
