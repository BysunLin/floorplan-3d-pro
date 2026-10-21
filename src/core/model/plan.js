/* ============================================================================
 *  户型静态数据（单位 mm，原点 = 左侧外墙内皮 / 顶部外墙内皮）
 *  所有数值均按原始户型图尺寸标注推算：
 *  上：1580/240/2760/240/1540/240/3670 = 10270
 *  下：2180/240/2160/240/5450/240/1340 = 11850
 *  左：3370/1580/240/2770/240/2360 = 10560
 *  右：3370/240/2760/240/3950 = 10560
 *
 *  本模块只导出「数据 + 纯函数」，可被 2D / 3D 安全共用。
 *
 *  几何（墙体/窗/门/推拉门/房间/视口边界）是 reactive 的：切换户型时
 *  setGeometry() 原地替换内容，2D 平面图与 3D 场景会自动重渲染，无需
 *  逐个组件重新挂载。
 * ========================================================================== */
import { reactive } from 'vue';

/* ---------- 单位与视口 ---------- */
export const PX_MM = 25.4 / 96;                                // 1 CSS px = 0.2646 mm
export const COARSE = matchMedia('(pointer:coarse)').matches;  // iPad / 手机等触屏为主的设备
export const TAP = COARSE ? 9 : 4;                              // 手指按下后移动超过该像素才算拖动
export const narrow = () => matchMedia('(max-width:1100px)').matches;
export const BOUNDS = reactive({ x: -1850, y: -1750, w: 15600, h: 14100 });

/* ---------- 墙体 ---------- */
// [x0,y0,x1,y1,类型]  b=承重(黑) e=外墙 n=可拆非承重 low=矮墙
export const WALLS = reactive([
  // 顶部外墙
  [1580,-240,2120,0,'b'],[1580,0,1820,300,'b'],[2120,-240,4580,0,'e'],[4580,-240,5140,0,'e'],
  [5760,-240,6050,0,'e'],[6050,-240,6600,0,'b'],[6360,0,6600,300,'b'],[6600,-240,9960,0,'e'],
  [9960,-240,10510,0,'b'],[10270,0,10510,300,'b'],
  // 右侧外墙
  [10270,300,10510,800,'e'],[10270,2600,10510,3090,'e'],[10270,3090,10510,4260,'b'],
  [10270,5740,10510,6370,'b'],[9960,6370,10510,6610,'b'],[10270,6610,10510,7400,'b'],
  [10270,9770,10510,10560,'b'],[9960,10560,10510,10800,'b'],
  // 底部 / 阳台
  [4580,10560,9960,10800,'e'],[10510,10560,12090,10800,'e'],[11850,9960,12090,10560,'e'],
  // 客厅左墙（入户门两侧）
  [4580,9200,4820,10560,'e'],[4580,7960,4820,8310,'e'],
  // 餐厅 / 厨房外墙
  [3620,7960,4580,8200,'e'],[2180,7960,3620,8200,'b'],[2180,7590,2420,7960,'b'],[2180,7400,2420,7590,'n'],
  [-240,7960,2180,8200,'e'],[-240,3610,0,7960,'e'],
  // 洗衣阳台
  [0,4950,200,5190,'n'],[200,4950,1275,5190,'low'],[1580,3370,2420,3825,'b'],
  [2180,4430,2420,5796,'n'],[2090,4950,2180,5190,'n'],
  // 客卫
  [2420,4950,4580,5190,'n'],[4580,3280,4820,4075,'n'],[4580,4860,4820,5190,'n'],[2420,3370,4580,3610,'n'],
  // 小孩房 / 主卫
  [4580,0,4820,2400,'n'],[4820,2080,6360,2320,'n'],[6360,300,6600,1198,'n'],[6360,1983,6600,2400,'n'],
  // 过道 / 主卧 / 子女房
  [6083,3370,6600,3707,'b'],[6360,3280,6600,3370,'n'],[6600,3370,9960,3610,'n'],[9960,3370,10270,3610,'b'],
  [6083,4600,6323,6610,'n'],[6323,6370,9960,6610,'n'],
]);

