<template>
  <svg
    id="plan" ref="svgEl" :class="['tool-' + ui.tool, {'tool-region': !!ui.regionDraw}]" :viewBox="viewBox"
    font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"
    @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"
    @wheel.prevent="onWheel" @dblclick="onDblClick" @contextmenu="onContextMenu"
  >
    <!-- 材质图案（静态） -->
    <defs id="defs" v-html="DEFS"></defs>

    <!-- 网格 -->
    <g id="gGrid">
      <rect x="-20000" y="-20000" width="55000" height="55000"
        :fill="ui.layers.grid ? 'url(#grid)' : 'transparent'" data-bg="1"/>
    </g>

    <!-- 房间地面 + 门槛 -->
    <g id="gRooms">
      <!-- 房间地面：被区域覆盖后可能被切成多块，逐块绘制；户外区域用虚线描边 -->
      <template v-for="r in ROOMS" :key="r.id">
        <path v-for="(pc, pi) in shapePieces(r)" :key="r.id + ':' + pi" class="room" :data-room="r.id"
          :d="shapePath(pc)" fill-rule="evenodd"
          :fill="isVoid(r) ? 'transparent' : `url(#m-${state.rooms[r.id]?.mat || 'tile800'})`"
          :stroke="isVoid(r) ? '#b0a596' : r.outdoor ? '#a5968a' : 'none'"
          :stroke-width="isVoid(r) ? 1.4 : r.outdoor ? 1.2 : 0"
          :stroke-dasharray="isVoid(r) ? '10 6' : r.outdoor ? '7 5' : null"
          vector-effect="non-scaling-stroke"/>
      </template>
      <rect v-for="(s, i) in SILLS" :key="'sill' + i" :x="s[0]" :y="s[1]"
        :width="s[2] - s[0]" :height="s[3] - s[1]"
        fill="#e2dacb" stroke="#b9b0a0" stroke-width="1"
        vector-effect="non-scaling-stroke" pointer-events="none"/>
    </g>

    <!-- 下层房间轮廓（虚影，便于上下层对位） -->
    <g id="gLower" pointer-events="none" v-html="lowerSvg"/>

    <!-- 家具 -->
    <g id="gFurn" :display="ui.layers.furn ? 'inline' : 'none'">
      <g v-for="f in state.furniture" :key="f.id" class="furn" :data-fid="f.id"
        :transform="`translate(${f.cx} ${f.cy}) rotate(${f.rot})`">
        <!-- 整块占地的透明命中区：任何落在家具投影内的点击都优先选中家具，
             而不是穿过图标空隙选中下面的房间 / 区域（图标本身可能只有描边） -->
        <rect :x="-f.w/2" :y="-f.d/2" :width="f.w" :height="f.d"
          fill="none" pointer-events="all"/>
        <g v-html="iconOf(f)"></g>
        <text v-if="showLabel(f)" :transform="`rotate(${-f.rot})`"
          :font-size="labelSize(f)" text-anchor="middle" dominant-baseline="central"
          fill="#4a443c" opacity=".8" pointer-events="none">{{ nm(f.name) }}</text>
      </g>
    </g>

    <!-- 墙体 -->
    <g id="gWalls">
      <rect v-for="w in walls" :key="w.id" class="wall" :data-wall="w.id"
        :x="w.x" :y="w.y" :width="w.w" :height="w.h" :fill="w.fill" v-bind="w.extra"/>
    </g>

    <!-- 画墙预览（A → B，90° 正交） -->
    <g id="gWallDraw" pointer-events="none" v-html="wallDrawSvg"></g>

    <!-- 画墙起点提示：悬浮在已有墙体上的小绿点 -->
    <g id="gWallHover" pointer-events="none" v-html="wallHoverSvg"></g>

    <!-- 门窗放置预览：鼠标停在可开洞的墙（非承重墙 / 外墙）上时的绿色可放置区 -->
    <g id="gOpenHover" pointer-events="none" v-html="openHoverSvg"></g>

    <!-- 门窗洞口 -->
    <g id="gOpen" v-html="openingsSvg"></g>

    <!-- 区域绘制预览（A → B 矩形 + 扣掉墙体门窗后的区域 + 吸附指示） -->
    <g id="gRegion" pointer-events="none" v-html="regionSvg"></g>

    <!-- 房间名 -->
    <g id="gLabels" pointer-events="none" :display="ui.layers.labels ? 'inline' : 'none'">
      <template v-for="r in labelled" :key="r.id">
        <text :x="labelAt(r)[0]" :y="labelAt(r)[1]" font-size="250" font-weight="600"
          text-anchor="middle" fill="#2b2824" v-bind="HALO">{{ nm(state.rooms[r.id]?.name || r.name) }}</text>
        <text :x="labelAt(r)[0]" :y="labelAt(r)[1] + 260" font-size="175"
          text-anchor="middle" fill="#7d7366" v-bind="HALO">{{ isVoid(r) ? tr('挑空', 'Void') : roomArea(r).toFixed(2) + ' m²' }}</text>
      </template>
    </g>

    <!-- 尺寸标注（默认户型静态链 / 其他户型按几何推导） -->
    <g id="gDims" pointer-events="none" :display="ui.layers.dims ? 'inline' : 'none'" v-html="dimsSvg"></g>

    <!-- 测量线 -->
    <g id="gMeasure" pointer-events="none" v-html="measureSvg"></g>

    <!-- 拖拽辅助：同类家具虚线框 / 对齐辅助线 / 压墙警示 -->
    <g id="gAssist" pointer-events="none">
      <rect v-for="(b, i) in ui.assist" :key="'ab' + i" class="assist-box"
        :x="b.cx - b.hw - 80" :y="b.cy - b.hh - 80"
        :width="(b.hw + 80) * 2" :height="(b.hh + 80) * 2"/>

      <line v-for="(g, i) in ui.guides" :key="'ag' + i" class="assist-guide"
        :x1="g.x1" :y1="g.y1" :x2="g.x2" :y2="g.y2"/>

      <template v-if="ui.dragBad && ui.dragRect">
        <rect class="bad-box" :x="ui.dragRect.x" :y="ui.dragRect.y"
          :width="ui.dragRect.w" :height="ui.dragRect.h"/>
        <text class="bad-tip" :x="ui.dragRect.x + ui.dragRect.w / 2" :y="badTipY"
          :font-size="200" text-anchor="middle" stroke="#fff" stroke-width="36" paint-order="stroke">
          {{ ui.dragReason === 'door'
            ? tr('挡住门扇开启范围', 'Blocks the door swing')
            : tr('与墙体 / 门窗重叠', 'Overlaps a wall / opening') }}
        </text>
      </template>
    </g>

    <!-- 选中框 / 手柄 -->
    <g id="gSel" v-html="selSvg"></g>
  </svg>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlanStore, useUiStore, useViewStore, isOpenableType, ELEM_KINDS } from '@/stores/index.js';
