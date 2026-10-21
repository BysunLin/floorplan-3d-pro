/* ============================================================================
 *  家具库目录 + 默认布置方案 + 本地持久化
 * ========================================================================== */
import { ROOMS } from '@/core/model/plan.js';

/* 家具库：[类型, 名称, 宽, 深, 颜色] */
export const LIB = [
  {cat: '卧室', items: [
    ['bed', '双人床 1.8m', 1800, 2000, '#c9d6df'], ['bed', '双人床 1.5m', 1500, 2000, '#d8c7dc'], ['bed', '单人床', 1200, 2000, '#e8d5b5'],
    ['crib', '婴儿床', 1250, 700, '#efe3d0'], ['nightstand', '床头柜', 450, 400, '#e8dccb'], ['wardrobe', '衣柜', 2000, 600, '#efe6d8'],
    ['wardrobe', '小衣柜', 1200, 550, '#efe6d8'], ['dresser', '梳妆台', 1000, 450, '#efe6d8'], ['desk', '书桌', 1200, 600, '#e2cfb4'],
    ['chair', '椅子', 450, 480, '#cfc6b8'], ['bookshelf', '书架', 800, 300, '#e2cfb4'], ['baycushion', '飘窗垫', 520, 1800, '#e7dccd']]},
  {cat: '客厅', items: [
    ['sofa', '三人沙发', 2400, 900, '#b7c4b0'], ['sofa', '双人沙发', 1700, 880, '#c3cbd6'], ['cornersofa', '转角沙发', 2800, 1700, '#b7c4b0'],
    ['armchair', '单人沙发', 850, 850, '#d6b99a'], ['beanbag', '懒人沙发', 800, 800, '#e0b98f'], ['coffeetable', '茶几', 1300, 650, '#e8dccb'],
    ['sidetable', '边几', 500, 500, '#d9c3a3'], ['tvstand', '电视柜', 2400, 400, '#e2cfb4'], ['rug', '地毯', 2400, 1700, '#d9cbb8'],
    ['shoecab', '鞋柜', 1000, 350, '#efe6d8'], ['shoecab', '玄关柜', 1400, 380, '#e6dccc'], ['floorlamp', '落地灯', 450, 450, '#3d3a34'],
    ['plant', '绿植', 500, 500, '#a9c39b'], ['plant', '大绿植', 700, 700, '#9dbb8c']]},
  {cat: '餐厨', items: [
    ['table', '餐桌', 1400, 800, '#e2cfb4'], ['table', '六人餐桌', 1800, 900, '#d8c2a2'], ['roundtable', '圆桌', 1000, 1000, '#e2cfb4'],
    ['chair', '餐椅', 450, 480, '#cfc6b8'], ['island', '岛台', 1800, 900, '#e9e5de'], ['barstool', '吧椅', 420, 420, '#6b5d4c'],
    ['counter', '橱柜台面', 1600, 600, '#e9e5de'], ['stove', '燃气灶', 750, 450, '#dcdcdc'], ['ksink', '水槽', 800, 450, '#e1e6ea'],
    ['fridge', '冰箱', 700, 700, '#dfe4e8'], ['cabinet', '餐边柜', 1600, 400, '#efe6d8']]},
  {cat: '卫浴', items: [
    ['toilet', '马桶', 400, 700, '#ffffff'], ['squattoilet', '蹲便器', 450, 600, '#ffffff'],
    ['vanity', '浴室柜', 800, 500, '#eef1f3'], ['vanity', '双盆浴室柜', 1200, 500, '#eef1f3'],
    ['shower', '淋浴房', 900, 900, '#e4edf2'], ['openshower', '开放式淋浴房', 900, 900, '#e4edf2'],
    ['bathtub', '浴缸', 1600, 750, '#eef3f6'], ['washer', '洗衣机', 600, 600, '#e6ebee'],
    ['dryingrack', '升降式晾衣杆', 1600, 400, '#c9ced3'],
    ['waterheater', '电热水器', 800, 450, '#f4f4f2'], ['cabinet', '储物柜', 1000, 400, '#efe6d8']]},
  {cat: '家电', items: [
    ['tv', '65 寸电视', 1450, 80, '#1d1d1f'], ['tv', '55 寸电视', 1230, 80, '#1d1d1f'], ['fridge', '对开门冰箱', 910, 700, '#c9ced3'],
    ['aircon', '柜机空调', 500, 380, '#f6f7f8'], ['acwall', '挂机空调', 900, 250, '#f6f7f8'], ['dishwasher', '洗碗机', 600, 600, '#c9ced3'],
    ['ovencol', '蒸烤箱高柜', 600, 600, '#efe6d8'], ['dryer', '烘干机', 600, 600, '#e6ebee'], ['purifier', '空气净化器', 400, 300, '#f4f4f2']]},
  {cat: '书房 · 休闲', items: [
    ['desk', '长书桌', 1600, 700, '#d8c2a2'], ['officechair', '办公椅', 620, 620, '#4a4f55'], ['bookshelf', '大书架', 1600, 350, '#e2cfb4'],
    ['piano', '立式钢琴', 1500, 600, '#1f1d1b'], ['treadmill', '跑步机', 800, 1800, '#3a3a3c'], ['armchair', '阅读椅', 750, 800, '#c9a98a']]},
  {cat: '隔断', items: [
    ['screen', '屏风', 1600, 40, '#c9b79a'], ['pillar', '柱子', 400, 400, '#e9e3d8'], ['column', '圆柱', 400, 400, '#e9e3d8'],
    ['railing', '走廊扶手', 1600, 100, '#c9a06a']]},
  {cat: '楼层', items: [
    ['stair', '步梯', 1200, 3000, '#d3c8b6'], ['spiralstair', '旋转步梯', 1800, 1800, '#d3c8b6'],
    ['elevator', '电梯', 1600, 1500, '#c9ced3'], ['escalator', '电梯（扶梯）', 1100, 3600, '#c9ced3'],
    ['lstair', 'L型步梯', 3000, 3000, '#d3c8b6'], ['ramp', '车行坡道', 3000, 6000, '#b9b6b0']]},
  {cat: '户外 · 车库', items: [
    ['car', '轿车', 4600, 1800, '#c8ccd2'], ['suv', 'SUV', 4800, 1950, '#3f4753'],
    ['mpv', 'MPV', 5100, 1950, '#e2e5e8'], ['parking', '停车位', 2500, 5000, '#8d949c'],
    ['streetlamp', '路灯', 400, 400, '#5a6068'], ['shrub', '灌木', 900, 900, '#6f9b57'],
    ['camphor', '樟树', 3200, 3200, '#4e7c46']]},
  {cat: '户外 · 道路', items: [
    ['lane', '车道线', 6000, 150, '#f2f4f5'], ['crosswalk', '斑马线', 4000, 3000, '#f2f4f5'],
    ['manhole', '井盖', 700, 700, '#4a4d51']]},
];