/* ---------- 窗 ---------- */
export const WINS = reactive([
  [5140,-240,5760,0],[1580,300,1820,3370],[-240,3370,1580,3610],[2180,3825,2420,4430],
  [10510,6370,12090,6610],[11850,6610,12090,9960],
  // 飘窗（主卧 / 子女房）
  [10510,660,11130,760],[11030,760,11130,2650],[10510,2650,11130,2750],
  [10510,4110,11130,4210],[11030,4210,11130,5785],[10510,5785,11130,5885],
]);

/* ---------- 平开门：洞口、铰点、关闭方向、开启方向、门宽 ---------- */
export const DOORS = reactive([
  {name: '小孩房门', rect: [4580,2400,4820,3280], h: [4580,3280], c: [0,-1], o: [-1,0], len: 880},
  {name: '主卧门',   rect: [6360,2400,6600,3280], h: [6600,3280], c: [0,-1], o: [1,0],  len: 880},
  {name: '主卫门',   rect: [6360,1198,6600,1983], h: [6360,1198], c: [0,1],  o: [-1,0], len: 785},
  {name: '客卫门',   rect: [4580,4075,4820,4860], h: [4580,4860], c: [0,-1], o: [-1,0], len: 785},
  {name: '子女房门', rect: [6083,3707,6323,4600], h: [6323,4600], c: [0,-1], o: [1,0],  len: 893},
  {name: '入户门',   rect: [4580,8310,4820,9200], h: [4820,9200], c: [0,-1], o: [1,0], len: 890, entry: true},
]);

/* ---------- 推拉门 ---------- */
export const SLIDES = reactive([
  {rect: [10270,7400,10510,9770], v: true},
  {rect: [1275,4950,2090,5190],  v: false},
]);

/* ---------- 飘窗洞口过梁 ----------
 * 飘窗洞口在外墙上是通高的缺口，这里补上「洞口上缘以上」的一段墙：
 * [[x0, y0, x1, y1], 洞口上缘高度]，属于户型静态几何（随 setGeometry 一起切换）。 */
export const LINTELS = reactive([
  [[10270, 800, 10510, 2600], 2.4],       // 主卧飘窗
  [[10270, 4260, 10510, 5740], 2.4],      // 子女房飘窗
]);

const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/* ---------- 房间（poly = 墙体净尺寸多边形；at = 标签锚点） ---------- */
export const ROOMS = reactive([
  {id: 'master', name: '主卧室',   poly: R(6600,0,10270,3370), mat: 'wood',     at: [8435,2420]},
  {id: 'mbath',  name: '主卫浴',   poly: R(4820,0,6360,2080),   mat: 'antislip', at: [5980,1780]},
  {id: 'kid',    name: '小孩房',   poly: R(1820,0,4580,3370),   mat: 'wood',     at: [3380,2330]},
  {id: 'gbath',  name: '客卫浴',   poly: R(2420,3610,4580,4950), mat: 'antislip', at: [3760,4620]},
  {id: 'laundry',name: '洗衣阳台', poly: R(0,3610,2180,4950),   mat: 'antislip', at: [1250,4330]},
  {id: 'child',  name: '子女房',   poly: R(6323,3610,10270,6370), mat: 'wood',     at: [8850,4850]},
  {id: 'kitchen',name: '厨房',     poly: R(0,5190,2180,7960),  mat: 'tile600',  at: [1300,6500]},
  {id: 'dining', name: '餐厅',
    poly: [[2420,5190],[4820,5190],[4820,7960],[2420,7960],[2420,7400],[2180,7400],[2180,5796],[2420,5796]],
    mat: 'tile800', at: [3900,5520]},
  {id: 'hall',  name: '过道',
    poly: [[4820,2320],[6360,2320],[6360,3370],[6083,3370],[6083,6610],[4820,6610]],
    mat: 'tile800', at: [5450,4450]},
  {id: 'living', name: '客厅',     poly: R(4820,6610,10270,10560), mat: 'tile800', at: [7600,7560]},
  {id: 'balcony',name: '休闲阳台', poly: R(10510,6610,11850,10560), mat: 'walnut',  at: [11180,9450]},
  {id: 'bay1',  name: '主卧飘窗',
    poly: [[10270,800],[10510,800],[10510,760],[11030,760],[11030,2650],[10510,2650],[10510,2600],[10270,2600]],
    mat: 'marble', counted: false},
  {id: 'bay2',  name: '子女房飘窗',
    poly: [[10270,4260],[10510,4260],[10510,4210],[11030,4210],[11030,5785],[10510,5785],[10510,5740],[10270,5740]],
    mat: 'marble', counted: false},
]);

