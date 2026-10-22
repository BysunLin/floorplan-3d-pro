/* ============================================================================
 *  轻量级户型图识别（纯浏览器实现，不依赖 opencv / 任何第三方库）
 *
 *  输入：canvas 已降采样的 ImageData（RGBA 像素）
 *  输出：像素坐标下的墙体矩形 + 房间多边形，由 toGeo() 换算成 mm 方案几何
 *
 *  管线：
 *    灰度 → 深色掩膜（彩色户型图）/ 自适应阈值（浅色线稿）→ 行 / 列游程 → 矩形
 *      → 空心墙配对（两条平行细线夹一条墙体）→ 同线合并
 *      → 尺度过滤（长度 / 厚度 / 长宽比）→ 连通性过滤（去掉家具图块）
 *      → 轴线对齐 + 吸附到图上尺寸链（P1）
 *      → 栅格化（以墙边为网格线）→ 房间：
 *          有文字块就以文字为种子做测地 Voronoi（B），否则退回背景连通域洪泛
 *      → 轮廓追踪 → 房间多边形
 *
 *  只处理横平竖直的户型图；斜墙 / 弧墙不识别（v1 明确不支持）。
 * ========================================================================== */

/** 灰度：整数近似 BT.601，避免逐像素浮点运算 */
function toGray(data, w, h){
  const out = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4)
    out[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  return out;
}

/** Otsu：返回让前景 / 背景类间方差最大的阈值（0~255） */
function otsuThreshold(gray){
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0, wB = 0, best = -1, bestT = 0;
  for (let t = 0; t < 256; t++){
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best){ best = between; bestT = t; }
  }
  return bestT;
}

/**
 * 墙体候选掩膜（营销图 / 渲染图这类彩色户型图的主路径）。
 *
 * 这类图里地板是木纹 / 瓷砖照片、家具是实景图，只有墙体是**近乎纯黑的填充**，
 * 所以「取最暗的一小撮像素」比自适应阈值干净得多。Otsu 阈值再压到 0.62 倍，
 * 保证地板的中灰不会被算进来。
 */
function darkBin(gray, w, h, opts = {}){
  const t = opts.darkT != null
    ? opts.darkT
    : Math.max(42, Math.min(104, Math.round(otsuThreshold(gray) * 0.62)));
  const bin = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < bin.length; i++) if (gray[i] <= t){ bin[i] = 1; n++; }
  return { bin, t, ratio: n / bin.length };
}

/** 自适应阈值二值化：积分图求窗口均值，比窗口均值暗 bias 以上的像素判为前景（墙线） */
function adaptiveBin(gray, w, h, win, bias){
  const W = w + 1;
  const sum = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++){
    let rowSum = 0;
    for (let x = 0; x < w; x++){
      rowSum += gray[y * w + x];
      sum[(y + 1) * W + (x + 1)] = sum[y * W + (x + 1)] + rowSum;
    }
  }
  const r = win >> 1;
  const bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++){
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++){
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const s = sum[(y1 + 1) * W + (x1 + 1)] - sum[y0 * W + (x1 + 1)]
        - sum[(y1 + 1) * W + x0] + sum[y0 * W + x0];
      bin[y * w + x] = gray[y * w + x] * area + bias * area < s ? 1 : 0;
    }
  }
  return bin;
}

/**
 * 游程累积成矩形：沿切片方向逐行取前景游程，把上下相邻、水平重叠的游程并进同一个矩形。
 * 填充墙（粗线）一次就能得到完整矩形；细线则在后续「空心墙配对」里合成墙带。
 * @param {boolean} vertical true = 按列扫描（用于捕捉竖直细线）
 */
function runsToRects(bin, w, h, minRun, vertical){
  const slices = vertical ? w : h;
  const span = vertical ? h : w;
  const idx = (s, p) => (vertical ? p * w + s : s * w + p);
  const out = [];
  // 竖向扫描时 slice = x、pos = y，映射回矩形要对调回来
  const add = r => out.push(vertical
    ? { x0: r.s0, x1: r.s1, y0: r.p0, y1: r.p1 }
    : { x0: r.p0, x1: r.p1, y0: r.s0, y1: r.s1 });

  let active = [];
  for (let s = 0; s < slices; s++){
    // 当前切片的前景游程
    const runs = [];
    let p = 0;
    while (p < span){
      if (!bin[idx(s, p)]){ p++; continue; }
      const a = p;
      while (p < span && bin[idx(s, p)]) p++;
      if (p - a >= minRun) runs.push([a, p]);
    }

    const used = new Array(active.length).fill(false);
    for (const [a, b] of runs){
      let best = -1, bestOv = 0;
      for (let k = 0; k < active.length; k++){
        if (used[k]) continue;
        const r = active[k];
        if (r.last !== s - 1) continue;
        const ov = Math.min(b, r.p1) - Math.max(a, r.p0);
        if (ov <= 0) continue;
        const minL = Math.min(b - a, r.p1 - r.p0);
        const maxL = Math.max(b - a, r.p1 - r.p0);
        if (ov < 0.6 * minL) continue;        // 交叠不足 → 视为另一条
        if (minL < 0.3 * maxL) continue;      // 长度差太多 → 短边不能把长墙拖长（细墙穿过粗墙时）
        if (ov > bestOv){ bestOv = ov; best = k; }
      }
      if (best >= 0){
        const r = active[best];
        r.p0 = Math.min(r.p0, a);
        r.p1 = Math.max(r.p1, b);
        r.s1 = s + 1;
        r.last = s;
        used[best] = true;
      } else {
        active.push({ p0: a, p1: b, s0: s, s1: s + 1, last: s });
      }
    }
    // 本行没有延续的矩形就是终点
    active = active.filter((r, k) => (used[k] || r.last === s) ? true : (add(r), false));
  }
  for (const r of active) add(r);
  return out;
}

