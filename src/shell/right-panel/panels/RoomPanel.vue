<template>
  <section>
    <div class="panel-head">
      <h3>
        {{ title }}
        <small>{{ counted }}</small>
      </h3>
      <button v-if="!isBayArea" class="btn danger sm" @click="del">{{ delLabel }}</button>
    </div>
    <div class="form">
      <label class="full">{{ nameLabel }}
        <input id="rName" :value="room.name" @focus="onNameFocus" @input="onNameInput" @change="onNameChange">
      </label>
    </div>
    <div class="stats" style="margin-top:10px">
      <div><small>{{ areaLabel }}</small><span class="big">{{ a.toFixed(2) }}</span> m²</div>
      <div><small>{{ tr('周长', 'Perimeter') }}</small><span class="big">{{ p.toFixed(1) }}</span> m</div>
      <div><small>{{ tr('开间', 'Width') }}</small><span class="big">{{ bb[2] - bb[0] }}</span> mm</div>
      <div><small>{{ tr('进深', 'Depth') }}</small><span class="big">{{ bb[3] - bb[1] }}</span> mm</div>
    </div>
    <div class="muted">{{ note }}</div>
  </section>

  <section>
    <h3>{{ matTitle }}</h3>
    <!-- 室内 / 户外两大组：选中的是室内空间就把室内排前面，户外区域则户外排前面 -->
    <template v-for="g in matGroups" :key="g.k">
      <div class="mat-grp">{{ g.label }}</div>
      <div class="mats">
        <button v-for="k in g.keys" :key="k" class="mat" :class="{on: room.mat === k}"
          :data-mat="k" @click="setMat(k)">
          <i :style="{background: MATS[k].sw}"></i>
          <span>{{ nm(MATS[k].name) }}<small>¥{{ MATS[k].price }}/m²</small></span>
        </button>
      </div>
    </template>
    <!-- 挑空：不是地面材料，仅夹层及以上楼层可选 -->
    <template v-if="canVoid">
      <div class="mat-grp">{{ tr('其它', 'Other') }}</div>
      <div class="mats">
        <button class="mat" :class="{on: room.mat === 'void'}" data-mat="void" @click="setMat('void')">
          <i :style="{background: MATS.void.sw}"></i>
          <span>{{ nm(MATS.void.name) }}</span>
        </button>
      </div>
    </template>
    <div class="total">
      <span>{{ costLabel }}<small class="muted" style="font-size:11px"> {{ tr('含 5% 损耗', 'incl. 5% waste') }}</small></span>
      <b>¥{{ cost.toLocaleString() }}</b>
    </div>
  </section>

  <!-- 户外：地面标高（3D 按此抬升地面，做出台地 / 人行道高差） -->
  <section v-if="isOutdoorArea">
    <h3>{{ tr('地面标高', 'Ground level') }}</h3>
    <div class="actions">
      <button v-for="o in LIFTS" :key="o.v" class="btn" :class="{on: lift === o.v}" @click="setLift(o.v)">{{ o.label() }}</button>
    </div>
    <div class="muted">
      {{ tr('相对室外地坪的抬升高度：人行道 / 路缘石 / 台地可抬高，车行道保持齐平。',
            'Height above the outdoor grade: raise sidewalks / kerbs / terraces; keep roads flush.') }}
    </div>
  </section>

  <!-- 室内空间才需要顶灯（户外区域 3D 不生成天花与灯具） -->
  <section v-if="hasLamp">
    <h3>{{ tr('顶灯款式', 'Ceiling light') }}</h3>
    <div class="mats">
      <button v-for="s in LIGHTS" :key="s.k" class="mat" :class="{on: light === s.k}"
        :data-light="s.k" @click="setLight(s.k)">
        <i :style="s.style"></i>
        <span>{{ tr(s.cn, s.en) }}</span>
      </button>
    </div>
    <div class="muted">{{ tr('「无」表示该空间不装顶灯（例如挑空 / 阳台）。', 'Choose "None" to skip the ceiling light for this space.') }}</div>
  </section>

  <section>
    <h3>
      {{ itemTitle }}
      <small>{{ inside.length }} {{ tr('件', 'items') }}</small>
    </h3>
    <table>
      <tr v-for="f in inside" :key="f.id" class="click" @click="select({kind: 'furn', id: f.id})">
        <td>{{ nm(f.name) }}</td>
        <td class="r muted">{{ f.w }}×{{ f.d }}</td>
      </tr>
      <tr v-if="!inside.length"><td class="muted">{{ tr('暂无', 'None') }}</td></tr>
    </table>
    <div class="muted">{{ itemHint }}</div>
    <div class="actions">
      <button class="btn" @click="select(null)">{{ tr('← 返回总览', '← Back to overview') }}</button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { usePlanStore, useUiStore } from '@/stores/index.js';
import { ROOMS, MATS, MAT_GROUPS, bbox } from '@/core/model/plan.js';
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

/* 室内 / 户外：几何自带 outdoor 标记（入户走廊 / 花园 / 道路）→ 户外；
 * 用户自绘区域没有标记，则看它当前铺的材料是否属于户外组（铺了草坪 / 柏油就当作户外）。 */
const isOutdoorArea = computed(() => {
  if (geo.value?.outdoor) return true;
  return !!geo.value?.region && MAT_GROUPS.outdoor.includes(state.rooms[props.id]?.mat);
});

/* ---------------- 文案：房间（室内）/ 区域（室内）/ 户外区域 / 飘窗 各说各的 ---------------- */
const isBayArea = computed(() => isBay.value);
const hasLamp = computed(() => !isBayArea.value && !isOutdoorArea.value);