import { setPlanSvg } from '@/shared/dom/planSvg.js';
import { usePlanInteraction } from '@/workspace/plan2d/interaction/usePlanInteraction.js';
import { ROOMS, WALLS, WINS, DOORS, SLIDES, NOLABEL, COARSE, aabb, wallRect } from '@/core/model/plan.js';
import { shapePath, roomArea, shapePieces } from '@/core/geometry/region.js';
import { planHasDims } from '@/core/plans/index.js';
import { furnSVG } from '@/core/library/furnSvg.js';
import { isClimbType } from '@/core/library/index.js';
import { tr, nm } from '@/i18n.js';
import { DEFS } from '@/workspace/plan2d/render/defs.js';
import { staticDimsSvg, autoDimsSvg } from '@/workspace/plan2d/render/dims.js';
import { measureSvg as buildMeasureSvg } from '@/workspace/plan2d/render/measure.js';

const plan = usePlanStore();
const uiStore = useUiStore();
const viewStore = useViewStore();
const { state, getF, projectWallT } = plan;
const { ui } = uiStore;
const { view, size, fitView } = viewStore;
const { viewBox } = storeToRefs(viewStore);
const { activeWall, planId } = storeToRefs(plan);

const svgEl = ref(null);
const { onDown, onMove, onUp, onWheel, onDblClick, onContextMenu } = usePlanInteraction();

