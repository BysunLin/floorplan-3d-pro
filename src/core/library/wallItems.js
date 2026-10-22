/* ============================================================================
 *  墙面组件库（拆改墙体模式下替换家具库显示）
 *
 *  kind:
 *    'wall'   —— 需要「点 A 点 → 点 B 点」画一段墙（90° 正交）
 *    'door'   —— 平开门 / 入户门 / 双开门，落在非承重墙 / 外墙上
 *    'slide'  —— 推拉门，落在非承重墙 / 外墙上
 *    'win'    —— 窗，落在非承重墙 / 外墙上
 *    'bay'    —— 飘窗，落在非承重墙 / 外墙上（向房间外侧凸出）
 *
 *  sub 对应 WALLS 里的墙体类型字符（'n' 非承重 / 'b' 承重 / 'g' 玻璃）或门窗种类。
 *  len = 默认洞口长度（mm）。
 * ========================================================================== */

/* 默认墙厚（mm）：非承重 / 玻璃 120，承重 / 外墙 240 */
export const WALL_T = { n: 120, g: 120, b: 240, e: 240 };

export const WALL_LIB = [
  { cat: '墙体', en: 'Walls', items: [
    { id: 'walln', kind: 'wall', sub: 'n', name: '非承重墙', en: 'Partition wall' },
    { id: 'wallb', kind: 'wall', sub: 'b', name: '承重墙',   en: 'Bearing wall'  },
  ]},
  // 房间区域：区域绘制（两点 / 拖拽拉出矩形），排在墙体大类下面
  { cat: '房间区域', en: 'Room areas', region: true, items: [] },
  { cat: '门', en: 'Doors', items: [
    { id: 'door',   kind: 'door',  sub: 'door',   name: '房门',   en: 'Door',         len: 800  },
    { id: 'entry',  kind: 'door',  sub: 'entry',  name: '入户门', en: 'Entry door',   len: 900  },
    { id: 'double', kind: 'door',  sub: 'double', name: '双开门', en: 'Double door',  len: 1200 },
    { id: 'slide',  kind: 'slide', sub: 'slide',  name: '推拉门', en: 'Sliding door', len: 1500 },
  ]},
  { cat: '窗', en: 'Windows', items: [
    { id: 'win', kind: 'win', sub: 'win', name: '窗户', en: 'Window',     len: 1200 },
    { id: 'bay', kind: 'bay', sub: 'bay', name: '飘窗', en: 'Bay window', len: 1800 },
  ]},
];

export const WALL_ITEMS = WALL_LIB.flatMap(c => c.items);

export const wallItem  = id => WALL_ITEMS.find(i => i.id === id) || null;

/* ---------------- 图标 ---------------- */
export const wallViewBox = '-30 -30 60 60';

const BAR = '<rect x="-26" y="-4" width="52" height="8" fill="#a7a195"/>';

export function wallSVG(it){
  switch (it.id){
    case 'walln':
      return '<rect x="-26" y="-5" width="52" height="10" fill="#a7a195"/>'
           + '<path d="M-26 -5V5M26 -5V5" stroke="#8f897d" stroke-width="1"/>';
    case 'wallb':
      return '<rect x="-26" y="-6" width="52" height="12" fill="#26241f"/>';

    case 'door':
    case 'entry': {
      const c = it.id === 'entry' ? '#b5653a' : '#3d3a34';
      return BAR
        + '<rect x="-9" y="-4" width="18" height="8" fill="#fff"/>'
        + `<line x1="-9" y1="4" x2="-25" y2="4" stroke="${c}" stroke-width="2.6"/>`
        + `<path d="M-9 4A18 18 0 0 1 9 -14" fill="none" stroke="${c}" stroke-width="1.3" stroke-dasharray="3 2" opacity=".8"/>`;
    }
    case 'double': {
      const c = '#3d3a34';
      return BAR
        + '<rect x="-16" y="-4" width="32" height="8" fill="#fff"/>'
        + `<line x1="-16" y1="4" x2="-2" y2="4" stroke="${c}" stroke-width="2.6"/>`
        + `<line x1="16" y1="4" x2="2" y2="4" stroke="${c}" stroke-width="2.6"/>`
        + `<path d="M-16 -10A14 14 0 0 1 -2 4" fill="none" stroke="${c}" stroke-width="1.3" stroke-dasharray="3 2" opacity=".8"/>`
        + `<path d="M16 -10A14 14 0 0 0 2 4" fill="none" stroke="${c}" stroke-width="1.3" stroke-dasharray="3 2" opacity=".8"/>`;
    }
    case 'slide':
      return BAR
        + '<rect x="-16" y="-7" width="20" height="4" fill="#fff" stroke="#3d3a34" stroke-width="1"/>'
        + '<rect x="-2" y="3" width="20" height="4" fill="#fff" stroke="#3d3a34" stroke-width="1"/>';
    case 'win':
      return BAR
        + '<rect x="-15" y="-4" width="30" height="8" fill="#f7fbfd" stroke="#4f7394" stroke-width="1"/>'
        + '<path d="M-15 -1.4H15M-15 1.4H15" stroke="#4f7394" stroke-width="1"/>';
    case 'bay':
      return BAR
        + '<rect x="-11" y="-20" width="22" height="16" fill="#f3f0ea"/>'
        + '<path d="M-11 -20H11M-11 -20V-4M11 -20V-4" stroke="#4f7394" stroke-width="1.6" fill="none"/>';
    default:
      return BAR;
  }
}
