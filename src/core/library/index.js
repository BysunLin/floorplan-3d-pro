/* ============================================================================
 *  家具库目录 + 默认布置方案 + 本地持久化
 * ========================================================================== */
import { ROOMS } from '@/core/model/plan.js';
import { splitDocumentPlan, joinDocumentPlan } from '@/core/nodes/document.js';
import { ASSET_MANIFEST } from './assets/manifest.js';

/* 家具库：[类型, 名称, 宽, 深, 颜色]，按「住宅 / 商业 / 户外」三大类分组（scope） */
export const LIB = [
  {cat: '卧室', scope: 'home', items: [
    ['bed', '双人床 1.8m', 1800, 2000, '#c9d6df'], ['bed', '双人床 1.5m', 1500, 2000, '#d8c7dc'], ['bed', '单人床', 1200, 2000, '#e8d5b5'],
    ['crib', '婴儿床', 1250, 700, '#efe3d0'], ['nightstand', '床头柜', 450, 400, '#e8dccb'], ['wardrobe', '衣柜', 2000, 600, '#efe6d8'],
    ['wardrobe', '小衣柜', 1200, 550, '#efe6d8'], ['dresser', '梳妆台', 1000, 450, '#efe6d8'], ['desk', '书桌', 1200, 600, '#e2cfb4'],
    ['chair', '椅子', 450, 480, '#cfc6b8'], ['bookshelf', '书架', 800, 300, '#e2cfb4'], ['baycushion', '飘窗垫', 520, 1800, '#e7dccd']]},
  {cat: '客厅', scope: 'home', items: [
    ['sofa', '三人沙发', 2400, 900, '#b7c4b0'], ['sofa', '双人沙发', 1700, 880, '#c3cbd6'], ['cornersofa', '转角沙发', 2800, 1700, '#b7c4b0'],
    ['armchair', '单人沙发', 850, 850, '#d6b99a'], ['beanbag', '懒人沙发', 800, 800, '#e0b98f'], ['coffeetable', '茶几', 1300, 650, '#e8dccb'],
    ['sidetable', '边几', 500, 500, '#d9c3a3'], ['tvstand', '电视柜', 2400, 400, '#e2cfb4'], ['rug', '地毯', 2400, 1700, '#d9cbb8'],
    ['shoecab', '鞋柜', 1000, 350, '#efe6d8'], ['shoecab', '玄关柜', 1400, 380, '#e6dccc'], ['floorlamp', '落地灯', 450, 450, '#3d3a34'],
    ['plant', '绿植', 500, 500, '#a9c39b'], ['plant', '大绿植', 700, 700, '#9dbb8c']]},
  {cat: '餐厨', scope: 'home', items: [
    ['table', '餐桌', 1400, 800, '#e2cfb4'], ['table', '六人餐桌', 1800, 900, '#d8c2a2'], ['roundtable', '圆桌', 1000, 1000, '#e2cfb4'],
    ['chair', '餐椅', 450, 480, '#cfc6b8'], ['island', '岛台', 1800, 900, '#e9e5de'], ['barstool', '吧椅', 420, 420, '#6b5d4c'],
    ['counter', '橱柜台面', 1600, 600, '#e9e5de'], ['stove', '燃气灶', 750, 450, '#dcdcdc'], ['ksink', '水槽', 800, 450, '#e1e6ea'],
    ['fridge', '冰箱', 700, 700, '#dfe4e8'], ['cabinet', '餐边柜', 1600, 400, '#efe6d8']]},
  {cat: '卫浴', scope: 'home', items: [
    ['toilet', '马桶', 400, 700, '#ffffff'], ['squattoilet', '蹲便器', 450, 600, '#ffffff'],
    ['vanity', '浴室柜', 800, 500, '#eef1f3'], ['vanity', '双盆浴室柜', 1200, 500, '#eef1f3'],
    ['shower', '淋浴房', 900, 900, '#e4edf2'], ['openshower', '开放式淋浴房', 900, 900, '#e4edf2'],
    ['bathtub', '浴缸', 1600, 750, '#eef3f6'], ['washer', '洗衣机', 600, 600, '#e6ebee'],
    ['dryingrack', '升降式晾衣杆', 1600, 400, '#c9ced3'],
    ['waterheater', '电热水器', 800, 450, '#f4f4f2'], ['cabinet', '储物柜', 1000, 400, '#efe6d8']]},
  {cat: '家电', scope: 'home', items: [
    ['tv', '65 寸电视', 1450, 80, '#1d1d1f'], ['tv', '55 寸电视', 1230, 80, '#1d1d1f'], ['fridge', '对开门冰箱', 910, 700, '#c9ced3'],
    ['aircon', '柜机空调', 500, 380, '#f6f7f8'], ['acwall', '挂机空调', 900, 250, '#f6f7f8'], ['dishwasher', '洗碗机', 600, 600, '#c9ced3'],
    ['ovencol', '蒸烤箱高柜', 600, 600, '#efe6d8'], ['dryer', '烘干机', 600, 600, '#e6ebee'], ['purifier', '空气净化器', 400, 300, '#f4f4f2']]},
  {cat: '书房 · 休闲', scope: 'home', items: [
    ['desk', '长书桌', 1600, 700, '#d8c2a2'], ['officechair', '办公椅', 620, 620, '#4a4f55'], ['bookshelf', '大书架', 1600, 350, '#e2cfb4'],
    ['piano', '立式钢琴', 1500, 600, '#1f1d1b'], ['treadmill', '跑步机', 800, 1800, '#3a3a3c'], ['armchair', '阅读椅', 750, 800, '#c9a98a']]},
  {cat: '隔断', scope: 'home', items: [
    ['screen', '屏风', 1600, 40, '#c9b79a'], ['pillar', '柱子', 400, 400, '#e9e3d8'], ['column', '圆柱', 400, 400, '#e9e3d8'],
    ['railing', '走廊扶手', 1600, 100, '#c9a06a']]},
  {cat: '楼层', scope: 'home', items: [
    ['stair', '步梯', 1200, 3000, '#d3c8b6'], ['spiralstair', '旋转步梯', 1800, 1800, '#d3c8b6'],
    ['elevator', '电梯', 1600, 1500, '#c9ced3'], ['escalator', '电梯（扶梯）', 1100, 3600, '#c9ced3'],
    ['lstair', 'L型步梯', 3000, 3000, '#d3c8b6'], ['ramp', '车行坡道', 3000, 6000, '#b9b6b0']]},
  // 商业 / 公共：商场、沿街商铺、大厅这类公共空间的道具（栏杆沿用隔断里的 railing 模型）
  {cat: '商业 · 公共', scope: 'biz', items: [
    ['shelf', '货架', 1800, 600, '#c9ced3'], ['cashier', '收银台', 2200, 700, '#e2cfb4'],
    ['signpost', '导视立牌', 900, 200, '#3a3a3c'], ['bin', '垃圾箱', 400, 400, '#7d8a80'],
    ['bench', '长椅', 1800, 500, '#c9a678'], ['railing', '栏杆', 2000, 100, '#9aa3a8'],
    ['kiosk', '中岛摊位', 3000, 2000, '#efe6d8']]},
  // 餐饮业态：火锅 / 中餐 / 西餐 / 奶茶 / 咖啡店用到的桌面与后厨设备
  {cat: '商业 · 餐饮', scope: 'biz', items: [
    ['hotpot', '火锅桌', 1400, 1400, '#c9603f'], ['chinesetable', '中餐圆桌', 1800, 1800, '#d8c2a2'],
    ['diningbooth', '卡座', 1600, 1400, '#b5835a'], ['barcounter', '吧台', 2600, 600, '#8d7255'],
    ['teabar', '奶茶操作台', 3000, 700, '#e5ddd0'], ['kitchenline', '商用操作台', 3200, 800, '#c9ced3']]},
  // 零售业态：服装 / 数码 / 美妆 / 珠宝 / 书店 / 超市 / 汽车展厅
  {cat: '商业 · 零售', scope: 'biz', items: [
    ['clothesrack', '服装陈列架', 1200, 500, '#c9ced3'], ['mannequin', '模特', 450, 450, '#e8dfd2'],
    ['fittingroom', '试衣间', 1200, 1200, '#d6c7b2'], ['displaycounter', '展示柜', 1200, 600, '#e8e2d6'],
    ['phonestand', '手机展台', 2400, 1200, '#3a3d42'], ['carstand', '汽车展台', 5200, 2600, '#eceff1'],
    ['gondola', '超市货架', 1400, 900, '#dfe4e8'], ['freezer', '冷藏柜', 1800, 800, '#dce8ee'],
    ['produce', '果蔬陈列台', 2000, 1200, '#c8b49a'], ['cart', '购物车', 900, 550, '#9aa3a8']]},
  {cat: '户外 · 车库', scope: 'out', items: [
    ['car', '轿车', 4600, 1800, '#c8ccd2'], ['suv', 'SUV', 4800, 1950, '#3f4753'],
    ['mpv', 'MPV', 5100, 1950, '#e2e5e8'], ['parking', '停车位', 2500, 5000, '#8d949c'],
    ['streetlamp', '路灯', 400, 400, '#5a6068'], ['shrub', '灌木', 900, 900, '#6f9b57'],
    ['camphor', '樟树', 3200, 3200, '#4e7c46']]},
  // 社区运动场地：含缓冲区的完整场地，可直接摆到总图上
  {cat: '户外 · 运动', scope: 'out', items: [
    ['tennis', '网球场', 36000, 18000, '#3f7c52'], ['basketball', '篮球场', 32000, 19000, '#b4623f'],
    ['football', '足球场', 42000, 22000, '#3f8a4a'], ['badminton', '羽毛球场', 17400, 10100, '#2f7d5a'],
    ['pingpong', '乒乓球场', 8000, 5000, '#2f6fa8'], ['track', '塑胶跑道', 50000, 6000, '#b4553f'],
    ['outgym', '户外健身区', 6000, 4000, '#7a8a5a'],
    ['halfcourt', '半场篮球', 16000, 15000, '#b4623f'], ['gateball', '门球场', 20000, 15000, '#3f7c52'],
    ['skatepark', '轮滑场', 20000, 12000, '#9aa3a8'], ['loopwalk', '环形健身步道', 60000, 40000, '#b4553f'],
    ['petpark', '宠物乐园', 15000, 10000, '#8fbf7a'], ['seniorarea', '老年活动场地', 15000, 12000, '#cbbfa9']]},
  {cat: '户外 · 水景', scope: 'out', items: [
    ['pool', '泳池', 25000, 12500, '#2f9fc0'], ['fountain', '喷泉花坛', 6000, 6000, '#8d949c']]},
  {cat: '户外 · 儿童', scope: 'out', items: [
    ['playground', '儿童乐园', 9000, 7000, '#e0a45a'], ['sandpit', '儿童沙池', 4000, 3000, '#d9c08a']]},
  {cat: '户外 · 景观', scope: 'out', items: [
    ['pavilion', '景观亭', 4500, 4500, '#8a5b3f'], ['pergola', '景观廊架', 6000, 3000, '#8a6a4a'],
    ['planter', '树池花钵', 1600, 1600, '#9a8f7d'], ['rock', '景观石', 2200, 1600, '#8c8f8a'],
    ['lounge', '泳池躺椅', 1900, 700, '#c9b79a'], ['parasol', '遮阳伞', 3000, 3000, '#d8cbb6']]},
  {cat: '户外 · 道路', scope: 'out', items: [
    ['lane', '车道线', 6000, 150, '#f2f4f5'], ['crosswalk', '斑马线', 4000, 3000, '#f2f4f5'],
    ['manhole', '井盖', 700, 700, '#4a4d51']]},
  /* 沙盘模式：地产总图用的楼栋体量 / 配套 / 大尺度景观，按层数参数化生成 3D */
  {cat: '沙盘 · 建筑', scope: 'out', items: [
    ['tower18', '高层塔楼 18F', 42000, 18000, '#d9d2c4'],
    ['tower26', '高层塔楼 26F', 40000, 18000, '#d5cdbf'],
    ['tower33', '高层塔楼 33F', 38000, 18000, '#d1c8b9'],
    ['midrise11', '小高层 11F', 56000, 16000, '#cfc0a9'],
    ['midrise6', '花园洋房 6F', 60000, 16000, '#c9b8a0'],
    ['townhouse', '叠拼别墅 3F', 18000, 13000, '#bb8f6c'],
    ['villa', '独栋别墅 2F', 16000, 13000, '#d8cbb0'],
    ['podium', '商业裙楼 2F', 60000, 24000, '#b8c0c6'],
    ['kindergarten', '幼儿园 3F', 32000, 22000, '#e8b06a']]},
  {cat: '沙盘 · 配套', scope: 'out', items: [
    ['gate', '小区大门', 20000, 6000, '#a89a86'],
    ['evparking', '充电车位', 2500, 5000, '#8d949c'],
    ['parkingrow', '车位组 ×4', 10500, 5000, '#8d949c']]},
  // 地库专项：模块化车库、出入口、出地面构筑物与各类车位
  {cat: '沙盘 · 地库', scope: 'out', items: [
    ['garageslab', '地库顶板覆土', 60000, 40000, '#7a8a5a'],
    ['garagemodule', '地库标准模块', 60000, 40000, '#b9b6b0'],
    ['garageentry', '地库出入口', 8000, 20000, '#9aa3a8'],
    ['garagecore', '出地面楼梯间', 6000, 8000, '#b9b6b0'],
    ['ventwell', '通风采光井', 2500, 2500, '#9aa3a8'],
    ['skylight', '车库采光顶', 8000, 8000, '#7fa7bd'],
    ['garagecol', '地库柱', 600, 600, '#9aa3a8'],
    ['garagefan', '风机房', 6000, 4000, '#b9b6b0'],
    ['fireroll', '防火卷帘', 6000, 300, '#9aa3a8'],
    ['parkingaccessible', '无障碍车位', 3500, 5000, '#8d949c'],
    ['parkingsub', '子母车位', 2500, 7500, '#8d949c'],
    ['parkingcompact', '微型车位', 2200, 3800, '#8d949c'],
    ['speedbump', '减速带', 3500, 350, '#e8b04a'],
    ['garagemirror', '广角镜', 800, 800, '#c9ced3'],
    ['garagesign', '车位引导屏', 2000, 400, '#2f3338'],
    ['civildefense', '人防区域', 20000, 15000, '#9aa3a8'],
    ['storageroom', '储藏间', 3000, 3000, '#b9b6b0'],
    ['equipmentroom', '设备机房', 8000, 6000, '#b9b6b0']]},
  // 交通与场地：城市道路 / 小区路 / 慢行系统 / 交通设施
  {cat: '沙盘 · 交通', scope: 'out', items: [
    ['road4', '城市道路 4 车道', 14000, 7000, '#3f4247'],
    ['road6', '城市道路 6 车道', 21000, 7000, '#3f4247'],
    ['crossroad', '平交路口', 14000, 14000, '#3f4247'],
    ['trafficlight', '红绿灯', 600, 600, '#3a3f44'],
    ['busstop', '公交站', 8000, 2500, '#9aa3a8'],
    ['metroexit', '地铁出入口', 6000, 4000, '#b9b6b0'],
    ['barrier', '道闸', 4000, 500, '#e8e6e0'],
    ['bikeshed', '非机动车棚', 6000, 2500, '#8fa3a8'],
    ['evshed', '充电车棚', 6000, 2500, '#8fa3a8'],
    ['firelane', '消防车道', 12000, 4000, '#6f6b64'],
    ['turnaround', '尽端回车场', 15000, 15000, '#6f6b64'],
    ['firelanehidden', '隐形消防车道', 12000, 4000, '#7a8a5a'],
    ['accessramp', '无障碍坡道', 3000, 1500, '#c9c6c0'],
    ['gardenpath', '园路', 6000, 1500, '#cbbfa9'],
    ['steppingstones', '汀步', 4000, 1200, '#c9c2b6'],
    ['boardwalk', '木栈道', 6000, 2000, '#b98a5a']]},
  {cat: '沙盘 · 景观', scope: 'out', items: [
    ['plaza', '入口广场', 16000, 12000, '#cbbfa9'],
    ['mirrorpool', '镜面水池', 12000, 6000, '#2f9fc0'],
    ['cascade', '跌水景墙', 8000, 2000, '#8d949c'],
    ['dryfountain', '旱喷广场', 8000, 8000, '#9fd6e4'],
    ['stream', '溪流', 15000, 3000, '#2f9fc0'],
    ['deck', '亲水平台', 6000, 4000, '#b98a5a'],
    ['revetment', '驳岸', 10000, 2000, '#8d8a84'],
    ['featurewall', '景墙', 8000, 600, '#cfc7b8'],
    ['sculpture', '雕塑', 2000, 2000, '#c9a24a'],
    ['fence', '围栏', 10000, 100, '#9aa3a8'],
    ['signage', '标识系统', 2500, 600, '#3a3f44'],
    ['lawnlamp', '草坪灯', 300, 300, '#5a6068'],
    ['gardenlamp', '庭院灯', 500, 500, '#5a6068'],
    ['flowerbed', '花境', 6000, 3000, '#c98ad0'],
    ['aquatic', '水生植物', 3000, 2000, '#5d8f46'],
    ['treegrid', '树阵', 12000, 12000, '#4e7c46'],
    ['streetrow', '行道树', 12000, 2000, '#4e7c46'],
    ['zelkova', '榉树', 5500, 5500, '#4e7c46'],
    ['tallow', '乌桕', 5000, 5000, '#8a4a3a'],
    ['palm', '棕榈', 4000, 4000, '#4f8a4a'],
    ['bamboo', '竹丛', 2500, 2500, '#6f9b57'],
    ['lawn', '草坪', 12000, 8000, '#6f9b57'],
    ['hedge', '绿篱', 10000, 800, '#6f8f4f'],
    ['ginkgo', '银杏', 5000, 5000, '#c9b04a'],
    ['cherry', '樱花', 4500, 4500, '#d98aa0'],
    ['osmanthus', '桂花', 3500, 3500, '#4e7c46']]},
  {cat: '沙盘 · 城市', scope: 'out', items: [
    ['landparcel', '用地红线', 80000, 60000, '#c4553f'],
    ['cityblock', '周边建筑体量', 36000, 26000, '#9aa3a8'],
    ['slabblock', '周边板楼', 60000, 15000, '#c9c2b4'],
    ['citytower', '周边塔楼', 32000, 28000, '#b8bec4'],
    ['school', '学校', 60000, 40000, '#d8cdb8'],
    ['hospital', '医院', 50000, 40000, '#e2ded6'],
    ['retailblock', '商业综合体', 50000, 40000, '#c0c8cc'],
    ['citygrid', '城市路网', 60000, 60000, '#4a4d51'],
    ['river', '河流', 60000, 15000, '#2f9fc0'],
    ['lake', '湖泊', 40000, 30000, '#2f9fc0'],
    ['park', '公园', 50000, 40000, '#6f9b57'],
    ['hill', '山体', 80000, 50000, '#6f7f5a'],
    ['metroline', '地铁线 · 站点', 60000, 8000, '#9aa3a8'],
    ['powerline', '高压线', 40000, 6000, '#8d949c'],
    ['substation', '变电站', 8000, 6000, '#b9b6b0']]},
  {cat: '沙盘 · 营销', scope: 'out', items: [
    ['salescenter', '售楼处', 30000, 20000, '#d9d2c4'],
    ['modelhouse', '样板房', 12000, 10000, '#d8cbb0'],
    ['viewpath', '看房通道', 20000, 2000, '#b98a5a'],
    ['hoarding', '围挡', 20000, 300, '#e8e6e0'],
    ['banner', '道旗', 800, 800, '#c4553f'],
    ['lightbox', '广告灯箱', 3000, 600, '#2f3338']]},
  {cat: '沙盘 · 施工', scope: 'out', items: [
    ['crane', '塔吊', 3000, 3000, '#e8b04a'],
    ['foundationpit', '基坑', 30000, 20000, '#8d8a84'],
    ['constructionroad', '施工道路', 12000, 6000, '#a89a86'],
    ['materialyard', '材料堆场', 15000, 10000, '#c9b8a0']]},
];