onMounted(() => {
  setPlanSvg(svgEl.value);
  const el = svgEl.value;
  ro = new ResizeObserver(() => {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w) return;
    if (!had){
      size.w = w; size.h = h; had = true;
      fitView();
    } else {
      view.x0 -= (w - size.w)/2/view.s;
      view.y0 -= (h - size.h)/2/view.s;
      size.w = w; size.h = h;
    }
  });
  ro.observe(el);
  if (el.clientWidth && !had){
    size.w = el.clientWidth; size.h = el.clientHeight; had = true;
    fitView();
  }
});
let ro = null, had = false;
onBeforeUnmount(() => { if (ro) ro.disconnect(); setPlanSvg(null); });

/* ======================= 静态片段 ======================= */
const HALO = { stroke: '#fbf9f4', 'stroke-width': 45, 'paint-order': 'stroke', 'stroke-linejoin': 'round' };

/* 计算属性：用户新增的门窗 / 飘窗也要参与渲染（已删除的不画） */
/* 非一层不展示入户门：上层只保留门洞，不画门扇 / 门槛 / 入户箭头 */
const isUpper = computed(() => (plan.state.levels.find(l => l.id === plan.state.activeLevel)?.elev || 0) > 0);
const gone = (pfx, i) => state.demolished.includes(pfx + i)
  || (pfx === 'nd' && isUpper.value && !!DOORS[i]?.entry);
/* 挑空房间：无地板，2D 只画虚线轮廓 */
const isVoid = r => state.rooms[r.id]?.mat === 'void';
const SILLS = computed(() => [
  ...DOORS.filter((_, i) => !gone('nd', i)).map(d => d.rect),
  ...SLIDES.filter((_, i) => !gone('ns', i)).map(d => d.rect)
]);
/* 名称 / 面积文案的锚点：房间被区域盖掉后跟着剩余几何走；整块被盖掉则不显示 */
const labelAt = r => (r.netPieces ? r.netAt : r.at) || null;
const labelled = computed(() => ROOMS.filter(r => !!labelAt(r)));

/* 尺寸标注 / 测量线的 SVG 片段由 render/ 生成，这里只做数据选择 */
const dimsSvg = computed(() => planHasDims(planId.value) ? staticDimsSvg : autoDimsSvg(ROOMS, WALLS, DOORS, gone));
const measureSvg = computed(() => buildMeasureSvg(state.measures, ui, view.s));

/* 压墙提示的位置：上方空间不够时放到家具下方，避免被视口 / 顶栏裁掉 */
const badTipY = computed(() => {
  const r = ui.dragRect;
  if (!r) return 0;
  return r.y - 70 > view.y0 + 260 ? r.y - 70 : r.y + r.h + 210;
});

/* 家具占地（含旋转）→ 平面多边形 */
const furnPoly = f => {
  const a = f.rot*Math.PI/180, c = Math.cos(a), s = Math.sin(a), hw = f.w/2, hd = f.d/2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [f.cx + x*c - y*s, f.cy + x*s + y*c]);
};

/* 下层房间轮廓虚影：切换楼层时帮助上下层对位（虚线、无填充、不参与命中）
 * 下层通往本层的楼梯（上行）也一并画出，夹层能看清从哪上来 */
