<template>
  <!-- 房间面积 -->
  <section>
    <h3>{{ tr('房间面积', 'Room Areas') }} <small>{{ tr('点击查看 / 更换地面', 'Click to view / change flooring') }}</small></h3>
    <table>
      <tr v-for="r in ROOMS" :key="r.id" class="click" :data-room="r.id" @click="openRoom(r)">
        <td>
          <span class="sw" :style="{background: MATS[state.rooms[r.id]?.mat]?.sw}"></span>{{ nm(state.rooms[r.id]?.name || r.name) }}
          <span v-if="r.counted === false" class="muted">*</span>
        </td>
        <td class="r">{{ isVoid(r) ? tr('挑空', 'Void') : roomArea(r).toFixed(2) + ' m²' }}</td>
      </tr>
    </table>
    <div class="total">
      <span>{{ tr('套内使用面积', 'Net floor area') }}</span>
      <b>{{ total.toFixed(2) }} m²</b>
    </div>
    <div class="muted" style="font-size:11px;margin-top:4px">
      {{ tr('* 飘窗、入户走廊不计入使用面积；面积按墙体内净尺寸计算', '* Bay windows and the entry corridor are excluded; areas use net inner wall dimensions') }}
    </div>
  </section>

  <!-- 各层面积 -->
  <section>
    <h3>{{ tr('各层面积', 'Area by floor') }}</h3>
    <table>
      <tr v-for="lv in areaLevels" :key="lv.id">
        <td>{{ lvLabel(lv) }}</td>
        <td class="r">{{ lv.area.toFixed(2) }} m²</td>
      </tr>
    </table>
    <div class="total">
      <span>{{ tr('总面积', 'Total area') }}</span>
      <b>{{ areaAll.toFixed(2) }} m²</b>
    </div>
  </section>

  <!-- 强排指标：楼栋体量 + 用地红线 + 绿地 -->
  <section v-if="metrics.siteArea">
    <h3>{{ tr('强排指标', 'Massing Metrics') }}
      <small>{{ metrics.source === 'parcel' ? tr('按用地红线', 'red line') : tr('按场地外接范围', 'site extent') }}</small>
    </h3>
    <table>
      <tr><td>{{ tr('用地面积', 'Site area') }}</td><td class="r">{{ metrics.siteArea.toLocaleString() }} m²</td></tr>
      <tr><td>{{ tr('总建筑面积', 'Gross floor area') }}</td><td class="r">{{ metrics.gfa.toLocaleString() }} m²</td></tr>
      <tr><td>{{ tr('容积率', 'FAR') }}</td><td class="r">{{ metrics.far.toFixed(2) }}</td></tr>
      <tr><td>{{ tr('建筑密度', 'Coverage') }}</td><td class="r">{{ (metrics.density*100).toFixed(1) }}%</td></tr>
      <tr><td>{{ tr('绿地率', 'Green ratio') }}</td><td class="r">{{ (metrics.greenRatio*100).toFixed(1) }}%</td></tr>
      <tr v-if="metrics.parking">
        <td>{{ tr('车位 / 户', 'Stalls / household') }}</td>
        <td class="r">{{ households ? metrics.perHousehold.toFixed(2) : '—' }}</td>
      </tr>
    </table>
    <div class="muted" style="font-size:11px;margin-top:4px">
      {{ tr('按楼栋体量层数估算，不含地下室；绿地含草坪 / 花境 / 树阵 / 水生植物 / 顶板覆土', 'Estimated from massing floors, excluding basement; green includes lawn / flower beds / tree grids / aquatic plants / roof soil') }}
    </div>
  </section>

  <!-- 地面材料估算 -->
  <section>
    <h3>{{ tr('地面材料估算', 'Flooring Estimate') }} <small>{{ tr('含 5% 损耗', 'incl. 5% waste') }}</small></h3>
    <table>
      <tr v-for="m in matRows" :key="m.kind">
        <td><span class="sw" :style="{background: m.sw}"></span>{{ nm(m.name) }}</td>
        <td class="r">{{ m.area.toFixed(1) }} m²</td>
        <td class="r">¥{{ m.cost.toLocaleString() }}</td>
      </tr>
    </table>
    <div class="total">
      <span>{{ tr('地面材料合计', 'Flooring total') }}</span>
      <b>¥{{ matTotal.toLocaleString() }}</b>
    </div>
  </section>

  <!-- 方案统计 -->
  <section>
    <h3>{{ tr('方案统计', 'Plan Stats') }}</h3>
    <div class="stats">
      <div><small>{{ tr('家具数量', 'Furniture') }}</small><span class="big">{{ state.furniture.length }}</span></div>
      <div><small>{{ tr('拆除墙体', 'Walls removed') }}</small><span class="big">{{ demolishedLen.toFixed(1) }}</span> m</div>
    </div>
    <div class="actions">
      <button class="btn" @click="clearMeasures">{{ tr('清除测量', 'Clear measures') }} ({{ state.measures.length }})</button>
      <button class="btn danger" @click="clearLayout()">{{ tr('清空布置', 'Clear layout') }}</button>
    </div>
  </section>

  <!-- 车位指标：跨全部楼层汇总，地库模块按排布公式折算 -->
  <section v-if="park.total">
    <h3>{{ tr('车位指标', 'Parking Metrics') }} <small>{{ tr('含地库模块自动折算', 'modules counted') }}</small></h3>
    <div class="ghead">
      <select v-model="preset" :aria-label="tr('规则包', 'Rule preset')">
        <option v-for="p in presetOptions" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
      <button class="btn" @click="exportGarageReport">{{ tr('导出报告', 'Export report') }}</button>
    </div>
    <div class="stats">
      <div><small>{{ tr('总车位', 'Total stalls') }}</small><span class="big">{{ park.total }}</span></div>
      <div>
        <small>{{ tr('户数', 'Households') }}</small>
        <input v-model.number="households" type="number" min="0" step="1" @keydown.stop
          style="width:100%;margin-top:4px;padding:2px 6px;border:1px solid var(--line);
            border-radius:6px;font:inherit;background:#fff;color:inherit">
      </div>
      <div>
        <small>{{ tr('户均车位', 'Stalls per household') }}</small>
        <span class="big">{{ households ? perHousehold.toFixed(2) : '—' }}</span>
      </div>
      <div><small>{{ tr('充电 / 无障碍占比', 'EV / accessible share') }}</small>
        <span class="big">{{ pct(park.ev) }}% / {{ pct(park.accessible) }}%</span>
      </div>
    </div>
    <table>
      <tr v-if="park.standard"><td>{{ tr('标准车位', 'Standard') }}</td><td class="r">{{ park.standard }}</td></tr>
      <tr v-if="park.tandem"><td>{{ tr('子母车位', 'Tandem') }}</td><td class="r">{{ park.tandem }}</td></tr>
      <tr v-if="park.compact"><td>{{ tr('微型车位', 'Compact') }}</td><td class="r">{{ park.compact }}</td></tr>
      <tr v-if="park.modules">
        <td>{{ tr('地库模块', 'Garage modules') }}</td>
        <td class="r">{{ park.modules }} × / {{ park.moduleStalls }}</td>
      </tr>
      <tr v-if="audit.earthwork.slabArea">
        <td>{{ tr('顶板覆土 / 基坑土方', 'Soil / excavation') }}</td>
        <td class="r">{{ audit.earthwork.soilVolume }} / {{ audit.earthwork.excavationVolume }} m³</td>
      </tr>
    </table>
    <div class="muted" style="font-size:11px;margin-top:4px">
      {{ tr('统计范围：全部楼层；地库模块按 2.5m 车位、5.3m 进深、6m 车道折算；坡道坡度按层高 3.6m、土方按覆土 1.0m / 工作面 0.6m 估算', 'All floors; modules use 2.5m stalls, 5.3m depth and 6m aisles; ramp slope assumes 3.6m storeys, earthwork assumes 1.0m soil and 0.6m working layer') }}
    </div>
  </section>

  <!-- 地库自检：车位配比 / 充电 / 无障碍 / 出入口 / 车道 -->
  <section v-if="checks.length">
    <h3>{{ tr('地库自检', 'Garage Checks') }} <small>{{ tr('规范提示', 'rule hints') }}</small></h3>
    <ul class="gcheck">
      <li v-for="c in checks" :key="c.key" :class="c.level">
        <i></i><span>{{ label(c) }}</span>
      </li>
    </ul>
  </section>

  <!-- 触屏操作说明 -->
  <section v-if="COARSE">
    <h3>{{ tr('触屏操作', 'Touch Controls') }}</h3>
    <div class="kbd">
      <kbd>{{ tr('单指拖动', '1-finger drag') }}</kbd><span>{{ tr('空白处平移画面', 'Pan on empty space') }}</span>
      <kbd>{{ tr('双指', '2 fingers') }}</kbd><span>{{ tr('捏合缩放、拖动平移', 'Pinch to zoom, drag to pan') }}</span>
      <kbd>{{ tr('家具库', 'Library') }}</kbd><span>{{ tr('点一下放到画面中央，或按住向右拖到指定位置', 'Tap to place at center, or hold and drag right to a spot') }}</span>
      <kbd>{{ tr('点家具', 'Tap item') }}</kbd><span>{{ tr('选中后拖动移动；拖顶部圆点旋转、右下方块改尺寸', 'Drag to move; top dot rotates, bottom-right square resizes') }}</span>
      <kbd>{{ tr('工具条', 'Toolbar') }}</kbd><span>{{ tr('选中后底部可旋转 / 复制 / 删除', 'Bottom bar can rotate / duplicate / delete') }}</span>
      <kbd>{{ tr('测量', 'Measure') }}</kbd><span>{{ tr('按住拖出一条线，或依次点两点', 'Hold and drag a line, or tap two points') }}</span>
      <kbd>{{ tr('3D 漫游', '3D walk') }}</kbd><span>{{ tr('左下摇杆移动，拖动屏幕转向，点门开关', 'Joystick moves, drag to look, tap doors to open') }}</span>
    </div>
  </section>
