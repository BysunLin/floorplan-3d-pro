<template>
  <div class="start">
    <div class="start-inner">
      <!-- 类名统一加 ss- 前缀：避免和全局的 .brand / .actions 等碰撞（窄屏下全局会把 .brand span 隐藏） -->
      <header class="ss-brand">
        <span class="ss-dot"></span>
        <span>{{ tr('户型装修设计', 'Floor Plan Designer') }}</span>
        <button v-if="mode === 'overlay'" class="ss-close" :title="tr('返回编辑 (Esc)', 'Back to editor (Esc)')"
          :aria-label="tr('返回编辑', 'Back to editor')" @click="close">×</button>
      </header>

      <!-- ① 从样板间开始 -->
      <section class="block">
        <div class="sec-head">
          <h1>{{ tr('从样板间开始', 'Start from a sample') }}</h1>
          <button class="more" :title="expanded
            ? tr('只保留推荐的三套样板间', 'Show the three recommended samples only')
            : tr('展开全部样板间户型', 'Show all sample layouts')" @click="expanded = !expanded">
            {{ expanded ? tr('收起 ↑', 'Show less ↑') : tr(`展示全部 (${ALL_PLANS.length}) →`, `Show all (${ALL_PLANS.length}) →`) }}
          </button>
        </div>
        <p class="lead">{{ tr('选一套样板间作为起点，之后可自由修改家具、墙体与楼层', 'Pick a sample as a starting point — furniture, walls and floors stay editable') }}</p>
        <div class="cards">
          <button v-for="id in shownPlans" :key="id" class="card" @click="pick(id)">
            <span class="thumb" v-html="thumbOf(id)"></span>
            <span class="card-body">
              <b>{{ nameOf(id) }}</b>
              <span class="meta">{{ metaOf(id).area }} m²<span class="sep">·</span>{{ floorText(metaOf(id).floors) }}</span>
            </span>
          </button>
        </div>
      </section>

      <!-- ② 正在编辑：只有真正处于编辑状态（本次编辑中 / 之前编辑过）才展示 -->
      <template v-if="showCurrent">
        <hr class="rule">
        <section class="block">
          <h2>{{ tr('正在编辑', 'Currently editing') }}</h2>
          <button class="card current" @click="finish">
            <span class="thumb" v-html="curThumb"></span>
            <span class="card-body">
              <b>{{ curName }}<em class="tag">{{ tr('当前', 'Current') }}</em></b>
              <span class="meta">{{ curArea }} m²<span class="sep">·</span>{{ floorText(curFloors) }}</span>
            </span>
            <span class="go">{{ mode === 'overlay' ? tr('返回编辑', 'Back') : tr('继续编辑', 'Continue') }} →</span>
          </button>
        </section>
      </template>

      <!-- ③ 最近打开的文件 -->
      <hr class="rule">
      <section class="block">
        <h2>{{ tr('最近打开的文件', 'Recent files') }}</h2>
        <div class="empty">
          <p>{{ isDesktop
            ? tr('暂无最近打开的文件', 'No recent files yet')
            : tr('Web 版暂不支持：浏览器无法记录本地文件，桌面版可直接打开最近的设计文件',
                 'Not available on the web — browsers cannot track local files. The desktop app can reopen recent designs.') }}</p>
          <button class="ghost" disabled>{{ tr('打开文件…', 'Open file…') }}</button>
        </div>
      </section>

      <!-- ④ 导入 & 导出：原「开始」下拉菜单的功能 -->
      <hr class="rule">
      <section class="block">
        <h2>{{ tr('导入 & 导出', 'Import & Export') }}</h2>
        <div class="file-actions">
          <button class="act" @click="fileEl?.click()">{{ tr('导入方案 JSON', 'Import JSON') }}</button>
          <button class="act" @click="imgEl?.click()"
            :title="tr('选择户型图片，自动识别墙体与房间', 'Pick a floor plan image to detect walls and rooms')">
            {{ tr('导入户型图', 'Import plan image') }}<em class="beta">beta</em>
          </button>
          <button class="act" :disabled="!pngReady" :title="pngReady ? '' : tr('进入编辑器后可用', 'Available once editing')"
            @click="onExportPNG">{{ tr('导出图片', 'Export image') }}</button>
          <button class="act" @click="onExportJSON">{{ tr('导出方案 JSON', 'Export JSON') }}</button>
        </div>
        <p class="note">{{ tr('单位 mm · 数据保存在本机浏览器', 'Units mm · Saved in this browser') }}</p>
      </section>
    </div>

    <input type="file" ref="fileEl" accept=".json,application/json" hidden @change="onFile">
    <input type="file" ref="imgEl" accept="image/*" hidden @change="onImage">

    <!-- 导入户型图：识别 → 预览 → 二次确认 -->
    <ImportFloorPlanDialog v-if="importFile" :file="importFile"
      @close="importFile = null" @apply="onImportApply"/>
  </div>
