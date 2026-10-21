/* ============================================================================
 *  2D ⇄ 3D 视图切换（应用级行为，不属于视图 store）
 * ========================================================================== */
import { useUiStore } from '@/stores/index.js';
import { getEngine } from '@/workspace/view3d/registry.js';

let switching = false;

export async function setView(m){
  const uiStore = useUiStore();
  const ui = uiStore.ui;
  if (m === uiStore.viewMode || switching) return;
  const eng = getEngine();
  if (!eng) return;
  switching = true;
  document.body.classList.add('busy');
  uiStore.viewMode = m;
  try {
    if (m === '3d'){
      if (ui.tool !== 'select') uiStore.setTool('select');
      ui.mA = null;
      uiStore.cancelRegionDraw();          // 区域绘制只在 2D 平面图上进行
      await eng.enter();
    } else {
      await eng.exit();
    }
  } finally {
    // 即使切换失败也要解除锁定，否则 .seg 的 pointer-events 会一直为 none
    switching = false;
    document.body.classList.remove('busy');
  }
}

export function toggleView(){
  return setView(useUiStore().is3D ? '2d' : '3d');
}