const typeColor = t => {
  for (const c of LIB) for (const i of c.items) if (i[0] === t) return i[4];
  return '#eee';
};

/* 楼层类元素：climb = 有上下标高（步梯 / 旋转步梯 / 扶梯），电梯固定平层 */
export const FLOOR_TYPES = ['stair', 'lstair', 'spiralstair', 'elevator', 'escalator', 'ramp'];
export const CLIMB_TYPES = ['stair', 'lstair', 'spiralstair', 'escalator', 'ramp'];
export const isClimbType = t => CLIMB_TYPES.includes(t);
export const isFloorType = t => FLOOR_TYPES.includes(t);
/* 有上下标高、但「不切上层楼板 / 不产生梯井」的类型（地下车库坡道是室外构筑物） */
export const NO_OPENING_TYPES = ['ramp'];
export const isOpeningFreeType = t => NO_OPENING_TYPES.includes(t);

/* ---------- 家具对象 ---------- */
let _n = 1;
export const uid = () => 'f' + Date.now().toString(36) + (_n++);
export const F = (type, name, cx, cy, w, d, rot = 0, color) => {
  const f = { id: uid(), type, name, cx, cy, w, d, rot, color: color || typeColor(type) };
  if (isClimbType(type)) f.sdir = 1;      // 默认上行（1 上行 / -1 下行）
  return f;
};

