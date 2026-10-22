<template>
  <Teleport to="body">
    <div v-if="uiStore.aiConfigOpen" class="plan-mask" @click.self="close">
      <div class="plan-dialog dlg-ai" role="dialog" aria-modal="true" aria-labelledby="aiCfgTitle">
        <header class="dlg-head">
          <div class="dlg-title">
            <h3 id="aiCfgTitle">{{ tr('AI 助手配置', 'AI assistant settings') }}</h3>
            <p class="dlg-sub">{{ tr(
              '选择模型厂商并填入 API Key。保存后，右下角的 AI 设计助手会直接调用该模型，通过 MCP 工具链生成 / 修改当前 2D 户型图。',
              'Pick a provider and enter your API key. The AI assistant can then call the model and build or edit the 2D plan through the MCP tool chain.'
            ) }}</p>
          </div>
          <button class="dlg-x" :title="tr('关闭', 'Close')" :aria-label="tr('关闭', 'Close')" @click="close">×</button>
        </header>

        <div class="dlg-body ai-cfg">
          <div class="ai-cfg-sec">{{ tr('厂商', 'Provider') }}</div>
          <div class="ai-vendors">
            <button v-for="v in VENDORS" :key="v.id" class="ai-vendor" :class="{ on: vendorId === v.id }"
              @click="pickVendor(v)">
              <b>{{ v.label }}</b>
              <small>{{ v.model }}</small>
            </button>
          </div>

          <div class="ai-cfg-grid">
            <label class="full">{{ tr('接口地址 baseURL', 'Base URL') }}
              <input v-model.trim="form.baseURL" placeholder="https://api.deepseek.com" spellcheck="false">
            </label>
            <label>{{ tr('模型 model', 'Model') }}
              <input v-model.trim="form.model" placeholder="deepseek-flash" spellcheck="false" :list="vendor?.models ? 'aiModels' : null">
              <datalist v-if="vendor?.models" id="aiModels">
                <option v-for="m in vendor.models" :key="m" :value="m"></option>
              </datalist>
            </label>
            <label>{{ tr('温度 temperature', 'Temperature') }}
              <input v-model.number="form.temperature" type="number" min="0" max="2" step="0.1"
                :disabled="deepSeek && form.reasoningEffort !== 'none'">
            </label>
            <label class="full">API Key
              <span class="ai-key">
                <input v-model.trim="form.apiKey" :type="showKey ? 'text' : 'password'"
                  :placeholder="tr('sk-…（本地 Ollama 可留空）', 'sk-… (leave empty for local Ollama)')" spellcheck="false">
                <button type="button" class="ai-eye" @click="showKey = !showKey">
                  {{ showKey ? tr('隐藏', 'Hide') : tr('显示', 'Show') }}
                </button>
              </span>
            </label>
          </div>

          <!-- 输出方式：流式 + 思考强度（DeepSeek） -->
          <div class="ai-cfg-opts">
            <label class="ai-opt">
              <input v-model="form.stream" type="checkbox">
              <span>{{ tr('流式输出（实时显示思考与回答）', 'Streaming (live thinking & answer)') }}</span>
            </label>
            <label v-if="deepSeek" class="ai-opt">
              <span>{{ tr('思考强度', 'Reasoning effort') }}</span>
              <select v-model="form.reasoningEffort">
                <option v-for="e in EFFORTS" :key="e.k" :value="e.k">{{ e.k === 'none' ? tr('关闭思考', 'Off') : e.k }}</option>
              </select>
            </label>
          </div>

          <p v-if="vendor?.keyUrl" class="ai-cfg-hint">
            {{ tr('还没有 Key？到', 'No key yet? Get one at') }}
            <a :href="vendor.keyUrl" target="_blank" rel="noreferrer">{{ vendor.label }}</a>
            {{ tr('控制台申请。', 'console.') }}
          </p>

          <p v-if="status" class="ai-cfg-status" :class="statusKind">{{ status }}</p>

          <p class="ai-cfg-note">{{ tr(
            '配置只保存在本机浏览器（localStorage），不会上传。模型通过 MCP 工具直接读写当前方案的楼层 / 墙体 / 门窗 / 家具，每一步都可 Ctrl+Z 撤销。',
            'Settings stay in this browser (localStorage). The model reads and writes floors, walls, openings and furniture of the current plan through MCP tools; every step is undoable.'
          ) }}</p>
        </div>

        <footer class="ai-cfg-foot">
          <button class="btn" :disabled="testing || !canSave" @click="onTest">
            {{ testing ? tr('测试中…', 'Testing…') : tr('测试连接', 'Test connection') }}
          </button>
          <span class="ai-spacer"></span>
          <button class="btn" @click="close">{{ tr('取消', 'Cancel') }}</button>
          <button class="btn primary" :disabled="!canSave" @click="onSave">
            {{ tr('保存并打开助手', 'Save & open assistant') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/* ============================================================================
 *  AI 助手配置弹窗：厂商预设 + baseURL / model / API Key / 温度 + 连通性自检。
 *
 *  入口：帮助菜单「AI 助手配置」、AI 助手面板的齿轮按钮（共用 ui store 开关）。
 *  保存后写入 llm.js 的全局 reactive 配置，右下角 AI 助手立即使用新模型，
 *  通过 MCP 工具链直接生成 / 修改 2D 户型图。
 * ========================================================================== */
import { ref, reactive, computed, watch } from 'vue';
import { useUiStore } from '@/stores/index.js';
import { tr } from '@/i18n.js';
import { VENDORS, EFFORTS, llmConfig, saveConfig, testConnection, isDeepSeek } from './llm.js';

const uiStore = useUiStore();

/* 编辑副本：取消时不影响已生效的配置 */
const form = reactive({
  baseURL: llmConfig.baseURL,
  model: llmConfig.model,
  apiKey: llmConfig.apiKey,
  temperature: llmConfig.temperature,
  stream: llmConfig.stream,
  reasoningEffort: llmConfig.reasoningEffort
});

const showKey = ref(false);
const testing = ref(false);
const status = ref('');
const statusKind = ref('');

const norm = u => String(u || '').trim().replace(/\/+$/, '');
/** 当前选中的厂商：由 baseURL 反查，手动改了地址也能正确高亮 */
const vendorId = computed(() => VENDORS.find(v => norm(v.baseURL) === norm(form.baseURL))?.id || '');
const vendor = computed(() => VENDORS.find(v => v.id === vendorId.value) || null);
const canSave = computed(() => !!(form.baseURL && form.model));
/** 思考模式只对 DeepSeek 官方接口生效 */
const deepSeek = computed(() => isDeepSeek(form));

/* 每次打开都从当前生效配置重新拉一份编辑副本，避免残留上次的临时修改 */
watch(() => uiStore.aiConfigOpen, open => {
  if (!open) return;
  Object.assign(form, {
    baseURL: llmConfig.baseURL, model: llmConfig.model,
    apiKey: llmConfig.apiKey, temperature: llmConfig.temperature,
    stream: llmConfig.stream, reasoningEffort: llmConfig.reasoningEffort
  });
  showKey.value = false;
  status.value = '';
  statusKind.value = '';
});

function pickVendor(v){
  form.baseURL = v.baseURL;
  form.model = v.model;
  status.value = '';
}

function close(){
  status.value = '';
  statusKind.value = '';
  uiStore.closeAiConfig();
}

async function onTest(){
  testing.value = true;
  status.value = tr('正在连接模型接口…', 'Connecting to the model endpoint…');
  statusKind.value = 'run';
  try {
    const reply = await testConnection({ ...form });
    status.value = tr(`连接成功，模型回复：${reply}`, `Connected. Model replied: ${reply}`);
    statusKind.value = 'ok';
  } catch (e){
    status.value = e.message;
    statusKind.value = 'bad';
  } finally {
    testing.value = false;
  }
}

function onSave(){
  saveConfig({ ...form, temperature: Number(form.temperature) });
  uiStore.showToast(tr('AI 助手配置已保存，可以直接对话生成户型了', 'AI settings saved — you can chat to build the plan now'), 2600);
  close();
  uiStore.openAiPanel();
}
</script>

<style scoped>
.plan-dialog.dlg-ai{ width: min(620px, 100%); }
.ai-cfg{ display: flex; flex-direction: column; gap: 12px; }
.ai-cfg-sec{ font-size: 11px; font-weight: 600; letter-spacing: .8px; color: var(--muted); }

.ai-vendors{ display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
.ai-vendor{
  display: flex; flex-direction: column; gap: 2px; padding: 9px 11px; text-align: left; cursor: pointer;
  border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink);
  transition: border-color .15s, background .15s, box-shadow .15s;
}
.ai-vendor b{ font-size: 12.5px; font-weight: 600; }
.ai-vendor small{ font-size: 10.5px; color: var(--muted); }
.ai-vendor:hover{ border-color: var(--accent); }
.ai-vendor.on{
  border-color: var(--accent); background: var(--accent-soft); color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.ai-vendor.on small{ color: var(--accent); opacity: .75; }

.ai-cfg-grid{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ai-cfg-grid label{ display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }
.ai-cfg-grid label.full{ grid-column: 1 / -1; }
.ai-cfg-grid input{
  font: inherit; font-size: 13px; padding: 7px 9px; color: var(--ink);
  border: 1px solid var(--line); border-radius: 8px; background: #fff; min-width: 0;
}
.ai-cfg-grid input:focus{ outline: 2px solid var(--accent-soft); border-color: var(--accent); }

.ai-key{ position: relative; display: block; }
.ai-key input{ width: 100%; padding-right: 56px; }
.ai-eye{
  position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
  border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 11px;
  padding: 3px 6px; border-radius: 6px; cursor: pointer;
}
.ai-eye:hover{ color: var(--accent); background: var(--accent-soft); }

.ai-cfg-opts{ display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px;
  padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; background: #fbf8f3; }
.ai-opt{ display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); cursor: pointer; }
.ai-opt input[type=checkbox]{ accent-color: var(--accent); width: 14px; height: 14px; cursor: pointer; }
.ai-opt select{
  font: inherit; font-size: 12px; padding: 3px 6px; color: var(--ink);
  border: 1px solid var(--line); border-radius: 7px; background: #fff; cursor: pointer;
}
.ai-cfg-grid input:disabled{ opacity: .5; cursor: not-allowed; }

.ai-cfg-hint{ margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--muted); }
.ai-cfg-hint a{ color: var(--accent); text-decoration: none; }
.ai-cfg-hint a:hover{ text-decoration: underline; }

.ai-cfg-status{
  margin: 0; padding: 8px 10px; border-radius: 8px; font-size: 11.5px; line-height: 1.6;
  border: 1px solid var(--line); background: #faf6ef; color: var(--muted); word-break: break-word;
}
.ai-cfg-status.ok{ border-color: #cfe3d2; background: #eef6ef; color: #3d6b45; }
.ai-cfg-status.bad{ border-color: #efd4cf; background: #fbeeee; color: #9a3f39; }

.ai-cfg-note{ margin: 0; font-size: 11px; line-height: 1.65; color: var(--muted); }

.ai-cfg-foot{ display: flex; align-items: center; gap: 8px; margin-top: 18px;
  padding-top: 14px; border-top: 1px solid var(--line); }
.ai-spacer{ flex: 1; }
.ai-cfg-foot .btn{
  font: inherit; font-size: 12.5px; padding: 7px 14px; border-radius: 9px;
  border: 1px solid var(--line); background: #fff; color: var(--ink); cursor: pointer;
}
.ai-cfg-foot .btn:hover{ border-color: var(--accent); color: var(--accent); background: #fff; }
.ai-cfg-foot .btn.primary{ border-color: var(--accent); background: var(--accent); color: #fff; }
.ai-cfg-foot .btn.primary:hover{ background: #9f5530; border-color: #9f5530; color: #fff; }
.ai-cfg-foot .btn:disabled{ opacity: .45; cursor: not-allowed; }

@media (max-width: 560px){
  .ai-cfg-grid{ grid-template-columns: 1fr; }
}
</style>
