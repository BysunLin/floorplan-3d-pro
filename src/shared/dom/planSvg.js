/* 平面图 <svg> 元素登记表：供交互与拖放共用（DOM 元素不做深层响应式） */
let svgEl = null;

export function setPlanSvg(el){ svgEl = el; }
export function getPlanSvg(){ return svgEl; }