</template>

<script setup>
import { computed, shallowRef, watch, onBeforeUnmount } from 'vue';
import { usePlanStore, useUiStore } from '@/stores/index.js';
import { ROOMS, MATS, WALLS, COARSE } from '@/core/model/plan.js';
import { roomArea } from '@/core/geometry/region.js';
import { GARAGE_PRESETS, presetOf } from '@/core/garage/audit.js';
import { checkText } from '@/core/garage/text.js';
import { reportAsync } from '@/core/workers/client.js';
import { buildGarageReportCsv, garageReportFileName } from '@/core/garage/report.js';
import { tr, nm, levelName } from '@/i18n.js';

const plan = usePlanStore();
const { state, mutate, clearLayout, planVersion } = plan;
const { select } = useUiStore();

/* 参与面积统计的房间（响应式：切换户型时 ROOMS 会整体替换）；挑空不计入使用面积 */
const isVoid = r => state.rooms[r.id]?.mat === 'void';
const counting = computed(() => ROOMS.filter(r => r.counted !== false && !isVoid(r)));

/* Worker 报告：车位审计 / 强排指标 / 房间净面积（含区域布尔） */
const EMPTY_AUDIT = {
  stats: { total: 0, standard: 0, ev: 0, accessible: 0, tandem: 0, compact: 0, modules: 0, moduleStalls: 0 },
  checks: [], preset: 'standard', rules: {},
  connectivity: null, slope: null,
  earthwork: { slabArea: 0, soilVolume: 0, excavationVolume: 0 }
};
const EMPTY_METRICS = {
  siteArea: 0, gfa: 0, far: 0, density: 0,
  greenRatio: 0, perHousehold: 0, parking: 0, source: 'parcel'
};
const report = shallowRef(null);
const audit = computed(() => report.value?.audit || EMPTY_AUDIT);
const metrics = computed(() => report.value?.metrics || EMPTY_METRICS);
const roomAreas = computed(() => report.value?.areas || {});
/** Worker 结果未到 / 某房间缺失时，退回当前层已缓存的净面积 */
const roomA = r => roomAreas.value[r.id] ?? roomArea(r);
const total = computed(() => counting.value.reduce((a, r) => a + roomA(r), 0));

