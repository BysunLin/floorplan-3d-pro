import * as THREE from 'three';

export const ISO_DIR = new THREE.Vector3(5.5, 15.5, 10).normalize();
/* 整体视图的注视高度：约墙高一半，使带墙体的户型在画面里上下居中 */
export const FOCUS_Y = 1.2;
/* 洞口上缘高度：统一由 core/nodes/constants.js 提供（2D / 3D / 节点模型共用一份） */
export { DOOR_H, slideHead } from '@/core/nodes/constants.js';
/* 门套（门垛 / 上槛）宽度：门扇净宽 = 洞口宽 - 2×DOOR_CASE */
export const DOOR_CASE = .03;
/* 站立视高（m）：漫游时相机高度 = 视高 + 脚下（楼梯 / 扶梯）标高 */
export const EYE_H = 1.6;

/* 吸顶灯灯体几何：按房间 light 款式生成 —— 'round' 圆形 / 'square' 正方形 / 'rect' 长方形 */
export const ceilLampGeo = style => {
  if (style === 'square') return new THREE.BoxGeometry(.46, .03, .46);
  if (style === 'rect')   return new THREE.BoxGeometry(.78, .03, .34);
  return new THREE.CylinderGeometry(.22, .22, .02, 32);
};

/* 楼梯类家具的标高函数：局部坐标（mm，+y 为近端）→ 相对本层地面的标高（m）。
 * rise = 目标楼层与本层的标高差（米，取正值），由 stairRiseAt 依据楼层标高计算，
 * 这样楼梯不再写死层高 H，可连接不同标高的楼层（含 loft）。 */
export const CLIMB = {
  stair:       (lx, ly, hw, hd, sd, rise) => sd * Math.max(0, Math.min(1, (hd - ly)/(2*hd))) * rise,
  escalator:   (lx, ly, hw, hd, sd, rise) => sd * Math.max(0, Math.min(1, (hd - ly)/(2*hd))) * rise,
  /* 车行坡道：沿进深线性上升（与步梯同一公式，区别只在 3D 是整块斜面） */
  ramp:        (lx, ly, hw, hd, sd, rise) => sd * Math.max(0, Math.min(1, (hd - ly)/(2*hd))) * rise,
  /* L 型步梯：西侧一跑沿 -y 上行到平台（半层），再沿 +x 上行到顶；u/v 为 0..1 的归一化坐标。
   * FW 必须与 3D 模型里的梯跑宽比例一致（0.4）；转角外的 fang 空角按平台高度处理。 */
  lstair: (lx, ly, hw, hd, sd, rise) => {
    const FW = .4;
    const u = (lx + hw)/(2*hw), v = (ly + hd)/(2*hd);     // u: 西→东，v: 北→南
    const half = rise/2;
    let h;
    if (u < FW && v >= FW)       h = (1 - v)/(1 - FW) * half;              // 第一跑（南 → 北）
    else if (v < FW && u >= FW)  h = half + Math.max(0, Math.min(1, (u - FW)/(1 - FW))) * half;  // 第二跑（西 → 东）
    else if (u < FW && v < FW)   h = half;                                 // 西北转角平台
    else                         h = half;                                 // 楼梯井空角（不提供更高支撑）
    return sd * h;
  },
  spiralstair: (lx, ly, hw, hd, sd, rise) => {
    let a = Math.atan2(ly, lx);
    if (a < 0) a += Math.PI*2;
    return sd * a/(Math.PI*2) * rise;
  },
};
/* 楼层元素（有上下标高的类型）：用于地面开洞 / 梯井。
 * 坡道单独列出：它不参与「上层楼板开洞」与「梯井」，只在漫游里提供坡面标高 */
export const CLIMB_TYPES = new Set(Object.keys(CLIMB));
export const NO_OPENING_TYPES = new Set(['ramp']);