/* 空间类型：房间 / 区域 / 户外区域 / 飘窗 */
const kind = computed(() => isBayArea.value ? 'bay' : isOutdoorArea.value ? 'outdoor'
  : isRegion.value ? 'region' : 'room');

const title = computed(() => ({
  room:    tr('房间', 'Room'),
  region:  tr('区域', 'Area'),
  outdoor: tr('户外区域', 'Outdoor area'),
  bay:     tr('飘窗', 'Bay window'),
}[kind.value]));

const counted = computed(() => kind.value === 'outdoor' || kind.value === 'bay'
  ? tr('不计入套内', 'Not counted')
  : tr('计入套内', 'Counted'));

const nameLabel = computed(() => kind.value === 'outdoor'
  ? tr('区域名称', 'Area name') : tr('名称', 'Name'));

const areaLabel = computed(() => ({
  room:    tr('使用面积', 'Usable area'),
  region:  tr('使用面积', 'Usable area'),
  outdoor: tr('占地面积', 'Site area'),
  bay:     tr('台面面积', 'Sill area'),
}[kind.value]));

const delLabel = computed(() => kind.value === 'outdoor'
  ? tr('删除该区域', 'Delete area')
  : isRegion.value ? tr('删除区域', 'Delete area') : tr('删除房间', 'Delete room'));

/* 面积说明 / 墙体说明：室内算墙面，户外说标高，飘窗说构件 */
const note = computed(() => {
  const wall = tr(`墙面面积（按层高 2.8m 估算，未扣门窗）约 ${(p.value*2.8).toFixed(1)} m²`,
    `Wall area (2.8m ceiling, openings not deducted) ≈ ${(p.value*2.8).toFixed(1)} m²`);
  if (kind.value === 'outdoor')
    return tr('不计入套内使用面积；3D 中不生成天花与顶灯，地面高度由「地面标高」决定。',
      'Not counted as indoor floor area — no ceiling or ceiling lights in 3D; ground height follows "Ground level".');
  if (kind.value === 'bay')
    return tr('飘窗是随墙体生成的构件（0.45m 台面），面积不计入套内。',
      'A bay window is a window component with a 0.45m sill, generated with its wall.');
  if (kind.value === 'region')
    return tr(`自行绘制的区域，与房间同等对待（可铺地面、装顶灯、摆家具）。${wall}`,
      `A hand-drawn area treated like a room (flooring, ceiling light, furniture). ${wall}`);
  return wall;
});

const matTitle = computed(() => isOutdoorArea.value
  ? tr('地面铺装', 'Paving') : tr('地面材料', 'Flooring'));

const costLabel = computed(() => isOutdoorArea.value
  ? tr('铺装估价', 'Estimated paving cost') : tr('材料估价', 'Estimated cost'));

const itemTitle = computed(() => ({
  room:    tr('房间内家具', 'Furniture in room'),
  region:  tr('区域内家具', 'Furniture in area'),
  outdoor: tr('区域内物件', 'Objects in area'),
  bay:     tr('台面物品', 'Items on the sill'),
}[kind.value]));

const itemHint = computed(() => kind.value === 'outdoor'
  ? tr('户外区域常见家具：绿植、户外桌椅、车辆、路灯等（点击条目可在平面图中选中）。',
    'Typical outdoor objects: plants, garden furniture, vehicles, street lamps (click a row to select it).')
  : tr('点击条目可在平面图中选中该家具。', 'Click a row to select that item on the plan.'));

const matGroups = computed(() => {
  const indoor  = { k: 'indoor',  label: tr('室内', 'Indoor'),  keys: MAT_GROUPS.indoor };
  const outdoor = { k: 'outdoor', label: tr('户外', 'Outdoor'), keys: MAT_GROUPS.outdoor };
  return isOutdoorArea.value ? [outdoor, indoor] : [indoor, outdoor];
});

/* 顶灯款式：圆形（默认）/ 正方形 / 长方形 / 无 */
const LIGHTS = [
  { k: 'round',  cn: '圆形',   en: 'Round',     style: { background: '#fff4d6', borderRadius: '50%' } },
  { k: 'square', cn: '正方形', en: 'Square',    style: { background: '#fff4d6', borderRadius: '4px' } },
  { k: 'rect',   cn: '长方形', en: 'Rectangle', style: { background: '#fff4d6', borderRadius: '4px', width: '34px' } },
  { k: 'none',   cn: '无',     en: 'None',      style: { background: 'transparent', border: '1px dashed #c3bdb2', borderRadius: '4px' } },
];
/* 户外区域的地面抬高（mm）：3D 按此抬高地面（人行道 / 路缘石），默认 8mm 防共面 */
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
const a    = computed(() => geo.value ? roomArea(geo.value) : 0);
const p    = computed(() => geo.value ? roomPerimeter(geo.value) : 0);
const bb   = computed(() => geo.value ? bbox(geo.value.poly) : [0, 0, 0, 0]);
const cost = computed(() => Math.round(a.value*(MATS[room.value?.mat]?.price || 0)*1.05));

const inside = computed(() => state.furniture.filter(f =>
  f.cx > bb.value[0] && f.cx < bb.value[2] && f.cy > bb.value[1] && f.cy < bb.value[3]));

function setMat(k){
  mutate(() => { state.rooms[props.id].mat = k; });
}

function del(){ deleteRoom(props.id); }

/* 名称：输入时即时生效（平面图标签实时更新），失焦/回车时记入撤销栈 */
let nameBefore = null;
function onNameFocus(){ nameBefore = snap(); }
function onNameInput(e){ state.rooms[props.id].name = e.target.value; }
function onNameChange(e){
  const v = e.target.value.trim();
  state.rooms[props.id].name = v || state.rooms[props.id].name;
  if (nameBefore){ commit(nameBefore); nameBefore = null; }
}
</script>