/* 各层面积（含 loft），来自 plan.levelAreas() */
const areaLevels = computed(() => plan.levelAreas());
const areaAll = computed(() => areaLevels.value.reduce((a, l) => a + l.area, 0));
/* 楼层名与楼层条共用一套：地上「一层」、夹层、地下「负一层」 */
const lvLabel = lv => levelName(lv);

/* 按材料归类的面积与造价 */
const matRows = computed(() => {
  const byMat = {};
  ROOMS.forEach(r => {
    const entry = state.rooms[r.id];
    if (!entry || entry.mat === 'void') return;      // 挑空无地面材料，不计入材料估算
    const m = entry.mat;
    byMat[m] = (byMat[m] || 0) + roomA(r);
  });
  return Object.entries(byMat).map(([k, a]) => ({
    kind: k,
    name: MATS[k].name,
    sw: MATS[k].sw,
    area: a,
    cost: Math.round(a*MATS[k].price*1.05)
  }));
});

const matTotal = computed(() => matRows.value.reduce((a, m) => a + m.cost, 0));

/* 只统计墙体：门窗的拆除标记用 nw/nd/ns 前缀，不是墙体下标 */
const demolishedLen = computed(() =>
  state.demolished
    .filter(id => id[0] === 'w')
    .map(id => WALLS[+id.slice(1)])
    .filter(Boolean)
    .reduce((a, w) => a + Math.max(w[2] - w[0], w[3] - w[1]), 0)/1000);

