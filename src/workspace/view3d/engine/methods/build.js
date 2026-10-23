import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ROOMS, WALLS, WINS, DOORS, SLIDES, LINTELS, esc } from '@/core/model/plan.js';
import { areaOf, roomArea, shapePieces, pointInShape, bboxOf } from '@/core/geometry/region.js';
import { tr, nm } from '@/i18n.js';
import { mat, buildFurniture, floorMat, waterMat, box, cyl, bakeGroup } from '@/workspace/view3d/build/index.js';
import { buildWallSolid } from '@/workspace/view3d/build/wallSolid.js';
import { wallMat, isGlassMat, DEFAULT_WALL_MAT } from '@/core/library/wallMats.js';
import { wallRuns, runRect } from '@/core/nodes/derive.js';
import { isSlantedWall } from '@/core/model/wallLine.js';
import { graphFromLegacy } from '@/core/nodes/legacy.js';
import { H, wx, wz, M } from '@/workspace/view3d/coords.js';
import { DOOR_H, slideHead, DOOR_CASE, ceilLampGeo, CLIMB, CLIMB_TYPES, NO_OPENING_TYPES } from '../constants.js';

/* ---------- 楼层交界的小让位（防止共面闪烁） ----------
 * 本层墙顶 / 天花 与 上层楼板 / 上层墙体底面 在几何上本来就处在同一标高（层高平面）。
 * 两块面完全共面时，深度值相等，逐像素的浮点抖动会让它们互相抢占 → 看到「一圈闪面」。
 * 这里统一让出十几毫米（相对 2.8m 层高 ≈ 0.4%，肉眼不可见，但远大于深度缓冲的量化误差）：
 *   · LV_SEAM   ：墙体上沿比层顶低 12mm（墙顶面不再与上层楼板共面）
 *   · LV_OVERLAP：墙体下沿比楼面多探 30mm（上层墙压住下层墙顶，避免出现细缝）
 *   · CEIL_GAP  ：天花下沉 28mm（不再与上层楼板共面，且低于墙顶 16mm，墙顶截面不会露在天花之上）
 * 地下层的墙顶与「一层楼板」正是这种关系：原来只让 4mm，远看/俯视时深度精度不够仍会打架。 */
const LV_SEAM = .012;
const LV_OVERLAP = .03;
const CEIL_GAP = .028;

/* 节点级整段墙（Shape 带洞 + 一次挤出）。
 * 出问题时可改成 false，立刻回退到原来的「盒子分段 + 过梁拼补」路径。 */
const USE_SOLID_WALLS = true;

/* 高频重复构件：同型同色同尺寸达到阈值后改走 InstancedMesh。
 * 树 / 灌木 / 车是沙盘里最容易被复制上百次的一类，逐件 Group 会让 draw call 线性上涨。 */
const INST_TYPES = new Set([
  'ginkgo', 'cherry', 'osmanthus', 'camphor', 'zelkova', 'tallow', 'palm', 'bamboo',
  'shrub', 'car', 'suv', 'mpv'
]);
const INST_MIN = 6;
const TREE_TYPES = new Set([
  'ginkgo', 'cherry', 'osmanthus', 'camphor', 'zelkova', 'tallow', 'palm', 'bamboo',
  'treegrid', 'streetrow'
]);