</template>

<script setup>
/* ============================================================================
 *  初始化界面（启动首页 / 编辑中从顶部「开始」打开）
 *
 *  mode='boot'     启动时替代编辑器整屏展示；选样板间 / 继续编辑后挂载 AppShell
 *  mode='overlay'  编辑中打开，盖在编辑器上，可 Esc / × 返回编辑
 *
 *  依赖很轻：只需要几何（缩略图是纯 SVG），所以 boot 模式下不挂 AppShell
 *  也能完整渲染。plan store 的 initGeometry() 在 stores/index.js 里于模块加载期
 *  就跑完了，因此「正在编辑」拿到的一定是上次编辑的户型。
 * ========================================================================== */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { tr, lang } from '@/i18n.js';
import { usePlanStore, useUiStore, useViewStore } from '@/stores/index.js';
import { FEATURED_PLANS, ALL_PLANS, planName, planArea, makePlan } from '@/core/plans/index.js';
import { planThumbSvg, geoThumbSvg } from '@/core/plans/thumb.js';
import { BOUNDS, WALLS, ROOMS } from '@/core/model/plan.js';
import { roomArea } from '@/core/geometry/region.js';
import { applyProjectDocument } from '@/app/providers/useProjectFile.js';
import { saveProjectJSON, exportPlanPNG } from '@/app/providers/useExport.js';
import { hasEditingSession } from '@/app/providers/useSession.js';
import ImportFloorPlanDialog from '@/shell/dialog/ImportFloorPlanDialog.vue';

const props = defineProps({
  /** 'boot' 启动首页 | 'overlay' 编辑中打开 */
  mode: { type: String, default: 'boot' }
});
const emit = defineEmits(['enter', 'close']);

const plan = usePlanStore();
const uiStore = useUiStore();
const viewStore = useViewStore();
const { planId } = storeToRefs(plan);
const { state } = plan;      // reactive 对象，直接取（storeToRefs 会包成 ref）

/* ---------------- 会话：是否「正在编辑」 ---------------- */

/** 首次进入（从未编辑过）不展示「正在编辑」；编辑中打开则一定展示 */
const showCurrent = ref(props.mode === 'overlay' || hasEditingSession());

/* overlay 模式下 Esc 返回编辑 */
function onKey(e){
  if (props.mode !== 'overlay') return;
  if (e.key === 'Escape'){ e.stopPropagation(); emit('close'); }
}
onMounted(() => props.mode === 'overlay' && addEventListener('keydown', onKey, true));
onBeforeUnmount(() => removeEventListener('keydown', onKey, true));

/* ---------------- 样板间 ---------------- */

/** 默认只展示前三推荐；点「展示全部」展开完整列表 */
const expanded = ref(false);
const shownPlans = computed(() => (expanded.value ? ALL_PLANS : FEATURED_PLANS));

const thumbCache = {};   // 缩略图缓存：切换语言 / 展开收起都不该重算 SVG
const metaCache = {};

const thumbOf = id => (thumbCache[id] ??= planThumbSvg(id));
const nameOf = id => planName(id, lang.value);

function metaOf(id){
  if (!metaCache[id]){
    const g = makePlan(id);
    metaCache[id] = { area: planArea(id), floors: (g.levels || []).length || 1 };
  }
  return metaCache[id];
}

function floorText(n){
  return n > 1 ? tr(`${n} 层`, `${n} floors`) : tr('单层', 'Single floor');
}

/* ---------------- 正在编辑 ---------------- */

const curName = computed(() => planName(planId.value, lang.value));

/** 当前户型：按「活的几何」画（含自建墙、已拆墙、区域），而不是样板间原图 */
const curThumb = computed(() => geoThumbSvg({
  bounds: BOUNDS,
  walls: WALLS.filter((w, i) => !state.demolished.includes('w' + i)),
  rooms: ROOMS,
  regions: state.regions || []
}));