/* ---------- 地面材料 ---------- */
export const MATS = {
  wood:     {name: '橡木地板',   price: 320, sw: '#d8b88a'},
  walnut:   {name: '胡桃木地板', price: 380, sw: '#9b7250'},
  tile800:  {name: '暖色地砖',   price: 220, sw: '#e7d8bd'},
  tile600:  {name: '冷色地砖',   price: 160, sw: '#d9e2e6'},
  marble:   {name: '大理石',     price: 650, sw: '#f1eee8'},
  antislip: {name: '防滑砖',     price: 140, sw: '#d3d8d4'},
  terrazzo: {name: '水磨石',     price: 280, sw: '#e6dfd3'},
  carpet:   {name: '满铺地毯',   price: 200, sw: '#c9c3d3'},
  cement:   {name: '水泥地',     price: 0,   sw: '#bfbcb6'},
  asphalt:  {name: '柏油路',     price: 180, sw: '#3f3f42'},
  lawn:     {name: '草坪',       price: 120, sw: '#a9c78a'},
  pond:     {name: '池塘',       price: 480, sw: '#7fb6c9'},
  // 市政 / 户外：道路、人行道、绿篱、种植土（区域与户外地面用）
  sidewalk: {name: '人行道砖',   price: 160, sw: '#cdc8bd'},
  curb:     {name: '路缘石',     price: 120, sw: '#d8d5cd'},
  hedge:    {name: '绿篱',       price: 90,  sw: '#6f9455'},
  soil:     {name: '种植土',     price: 40,  sw: '#6b5540'},
  // 挑空：无地板（仅夹层及以上楼层可选），2D 用虚线轮廓、3D 不生成地面/天花
  void:     {name: '挑空',       price: 0,   sw: 'repeating-linear-gradient(45deg,#e7e2da 0 6px,#d6d0c6 6px 12px)'},
};

/* ---------- 2D 平面上不显示名称的家具类型 ---------- */
export const NOLABEL = ['plant', 'floorlamp', 'sidetable', 'barstool', 'beanbag',
  // 户外 / 车库：图例本身已经足够清楚，不再叠名称
  'car', 'suv', 'mpv', 'parking', 'streetlamp', 'shrub', 'camphor',
  // 道路标线（贴地装饰）
  'lane', 'crosswalk', 'manhole'];

