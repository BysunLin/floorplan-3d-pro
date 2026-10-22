/* ============================================================================
 *  模型网关：OpenAI 兼容的 /chat/completions
 *
 *  不绑定厂商：DeepSeek / OpenAI / 通义 / Moonshot / 智谱 / 本地 Ollama / vLLM …
 *  只要填 baseURL + model（+ apiKey）即可。配置存在 localStorage。
 *
 *  默认 DeepSeek（https://api-docs.deepseek.com/zh-cn/）：
 *    · 端点   POST https://api.deepseek.com/chat/completions
 *    · 模型   deepseek-flash / deepseek-v4-pro
 *    · 思考   thinking:{type:'enabled'|'disabled'} + reasoning_effort:none|low|high|max
 *    · 流式   stream:true → SSE，逐块 delta.content / delta.reasoning_content，
 *             delta.tool_calls 按 index 分片下发，以 data: [DONE] 结束
 *             （思考模式下 temperature 不生效，tool_choice 不支持 required / 指定函数）
 *
 *  配置对象是模块级 reactive，AI 助手面板与「AI 助手配置」弹窗共用同一份。
 * ========================================================================== */
import { reactive } from 'vue';

const KEY = 'plan3d-llm';

export const DEFAULT_CONFIG = {
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  apiKey: '',
  temperature: 0.3,
  /** 默认流式输出：把思考过程与回答实时显示在对话框 */
  stream: true,
  /** 思考强度：none（关闭思考）/ low / high / max（仅 DeepSeek 生效） */
  reasoningEffort: 'high'
};

/** 厂商预设：点一下即可填好 baseURL / model，用户只需补 API Key */
export const VENDORS = [
  {
    id: 'deepseek', label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com', model: 'deepseek-flash',
    models: ['deepseek-flash', 'deepseek-v4-pro'], thinking: true,
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'openai', label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'qwen', label: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key'
  },
  {
    id: 'moonshot', label: 'Moonshot Kimi',
    baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys'
  },
  {
    id: 'zhipu', label: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash',
    keyUrl: 'https://bigmodel.cn/usercenter/apikeys'
  },
  {
    id: 'ollama', label: '本地 Ollama',
    baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b',
    keyUrl: 'https://ollama.com/download'
  }
];

/** 面板里用的精简预设（保持旧接口） */
export const PRESETS = VENDORS;

/** 思考强度选项（DeepSeek: none 关闭思考；low/high/max 开启并控制强度） */
export const EFFORTS = [
  { k: 'none', label: '关闭思考' },
  { k: 'low',  label: '低' },
  { k: 'high', label: '高' },
  { k: 'max',  label: '最高' }
];

export function loadConfig(){
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_CONFIG, ...(raw || {}) };
  } catch (e){
    return { ...DEFAULT_CONFIG };
  }
}

/** 全局唯一配置（面板 / 配置弹窗 / 请求共用） */
export const llmConfig = reactive(loadConfig());

export function saveConfig(cfg){
  const next = {
    baseURL: String(cfg.baseURL || '').trim(),
    model: String(cfg.model || '').trim(),
    apiKey: String(cfg.apiKey || '').trim(),
    temperature: Number.isFinite(+cfg.temperature) ? +cfg.temperature : 0.3,
    stream: cfg.stream !== false,
    reasoningEffort: EFFORTS.some(e => e.k === cfg.reasoningEffort) ? cfg.reasoningEffort : 'high'
  };
  Object.assign(llmConfig, next);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* 隐私模式下忽略 */ }
  return llmConfig;
}

/** 清空配置（只清本机保存，不回填默认值） */
export function clearConfig(){
  try { localStorage.removeItem(KEY); } catch (e) {}
  Object.assign(llmConfig, DEFAULT_CONFIG);
}

export function isConfigured(cfg){
  return !!(cfg && cfg.baseURL && cfg.model);
}

/** 是否 DeepSeek 官方接口（thinking / reasoning_effort / stream_options 只对它下发） */
export function isDeepSeek(cfg){
  return /deepseek\.com/i.test(String(cfg && cfg.baseURL || ''));
}

const trimUrl = u => String(u || '').replace(/\/+$/, '');

/** 组装请求体：思考模式、流式选项只对 DeepSeek 生效，其它厂商保持标准 OpenAI 字段 */
function buildBody(config, messages, tools, stream){
  const body = { model: config.model, messages, stream: !!stream };
  if (!stream) body.temperature = Number.isFinite(+config.temperature) ? +config.temperature : 0.3;

  if (isDeepSeek(config)){
    const effort = EFFORTS.some(e => e.k === config.reasoningEffort) ? config.reasoningEffort : 'high';
    if (effort === 'none') body.thinking = { type: 'disabled' };
    else {
      body.thinking = { type: 'enabled' };
      body.reasoning_effort = effort;
    }
    if (stream) body.stream_options = { include_usage: true };
  }

  if (tools && tools.length) body.tools = tools;
  return body;
}