/* 地库审计输入：当前层 + 其它楼层快照（按楼层 id 去重，带标高用于土方估算） */
const garageLevels = computed(() => {
  const out = [], seen = new Set();
  const meta = id => {
    const lv = (state.levels || []).find(l => l.id === id) || { id };
    return { id, elev: lv.elev || 0, kind: lv.kind || 'floor' };
  };
  const add = (id, arr) => {
    if (!id || seen.has(id) || !Array.isArray(arr)) return;
    seen.add(id);
    out.push({ ...meta(id), items: arr });
  };
  add(state.activeLevel, state.furniture);
  for (const [id, d] of Object.entries(state.levelData || {})) add(id, d && d.furniture);
  return out;
});

/* 规则包：状态存 state.garagePreset，随方案保存 */
const preset = computed({
  get: () => (GARAGE_PRESETS[state.garagePreset] ? state.garagePreset : 'standard'),
  set: v => mutate(() => { state.garagePreset = GARAGE_PRESETS[v] ? v : 'standard'; })
});
const presetOptions = computed(() =>
  Object.values(GARAGE_PRESETS).map(p => ({ id: p.id, label: tr(p.label, p.en) })));

/* 户数：手动填写，用于户均车位；写入 state 后随方案保存 */
const households = computed({
  get: () => Number(state.households) || 0,
  set: v => mutate(() => { state.households = Math.max(0, Math.round(Number(v) || 0)); })
});

/* Worker 输入：只在「提交」后重建，拖动过程中不读取家具坐标，避免每帧生成大对象 */
const reportKey = computed(() =>
  `${state.rev || 0}|${planVersion.value}|${households.value}|${preset.value}`);

const snapItems = arr => (arr || []).map(f => ({
  id: f.id, type: f.type, cx: f.cx, cy: f.cy, w: f.w, d: f.d,
  rot: f.rot, sdir: f.sdir ?? 1, color: f.color
}));
const snapRing = ring => (ring || []).map(p => [p[0], p[1]]);

function buildReportPayload(){
  return {
    levels: garageLevels.value.map(l => ({
      id: l.id, elev: l.elev, kind: l.kind, items: snapItems(l.items)
    })),
    rooms: ROOMS.filter(r => r.poly).map(r => ({
      id: r.id, poly: snapRing(r.poly), holes: (r.holes || []).map(snapRing)
    })),
    regions: (state.regions || []).map(r => ({
      poly: snapRing(r.poly), holes: (r.holes || []).map(snapRing)
    })),
    households: households.value,
    preset: preset.value
  };
}

let reportTimer = 0;
let reportSeq = 0;
function scheduleReport(delay = 120){
  clearTimeout(reportTimer);
  reportTimer = setTimeout(fetchReport, delay);
}
async function fetchReport(){
  const my = ++reportSeq;
  const res = await reportAsync(buildReportPayload());
  if (my === reportSeq) report.value = res;   // 只接受最新一次结果
}
watch(reportKey, () => scheduleReport(), { immediate: true });
onBeforeUnmount(() => clearTimeout(reportTimer));

const park = computed(() => audit.value.stats);
const checks = computed(() => audit.value.checks);
const perHousehold = computed(() => households.value ? park.value.total / households.value : 0);
const pct = n => park.value.total ? Math.round(n / park.value.total * 100) : 0;
const label = c => checkText(c, tr);

function exportGarageReport(){
  const p = presetOf(preset.value);
  const csv = buildGarageReportCsv({
    audit: audit.value,
    name: state.planId || '',
    presetLabel: tr(p.label, p.en),
    date: new Date(),
    tr
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = garageReportFileName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function openRoom(r){
  select({ kind: 'room', id: r.id });
}

function clearMeasures(){
  if (!state.measures.length) return;
  mutate(() => { state.measures = []; });
}
</script>