/* 家具库顶部页签（左侧面板搜索框下方）：按 scope 过滤分类 */
export const LIB_TABS = [
  { id: 'home', name: '住宅',   en: 'Home' },
  { id: 'biz',  name: '商业',   en: 'Commercial' },
  { id: 'out',  name: '户外',   en: 'Outdoor' }
];

/* 自定义资产（core/library/assets/）合并进家具库：按 cat 分组追加，
 * 面板、拖拽、typeColor、plan 校验因此都能自动看到新 type。 */
for (const a of ASSET_MANIFEST){
  const item = [a.type, a.name, a.w, a.d, a.color];
  const grp = LIB.find(g => g.cat === a.cat);
  if (grp) grp.items.push(item);
  else LIB.push({ cat: a.cat, scope: a.scope || 'home', items: [item] });
}

const typeColor = t => {
  for (const c of LIB) for (const i of c.items) if (i[0] === t) return i[4];
  return '#eee';
};

/* 沙盘资产：总图档（LOD.SITE，缩到全盘）也要继续显示，
 * 否则楼栋、广场、成片景观会在缩小查看场地时整体消失。 */
export const SANDBOX_TYPES = [
  'tower18', 'tower26', 'tower33', 'midrise11', 'midrise6', 'townhouse', 'villa', 'podium', 'kindergarten',
  'gate', 'parking', 'evparking', 'parkingrow',
  'garageslab', 'garagemodule', 'garageentry', 'garagecore', 'ventwell', 'skylight', 'garagecol', 'garagefan',
  'fireroll', 'parkingaccessible', 'parkingsub', 'parkingcompact', 'speedbump', 'garagemirror', 'garagesign',
  'plaza', 'mirrorpool', 'cascade', 'lawn', 'hedge', 'ginkgo', 'cherry', 'osmanthus',
  'road4', 'road6', 'crossroad', 'trafficlight', 'busstop', 'metroexit', 'barrier',
  'bikeshed', 'evshed', 'firelane', 'turnaround', 'firelanehidden', 'accessramp',
  'gardenpath', 'steppingstones', 'boardwalk',
  'dryfountain', 'stream', 'deck', 'revetment', 'featurewall', 'sculpture', 'fence',
  'signage', 'lawnlamp', 'gardenlamp', 'flowerbed', 'aquatic', 'treegrid', 'streetrow',
  'zelkova', 'tallow', 'palm', 'bamboo',
  'landparcel', 'cityblock',
  'slabblock', 'citytower', 'school', 'hospital', 'retailblock', 'citygrid',
  'river', 'lake', 'park', 'hill', 'metroline', 'powerline', 'substation',
  'salescenter', 'modelhouse', 'viewpath', 'hoarding', 'banner', 'lightbox',
  'halfcourt', 'gateball', 'skatepark', 'loopwalk', 'petpark', 'seniorarea',
  'civildefense', 'storageroom', 'equipmentroom',
  'crane', 'foundationpit', 'constructionroad', 'materialyard'
];
export const isSandboxType = t => SANDBOX_TYPES.includes(t);

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
    // 墙面材质：{'u12':'glass'}（键 = 元素 uid，见 core/model/uid.js；旧存档的 'w3' 仍可读）
    wallMats: {},
    // 元素 uid 计数器：删元素后不复用，撤销也不回退
    uidSeq: 0,
    // 内置户型几何版本：与计划定义的 geoVersion 不一致时丢弃旧的拆改增量
    geoVersion: 1,
    // 提交版本号：每次 commit 自增，供 Worker / 面板做「按提交刷新」的依赖
    rev: 0,
    // 「导入户型图」识别出的几何：planId 为 imported-* 时，刷新后据此重建户型。
    // 只有几何（几十个矩形 / 多边形），不含原始图片。
    customGeo: null,
    // 场地：楼栋摆放 + 小区道路（多楼栋架构，见 core/model/site.js）
    //   buildings[0].active = true 的那栋就是"当前编辑楼栋"，几何在全局数组里
    site: { buildings: [], roads: [], seq: 1 },
    // 户数：用于车位配比（户均车位）等指标，手动填写
    households: 0,
    // 地库自检规则包：basic / standard / high（见 core/garage/audit.js）
    garagePreset: 'standard'
  };
}