const areaOf = r => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);

/** 两个矩形的交并比（用于去掉行列两遍扫描得到的重复矩形） */
function iou(a, b){
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (!inter) return 0;
  return inter / (areaOf(a) + areaOf(b) - inter);
}

/**
 * 空心墙配对：户型图里非承重墙常画成「两条平行细线」，单条都是薄线。
 * 把同一走向、长轴高度重叠、间距 ≤ maxGap 的两条细线合成一条墙带。
 * 没配上对的细线（家具轮廓、尺寸线）直接丢弃。
 */
function pairHollow(rects, maxGap){
  const kept = [], thin = [];
  for (const r of rects){
    const horiz = (r.x1 - r.x0) >= (r.y1 - r.y0);
    const t = horiz ? (r.y1 - r.y0) : (r.x1 - r.x0);
    const L = horiz ? (r.x1 - r.x0) : (r.y1 - r.y0);
    if (t < 3.2 && L >= 18) thin.push({ ...r, horiz, t, L });
    else if (t >= 3.2) kept.push(r);
  }
  thin.sort((a, b) => (a.horiz === b.horiz ? 0 : (a.horiz ? -1 : 1)));

  const used = new Set();
  for (let i = 0; i < thin.length; i++){
    if (used.has(i)) continue;
    const a = thin[i];
    let best = -1, bestGap = Infinity;
    for (let j = i + 1; j < thin.length; j++){
      if (used.has(j)) continue;
      const b = thin[j];
      if (b.horiz !== a.horiz) continue;
      const ov = a.horiz
        ? Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
        : Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ov < 0.6 * Math.min(a.L, b.L)) continue;
      const gap = a.horiz
        ? Math.max(0, Math.max(b.y0 - a.y1, a.y0 - b.y1))
        : Math.max(0, Math.max(b.x0 - a.x1, a.x0 - b.x1));
      if (gap > maxGap) continue;
      if (gap < bestGap){ bestGap = gap; best = j; }
    }
    if (best >= 0){
      const b = thin[best];
      used.add(i); used.add(best);
      kept.push({
        x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1),
        y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1)
      });
    }
  }
  return kept;
}

/** 同向、截面接近、首尾相接（或间距 ≤ 6px）的矩形合并成一段墙（补掉文字 / 门洞造成的断口） */
function mergeCollinear(rects){
  const out = rects.map(r => ({ ...r }));
  let changed = true, guard = 0;
  while (changed && guard++ < 24){
    changed = false;
    for (let i = 0; i < out.length; i++){
      const a = out[i];
      const ah = (a.x1 - a.x0) >= (a.y1 - a.y0);
      for (let j = i + 1; j < out.length; j++){
        const b = out[j];
        const bh = (b.x1 - b.x0) >= (b.y1 - b.y0);
        if (ah !== bh) continue;
        const ok = ah
          ? Math.abs(a.y0 - b.y0) <= 4 && Math.abs(a.y1 - b.y1) <= 4
            && Math.min(a.x1, b.x1) >= Math.max(a.x0, b.x0) - 6
          : Math.abs(a.x0 - b.x0) <= 4 && Math.abs(a.x1 - b.x1) <= 4
            && Math.min(a.y1, b.y1) >= Math.max(a.y0, b.y0) - 6;
        if (!ok) continue;
        a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1);
        a.y0 = Math.min(a.y0, b.y0); a.y1 = Math.max(a.y1, b.y1);
        out.splice(j, 1);
        j--;
        changed = true;
      }
    }
  }
  return out;
}

/**
 * 补门洞：房间提取前把「同一条墙线上、间距 ≤ maxGap」的两段墙连起来，
 * 否则入户门 / 房门会把整个户型连通到室外，导致一个房间都分不出来。
 * 只用于生成房间，不写进最终墙体。
 */
function bridgeGaps(walls, maxGap){
  const out = [];
  for (let i = 0; i < walls.length; i++){
    for (let j = i + 1; j < walls.length; j++){
      const a = walls[i], b = walls[j];
      const ah = (a.x1 - a.x0) >= (a.y1 - a.y0);
      const bh = (b.x1 - b.x0) >= (b.y1 - b.y0);
      if (ah !== bh) continue;
      if (ah){
        const cy = (a.y0 + a.y1) / 2, cy2 = (b.y0 + b.y1) / 2;
        if (Math.abs(cy - cy2) > 8) continue;
        const [l, r] = a.x1 <= b.x0 ? [a, b] : [b, a];
        const gap = r.x0 - l.x1;
        if (gap <= 0 || gap > maxGap) continue;
        out.push({ x0: l.x1, x1: r.x0, y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) });
      } else {
        const cx = (a.x0 + a.x1) / 2, cx2 = (b.x0 + b.x1) / 2;
        if (Math.abs(cx - cx2) > 8) continue;
        const [t, d] = a.y1 <= b.y0 ? [a, b] : [b, a];
        const gap = d.y0 - t.y1;
        if (gap <= 0 || gap > maxGap) continue;
        out.push({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: t.y1, y1: d.y0 });
      }
    }
  }
  return out;
}

