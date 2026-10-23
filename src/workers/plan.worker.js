/* 方案报告 Worker：车位审计 / 强排指标 / 房间净面积（布尔） */
import { runReport } from '../core/workers/planTasks.js';

self.onmessage = e => {
  const { id, payload } = e.data || {};
  try {
    self.postMessage({ id, ok: true, result: runReport(payload) });
  } catch (err){
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
