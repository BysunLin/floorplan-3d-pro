/* ============================================================================
 *  全局键盘快捷键
 * ========================================================================== */
import { usePlanStore, useUiStore, useViewStore } from '@/stores/index.js';
import { getEngine } from '@/workspace/view3d/registry.js';
import { toggleView } from '@/app/providers/useViewSwitch.js';
import { toggleFullscreen } from '@/app/providers/useFullscreen.js';

export function installShortcuts(){
  const plan = usePlanStore();
  const uiStore = useUiStore();
  const viewStore = useViewStore();
  const ui = uiStore.ui;

  function onKey(e){
    if (e.target.matches('input,select,textarea')) return;
    if (getEngine()?.walking()) return;                       // 漫游中交给漫游逻辑

    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'z'){ e.preventDefault(); e.shiftKey ? plan.redo() : plan.undo(); return; }
    if (mod && k === 'y'){ e.preventDefault(); plan.redo(); return; }
    if (mod && k === 'd'){ e.preventDefault(); plan.duplicateSel(); return; }
    if (mod && k === 'c'){ e.preventDefault(); plan.copySelection(); return; }
    if (mod && k === 'v'){ e.preventDefault(); plan.pasteSelection(); return; }
    if (mod) return;

    if (k === '[' || k === ']'){ uiStore.drawer(k === '[' ? 'lib' : 'panel'); return; }
    if (k === 'f' && e.shiftKey){ toggleFullscreen(); return; }
    if (k === 't'){ toggleView(); return; }

    // 3D 下屏蔽只属于 2D 的键
    if (viewIs3D() && ['v', 'm', 'x', 'f', '+', '=', '-'].includes(k)) return;

    if (k === 'v') uiStore.setTool('select');
    else if (k === 'm') uiStore.setTool('measure');
    else if (k === 'x') uiStore.setTool('demolish');
    else if (k === 'f') viewStore.fitView();
    else if (k === 'r') plan.rotateSel(e.shiftKey ? -90 : 90);
    else if (k === 'delete' || k === 'backspace'){ e.preventDefault(); plan.deleteSel(); }
    else if (k === 'escape'){
      if (ui.menu) uiStore.closeMenu();
      else if (ui.regionDraw) uiStore.cancelRegionDraw();
      else if (ui.mA){ ui.mA = null; }
      else { if (ui.tool !== 'select') uiStore.setTool('select'); uiStore.select(null); }
    }
    else if (k.startsWith('arrow') && ui.sel?.kind === 'furn'){
      e.preventDefault();
      const st = e.shiftKey ? 100 : 10;
      plan.mutate(() => {
        const f = plan.getF(ui.sel.id);
        if (k === 'arrowleft')  f.cx -= st;
        if (k === 'arrowright') f.cx += st;
        if (k === 'arrowup')    f.cy -= st;
        if (k === 'arrowdown')  f.cy += st;
      });
    }
    else if (k === '+' || k === '=') viewStore.zoomCenter(1.25);
    else if (k === '-') viewStore.zoomCenter(.8);
  }

  function onEscapeWalk(e){
    if (e.key === 'Escape' && getEngine()?.walking()){
      uiStore.closeDrawers();
    }
  }

  addEventListener('keydown', onKey);
  addEventListener('keydown', onEscapeWalk);
  return () => {
    removeEventListener('keydown', onKey);
    removeEventListener('keydown', onEscapeWalk);
  };
}

function viewIs3D(){
  // 避免与 store 形成导入环：直接读 DOM 上的状态类
  return document.body.classList.contains('m3d');
}