const lowerSvg = computed(() => {
  if (!ui.layers.lower) return '';
  const s = plan.levelBelowSnapshot?.();
  if (!s) return '';
  const rooms = s.rooms.map(r =>
    `<path d="${shapePath({ poly: r.poly, holes: r.holes || [] })}" fill="none" stroke="#a89c8a" stroke-width="1.3" stroke-dasharray="8 6" vector-effect="non-scaling-stroke" opacity=".6"/>`
  ).join('');
  const stairs = (s.furniture || [])
    .filter(f => isClimbType(f.type) && (f.sdir ?? 1) > 0)
    .map(f => `<path d="${shapePath({ poly: furnPoly(f) })}" fill="#a89c8a" fill-opacity=".12" stroke="#8f8271" stroke-width="1.2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke" opacity=".8"/>`)
    .join('');
  return rooms + stairs;
});


/* ======================= 图层数据 ======================= */

const iconOf = f => furnSVG(f.type, f.w, f.d, f.color, f.sdir ?? 1);
const showLabel = f => Math.min(f.w, f.d) >= 380 && !NOLABEL.includes(f.type);
const labelSize = f => Math.max(80, Math.min(170, Math.min(f.w, f.d)*.2));

/* 选中门窗组件时，可开洞的墙（非承重墙 / 矮墙 / 外墙）高亮，提示可以开在这些墙上 */
const hintOpenable = computed(() =>
  ui.tool === 'demolish' && activeWall.value && activeWall.value.kind !== 'wall');

/* 某段矩形是否已被「未拆除」的墙完全覆盖（例如「延长合并」后残留的旧墙） */
const wallsCovered = (x0, y0, x1, y1) => WALLS.some((w, i) => {
  if (state.demolished.includes('w' + i)) return false;
  const wx0 = Math.min(w[0], w[2]), wx1 = Math.max(w[0], w[2]);
  const wy0 = Math.min(w[1], w[3]), wy1 = Math.max(w[1], w[3]);
  return wx0 <= x0 + 1 && wy0 <= y0 + 1 && wx1 >= x1 - 1 && wy1 >= y1 - 1;
});

const walls = computed(() => {
  const list = WALLS.map((w, i) => {
  const [x0, y0, x1, y1, k] = w, id = 'w' + i;
  const dem = state.demolished.includes(id);
  // 已拆除、但被其它墙完全覆盖的墙段（如「延长合并」后残留的旧墙）无需再画
  if (dem && wallsCovered(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1))) return null;
  let fill, extra = {};
  if (k === 'low'){ fill = '#e9e3d8'; extra = { stroke: '#8f897d', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }; }
  else if (k === 'b') fill = ui.layers.bearing ? '#b8412c' : '#26241f';
  else if (k === 'e') fill = '#8f897d';
  // 玻璃墙面：半透明淡蓝 + 细描边，与实体墙区分
  else if (k === 'g'){
    fill = '#dceef5'; extra = { stroke: '#4f7394', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke', 'fill-opacity': .85 };
  }
  else fill = '#a7a195';
  if (dem){
    fill = 'rgba(198,91,58,.12)';
    extra = { stroke: '#c65b3a', 'stroke-width': 1.2, 'stroke-dasharray': '5 3', 'vector-effect': 'non-scaling-stroke' };
  } else if (hintOpenable.value && isOpenableType(k)){
    extra = { stroke: '#2f8f6a', 'stroke-width': 2.5, 'stroke-dasharray': '7 4', 'vector-effect': 'non-scaling-stroke' };
  }
  return { id, x: x0, y: y0, w: x1 - x0, h: y1 - y0, fill, extra };
  }).filter(Boolean);
  // 非一层：入户门位置补一段非承重墙（入户门只属于一层）
  if (isUpper.value){
    DOORS.forEach((d, i) => {
      if (!d.entry || state.demolished.includes('nd' + i)) return;
      list.push({ id: 'gate' + i, x: d.rect[0], y: d.rect[1],
        w: d.rect[2] - d.rect[0], h: d.rect[3] - d.rect[1], fill: '#a7a195', extra: {} });
    });
  }
  return list;
});

