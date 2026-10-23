/* ============================================================================
 *  方案报告 Worker 客户端
 *
 *  · 浏览器：单 Worker、请求 id 关联、3s 超时
 *  · Worker 不可用 / 出错 / SSR 单测：自动降级为主线程同步计算
 * ========================================================================== */
import { runReport as runSync } from './planTasks.js';

let worker = null;          // undefined = 未初始化；null = 不可用
let seq = 0;
const pending = new Map();

function finish(id, msg){
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  if (msg && msg.ok) p.resolve(msg.result);
  else p.resolve(runSync(p.payload));       // Worker 算失败：退回同步，保证面板有结果
}

function failAll(){
  for (const [, p] of pending){
    clearTimeout(p.timer);
    p.resolve(runSync(p.payload));
  }
  pending.clear();
  if (worker){ try { worker.terminate(); } catch (e) {} }
  worker = null;
}

function ensureWorker(){
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined'){ worker = null; return worker; }
    worker = new Worker(new URL('../../workers/plan.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => finish(e.data && e.data.id, e.data);
    worker.onerror = () => failAll();
    worker.onmessageerror = () => failAll();
  } catch (e){
    worker = null;
  }
  return worker;
}

/**
 * 异步生成报告；即使 Worker 不可用也会 resolve（同步降级）。
 * @param {{levels:Array, rooms:Array, regions:Array, households:number, preset:string}} payload
 * @returns {Promise<{audit:object, metrics:object, areas:object}>}
 */
export function reportAsync(payload){
  const w = ensureWorker();
  if (!w) return Promise.resolve(runSync(payload));

  const id = ++seq;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(runSync(payload));
    }, 3000);
    pending.set(id, { resolve, timer, payload });
    try {
      w.postMessage({ id, payload });
    } catch (e){
      clearTimeout(timer);
      pending.delete(id);
      resolve(runSync(payload));
    }
  });
}
