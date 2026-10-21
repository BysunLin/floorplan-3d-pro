/* 3D 引擎单例登记表：让组件/快捷键能拿到引擎，而不产生模块循环依赖 */
let engine = null;

export function setEngine(e){ engine = e; }
export function getEngine(){ return engine; }