/* 画墙预览：A 点已确定时，实时显示 90° 墙体 + 长度 */
const wallDrawSvg = computed(() => {
  const it = activeWall.value;
  if (!it || it.kind !== 'wall' || !ui.wallA || !ui.wallB) return '';
  const k = 1/view.s;
  // 沿旧墙同轴绘制且墙型一致 → 沿用旧墙类型 / 厚度（延长合并）；
  // 墙型不同 → 按所选类型绘制（覆盖转换），预览与实际落墙保持一致
  const sn = ui.wallSnap;
  const along = sn && (sn.horiz ? ui.wallAxis === 'h' : ui.wallAxis === 'v');
  const same = along && sn.type === it.sub;
  const type = same ? sn.type : it.sub;
  const [x0, y0, x1, y1] = wallRect(ui.wallA, ui.wallB, same ? sn.t : projectWallT(type), type);
  const len = Math.max(x1 - x0, y1 - y0);
  const col = type === 'b' ? '#b8412c' : type === 'g' ? '#4f7394' : '#2f8f6a';
  const S = `stroke="${col}" stroke-width="1.6" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"`;
  return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${col}" opacity=".3" ${S}/>`
    + `<circle cx="${ui.wallA.x}" cy="${ui.wallA.y}" r="${4*k}" fill="${col}"/>`
    + `<text x="${(x0 + x1)/2}" y="${(y0 + y1)/2 - 10*k}" font-size="${13*k}" text-anchor="middle" font-weight="600" fill="${col}" stroke="#fff" stroke-width="${3.5*k}" paint-order="stroke">${len} mm</text>`;
});

/* 画墙起点提示：选中墙体组件、尚未落点时，鼠标悬浮在已有墙体上的小绿点 */
const wallHoverSvg = computed(() => {
  const h = ui.wallHover;
  if (!h) return '';
  const k = 1/view.s, r = (COARSE ? 7 : 5)*k;
  return `<circle cx="${h.x}" cy="${h.y}" r="${r}" fill="#2f8f6a" stroke="#fff" stroke-width="${1.5*k}"/>`;
});

