<template>
  <!-- 收起态：右下角悬浮按钮 -->
  <button v-if="!open" class="ai-fab" title="AI 设计助手" @click="open = true">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" fill="currentColor"/>
      <path d="M18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" opacity=".7"/>
    </svg>
  </button>

  <!-- 展开态：对话面板 -->
  <section v-else class="ai-panel" :class="{ narrow: narrowMode }">
    <header class="ai-head">
      <strong>AI 设计助手</strong>
      <span class="ai-level">{{ levelText }}</span>
      <span class="ai-spacer"/>
      <button class="ai-icon" title="AI 助手配置" @click="openAiConfig()">⚙</button>
      <button class="ai-icon" title="收起" @click="open = false">✕</button>
    </header>

    <!-- 消息 -->
    <div ref="listEl" class="ai-msgs">
      <div v-if="!msgs.length" class="ai-empty">
        <p>用一句话说清要改什么，例如：</p>
        <button class="ai-sug" @click="quick('把客厅右下角隔出一个 2.4×2.4 的储物间，并加一扇 800 的门')">
          把客厅右下角隔出一个 2.4×2.4 的储物间，并加一扇 800 的门
        </button>
        <button class="ai-sug" @click="quick('主卧放一张 1.8m 双人床、两个床头柜和一个衣柜，靠墙摆好')">
          主卧放一张 1.8m 双人床、两个床头柜和一个衣柜，靠墙摆好
        </button>
        <button class="ai-sug" @click="quick('检查当前方案有没有家具压墙或悬空的区域')">
          检查当前方案有没有家具压墙或悬空的区域
        </button>
        <div class="ai-empty-foot">
          <span>新建方案（会替换当前设计）：</span>
          <div class="ai-presets">
            <button v-for="p in NEW_PLANS" :key="p.id" class="ai-tag" @click="newPlan(p.id)">{{ p.label }}</button>
          </div>
        </div>
        <button v-if="!ready" class="ai-btn primary" @click="openAiConfig()">
          先配置模型（厂商 / API Key）
        </button>
      </div>

      <div v-for="(m, i) in msgs" :key="i" class="ai-msg" :class="m.role">
        <!-- 思考过程（流式实时追加，可折叠） -->
        <details v-if="m.reasoning" class="ai-think" :open="!!m.thinking">
          <summary>
            <span class="ai-think-dot" :class="{ live: m.thinking }"></span>
            {{ m.thinking ? '正在思考…' : '思考过程' }}
            <small>{{ m.reasoning.length }} 字</small>
          </summary>
          <div class="ai-think-body">{{ m.reasoning }}<span v-if="m.thinking" class="ai-caret">▍</span></div>
        </details>

        <div v-if="m.text" class="ai-bubble">{{ m.text }}<span v-if="m.streaming" class="ai-caret">▍</span></div>

        <div v-if="m.tools && m.tools.length" class="ai-chips">
          <span v-for="(t, j) in m.tools" :key="j" class="ai-chip" :class="t.ok ? 'ok' : 'bad'">
            {{ t.ok ? '✓' : '✕' }} {{ t.label }}
          </span>
        </div>
        <div v-if="m.error" class="ai-err">{{ m.error }}</div>
      </div>

      <div v-if="busy && !streaming" class="ai-thinking"><i/><i/><i/> 正在处理</div>
    </div>

    <!-- 输入 -->
    <div class="ai-input">
      <textarea v-model="draft" rows="2" :disabled="busy"
                placeholder="描述你要的改动…（Enter 发送，Shift+Enter 换行）"
                @keydown.enter.exact.prevent="send"/>
      <button class="ai-btn primary" :disabled="busy || !draft.trim()" @click="send">发送</button>
    </div>
    <div class="ai-foot">
      <span>AI 的每一步都能 Ctrl+Z 撤销</span>
      <button class="ai-link" @click="reload">重新读取当前方案</button>
    </div>
  </section>
</template>

<script setup>
/* ============================================================================
 *  应用内 AI 面板：LLM（OpenAI 兼容）+ 工具循环 + 直接改当前方案
 *
 *  数据流：面板持有无头 PlanSession（与 MCP 同一套实现）→ 每次工具执行后
 *  用 plan.importPlan() 同步到 store → 2D / 3D / 面板全部按既有机制刷新，
 *  同时天然进撤销栈（一步一个 Ctrl+Z）。
 * ========================================================================== */
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlanStore, useUiStore } from '@/stores/index.js';
import { exportProjectJSON } from '@/app/providers/useProjectFile.js';
import { PlanSession } from '@mcp/session.mjs';
import { runAgent } from './agent.js';
import { labelOf } from './toolset.js';
import { chat, chatStream, llmConfig, isConfigured } from './llm.js';

