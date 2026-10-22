/* ============================================================================
 *  本地 Agent 桥（MCP 实时预览用，默认关闭）
 *
 *  启用方式（三选一）：
 *    · URL 加 ?agent=1           —— 例如 http://localhost:5173/?agent=1
 *    · localStorage 设 'plan3d-agent' = '1'（桌面版没有地址栏，用这个）
 *    · 页面里手动 window.__plan3d.enable()
 *
 *  它做什么：
 *    1. 把编辑器能力挂到 window.__plan3d（devtools / playwright 可直接驱动）；
 *    2. 连接本机 ws://127.0.0.1:4317（MCP server 起的桥），接收
 *       plan.apply / plan.export / view.snapshot 等指令。
 *
 *  安全边界：只连 127.0.0.1，且必须显式开启；不开启时这个模块不产生任何副作用。
 * ========================================================================== */
import { usePlanStore, useUiStore, useViewStore } from '@/stores/index.js';
import { getPlanSvg } from '@/shared/dom/planSvg.js';
import { getEngine } from '@/workspace/view3d/registry.js';
import { applyProjectDocument, exportProjectJSON } from '@/app/providers/useProjectFile.js';
import { setView as switchView } from '@/app/providers/useViewSwitch.js';

const DEFAULT_PORT = 4317;
const RETRY_MS = 3000;

const wait = ms => new Promise(r => setTimeout(r, ms));
const frames = (n = 2) => new Promise(resolve => {
  let i = 0;
  const tick = () => (++i >= n ? resolve() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
});

async function waitFor(fn, timeout = 6000, step = 120){
  const t0 = Date.now();
  while (Date.now() - t0 < timeout){
    const v = fn();
    if (v) return v;
    await wait(step);
  }
  return null;
}

/* ---------------- 截图 ---------------- */

/** 墨迹比例：抽样统计「非背景色」像素，用来判断截图是不是空白 */
function inkStats(cv, bg = [255, 253, 249]){
  try {
    const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const step = 4 * 7;                       // 每 7 个像素采一个点
    let ink = 0, n = 0;
    for (let i = 0; i < data.length; i += step){
      n++;
      if (Math.abs(data[i] - bg[0]) > 26 || Math.abs(data[i + 1] - bg[1]) > 26 || Math.abs(data[i + 2] - bg[2]) > 26) ink++;
    }
    return { w: cv.width, h: cv.height, inkRatio: +(ink / Math.max(1, n)).toFixed(3) };
  } catch (e){
    return { w: cv.width, h: cv.height, inkRatio: -1 };
  }
}

/** 2D 平面图：序列化 <svg> → Image → canvas → PNG（带米色底，否则透明） */
function rasterize2d(maxW = 1100){
  const svg = getPlanSvg();
  if (!svg) throw new Error('平面图 SVG 还没挂载');

  const vb = svg.viewBox?.baseVal;
  const w = (vb && vb.width) || svg.clientWidth || 1200;
  const h = (vb && vb.height) || svg.clientHeight || 900;

  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', vb ? vb.x : 0);
  bg.setAttribute('y', vb ? vb.y : 0);
  bg.setAttribute('width', w);
  bg.setAttribute('height', h);
  bg.setAttribute('fill', '#fffdf9');
  clone.insertBefore(bg, clone.firstChild);

  const text = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const s = Math.min(1, maxW / w);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * s));
        cv.height = Math.max(1, Math.round(h * s));
        const g = cv.getContext('2d');
        g.fillStyle = '#fffdf9';
        g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
        resolve({ url: cv.toDataURL('image/png'), stats: inkStats(cv) });
      } catch (e){ reject(e); }
    };
    img.onerror = () => reject(new Error('SVG 光栅化失败（可能有外部资源或非法标记）'));
    img.src = url;
  });
}

/** 3D 场景：必要时切到 3D 并等引擎激活，然后立刻抓帧（避免 drawingBuffer 被清空） */
async function rasterize3d(maxW = 1100){
  const ui = useUiStore();
  /* 必须走 useViewSwitch.setView：它会调 engine.enter() 并等入场动画结束 */
  if (ui.viewMode !== '3d') await switchView('3d');
  let engine = getEngine();
  engine = engine || await waitFor(() => getEngine());
  if (!engine) throw new Error('3D 引擎未初始化');
  if (!engine.active){
    const ok = await waitFor(() => getEngine()?.active, 8000);
    if (!ok) throw new Error('3D 视图启动超时');
    engine = getEngine();
  }
  engine.sync(true);
  await frames(3);

  const src = engine.renderer.domElement;
  engine.renderer.render(engine.scene, engine.camera);     // 保证当前帧有效
  const s = Math.min(1, maxW / src.width);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(src.width * s));
  cv.height = Math.max(1, Math.round(src.height * s));
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);

  /* 画面之外再给一份「场景里到底有什么」：空白画布与空场景的像素统计区分不开 */
  const scene = {
    arch: engine.archUp?.children?.length ?? 0,
    floor: engine.archFloor?.children?.length ?? 0,
    furn: engine.furnG?.children?.length ?? 0
  };
  return { url: cv.toDataURL('image/png'), stats: inkStats(cv, [0, 0, 0]), scene };
}