/* 门窗洞口 + 入户标识 */
const openingsSvg = computed(() => {
  const WS = 'stroke="#4f7394" stroke-width="1" vector-effect="non-scaling-stroke"';
  let s = '';

  /* 入户门标注：橙色箭头指向门洞 + 「入户」文案（位置随门洞与开启方向计算，不写死坐标） */
  function entryMark(d){
    const [rx0, ry0, rx1, ry1] = d.rect;
    const mx = (rx0 + rx1)/2, my = (ry0 + ry1)/2;
    const C = '#b5653a', GAP = 230, LEN = 1000, HEAD = 250, WING = 155;
    const stroke = `fill="none" stroke="${C}" stroke-width="2" vector-effect="non-scaling-stroke"`;
    if ((ry1 - ry0) > (rx1 - rx0)){                        // 门洞沿 y → 墙竖直 → 箭头水平
      const dir = Math.sign(-d.o[0]) || -1;                // 室外方向 = 开启方向的反向
      const apex = (dir > 0 ? rx1 : rx0) + dir*GAP, tail = apex + dir*LEN;
      return `<path d="M${tail} ${my}H${apex}" ${stroke}/>`
        + `<path d="M${apex + dir*HEAD} ${my - WING}L${apex} ${my}L${apex + dir*HEAD} ${my + WING}" ${stroke}/>`
        + `<text x="${tail - dir*40}" y="${my - 155}" font-size="200" fill="${C}" text-anchor="${dir < 0 ? 'start' : 'end'}">${tr('入户', 'Entry')}</text>`;
    }
    const dir = Math.sign(-d.o[1]) || -1;                  // 门洞沿 x → 墙水平 → 箭头竖直
    const apex = (dir > 0 ? ry1 : ry0) + dir*GAP, tail = apex + dir*LEN;
    return `<path d="M${mx} ${tail}V${apex}" ${stroke}/>`
      + `<path d="M${mx - WING} ${apex + dir*HEAD}L${mx} ${apex}L${mx + WING} ${apex + dir*HEAD}" ${stroke}/>`
      + `<text x="${mx + 220}" y="${(tail + apex)/2}" font-size="200" fill="${C}">${tr('入户', 'Entry')}</text>`;
  }
  WINS.forEach(([x0, y0, x1, y1], i) => {
    if (gone('nw', i)) return;
    const w = x1 - x0, h = y1 - y0;
    s += `<rect data-open="win:${i}" x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#f7fbfd" ${WS}/>`;
    // 窗棂线不参与点击，让点击落到下面的洞口矩形上
    if (w >= h) [1/3, 2/3].forEach(t => { s += `<line x1="${x0}" y1="${y0 + h*t}" x2="${x1}" y2="${y0 + h*t}" ${WS} pointer-events="none"/>`; });
    else [1/3, 2/3].forEach(t => { s += `<line x1="${x0 + w*t}" y1="${y0}" x2="${x0 + w*t}" y2="${y1}" ${WS} pointer-events="none"/>`; });
  });
  const DS = 'stroke="#3d3a34" stroke-width="1" vector-effect="non-scaling-stroke"';
  DOORS.forEach((d, i) => {
    if (gone('nd', i)) return;
    const [rx0, ry0, rx1, ry1] = d.rect;
    const T = 40;
    const col = d.entry ? '#b5653a' : '#3d3a34';
    /* 门扇：单开一扇；双开门两扇对开（各自以洞口一端为铰点，朝房间同侧开启） */
    let leaves;
    if (d.dbl){
      const [hx, hy] = d.h, hz = (rx1 - rx0) >= (ry1 - ry0);
      const h2 = hz
        ? [Math.abs(hx - rx0) <= Math.abs(hx - rx1) ? rx1 : rx0, hy]
        : [hx, Math.abs(hy - ry0) <= Math.abs(hy - ry1) ? ry1 : ry0];
      const L = Math.max(rx1 - rx0, ry1 - ry0)/2;
      leaves = [[hx, hy, d.c, L], [h2[0], h2[1], [-d.c[0], -d.c[1]], L]];
    } else {
      leaves = [[d.h[0], d.h[1], d.c, d.len]];
    }
    // 一个门 = 一个元素：洞口命中区 + 门扇 + 开启弧线（入户门再带上「箭头 + 入户」文案），整组用 <g> 包住，
    // 选中 / 拖动 / 删除时三者一起。
    let g = `<rect x="${rx0}" y="${ry0}" width="${rx1 - rx0}" height="${ry1 - ry0}" fill="transparent"/>`;
    for (const [hx, hy, c, L] of leaves){
      const ox = hx + d.o[0]*L, oy = hy + d.o[1]*L, cx = hx + c[0]*L, cy = hy + c[1]*L;
      const sweep = d.o[0]*c[1] - d.o[1]*c[0] > 0 ? 1 : 0;
      g += `<polygon points="${hx},${hy} ${ox},${oy} ${ox + c[0]*T},${oy + c[1]*T} ${hx + c[0]*T},${hy + c[1]*T}" fill="#fff" stroke="${col}" stroke-width="${d.entry ? 1.8 : 1}" vector-effect="non-scaling-stroke"/>`
        + `<path d="M${ox} ${oy}A${L} ${L} 0 0 ${sweep} ${cx} ${cy}" fill="none" ${DS} stroke-dasharray="5 3" opacity=".7" pointer-events="none"/>`;
    }
    if (d.entry) g += entryMark(d);
    s += `<g data-open="door:${i}">${g}</g>`;
  });
  SLIDES.forEach(({ rect: [x0, y0, x1, y1], v }, i) => {
    if (gone('ns', i)) return;
    s += `<rect data-open="slide:${i}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="transparent"/>`;
    // 门扇本身不参与点击，由上面的透明命中区统一接收
    if (v){
      const L = y1 - y0, m = (x0 + x1)/2;
      s += `<rect x="${m - 45}" y="${y0}" width="40" height="${L*.55}" fill="#fff" ${DS} pointer-events="none"/>`
         + `<rect x="${m + 5}" y="${y1 - L*.55}" width="40" height="${L*.55}" fill="#fff" ${DS} pointer-events="none"/>`;
    } else {
      const L = x1 - x0, m = (y0 + y1)/2;
      s += `<rect x="${x0}" y="${m - 45}" width="${L*.55}" height="40" fill="#fff" ${DS} pointer-events="none"/>`
         + `<rect x="${x1 - L*.55}" y="${m + 5}" width="${L*.55}" height="40" fill="#fff" ${DS} pointer-events="none"/>`;
    }
  });
  return s;
});