const curArea = computed(() => ROOMS
  .filter(r => r.counted !== false && state.rooms?.[r.id]?.mat !== 'void')
  .reduce((a, r) => a + roomArea(r), 0).toFixed(1));

const curFloors = computed(() => (state.levels || []).length || 1);

/* ---------------- 文件 ---------------- */

const fileEl = ref(null);
const imgEl = ref(null);
const importFile = ref(null);            // 待识别的户型图片（只在内存里，不落盘）

/** 导出图片依赖编辑器里的 #plan（boot 模式下还没挂载） */
const pngReady = computed(() => props.mode === 'overlay');

const isDesktop = typeof window !== 'undefined'
  && (!!window.__TAURI__ || !!window.__TAURI_INTERNALS__ || !!window.electronAPI);

async function onFile(e){
  const file = e.target.files[0];
  e.target.value = '';                   // 允许重复选择同一文件
  if (!file) return;
  try {
    const { legacy } = applyProjectDocument(JSON.parse(await file.text()));
    uiStore.showToast(legacy
      ? tr('已导入（旧版文件）', 'Imported (legacy file)')
      : tr('已导入方案', 'Project imported'));
    finish();                            // 导入即在编辑，boot 模式下直接进编辑器
  } catch (err){
    uiStore.showToast(tr('导入失败：', 'Import failed: ') + (err?.message || tr('文件格式不正确', 'invalid file')));
  }
}

function onImage(e){
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\//.test(file.type))
    return uiStore.showToast(tr('请选择图片文件（PNG / JPG）', 'Please pick an image file (PNG / JPG)'));
  importFile.value = file;               // 交给弹窗去识别 + 二次确认
}

function onImportApply({ geo, meta }){
  importFile.value = null;
  try {
    plan.applyImportedGeo(geo, meta);
    viewStore.fitView();          // boot 模式下画布还没挂载，PlanCanvas 挂载时会再 fit 一次
    finish();
  } catch (err){
    uiStore.showToast(tr('导入失败：', 'Import failed: ') + (err?.message || ''));
  }
}

function onExportPNG(){
  if (!exportPlanPNG())
    uiStore.showToast(tr('进入编辑器后可以导出图片', 'Image export is available in the editor'));
}

function onExportJSON(){
  try {
    saveProjectJSON();
    uiStore.showToast(tr('已导出方案（楼层 / 家具 / 区域 / 墙体）', 'Project exported (floors, furniture, areas, walls)'));
  } catch (err){
    uiStore.showToast(tr('导出失败：', 'Export failed: ') + (err?.message || ''));
  }
}

/* ---------------- 交互 ---------------- */

/** 选样板间：切换几何后进入编辑（applyPlan 不再二次确认） */
function pick(id){
  if (id !== planId.value) plan.applyPlan(id, { confirmMsg: false });
  finish();
}

/** boot → 进入编辑器；overlay → 返回编辑器 */
function finish(){
  if (props.mode === 'overlay') emit('close');
  else emit('enter');
}

function close(){ emit('close'); }
</script>

<style scoped>
.start{
  position:fixed; inset:0; overflow:auto; background:var(--bg); color:var(--ink);
  z-index:2000; display:flex;
}
/* 内容不满一屏时垂直居中；超出时仍可正常滚动（margin:auto 的标准写法） */
.start-inner{width:100%; max-width:880px; margin:0 auto; padding:26px 24px 30px}

.ss-brand{
  display:flex; align-items:center; gap:8px; font-size:11.5px; letter-spacing:.08em;
  color:var(--muted); margin-bottom:18px;
}
.ss-dot{width:7px; height:7px; border-radius:50%; background:var(--accent); flex:none}
.ss-close{
  margin-left:auto; width:26px; height:26px; border-radius:50%; cursor:pointer;
  border:1px solid var(--line); background:var(--panel); color:var(--muted);
  font-size:15px; line-height:1; display:flex; align-items:center; justify-content:center;
}
.ss-close:hover{color:var(--ink); border-color:var(--accent)}

