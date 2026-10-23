/* ============================================================================
 *  节点图 → 墙体「整段」推导（纯函数）
 *
 *  旧数据把一面墙按门窗洞口切成若干矩形段，3D 只能一段段拼盒子，
 *  于是出现「左墙 + 右墙 + 过梁」的三段式拼补。
 *
 *  这里把同一墙线上的若干段重新合成「一段墙 + 若干洞口」：
 *
 *      [墙段 A][门洞][墙段 B]   ──►   一段墙，中间一个 0–2.1m 的洞
 *
 *  再做两件事：
 *    1. 洞口挂到所属墙段上，得到竖向范围（sill / head）；
 *    2. 相交墙体去重（水平墙优先），保证转角既没有重叠面（z-fighting），
 *       也没有缺口 —— 正交户型下等价于 45° 斜接的观感。
 * ========================================================================== */
import { spanOf } from './legacy.js';
import { isSlantXY } from '../model/wallLine.js';
import { quadOf, quadPathD, aabbOfQuad } from '../geometry/seg.js';

const TOL = 3;          // 平面坐标容差（mm）
const MERGE_GAP = 10;   // 段与段之间允许直连的最大缝隙（mm）

/**
 * 墙体节点 → 中心线描述。
 *
 * 正交墙沿用「axis + 一维 span + 中心线坐标 c」这套紧凑表达（合并 / 洞口 / 转角去重
 * 都建立在一维区间上，改动面最小）；斜墙单独用 axis='s' + line，走一维化的
 * 局部坐标系（span = [0, 墙长]），不参与正交墙的合并与修剪。
 */
function wallInfo(n){
  const dx = n.b[0] - n.a[0], dy = n.b[1] - n.a[1];
  const common = {
    nodeId: n.id,
    index: n.meta?.index ?? -1,
    t: n.thickness,
    kind: n.kind,
    materialId: n.materialId || ''
  };

  if (isSlantXY(n.a[0], n.a[1], n.b[0], n.b[1])){
    const len = Math.hypot(dx, dy);
    return {
      ...common,
      axis: 's',
      line: { a: [n.a[0], n.a[1]], b: [n.b[0], n.b[1]] },
      // 斜墙的一维坐标：沿墙从起点算起，窗口 / 洞口（P3）以后挂这里
      a: 0,
      b: len,
      c: 0,
      span: [0, len],
      deg: Math.atan2(dy, dx) * 180 / Math.PI
    };
  }

  const horiz = Math.abs(dx) >= Math.abs(dy);
  return {
    ...common,
    axis: horiz ? 'h' : 'v',
    a: horiz ? Math.min(n.a[0], n.b[0]) : Math.min(n.a[1], n.b[1]),
    b: horiz ? Math.max(n.a[0], n.b[0]) : Math.max(n.a[1], n.b[1]),
    c: horiz ? n.a[1] : n.a[0]
  };
}

/** 洞口节点 → 沿墙一维区间 + 竖向范围 */
function openingInfo(n){
  const sp = spanOf(n.rect);
  return {
    nodeId: n.id,
    key: n.meta?.key || n.id,
    axis: sp.axis,
    a: sp.a,
    b: sp.b,
    c: sp.c,
    sill: Math.max(0, n.sill ?? 0),
    head: Math.max(0, n.head ?? 2.1),
    suppressed: !!n.suppressed,
    kind: n.kind
  };
}

/** 某个缝隙是否正好被一个洞口填满（门窗两侧墙段就是被洞口隔开的） */
function gapCoveredByOpening(gapA, gapB, c, t, openings){
  for (const o of openings){
    // suppressed 的洞口同样要参与「桥接」：它虽然不开洞，但墙体在这里是连续的
    if (Math.abs(o.c - c) > t / 2 + TOL) continue;
    if (o.a <= gapA + TOL && o.b >= gapB - TOL) return true;
  }
  return false;
}

/**
 * 把同一墙线上的墙段合并成 run（一段墙）。
 * 合并条件：同向、同中心线、同厚度、同类型、同材质，且两段直连或被洞口隔开。
 */