/* 门窗放置预览：鼠标停在可开洞的墙上时，绿色显示与元素等大的可放置区域 */
const openHoverSvg = computed(() => {
  const h = ui.openHover;
  if (!h) return '';
  const [x0, y0, x1, y1] = h.rect, k = 1/view.s;
  return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#2f8f6a" opacity=".34" stroke="#2f8f6a" stroke-width="2" stroke-dasharray="7 4" vector-effect="non-scaling-stroke"/>`
    + `<text x="${(x0 + x1)/2}" y="${(y0 + y1)/2 - 8*k}" font-size="${12*k}" text-anchor="middle" font-weight="600" fill="#2f8f6a" stroke="#fff" stroke-width="${3*k}" paint-order="stroke">${h.len} mm</text>`;
});



/* 区域绘制预览：A → B 矩形、扣除墙体门窗后的区域、吸附指示 */
const regionSvg = computed(() => {
  const d = ui.regionDraw;
  if (!d) return '';
  const k = 1/view.s;
  let s = '';

  if (d.a){
    s += `<circle cx="${d.a.x}" cy="${d.a.y}" r="${4*k}" fill="#b5653a" stroke="#fff" stroke-width="${1.2*k}"/>`;
  }

  if (d.a && d.b){
    const pv = plan.regionPreview(d.a, d.b);
    if (pv){
      const { rect } = pv;
      // 没接在墙体 / 已有区域上：红色警示（提交时会被拒绝）
      const ok = pv.connected !== false;
      const col = ok ? '#b5653a' : '#b8412c';
      // 原始矩形（A → B）
      s += `<rect x="${rect.x0}" y="${rect.y0}" width="${rect.x1 - rect.x0}" height="${rect.y1 - rect.y0}" fill="none" stroke="${col}" stroke-width="1.1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" opacity=".6"/>`;
      // 扣掉墙体 / 门窗后真正成为区域的形状
      if (pv.shape){
        s += `<path d="${shapePath(pv.shape)}" fill-rule="evenodd" fill="${ok ? 'rgba(181,101,58,.16)' : 'rgba(184,65,44,.14)'}" stroke="${col}" stroke-width="1.8" vector-effect="non-scaling-stroke"${ok ? '' : ' stroke-dasharray="8 4"'}/>`;
      }
      if (rect.x1 - rect.x0 >= 200 && rect.y1 - rect.y0 >= 200){
        const cx = (rect.x0 + rect.x1)/2, cy = (rect.y0 + rect.y1)/2;
        const txt = `${rect.x1 - rect.x0} × ${rect.y1 - rect.y0} mm · ${pv.area.toFixed(2)} m²`;
        s += `<text x="${cx}" y="${cy}" font-size="${12*k}" text-anchor="middle" font-weight="600" fill="${col}" stroke="#fff" stroke-width="${3.4*k}" paint-order="stroke">${txt}</text>`;
      }
      if (!ok && pv.shape){
        s += `<text x="${d.b.x}" y="${d.b.y - 14*k}" font-size="${11*k}" text-anchor="middle" font-weight="600" fill="#b8412c" stroke="#fff" stroke-width="${3.2*k}" paint-order="stroke">${tr('需与墙体或已有区域相连', 'Must touch a wall or an existing area')}</text>`;
      }
    }
  }

  // 吸附指示：方块 = 顶点，圆环 = 边线，实心点 = 网格
  const sn = ui.regionSnap;
  if (sn){
    const r = 5*k;
    if (sn.kind === 'vertex'){
      s += `<rect x="${sn.x - r}" y="${sn.y - r}" width="${2*r}" height="${2*r}" fill="none" stroke="#2f8f6a" stroke-width="${1.8*k}"/>`;
    } else if (sn.kind === 'edge'){
      s += `<circle cx="${sn.x}" cy="${sn.y}" r="${r*.8}" fill="none" stroke="#2f8f6a" stroke-width="${1.6*k}"/>`;
    } else {
      s += `<circle cx="${sn.x}" cy="${sn.y}" r="${2.6*k}" fill="#2f8f6a" opacity=".75"/>`;
    }
  }
  return s;
});

