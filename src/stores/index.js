/* ============================================================================
 *  Store 组合入口（Pinia）
 *
 *  原先这个文件是一个一千多行的巨型模块，把「方案数据 / 视口 / 界面交互」混在
 *  一起。现在按职责拆成三个 Pinia store，组件直接按需取用：
 *    · stores/plan/  —— 方案数据、几何同步、撤销历史、家具与墙体编辑（按会话拆分）
 *    · stores/view.js —— 2D 平面图视口（平移 / 缩放 / 比例尺）
 *    · stores/ui.js   —— 界面交互（工具、选中、抽屉、提示条、2D/3D、漫游）
 *
 *  本文件只做「组合根」：
 *    1. 创建并激活 Pinia（使 store 可在组件外、模块加载期使用）；
 *    2. 执行一次性的初始化（还原已保存的几何）；
 *    3. 导出 Pinia 实例与三个 store 钩子。
 *
 *  用法（组件内）：const ui = useUiStore(); const plan = usePlanStore();
 * ========================================================================== */
import { createPinia, setActivePinia } from 'pinia';
import { usePlanStore } from '@/stores/plan/index.js';
import { useUiStore, ELEM_KINDS } from '@/stores/ui.js';
import { useViewStore } from '@/stores/view.js';

/* 应用级 Pinia 实例；main.js 需 app.use(pinia) 以便接入 devtools */
export const pinia = createPinia();
setActivePinia(pinia);

export { usePlanStore, useUiStore, useViewStore };

/* 刷新后若保存的不是默认户型，先还原几何（须在首个组件挂载前完成） */
usePlanStore().initGeometry();

export { ELEM_KINDS };
/* 可开洞墙体类型的判定（门窗放置与高亮共用） */
export { isOpenableType } from '@/stores/plan/index.js';
