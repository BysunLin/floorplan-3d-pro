<template>
  <!-- 总图工具条：只在 scale 档（1:N > 2500）出现 -->
  <div class="site-bar">
    <div class="row">
      <button v-for="t in TOOLS" :key="t.k" class="chip" :class="{ on: ui.siteTool === t.k }"
        :title="t.title()" @click="setTool(t.k)">{{ t.label() }}</button>

      <template v-if="ui.siteTool === 'road'">
        <span class="sep"></span>
        <span class="hint">{{ tr('点击加拐点 · 双击 / Esc 结束', 'Click to add points · dbl-click or Esc to finish') }}</span>
        <button v-if="ui.siteRoad" class="chip on" @click="finish">{{ tr('完成', 'Finish') }}</button>
      </template>
    </div>

    <div v-if="selB" class="row">
      <input class="name" :value="selB.name" :placeholder="tr('楼栋名称', 'Building name')"
        :title="tr('回车确认', 'Press Enter to apply')"
        @change="onRename" @keydown.enter="$event.target.blur()">
      <button class="chip" :disabled="selB.isActive" :title="selB.isActive
        ? tr('当前楼栋的旋转需要烘焙几何，下一阶段支持', 'Rotating the active building needs geometry baking (next stage)')
        : tr('整栋旋转 90°', 'Rotate 90°')" @click="rotate">{{ tr('旋转 90°', 'Rotate 90°') }}</button>
      <button class="chip" :disabled="selB.isActive" :title="selB.isActive
        ? tr('当前楼栋是方案本体，不能删除', 'The active building is the project itself')
        : tr('删除这栋楼', 'Delete this building')" @click="remove">{{ tr('删除', 'Delete') }}</button>
    </div>
  </div>
</template>

<script setup>
/* ============================================================================
 *  总图工具条（site 档专用）
 *
 *  只做三件事：选择/拖动楼栋、放新楼栋、画小区道路。
 *  室内编辑工具（选择/测量/拆改）在总图档本来就不渲染，两套工具互不干扰。
 * ========================================================================== */
import { computed } from 'vue';
import { usePlanStore, useUiStore, useViewStore } from '@/stores/index.js';
import { finishSiteRoad } from '@/workspace/plan2d/interaction/usePlanInteraction.js';
import { tr } from '@/i18n.js';

const plan = usePlanStore();
const uiStore = useUiStore();
const viewStore = useViewStore();
const { ui } = uiStore;
const { view } = viewStore;

const TOOLS = [
  { k: 'select', label: () => tr('选择 / 移动', 'Select / Move'), title: () => tr('点选楼栋后拖动移动', 'Click a building, drag to move') },
  { k: 'building', label: () => tr('放楼栋', 'Add building'), title: () => tr('点击场地放置一栋楼（模板 = 当前方案）', 'Click the site to place a building (template = current plan)') },
  { k: 'road', label: () => tr('画道路', 'Road'), title: () => tr('连续点击画小区道路中心线', 'Click to draw the road centreline') }
];

const selB = computed(() => {
  const sel = ui.siteSel;
  if (!sel || sel.kind !== 'building') return null;
  return plan.siteBuildings.find(b => b.id === sel.id) || null;
});

function setTool(k){
  ui.siteTool = k;
  if (k !== 'select') ui.siteSel = null;
  if (k !== 'road'){ ui.siteRoad = null; }
}

function finish(){ finishSiteRoad(); }

function onRename(e){
  if (!selB.value) return;
  plan.renameBuilding(selB.value.id, e.target.value);
}

function rotate(){ if (selB.value) plan.rotateBuilding(selB.value.id, 90); }

function remove(){
  if (!selB.value) return;
  if (plan.removeBuilding(selB.value.id)) ui.siteSel = null;
}
</script>

<style scoped>
.site-bar{
  display:flex; flex-direction:column; gap:6px; padding:6px 8px;
  background:var(--glass); border:1px solid var(--glass-line); border-radius:10px;
  backdrop-filter:blur(10px); box-shadow:0 6px 18px rgba(60,45,30,.12);
  pointer-events:auto;
}
.row{display:flex; align-items:center; gap:4px; flex-wrap:wrap}
.chip{
  border:1px solid transparent; background:transparent; color:var(--ink);
  font-size:12px; padding:4px 9px; border-radius:7px; cursor:pointer; white-space:nowrap;
}
.chip:hover:not(:disabled){background:#f2ece2}
.chip.on{background:var(--accent-soft); color:var(--accent); border-color:var(--accent)}
.chip:disabled{opacity:.4; cursor:not-allowed}
.sep{width:1px; height:16px; background:var(--line); margin:0 4px}
.hint{font-size:11px; color:var(--muted)}
.name{
  width:130px; font-size:12px; padding:4px 8px; border-radius:7px;
  border:1px solid var(--line); background:#fff; color:var(--ink);
}
</style>