export function defaultFurniture(){ return [
  // 主卧
  F('bed', '双人床', 8300, 1000, 1800, 2000, 0, '#c9d6df'), F('nightstand', '床头柜', 7150, 220, 450, 400), F('nightstand', '床头柜', 9450, 220, 450, 400),
  F('wardrobe', '衣柜', 8800, 3070, 2400, 600, 180), F('baycushion', '飘窗垫', 10770, 1705, 520, 1800),
  // 主卫
  F('shower', '淋浴房', 5270, 450, 900, 900), F('toilet', '马桶', 5170, 1500, 400, 700, 270), F('vanity', '浴室柜', 6110, 700, 800, 500, 90),
  // 小孩房
  F('bed', '单人床', 2420, 1000, 1200, 2000, 0, '#e8d5b5'), F('desk', '书桌', 2120, 2700, 1200, 600, 270), F('chair', '椅子', 2700, 2700, 450, 480, 90),
  F('wardrobe', '衣柜', 4280, 1000, 1600, 600, 90), F('bookshelf', '书架', 3500, 150, 800, 300),
  // 客卫
  F('shower', '淋浴区', 2870, 4280, 900, 1340), F('toilet', '马桶', 3560, 3960, 400, 700), F('vanity', '浴室柜', 4150, 3850, 700, 480),
  // 洗衣阳台
  F('washer', '洗衣机', 300, 3960, 600, 600, 270), F('vanity', '洗衣池', 250, 4600, 600, 500, 270),
  // 厨房
  F('counter', '橱柜台面', 300, 6575, 2770, 600, 270), F('counter', '橱柜台面', 1390, 7660, 1580, 600, 180),
  F('stove', '燃气灶', 300, 6200, 750, 450, 270), F('ksink', '水槽', 1400, 7680, 800, 450, 180),
  // 餐厅
  F('fridge', '冰箱', 2770, 5540, 700, 700), F('table', '餐桌', 3600, 6650, 1400, 800, 90),
  F('chair', '餐椅', 2940, 6320, 450, 480, 270), F('chair', '餐椅', 4260, 6320, 450, 480, 90),
  F('chair', '餐椅', 2940, 6980, 450, 480, 270), F('chair', '餐椅', 4260, 6980, 450, 480, 90),
  F('cabinet', '餐边柜', 3500, 7785, 1600, 350, 180),
  // 客厅
  F('rug', '地毯', 7600, 8950, 2600, 1800), F('tvstand', '电视柜', 7600, 6810, 2400, 400), F('sofa', '三人沙发', 7600, 10110, 3000, 900, 180),
  F('coffeetable', '茶几', 7600, 8900, 1300, 650), F('armchair', '单人沙发', 9500, 8900, 850, 850, 90),
  F('shoecab', '鞋柜', 4995, 9900, 1000, 350, 270), F('plant', '绿植', 9950, 10250, 500, 500), F('plant', '绿植', 5250, 7050, 500, 500),
  // 子女房
  F('bed', '双人床', 7323, 5500, 1500, 2000, 270, '#d8c7dc'), F('wardrobe', '衣柜', 8500, 3910, 2000, 600),
  F('desk', '书桌', 9500, 6070, 1200, 600, 180), F('chair', '椅子', 9500, 5480, 450, 480), F('baycushion', '飘窗垫', 10770, 4997, 520, 1575),
  // 休闲阳台
  F('roundtable', '茶桌', 11180, 8200, 600, 600), F('armchair', '休闲椅', 11180, 7520, 750, 750, 0, '#d6b99a'),
  F('armchair', '休闲椅', 11180, 8880, 750, 750, 180, '#d6b99a'), F('plant', '绿植', 11550, 10250, 500, 500),
];}