/* 每个区块都是「标题 → 说明 → 内容」的自上而下单列，全部共用同一条左边线 */
.block{display:flex; flex-direction:column; align-items:flex-start; gap:8px; width:100%}
.block h1{font-size:20px; line-height:1.25; margin:0; letter-spacing:-.01em}
.block h2{
  font-size:13px; margin:0; font-weight:600; letter-spacing:.02em;
  color:var(--ink);
}
/* 段落标题行：标题在左，「展示全部 / 收起」在右（只影响这一行，不破坏左侧对齐线） */
.sec-head{display:flex; align-items:baseline; gap:10px; width:100%; flex-wrap:wrap}
.sec-head h1{flex:1 1 auto}
.more{
  flex:none; margin-left:auto; padding:2px 6px; border:0; border-radius:6px;
  background:transparent; color:var(--accent); font-size:12px; cursor:pointer; white-space:nowrap;
}
.more:hover{background:var(--accent-soft)}
.lead{margin:0; color:var(--muted); font-size:12.5px}
.block > .cards,
.block > .file-actions,
.block > .empty{width:100%}

.cards{display:grid; gap:12px; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr))}
.card{
  display:flex; flex-direction:column; gap:8px; padding:8px 9px 9px;
  background:var(--panel); border:1px solid var(--line); border-radius:12px;
  text-align:left; cursor:pointer; transition:border-color .15s, transform .15s, box-shadow .15s;
}
.card:hover{border-color:var(--accent); transform:translateY(-2px); box-shadow:0 8px 20px rgba(60,45,30,.12)}
.card:focus-visible{outline:2px solid var(--accent); outline-offset:2px}
.thumb{
  display:block; height:112px; border:1px solid var(--line); border-radius:8px;
  background:var(--paper); overflow:hidden;
}
.thumb :deep(svg){width:100%; height:100%; display:block}
.card-body{display:flex; flex-direction:column; gap:1px; padding:0 2px}
.card-body b{font-size:12.5px; font-weight:600; display:flex; align-items:center; gap:7px}
.meta{font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums}
.sep{margin:0 6px; opacity:.5}
.tag{
  font-style:normal; font-size:10px; font-weight:500; line-height:1;
  padding:2px 5px; border-radius:999px; color:var(--accent); background:var(--accent-soft);
}

/* 正在编辑：横排，一条就能放下 */
.card.current{flex-direction:row; align-items:center; gap:14px; padding:9px; width:100%}
.card.current .thumb{width:150px; height:92px; flex:none}
.card.current .card-body{flex:1; min-width:0; gap:3px}
.go{flex:none; white-space:nowrap; font-size:12.5px; font-weight:600; color:var(--accent)}

.rule{width:100%; border:none; border-top:1px solid var(--line); margin:18px 0}

/* 空态：文字在上、按钮在左下，与整页的左对齐一致 */
.empty{
  display:flex; flex-direction:column; align-items:flex-start; gap:8px;
  padding:12px 14px; border:1px dashed var(--line); border-radius:12px; background:var(--panel);
}
.empty p{margin:0; color:var(--muted); font-size:12px; line-height:1.55}
.ghost{
  padding:6px 12px; border-radius:8px; border:1px solid var(--line);
  background:var(--paper); color:var(--muted); cursor:not-allowed; opacity:.7;
}

/* 导入 & 导出：一行芯片按钮 */
.file-actions{display:flex; align-items:center; gap:8px; flex-wrap:wrap}
.act{
  display:inline-flex; align-items:center; gap:5px;
  padding:7px 12px; border-radius:9px; border:1px solid var(--line);
  background:var(--panel); color:var(--ink); font-size:12px; cursor:pointer;
  transition:border-color .15s, background .15s;
}
.act:hover:not(:disabled){border-color:var(--accent); background:var(--accent-soft)}
.act:disabled{opacity:.45; cursor:not-allowed}
.beta{
  font-style:normal; font-size:9.5px; line-height:1; padding:2px 4px; border-radius:4px;
  color:var(--accent); background:var(--accent-soft);
}
.note{margin:0; color:var(--muted); font-size:11px}

@media (max-width:640px){
  .start-inner{padding:18px 14px 24px}
  .ss-brand{margin-bottom:14px}
  .block{gap:7px}
  .block h1{font-size:18px}
  .cards{grid-template-columns:1fr 1fr; gap:9px}
  .thumb{height:88px}
  .card.current{flex-direction:column; align-items:stretch}
  .card.current .thumb{width:auto; height:96px}
  .go{text-align:right}
  .rule{margin:16px 0}
}
</style>