const plan = usePlanStore();
const uiStore = useUiStore();
const { narrowMode, aiPanelOpen: open } = storeToRefs(uiStore);
const { openAiConfig } = uiStore;

/** 与「AI 助手配置」弹窗共用同一份配置 */
const cfg = llmConfig;
const ready = computed(() => isConfigured(cfg));

const NEW_PLANS = [
  { id: 'custom', label: '空盒 10×10' },
  { id: '2b1l', label: '两室一厅' },
  { id: '3b2b', label: '三室两厅' },
  { id: 'loft', label: 'loft 两层' }
];

/** 只读工具：执行后不需要同步回 store */
const READONLY = new Set(['plan_summary', 'plan_validate', 'catalog_search', 'furniture_list']);

const SYSTEM = [
  '你是住宅室内设计助手，直接操作当前已打开的户型（不是从零开始）。',
  '铁律：',
  '1) 单位 mm，平面 +y 向下；rot 为顺时针角度。',
  '2) 墙必须水平/垂直；区域必须贴墙（边线落在墙中线 ±2mm）；家具 type 必须来自 catalog_search。',
  '3) 每轮先 plan_summary 了解现状；改完必须 plan_validate，并按 errors 修正。',
  '4) 摆家具优先 furniture_place_batch（一次一屋），靠墙公式：贴上墙 cy=y0+d/2，贴下墙 cy=y1-d/2，左右用 cx。',
  '5) 不确定的几何先查（plan_summary / furniture_list），不要臆造墙和房间是否存在。',
  '6) 不要删除用户已有的房间或家具，除非用户明确要求。',
  '回答简短：先说你做了什么，再给下一步建议。'
].join('\n');

const busy = ref(false);
/** 当前是否处于流式输出中（用于隐藏「正在处理」三点动画） */
const streaming = ref(false);
const draft = ref('');
const msgs = ref([]);
const history = ref([]);
const listEl = ref(null);
let session = null;

const levelText = computed(() => {
  const s = plan.state;
  const lv = s.levels.find(l => l.id === s.activeLevel);
  return lv ? lv.name : '';
});

/* ---------------- 会话 ---------------- */

function ensureSession(){
  if (!session){
    session = new PlanSession();
    session.loadDocument(exportProjectJSON().text);
  }
  return session;
}

function apply(){
  if (!session) return;
  plan.importPlan(session.document().plan);
}

function reload(){
  session = null;
  ensureSession();
  history.value = [];
  msgs.value.push({ role: 'assistant', text: '已重新读取当前方案，继续说吧。' });
}

function newPlan(planId){
  const label = NEW_PLANS.find(p => p.id === planId)?.label || planId;
  if (!confirm(`新建「${label}」会替换当前设计（可 Ctrl+Z 撤销）。继续？`)) return;
  session = new PlanSession();
  session.reset(planId);
  apply();
  history.value = [];
  msgs.value = [{ role: 'assistant', text: `已新建「${label}」，接下来想怎么设计？` }];
}

/* ---------------- 发送 ---------------- */

function scrollBottom(){
  nextTick(() => { if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight; });
}

function quick(text){
  draft.value = text;
  send();
}