/* ======================= 几何 / 格式化 ======================= */
export const area  = poly => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i+1) % poly.length]; return a + p[0]*q[1] - q[0]*p[1]; }, 0)) / 2 / 1e6;
export const perim = poly => poly.reduce((a, p, i) => { const q = poly[(i+1) % poly.length]; return a + Math.hypot(q[0]-p[0], q[1]-p[1]); }, 0) / 1000;
export const bbox  = poly => { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
export function aabb(f){
  const a = f.rot * Math.PI/180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { hw: f.w/2*c + f.d/2*s, hh: f.w/2*s + f.d/2*c };
}
export const norm = a => ((Math.round(a) % 360) + 360) % 360;
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 贴墙吸附：参与吸附的矩形（未拆墙体 + 窗） */
export function snapRectsOf(state){
  return WALLS.filter((w, i) => !state.demolished.includes('w' + i)).concat(WINS);
}

/* ---------- 画墙辅助 ---------- */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 户型外轮廓：墙体 + 房间 / 区域的包围盒（画墙时不允许超出这个范围）。
 *  夹层使用独立几何（可能没有外墙）时，用楼板区域的包围盒兜底；
 *  连区域都没有就用视口边界，避免出现 Infinity 让取点 / 夹取失效。 */
function planEnvelope(){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  for (const w of WALLS){ add(w[0], w[1]); add(w[2], w[3]); }
  for (const r of ROOMS) for (const [x, y] of r.poly || []) add(x, y);
  if (!Number.isFinite(x0)) return [BOUNDS.x, BOUNDS.y, BOUNDS.x + BOUNDS.w, BOUNDS.y + BOUNDS.h];
  return [x0, y0, x1, y1];
}

/** 把一个点夹进户型外轮廓（并吸附到 10mm 网格） */
export function clampPt(p){
  const [x0, y0, x1, y1] = planEnvelope();
  return { x: Math.round(clamp(p.x, x0, x1)/10)*10, y: Math.round(clamp(p.y, y0, y1)/10)*10 };
}

/**
 * 90° 正交取点：从 a 出发，按鼠标位置自动选择水平 / 垂直。
 * @param flip         传 true 可强制取另一条轴（Shift 切换）
 * @param force        传 'h' / 'v' 时忽略鼠标方向，强制水平 / 垂直（起点吸附到墙边时用，
 *                     保证新墙与所吸附的墙 90° 垂直）
 * @param clampToPlan  默认 true：夹在户型外轮廓内（不出外墙）；
 *                     传 false 时不夹取 —— 允许从外墙向外延伸 / 在户外绘制。
 */
export function axisPoint(a, m, flip = false, force = null, clampToPlan = true){
  const [x0, y0, x1, y1] = planEnvelope();
  const horiz = force === 'h' ? true
    : force === 'v' ? false
    : (flip ? Math.abs(m.x - a.x) < Math.abs(m.y - a.y) : Math.abs(m.x - a.x) >= Math.abs(m.y - a.y));
  const g = v => Math.round(v/10)*10;
  const gx = clampToPlan ? g(clamp(m.x, x0, x1)) : g(m.x);
  const gy = clampToPlan ? g(clamp(m.y, y0, y1)) : g(m.y);
  return horiz
    ? { x: gx, y: a.y, horiz: true }
    : { x: a.x, y: gy, horiz: false };
}

/** A、B 两点 + 墙厚 → 墙体矩形 [x0,y0,x1,y1,type]（长轴方向加长，短轴方向加厚） */
export function wallRect(a, b, t, type){
  const h = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const x0 = Math.min(a.x, b.x) - (h ? 0 : t/2);
  const x1 = Math.max(a.x, b.x) + (h ? 0 : t/2);
  const y0 = Math.min(a.y, b.y) - (h ? t/2 : 0);
  const y1 = Math.max(a.y, b.y) + (h ? t/2 : 0);
  return [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), type];
}

/** 点是否落在多边形内（射线法） */
export function inPoly(x, y, poly){
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi)*(y - yi)/(yj - yi) + xi) c = !c;
  }
  return c;
}

/* 切换户型：原地替换几何内容（ESM 绑定是同一对象，所有导入方立即可见；
   reactive 数组会让 2D 模板重新渲染）。g 由 makePlan() 提供。 */
export function setGeometry(g){
  WALLS.splice(0, WALLS.length, ...g.walls);
  WINS.splice(0, WINS.length, ...g.wins);
  DOORS.splice(0, DOORS.length, ...g.doors);
  SLIDES.splice(0, SLIDES.length, ...g.slides);
  LINTELS.splice(0, LINTELS.length, ...(g.lintels || []));
  ROOMS.splice(0, ROOMS.length, ...g.rooms);
  if (g.bounds) Object.assign(BOUNDS, g.bounds);
}
