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
  // 高端社区配套：运动场地 / 水景 / 儿童 / 景观
  '户外 · 运动': 'Outdoor & Sports', '网球场': 'Tennis Court', '篮球场': 'Basketball Court',
  '足球场': 'Football Pitch', '羽毛球场': 'Badminton Court', '乒乓球场': 'Table Tennis Court',
  '塑胶跑道': 'Running Track', '户外健身区': 'Outdoor Gym',
  '户外 · 水景': 'Outdoor & Water', '泳池': 'Swimming Pool', '喷泉花坛': 'Fountain Planter',
  '户外 · 儿童': 'Outdoor & Kids', '儿童乐园': 'Playground', '儿童沙池': 'Sandpit',
  '户外 · 景观': 'Outdoor & Landscape', '景观亭': 'Pavilion', '景观廊架': 'Pergola',
  '树池花钵': 'Tree Planter', '景观石': 'Landscape Rock', '泳池躺椅': 'Pool Lounger', '遮阳伞': 'Parasol',
  // 沙盘：楼栋体量 / 配套 / 大尺度景观 / 城市背景
  '沙盘 · 建筑': 'Sandbox · Buildings', '高层塔楼 18F': 'Tower 18F', '高层塔楼 26F': 'Tower 26F',
  '高层塔楼 33F': 'Tower 33F', '小高层 11F': 'Mid-rise 11F', '花园洋房 6F': 'Garden Flats 6F',
  '叠拼别墅 3F': 'Stacked Townhouse 3F', '独栋别墅 2F': 'Detached Villa 2F',
  '商业裙楼 2F': 'Retail Podium 2F', '幼儿园 3F': 'Kindergarten 3F',
  '沙盘 · 配套': 'Sandbox · Amenities', '小区大门': 'Community Gate',
  '充电车位': 'EV Parking', '车位组 ×4': 'Parking Bay ×4',
  '沙盘 · 景观': 'Sandbox · Landscape', '入口广场': 'Entry Plaza',
  '镜面水池': 'Mirror Pool', '跌水景墙': 'Cascade Wall',
  '银杏': 'Ginkgo', '樱花': 'Cherry', '桂花': 'Osmanthus',
  '沙盘 · 城市': 'Sandbox · City', '周边建筑体量': 'Context Buildings',
  // 沙盘 · 地库
  '沙盘 · 地库': 'Sandbox · Basement Garage', '地库标准模块': 'Garage Module',
  '地库出入口': 'Garage Entrance', '出地面楼梯间': 'Stair Core', '通风采光井': 'Vent & Light Well',
  '车库采光顶': 'Garage Skylight', '地库柱': 'Garage Column', '风机房': 'Fan Room',
  '防火卷帘': 'Fire Shutter', '无障碍车位': 'Accessible Parking', '子母车位': 'Tandem Parking',
  '微型车位': 'Compact Parking', '减速带': 'Speed Bump', '广角镜': 'Convex Mirror',
  '车位引导屏': 'Parking Guidance Sign',
  // 车位指标 / 自动排车位
  '车位指标': 'Parking Metrics', '含地库模块自动折算': 'modules counted',
  '总车位': 'Total stalls', '充电': 'EV', '无障碍': 'Accessible',
  '户数': 'Households', '户均车位': 'Stalls per household',
  '充电 / 无障碍占比': 'EV / accessible share',
  '标准车位': 'Standard stalls', '地库模块': 'Garage modules',
  '区域内放不下完整车位': 'No full stall fits inside the area',
  '地库自检': 'Garage Checks', '规范提示': 'rule hints',
  '地库顶板覆土': 'Garage Roof & Soil', '规则包': 'Rule preset', '导出报告': 'Export report',
  // 沙盘 · 交通 / 景观基元 / 强排指标
  '沙盘 · 交通': 'Sandbox · Traffic',
  '城市道路 4 车道': 'Urban Road 4-lane', '城市道路 6 车道': 'Urban Road 6-lane',
  '平交路口': 'Intersection', '红绿灯': 'Traffic Light', '公交站': 'Bus Stop',
  '地铁出入口': 'Metro Entrance', '道闸': 'Barrier Gate', '非机动车棚': 'Bike Shelter',
  '充电车棚': 'EV Shelter', '消防车道': 'Fire Lane', '尽端回车场': 'Turnaround',
  '隐形消防车道': 'Hidden Fire Lane', '无障碍坡道': 'Accessible Ramp', '园路': 'Garden Path',
  '汀步': 'Stepping Stones', '木栈道': 'Boardwalk',
  '旱喷广场': 'Dry Fountain', '溪流': 'Stream', '亲水平台': 'Waterside Deck', '驳岸': 'Revetment',
  '景墙': 'Feature Wall', '雕塑': 'Sculpture', '围栏': 'Fence', '标识系统': 'Signage',
  '草坪灯': 'Lawn Lamp', '庭院灯': 'Garden Lamp', '花境': 'Flower Bed', '水生植物': 'Aquatic Plants',
  '树阵': 'Tree Grid', '行道树': 'Street Trees', '榉树': 'Zelkova', '乌桕': 'Chinese Tallow',
  '棕榈': 'Palm', '竹丛': 'Bamboo', '用地红线': 'Land Parcel Line',
  '强排指标': 'Massing Metrics', '按用地红线': 'red line', '按场地外接范围': 'site extent',
  '用地面积': 'Site area', '总建筑面积': 'Gross floor area', '容积率': 'FAR',
  '建筑密度': 'Coverage', '绿地率': 'Green ratio', '车位 / 户': 'Stalls / household',
  // P1 城市背景 / 营销 / 运动 / 地下；P2 施工
  '沙盘 · 营销': 'Sandbox · Marketing', '沙盘 · 施工': 'Sandbox · Construction',
  '周边板楼': 'Context Slab Block', '周边塔楼': 'Context Tower', '学校': 'School',
  '医院': 'Hospital', '商业综合体': 'Retail Complex', '城市路网': 'City Grid',
  '河流': 'River', '湖泊': 'Lake', '公园': 'Park', '山体': 'Hill',
  '地铁线 · 站点': 'Metro Line · Station', '高压线': 'Power Line', '变电站': 'Substation',
  '售楼处': 'Sales Center', '样板房': 'Model House', '看房通道': 'Viewing Walkway',
  '围挡': 'Hoarding', '道旗': 'Banner', '广告灯箱': 'Lightbox',
  '半场篮球': 'Half-court', '门球场': 'Gateball Court', '轮滑场': 'Skate Park',
  '环形健身步道': 'Loop Trail', '宠物乐园': 'Pet Park', '老年活动场地': 'Senior Area',
  '人防区域': 'Civil Defense', '储藏间': 'Storage Room', '设备机房': 'Equipment Room',
  '塔吊': 'Tower Crane', '基坑': 'Foundation Pit', '施工道路': 'Construction Road',
  '材料堆场': 'Material Yard',
  // 3D 交互 / 季节
  '节庆灯': 'Festive lights', '交互 / 季节': 'Interaction / Season',
  // 性能 HUD
  '性能 HUD': 'Perf HUD', '绘制调用': 'draw calls', '三角面': 'tris',
  '家具': 'furniture', '实例': 'instances', '墙段': 'wall runs',
  '阴影': 'shadow', '开': 'on', '关': 'off',
  '无': 'None', '春 · 花瓣': 'Spring · petals', '秋 · 落叶': 'Autumn · leaves', '冬 · 雪': 'Winter · snow',
  '顶板覆土 / 基坑土方': 'Soil / excavation',
  '基础': 'Basic', '标准': 'Standard', '改善 / 高端': 'Premium',
  '通过': 'OK', '提示': 'Warn', '说明': 'Info',
  '自动排车位': 'Auto parking layout',
  '区域太小：自动排车位至少需要 14×14 m': 'Area too small — auto layout needs at least 14×14 m',
  '未找到可排布的区域': 'No area available for layout',
  '统计范围：全部楼层；地库模块按 2.5m 车位、5.3m 进深、6m 车道折算': 'All floors; modules use 2.5m stalls, 5.3m depth and 6m aisles',
  '玄关': 'Foyer', '客卧': 'Guest Room', '家政间': 'Utility Room', '楼梯厅': 'Stair Hall', '起居二': 'Lounge',
  '花园草坪': 'Garden Lawn', '入户小径': 'Entry Path', '停车坪': 'Parking Lot', '花园别墅': 'Garden Villa',
  // 商业 / 公共：商场样板与公共空间道具
  '商业 · 公共': 'Commercial & Public', '货架': 'Shelving', '收银台': 'Cashier Counter',
  '导视立牌': 'Wayfinding Sign', '垃圾箱': 'Trash Bin', '长椅': 'Bench', '栏杆': 'Railing',
  '商场样板': 'Mall Sample', '北商铺': 'North Shop', '南商铺': 'South Shop',
  '中央通道': 'Main Concourse', '中庭': 'Atrium', '卫生间': 'Restroom', '母婴室': 'Baby Room',
  '商业': 'Commercial', '主力店': 'Anchor Store',
  // 家具库页签 + 商业家具分类
  '住宅': 'Home', '户外': 'Outdoor', '商业 · 餐饮': 'Commercial · Dining', '商业 · 零售': 'Commercial · Retail',
  // 商业 · 餐饮
  '火锅桌': 'Hot Pot Table', '中餐圆桌': 'Round Banquet Table', '卡座': 'Booth Seat',
  '吧台': 'Bar Counter', '奶茶操作台': 'Milk Tea Counter', '商用操作台': 'Commercial Prep Counter',
  // 商业 · 零售
  '服装陈列架': 'Clothes Rack', '模特': 'Mannequin', '试衣间': 'Fitting Room',
  '展示柜': 'Display Case', '手机展台': 'Phone Display', '汽车展台': 'Car Podium',
  '超市货架': 'Gondola Shelf', '冷藏柜': 'Chest Freezer', '果蔬陈列台': 'Produce Table',
  '购物车': 'Shopping Cart', '中岛摊位': 'Kiosk',
  // 商场业态与配套空间
  '火锅店': 'Hot Pot Restaurant', '中餐店': 'Chinese Restaurant', '西餐店': 'Western Restaurant',
  '奶茶店': 'Milk Tea Shop', '咖啡店': 'Café', '服装店': 'Clothing Store',
  '数码产品店': 'Electronics Store', '美妆店': 'Beauty Store', '珠宝店': 'Jewelry Store',
  '书店': 'Bookstore', '运动用品店': 'Sporting Goods', '家居店': 'Home Furnishing',
  '超市': 'Supermarket', '汽车销售店': 'Car Dealership', '后厨': 'Kitchen',
  '门厅': 'Entrance Hall', '电梯厅': 'Elevator Lobby',
  '四门冰箱': '4-Door Fridge', '洽谈桌': 'Meeting Table', '洽谈椅': 'Meeting Chair', '阅读桌': 'Reading Table',
};

export const tr = (zh, en) => lang.value === 'en' ? en : zh;

/** 名称本地化：支持「区域 2」这类自动加序号的名称，以及「火锅店·后厨」这类组合名称 */
export function nm(s){
  if (lang.value === 'en'){
    if (NAMES_EN[s]) return NAMES_EN[s];
    const m = /^(.+?)\s(\d+)$/.exec(String(s ?? ''));
    if (m && NAMES_EN[m[1]]) return `${NAMES_EN[m[1]]} ${m[2]}`;
    const parts = String(s ?? '').split('·');
    if (parts.length > 1 && parts.every(p => !p.trim() || NAMES_EN[p.trim()]))
      return parts.map(p => (p.trim() ? NAMES_EN[p.trim()] : p)).join('·');
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