async function send(){
  const text = draft.value.trim();
  if (!text || busy.value) return;
  if (!ready.value){
    openAiConfig();
    uiStore.showToast('先选一个模型并填 API Key', 2600);
    return;
  }

  ensureSession();
  draft.value = '';

  /* 首轮把 system 放进历史 */
  if (!history.value.length) history.value.push({ role: 'system', content: SYSTEM });

  msgs.value.push({ role: 'user', text });
  const bubble = reactive({
    role: 'assistant', text: '', reasoning: '', tools: [], error: '',
    thinking: false, streaming: false
  });
  msgs.value.push(bubble);
  history.value.push({ role: 'user', content: text });
  busy.value = true;
  scrollBottom();

  /* 流式：把每一步（含工具调用轮）的思考与回答实时追加到气泡上 */
  const streamChat = p => {
    if (!cfg.stream) return chat({ config: cfg, ...p });

    const prevText = bubble.text;
    const prevReason = bubble.reasoning;
    let text = '', reasoning = '';
    bubble.thinking = true;
    bubble.streaming = false;

    const join = (prev, add) => !prev ? add : (prev.endsWith('\n') ? prev + add : `${prev}\n${add}`);

    return chatStream({
      config: cfg, ...p,
      onDelta: ({ type, text: chunk }) => {
        if (!chunk) return;
        streaming.value = true;                 // 首个分片到达后再隐藏「正在处理」
        if (type === 'reasoning'){
          reasoning += chunk;
          bubble.reasoning = join(prevReason, reasoning);
        } else {
          if (!text) bubble.thinking = false;   // 已经开始输出正文
          text += chunk;
          bubble.text = join(prevText, text);
          bubble.streaming = true;
        }
        scrollBottom();
      }
    }).finally(() => {
      bubble.thinking = false;
      bubble.streaming = false;
      streaming.value = false;
    });
  };

  try {
    const out = await runAgent({
      session,
      messages: history.value,
      chat: streamChat,
      onTool: ({ name, args, result, error }) => {
        bubble.tools.push({
          label: error ? `${name}：${error.message}` : labelOf(name, args, result),
          ok: !error
        });
        /* 每个改方案的工具执行后立即同步 store —— 2D 图随之重绘 */
        if (!error && !READONLY.has(name)) apply();
        scrollBottom();
      }
    });
    if (!bubble.text.trim()) bubble.text = out.text || '（完成）';
  } catch (e){
    bubble.error = e.message;
    history.value.push({ role: 'assistant', content: `（请求失败：${e.message}）` });
  } finally {
    bubble.thinking = false;
    bubble.streaming = false;
    streaming.value = false;
    busy.value = false;
    scrollBottom();
  }
}

watch(msgs, scrollBottom, { deep: true });
</script>

<style scoped>
.ai-fab{
  position: absolute; right: 0; bottom: 0; z-index: 6;
  width: 46px; height: 46px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--accent); color: #fff; border: 0; cursor: pointer;
  box-shadow: 0 8px 22px rgba(120, 70, 40, .34), 0 1px 3px rgba(0, 0, 0, .12);
  transition: transform .16s ease, box-shadow .16s ease;
}
.ai-fab:hover{ transform: translateY(-2px); box-shadow: 0 12px 26px rgba(120, 70, 40, .42); }
.ai-fab svg{ width: 24px; height: 24px; }

.ai-panel{
  position: absolute; right: 0; bottom: 0; z-index: 6;
  width: min(392px, 100%); max-height: min(72vh, 640px, 100%);
  display: flex; flex-direction: column;
  background: var(--panel); color: var(--ink);
  border: 1px solid var(--glass-line); border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  overflow: hidden;
}
.ai-panel.narrow{ left: 0; right: 0; bottom: 0; width: auto; max-height: min(62vh, 100%); }

.ai-head{
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-bottom: 1px solid var(--line);
  background: var(--paper);
}
.ai-head strong{ font-size: 13px; letter-spacing: .2px; }
.ai-level{
  font-size: 11px; color: var(--muted);
  border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px;
}
.ai-spacer{ flex: 1; }
.ai-icon{
  border: 0; background: transparent; color: var(--muted);
  font-size: 14px; cursor: pointer; padding: 2px 6px; border-radius: 6px;
}
.ai-icon:hover{ background: var(--accent-soft); color: var(--accent); }

.ai-presets{ display: flex; flex-wrap: wrap; gap: 6px; }
.ai-tag{
  font: inherit; font-size: 11px; padding: 3px 9px; cursor: pointer;
  border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ink);
}
.ai-tag:hover{ border-color: var(--accent); color: var(--accent); }
.ai-empty-foot{
  display: flex; flex-direction: column; gap: 6px; padding-top: 8px;
  border-top: 1px dashed var(--line); font-size: 11px;
}