export function defaultState(){
  const rooms = {};
  // light = 顶灯款式：'round' 圆形 / 'square' 正方形 / 'rect' 长方形（默认圆形）
  ROOMS.forEach(r => { rooms[r.id] = { name: r.name, mat: r.mat, light: 'round' }; });
  return {
    furniture: defaultFurniture(), rooms, demolished: [], measures: [],
    // 用户新增的墙体 / 门窗 / 飘窗（拆改墙体模式下产生，与户型静态几何分开存）
    walls: [], wins: [], doors: [], slides: [], bays: [],
    // 用户绘制的「区域」（选择模式 → 房间 → 区域绘制）+ 户型自带的入户走廊
    regions: [],
    // 已删除的内置房间 id：户型自带的房间（ROOMS 静态定义）无法直接改数组，
    // 用一个标记集合记录哪些被删，syncUserGeom 重建 ROOMS 时跳过它们。
    deletedRooms: [],
    // 已补过「户型自带区域」的户型（含版本号）：防止删掉入户走廊后刷新又冒出来
    regionSeed: '',
    // 楼层（Phase 1）：levels 只存元信息；非当前楼层的数据存在 levelData，
    // 当前楼层数据就是上面这些平铺字段（家具 / 墙体 / 房间…）。
    levels: [{ id: 'L1', no: 1, name: '一层', kind: 'floor', elev: 0, clearH: 2800 }],
    activeLevel: 'L1',
    levelData: {},
    // 墙体 / 门窗的自定义名称：{'w3':'主卧隔墙','nw2':'客厅窗'}
    elemNames: {},
    // 内置户型几何版本：与计划定义的 geoVersion 不一致时丢弃旧的拆改增量
    geoVersion: 1
  };
}

/* ---------- 本地存储 ---------- */
const STORE = 'huxing-design-v1';

export function load(){
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && Array.isArray(s.furniture)) return fixState(s);
  } catch (e) {}
  return null;
}

export function save(state){
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
}

export function fixState(s){
  const d = defaultState();
  s.rooms = Object.assign(d.rooms, s.rooms || {});
  // 旧存档 / 用户区域可能没有顶灯款式：统一补成圆形
  for (const k in s.rooms) if (!s.rooms[k].light) s.rooms[k].light = 'round';
  s.demolished = s.demolished || [];
  s.measures = s.measures || [];
  s.walls  = s.walls  || [];
  s.wins   = s.wins   || [];
  s.doors  = s.doors  || [];
  s.slides = s.slides || [];
  s.bays   = s.bays   || [];
  s.regions = s.regions || [];
  s.deletedRooms = s.deletedRooms || [];
  s.regionSeed = s.regionSeed || '';
  // 楼层（Phase 1）：旧存档（单层）自动迁移成只有 L1 的结构
  if (!Array.isArray(s.levels) || !s.levels.length)
    s.levels = [{ id: 'L1', no: 1, name: '一层', kind: 'floor', elev: 0, clearH: 2800 }];
  // 地下层（kind = 'basement'，elev < 0，no < 0）：补齐字段并按标高排序，
  // 旧存档 / 导入的方案也能正确排到「负一层」位置
  for (const l of s.levels){
    if (!l.kind) l.kind = 'floor';
    l.no = Number.isFinite(Number(l.no)) ? Number(l.no) : 1;
    l.elev = Number.isFinite(Number(l.elev)) ? Number(l.elev) : 0;
    l.clearH = Number.isFinite(Number(l.clearH)) ? Number(l.clearH) : 2800;
    if (!l.name) l.name = l.elev < 0 ? `负${Math.abs(l.no) || 1}层` : `${l.no || 1}层`;
  }
  s.levels.sort((a, b) => (a.elev || 0) - (b.elev || 0) || (b.no || 0) - (a.no || 0));
  if (!s.activeLevel || !s.levels.some(l => l.id === s.activeLevel)) s.activeLevel = s.levels[0].id;
  s.levelData = s.levelData || {};
  s.elemNames = s.elemNames || {};
  s.geoVersion = s.geoVersion || 1;
  // 旧存档里的楼梯没有方向字段：统一按「上行」补齐
  for (const f of s.furniture) if (isClimbType(f.type) && f.sdir !== 1 && f.sdir !== -1) f.sdir = 1;
  return s;
}
