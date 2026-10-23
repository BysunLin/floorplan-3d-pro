/* ============================================================================
 *  元素身份（uid）
 *
 *  问题：墙 / 门窗的「名称」「墙面材质」原来按数组下标存（'w3' / 'nw2'），
 *  而墙段在开洞、合并、转墙型、转用户元素时下标会变 —— 于是出现
 *    · 给 A 墙设了玻璃，给 B 墙开个门，B 后面的墙材质全串位；
 *    · 改完名字再转承重墙，名字留在旧下标上，新墙变成默认名。
 *
 *  解决：每个元素带一个稳定 id，下标只用于渲染 / 命中，不再当身份。
 *    · 用户墙体：[x0,y0,x1,y1,类型,uid]      （数组第 6 位，JSON 可持久化）
 *    · 用户窗：  [x0,y0,x1,y1,uid]           （数组第 5 位）
 *    · 门 / 推拉门 / 区域 / 飘窗：对象上的 uid 字段
 *    · 户型自带元素不占存储，按「b + 前缀 + 下标」虚拟出 uid（下标由户型决定，稳定）
 * ========================================================================== */

export const WALL_UID = 5;
export const WIN_UID = 4;

/* 斜墙中心线负载：[x0,y0,x1,y1,类型,uid,{ a:[x,y], b:[x,y], t }]
 * 正交墙不占这一位 —— 所有旧代码（按矩形消费）行为完全不变，
 * 只有写字楼级别的改造才会同时写这一位。读写统一走 core/model/wallLine.js。 */
export const WALL_LINE = 6;

/** 户型自带元素的虚拟 uid：bw3 / bnw2 / bnd0 / bns1 */
export const baseUid = (prefix, i) => `b${prefix}${i}`;

export function wallUid(w){
  return (w && w[WALL_UID]) || '';
}

export function setWallUid(w, uid){
  if (w) w[WALL_UID] = uid;
}

export function winUid(r){
  return (r && r[WIN_UID]) || '';
}

export function setWinUid(r, uid){
  if (r) r[WIN_UID] = uid;
}

export const objUid = o => (o && o.uid) || '';

export function setObjUid(o, uid){
  if (o) o.uid = uid;
}

/** 单调递增的新 uid（不随撤销回退，避免复用已删除元素的 id） */
export function newUid(state, tag = 'u'){
  state.uidSeq = (Number(state.uidSeq) || 0) + 1;
  return tag + state.uidSeq;
}

/** 去掉数组里可能混进来的 uid，得到干净的矩形 [x0,y0,x1,y1] */
export const plainRect = r => (r ? [r[0], r[1], r[2], r[3]] : null);