function mergeRuns(walls, openings){
  const rank = a => (a === 'h' ? 0 : a === 'v' ? 1 : 2);
  const sorted = walls.slice().sort((p, q) => {
    if (p.axis !== q.axis) return rank(p.axis) - rank(q.axis);
    return (p.c - q.c) || (p.a - q.a);
  });

  const runs = [];
  for (const w of sorted){
    const last = runs[runs.length - 1];
    // 斜墙不做合并：共线判定要按法向距离 + 方向角重新定义，留给后续阶段；
    // 不合并的代价只是 3D 里多一个 mesh，几何完全正确。
    const same = w.axis !== 's'
      && last
      && last.axis === w.axis
      && Math.abs(last.c - w.c) <= TOL
      && Math.abs(last.thickness - w.t) <= TOL
      && last.kind === w.kind
      && last.materialId === w.materialId;

    if (same){
      const gap = w.a - last.span[1];
      const connected = gap <= MERGE_GAP
        || (gap > 0 && gapCoveredByOpening(last.span[1], w.a, last.c, last.thickness, openings));
      if (connected){
        last.span[1] = Math.max(last.span[1], w.b);
        last.wallIds.push(w.index);
        last.materialId = last.materialId || w.materialId;
        continue;
      }
    }

    runs.push({
      id: '',
      axis: w.axis,
      span: [w.a, w.b],
      c: w.c,
      // 斜墙带上中心线：2D 轮廓 / 3D 摆位 / 命中都靠它，正交墙没有这个字段
      ...(w.line ? { line: w.line, deg: w.deg } : {}),
      thickness: w.t,
      kind: w.kind,
      materialId: w.materialId,
      low: w.kind === 'low',
      wallIds: [w.index],
      openingKeys: [],
      holes: []
    });
  }
  return runs;
}

/** 洞口挂到 run 上：同一墙线 + 落在 span 内 */
function attachOpenings(runs, openings){
  for (const o of openings){
    const run = runs.find(r => r.axis === o.axis
      && Math.abs(o.c - r.c) <= r.thickness / 2 + TOL
      && o.a >= r.span[0] - TOL
      && o.b <= r.span[1] + TOL);
    if (!run) continue;
    run.openingKeys.push(o.key);
    if (o.suppressed) continue;                // 需要填实的洞口：只参与合并，不开洞
    const a = Math.max(o.a, run.span[0]);
    const b = Math.min(o.b, run.span[1]);
    if (b - a <= TOL) continue;
    if (o.head <= 0) continue;
    run.holes.push({ key: o.key, a, b, sill: o.sill, head: o.head });
  }
}

/** 把一段区间按若干「切除区间」拆开 */
function subtract(span, cuts){
  let pieces = [[span[0], span[1]]];
  for (const [c0, c1] of cuts){
    const next = [];
    for (const [a, b] of pieces){
      if (c1 <= a + TOL || c0 >= b - TOL){ next.push([a, b]); continue; }
      if (c0 > a + TOL) next.push([a, c0]);
      if (c1 < b - TOL) next.push([c1, b]);
    }
    pieces = next;
  }
  return pieces;
}

/**
 * 相交墙体去重：水平墙优先，垂直墙被水平墙切掉重叠段。
 * 这样转角处每个体块只被覆盖一次 —— 既不会两块墙互相插入（转角鼓包），
 * 也不会因为各自退让而漏光。
 */
