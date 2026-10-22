/* ============================================================================
 *  多语言：简体 / English
 *  lang 是 ref —— 模板里调用 tr() / nm() 时读取了 lang.value，
 *  因此语言切换会由 Vue 的响应式系统自动触发重新渲染，无需手动遍历 DOM。
 * ========================================================================== */
import { ref } from 'vue';

const LANG_KEY = 'huxing-lang';
const LANGS = ['zh', 'en'];

function initialLang(){
  try {
    const l = localStorage.getItem(LANG_KEY);
    return LANGS.includes(l) ? l : 'zh';
  } catch (e) { return 'zh'; }
}

export const lang = ref(initialLang());

const NAMES_EN = {
  '主卧室': 'Master Bedroom', '主卫浴': 'Master Bath', '小孩房': "Kids' Room", '客卫浴': 'Guest Bath', '洗衣阳台': 'Laundry Balcony',
  '子女房': "Children's Room", '厨房': 'Kitchen', '餐厅': 'Dining', '过道': 'Hallway', '客厅': 'Living Room', '休闲阳台': 'Leisure Balcony',
  '主卧飘窗': 'Master Bay Window', '子女房飘窗': "Children's Bay Window", '区域': 'Area', '飘窗': 'Bay Window',
  '入户区': 'Entry Area', '入户走廊': 'Entry Corridor', '空间': 'Space', '主卧': 'Master Bed', '次卧': 'Second Bed',
  '老人房': 'Elder Bedroom', '儿童房': "Kids' Room", '主卫': 'Master Bath', '起居': 'Family Living',
  '家庭室': 'Family Room', '书房': 'Study', '走廊': 'Corridor', '独栋洋房': 'Detached Villa',
  '橡木地板': 'Oak Flooring', '胡桃木地板': 'Walnut Flooring', '暖色地砖': 'Warm Tile', '冷色地砖': 'Cool Tile', '大理石': 'Marble',
  '防滑砖': 'Anti-slip Tile', '水磨石': 'Terrazzo', '满铺地毯': 'Wall-to-wall Carpet', '水泥地': 'Cement Floor',
  '草坪': 'Lawn', '池塘': 'Pond', '柏油路': 'Asphalt Road',
  '人行道砖': 'Sidewalk Paving', '路缘石': 'Curb', '绿篱': 'Hedge', '种植土': 'Planting Soil',
  '车道线': 'Lane Line', '斑马线': 'Crosswalk', '井盖': 'Manhole', '户外 · 道路': 'Outdoor & Road',
  '卧室': 'Bedroom', '餐厨': 'Dining & Kitchen', '卫浴': 'Bathroom', '家电': 'Appliances', '书房 · 休闲': 'Study & Leisure',
  '双人床 1.8m': 'Double Bed 1.8m', '双人床 1.5m': 'Double Bed 1.5m', '双人床': 'Double Bed', '单人床': 'Single Bed', '婴儿床': 'Crib',
  '床头柜': 'Nightstand', '衣柜': 'Wardrobe', '小衣柜': 'Small Wardrobe', '梳妆台': 'Dresser', '书桌': 'Desk', '椅子': 'Chair',
  '书架': 'Bookshelf', '飘窗垫': 'Bay Cushion', '三人沙发': '3-Seat Sofa', '双人沙发': 'Loveseat', '转角沙发': 'Corner Sofa',
  '单人沙发': 'Armchair', '懒人沙发': 'Beanbag', '茶几': 'Coffee Table', '边几': 'Side Table', '电视柜': 'TV Stand', '地毯': 'Rug',
  '鞋柜': 'Shoe Cabinet', '玄关柜': 'Entry Cabinet', '落地灯': 'Floor Lamp', '绿植': 'Plant', '大绿植': 'Large Plant',
  '餐桌': 'Dining Table', '六人餐桌': '6-Seat Dining Table', '圆桌': 'Round Table', '餐椅': 'Dining Chair', '岛台': 'Kitchen Island',
  '吧椅': 'Bar Stool', '橱柜台面': 'Kitchen Counter', '燃气灶': 'Gas Stove', '水槽': 'Sink', '冰箱': 'Fridge', '餐边柜': 'Sideboard',
  '马桶': 'Toilet', '蹲便器': 'Squat Toilet', '浴室柜': 'Vanity', '双盆浴室柜': 'Double Vanity', '淋浴房': 'Shower',
  '开放式淋浴房': 'Open Shower', '淋浴区': 'Shower Area', '浴缸': 'Bathtub',
  '洗衣机': 'Washer', '洗衣池': 'Laundry Sink', '升降式晾衣杆': 'Lift Drying Rack', '电热水器': 'Water Heater', '储物柜': 'Storage Cabinet', '65 寸电视': '65" TV',
  '55 寸电视': '55" TV', '对开门冰箱': 'French-door Fridge', '柜机空调': 'Floor AC', '挂机空调': 'Wall AC', '洗碗机': 'Dishwasher',
  '蒸烤箱高柜': 'Oven Tower', '烘干机': 'Dryer', '空气净化器': 'Air Purifier', '长书桌': 'Long Desk', '办公椅': 'Office Chair',
  '大书架': 'Large Bookshelf', '立式钢琴': 'Upright Piano', '跑步机': 'Treadmill', '阅读椅': 'Reading Chair', '茶桌': 'Tea Table', '休闲椅': 'Lounge Chair',
  '楼层': 'Floors & Stairs', '步梯': 'Staircase', '旋转步梯': 'Spiral Stair', '电梯': 'Elevator', '电梯（扶梯）': 'Escalator',
  '车行坡道': 'Vehicle Ramp', 'L型步梯': 'L-shaped Stair',
  '隔断': 'Partitions', '走廊扶手': 'Corridor Railing', '屏风': 'Screen', '柱子': 'Pillar', '圆柱': 'Column',
  '户外 · 车库': 'Outdoor & Garage', '轿车': 'Sedan', 'SUV': 'SUV', 'MPV': 'MPV', '停车位': 'Parking Space',
  '路灯': 'Street Lamp', '灌木': 'Shrub', '樟树': 'Camphor Tree',
  '玄关': 'Foyer', '客卧': 'Guest Room', '家政间': 'Utility Room', '楼梯厅': 'Stair Hall', '起居二': 'Lounge',
  '花园草坪': 'Garden Lawn', '入户小径': 'Entry Path', '停车坪': 'Parking Lot', '花园别墅': 'Garden Villa',
  // 商业 / 公共：商场样板与公共空间道具
  '商业 · 公共': 'Commercial & Public', '货架': 'Shelving', '收银台': 'Cashier Counter',
  '导视立牌': 'Wayfinding Sign', '垃圾箱': 'Trash Bin', '长椅': 'Bench', '栏杆': 'Railing',
  '商场样板': 'Mall Sample', '北商铺': 'North Shop', '南商铺': 'South Shop',
  '中央通道': 'Main Concourse', '中庭': 'Atrium', '卫生间': 'Restroom', '母婴室': 'Baby Room',
  '商业': 'Commercial', '主力店': 'Anchor Store',
};

