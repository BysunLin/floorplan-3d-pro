<template>
  <div class="lib">
    <!-- 面板头：宽屏点击收起为工作区左上角浮层按钮，窄屏关闭抽屉 -->
    <div class="pane-head">
      <b>{{ wallMode ? tr('墙面组件', 'Wall parts') : tr('家具库', 'Library') }}</b>
      <button class="pane-fold" :title="tr('收起为工作区左上角的浮层按钮', 'Collapse to a floating button at the top-left')"
        @click="collapsePane('lib')">« {{ tr('收起', 'Hide') }}</button>
    </div>

    <!-- 3D 房间跳转 -->
    <div id="lib3d" class="only3d">
      <h4>{{ tr('房间 · 点击飞到该房间', 'Rooms · click to fly there') }}</h4>
      <RoomList/>
    </div>

    <!-- 拆改墙体 → 墙面组件库；否则 → 家具库 -->
    <div id="lib">
      <template v-if="wallMode">
        <div class="lib-note">{{ wallTip }}</div>

        <template v-for="c in WALL_LIB" :key="c.cat">
          <h4>{{ tr(c.cat, c.en) }}</h4>
          <div class="lib-grid">
            <div
              v-for="it in c.items" :key="it.id"
              class="item" :class="{on: ui.wallItem === it.id}" :data-wall-item="it.id"
              :title="titleOf(it)"
              @pointerdown="onWallDown($event, it)"
            >
              <svg :viewBox="wallViewBox" v-html="wallSVG(it)"></svg>
              <b>{{ tr(it.name, it.en) }}</b>
              <small>{{ it.len ? it.len + ' mm' : tr('两点绘制', 'Pick 2 pts') }}</small>
            </div>
          </div>
        </template>

        <div class="hint">{{ wallHint }}</div>
      </template>

      <template v-else>
        <div class="lib-search">
          <input
            v-model="q"
            type="search"
            :placeholder="tr('搜索家具…', 'Search furniture…')"
            @keydown.stop
          />
          <button v-if="q" class="clear" :title="tr('清除', 'Clear')" @click="q = ''">×</button>
        </div>

        <!-- 房间：区域绘制（仅选择模式） -->
        <template v-if="showRoomCat">
          <h4>{{ tr('房间', 'Room') }}</h4>
          <div class="lib-grid one">
            <div class="item region" :class="{on: !!ui.regionDraw}" :title="regionTip" @click="toggleRegion">
              <svg viewBox="0 0 120 80" v-html="REGION_ICON"></svg>
              <b>{{ tr('区域绘制', 'Draw area') }}</b>
              <small>{{ tr('两点 / 拖拽矩形', '2 points / drag') }}</small>
            </div>
          </div>
        </template>

        <template v-for="g in filtered" :key="g.cat">
          <h4>{{ nm(g.cat) }}</h4>
          <div class="lib-grid">
            <div
              v-for="(it, ii) in g.items" :key="g.ci + ':' + ii"
              class="item" :data-key="g.ci + ':' + ii"
              :title="tr('点击添加，或拖到平面图中的指定位置', 'Click to add, or drag onto the plan')"
              @pointerdown="onItemDown($event, it)"
            >
              <svg :viewBox="viewBoxOf(it)" v-html="furnSVG(it[0], it[2], it[3], it[4])"></svg>
              <b>{{ nm(it[1]) }}</b>
              <small>{{ it[2] }}×{{ it[3] }}</small>
            </div>
          </div>
        </template>

        <div v-if="!filtered.length" class="lib-empty">{{ tr('未找到匹配的家具', 'No matching furniture') }}</div>
        <div class="hint">{{ hint }}</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import RoomList from '@/shell/left-panel/RoomList.vue';
import { usePlanStore, useUiStore, useViewStore } from '@/stores/index.js';
import { LIB } from '@/core/library/index.js';
import { WALL_LIB, wallSVG, wallViewBox } from '@/core/library/wallItems.js';
import { COARSE, TAP, bbox, ROOMS } from '@/core/model/plan.js';
import { furnSVG } from '@/core/library/furnSvg.js';
import { tr, nm } from '@/i18n.js';
import { dropPoint } from '@/workspace/plan2d/interaction/usePlanInteraction.js';
import { getEngine } from '@/workspace/view3d/registry.js';