/* 选中框 + 旋转 / 缩放手柄 */
const selSvg = computed(() => {
  const k = 1/view.s;
  let s = '';
  if (ui.sel?.kind === 'furn'){
    const f = getF(ui.sel.id);
    if (f){
      const p = 5*k, A = 'stroke="#b5653a" vector-effect="non-scaling-stroke"';
      const hs = COARSE ? 1.7 : 1;
      const ro = (COARSE ? 40 : 26)*k, hit = (COARSE ? 24 : 11)*k;
      const sx = f.w/2 + p, sy = f.d/2 + p;
      s += `<g transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">`
        + `<rect x="${-f.w/2 - p}" y="${-f.d/2 - p}" width="${f.w + 2*p}" height="${f.d + 2*p}" fill="none" ${A} stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>`
        + `<line x1="0" y1="${-f.d/2 - p}" x2="0" y2="${-f.d/2 - ro}" ${A} stroke-width="1" pointer-events="none"/>`
        + `<circle data-handle="rot" cx="0" cy="${-f.d/2 - ro}" r="${hit}" fill="transparent"/>`
        + `<circle data-handle="rot" cx="0" cy="${-f.d/2 - ro}" r="${6*hs*k}" fill="#fff" ${A} stroke-width="1.5"><title>${tr('拖动旋转（Shift 自由角度）', 'Drag to rotate (Shift for free angle)')}</title></circle>`
        + `<circle data-handle="size" cx="${sx}" cy="${sy}" r="${hit}" fill="transparent"/>`
        + `<rect data-handle="size" x="${sx - 5*hs*k}" y="${sy - 5*hs*k}" width="${10*hs*k}" height="${10*hs*k}" fill="#b5653a"><title>${tr('拖动调整尺寸', 'Drag to resize')}</title></rect></g>`;
      const { hh } = aabb(f);
      s += `<text x="${f.cx}" y="${f.cy + hh + 24*k}" font-size="${12*k}" text-anchor="middle" fill="#b5653a" font-weight="600" pointer-events="none" stroke="#fff" stroke-width="${3*k}" paint-order="stroke">${f.w} × ${f.d}</text>`;
    }
  } else if (ui.sel?.kind === 'room'){
    const r = ROOMS.find(x => x.id === ui.sel.id);
    // 与面积一致：选中框按「扣掉区域后」的几何块绘制
    if (r) s += shapePieces(r).map(pc =>
      `<path d="${shapePath(pc)}" fill-rule="evenodd" fill="rgba(181,101,58,.08)" stroke="#b5653a" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>`).join('');
  } else if (ui.sel && ELEM_KINDS.includes(ui.sel.kind)){
    // 墙面元素（墙体 / 门 / 窗 / 推拉门）：橙色虚线边框表示选中
    const { kind, i } = ui.sel;
    const r = kind === 'wall' ? WALLS[i]
      : kind === 'win'  ? WINS[i]
      : kind === 'door' ? DOORS[i]?.rect
      : SLIDES[i]?.rect;
    if (r){
      const pad = 1*k;
      s += `<rect x="${r[0] - pad}" y="${r[1] - pad}" width="${(r[2] - r[0]) + 2*pad}" height="${(r[3] - r[1]) + 2*pad}" fill="rgba(198,91,58,.18)" stroke="#c65b3a" stroke-width="2.5" stroke-dasharray="9 5" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
    }
  }
  return s;
});
</script>