.ai-msgs{
  flex: 1; min-height: 120px; overflow: auto;
  padding: 12px; display: flex; flex-direction: column; gap: 10px;
  background: linear-gradient(180deg, #fffdf9, #fbf7f0);
}
.ai-empty{ font-size: 12px; color: var(--muted); display: flex; flex-direction: column; gap: 8px; }
.ai-empty p{ margin: 0 0 2px; }
.ai-sug{
  text-align: left; font: inherit; font-size: 12px; line-height: 1.5;
  padding: 8px 10px; cursor: pointer;
  border: 1px dashed var(--line); border-radius: 10px; background: #fff; color: var(--ink);
}
.ai-sug:hover{ border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

.ai-msg{ display: flex; flex-direction: column; gap: 6px; max-width: 100%; }
.ai-msg.user{ align-items: flex-end; }

/* ---------- 思考过程（流式实时追加） ---------- */
.ai-think{
  max-width: 100%; border: 1px dashed var(--line); border-radius: 10px;
  background: #fbf8f3; font-size: 11.5px; color: var(--muted);
}
.ai-think summary{
  display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  cursor: pointer; list-style: none; user-select: none;
}
.ai-think summary::-webkit-details-marker{ display: none; }
.ai-think summary::before{ content: '▸'; font-size: 10px; opacity: .7; transition: transform .15s; }
.ai-think[open] summary::before{ transform: rotate(90deg); }
.ai-think summary small{ margin-left: auto; font-size: 10px; opacity: .7; }
.ai-think-dot{ width: 6px; height: 6px; border-radius: 50%; background: var(--muted); opacity: .5; }
.ai-think-dot.live{ background: var(--accent); opacity: 1; animation: ai-think-pulse 1s ease-in-out infinite; }
@keyframes ai-think-pulse{ 0%, 100%{ transform: scale(.8); opacity: .5; } 50%{ transform: scale(1.15); opacity: 1; } }
.ai-think-body{
  max-height: 190px; overflow: auto; padding: 0 10px 8px 22px;
  white-space: pre-wrap; word-break: break-word; line-height: 1.65;
  border-top: 1px dashed var(--line); padding-top: 7px;
}
.ai-caret{ display: inline-block; margin-left: 1px; color: var(--accent); animation: ai-caret 1s steps(2) infinite; }
@keyframes ai-caret{ 0%, 50%{ opacity: 1; } 50.1%, 100%{ opacity: 0; } }
.ai-bubble{
  font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  padding: 8px 11px; border-radius: 12px; max-width: 92%;
  background: #fff; border: 1px solid var(--line);
}
.ai-msg.user .ai-bubble{ background: var(--accent); border-color: var(--accent); color: #fff; }
.ai-chips{ display: flex; flex-wrap: wrap; gap: 4px; }
.ai-chip{
  font-size: 10.5px; padding: 2px 7px; border-radius: 999px;
  background: #eef4ee; color: #3d6b45; border: 1px solid #d8e6d9;
}
.ai-chip.bad{ background: #fbeeee; color: #9a3f39; border-color: #eeD6d4; }
.ai-err{ font-size: 11px; color: #9a3f39; background: #fbeeee; border: 1px solid #eed6d4; border-radius: 8px; padding: 6px 8px; }

.ai-thinking{ display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); }
.ai-thinking i{
  width: 5px; height: 5px; border-radius: 50%; background: var(--accent); opacity: .35;
  animation: ai-blink 1s infinite ease-in-out;
}
.ai-thinking i:nth-child(2){ animation-delay: .16s; }
.ai-thinking i:nth-child(3){ animation-delay: .32s; }
@keyframes ai-blink{ 0%, 80%, 100%{ opacity: .25; transform: translateY(0); } 40%{ opacity: 1; transform: translateY(-2px); } }

.ai-input{
  display: flex; gap: 8px; align-items: flex-end;
  padding: 10px 12px; border-top: 1px solid var(--line); background: var(--paper);
}
.ai-input textarea{
  flex: 1; resize: none; font: inherit; font-size: 12.5px; line-height: 1.5;
  padding: 7px 9px; border: 1px solid var(--line); border-radius: 10px;
  background: #fff; color: var(--ink); max-height: 96px;
}
.ai-input textarea:focus{ outline: 2px solid var(--accent-soft); border-color: var(--accent); }
.ai-btn{
  font: inherit; font-size: 12px; padding: 7px 14px; cursor: pointer;
  border-radius: 9px; border: 1px solid var(--line); background: #fff; color: var(--ink);
}
.ai-btn.primary{ background: var(--accent); border-color: var(--accent); color: #fff; }
.ai-btn:disabled{ opacity: .45; cursor: not-allowed; }

.ai-foot{
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 12px 8px; font-size: 10.5px; color: var(--muted); background: var(--paper);
}
.ai-link{ border: 0; background: none; color: var(--teal); font: inherit; font-size: 10.5px; cursor: pointer; text-decoration: underline; }
</style>