function trimJunctions(runs){
  const horiz = runs.filter(r => r.axis === 'h');
  const vert = runs.filter(r => r.axis === 'v');
  // 斜墙不参与正交修剪：与其它墙是「实体相交」而不是「共面重叠」，
  // 3D 里不会 z-fighting，2D 同色填充也看不出来；真正需要斜接时再补通用求交。
  const out = [...horiz, ...runs.filter(r => r.axis === 's')];

  for (const v of vert){
    const cuts = [];
    for (const h of horiz){
      const hz0 = h.c - h.thickness / 2, hz1 = h.c + h.thickness / 2;
      const vx0 = v.c - v.thickness / 2, vx1 = v.c + v.thickness / 2;
      const ox = Math.min(h.span[1], vx1) - Math.max(h.span[0], vx0);
      const oz = Math.min(hz1, v.span[1]) - Math.max(hz0, v.span[0]);
      if (ox > TOL && oz > TOL) cuts.push([Math.max(hz0, v.span[0]), Math.min(hz1, v.span[1])]);
    }
    if (!cuts.length){ out.push(v); continue; }

    for (const [a, b] of subtract(v.span, cuts)){
      if (b - a <= TOL) continue;
      const piece = { ...v, span: [a, b], holes: [] };
      piece.holes = v.holes.filter(h => h.a >= a - TOL && h.b <= b + TOL);
      out.push(piece);
    }
  }
  return out;
}

/**
 * 推导当前楼层的「整段墙」。
 * @param {object} graph 节点图
 * @returns {Array<{id,axis,span,c,thickness,kind,low,wallIds,openingKeys,holes}>}
 */
export function wallRuns(graph){
  const nodes = Object.values(graph?.nodes || {});
  const walls = nodes.filter(n => n.type === 'wall' && n.visible !== false).map(wallInfo);
  const openings = nodes.filter(n => n.type === 'opening' && n.visible !== false).map(openingInfo);
  if (!walls.length) return [];

  const runs = mergeRuns(walls, openings);
  attachOpenings(runs, openings);

  const finalRuns = trimJunctions(runs).map(r => ({
    ...r,
    // 斜墙没有「中心线坐标 + 一维区间」这个天然 id，用墙段下标做身份（唯一且稳定）
    id: r.axis === 's'
      ? `s_${r.wallIds[0]}`
      : `${r.axis}_${Math.round(r.c)}_${Math.round(r.span[0])}_${Math.round(r.span[1])}`
  }));

  const rank = a => (a === 'h' ? 0 : a === 'v' ? 1 : 2);
  finalRuns.sort((p, q) => {
    if (p.axis !== q.axis) return rank(p.axis) - rank(q.axis);
    return (p.c - q.c) || (p.span[0] - q.span[0]);
  });
  return finalRuns;
}

/** run → 平面矩形（斜墙返回 AABB：只用于命中 / 剔除 / 旧代码兜底） */
export function runRect(run){
  const { axis, span, c, thickness } = run;
  if (run.line){
    const q = quadOf({ x: run.line.a[0], y: run.line.a[1] }, { x: run.line.b[0], y: run.line.b[1] }, thickness);
    return aabbOfQuad(q);
  }
  return axis === 'h'
    ? [span[0], c - thickness / 2, span[1], c + thickness / 2]
    : [c - thickness / 2, span[0], c + thickness / 2, span[1]];
}

/**
 * run → 平面轮廓 path（外框 + 洞口，evenodd 挖空）。
 * 从 PlanCanvas 抽出来：总图档的「其它楼栋外墙」也要用同一套路径。
 */
export function runPathD(r){
  if (!r) return '';
  let d = quadPathD(runQuad(r));
  // 洞口目前只挂得到正交墙上（斜墙开洞见后续阶段）
  if (r.axis !== 's'){
    const h = r.thickness / 2;
    for (const o of r.holes || []){
      const hx0 = r.axis === 'h' ? o.a : r.c - h;
      const hx1 = r.axis === 'h' ? o.b : r.c + h;
      const hy0 = r.axis === 'h' ? r.c - h : o.a;
      const hy1 = r.axis === 'h' ? r.c + h : o.b;
      d += `M${hx0} ${hy0}H${hx1}V${hy1}H${hx0}Z`;
    }
  }
  return d;
}

/** run → 平面四边形（2D 轮廓 / 3D 摆位统一入口，正交墙也能用） */
export function runQuad(run){
  if (run.line)
    return quadOf({ x: run.line.a[0], y: run.line.a[1] }, { x: run.line.b[0], y: run.line.b[1] }, run.thickness);
  const [x0, y0, x1, y1] = runRect(run);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}