/** 两个矩形在膨胀 gap 后是否相交（用于判断墙段是否首尾相接） */
const overlapsWithin = (a, b, gap) =>
  a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1;

/**
 * 只保留「成片连在一起的墙体网络」，丢掉孤立的深色家具图块。
 *
 * 户型图里的墙是一整张首尾相接的网；床、沙发、电视柜这些深色图标是孤立的小岛，
 * 只靠长度 / 厚度 / 长宽比是分不开的，靠连通性可以。
 */
function keepNetworks(rects, gap){
  const n = rects.length;
  if (n <= 2) return new Set([...Array(n).keys()]);
  const parent = [...Array(n).keys()];
  const find = i => { while (parent[i] !== i){ parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (overlapsWithin(rects[i], rects[j], gap)) union(i, j);

  const groups = new Map();
  for (let i = 0; i < n; i++){
    const k = find(i);
    const g = groups.get(k);
    if (g) g.push(i); else groups.set(k, [i]);
  }
  let max = 0;
  for (const g of groups.values()) max = Math.max(max, g.length);

  // 保留所有「至少两段相接」的墙群；孤立的单段只有在足够长时才算墙
  //（家具图标往往是一块一块分开的，会成为单段；一堵独立的短墙则很罕见）
  const longest = Math.max(...rects.map(r => Math.max(r.x1 - r.x0, r.y1 - r.y0)));
  const keep = new Set();
  for (const g of groups.values()){
    if (g.length >= 2) { for (const i of g) keep.add(i); continue; }
    const r = rects[g[0]];
    if (Math.max(r.x1 - r.x0, r.y1 - r.y0) >= longest * 0.3) keep.add(g[0]);
  }
  if (!keep.size) for (const g of groups.values()) if (g.length === max) for (const i of g) keep.add(i);
  return keep;
}

const uniqSorted = arr => [...new Set(arr.map(v => Math.round(v * 100) / 100))].sort((a, b) => a - b);

/* ======================= 尺寸链（标注） =======================
 * 户型图外侧那一圈尺寸链，其实是画图人给出的「轴线表」：
 * 每个刻度就是一条墙的中心线。把它检出来，再把识别出的墙吸附上去，
 * 位置误差能从 ±几个像素降到 0，错开的墙段也会自动对齐成一条。
 *
 * 只做几何，不读数字（数字留给 OCR）：绝对比例仍由用户填的总宽决定，
 * 而刻度决定了墙与墙之间的相对位置，这正是最影响观感的部分。
 */

/** 尺度链刻度：垂直于链的细短笔画（数字的笔画会成组出现，用「孤立性」滤掉） */
function ticksAcross(gray, w, h, at, vertical, inkT){
  const R = 5;
  const n = vertical ? h : w;
  const across = vertical ? w : h;
  const cnt = new Uint16Array(n);
  for (let i = 0; i < n; i++){
    let c = 0;
    for (let d = -R; d <= R; d++){
      const p = at + d;
      if (p < 0 || p >= across) continue;
      const idx = vertical ? i * w + p : p * w + i;
      if (gray[idx] <= inkT) c++;
    }
    cnt[i] = c;
  }
  const cands = [];
  const MIN = 5;                                   // 刻度笔画几乎横穿整个带宽
  let i = 0;
  while (i < n){
    if (cnt[i] < MIN){ i++; continue; }
    const a = i;
    while (i < n && cnt[i] >= MIN) i++;
    if (i - a <= 4) cands.push(Math.round((a + i - 1) / 2));   // 细笔画，不是文字块
  }

  /* 区分「刻度」和「数字笔画」：数字是一组挤在一起的笔画（间隔 6~10px），
   * 真正的刻度之间至少隔着一小段墙（≥ 20px）。所以把挨得近的候选整簇丢掉。 */
  const keep = [];
  let k = 0;
  while (k < cands.length){
    let j = k + 1;
    while (j < cands.length && cands[j] - cands[j - 1] < 20) j++;
    if (j - k === 1) keep.push(cands[k]);
    k = j;
  }
  return keep;
}

/**
 * 找四边的尺寸链，返回轴线（像素坐标）。
 * 标注线和数字是灰色（比墙体浅），所以这里用更宽松的墨色阈值，且只看户型包围盒之外。
 */
export function findDimensionAxes(gray, w, h, box, opts = {}){
  const inkT = opts.inkT ?? 175;
  const rows = [], cols = [];

  for (let y = 0; y < h; y++) if (y < box.y0 - 2 || y > box.y1 + 2){
    let n = 0;
    for (let x = 0; x < w; x++) if (gray[y * w + x] <= inkT) n++;
    rows.push([y, n]);
  }
  for (let x = 0; x < w; x++) if (x < box.x0 - 2 || x > box.x1 + 2){
    let n = 0;
    for (let y = 0; y < h; y++) if (gray[y * w + x] <= inkT) n++;
    cols.push([x, n]);
  }

  const pick = (list, minCover) => {
    let best = -1, bestN = 0;
    for (const [k, n] of list) if (n > bestN){ bestN = n; best = k; }
    return bestN >= minCover ? best : -1;
  };

  const xs = [], ys = [];
  const top = pick(rows.filter(([y]) => y < box.y0 - 2), w * 0.15);
  const bottom = pick(rows.filter(([y]) => y > box.y1 + 2), w * 0.15);
  const left = pick(cols.filter(([x]) => x < box.x0 - 2), h * 0.15);
  const right = pick(cols.filter(([x]) => x > box.x1 + 2), h * 0.15);

  const M = Math.max(24, Math.round(Math.max(w, h) * 0.03));   // 允许比户型稍微外扩一点
  const inX = v => v >= box.x0 - M && v <= box.x1 + M;
  const inY = v => v >= box.y0 - M && v <= box.y1 + M;

  if (top >= 0) xs.push(...ticksAcross(gray, w, h, top, false, inkT).filter(inX));
  if (bottom >= 0) xs.push(...ticksAcross(gray, w, h, bottom, false, inkT).filter(inX));
  if (left >= 0) ys.push(...ticksAcross(gray, w, h, left, true, inkT).filter(inY));
  if (right >= 0) ys.push(...ticksAcross(gray, w, h, right, true, inkT).filter(inY));

  return {
    xs: uniqSorted(xs), ys: uniqSorted(ys),
    lines: { top, bottom, left, right }
  };
}

/** 把同向墙段的中心线对齐到同一条轴线（消除 1~3px 的抖动，让墙段能合并成一条） */
function alignCollinear(walls, tol){
  const out = walls.map(w => ({ ...w }));
  for (const horiz of [true, false]){
    const group = out.filter(w => ((w.x1 - w.x0) >= (w.y1 - w.y0)) === horiz);
    const key = w => horiz ? (w.y0 + w.y1) / 2 : (w.x0 + w.x1) / 2;
    group.sort((a, b) => key(a) - key(b));
    let i = 0;
    while (i < group.length){
      let j = i + 1, sum = key(group[i]), n = 1;
      while (j < group.length && key(group[j]) - key(group[j - 1]) <= tol){ sum += key(group[j]); j++; n++; }
      const mean = Math.round(sum / n);
      for (let k = i; k < j; k++){
        const w = group[k];
        const t = Math.max(3, horiz ? (w.y1 - w.y0) : (w.x1 - w.x0));
        if (horiz){ w.y0 = Math.round(mean - t / 2); w.y1 = w.y0 + t; }
        else { w.x0 = Math.round(mean - t / 2); w.x1 = w.x0 + t; }
      }
      i = j;
    }
  }
  return out;
}

/** 墙边吸附到尺寸链轴线：只吸收 tol 以内的偏差，所以误检的刻度不会把墙拉走 */
function snapToAxes(walls, axes, tol){
  if (!axes.xs.length && !axes.ys.length) return walls;
  const snap = (v, list) => {
    let best = v, bd = tol;
    for (const a of list){
      const d = Math.abs(a - v);
      if (d <= bd){ bd = d; best = a; }
    }
    return Math.round(best);
  };
  return walls.map(w => {
    const horiz = (w.x1 - w.x0) >= (w.y1 - w.y0);
    let { x0, y0, x1, y1 } = w;
    if (horiz){
      const cy = snap((y0 + y1) / 2, axes.ys);
      const t = Math.max(3, y1 - y0);
      y0 = Math.round(cy - t / 2); y1 = y0 + t;
      x0 = snap(x0, axes.xs); x1 = snap(x1, axes.xs);
    } else {
      const cx = snap((x0 + x1) / 2, axes.xs);
      const t = Math.max(3, x1 - x0);
      x0 = Math.round(cx - t / 2); x1 = x0 + t;
      y0 = snap(y0, axes.ys); y1 = snap(y1, axes.ys);
    }
    return { x0, y0, x1, y1 };
  });
}

const bboxOfWalls = walls => [
  Math.min(...walls.map(w => w.x0)), Math.min(...walls.map(w => w.y0)),
  Math.max(...walls.map(w => w.x1)), Math.max(...walls.map(w => w.y1))
];

/**
 * 追踪一个连通域的外轮廓：收集「域内 ↔ 域外」的单元格边界，首尾相接成闭环，
 * 再去掉共线点。户型图全是正交线段，得到的正好是直角多边形。
 */
function loopOf(cells, xs, ys, nx){
  const inside = new Set(cells.map(c => c.j * nx + c.i));
  const has = (i, j) => i >= 0 && j >= 0 && i < nx && inside.has(j * nx + i);
  const edges = new Map();                     // "x,y" → [[x2,y2], ...]
  const addEdge = (x1, y1, x2, y2) => {
    const k = x1 + ',' + y1;
    const list = edges.get(k);
    if (list) list.push([x2, y2]);
    else edges.set(k, [[x2, y2]]);
  };
  for (const { i, j } of cells){
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
    if (!has(i, j - 1)) addEdge(x1, y0, x0, y0);
    if (!has(i + 1, j)) addEdge(x1, y1, x1, y0);
    if (!has(i, j + 1)) addEdge(x0, y1, x1, y1);
    if (!has(i - 1, j)) addEdge(x0, y0, x0, y1);
  }

  let startKey = null;
  for (const k of edges.keys()){ startKey = k; break; }
  if (!startKey) return [];

  const pts = [];
  let cur = startKey;
  for (let guard = 0; guard < 200000; guard++){
    const list = edges.get(cur);
    if (!list || !list.length) break;
    const [x, y] = cur.split(',').map(Number);
    pts.push([x, y]);
    const nxt = list.pop();
    cur = nxt[0] + ',' + nxt[1];
    if (cur === startKey) break;
  }
  if (pts.length < 4) return [];

  // 去掉共线点
  const simp = [];
  for (let i = 0; i < pts.length; i++){
    const a = pts[(i - 1 + pts.length) % pts.length];
    const p = pts[i];
    const b = pts[(i + 1) % pts.length];
    const collinear = (a[0] === p[0] && b[0] === p[0]) || (a[1] === p[1] && b[1] === p[1]);
    if (!collinear) simp.push(p);
  }
  return simp.length >= 4 ? simp : pts;
}

/** 以墙边为网格线切一张格子图；被墙体覆盖的格子标记 blocked（墙都是正交的，格心判定是精确的） */
function buildWallGrid(walls, pad = 6){
  const xs = uniqSorted([
    Math.min(...walls.map(w => w.x0)) - pad, Math.max(...walls.map(w => w.x1)) + pad,
    ...walls.flatMap(w => [w.x0, w.x1])
  ]);
  const ys = uniqSorted([
    Math.min(...walls.map(w => w.y0)) - pad, Math.max(...walls.map(w => w.y1)) + pad,
    ...walls.flatMap(w => [w.y0, w.y1])
  ]);
  const nx = xs.length - 1, ny = ys.length - 1;
  const blocked = new Uint8Array(Math.max(0, nx * ny));
  for (let j = 0; j < ny; j++){
    const cy = (ys[j] + ys[j + 1]) / 2;
    for (let i = 0; i < nx; i++){
      const cx = (xs[i] + xs[i + 1]) / 2;
      for (const w of walls){
        if (cx >= w.x0 - 0.01 && cx <= w.x1 + 0.01 && cy >= w.y0 - 0.01 && cy <= w.y1 + 0.01){
          blocked[j * nx + i] = 1;
          break;
        }
      }
    }
  }
  return { xs, ys, nx, ny, blocked };
}

/** 从墙体矩形推出房间：以墙边切网格 → 墙体占格 → 从边界洪泛出「室外」→ 剩下的连通块就是房间 */
function traceRooms(walls, { pad = 6, minAreaRatio = 0.0015 } = {}){
  if (!walls.length) return [];
  const g = buildWallGrid(walls, pad);
  const { xs, ys, nx, ny, blocked } = g;
  if (nx < 2 || ny < 2) return [];

  // 从画布四周洪泛，标记「室外」
  const seen = new Uint8Array(nx * ny);
  const stack = [];
  const push = k => { if (!seen[k] && !blocked[k]){ seen[k] = 1; stack.push(k); } };
  for (let i = 0; i < nx; i++){ push(i); push((ny - 1) * nx + i); }
  for (let j = 0; j < ny; j++){ push(j * nx); push(j * nx + nx - 1); }
  while (stack.length){
    const k = stack.pop();
    const i = k % nx, j = (k / nx) | 0;
    if (i > 0) push(k - 1);
    if (i < nx - 1) push(k + 1);
    if (j > 0) push(k - nx);
    if (j < ny - 1) push(k + nx);
  }

  const minAreaPx = Math.max(160, (xs[nx] - xs[0]) * (ys[ny] - ys[0]) * minAreaRatio);
  const rooms = [];
  for (let k = 0; k < nx * ny; k++){
    if (seen[k] || blocked[k]) continue;
    const cells = [];
    const st = [k];
    seen[k] = 1;
    let area = 0;
    while (st.length){
      const c = st.pop();
      const i = c % nx, j = (c / nx) | 0;
      cells.push({ i, j });
      area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      const near = [
        i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1,
        j > 0 ? c - nx : -1, j < ny - 1 ? c + nx : -1
      ];
      for (const q of near){
        if (q >= 0 && !seen[q] && !blocked[q]){ seen[q] = 1; st.push(q); }
      }
    }
    if (area < minAreaPx) continue;
    const poly = loopOf(cells, xs, ys, nx);
    if (poly.length >= 4) rooms.push({ poly, area });
  }
  return rooms;
}

/**
 * 房间名 / 面积文字块 → 房间的「种子点」。
 *
 * 这一步只做几何：文字是图上仅有的「一小块一小块、笔画细、成排出现」的深色连通域。
 * 找到它们，就等于找到了每间房的位置 —— 即使墙体在阳台、厨房开口处断开，
 * 房间也不会因为「室外漏进来」而整层丢掉。
 */
function detectTextBlocks(gray, w, h, box, inkT = 135){
  const ink = new Uint8Array(w * h);
  const x0 = Math.max(0, Math.floor(box.x0)), x1 = Math.min(w - 1, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.floor(box.y0)), y1 = Math.min(h - 1, Math.ceil(box.y1));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (gray[y * w + x] <= inkT) ink[y * w + x] = 1;

  // 连通域 → 单字包围盒
  const seen = new Uint8Array(w * h);
  const glyphs = [];
  const stack = [];
  for (let y = y0; y <= y1; y++){
    for (let x = x0; x <= x1; x++){
      const p = y * w + x;
      if (!ink[p] || seen[p]) continue;
      seen[p] = 1;
      stack.push(p);
      let gx0 = x, gx1 = x, gy0 = y, gy1 = y, n = 0;
      while (stack.length){
        const c = stack.pop();
        const cx = c % w, cy = (c / w) | 0;
        n++;
        if (cx < gx0) gx0 = cx;
        if (cx > gx1) gx1 = cx;
        if (cy < gy0) gy0 = cy;
        if (cy > gy1) gy1 = cy;
        for (let dy = -1; dy <= 1; dy++){
          for (let dx = -1; dx <= 1; dx++){
            const nx2 = cx + dx, ny2 = cy + dy;
            if (nx2 < x0 || nx2 > x1 || ny2 < y0 || ny2 > y1) continue;
            const q = ny2 * w + nx2;
            if (ink[q] && !seen[q]){ seen[q] = 1; stack.push(q); }
          }
        }
      }
      const gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1;
      // 单个字的尺寸窗口（中文字 / 数字 / m²）：排除墙体、家具照片、大块图元
      if (n < 8 || n > 220) continue;
      if (gw < 3 || gw > 22 || gh < 6 || gh > 26) continue;
      glyphs.push({ x0: gx0, y0: gy0, x1: gx1, y1: gy1 });
    }
  }

  // 单字 → 行 → 块（同一间房的「卧室A / 6.8m²」两行会并成一块）
  glyphs.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const blocks = [];
  const used = new Uint8Array(glyphs.length);
  for (let i = 0; i < glyphs.length; i++){
    if (used[i]) continue;
    const seed = { ...glyphs[i] };
    used[i] = 1;
    let changed = true;
    while (changed){
      changed = false;
      for (let j = 0; j < glyphs.length; j++){
        if (used[j]) continue;
        const g = glyphs[j];
        const vOverlap = Math.min(seed.y1, g.y1) - Math.max(seed.y0, g.y0);
        const hGap = Math.max(seed.x0, g.x0) - Math.min(seed.x1, g.x1);
        const nearRow = vOverlap >= Math.min(seed.y1 - seed.y0, g.y1 - g.y0) * 0.4 && hGap <= 10;
        const nearLine = hGap <= 10 && Math.max(seed.x0, g.x0) <= Math.min(seed.x1, g.x1) + 10
          && Math.max(seed.y0, g.y0) - Math.min(seed.y1, g.y1) <= 8;
        if (!nearRow && !nearLine) continue;
        seed.x0 = Math.min(seed.x0, g.x0); seed.x1 = Math.max(seed.x1, g.x1);
        seed.y0 = Math.min(seed.y0, g.y0); seed.y1 = Math.max(seed.y1, g.y1);
        used[j] = 1;
        changed = true;
      }
    }
    const bw = seed.x1 - seed.x0 + 1, bh = seed.y1 - seed.y0 + 1;
    if (bw < 16 || bh < 8 || bw > 160 || bh > 60) continue;   // 太小是噪点，太大是图元
    blocks.push({ ...seed, cx: (seed.x0 + seed.x1) / 2, cy: (seed.y0 + seed.y1) / 2 });
  }
  return blocks;
}

/**
 * 以文字块为种子切房间：多种子 BFS（测地 Voronoi）。
 *
 * 每个种子向四周漫延，先到的格子归它 —— 墙体是障碍，所以同一间房会被完整包住；
 * 阳台那种「整面开口」最多只会让相邻两块各自多占一点，不会把整层吞掉。
 */
function roomsFromSeeds(walls, seeds, box, { pad = 4, minAreaRatio = 0.0008, outCost = 8 } = {}){
  if (!seeds.length || !walls.length) return [];
  const g = buildWallGrid(walls, pad);
  const { xs, ys, nx, ny, blocked } = g;
  if (nx < 2 || ny < 2) return [];
  const total = nx * ny;

  /* -2 = 未定，-1 = 室外，>=0 = 第 k 个房间种子。
   * 用「加权」BFS（桶实现的最小代价搜索）：房间每走一格算 1，室外算 3。
   * 室外必须参与竞争，否则敞开的阳台会让室内一路漫到建筑外面；
   * 但它要比房间「走得慢」，否则外墙有个缺口时它会把整间客厅吞掉。 */
  const OUT_COST = outCost;
  const label = new Int32Array(total).fill(-2);
  const buckets = [];

  const push = (c, cost, lab) => {
    if (c < 0 || blocked[c] || label[c] !== -2) return;
    label[c] = lab;
    (buckets[cost] || (buckets[cost] = [])).push(c);
  };

  // 室外源：最外圈的空格
  for (let i = 0; i < nx; i++){ push(i, 0, -1); push((ny - 1) * nx + i, 0, -1); }
  for (let j = 0; j < ny; j++){ push(j * nx, 0, -1); push(j * nx + nx - 1, 0, -1); }

  for (let k = 0; k < seeds.length; k++){
    // 种子落在格子里；落在墙上的话取最近的空格
    let best = -1, bd = Infinity;
    for (let j = 0; j < ny; j++){
      const cy = (ys[j] + ys[j + 1]) / 2;
      for (let i = 0; i < nx; i++){
        if (blocked[j * nx + i]) continue;
        const cx = (xs[i] + xs[i + 1]) / 2;
        const d = (cx - seeds[k].cx) ** 2 + (cy - seeds[k].cy) ** 2;
        if (d < bd){ bd = d; best = j * nx + i; }
      }
    }
    if (best >= 0) push(best, 0, k);
  }

  for (let cost = 0; cost < buckets.length; cost++){
    const list = buckets[cost];
    if (!list) continue;
    while (list.length){
      const c = list.pop();
      const step = label[c] >= 0 ? 1 : OUT_COST;
      const i = c % nx, j = (c / nx) | 0;
      const near = [
        i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1,
        j > 0 ? c - nx : -1, j < ny - 1 ? c + nx : -1
      ];
      for (const q of near) push(q, cost + step, label[c]);
    }
  }

  /* 修补：外墙有缺口时，室外会顺着缺口往里咬一块。
   * 把「被同一间房三面包围」的室外格子并回该房间，几轮就补平了；
   * 只从室外往房间方向修正，房间之间不会互相吞并。 */
  for (let it = 0; it < 3; it++){
    const flip = [];
    for (let c = 0; c < total; c++){
      if (label[c] !== -1 || blocked[c]) continue;
      const i = c % nx, j = (c / nx) | 0;
      const near = [
        i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1,
        j > 0 ? c - nx : -1, j < ny - 1 ? c + nx : -1
      ];
      const cnt = new Map();
      for (const q of near){
        if (q < 0 || label[q] < 0) continue;
        cnt.set(label[q], (cnt.get(label[q]) || 0) + 1);
      }
      for (const [lab, n] of cnt) if (n >= 3){ flip.push([c, lab]); break; }
    }
    if (!flip.length) break;
    for (const [c, lab] of flip) label[c] = lab;
  }

  // 只统计落在户型包围盒内的格子（开口漏出去的部分不要）
  const groups = new Map();
  for (let c = 0; c < total; c++){
    if (label[c] < 0 || blocked[c]) continue;
    const i = c % nx, j = (c / nx) | 0;
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (cx < box.x0 - 2 || cx > box.x1 + 2 || cy < box.y0 - 2 || cy > box.y1 + 2) continue;
    const arr = groups.get(label[c]);
    if (arr) arr.push({ i, j });
    else groups.set(label[c], [{ i, j }]);
  }

  const minAreaPx = Math.max(120, (box.x1 - box.x0) * (box.y1 - box.y0) * minAreaRatio);
  const rooms = [];
  for (const cells of groups.values()){
    let area = 0;
    for (const { i, j } of cells) area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    if (area < minAreaPx) continue;
    const poly = loopOf(cells, xs, ys, nx);
    if (poly.length >= 4) rooms.push({ poly, area });
  }
  return rooms;
}

/**
 * 识别主入口。
 * @param {{data:Uint8ClampedArray|Uint8Array, width:number, height:number}} img
 * @returns {{width:number,height:number,walls:Array,rooms:Array,stats:Object}}
 */
export function detectFloorPlan(img, opts = {}){
  const { data, width: w, height: h } = img;
  if (!w || !h) throw new Error('image is empty');

  const gray = toGray(data, w, h);
  const short = Math.min(w, h);

  // —— 掩膜：营销 / 渲染类户型图里墙是纯黑填充，取「最暗的一撮」最干净；
  //    如果暗像素少得可怜，说明是浅色线稿，退回自适应阈值。
  let bin, mode = 'dark';
  const dark = darkBin(gray, w, h, opts);
  if (dark.ratio < 0.0025 || dark.ratio > 0.22){
    mode = 'adaptive';
    const win = (opts.window || Math.max(11, Math.round(short / 45))) | 1;
    bin = adaptiveBin(gray, w, h, win, opts.bias ?? 12);
  } else {
    bin = dark.bin;
  }

  const minRun = opts.minRun || Math.max(5, Math.round(short / 220));
  const maxGap = Math.max(8, short * 0.02);

  // 行列两遍：粗墙两遍都能得到（后面去重），竖细线只有列扫描能拿到
  const raw = [
    ...runsToRects(bin, w, h, minRun, false),
    ...runsToRects(bin, w, h, minRun, true)
  ];

  // 去掉行列重复
  const uniq = [];
  for (const r of raw){
    if (r.x1 - r.x0 < 2 || r.y1 - r.y0 < 2) continue;
    if (uniq.some(u => iou(u, r) > 0.55)) continue;
    uniq.push(r);
  }

  // 合并后再去一次重复：行列两遍的同一段墙，合并后位置可能偏移几像素
  const merged = [];
  for (const r of mergeCollinear(pairHollow(uniq, maxGap))){
    if (merged.some(m => iou(m, r) > 0.5)) continue;
    merged.push(r);
  }

  /* 尺度相关的硬约束：墙是「又长又细」的深色条。
   *   · 最小长度：过滤文字笔画、尺寸箭头、家具小图标
   *   · 厚度上下限：太薄是尺寸线 / 家具描边，太厚是家具照片整块
   *   · 长度 / 厚度比：保证是一条条带，而不是方块 */
  const MIN_LEN = Math.max(28, Math.round(short * 0.055));
  const MIN_THICK = Math.max(3, Math.round(short * 0.0035));
  const MAX_THICK = Math.max(14, Math.round(short * 0.045));

  const band = merged
    .filter(r => {
      const L = Math.max(r.x1 - r.x0, r.y1 - r.y0);
      const t = Math.min(r.x1 - r.x0, r.y1 - r.y0);
      return L >= MIN_LEN && t >= MIN_THICK && t <= MAX_THICK && L / t >= 1.4;
    })
    .map(r => ({
      x0: Math.round(r.x0), y0: Math.round(r.y0),
      x1: Math.round(r.x1), y1: Math.round(r.y1)
    }));

  // 只留连成一片的墙体网络（家具图块是孤立的小岛）
  const keep = keepNetworks(band, Math.max(5, Math.round(short * 0.008)));
  let walls = band.filter((_, i) => keep.has(i));

  if (!walls.length)
    return { width: w, height: h, walls: [], rooms: [],
      stats: { walls: 0, rooms: 0, mode, threshold: dark.t } };

  /* P1：先把同向墙段的中心线对齐，再吸附到图上尺寸链的轴线。
   * 尺寸链是画图人给的轴线表 —— 吸附后墙位误差归零，本来错开 1~3px 的墙段也能连成一条。
   * 只吸收 snapTol 以内的偏差，所以即使刻度误检也不会把墙拉走。 */
  const [bx0, by0, bx1, by1] = bboxOfWalls(walls);
  const axes = findDimensionAxes(gray, w, h, { x0: bx0, y0: by0, x1: bx1, y1: by1 });
  const snapTol = Math.max(3, Math.round(short * 0.006));
  const centered = alignCollinear(walls, snapTol);
  const aligned = snapToAxes(centered, axes, snapTol)
    .filter(r => Math.abs(r.x1 - r.x0) >= 4 && Math.abs(r.y1 - r.y0) >= 4);

  // 吸附后相邻的同线墙段可能接上了，再合并一轮
  const merged2 = [];
  for (const r of mergeCollinear(aligned)){
    if (merged2.some(m => iou(m, r) > 0.5)) continue;
    merged2.push(r);
  }
  walls = merged2.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  // 门洞按本图比例封口（≈0.8~1.0m）：用墙厚中位数估一下比例尺
  const thickPx = walls.map(w => Math.min(w.x1 - w.x0, w.y1 - w.y0)).sort((a, b) => a - b)[Math.floor(walls.length / 2)];
  const doorPx = Math.max(12, thickPx * 8);          // 240mm 墙 → 门洞约 3.7 个墙厚，留足余量
  const gaps = bridgeGaps(walls, doorPx);

  /* 房间只要求「围合」，不要求「好看」：把细长线（窗、栏杆、玻璃推拉门）也算进围挡，
   * 否则阳台这类只有窗线的空间会把室内一起漏到室外，最后一个房间都分不出来。
   * 细线限定在墙体包围盒内，避免把图外的尺寸链也算成墙。 */
  const thin = merged
    .filter(r => {
      const L = Math.max(r.x1 - r.x0, r.y1 - r.y0);
      const t = Math.min(r.x1 - r.x0, r.y1 - r.y0);
      return t < MIN_THICK && L >= MIN_LEN
        && r.x0 >= bx0 - 14 && r.x1 <= bx1 + 14 && r.y0 >= by0 - 14 && r.y1 <= by1 + 14;
    })
    .map(r => ({ x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) }));

  const traceWalls = [...walls, ...gaps, ...thin];
  const box = { x0: bx0, y0: by0, x1: bx1, y1: by1 };

  /* 房间有两种切法：
   *   · 洪泛：只认「围合」，一旦阳台 / 厨房开口太宽就整层漏到室外；
   *   · 种子：以房间名 / 面积的文字块为种子做测地 Voronoi，开口再宽也不会把整层吞掉。
   * 两者都跑，取房间更多的那个（种子法找不到文字时自动退回洪泛）。 */
  const flooded = traceRooms(traceWalls);
  const seeds = detectTextBlocks(gray, w, h, box);
  const seeded = seeds.length >= 2
    ? roomsFromSeeds(traceWalls, seeds, box, { outCost: opts.outCost })
    : [];
  const roomsBy = seeded.length > flooded.length ? 'seed' : 'flood';
  const rooms = (roomsBy === 'seed' ? seeded : flooded)
    .map(r => ({ ...r, area: Math.round(r.area) }))
    .sort((a, b) => b.area - a.area);

  return {
    width: w, height: h, walls, rooms,
    stats: {
      walls: walls.length, rooms: rooms.length, mode,
      threshold: dark.t, thickPx, doorPx,
      axesX: axes.xs.length, axesY: axes.ys.length,
      seeds: seeds.length, roomsBy
    }
  };
}