/* View3D.prototype 的方法组：由 engine.js 统一挂载 */
export const buildMethods = {
  clearGroup(g){
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();        // 草坪草簇的实例缓冲
    });
    g.clear();
  },

  /** 只生成一段实体方块（不加漫游棱线 / 踢脚线），用于其它楼层的窗台墙 / 窗上墙 */
  blockBox(r, yb, yt, m){
    if (yt - yb <= .001) return null;
    const [x0, y0, x1, y1] = r;
    const o = new THREE.Mesh(new THREE.BoxGeometry(M(x1 - x0), yt - yb, M(y1 - y0)), m);
    o.position.set(wx((x0 + x1)/2), (yb + yt)/2, wz((y0 + y1)/2));
    o.castShadow = o.receiveShadow = true;
    return o;
  },

  /** 其它楼层的平开门门扇（默认打开）：简单门板，避免整栋视图里门洞看起来是镂空 */
  ghostDoorLeaf(d, top){
    const [x0, y0, x1, y1] = d.rect;
    const hz = (x1 - x0) >= (y1 - y0);
    const L = M(hz ? x1 - x0 : y1 - y0);
    const h = Math.min(DOOR_H, top);
    const nLeaf = d.dbl ? 2 : 1;
    const lw = Math.max((L - 2*DOOR_CASE - .004)/nLeaf, .2);
    const lh = Math.max(h - (h > 2 ? DOOR_CASE : 0), .2);
    const hinges = [[d.h[0], d.h[1], d.c]];
    if (d.dbl){
      const h2 = hz
        ? [Math.abs(d.h[0] - x0) <= Math.abs(d.h[0] - x1) ? x1 : x0, d.h[1]]
        : [d.h[0], Math.abs(d.h[1] - y0) <= Math.abs(d.h[1] - y1) ? y1 : y0];
      hinges.push([h2[0], h2[1], [-d.c[0], -d.c[1]]]);
    }
    const m = mat(d.entry ? '#8b6b4c' : '#dccab0', { roughness: .55 });
    const out = [];
    for (const [hx, hy, c] of hinges){
      const door = new THREE.Group();
      door.position.set(wx(hx), 0, wz(hy));          // 铰点
      const a0 = Math.atan2(-c[1], c[0]);
      let a1 = Math.atan2(-d.o[1], d.o[0]);
      a1 = a0 + Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));   // 取最短旋转
      door.rotation.y = a1;                          // 默认打开
      const leaf = new THREE.Group();
      leaf.position.x = DOOR_CASE + .002 + lw/2;
      leaf.add(box(lw, lh, .042, m, 0, 0, 0));
      door.add(leaf);
      out.push(door);
    }
    return out;
  },

  /** 其它楼层的推拉门：整扇玻璃（关闭态），避免外墙出现大洞 */
  ghostSlide(d, top){
    const [x0, y0, x1, y1] = d.rect;
    const hz = (x1 - x0) >= (y1 - y0);
    const L = M(hz ? x1 - x0 : y1 - y0);
    const h = Math.min(slideHead(d), top);
    if (h <= .05) return null;
    const cx = wx((x0 + x1)/2), cz = wz((y0 + y1)/2);
    const g = new THREE.Group();
    const pane = box(hz ? L - .04 : .012, h - .1, hz ? .012 : L - .04, this.glassMat, cx, .05, cz);
    pane.castShadow = pane.receiveShadow = false;
    g.add(pane);
    [.02, h - .04].forEach(y => {
      g.add(box(hz ? L : .05, .04, hz ? .05 : L, this.frameMat, cx, y, cz));
    });
    return g;
  },

  /** 窗户玻璃 + 铝框（sill / head 与窗体一致），可加到任意楼层分组里 */
  windowGlass(r, i, top, group = this.archUp){
    const sill = i === 0 ? 1.4 : i >= 6 ? .45 : .9, head = 2.4;
    const gTop = Math.min(head, top);
    if (gTop <= sill) return;
    const [x0, y0, x1, y1] = r;
    const hz = (x1 - x0) >= (y1 - y0);
    const L = M(hz ? x1 - x0 : y1 - y0), gh = gTop - sill;
    const cx = wx((x0 + x1)/2), cz = wz((y0 + y1)/2);
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(hz ? L : .01, gh, hz ? .01 : L), this.glassMat);
    pane.position.set(cx, sill + gh/2, cz);
    pane.castShadow = pane.receiveShadow = false;
    group.add(pane);
    const n = Math.max(1, Math.round(L/.9));
    for (let k = 0; k <= n; k++){
      const t = -L/2 + k*L/n;
      const mu = new THREE.Mesh(
        new THREE.BoxGeometry(hz ? .04 : .06, gh, hz ? .06 : .04), this.frameMat);
      mu.position.set(cx + (hz ? t : 0), sill + gh/2, cz + (hz ? 0 : t));
      mu.castShadow = true;
      group.add(mu);
    }
    [sill + .02, gTop - .02].forEach(y => {
      const tr = new THREE.Mesh(
        new THREE.BoxGeometry(hz ? L : .06, .04, hz ? .06 : L), this.frameMat);
      tr.position.set(cx, y, cz);
      group.add(tr);
    });
  },

  /** 某段墙是否按玻璃建模：旧存档的 'g' 玻璃墙面，或非承重墙把材质选成了玻璃 */
  wallIsGlass(w, i){
    if (w[4] === 'g') return true;
    return isGlassMat(this.plan.wallMatId?.(i));
  },

  /** 墙面材质 → 墙盒六面材质；默认材质返回 null（沿用 wallBox 内置材质，保持原观感 / 投影） */
  wallFaceMat(i){
    const m = wallMat(this.plan.wallMatId?.(i));
    if (m.id === DEFAULT_WALL_MAT) return null;
    const base = mat(m.color, { roughness: m.rough, metalness: m.metal || 0 });
    return [base, base, this.capMat, base, base, base];
  },

  wallBox(r, yb, yt, m){
    if (yt - yb <= .001) return;
    const [x0, y0, x1, y1] = r;
    const o = new THREE.Mesh(
      new THREE.BoxGeometry(M(x1 - x0), yt - yb, M(y1 - y0)),
      m || [this.wallMat, this.wallMat, this.capMat, this.wallMat, this.wallMat, this.wallMat]
    );
    o.position.set(wx((x0 + x1)/2), (yb + yt)/2, wz((y0 + y1)/2));
    o.castShadow = o.receiveShadow = true;
    if (m === this.wallAlphaMat){                      // 半透明外墙不投实阴影
      o.castShadow = false; o.receiveShadow = false;
    }
    this.archUp.add(o);

    // 漫游辅助：墙体棱线 + 踢脚线，让相邻墙面、墙角一眼可分（仅漫游模式显示）
    const ln = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry), this.edgeMat);
    ln.position.copy(o.position);
    ln.userData.walkOnly = true;
    ln.visible = this.uiStore.opt.mode === 'walk';
    this.archUp.add(ln);

    if (yb <= .001){
      const p = o.geometry.parameters, sh = Math.min(.12, yt);
      const sk = new THREE.Mesh(new THREE.BoxGeometry(p.width + .02, sh, p.depth + .02), this.skirtMat);
      sk.position.set(o.position.x, sh/2, o.position.z);
      sk.userData.walkOnly = true;
      sk.visible = this.uiStore.opt.mode === 'walk';
      this.archUp.add(sk);
    }
  },

  /* ======================= 节点级墙体（整段 + 真洞口） =======================
   * 由 core/nodes/derive.js 把「被门窗切开的墙段」重新合并成整段墙，
   * 每段墙只生成 1 个挤出体（立面轮廓带洞），因此：
   *   · 不再需要「左墙 + 右墙 + 过梁」三段拼补，墙面 / 墙顶连续无拼缝；
   *   · 洞口是真的洞，窗台墙 / 窗上墙由墙体自身提供，不单独补盒子；
   *   · 同一面墙签名不变时直接复用 mesh —— 改家具 / 改地面不会重建墙体。
   * 玻璃墙（裸玻璃或玻璃材质）仍走原来的盒子 + 铝框路径。 */
  syncWalls(runs, { top, levelH, alpha } = {}){
    const group = this.wallG;
    if (!group) return;
    const live = new Set();
    const walk = this.uiStore.opt.mode === 'walk';

    for (const run of runs){
      const rect = runRect(run);
      const seeThrough = !!alpha && this.outerWallOf(rect, ROOMS);
      const first = run.wallIds[0];
      const matId = this.plan.wallMatId?.(first) || DEFAULT_WALL_MAT;
      const yt = run.low ? Math.min(1, top) : top;
      // 斜墙没有 span/c 这一维身份，几何签名必须带上中心线（否则改角度不重建）
      const sig = JSON.stringify([run.span, run.c, run.line, run.deg, run.thickness, run.holes, matId, yt, walk, seeThrough]);

      live.add(run.id);
      const cur = this.wallCache.get(run.id);
      if (cur && cur.sig === sig){
        group.add(cur.group);                    // 签名未变：直接复用，不再三角化
      } else {
        if (cur){ this.disposeGroup(cur.group); this.wallCache.delete(run.id); }
        const face = this.wallFaceMat(first);
        const wallMaterial = seeThrough ? this.wallAlphaMat : (Array.isArray(face) ? face[0] : (face || this.wallMat));
        const g = buildWallSolid(run, {
          yb: -LV_OVERLAP, yt, wallMat: wallMaterial, capMat: this.capMat,
          alpha: seeThrough, walk, edgeMat: this.edgeMat
        });
        if (g){
          group.add(g);
          this.wallCache.set(run.id, { sig, group: g });
        }
      }

      // 上方是夹层挑空：外墙通高到夹层顶（双层高空间）。
      // 这段走 archUp，每次 buildArch 都会清空，所以不能放进缓存分支里。
      if (this.isLoftAbove && run.kind === 'e')
        this.wallBox(rect, top - LV_OVERLAP, levelH + this.loftClearH, seeThrough ? this.wallAlphaMat : undefined);
    }

    // 已经不存在的墙：回收几何（材质是共享的，不能 dispose）
    for (const [id, cur] of [...this.wallCache]){
      if (live.has(id)) continue;
      this.disposeGroup(cur.group);
      this.wallCache.delete(id);
    }
  },

  /** 只释放几何，不动共享材质 */
  disposeGroup(g){
    if (!g) return;
    g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    g.removeFromParent();
  },

  /**
   * 玻璃填充（yb → yt 一段）：铝框（上下横梃 + 两端立梃 + 竖梃）+ 整片玻璃。
   * 既用于整段玻璃墙面，也用于玻璃门洞上方的玻璃过梁。
   */
  glassFill(r, yb = 0, yt = H){
    const h = yt - yb;
    if (h <= .04) return;
    const [x0, y0, x1, y1] = r;
    const hz = (x1 - x0) >= (y1 - y0);
    const L = M(hz ? x1 - x0 : y1 - y0);          // 沿墙长度
    const T = M(hz ? y1 - y0 : x1 - x0);          // 墙厚
    const g = new THREE.Group();
    g.position.set(wx((x0 + x1)/2), 0, wz((y0 + y1)/2));
    if (!hz) g.rotation.y = -Math.PI/2;            // 局部 +x 对齐墙的长轴
    const fm = this.frameMat, fw = .045, fd = Math.max(T, .03);
    g.add(box(L, .05, fd + .006, fm, 0, yb, 0));                              // 下横梃
    if (h > .1) g.add(box(L, .05, fd + .006, fm, 0, yt - .05, 0));            // 上横梃
    [-1, 1].forEach(s => g.add(box(fw, h, fd + .006, fm, s*(L/2 - fw/2), yb, 0)));
    const n = Math.max(1, Math.round(L/1.1));                                 // 约每 1.1 m 一道竖梃
    for (let k = 1; k < n; k++)
      g.add(box(fw*.55, Math.max(h - .1, .02), fd, fm, -L/2 + L*k/n, yb + .05, 0));
    const glass = box(Math.max(L - 2*fw, .02), Math.max(h - .1, .02), .012, this.glassMat, 0, yb + .05, 0);
    glass.castShadow = glass.receiveShadow = false;                           // 玻璃不投影
    g.add(glass);
    this.archUp.add(g);
  },

  /** 玻璃墙面：整段通高的纯玻璃，不加边框 / 竖梃（剖切高度沿用 top） */
  glassWall(r, top){
    const h = Math.min(top, H);
    if (h <= .04) return;
    const [x0, y0, x1, y1] = r;
    const hz = (x1 - x0) >= (y1 - y0);
    const L = M(hz ? x1 - x0 : y1 - y0);        // 沿墙长度
    const T = M(hz ? y1 - y0 : x1 - x0);        // 墙厚
    const g = new THREE.Group();
    g.position.set(wx((x0 + x1)/2), 0, wz((y0 + y1)/2));
    if (!hz) g.rotation.y = -Math.PI/2;         // 局部 +x 对齐墙的长轴
    // 薄板玻璃（12–30mm）：太厚会因双面透明叠加看起来像磨砂实体
    const glass = box(L, h, Math.min(Math.max(T * .25, .012), .03), this.glassMat, 0, 0, 0);
    glass.castShadow = glass.receiveShadow = false;   // 玻璃不投影
    g.add(glass);
    this.archUp.add(g);
  },

  /** 家具的占地矩形 → 平面多边形（考虑旋转），用于在地面上开梯井 */
  rotRectPoly(f){
    const a = f.rot*Math.PI/180, c = Math.cos(a), s = Math.sin(a);
    const hw = f.w/2, hd = f.d/2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
      .map(([x, y]) => [f.cx + x*c - y*s, f.cy + x*s + y*c]);
  },

  /**
   * 下行楼梯的梯井：完全开放 —— 不加井壁、不加洞口收边，
   * 只铺一块下层地坪，避免从洞口看穿到场景背景。
   * 栏杆 / 扶手全部由楼梯 / 扶梯自身模型提供。
   */
  addWell(f){
    const W = M(f.w), D = M(f.d);
    const g = new THREE.Group();
    g.position.set(wx(f.cx), 0, wz(f.cy));
    g.rotation.y = -f.rot*Math.PI/180;
    g.add(box(W - .02, .04, D - .02, mat('#3a3733', { roughness: .95 }), 0, -H, 0));
    this.archFloor.add(g);
  },

  /** 洞口某一端「同走向、同一条墙线且首尾相接」的墙体类型（读不到返回 null） */
  adjWallType(r, hz, at, isLo){
    const BAND = 12, TOL = 2;
    let best = null;
    for (let k = 0; k < WALLS.length; k++){
      if (this.plan.state.demolished.includes('w' + k)) continue;
      const w = WALLS[k];
      const wx0 = Math.min(w[0], w[2]), wx1 = Math.max(w[0], w[2]);
      const wy0 = Math.min(w[1], w[3]), wy1 = Math.max(w[1], w[3]);
      if (((wx1 - wx0) >= (wy1 - wy0)) !== hz) continue;         // 走向需一致
      const aligned = hz
        ? Math.abs(wy0 - r[1]) <= BAND && Math.abs(wy1 - r[3]) <= BAND
        : Math.abs(wx0 - r[0]) <= BAND && Math.abs(wx1 - r[2]) <= BAND;
      if (!aligned) continue;
      const wa0 = hz ? wx0 : wy0, wa1 = hz ? wx1 : wy1;
      if (isLo ? Math.abs(wa1 - at) <= TOL : Math.abs(wa0 - at) <= TOL)
        best = this.wallIsGlass(w, k) ? 'g' : w[4];
    }
    return best;
  },

  /**
   * 洞口某一侧紧邻的墙体（探点法）：
   * 沿墙轴向外取 20 / 60 / 150 mm 三个距离、厚度方向取中线与 ±1/4 厚三个位置，
   * 第一个被某段未拆除墙体覆盖的点即为该侧的墙 —— 这样即使玻璃墙比原洞口薄、
   * 且居中原墙线（240 墙上叠 120 玻璃），也不会因为「厚度带对不上」而漏判。
   * 返回 { type, t }（t = 墙厚 mm），读不到返回 null。
   */
  sideWallInfo(r, hz, at, dir){
    const mid = hz ? (r[1] + r[3])/2 : (r[0] + r[2])/2;
    const T = hz ? (r[3] - r[1]) : (r[2] - r[0]);
    const offs = [0, -T/4, T/4];
    for (const dist of [20, 60, 150]){
      const a = at + dir*dist;
      for (const o of offs){
        const cx = hz ? a : mid + o;
        const cy = hz ? mid + o : a;
        let best = null;
        for (let k = 0; k < WALLS.length; k++){
          if (this.plan.state.demolished.includes('w' + k)) continue;
          const w = WALLS[k];
          const x0 = Math.min(w[0], w[2]), x1 = Math.max(w[0], w[2]);
          const y0 = Math.min(w[1], w[3]), y1 = Math.max(w[1], w[3]);
          if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
          const area = (x1 - x0)*(y1 - y0);
          if (!best || area < best.area)
            best = { type: this.wallIsGlass(w, k) ? 'g' : w[4], area, t: Math.min(x1 - x0, y1 - y0) };
        }
        if (best) return { type: best.type, t: best.t };
      }
    }
    return null;
  },

  /** 洞口左右两侧是否都是玻璃墙面；是则返回玻璃墙厚度（mm），否则返回 0 */
  glassSided(rect){
    const [x0, y0, x1, y1] = rect;
    const r = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    const hz = (r[2] - r[0]) >= (r[3] - r[1]);
    const a0 = hz ? r[0] : r[1], a1 = hz ? r[2] : r[3];
    const lo = this.sideWallInfo(r, hz, a0, -1) || { type: this.adjWallType(r, hz, a0, true) };
    const hi = this.sideWallInfo(r, hz, a1, +1) || { type: this.adjWallType(r, hz, a1, false) };
    if (lo.type !== 'g' || hi.type !== 'g') return 0;
    return Math.min(lo.t || 120, hi.t || 120);
  },

  glassDoor(i){ return DOORS[i] ? this.glassSided(DOORS[i].rect) : 0; },
  glassSlide(i){ return SLIDES[i] ? this.glassSided(SLIDES[i].rect) : 0; },

  /** 把洞口矩形在厚度方向收成 t 厚、居中原墙线（让门套 / 过梁与玻璃墙对齐） */
  slimRect(r, t){
    const [x0, y0, x1, y1] = r;
    if ((x1 - x0) >= (y1 - y0)){
      const cy = (y0 + y1)/2;
      return [x0, Math.round(cy - t/2), x1, Math.round(cy + t/2)];
    }
    const cx = (x0 + x1)/2;
    return [Math.round(cx - t/2), y0, Math.round(cx + t/2), y1];
  },

  /** 多边形 → three.js Shape（holes：区域被挖掉的部分） */
  shapeOf(poly, flip, holes){
    const trace = (ring, s) => ring.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](wx(x), flip ? wz(y) : -wz(y)));
    const s = new THREE.Shape();
    trace(poly, s);
    for (const h of holes || []){
      const p = new THREE.Path();
      trace(h, p);
      s.holes.push(p);
    }
    return s;
  },

  /** 天花洞口：剔除「楼板开洞」（下层楼梯的上楼区域）—— 它只在楼板上，天花保持完整 */
  ceilingHoles(r, holes){
    const skip = new Set((r?.openings || []).map(h => JSON.stringify(h)));
    return (holes || []).filter(h => !skip.has(JSON.stringify(h)));
  },

  /** 墙体是否围护外墙：沿厚度方向两侧探房间，至少一侧在室外（户外区域不算室内） */
  outerWallOf(w, rooms){
    const x0 = Math.min(w[0], w[2]), x1 = Math.max(w[0], w[2]);
    const y0 = Math.min(w[1], w[3]), y1 = Math.max(w[1], w[3]);
    const horiz = (x1 - x0) >= (y1 - y0);
    const t = horiz ? (y1 - y0) : (x1 - x0);
    const cx = (x0 + x1)/2, cy = (y0 + y1)/2;
    const hit = (dx, dy) => (rooms || []).some(r =>
      !r.outdoor && r.poly && r.poly.length >= 3 && pointInShape(cx + dx, cy + dy, r));
    const d1 = t/2 + 40, d2 = t/2 + 220;
    const a = horiz ? hit(0, -d1) || hit(0, -d2) : hit(-d1, 0) || hit(-d2, 0);
    const b = horiz ? hit(0, d1) || hit(0, d2) : hit(d1, 0) || hit(d2, 0);
    return !a || !b;
  },

  /** 漫游时楼板需要从下往上看（充当天花面）：用双面材质，按材质缓存 */
  floorMatFor(kind, walk){
    if (!walk) return floorMat(kind, this.renderer);
    this._floor2 = this._floor2 || new Map();
    if (!this._floor2.has(kind)){
      const m = floorMat(kind, this.renderer).clone();
      m.side = THREE.DoubleSide;
      this._floor2.set(kind, m);
    }
    return this._floor2.get(kind);
  },

  /* ---------- 地面材质对应的 3D 模型 ---------- */

  /** 草坪：成片的草簇（InstancedMesh，按面积控制数量）；按房间的实际几何块铺 */
  addLawn(r, y = 0){
    for (const pc of shapePieces(r)) this.addLawnPiece(pc, y);
  },

  addLawnPiece(pc, y = 0){
    const bb = bboxOf(pc), area = areaOf(pc);
    if (!bb || area <= 0) return;
    const count = Math.max(16, Math.min(900, Math.round(area*70)));
    const inst = new THREE.InstancedMesh(
      new THREE.ConeGeometry(.018, .085, 3, 1, true),
      mat('#7fae55', { roughness: 1, side: THREE.DoubleSide }), count);
    const d = new THREE.Object3D();
    let n = 0, seed = 20240607 + Math.round(area*97);
    const rnd = () => { seed = (seed*16807) % 2147483647; return seed/2147483647; };
    for (let k = 0; k < count*8 && n < count; k++){
      const x = bb[0] + rnd()*(bb[2] - bb[0]);
      const yy = bb[1] + rnd()*(bb[3] - bb[1]);
      if (!pointInShape(x, yy, pc)) continue;
      d.position.set(wx(x), y + .042, wz(yy));
      d.rotation.set(0, rnd()*Math.PI*2, (rnd() - .5)*.25);
      d.scale.setScalar(.7 + rnd()*.7);
      d.updateMatrix();
      inst.setMatrixAt(n++, d.matrix);
    }
    inst.count = n;
    inst.receiveShadow = true;
    this.archFloor.add(inst);

    // 零星小花
    const flowerM = mat('#f2e6a6', { roughness: .8 });
    for (let k = 0; k < 6; k++){
      const x = bb[0] + rnd()*(bb[2] - bb[0]);
      const yy = bb[1] + rnd()*(bb[3] - bb[1]);
      if (!pointInShape(x, yy, pc)) continue;
      const f = new THREE.Mesh(new THREE.SphereGeometry(.016, 8, 6), flowerM);
      f.position.set(wx(x), y + .075, wz(yy));
      this.archFloor.add(f);
    }
  },

  /** 池塘：水面 + 石质池沿 + 睡莲叶（水面贴图在动画循环里缓慢流动） */
  addPond(r, y = 0){
    for (const pc of shapePieces(r)) this.addPondPiece(pc, y);
  },

  addPondPiece(pc, y = 0){
    const holes = pc.holes || [];
    const wg = new THREE.ShapeGeometry(this.shapeOf(pc.poly, false, holes));
    wg.rotateX(-Math.PI/2);
    const wm = waterMat();
    const water = new THREE.Mesh(wg, wm);
    water.position.y = y + .016;
    water.receiveShadow = true;
    this.archFloor.add(water);
    this.waterTex = wm.userData.tex;

    // 池沿：沿轮廓（含洞）压一圈石条，把水面与地面之间的高差收口
    const rimM = mat('#a9a29a', { roughness: .85 });
    for (const ring of [pc.poly, ...holes]){
      for (let i = 0; i < ring.length; i++){
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 60) continue;
        const rim = new THREE.Mesh(new THREE.BoxGeometry(M(len) + .12, .07, .12), rimM);
        rim.position.set(wx((a[0] + b[0])/2), y + .035, wz((a[1] + b[1])/2));
        rim.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        rim.castShadow = rim.receiveShadow = true;
        this.archFloor.add(rim);
      }
    }

    // 睡莲叶
    const bb = bboxOf(pc), padM = mat('#6d9b52', { roughness: .8 });
    for (let k = 0; k < 3; k++){
      const x = bb[0] + (.24 + .21*k)*(bb[2] - bb[0]);
      const yy = bb[1] + (.34 + .18*k)*(bb[3] - bb[1]);
      if (!pointInShape(x, yy, pc)) continue;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .008, 18), padM);
      pad.position.set(wx(x), y + .02, wz(yy));
      pad.receiveShadow = true;
      this.archFloor.add(pad);
    }
  },

  /** 柏油路：按路宽自动分车道，绘制白色边线 / 车道虚线 / 黄色中线 */
  addRoad(r, y = 0){
    for (const pc of shapePieces(r)) this.addRoadPiece(pc, y);
  },

  addRoadPiece(pc, y = 0){
    const bb = bboxOf(pc);
    if (!bb) return;
    const [x0, y0, x1, y1] = bb;
    const horiz = (x1 - x0) >= (y1 - y0);          // 道路走向（长轴）
    const wid = horiz ? y1 - y0 : x1 - x0;         // 路宽
    const cc  = horiz ? (y0 + y1)/2 : (x0 + x1)/2; // 中线位置
    const a0  = (horiz ? x0 : y0) + 320;
    const a1  = (horiz ? x1 : y1) - 320;
    if (wid < 1200 || a1 - a0 < 500) return;

    const EDGE = 220, LW = 150;                    // 边线距路缘 / 标线宽
    const white  = mat('#eceae2', { roughness: .72 });
    const yellow = mat('#e2b43a', { roughness: .68 });
    const Y = y + .006;                            // 略高于路面，避免 z-fighting

    // 沿长轴铺一段标线：short = 短轴相对中线的偏移，长轴范围 [p0,p1]
    const bar = (p0, p1, short, w, m) => {
      if (p1 - p0 < 60) return;
      const lx = (p0 + p1)/2, ly = cc + short;
      const px = horiz ? lx : ly;
      const py = horiz ? ly : lx;
      if (!pointInShape(px, py, pc)) return;       // 只画在区域内部
      const g = new THREE.PlaneGeometry(M(horiz ? p1 - p0 : w), M(horiz ? w : p1 - p0));
      g.rotateX(-Math.PI/2);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(wx(px), Y, wz(py));
      mesh.receiveShadow = true;
      this.archFloor.add(mesh);
    };
    // 实线 / 虚线（虚线 4m 画、6m 空，符合城市道路习惯）
    // 实线分段绘制（1.2m/段）：不规则区域只画「确实落在路面上」的部分，不会整条丢失
    const line = (short, m, dash = 0) => {
      if (!dash){
        const CH = 1200;
        for (let p = a0; p < a1; p += CH) bar(p, Math.min(p + CH, a1), short, LW, m);
        return;
      }
      for (let p = a0; p < a1; p += dash + 6000) bar(p, Math.min(p + dash, a1), short, LW, m);
    };

    // 窄路（≤ 4.5 m）：单车道，只画两侧白色边线（不画中线 / 车道分界）
    if (wid <= 4500){
      line(-(wid/2 - 150), white);
      line( wid/2 - 150,  white);
      return;
    }

    // 双向道路取偶数车道（按每条 3.4 m 估算），再按实际路宽均分
    let lanes = Math.max(2, Math.round(wid / 3400));
    if (lanes % 2) lanes += 1;
    const laneW = (wid - EDGE*2) / lanes;
    const edge  = wid/2 - EDGE;

    // 两侧边线（白色实线）
    line(-edge, white);
    line( edge, white);

    // 车道分界：中间黄色（窄路单黄虚线 / 宽路双黄实线），其余白色虚线
    for (let i = 1; i < lanes; i++){
      const short = -edge + laneW * i;
      if (Math.abs(short) < 1){
        if (wid <= 7600) line(0, yellow, 4000);
        else { line(-90, yellow); line(90, yellow); }
      } else {
        line(short, white, 4000);
      }
    }
  },

  buildArch(){
    this.clearGroup(this.archFloor);
    this.clearGroup(this.archUp);
    this.lampG.clear();
    this.doors.length = 0;
    this.slides.length = 0;
    this.colliders = [];
    this.ceils = [];
    this.ceilOn = true;
    this.lampLights = 0;

    // 当前楼层整体抬到其标高；地面拾取平面也随之抬高到该层楼面
    const meta = this.plan.activeLevelMeta?.();
    this.activeElev = (meta?.elev || 0) / 1000;
    this.activeLevelH = (meta?.clearH || 2800) / 1000;     // 本层净高（loft 可能低于 2.8m）
    const levelH = this.activeLevelH;
    const cutTop = Math.min(this.uiStore.opt.cut, levelH);        // 剖切平面（天花 / 顶灯是否显示的判据）
    const top = Math.max(.05, cutTop - LV_SEAM);                  // 实体上沿：比层顶低 4mm
    this.activeRoot.position.y = this.activeElev;
    this.ground0.constant = -this.activeElev;

    // 上方相邻层若是夹层（loft）或含「挑空」房间：本层天花在此开口，且外墙通高
    const lvls = this.plan.state.levels || [];
    const aboveMeta = lvls
      .filter(l => (l.elev || 0) > (meta?.elev || 0))
      .sort((a, b) => (a.elev || 0) - (b.elev || 0))[0];
    let aboveSnap = null, plateRooms = [], hasVoid = false;
    if (aboveMeta){
      aboveSnap = this.plan.levelSnapshots?.().find(s => s.level.id === aboveMeta.id);
      const rooms = aboveSnap?.rooms || [];
      const matOf = id => aboveSnap?.roomsMeta?.[id]?.mat || 'tile800';
      plateRooms = rooms.filter(r => matOf(r.id) !== 'void');     // 挑空房间从楼板中扣除
      hasVoid = rooms.some(r => matOf(r.id) === 'void');
    }
    this.isLoftAbove = !!aboveMeta && (aboveMeta.kind === 'loft' || hasVoid);
    this.loftClearH = this.isLoftAbove ? Math.min(aboveMeta.clearH || 2200, 3200) / 1000 : 0;
    if (this.isLoftAbove){
      const regs = plateRooms.filter(r => r.region);
      this.loftRooms = regs.length ? regs : plateRooms.filter(r => !r.region);
    } else {
      this.loftRooms = [];
    }

    /* 下行楼梯 / 扶梯：楼地面要开洞（梯井），洞口即家具的旋转矩形 */
    const wells = this.plan.state.furniture.filter(f => CLIMB_TYPES.has(f.type) && !NO_OPENING_TYPES.has(f.type) && (f.sdir ?? 1) < 0);
    const wellRings = wells.map(f => this.rotRectPoly(f));
    /* 室外大地面（y = -15mm）的显隐：
     *   · 有梯井 / 正在看地下层 / 关掉「地面」→ 藏起；
     *   · 有地下层或下沉坡道 → 藏起，改由 buildSite 画「一整片带洞的大地面」
     *     （洞 = 基坑 + 坡道槽），这样地面连续、坡道不被盖住。 */
    const hasBase = (this.plan.state.levels || []).some(l => (l.elev || 0) < -.001);
    // 有下沉坡道（任何一层）时，地面也要改由 buildSite 的「带洞地面」来画
    const hasRamp = (this.plan.levelSnapshots?.() || [])
      .some(s => (s.furniture || []).some(f => f.type === 'ramp' && (f.sdir ?? 1) < 0));
    if (this.ground){
      this.ground.visible = !!this.uiStore.opt.site && wells.length === 0
        && this.activeElev >= -.001 && !hasBase && !hasRamp;
    }

    this.waterTex = null;
    ROOMS.forEach(r => {
      const kind = this.plan.state.rooms[r.id]?.mat || 'tile800';
      if (kind === 'void') return;                    // 挑空：无地板 / 天花，向下层敞开
      // 漫游时楼板同时充当下层的天花：双面材质，从下方也能看到
      const m = this.floorMatFor(kind, this.uiStore.opt.mode === 'walk');
      const bay = r.counted === false && !r.outdoor;   // 飘窗是 0.45m 台体；户外区域（入户走廊）仍是地面
      const isRegion = !!r.region;
      // 区域叠在房间地面之上：默认抬高 8mm 避免 z-fighting；人行道 / 路缘石等可用 r.lift（mm）做高差
      const lift = isRegion ? (r.lift != null ? r.lift/1000 : .008) : 0;

      // 房间被区域覆盖后可能被切成多块：逐块铺地面 / 天花
      for (const pc of shapePieces(r)){
        const holes = [...(pc.holes || [])];
        if (wellRings.length){
          const base = { poly: pc.poly, holes: pc.holes || [] };
          // 只把完全落在这一块内的梯井挖掉，避免三角化出错
          for (const ring of wellRings)
            if (ring.every(([x, y]) => pointInShape(x, y, base))) holes.push(ring);
        }
        const geo = bay
          ? new THREE.ExtrudeGeometry(this.shapeOf(pc.poly, false, holes), { depth: .45, bevelEnabled: false })
          : new THREE.ShapeGeometry(this.shapeOf(pc.poly, false, holes));
        geo.rotateX(-Math.PI/2);
        const fl = new THREE.Mesh(geo, bay ? [m, mat('#e9e4da')] : m);
        fl.receiveShadow = true;
        fl.position.y = lift;
        fl.userData.room = r.id;
        if (bay){ fl.castShadow = true; this.archUp.add(fl); }
        else this.archFloor.add(fl);

        // 区域通常只是地面分区、不做天花；但夹层以区域作为楼板时需要做天花
        if (isRegion && meta?.kind !== 'loft') continue;
        // 天花：法线朝下，只在室内仰视时可见；上方是夹层挑空时不做天花（双层通高）
        if (this.isLoftAbove) continue;
        // 天花不跟楼板开洞：楼梯洞口只切地面，天花保持完整
        const cg = new THREE.ShapeGeometry(this.shapeOf(pc.poly, true, this.ceilingHoles(r, pc.holes)));
        cg.rotateX(Math.PI/2);
        const ceil = new THREE.Mesh(cg, mat('#fbfaf7', { roughness: 1 }));
        ceil.position.y = levelH - CEIL_GAP;                  // 让出 16mm：不与上层楼板共面
        ceil.visible = cutTop >= levelH - .001;
        this.ceils.push(ceil);
        this.archUp.add(ceil);
      }

      // 草坪 / 池塘 / 柏油路：在地面之上再叠对应的 3D 模型
      if (kind === 'lawn') this.addLawn(r, lift);
      else if (kind === 'pond') this.addPond(r, lift);
      else if (kind === 'asphalt') this.addRoad(r, lift);
    });

    // 上方是夹层：只在夹层楼板（其保留房间）下方做天花，其余为挑空
    if (this.isLoftAbove){
      const cm = mat('#fbfaf7', { roughness: 1 });
      for (const r of this.loftRooms){
        if (!r.poly || r.poly.length < 3) continue;
        const cg = new THREE.ShapeGeometry(this.shapeOf(r.poly, true, r.holes || []));
        cg.rotateX(Math.PI/2);
        const ceil = new THREE.Mesh(cg, cm);
        ceil.position.y = levelH - CEIL_GAP;
        ceil.visible = cutTop >= levelH - .001;
        this.ceils.push(ceil);
        this.archUp.add(ceil);
      }
    }

    // 本层是夹层：沿楼板临边加栏杆（不在墙上的边）
    // 夹层使用独立几何（没有一层墙体），外轮廓处仍需跳过建筑外墙，避免沿外墙再排一圈栏杆
    if (meta?.kind === 'loft'){
      const liveWalls = WALLS.filter((w, i) => !this.plan.state.demolished.includes('w' + i));
      const envWalls = this.plan.baseWalls?.() || [];
      this.addRailingsTo(this.archUp, ROOMS, [...liveWalls, ...envWalls], mat('#6b543f', { roughness: .6 }));
    }

    // 顶灯 / 点光源（白天只挂最大的几个房间省开销，夜景全部点亮）→ 独立方法，切夜景时重建
    this.buildLamps(cutTop, levelH);

    // 梯井：井壁 + 井底 + 洞口收边
    wells.forEach(f => this.addWell(f));

    // 门槛（已删除的门窗不生成）
    const gone = (pfx, i) => this.plan.state.demolished.includes(pfx + i)
      || (pfx === 'nd' && Math.abs(this.activeElev || 0) > 0.01 && !!DOORS[i]?.entry);   // 入户门只属于首层（地下层也不显示）
    // 两侧都是玻璃墙面的门 → 玻璃门扇 + 门上玻璃过梁（值为玻璃墙厚度 mm）
    this.glassDoors = new Map();
    this.glassSlides = new Map();
    DOORS.forEach((d, i) => { const t = gone('nd', i) ? 0 : this.glassDoor(i); if (t) this.glassDoors.set(i, t); });
    SLIDES.forEach((s, i) => { const t = gone('ns', i) ? 0 : this.glassSlide(i); if (t) this.glassSlides.set(i, t); });
    [...DOORS.map((d, i) => [d, i, 'nd']), ...SLIDES.map((d, i) => [d, i, 'ns'])]
      .filter(([, i, pfx]) => !gone(pfx, i))
      .forEach(([d]) => {
      const [x0, y0, x1, y1] = d.rect;
      const s = box(M(x1 - x0), .012, M(y1 - y0), mat('#d8d0c0', { roughness: .3 }), wx((x0 + x1)/2), 0, wz((y0 + y1)/2));
      s.castShadow = false;
      this.archFloor.add(s);
    });

    // 墙体 + 碰撞体（玻璃墙面用通透的铝框 + 玻璃模型）
    // 「半透明」模式：只把围护外墙换成半透明材质，内隔墙保持实心（漫游时不做）
    const alpha = this.uiStore.opt.wallAlpha && this.uiStore.opt.mode !== 'walk';

    /* 节点级墙体：由当前层节点图推导「整段墙 + 真实洞口」，每段墙只生成一个挤出体。
     * 玻璃墙 / 玻璃材质墙保持原路径（需要铝框 + 竖梃的通透感）。 */
    const graph = this.plan.getGraph?.({ withContent: false });
    const allRuns = graph ? wallRuns(graph) : [];
    const solidRuns = USE_SOLID_WALLS
      ? allRuns.filter(r => !r.wallIds.some(i => !WALLS[i] || this.wallIsGlass(WALLS[i], i)))
      : [];
    const solidIdx = new Set();
    const covered = new Set();                    // 已由整段墙负责的洞口：旧路径不再补过梁 / 窗台墙
    for (const r of solidRuns){
      for (const i of r.wallIds) solidIdx.add(i);
      for (const k of r.openingKeys) covered.add(k);
    }
    this.syncWalls(solidRuns, { top, levelH, alpha });

    const inSolidRun = rect => solidRuns.some(run => {
      // 斜墙的 runRect 是 AABB，会把包围盒里的正交墙 / 洞口误判成「已被整段墙覆盖」
      if (run.axis === 's') return false;
      const b = runRect(run);
      return rect[0] >= b[0] - 2 && rect[2] <= b[2] + 2
        && rect[1] >= b[1] - 2 && rect[3] <= b[3] + 2;
    });

    WALLS.forEach((w, i) => {
      if (this.plan.state.demolished.includes('w' + i)) return;
      // 碰撞体与渲染方式无关：整段墙同样要挡人。
      // 斜墙的 AABB 明显大于真实墙体，做成碰撞盒会凭空挡住一大片空间，
      // 宁可暂时不挡人（碰撞走 OBB 见后续阶段）。
      if (!isSlantedWall(w)) this.colliders.push([wx(w[0]), wz(w[1]), wx(w[2]), wz(w[3]),
        this.activeElev, this.activeElev + levelH]);
      if (solidIdx.has(i)) return;               // 已由 syncWalls 整段渲染
      const glass = this.wallIsGlass(w, i);
      const seeThrough = alpha && !glass && this.outerWallOf(w, ROOMS);
      // 旧存档的 'g' 玻璃墙面：整片纯玻璃；材质选了玻璃：铝框 + 玻璃隔断
      if (glass) w[4] === 'g' ? this.glassWall(w, top) : this.glassFill(w, -LV_OVERLAP, top);
      else this.wallBox(w, -LV_OVERLAP, w[4] === 'low' ? Math.min(1, top) : top,
        seeThrough ? this.wallAlphaMat : this.wallFaceMat(i));
      // 上方是夹层挑空：外墙通高到夹层顶（双层高空间）
      if (this.isLoftAbove && w[4] === 'e')
        this.wallBox(w, top - LV_OVERLAP, levelH + this.loftClearH, seeThrough ? this.wallAlphaMat : undefined);
    });

    // 非首层（含地下层）：入户门洞口补墙（入户门只属于一层；整段墙已填实则跳过）
    if (Math.abs(this.activeElev) > 0.01){
      DOORS.forEach((d, i) => {
        if (!d.entry || this.plan.state.demolished.includes('nd' + i)) return;
        if (covered.has('nd' + i)) return;
        this.wallBox(d.rect, -LV_OVERLAP, top);
        this.colliders.push([wx(d.rect[0]), wz(d.rect[1]), wx(d.rect[2]), wz(d.rect[3]),
          this.activeElev, this.activeElev + levelH]);
      });
    }

    // 门洞、飘窗洞口上方过梁（已删除 / 已并入整段墙的洞口不再补）
    [
      ...DOORS.map((d, i) => [d.rect, DOOR_H, i, 'nd']),
      ...SLIDES.map((s, i) => [s.rect, slideHead(s), i, 'ns']),
      ...LINTELS.map(([r, h]) => [r, h, -1, null])
    ].forEach(([r, h, i, pfx]) => {
      if (i >= 0 && gone(pfx, i)) return;
      if (i >= 0 && covered.has(pfx + i)) return;
      if (i < 0 && inSolidRun(r)) return;         // 飘窗过梁已并入整段墙
      if (top <= h) return;
      // 两侧都是玻璃墙的门窗：洞口上方补玻璃（与墙面铝框 / 玻璃同厚对齐），而不是实体墙过梁
      const gt = pfx === 'nd' ? this.glassDoors.get(i) : pfx === 'ns' ? this.glassSlides.get(i) : 0;
      if (gt) this.glassFill(this.slimRect(r, gt), h, top);
      else this.wallBox(r, h, top);
    });

    // 窗：整段墙已经开出洞口 → 只补玻璃 + 窗框；未并入整段墙的窗仍按窗台墙 / 窗上墙处理
    WINS.forEach((r, i) => {
      if (gone('nw', i)) return;
      const sill = i === 0 ? 1.4 : i >= 6 ? .45 : .9, head = 2.4;
      const seeThrough = alpha && this.outerWallOf(r, ROOMS);
      const wm = seeThrough ? this.wallAlphaMat : undefined;
      if (!covered.has('nw' + i)){
        this.wallBox(r, -LV_OVERLAP, Math.min(sill, top), wm);
        if (top > head) this.wallBox(r, head, top, wm);
      }
      this.colliders.push([wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3]),
        this.activeElev, this.activeElev + levelH]);
      this.windowGlass(r, i, top, this.archUp);
    });

    this.buildDoors(top);
    this.applyLight();
    this.applyGrow();
    this.renderer.shadowMap.needsUpdate = true;      // 几何变了：重算一次阴影
    this.needsRender = true;
  },

  /** 其它楼层按 elev 叠层：整栋（allFloors / 漫游）时连同家具一起实色渲染；
   *  未开启「整栋」时，只保留下层作为半透明参照，更高楼层不生成 ——
   *  否则上方楼层的半透明墙面会遮挡当前层，影响查看与编辑。 */
  buildGhosts(){
    this.clearGroup(this.ghostRoot);
    this.ghostFurnG = [];
    const snaps = this.plan.levelSnapshots?.() || [];
    this.walkSnaps = snaps;                       // 漫游找楼板 / 楼梯用
    const walk = this.uiStore.opt.mode === 'walk';
    const full = !!this.uiStore.opt.allFloors || walk;
    const curElev = this.plan.activeLevelMeta?.()?.elev || 0;
    for (const s of snaps){
      if (s.active) continue;
      const elev = s.level.elev || 0;
      if (!full && elev > curElev + 1) continue;  // 未选「整栋」：更高楼层不显示，保证当前层清晰
      const g = new THREE.Group();
      g.position.y = elev / 1000;
      this.ghostRoot.add(g);
      this.addGhostLevel(g, s, full, walk, elev < curElev);
    }
    this.buildRoof(snaps);                        // 顶层房顶（单层户型不出）
    this.buildSite(snaps);                        // 地下层：基坑土壁 + 周边地坪
    this.setFurn(this.uiStore.opt.furn);
  },

  /* ======================= 场地（地面 + 基坑） =======================
   * 一整块 240×240 m 的大地面（带洞），洞的位置正好是：
   *   · 地下层的基坑（挖到最底层地面，四周砌土壁）；
   *   · 下沉的车库坡道（坡道是家具，地面在这里开槽，坡道才不会被地面挡住）。
   * 这样地面是连续的一整片（不会出现「中间一段空白」），只在真正下沉的地方留洞。
   * 「视图 → 显示 → 地面」关掉时整块隐藏（纯楼层视图，便于俯视编辑）。 */
  buildSite(snaps){
    this.clearGroup(this.siteG);
    if (!this.uiStore.opt.site) return;
    snaps = snaps || this.plan.levelSnapshots?.() || [];

    // 1) 地下层轮廓 + 最低标高
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, low = 0, hasBase = false;
    for (const s of snaps){
      const e = (s.level.elev || 0)/1000;
      if (e >= -.001) continue;
      hasBase = true;
      low = Math.min(low, e);
      for (const r of s.rooms || []){
        if (r.outdoor || !r.poly || r.poly.length < 3) continue;
        for (const [x, y] of r.poly){
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    // 2) 所有楼层里的「下行坡道」：地面要开槽，否则地面平面会横穿坡道把它盖住
    const rampPolys = [];
    for (const s of snaps){
      for (const f of s.furniture || []){
        if (f.type !== 'ramp' || (f.sdir ?? 1) >= 0) continue;
        const ring = this.rotRectPoly(f);
        if (ring && ring.length >= 3) rampPolys.push(ring);
      }
    }
    if (!hasBase && !rampPolys.length) return;        // 没有下沉空间：交给默认大地面

    const g = this.siteG;
    const holes = [];
    let pit = null;
    if (hasBase && Number.isFinite(x0) && x1 > x0 && y1 > y0){
      const PAD = 240;                                 // 房间内皮 → 外墙外皮
      pit = { x0: x0 - PAD, y0: y0 - PAD, x1: x1 + PAD, y1: y1 + PAD };
      holes.push([[pit.x0, pit.y0], [pit.x1, pit.y0], [pit.x1, pit.y1], [pit.x0, pit.y1]]);
    }
    holes.push(...rampPolys);

    /* 3) 大地面：一整片（带洞）。标高 -20mm：
     *   · 比草坪（区域抬 8mm）低 28mm、比坡道高端（0）低 20mm → 之间有清晰台阶，不会打架；
     *   · 洞边就是基坑外墙 / 坡道挡墙，视觉上正好是「地面被切开一条槽」。 */
    const SITE_Y = -.02, BIG = 120000;                 // 240m × 240m
    const gPoly = [[-BIG, -BIG], [BIG, -BIG], [BIG, BIG], [-BIG, BIG]];
    const gGeo = new THREE.ShapeGeometry(this.shapeOf(gPoly, false, holes));
    gGeo.rotateX(-Math.PI/2);
    const gm = new THREE.Mesh(gGeo, mat('#c9c5bc', { roughness: 1 }));
    gm.position.y = SITE_Y;
    gm.receiveShadow = true;
    this.siteG.add(gm);

    // 4) 基坑土壁（内侧面埋进外墙实体里，顶面比地坪低 40mm，避免与大地面共面）
    if (!pit) return;
    const T = .26, EARTH_TOP = -.06;
    const X0 = wx(pit.x0 + 120), X1 = wx(pit.x1 - 120);   // 土壁内侧面 = 外墙厚度中线
    const Z0 = wz(pit.y0 + 120), Z1 = wz(pit.y1 - 120);
    const earth = mat('#5b4a3a', { roughness: 1 });
    const W = X1 - X0, D = Z1 - Z0, cx = (X0 + X1)/2, cz = (Z0 + Z1)/2;
    const EH = Math.max(.1, EARTH_TOP - low);
    g.add(box(W + 2*T, EH, T, earth, cx, low, Z0 - T/2));
    g.add(box(W + 2*T, EH, T, earth, cx, low, Z1 + T/2));
    g.add(box(T, EH, D, earth, X0 - T/2, low, cz));
    g.add(box(T, EH, D, earth, X1 + T/2, low, cz));
  },

  /* ======================= 房顶 =======================
   * 规则：
   *  · 只有多楼层户型的「顶层」才有房顶 —— 平层户型（只有 1 层）不生成；
   *  · 勾选「半透明」时房顶一并半透明（可以俯视看室内），且不投阴影；
   *  · 样式按楼栋类型区分：平层 = 平屋面板 + 女儿墙 + 屋面设备；
   *    洋房 = 四坡瓦顶 + 封檐板 + 正脊；别墅 = 大挑檐四坡瓦顶 + 烟囱 + 通风帽。 */
  roofStyle(){
    const id = this.plan.planId;
    return id === 'garden' ? 'garden' : id === 'villa' ? 'house' : 'flat';
  },

  buildRoof(snaps){
    this.clearGroup(this.roofG);
    if (!this.uiStore.opt.roof) return;
    if (!this.plan.planId) return;
    const levels = this.plan.state.levels || [];
    if (levels.length < 2) return;                        // 单层户型：没有房顶
    const top = levels.slice().sort((a, b) => (a.elev || 0) - (b.elev || 0)).pop();
    const snap = (snaps || []).find(s => s.level.id === top.id);
    if (!snap) return;
    // 建筑外轮廓：顶层房间轮廓（墙内皮）外扩一个墙厚
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of snap.rooms || []){
      if (r.outdoor || !r.poly || r.poly.length < 3) continue;
      for (const [x, y] of r.poly){
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!(x1 > x0) || !(y1 > y0)) return;
    const PAD = 240;
    const W = M((x1 + PAD) - (x0 - PAD)), D = M((y1 + PAD) - (y0 - PAD));
    const cx = (x0 + x1)/2, cy = (y0 + y1)/2;
    const h0 = ((top.elev || 0) + (top.clearH || 2800)) / 1000;   // 屋面板标高
    const alpha = !!this.uiStore.opt.wallAlpha;
    const mk = (c, o = {}) => mat(c, alpha
      ? Object.assign({}, o, { transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide })
      : Object.assign({}, o, { side: THREE.DoubleSide }));
    const g = new THREE.Group();
    g.position.set(wx(cx), h0, wz(cy));
    const style = this.roofStyle();
    if (style === 'flat') this.roofFlat(g, W, D, mk, !alpha);
    else this.roofHip(g, W, D, mk, style === 'garden', !alpha);
    // 半透明房顶不投影 / 不接收阴影，否则顶层室内会被人造的整片阴影压暗
    if (alpha) g.traverse(o => { if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
    this.roofG.visible = (this.grow ?? 1) > .99;      // 与生长动画同步（applyGrow 也会设置）
    this.roofG.add(g);
  },

  /** 平层：钢筋混凝土屋面板 + 一圈女儿墙 + 屋面设备（空调外机 / 水箱） */
  roofFlat(g, W, D, mk, shadow){
    const t = .16, ph = .62, pw = .12;
    const slab = box(W + .3, t, D + .3, mk('#cfcac1', { roughness: .88 }), 0, 0, 0);
    slab.castShadow = shadow; slab.receiveShadow = true;
    g.add(slab);
    const m = mk('#e6e1d7', { roughness: .9 });
    const hw = (W + .3)/2, hd = (D + .3)/2, hh = (W + .3)/2;
    [[0, -hd + pw/2, W + .3, pw], [0, hd - pw/2, W + .3, pw]].forEach(([px, pz, sx, sz]) => {
      const b = box(sx, ph, sz, m, px, t, pz); b.castShadow = shadow; g.add(b);
    });
    [-1, 1].forEach(s => {
      const b = box(pw, ph, D + .3 - 2*pw, m, s*(hh - pw/2), t, 0); b.castShadow = shadow; g.add(b);
    });
    // 屋面设备：空调外机 + 生活水箱 + 排气管
    g.add(box(.9, .62, .7, mk('#c9ced3', { roughness: .5, metalness: .3 }), -hw*.42, t, hd*.3));
    g.add(cyl(.4, .4, .95, mk('#dde2e6', { roughness: .55 }), hw*.45, t, -hd*.35, 20));
    g.add(cyl(.12, .12, .45, mk('#9aa1a8', { roughness: .6 }), -hw*.15, t, -hd*.45, 14));
    g.add(cyl(.16, .16, .04, mk('#8d949c', {}), -hw*.15, t + .45, -hd*.45, 14));
  },

  /** 四坡瓦顶（hip roof）：底边 = 挑檐后的矩形，正脊沿长轴，三角形歇山在两端 */
  roofHip(g, W, D, mk, big, shadow){
    const over = big ? .75 : .45;                       // 挑檐
    const RW = W + over*2, RD = D + over*2;
    const rise = Math.max(1.1, Math.min(big ? 2.6 : 2.0, Math.min(RW, RD) * (big ? .26 : .22)));
    const tile  = mk(big ? '#4b5665' : '#9c5544', { roughness: .72 });
    const trim  = mk(big ? '#e7e2d8' : '#efe9df', { roughness: .82 });
    const ridgeM = mk(big ? '#3b4450' : '#87483a', { roughness: .7 });
    const hw = RW/2, hd = RD/2;
    const longX = RW >= RD;
    const rHalf = Math.max(0, (longX ? RW - RD : RD - RW)/2);
    // 4 个坡面（两个梯形 + 两个歇山三角）
    const v = [];
    const V = (x, y, z) => v.push(x, y, z);
    const quad = (a, b, c, d) => { V(...a); V(...b); V(...c); V(...a); V(...c); V(...d); };
    if (longX){
      quad([-hw, 0,  hd], [ hw, 0,  hd], [ rHalf, rise, 0], [-rHalf, rise, 0]);
      quad([ hw, 0, -hd], [-hw, 0, -hd], [-rHalf, rise, 0], [ rHalf, rise, 0]);
      V(-hw, 0,  hd); V(-rHalf, rise, 0); V(-hw, 0, -hd);
      V( hw, 0, -hd); V( rHalf, rise, 0); V( hw, 0,  hd);
    } else {
      quad([ hw, 0,  hd], [ hw, 0, -hd], [0, rise, -rHalf], [0, rise,  rHalf]);
      quad([-hw, 0, -hd], [-hw, 0,  hd], [0, rise,  rHalf], [0, rise, -rHalf]);
      V(-hw, 0, -hd); V(0, rise, -rHalf); V( hw, 0, -hd);
      V( hw, 0,  hd); V(0, rise,  rHalf); V(-hw, 0,  hd);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    const roof = new THREE.Mesh(geo, tile);
    roof.castShadow = shadow; roof.receiveShadow = shadow;
    g.add(roof);

    // 封檐板（四周一圈）+ 檐下滴水线
    const ft = .13, fh = .2;
    g.add(box(RW, fh, ft, trim, 0, -fh, -hd + ft/2));
    g.add(box(RW, fh, ft, trim, 0, -fh,  hd - ft/2));
    g.add(box(ft, fh, RD - 2*ft, trim, -hw + ft/2, -fh, 0));
    g.add(box(ft, fh, RD - 2*ft, trim,  hw - ft/2, -fh, 0));

    // 正脊压脊
    const rl = rHalf*2 + (longX ? .5 : 0);
    const rw = .26;
    if (longX) g.add(box(rl || rw, .13, rw, ridgeM, 0, rise - .04, 0));
    else g.add(box(rw, .13, rl || rw, ridgeM, 0, rise - .04, 0));

    if (big){
      // 别墅：烟囱 + 两个通风帽
      const cxx = hw*.42, czz = -hd*.3, ch = rise + 1.0;
      g.add(box(.62, ch, .62, mk('#9b8f80', { roughness: .9 }), cxx, 0, czz));
      g.add(box(.76, .16, .76, trim, cxx, ch, czz));
      g.add(box(.4, .06, .4, mk('#3a3a3c', { roughness: .8 }), cxx, ch + .16, czz));
      [-1, 1].forEach(s => {
        g.add(cyl(.14, .14, .5, mk('#8d949c', { metalness: .4, roughness: .5 }), s*hw*.2, rise*.55, hd*.18, 14));
        g.add(cyl(.2, .2, .05, mk('#6f767d', {}), s*hw*.2, rise*.55 + .5, hd*.18, 14));
      });
    }
  },

  /** 家具显隐：只切可见性 + 重绘一次。阴影贴图是手动更新的，必须一并标记，否则会留下残影 */
  setFurn(v, animate = false){
    const show = !!v || this.uiStore.opt.mode === 'walk';
    const was = this.furnG.visible;
    this.furnG.visible = show;
    if (this.instG) this.instG.visible = show;
    for (const g of this.ghostFurnG || []) g.visible = show;
    // 只有「从隐藏切到显示」才播放弹性入场；重建 / 整栋刷新不触发
    if (animate && show && !was) this.startFurnDrop();
    this.renderer.shadowMap.needsUpdate = true;
    this.needsRender = true;
  },

  /** 单个楼层：整栋时是实色楼板 / 墙体 / 家具，反选时是半透明体量（仅作空间参照） */
  addGhostLevel(g, s, full = false, walk = false, below = false){
    const ghost = this.ghostMat;
    const elev = (s.level.elev || 0) / 1000;
    const lh = (s.level.clearH || 2800) / 1000;
    // 实色渲染时墙体取本层净高（漫游要真实层高），鸟瞰按剖切高度；
    // 再让出 LV_SEAM：与「当前层墙顶 / 天花」不共面（否则整栋视图里层间会闪一条亮带）
    const cutTop = full ? (walk ? lh : Math.min(this.uiStore.opt.cut, lh)) : lh;
    const top = Math.max(.05, cutTop - LV_SEAM);
    // 楼板：实色只给当前层及以下的楼层；上方楼层仍半透明，避免挡住当前层
    const solidFloor = full && (walk || below);
    for (const r of s.rooms){
      // 注意：不能复用 shapePieces（其 netPieces 是当前层的缓存），直接按原始轮廓铺板
      if (!r.poly || r.poly.length < 3) continue;
      const kind = s.roomsMeta?.[r.id]?.mat || 'tile800';
      if (kind === 'void') continue;
      const geo = new THREE.ShapeGeometry(this.shapeOf(r.poly, false, r.holes || []));
      geo.rotateX(-Math.PI/2);
      const fl = new THREE.Mesh(geo, solidFloor ? this.floorMatFor(kind, walk) : ghost);
      fl.position.y = r.region ? (r.lift != null ? r.lift/1000 : .008) : 0;
      fl.receiveShadow = solidFloor; fl.castShadow = false;
      g.add(fl);
    }
    // 漫游：最高一层补天花（下方楼层的天花由上一层楼板的双面材质充当）
    if (walk){
      const isTop = !(this.walkSnaps || []).some(o => (o.level.elev || 0) > (s.level.elev || 0));
      if (isTop){
        const cm = mat('#fbfaf7', { roughness: 1 });
        for (const r of s.rooms){
          if (!r.poly || r.poly.length < 3) continue;
          if (s.roomsMeta?.[r.id]?.mat === 'void') continue;
          const cg = new THREE.ShapeGeometry(this.shapeOf(r.poly, true, this.ceilingHoles(r, r.holes)));
          cg.rotateX(Math.PI/2);
          const ceil = new THREE.Mesh(cg, cm);
          ceil.position.y = lh - CEIL_GAP;
          g.add(ceil);
        }
      }
    }
    const alpha = !!this.uiStore.opt.wallAlpha && !walk;

    /* 其它楼层的墙也走同一套节点推导（整段墙 + 真洞口），
     * 不再复制一份「盒子 + 窗台墙 + 过梁」的拼补逻辑：
     * 一层有斜接、无拼缝，整栋视图里的其它楼层同样有。 */
    const ghostGraph = graphFromLegacy({
      level: s.level, walls: s.walls, wins: s.wins || [], doors: s.doors || [],
      slides: s.slides || [], rooms: s.rooms, wallMats: s.wallMats || {},
      demolished: s.demolished || []
    });
    const ghostRuns = wallRuns(ghostGraph);
    const solidRuns = ghostRuns.filter(r => !r.wallIds.some(i => {
      const w = s.walls[i];
      return !w || w[4] === 'g' || isGlassMat(s.wallMats?.['w' + i]);
    }));
    const solidIdx = new Set(solidRuns.flatMap(r => r.wallIds));
    const covered = new Set(solidRuns.flatMap(r => r.openingKeys));

    for (const run of solidRuns){
      const rect = runRect(run);
      const seeThrough = alpha && full && this.outerWallOf(rect, s.rooms);
      const mid = s.wallMats?.['w' + run.wallIds[0]];
      const m = full
        ? (seeThrough ? this.wallAlphaMat
          : mid ? mat(wallMat(mid).color, { roughness: wallMat(mid).rough, metalness: wallMat(mid).metal || 0 })
          : this.wallMat)
        : ghost;
      const solid = full && !seeThrough;
      const hh = run.low ? Math.min(1, top) : top;
      if (hh <= .001) continue;
      // 墙根下探 LV_OVERLAP：压住下层墙顶（下层墙顶已退让 LV_SEAM），层间不会出现细缝
      // 其它楼层只作空间参照：不加墙顶压顶（保持原来「整栋」视图的观感）
      const grp = buildWallSolid(run, {
        yb: -LV_OVERLAP, yt: hh, wallMat: m, capMat: null, alpha: !solid
      });
      if (grp) g.add(grp);
      if (full){
        this.colliders.push([wx(rect[0]), wz(rect[1]), wx(rect[2]), wz(rect[3]), elev, elev + hh]);
      }
    }

    s.walls.forEach((w, i) => {
      if (s.demolished.includes('w' + i)) return;
      if (solidIdx.has(i)) return;                 // 已由整段墙渲染
      const [x0, y0, x1, y1] = w;
      const hh = w[4] === 'low' ? Math.min(1, top) : top;
      if (hh <= .001) return;
      const mid = s.wallMats?.['w' + i];
      const glass = w[4] === 'g' || isGlassMat(mid);
      const seeThrough = alpha && full && !glass && this.outerWallOf(w, s.rooms);
      const m = full
        ? (glass ? this.glassMat
          : seeThrough ? this.wallAlphaMat
          : mid ? mat(wallMat(mid).color, { roughness: wallMat(mid).rough, metalness: wallMat(mid).metal || 0 })
          : this.wallMat)
        : ghost;
      const nb = new THREE.Mesh(new THREE.BoxGeometry(M(x1 - x0), hh + LV_OVERLAP, M(y1 - y0)), m);
      nb.position.set(wx((x0 + x1)/2), (hh - LV_OVERLAP)/2, wz((y0 + y1)/2));
      const solid = full && !seeThrough && !glass;
      nb.castShadow = solid; nb.receiveShadow = solid;
      g.add(nb);
      if (full){
        this.colliders.push([wx(x0), wz(y0), wx(x1), wz(y1), elev, elev + hh]);
      }
    });
    // 窗：整栋 / 漫游时其它楼层也要有完整的窗台墙、玻璃与窗框（否则只剩墙洞）
    if (full){
      (s.wins || []).forEach((r, i) => {
        if (s.demolished.includes('nw' + i)) return;
        const sill = i === 0 ? 1.4 : i >= 6 ? .45 : .9, head = 2.4;
        const wm = (alpha && this.outerWallOf(r, s.rooms)) ? this.wallAlphaMat : this.wallMat;
        if (!covered.has('nw' + i)){                // 整段墙已开洞时不再补窗台墙 / 窗上墙
          const low = this.blockBox(r, -LV_OVERLAP, Math.min(sill, top), wm);
          if (low) g.add(low);
          const up = this.blockBox(r, head, top, wm);
          if (up) g.add(up);
        }
        this.windowGlass(r, i, top, g);
        this.colliders.push([wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3]), elev, elev + top]);
      });
    }
    // 门：入户门只属于一层，上层补墙；其它门扇 / 推拉门一并补上，避免整栋视图里出现大量镂空
    if (full){
      (s.doors || []).forEach((d, i) => {
        if (s.demolished.includes('nd' + i)) return;
        if (d.entry && Math.abs(elev) > .01){
          if (!covered.has('nd' + i)){              // 整段墙已填实则不再补墙
            const wm = (alpha && this.outerWallOf(d.rect, s.rooms)) ? this.wallAlphaMat : this.wallMat;
            const b = this.blockBox(d.rect, -LV_OVERLAP, top, wm);
            if (b) g.add(b);
            this.colliders.push([wx(d.rect[0]), wz(d.rect[1]), wx(d.rect[2]), wz(d.rect[3]), elev, elev + top]);
          }
          return;
        }
        for (const leaf of this.ghostDoorLeaf(d, top)) g.add(leaf);
      });
      (s.slides || []).forEach((d, i) => {
        if (s.demolished.includes('ns' + i)) return;
        const sl = this.ghostSlide(d, top);
        if (sl) g.add(sl);
      });
    }
    // 实色楼层的家具；漫游时必须可见
    // 整栋时楼梯也逐层渲染（含户外楼梯）：不再只画「当前层的下一层」，
    // 这样三层及以上的楼栋切换当前层时，上层楼梯不会凭空消失。
    if (full && (this.uiStore.opt.furn || walk)){
      const fg = new THREE.Group();
      fg.userData.ghostFurn = true;
      const levMm = s.level.elev || 0;
      for (const f of s.furniture || []){
        const o = buildFurniture(f, CLIMB[f.type] ? this.stairRiseAt(f, levMm) : undefined);
        // 其它楼层的楼梯只作参照：不参与拾取（避免选中不在当前层的楼梯）
        if (CLIMB[f.type]){ o.userData.fid = null; o.userData.lowerFloor = true; }
        fg.add(o);
      }
      if (fg.children.length){
        // 其它楼层的家具只作参照：不投影，减少阴影贴图开销（切显隐也更跟手）
        fg.traverse(o => { if (o.isMesh) o.castShadow = false; });
        /* 拾取只发生在当前层，其它楼层不需要逐件保留：
         * 整层 258 件家具（约 7000 个 Mesh）在这里合并成「每种材质一个 Mesh」，
         * 是「整栋」视图 draw call 的主要来源之一。 */
        bakeGroup(fg);
        g.add(fg);
        (this.ghostFurnG = this.ghostFurnG || []).push(fg);
      }
    }
    // 夹层楼层：临边加栏杆（同样跳过建筑外轮廓）
    if (s.level.kind === 'loft'){
      const liveWalls = s.walls.filter((w, i) => !s.demolished.includes('w' + i));
      const envWalls = this.plan.baseWalls?.() || [];
      this.addRailingsTo(g, s.rooms, [...liveWalls, ...envWalls],
        full ? mat('#6b543f', { roughness: .6 }) : ghost);
    }
  },

  /** 沿房间（楼板）边缘、且不在墙上的边加栏杆；用于 loft 夹层临边 */
  addRailingsTo(group, rooms, walls, m){
    for (const r of rooms){
      const ring = r.poly || [];
      for (let i = 0; i < ring.length; i++){
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if (this.edgeOnWall(a, b, walls)) continue;
        const seg = this.railSeg(a[0], a[1], b[0], b[1], m);
        if (seg) group.add(seg);
      }
    }
  },

  /** 边的中点是否落在某面墙上（正交房间/墙体，用包围盒近似即可） */
  edgeOnWall(a, b, walls){
    const mx = (a[0] + b[0])/2, my = (a[1] + b[1])/2, tol = 90;
    return walls.some(w => {
      const x0 = Math.min(w[0], w[2]), x1 = Math.max(w[0], w[2]);
      const y0 = Math.min(w[1], w[3]), y1 = Math.max(w[1], w[3]);
      return mx >= x0 - tol && mx <= x1 + tol && my >= y0 - tol && my <= y1 + tol;
    });
  },

  /** 一段栏杆：顶端扶手 + 立柱（正交边） */
  railSeg(ax, ay, bx, by, m){
    const horiz = Math.abs(bx - ax) >= Math.abs(by - ay);
    const L = M(horiz ? Math.abs(bx - ax) : Math.abs(by - ay));
    if (L < .15) return null;
    const g = new THREE.Group();
    const hr = new THREE.Mesh(new THREE.BoxGeometry(horiz ? L : .04, .04, horiz ? .04 : L), m);
    hr.position.set(wx((ax + bx)/2), .95, wz((ay + by)/2));
    hr.castShadow = true; g.add(hr);
    const n = Math.max(1, Math.round(L / .9));
    for (let i = 0; i <= n; i++){
      const t = i/n;
      const px = horiz ? wx(ax + (bx - ax)*t) : wx((ax + bx)/2);
      const pz = horiz ? wz((ay + by)/2) : wz(ay + (by - ay)*t);
      const post = new THREE.Mesh(new THREE.BoxGeometry(.03, .95, .03), m);
      post.position.set(px, .475, pz);
      post.castShadow = true; g.add(post);
    }
    return g;
  },

  /** 顶灯 + 点光源（白天只给最大的几个房间挂以省着色开销，夜景全部点亮）
   *  —— buildArch 与切夜景时都会调用 */
  buildLamps(top, levelH = H){
    this.lampG.clear();
    this.lampLights = 0;
    const night = this.uiStore.opt.night;
    ROOMS.forEach(r => {
      if (r.outdoor) return;                                // 户外区域（花园 / 庭院）不挂室内顶灯
      const lampAt = r.netPieces ? r.netAt : r.at;            // 顶灯锚点：房间 / 区域都取中心点（整块被盖掉就没有灯）
      if (!lampAt) return;
      if (this.plan.state.rooms?.[r.id]?.mat === 'void') return;   // 挑空处不挂灯
      const style = this.plan.state.rooms?.[r.id]?.light || 'round';
      if (style === 'none') return;                         // 无顶灯：该房间 / 区域不挂灯
      const lamp = new THREE.Mesh(
        ceilLampGeo(style),
        new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff2d6', emissiveIntensity: .3 })
      );
      // 天花已下沉 CEIL_GAP：顶灯跟着下移，灯体贴在天花下方 3mm 处
      lamp.position.set(wx(lampAt[0]), levelH - CEIL_GAP - .018, wz(lampAt[1]));
      lamp.visible = top >= levelH;
      this.lampG.add(lamp);
      // 点光源会进入每个材质的着色循环：数量上限由画质档位决定
      // （低：白天 0 / 夜 4；中：4 / 8；高：4 / 不限）
      const cap = this.quality
        ? (night ? this.quality.lampNight : this.quality.lampDay)
        : (night ? Infinity : 4);
      if (this.lampLights < cap){
        this.lampLights++;
        const pl = new THREE.PointLight(0xffd9a8, 0, 7, 1.6);
        pl.position.set(wx(lampAt[0]), levelH - .25, wz(lampAt[1]));
        this.lampG.add(pl);
      }
    });
  },

  /* ======================= 门 ======================= */
  /** 门套：洞口两侧门垛 + 上槛（剖切到门高以下时省略上槛）；门扇净宽 = 洞口宽 - 2×门套宽 */
  doorCasing(r, hz, T, h, m = null){
    if (h <= .02) return;
    m = m || mat('#f1ece2', { roughness: .72 });
    const w = DOOR_CASE;
    const [x0, y0, x1, y1] = r;
    if (hz){
      const cz = wz((y0 + y1)/2);
      this.archUp.add(box(w, h, T + .02, m, wx(x0) + w/2, 0, cz));
      this.archUp.add(box(w, h, T + .02, m, wx(x1) - w/2, 0, cz));
      if (h > 2) this.archUp.add(box(M(x1 - x0) - 2*w, w, T + .02, m, wx((x0 + x1)/2), h - w, cz));
    } else {
      const cx = wx((x0 + x1)/2);
      this.archUp.add(box(T + .02, h, w, m, cx, 0, wz(y0) + w/2));
      this.archUp.add(box(T + .02, h, w, m, cx, 0, wz(y1) - w/2));
      if (h > 2) this.archUp.add(box(T + .02, w, M(y1 - y0) - 2*w, m, cx, h - w, wz((y0 + y1)/2)));
    }
  },

  /** 门扇的 3D 模型：平开门（入户 / 房门）+ 推拉门，默认全部打开 */
  buildDoors(top){
    const handle = mat('#c8cbcd', { metalness: .85, roughness: .3 });
    const leafM   = e => e ? mat('#8b6b4c', { roughness: .5 })  : mat('#dccab0', { roughness: .55 });
    const panelM  = e => e ? mat('#7b5d41', { roughness: .55 }) : mat('#d2bfa3', { roughness: .6 });
    const sFrame  = mat('#efe9df', { roughness: .6 });
    const sGlass  = mat('#e6eef1', { transparent: true, opacity: .4, roughness: .12, depthWrite: false, side: THREE.DoubleSide });
    const gone = (pfx, i) => this.plan.state.demolished.includes(pfx + i)
      || (pfx === 'nd' && Math.abs(this.activeElev || 0) > 0.01 && !!DOORS[i]?.entry);   // 入户门只属于首层（地下层也不显示）

    /* ---- 平开门：门套 + 带凹板与把手的门扇，绕铰点（d.h）开合；双开门左右各一扇对开 ---- */
    DOORS.forEach((d, i) => {
      if (gone('nd', i)) return;
      const key = `${this.plan.planId}:nd${i}`;
      const [x0, y0, x1, y1] = d.rect;
      const hz = (x1 - x0) >= (y1 - y0);
      const T = M(hz ? y1 - y0 : x1 - x0);          // 墙厚
      const L = M(hz ? x1 - x0 : y1 - y0);          // 洞口宽
      const h = Math.min(DOOR_H, top);               // 剖切墙时门扇随之变矮
      const gt = (this.glassDoors && this.glassDoors.get(i)) || 0;   // 玻璃墙厚（mm）；0 = 普通门
      const isGlass = gt > 0;                        // 两侧皆为玻璃墙面 → 玻璃门扇
      this.doorCasing(isGlass ? this.slimRect(d.rect, gt) : d.rect, hz,
        isGlass ? M(gt) : T, h, isGlass ? this.frameMat : null);

      const nLeaf = d.dbl ? 2 : 1;
      const lw = Math.max((L - 2*DOOR_CASE - .004)/nLeaf, .2), lt = .042;   // 门扇宽 / 厚
      const lh = Math.max(h - (h > 2 ? DOOR_CASE : 0), .2);                 // 门扇高（让开上槛）

      // 铰点：单开一扇（d.h）；双开另一扇以洞口另一端为铰点，闭合方向相反、同样朝房间开
      const hinges = [[d.h[0], d.h[1], d.c]];
      if (d.dbl){
        const h2 = hz
          ? [Math.abs(d.h[0] - x0) <= Math.abs(d.h[0] - x1) ? x1 : x0, d.h[1]]
          : [d.h[0], Math.abs(d.h[1] - y0) <= Math.abs(d.h[1] - y1) ? y1 : y0];
        hinges.push([h2[0], h2[1], [-d.c[0], -d.c[1]]]);
      }
      if (isGlass){
        // 玻璃墙比原洞口薄且居中原墙线：把铰点从原墙皮挪到玻璃墙表面
        const mid = hz ? (y0 + y1)/2 : (x0 + x1)/2;
        const face = hz ? d.h[1] : d.h[0];
        const sgn = Math.sign(mid - face) || 1;
        const inward = sgn*(Math.abs(mid - face) - gt/2);
        hinges.forEach(hg => { if (hz) hg[1] += inward; else hg[0] += inward; });
      }

      const open = this.doorState[key] ?? true;      // 门默认打开
      const pivots = [], a0s = [], a1s = [], curs = [];
      for (const [hx, hy, c] of hinges){
        const door = new THREE.Group();
        door.position.set(wx(hx), 0, wz(hy));        // 铰点
        const leaf = new THREE.Group();
        leaf.position.x = DOOR_CASE + .002 + lw/2;
        if (isGlass){
          // 玻璃门扇：细铝框（上下框 + 两侧立框 + 中横框）+ 整片玻璃
          const fw = Math.min(.07, lw*.16), fm = this.frameMat;
          leaf.add(box(lw, fw, lt, fm, 0, 0, 0));
          leaf.add(box(lw, fw, lt, fm, 0, lh - fw, 0));
          leaf.add(box(fw, lh, lt, fm, -lw/2 + fw/2, 0, 0));
          leaf.add(box(fw, lh, lt, fm,  lw/2 - fw/2, 0, 0));
          leaf.add(box(lw - 2*fw, .05, lt, fm, 0, Math.min(1.02, lh*.46), 0));
          const pane = box(Math.max(lw - 2*fw, .02), Math.max(lh - 2*fw, .02), lt*.34, this.glassMat, 0, fw, 0);
          pane.castShadow = false;
          leaf.add(pane);
        } else {
          leaf.add(box(lw, lh, lt, leafM(d.entry), 0, 0, 0));
          // 两面凹板：贴面薄片，拉出实木的层次
          [-1, 1].forEach(s => {
            const z = s*(lt/2 + .003);
            leaf.add(box(lw*.68, lh*.3, .006, panelM(d.entry), 0, lh*.1, z));
            leaf.add(box(lw*.68, lh*.34, .006, panelM(d.entry), 0, lh*.54, z));
          });
        }
        // 把手（两面）
        if (lh >= .95) [-1, 1].forEach(s => {
          const py = Math.min(.98, lh - .1);
          leaf.add(box(.1, .016, .016, handle, lw/2 - .07, py, s*(lt/2 + .01)));
          leaf.add(box(.016, .016, .024, handle, lw/2 - .07, py, s*(lt/2 + .004)));
        });

        // 关闭方向 c → 打开方向 o：绕 Y 轴旋转（局部 +x 为门扇长度方向）
        const a0 = Math.atan2(-c[1], c[0]);
        let a1 = Math.atan2(-d.o[1], d.o[0]);
        a1 = a0 + Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));   // 取最短旋转
        door.rotation.y = open ? a1 : a0;
        door.add(leaf);
        this.archUp.add(door);
        pivots.push(door); a0s.push(a0); a1s.push(a1); curs.push(door.rotation.y);
      }

      const rec = { key, kind: 'swing', open, len: lw,
        // 所属楼层的标高区间：漫游碰撞只在「人站在这层」时生效（上层不会一层门扇挡住）
        y0: this.activeElev, y1: this.activeElev + this.activeLevelH,
        pivots, a0s, a1s, curs,
        // 兼容字段：主铰点
        pivot: pivots[0], a0: a0s[0], a1: a1s[0], cur: curs[0] };
      pivots.forEach(p => {
        p.userData.door = rec;
        p.children.forEach(l => { l.userData.door = rec; });
      });
      this.doors.push(rec);
    });

    /* ---- 推拉门：门套 + 一固定一滑动两扇，滑块默认滑开 ---- */
    SLIDES.forEach((s, i) => {
      if (gone('ns', i)) return;
      const key = `${this.plan.planId}:ns${i}`;
      const [x0, y0, x1, y1] = s.rect;
      const hz = (x1 - x0) >= (y1 - y0);
      const T = M(hz ? y1 - y0 : x1 - x0);
      const L = M(hz ? x1 - x0 : y1 - y0);
      const h = Math.min(slideHead(s), top);
      const gt = (this.glassSlides && this.glassSlides.get(i)) || 0;
      this.doorCasing(gt ? this.slimRect(s.rect, gt) : s.rect, hz, gt ? M(gt) : T, h,
        gt ? this.frameMat : null);

      const PW = L*.52, PH = Math.max(h - (h > 2 ? DOOR_CASE : 0) - .01, .2), lt = .035, off = .028;
      const panel = () => {
        const g = new THREE.Group(), w = .05;
        g.add(box(w, PH, lt, sFrame, -(PW - w)/2, 0, 0));
        g.add(box(w, PH, lt, sFrame,  (PW - w)/2, 0, 0));
        g.add(box(PW - 2*w, w, lt, sFrame, 0, 0, 0));
        g.add(box(PW - 2*w, w, lt, sFrame, 0, PH - w, 0));
        const glass = box(PW - 2*w, PH - 2*w, lt*.4, sGlass, 0, w, 0);
        glass.castShadow = false;                       // 玻璃不投影
        g.add(glass);
        return g;
      };
      // st = 门扇沿洞口的起始位置（m），normal = 两条轨道的法向偏移
      const make = (st, normal) => {
        const g = panel();
        if (hz){ g.position.set(wx(x0) + st + PW/2, 0, wz((y0 + y1)/2) + normal); }
        else { g.rotation.y = -Math.PI/2; g.position.set(wx((x0 + x1)/2) + normal, 0, wz(y0) + st + PW/2); }
        return g;
      };
      const fixed = make(0, off);
      const moving = make(L - PW, -off);                     // 初始在「闭合」位
      const b0 = hz ? moving.position.x : moving.position.z;
      const b1 = (hz ? wx(x0) : wz(y0)) + PW/2;              // 打开后滑到固定扇上（同侧错轨重叠）
      const open = this.doorState[key] ?? true;
      const rec = { key, kind: 'slide', open, k: open ? 1 : 0,
        y0: this.activeElev, y1: this.activeElev + this.activeLevelH,   // 只在所属楼层挡人
        rect: [wx(x0), wz(y0), wx(x1), wz(y1)],          // 关门时作为漫游碰撞体
        apply(k){
          if (hz) moving.position.x = b0 + (b1 - b0)*k;
          else    moving.position.z = b0 + (b1 - b0)*k;
        } };
      rec.apply(rec.k);
      fixed.userData.door = moving.userData.door = rec;
      this.archUp.add(fixed, moving);
      this.slides.push(rec);
    });
  },

  /** 点门开关：状态记在 doorState 里，重建几何（改墙 / 换剖切高度）后仍保持 */
  toggleDoor(d){
    if (!d) return;
    d.open = !d.open;
    this.doorState[d.key] = d.open;
  },

  buildFurn(){
    this.clearGroup(this.furnG);
    this.clearGroup(this.instG);
    this.instMap.clear();
    this.fx.length = 0;
    this.selTemp = null;
    this.selInst = null;
    this.dropFx = null;                        // 重建后旧动画引用失效
    const st = this.plan.state;
    const cur = this.plan.activeLevelMeta?.()?.elev || 0;

    // 同型构件分组：达到阈值的走实例化，其余逐件建模
    const instGroups = new Map();
    const normal = [];
    for (const f of st.furniture){
      if (this.uiStore.opt.instancing && INST_TYPES.has(f.type)){
        const key = `${f.type}|${f.color || ''}|${f.w}|${f.d}`;
        const arr = instGroups.get(key);
        if (arr) arr.push(f); else instGroups.set(key, [f]);
      } else normal.push(f);
    }
    const emitNormal = f => this.furnG.add(buildFurniture(f, CLIMB[f.type] ? this.stairRise(f) : undefined));
    for (const f of normal) emitNormal(f);
    for (const items of instGroups.values()){
      if (items.length >= INST_MIN && this.addInstances(items)) continue;
      for (const f of items) emitNormal(f);
    }
    // 正下方一层的「上行楼梯」：夹层 / 上层同样要显示（楼梯穿过楼板洞口上来）。
    // 整栋（allFloors）/ 漫游时各层楼梯由 buildGhosts 在自己的楼层里逐层渲染，
    // 这里不再补画，否则同一段楼梯会被画两遍（且上层楼梯会缺一层）。
    const allFloors = !!this.uiStore.opt.allFloors || this.uiStore.opt.mode === 'walk';
    const below = (st.levels || [])
      .filter(l => (l.elev || 0) < cur)
      .sort((a, b) => (b.elev || 0) - (a.elev || 0))[0];
    if (below && !allFloors){
      const d = below.id === st.activeLevel ? st : (st.levelData[below.id] || {});
      const lowElev = below.elev || 0;
      for (const f of d.furniture || []){
        if (!CLIMB[f.type] || (f.sdir ?? 1) <= 0) continue;
        // 只画到本层楼面：扶手 / 立杆冲出夹层地面的部分不渲染
        const clipTop = Math.max(.1, (cur - lowElev)/1000);
        const g = buildFurniture(f, this.stairRiseAt(f, lowElev), clipTop);
        g.position.y += (lowElev - cur)/1000;      // 落到下层标高
        g.userData.lowerFloor = true;              // 仅作参照，不参与拾取
        g.userData.fid = null;
        this.furnG.add(g);
      }
    }
    // 漫游时家具（尤其楼梯）必须可见，否则脚下是空的
    this.furnG.visible = this.uiStore.opt.furn || this.uiStore.opt.mode === 'walk';
    this.instG.visible = this.furnG.visible;
    this.selKey = null;
    this.collectFx();
    this.applyHoliday();
    this.applyGrow();
    this.renderer.shadowMap.needsUpdate = true;
    this.needsRender = true;
  },

  /**
   * 同型构件实例化：用一件模板（已按材质烘焙）建 InstancedMesh，
   * 每个实例只存一个矩阵，draw call 不再随数量增长。
   * 返回 false 表示模板不适合实例化（例如包含动画子组），调用方回退逐件建模。
   */
  addInstances(items){
    const sample = items[0];
    const tpl = buildFurniture({ ...sample, id: '__tpl', cx: 0, cy: 0, rot: 0 });
    if (!tpl || !tpl.children.length) return false;
    const layers = tpl.children.filter(o => o.isMesh);
    if (!layers.length || layers.length !== tpl.children.length) return false;

    const insts = layers.map(m => {
      const im = new THREE.InstancedMesh(m.geometry, m.material, items.length);
      im.castShadow = m.castShadow;
      im.receiveShadow = m.receiveShadow;
      im.userData.fids = new Array(items.length);
      return im;
    });
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(1, 1, 1);
    const m4 = new THREE.Matrix4();
    items.forEach((f, i) => {
      E.set(0, -f.rot*Math.PI/180, 0);
      Q.setFromEuler(E);
      P.set(wx(f.cx), 0, wz(f.cy));
      m4.compose(P, Q, S);
      for (const im of insts){
        im.setMatrixAt(i, m4);
        im.userData.fids[i] = f.id;
      }
      this.instMap.set(f.id, { entries: insts.map(im => ({ mesh: im, index: i })), m: m4.clone() });
    });
    for (const im of insts){
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere?.();
      this.instG.add(im);
    }
    return true;
  },

  /** 收集可交互动画件（道闸 / 大门 / 水柱），并把当前开合状态套回去 */
  collectFx(){
    this.fx.length = 0;
    for (const root of this.furnG.children){
      const fid = root.userData.fid;
      if (!fid) continue;
      root.traverse(o => {
        const fx = o.userData.fx;
        if (!fx) return;
        const target = this.fxState[fid] ?? 0;
        fx.fid = fid;
        fx.target = target;
        if (fx.kind === 'barrier') o.rotation.y = target ? fx.openAngle : 0;
        if (fx.kind === 'gate') o.position.x = target ? fx.open : fx.closed;
        this.fx.push({ obj: o, fx });
      });
    }
  },

  /** 点击道闸 / 大门：切换开合（返回 true 表示已处理，不再走选中逻辑） */
  toggleAsset(fid){
    const list = this.fx.filter(x => x.fx.fid === fid);
    if (!list.length) return false;
    const on = !(this.fxState[fid] ?? 0);
    this.fxState[fid] = on ? 1 : 0;
    for (const x of list) x.fx.target = on ? 1 : 0;
    this.uiStore.showToast(tr(on ? '已开启' : '已关闭', on ? 'Opened' : 'Closed'));
    this.needsRender = true;
    return true;
  },

  /** 楼梯连到相邻楼层的高差（米，正数）；无相邻层时回退到默认层高 H */
  stairRise(f){
    return this.stairRiseAt(f, this.plan.activeLevelMeta?.()?.elev || 0);
  },

  /** 指定楼层（elev，mm）上楼梯连到相邻层的高差（米，正数） */
  stairRiseAt(f, elev){
    const elevs = (this.plan.state.levels || []).map(l => l.elev || 0).sort((a, b) => a - b);
    const cur = elev || 0;
    const sd = f.sdir < 0 ? -1 : 1;
    const target = sd > 0
      ? (elevs.find(e => e > cur) ?? cur + H*1000)
      : (elevs.slice().reverse().find(e => e < cur) ?? cur - H*1000);
    return Math.abs(target - cur) / 1000 || H;
  },

  /** CSS2D 房间名标签（房间跳转按钮由 RoomList 组件负责） */
  buildLabels(){
    this.labelG.children.slice().forEach(o => { o.element.remove(); this.labelG.remove(o); });
    ROOMS.forEach(r => {
      // 文案锚点：房间被区域盖掉后跟着剩余几何走；整块被盖掉则不显示
      const at = r.netPieces ? r.netAt : r.at;
      if (!at) return;
      const el = document.createElement('div');
      el.className = 'rlabel';
      el.innerHTML = `${esc(nm(this.plan.state.rooms[r.id]?.name || r.name))}<small>${roomArea(r).toFixed(1)}m²</small>`;
      const o = new CSS2DObject(el);
      o.position.set(wx(at[0]), this.uiStore.opt.cut + .15, wz(at[1]));
      o.visible = this.labelG.visible;
      this.labelG.add(o);
    });
  }

  /** 只重建变化的部分 */
};