const strip = dataUrl => String(dataUrl || '').replace(/^data:image\/\w+;base64,/, '');

/* ---------------- 编辑器能力 ---------------- */

function appSummary(){
  const plan = usePlanStore();
  const st = plan.state;
  return {
    planId: plan.planId,
    furniture: st.furniture.length,
    regions: st.regions.length,
    walls: st.walls.length,
    doors: st.doors.length,
    wins: st.wins.length,
    levels: st.levels.length,
    activeLevel: st.activeLevel,
    rooms: Object.keys(st.rooms || {}).length,
    viewMode: useUiStore().viewMode
  };
}

const api = {
  version: '1.0',
  /** 完整 state（深拷贝，避免外部改到响应式对象） */
  getState(){
    const plan = usePlanStore();
    return JSON.parse(JSON.stringify({ ...plan.state, planId: plan.planId }));
  },
  exportDoc(){
    return JSON.parse(exportProjectJSON().text);
  },
  applyDoc(raw){
    const r = applyProjectDocument(raw);
    return { legacy: !!r?.legacy };
  },
  summary: appSummary,
  async snapshot2d(maxW){ const r = await rasterize2d(maxW); return strip(r.url); },
  async snapshot3d(maxW){ const r = await rasterize3d(maxW); return strip(r.url); },
  async setView(mode){
    await switchView(mode === '3d' ? '3d' : '2d');
    return useUiStore().viewMode;
  },
  /** 视口全览（导完方案后让 AI 看到整体） */
  fit(){ try { useViewStore().fitView(); } catch (e) {} }
};

/* ---------------- WS 连接 ---------------- */

function agentPort(){
  const qs = new URLSearchParams(location.search);
  const p = Number(qs.get('agent'));
  if (Number.isFinite(p) && p > 1024) return p;
  return Number(localStorage.getItem('plan3d-agent-port')) || DEFAULT_PORT;
}

async function handle(method, params = {}){
  switch (method){
    case 'app.ping':
      return { pong: true, version: api.version, ...appSummary() };
    case 'plan.export':
      return api.exportDoc();
    case 'plan.apply':
      api.applyDoc(params.doc);
      return { applied: true, ...appSummary() };
    case 'plan.summary':
      return appSummary();
    case 'view.set_mode':
      return { viewMode: await api.setView(params.mode) };
    case 'view.snapshot': {
      const mode = params.mode || 'both';
      const maxW = Number(params.maxW) || 1100;
      return (async () => {
        const out = {};
        if (mode !== '3d'){
          const a = await rasterize2d(maxW);
          out.png2d = a.url;
          out.stats2d = a.stats;
        }
        if (mode !== '2d'){
          const b = await rasterize3d(maxW);
          out.png3d = b.url;
          out.stats3d = b.stats;
          out.scene3d = b.scene;
        }
        return { ...out, ...appSummary() };
      })();
    }
    default:
      throw Object.assign(new Error(`未知方法 ${method}`), { code: 'METHOD_NOT_FOUND' });
  }
}

function connect(port, onStop){
  let ws = null, retry = null, stopped = false;

  const open = () => {
    if (stopped) return;
    try { ws = new WebSocket(`ws://127.0.0.1:${port}`); }
    catch (e){ retry = setTimeout(open, RETRY_MS); return; }

    ws.onopen = () => {
      console.info('[agent-bridge] 已连接 MCP，端口', port);
      ws.send(JSON.stringify({ id: 0, method: 'app.hello', params: { ...appSummary(), ua: navigator.userAgent } }));
    };

    ws.onmessage = async ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e){ return; }
      if (!msg || msg.method == null) return;
      try {
        const result = await handle(msg.method, msg.params);
        ws.send(JSON.stringify({ id: msg.id, ok: true, result }));
      } catch (e){
        ws.send(JSON.stringify({ id: msg.id, ok: false, code: e.code || 'APP_ERROR', message: e.message }));
      }
    };

    ws.onclose = () => { if (!stopped) retry = setTimeout(open, RETRY_MS); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  };

  open();
  return () => { stopped = true; clearTimeout(retry); try { ws?.close(); } catch (e) {} };
}

/** 由 App.vue 在挂载时调用；未开启时返回 null，不产生任何副作用 */
export function maybeStartAgentBridge(){
  const qs = new URLSearchParams(location.search);
  const enabled = qs.get('agent') === '1'
    || localStorage.getItem('plan3d-agent') === '1'
    || window.__PLAN3D_AGENT_FORCE__ === true;
  if (!enabled) return null;

  window.__plan3d = { ...api, enable(){ return true; } };
  const stop = connect(agentPort());
  console.info('[agent-bridge] 已启用；编辑器能力挂在 window.__plan3d');
  return stop;
}