export const tr = (zh, en) => lang.value === 'en' ? en : zh;

/** 名称本地化：支持「区域 2」这类自动加序号的名称 */
export function nm(s){
  if (lang.value === 'en'){
    if (NAMES_EN[s]) return NAMES_EN[s];
    const m = /^(.+?)\s(\d+)$/.exec(String(s ?? ''));
    if (m && NAMES_EN[m[1]]) return `${NAMES_EN[m[1]]} ${m[2]}`;
    return s;
  }
  return s;
}

const HTML_LANG = { zh: 'zh-CN', en: 'en' };

/* 楼层名：地上「一层 / 二层」、夹层「夹层」、地下「负一层 / 负二层」（no 为负数）。
 * LevelBar 与属性面板的楼层面积表共用，避免两边各写一套中英文 */
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function levelName(lv){
  if (!lv) return '';
  if (lv.kind === 'loft') return tr('夹层', 'Loft');
  const no = Number(lv.no) || 1;
  if (no < 0){
    const k = -no;
    return k <= CN_NUM.length ? tr(`负${CN_NUM[k - 1]}层`, `B${k}`) : tr(`负${k}层`, `B${k}`);
  }
  return no <= CN_NUM.length ? tr(`${CN_NUM[no - 1]}层`, `Level ${no}`) : tr(`${no}层`, `Level ${no}`);
}

export function setLang(l){
  if (!LANGS.includes(l) || l === lang.value) return;
  lang.value = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  document.documentElement.lang = HTML_LANG[l];
  document.title = tr('户型装修设计', 'Floor Plan Designer');
}

export function initLang(){
  document.documentElement.lang = HTML_LANG[lang.value];
  document.title = tr('户型装修设计', 'Floor Plan Designer');
}
