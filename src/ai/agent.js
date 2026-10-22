/* ============================================================================
 *  Agent 循环（纯函数，不碰 Vue / DOM，便于单测）
 *
 *  模式：工具调用（function calling）
 *      user → assistant(tool_calls) → tool 结果 → … → assistant(文本)
 *  约束：
 *      · 单轮最多 maxSteps 次模型往返，防止无限循环；
 *      · 工具抛错不中断，转成 { ok:false, code, message } 喂回模型自愈；
 *      · 每条 tool 消息必须带 tool_call_id（OpenAI 协议要求）。
 * ========================================================================== */
import { execTool, TOOLS } from './toolset.js';

const strip = msg => ({
  role: 'assistant',
  content: msg.content ?? '',
  ...(msg.tool_calls && msg.tool_calls.length ? { tool_calls: msg.tool_calls } : {})
});

/**
 * @param {{
 *   session: object,
 *   messages: Array,
 *   chat: (payload:{messages:Array, tools:Array}) => Promise<any>,
 *   maxSteps?: number,
 *   onTool?: (e:{name:string,args:object,result?:any,error?:any}) => void,
 *   onAssistant?: (text:string) => void
 * }} p
 * @returns {Promise<{text:string, steps:number, messages:Array}>}
 */
export async function runAgent({ session, messages, chat, maxSteps = 10, onTool, onAssistant }){
  for (let step = 1; step <= maxSteps; step++){
    const res = await chat({ messages, tools: TOOLS });
    const msg = res && res.choices && res.choices[0] && res.choices[0].message;
    if (!msg) throw new Error('模型返回为空（检查接口是否是 OpenAI 兼容格式）');

    messages.push(strip(msg));
    if (msg.content) onAssistant?.(msg.content);

    const calls = msg.tool_calls || [];
    if (!calls.length) return { text: msg.content || '', steps: step, messages };

    for (const call of calls){
      const name = (call.function && call.function.name) || '';
      let args = {};
      let error = null;
      let result = null;

      try {
        args = call.function && call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch (e){
        error = { ok: false, code: 'ARGS_JSON_INVALID', message: `参数不是合法 JSON：${String(call.function?.arguments).slice(0, 120)}` };
      }

      if (!error){
        try { result = execTool(session, name, args); }
        catch (e){
          error = {
            ok: false, code: e.code || 'TOOL_ERROR', message: e.message,
            ...(e.extra && typeof e.extra === 'object' ? e.extra : {})
          };
        }
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id || `call_${step}_${messages.length}`,
        content: JSON.stringify(error || result)
      });
      onTool?.({ name, args, result, error });

      /* 让出一帧：每个 MCP 工具（改墙体/区域/家具）执行后都能立刻重绘，
         用户可以看到 2D 户型图一步步构建的过程，工具结果也逐条出现 */
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return { text: `（已执行 ${maxSteps} 轮工具调用，先停在这里；继续说「继续」可接着做）`, steps: maxSteps, messages };
}
