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
import { computed } from 'vue';
import { usePlanStore, useUiStore } from '@/stores/index.js';
import { ROOMS, MATS, WALLS, COARSE } from '@/core/model/plan.js';
import { roomArea } from '@/core/geometry/region.js';
import { tr, nm, levelName } from '@/i18n.js';

const plan = usePlanStore();
const { state, mutate, clearLayout } = plan;
const { select } = useUiStore();

/* 参与面积统计的房间（响应式：切换户型时 ROOMS 会整体替换）；挑空不计入使用面积 */
const isVoid = r => state.rooms[r.id]?.mat === 'void';
const counting = computed(() => ROOMS.filter(r => r.counted !== false && !isVoid(r)));
const total = computed(() => counting.value.reduce((a, r) => a + roomArea(r), 0));

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
    byMat[m] = (byMat[m] || 0) + roomArea(r);
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

function openRoom(r){
  select({ kind: 'room', id: r.id });
}

function clearMeasures(){
  if (!state.measures.length) return;
  mutate(() => { state.measures = []; });
}
</script>