/** 统一发请求并处理错误（流式 / 非流式共用） */
async function request(config, messages, tools, stream, signal){
  if (!isConfigured(config)) throw new Error('还没有配置模型（baseURL / model）');

  const url = trimUrl(config.baseURL) + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST', headers, signal,
      body: JSON.stringify(buildBody(config, messages, tools, stream))
    });
  } catch (e){
    if (e?.name === 'AbortError') throw e;
    throw new Error(`连不上模型接口：${e.message}（检查 baseURL / 网络 / CORS）`);
  }

  if (!res.ok){
    const text = await res.text().catch(() => '');
    let hint = '';
    if (res.status === 401) hint = '（API Key 无效）';
    else if (res.status === 400 && /tool_choice/i.test(text)) hint = '（思考模式下不支持 tool_choice: required）';
    else if (res.status === 404) hint = '（baseURL 或 model 名不对）';
    else if (res.status === 429) hint = '（限流，稍后再试）';
    throw new Error(`模型接口 ${res.status}${hint}：${text.slice(0, 240)}`);
  }
  return res;
}

/**
 * 一次非流式对话请求。
 * @param {{config:object, messages:Array, tools?:Array, signal?:AbortSignal}} p
 * @returns {Promise<object>} 原始响应 { choices:[{message}] }
 */
export async function chat({ config, messages, tools, signal }){
  const res = await request(config, messages, tools, false, signal);
  return res.json();
}

/**
 * 一次流式对话请求（SSE）。
 *
 * 边读边回调，最终拼成与非流式一致的响应结构，方便 Agent 循环复用：
 *   { choices:[{ message:{ role, content, reasoning_content, tool_calls }, finish_reason }], usage }
 *
 * @param {{
 *   config:object, messages:Array, tools?:Array, signal?:AbortSignal,
 *   onDelta?: (d:{type:'reasoning'|'content', text:string}) => void
 * }} p
 */
export async function chatStream({ config, messages, tools, signal, onDelta }){
  const res = await request(config, messages, tools, true, signal);

  /* 环境不支持 ReadableStream：退回一次性解析 */
  if (!res.body || typeof res.body.getReader !== 'function'){
    const json = await res.json();
    const msg = json?.choices?.[0]?.message || {};
    if (msg.reasoning_content) onDelta?.({ type: 'reasoning', text: msg.reasoning_content });
    if (msg.content) onDelta?.({ type: 'content', text: msg.content });
    return json;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let reasoning = '';
  let finish = null;
  let usage = null;
  const calls = [];
  let done = false;

  const handleChunk = obj => {
    if (!obj || typeof obj !== 'object') return;
    if (obj.usage) usage = obj.usage;
    const ch = obj.choices && obj.choices[0];
    if (!ch) return;
    if (ch.finish_reason) finish = ch.finish_reason;

    const d = ch.delta || {};
    if (d.reasoning_content){
      reasoning += d.reasoning_content;
      onDelta?.({ type: 'reasoning', text: d.reasoning_content });
    }
    if (d.content){
      content += d.content;
      onDelta?.({ type: 'content', text: d.content });
    }
    /* tool_calls 分片：首片带 id / type / function.name，后续片只带 arguments */
    for (const tc of d.tool_calls || []){
      const i = tc.index ?? calls.length;
      const slot = calls[i] || (calls[i] = { id: '', type: 'function', function: { name: '', arguments: '' } });
      if (tc.id) slot.id = tc.id;
      if (tc.type) slot.type = tc.type;
      if (tc.function?.name) slot.function.name += tc.function.name;
      if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
    }
  };

  while (!done){
    const { done: end, value } = await reader.read();
    if (end) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0){
      const line = buffer.slice(0, nl).replace(/\r$/, '').trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line.startsWith(':')) continue;        // 空行 / SSE 注释（心跳）
      if (!line.startsWith('data:')) continue;            // event: / id: 等
      const data = line.slice(5).trim();
      if (data === '[DONE]'){ done = true; break; }
      try { handleChunk(JSON.parse(data)); } catch (e) { /* 忽略不完整分片 */ }
    }
  }

  const message = { role: 'assistant', content };
  if (reasoning) message.reasoning_content = reasoning;
  const toolCalls = calls.filter(Boolean).map(c => ({
    id: c.id, type: c.type || 'function',
    function: { name: c.function.name, arguments: c.function.arguments }
  }));
  if (toolCalls.length) message.tool_calls = toolCalls;

  return { choices: [{ index: 0, message, finish_reason: finish || 'stop' }], usage };
}

/**
 * 连通性自检：发一句最短的问候，验证 baseURL / model / apiKey 是否可用。
 * 本地 Ollama 等允许不填 apiKey。
 * @returns {Promise<string>} 模型回的一句话（用于展示）
 */
export async function testConnection(cfg){
  const res = await chat({
    config: { ...cfg, stream: false },
    messages: [{ role: 'user', content: '回复两个字：可用' }]
  });
  const msg = res?.choices?.[0]?.message;
  if (!msg) throw new Error('接口有响应，但不是 OpenAI 兼容格式（缺少 choices[0].message）');
  const reply = String(msg.content || msg.reasoning_content || '').trim();
  return reply.slice(0, 40) || '（模型返回了空内容）';
}
