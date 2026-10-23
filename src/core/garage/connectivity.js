/* ============================================================================
 *  地库车道连通性：把车道 / 地库模块的通道中心线连成图，
 *  检查「车位是否都能从出入口到达」。纯函数，不依赖 Three / Vue。
 *
 *  做法：沿每条通道线按 1.5m 采样点，点间距 ≤ snap 就并查集合并；
 *  出入口与车位各自找最近的采样点，落到同一个连通分量即视为可达。
 *  这是示意级校验：用于发现「孤立车道 / 车位落在车道外」，不做车道宽度与转弯半径。
 * ========================================================================== */
import { garageLayout } from './layout.js';

const STALL_TYPES = new Set([
  'parking', 'evparking', 'parkingaccessible', 'parkingsub', 'parkingcompact', 'parkingrow'
]);

const toWorld = f => {
  const a = (f.rot || 0)*Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
  return (px, pz) => [f.cx + px*ca - pz*sa, f.cy + px*sa + pz*ca];
};

/** 通道中心线段（世界坐标） */
export function aisleSegmentsOf(items = []){
  const segs = [];
  for (const f of items){
    if (f.type === 'garagemodule'){
      const L = garageLayout(f.w, f.d);
      const w2 = toWorld(f);
      const zs = [];
      for (const aisle of L.aisles){
        const z = aisle.z0 + aisle.depth/2;
        zs.push(z);
        const p0 = w2(-f.w/2 + L.margin, z), p1 = w2(f.w/2 - L.margin, z);
        segs.push({ x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1] });
      }
      // 模块两端按「环形车道」处理：多条通道在端部连通，否则每排都会是孤岛
      if (zs.length > 1){
        const xEdge = f.w/2 - L.margin;
        for (const sx of [-xEdge, xEdge]){
          const p0 = w2(sx, Math.min(...zs)), p1 = w2(sx, Math.max(...zs));
          segs.push({ x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1] });
        }
      }
    } else if (f.type === 'lane'){
      const hz = f.w >= f.d, len = (hz ? f.w : f.d)/2;
      const w2 = toWorld(f);
      const p0 = hz ? w2(-len, 0) : w2(0, -len);
      const p1 = hz ? w2(len, 0) : w2(0, len);
      segs.push({ x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1] });
    }
  }
  return segs;
}

/** 车位中心点（地库模块按排布公式展开） */
export function stallPointsOf(items = []){
  const out = [];
  for (const f of items){
    if (f.type === 'garagemodule'){
      const L = garageLayout(f.w, f.d);
      if (!L.stallsPerRow) continue;
      const w2 = toWorld(f);
      for (const row of L.rows){
        const z = row.z0 + row.depth/2;
        for (let i = 0; i < L.stallsPerRow; i++){
          const p = w2(-f.w/2 + L.margin + L.stallW*(i + .5), z);
          out.push({ x: p[0], y: p[1] });
        }
      }
    } else if (f.type === 'parkingrow'){
      const hz = f.w >= f.d, L = hz ? f.w : f.d;
      const n = Math.max(1, Math.round(L/2500));
      const w2 = toWorld(f);
      for (let i = 0; i < n; i++){
        const t = -L/2 + L*(i + .5)/n;
        const p = hz ? w2(t, 0) : w2(0, t);
        out.push({ x: p[0], y: p[1] });
      }
    } else if (STALL_TYPES.has(f.type)){
      out.push({ x: f.cx, y: f.cy });
    }
  }
  return out;
}

/** 地库出入口（含车行坡道）位置 */
export function entrancePointsOf(items = []){
  return items
    .filter(f => f.type === 'garageentry' || f.type === 'ramp')
    .map(f => ({ x: f.cx, y: f.cy }));
}

/**
 * @param {Array} items 同一楼层的家具
 * @param {{snap?:number, reach?:number, step?:number}} [opt]
 * @returns {{ok:boolean, stalls:number, unreachable:number, segments:number,
 *   components:number, entrances:number, isolated:number, hasEntry:boolean}}
 */
export function analyzeConnectivity(items = [], { snap = 1200, reach = 9000, step = 1000 } = {}){
  const segs = aisleSegmentsOf(items);
  const stalls = stallPointsOf(items);
  const entrances = entrancePointsOf(items);
  const base = {
    stalls: stalls.length, unreachable: stalls.length, segments: segs.length,
    components: 0, entrances: entrances.length, isolated: 0, hasEntry: entrances.length > 0,
    ok: false
  };
  if (!stalls.length) return { ...base, ok: true, unreachable: 0 };
  if (!segs.length) return base;

  /* ---- 采样点 + 并查集 + 空间哈希 ---- */
  const pts = [];
  const grid = new Map();
  const key = (cx, cy) => cx + '|' + cy;
  const find = i => { while (pts[i].p !== i){ pts[i].p = pts[pts[i].p].p; i = pts[i].p; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) pts[a].p = b; };
  const addPoint = (x, y) => {
    const cx = Math.floor(x/snap), cy = Math.floor(y/snap), idx = pts.length;
    pts.push({ x, y, p: idx });
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++){
      const arr = grid.get(key(cx + dx, cy + dy));
      if (!arr) continue;
      for (const j of arr) if (Math.hypot(pts[j].x - x, pts[j].y - y) <= snap) union(idx, j);
    }
    const k = key(cx, cy);
    const list = grid.get(k);
    if (list) list.push(idx); else grid.set(k, [idx]);
    return idx;
  };
  const nearestComp = (x, y, radius) => {
    const r = Math.max(1, Math.ceil(radius/snap));
    const cx = Math.floor(x/snap), cy = Math.floor(y/snap);
    let best = -1, bd = radius;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++){
      const arr = grid.get(key(cx + dx, cy + dy));
      if (!arr) continue;
      for (const j of arr){
        const d = Math.hypot(pts[j].x - x, pts[j].y - y);
        if (d <= bd){ bd = d; best = find(j); }
      }
    }
    return best;
  };

  const segRoots = [];
  for (const s of segs){
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    const n = Math.max(1, Math.ceil(len/step));
    for (let i = 0; i <= n; i++){
      const t = i/n;
      addPoint(s.x0 + (s.x1 - s.x0)*t, s.y0 + (s.y1 - s.y0)*t);
    }
    segRoots.push(find(pts.length - 1));
  }

  /* ---- 出入口 → 通道 ---- */
  const connected = new Set();
  for (const e of entrances){
    // 出入口常在楼外，需要经过一段引道才接上第一条通道，搜索半径放宽到 24m
    const c = nearestComp(e.x, e.y, Math.max(reach*2, 24000));
    if (c >= 0) connected.add(c);
  }

  /* ---- 车位 → 通道 ---- */
  let unreachable = 0;
  for (const st of stalls){
    const c = nearestComp(st.x, st.y, reach);
    if (c < 0 || !connected.has(c)) unreachable++;
  }

  const comps = new Set(segRoots.map(find));
  const isolated = [...comps].filter(c => !connected.has(c)).length;
  return {
    stalls: stalls.length, unreachable, segments: segs.length,
    components: comps.size, entrances: entrances.length, isolated,
    hasEntry: entrances.length > 0,
    ok: connected.size > 0 && unreachable === 0
  };
}