const plan = usePlanStore();
const uiStore = useUiStore();
const viewStore = useViewStore();
const { state, addItem } = plan;
const { ui } = uiStore;
const { is3D } = storeToRefs(uiStore);
const { closeDrawers, setWallItem, startRegionDraw, cancelRegionDraw, collapsePane } = uiStore;

/* ---------------- 房间 → 区域绘制 ---------------- */
const showRoomCat = computed(() => !is3D.value && ui.tool === 'select' && !q.value.trim());
const REGION_ICON = `<rect x="13" y="13" width="94" height="54" fill="none" stroke="#b5653a" stroke-width="2.6" stroke-dasharray="8 5"/>`
  + `<circle cx="13" cy="13" r="5" fill="#b5653a"/><circle cx="107" cy="67" r="5" fill="#b5653a"/>`
  + `<path d="M13 76h94" stroke="#b5653a" stroke-width="2" opacity=".45"/>`;
const regionTip = computed(() => tr(
  '点击后在平面图上拖出矩形（或依次点 A、B 两点）：区域内墙体 / 门窗自动扣除，起终点吸附墙体与已有区域的顶点、边线；新区域必须与墙体或已有区域相连',
  'Click, then drag a rectangle on the plan (or click A then B). Walls and openings inside are cut out; both points snap to wall / area corners and edges, and the new area must touch a wall or an existing area'));
function toggleRegion(){
  if (ui.regionDraw) cancelRegionDraw();
  else startRegionDraw();
}

const viewBoxOf = it => {
  const pad = Math.max(it[2], it[3])*.08;
  return `${-it[2]/2 - pad} ${-it[3]/2 - pad} ${it[2] + 2*pad} ${it[3] + 2*pad}`;
};

/* ---------------- 墙面组件库（拆改墙体模式） ---------------- */
const wallMode = computed(() => ui.tool === 'demolish');

const wallTip = computed(() => tr(
  '选一个组件，再在平面图上点击：墙体（含玻璃墙面）→ 点 A 点、再点 B 点（自动 90° 且不出外墙）；门窗 → 点在非承重墙、玻璃墙面或外墙上。不选组件时点击墙体 / 门窗即可选中。',
  'Pick a component, then click on the plan: walls (glass walls included) → click point A then point B (always 90°, kept inside the envelope); doors/windows → click a partition, glass or exterior wall. With nothing selected, click a wall or opening to select it.'
));

const wallHint = computed(() => tr(
  '门窗可加在非承重墙 / 玻璃墙面 / 外墙（浅灰、淡蓝或外墙色，选中门窗组件时会绿色高亮）上，承重墙（黑色）不可开洞；开洞会把该段墙裁剪成独立墙段（中部→2 段，靠边→1 段连接元素）。起点落在承重 / 非承重墙内会吸附到墙边并强制 90° 垂直绘制；画墙时按 Shift 可切换横 / 竖（未吸附时），右键取消。双开门洞口默认 1200 mm，比普通房门更宽。',
  'Doors and windows fit partition, glass or exterior walls (light grey / pale blue / exterior grey; highlighted green when a door/window is selected) but not bearing walls (black); placing one splits that wall into separate segments (middle → 2, near edge → 1 connecting the element). Starting a wall inside a bearing/partition wall snaps to its edge and forces a 90° perpendicular draw; hold Shift while drawing to switch axis (when not snapped), right-click to cancel. Double doors use a 1200 mm opening — wider than a standard door.'
));

const titleOf = it => it.kind === 'wall'
  ? tr('点 A 点、再点 B 点画一段墙（落在墙上会吸附边缘并垂直）', 'Click point A then B to draw a wall (snaps to edge & perpendicular when started on a wall)')
  : tr('点击非承重墙 / 外墙，在该位置开洞（自动裁剪墙体）', 'Click a partition or exterior wall to place it there (wall is auto-split)');

function onWallDown(e, it){
  if (e.button) return;
  setWallItem(ui.wallItem === it.id ? null : it.id);   // 再点一次取消选中
}

/* ---------------- 搜索过滤 ---------------- */
const q = ref('');