/* ---------- 本地存储 ----------
 * v2：墙 / 门窗 / 区域 / 家具以节点图保存，加载时投影回运行时的扁平数组。
 * v1（旧存档）：顶层直接是 state（含 furniture / walls 数组），仍可读；
 * 下一次保存会自动写成 v2。 */
const STORE = 'huxing-design-v1';
const DOC_MARK = '__planDoc';
const DOC_VERSION = 2;

export function load(){
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (!s) return null;
    if (s[DOC_MARK] >= DOC_VERSION && s.plan && s.nodes)
      return fixState(joinDocumentPlan(s.plan, s.nodes, { strict: true }));
    if (Array.isArray(s.furniture)) return fixState(s);
  } catch (e) {}
  return null;
}

export function save(state){
  try {
    const { plan, nodes } = splitDocumentPlan(state);
    localStorage.setItem(STORE, JSON.stringify({ [DOC_MARK]: DOC_VERSION, plan, nodes }));
  } catch (e) {
    // 万一节点投影失败：退回旧的扁平存储，至少不丢当前工作
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e2) {}
  }
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
  s.wallMats = s.wallMats || {};
  s.uidSeq = Number(s.uidSeq) || 0;
  s.rev = Math.max(0, Math.round(Number(s.rev) || 0));
  s.households = Math.max(0, Math.round(Number(s.households) || 0));
  if (!['basic', 'standard', 'high'].includes(s.garagePreset)) s.garagePreset = 'standard';
  s.geoVersion = s.geoVersion || 1;
  if (!s.customGeo || typeof s.customGeo !== 'object') s.customGeo = null;
  /* 场地（多楼栋）：旧存档没有这个字段 —— 补一个只有「当前楼栋」的场地，
   * 于是老方案天然就是「一栋楼的小区」，不需要任何迁移脚本。 */
  const site = (s.site && typeof s.site === 'object') ? s.site : {};
  s.site = {
    buildings: Array.isArray(site.buildings) ? site.buildings : [],
    roads: Array.isArray(site.roads) ? site.roads : [],
    seq: Number(site.seq) || 1
  };
  s.site.buildings.forEach(b => {
    b.x = Number(b.x) || 0; b.y = Number(b.y) || 0; b.rot = Number(b.rot) || 0;
    if (!b.id) b.id = 'b' + (s.site.seq++);
  });
  if (!s.site.buildings.some(b => b.active)){
    s.site.buildings.unshift({ id: 'b0', active: true, name: '', x: 0, y: 0, rot: 0 });
  }
  // 旧存档里的楼梯没有方向字段：统一按「上行」补齐
  for (const f of s.furniture) if (isClimbType(f.type) && f.sdir !== 1 && f.sdir !== -1) f.sdir = 1;
  return s;
}