/* 按关键字过滤家具：匹配本地化名 / 原始名 / 类型键；空关键字则显示全部 */
const filtered = computed(() => {
  const kw = q.value.trim().toLowerCase();
  if (!kw) return LIB.map((c, ci) => ({ ci, cat: c.cat, items: c.items }));
  return LIB
    .map((c, ci) => {
      const items = c.items.filter(it =>
        nm(it[1]).toLowerCase().includes(kw) ||
        String(it[1]).toLowerCase().includes(kw) ||
        String(it[0]).toLowerCase().includes(kw)
      );
      return { ci, cat: c.cat, items };
    })
    .filter(g => g.items.length);
});

const hint = computed(() => tr(
  `家具按真实尺寸（mm）绘制。${COARSE ? '点一下放到画面中央，或按住向右拖到平面图 / 3D 地面上的指定位置（上下滑动为滚动列表）。' : '点击添加到画面中央，或直接拖到平面图 / 3D 地面上。'}添加后可在右侧修改宽深与颜色。`,
  `Furniture is drawn at real size (mm). ${COARSE ? 'Tap to place at the center, or hold and drag right onto the plan / 3D floor (swipe up/down to scroll).' : 'Click to add at the center, or drag onto the plan / 3D floor.'} Edit size and color in the right panel afterwards.`
));

/* ---------------- 拖放 ---------------- */
let libDrag = null;

function onItemDown(e, it){
  if (e.button) return;
  libDrag = { el: e.currentTarget, id: e.pointerId, sx: e.clientX, sy: e.clientY, it, ghost: null };
}

function onWindowMove(e){
  if (!libDrag || e.pointerId !== libDrag.id) return;
  const { it } = libDrag;
  if (!libDrag.ghost){
    if (Math.hypot(e.clientX - libDrag.sx, e.clientY - libDrag.sy) < TAP) return;
    const g = libDrag.ghost = document.createElement('div');
    g.id = 'ghost';
    g.innerHTML = `<svg viewBox="${-it[2]/2} ${-it[3]/2} ${it[2]} ${it[3]}">${furnSVG(it[0], it[2], it[3], it[4])}</svg>`;
    document.body.appendChild(g);
    libDrag.el.classList.add('dragging');
  }
  // 幽灵图按落点处的比例显示真实大小（3D 中近大远小）。
  // 还没进入编辑区时 dropPoint 为 null：2D 用当前视图缩放 view.s（px/mm），不能用 1，
  // 否则 2400mm 的家具会变成 2400px 的巨型图标；并统一限制最大像素尺寸兜底。
  const g = libDrag.ghost;
  const dp = dropPoint(e.clientX, e.clientY);
  const s = Math.max(dp?.s ?? (is3D.value ? .05 : viewStore.view.s), .012);
  let wPx = Math.max(28, it[2]*s), hPx = Math.max(20, it[3]*s);
  const cap = 200;
  const k = Math.min(1, cap / Math.max(wPx, hPx, 1));
  wPx *= k; hPx *= k;
  Object.assign(g.style, {
    width:  Math.round(wPx) + 'px',
    height: Math.round(hPx) + 'px',
    left: e.clientX + 'px',
    top:  e.clientY + 'px'
  });
}

function onWindowUp(e, ok){
  if (!libDrag || e.pointerId !== libDrag.id) return;
  const d = libDrag;
  libDrag = null;
  d.el.classList.remove('dragging');
  if (d.ghost){
    d.ghost.remove();
    if (!ok) return;
    const p = dropPoint(e.clientX, e.clientY);
    if (p) addItem(d.it, p.x, p.y);
    return;
  }
  if (!ok) return;
  // 轻点：放到选中房间中心，否则放到画面中心
  let p = null;
  if (ui.sel?.kind === 'room'){
    const b = bbox(ROOMS.find(r => r.id === ui.sel.id).poly);
    p = { x: (b[0] + b[2])/2, y: (b[1] + b[3])/2 };
  } else if (is3D.value){
    const r = document.querySelector('#stage').getBoundingClientRect();
    p = getEngine()?.groundAt(r.left + r.width/2, r.top + r.height/2);
  }
  if (!p) p = { x: 7600, y: 7000 };     // 2D 未选中房间时的兜底中心
  addItem(d.it, p.x, p.y);
  closeDrawers();
}

onMounted(() => {
  addEventListener('pointermove', onWindowMove);
  addEventListener('pointerup', e => onWindowUp(e, true));
  addEventListener('pointercancel', e => onWindowUp(e, false));
});
onBeforeUnmount(() => {
  removeEventListener('pointermove', onWindowMove);
});
</script>
