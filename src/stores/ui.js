/* ============================================================================
 *  UI Store —— 界面 / 交互状态
 *
 *  只负责「用户在与什么交互」：当前工具、选中项、测量与画墙的临时点、
 *  图层开关、面板抽屉、提示条、2D/3D 模式与 3D 漫游输入。
 *  不直接改方案数据（那是 plan store 的职责）。
 * ========================================================================== */
import { reactive, ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { narrow } from '@/core/model/plan.js';
import { detectQuality } from '@/workspace/view3d/quality.js';
import { setLang as applyLang } from '@/i18n.js';

/** 可被选中 / 标记的墙面元素种类（墙体 + 门窗） */
export const ELEM_KINDS = ['wall', 'win', 'door', 'slide'];

const PANES_KEY = 'huxing-panes';

export const useUiStore = defineStore('ui', () => {
  /* ======================= 交互状态 ======================= */
  const ui = reactive({
    tool: 'select',
    sel: null,                       // null | {kind:'furn',id} | {kind:'room',id} | {kind:'wall'|'win'|'door'|'slide', i}
    mA: null, mCur: null,            // 测量起点 / 当前点
    wallItem: null,                  // 墙面组件库里选中的组件 id
    wallA: null, wallB: null,        // 画墙：起点 A / 预览点 B
    wallAxis: null,                  // 画墙：起点吸附到墙边后强制的轴向 'h' | 'v' | null
    wallSnap: null,                  // 画墙：起点所吸附的那段墙（归一化矩形 + 走向）
    wallHover: null,                 // 画墙：尚未落点时，悬浮在已有墙体上的起点提示 {x,y}
    openHover: null,                 // 门窗放置预览：{rect, horiz, len}
    regionDraw: null,                // 区域绘制：null 或 { a:{x,y}|null, b:{x,y}|null }
    regionSnap: null,                // 区域绘制：吸附指示 {x, y, kind:'vertex'|'edge'|null}
    menu: null,                      // 工作区右键菜单：{x, y}（屏幕坐标，null = 关闭）
    layers: { dims: true, labels: true, furn: true, grid: false, bearing: false, wallSnap: true, lower: true },
    /* 家具拖拽中的临时反馈（不进撤销、不入存档） */
    dragId: null,                    // 正在拖动的家具 id
    dragBad: false,                  // 当前落点非法（压墙 / 挡门）
    dragReason: '',                  // '' | 'wall' | 'door'
    dragRect: null,                  // 非法落点的包围盒 {x,y,w,h}（mm）
    assist: [],                      // 同类邻居的辅助虚线框 [{id,cx,cy,hw,hh}]
    guides: []                       // 对齐辅助线 [{x1,y1,x2,y2}]
  });

  /* 3D 显示选项 */
  const opt = reactive({
    cut: 2.8, furn: true, labels: true, night: false, hour: 10, mode: 'orbit',
    allFloors: true,           // 3D：整栋（其它楼层实色 + 家具） / 半透明体量
    wallAlpha: false,          // 3D：外墙半透明显示（便于看户型内部）
    roof: false,               // 3D：显示房顶（仅多楼层户型的顶层）
    site: true,                // 3D：场地（室外大地面 / 地下层基坑土体）
    // 3D：画质档位 'low' / 'mid' / 'high'；初始值 = 「推荐」按当前设备挑出来的那一档
    quality: detectQuality()
  });

  /** 清除拖拽辅助状态（结束拖动时调用） */
  function clearDragAssist(){
    ui.dragId = null;
    ui.dragBad = false;
    ui.dragReason = '';
    ui.dragRect = null;
    ui.assist = [];
    ui.guides = [];
  }

  /* ======================= 提示条 ======================= */
  const toast = reactive({ msg: '', show: false });
  let toastT;
  /** 轻提示：默认 1.8s 后自动消失；长文案（操作说明类）可传更长的 ms */
  function showToast(msg, ms = 1800){
    toast.msg = msg;
    toast.show = true;
    clearTimeout(toastT);
    toastT = setTimeout(() => { toast.show = false; }, ms);
  }

  /* ======================= 面板抽屉（宽屏收起 / 窄屏浮层） ======================= */
  const panes = reactive((() => {
    try { return JSON.parse(localStorage.getItem(PANES_KEY)) || {}; } catch (e) { return {}; }
  })());
  /** 窄屏下当前打开的抽屉：'' | 'lib' | 'panel' */
  const drawerOpen = ref('');

  const paneKey = which => (which === 'lib' ? 'hideLib' : 'hidePanel');
  const persistPanes = () => {
    try { localStorage.setItem(PANES_KEY, JSON.stringify(panes)); } catch (e) {}
  };

  /**
   * @param {string|null} which 'lib' | 'panel' | null（null = 全部收起）
   * @param {boolean} [open]   窄屏下可显式指定开 / 关；省略则切换
   */
  function drawer(which, open){
    if (narrow()){
      if (!which){ drawerOpen.value = ''; return; }
      const cur = drawerOpen.value === which;
      drawerOpen.value = (open ?? !cur) ? which : '';
      return;
    }
    drawerOpen.value = '';
    if (which){
      const k = paneKey(which);
      panes[k] = open === undefined ? !panes[k] : !open;
      persistPanes();
    }
  }

  const closeDrawers = () => { if (narrow()) drawer(null); };

  /* ---------- 面板收起 / 展开（宽屏：收成工作区浮层；窄屏：关闭抽屉） ---------- */
  /** 面板是否已收起为工作区浮层按钮（仅宽屏；读 narrowMode 以保持响应式） */
  const paneCollapsed = which => !narrowMode.value && !!panes[paneKey(which)];

  /** 收起面板：顶部「收起」按钮 / 菜单共用 */
  function collapsePane(which){
    if (narrow()){ drawer(null); return; }
    panes[paneKey(which)] = true;
    persistPanes();
  }

  /** 展开面板：点击浮层按钮 / 菜单共用 */
  function expandPane(which){
    if (narrow()){ drawer(which, true); return; }
    panes[paneKey(which)] = false;
    persistPanes();
  }

  /** 展开 ↔ 收起（菜单项） */
  function togglePane(which){
    if (narrow()){ drawer(which); return; }
    const k = paneKey(which);
    panes[k] = !panes[k];
    persistPanes();
  }

  /* ======================= 2D / 3D 与窄屏 ======================= */
  const viewMode   = ref('2d');
  const is3D       = computed(() => viewMode.value === '3d');
  const narrowMode = ref(narrow());

  /* ======================= AI 助手 ======================= */
  /** 右下角 AI 助手对话面板是否展开 */
  const aiPanelOpen = ref(false);
  /** 「AI 助手配置」弹窗是否展开（帮助菜单 / 面板齿轮共用） */
  const aiConfigOpen = ref(false);

  const openAiPanel  = () => { aiPanelOpen.value = true; };
  const closeAiPanel = () => { aiPanelOpen.value = false; };
  const openAiConfig = () => { aiConfigOpen.value = true; };
  const closeAiConfig = () => { aiConfigOpen.value = false; };

  /* ======================= 3D 漫游输入 ======================= */
  const joy  = reactive({ x: 0, y: 0, id: null });
  const keys = reactive({});
  const walk = reactive({ touch: false, locked: false });

  /* ======================= 工具 / 选择 ======================= */
  /* ======================= 工作区右键菜单 ======================= */
  /** 在屏幕坐标 (x, y) 处打开右键菜单（切换选中项由调用方先做） */
  function openMenu(x, y){ ui.menu = { x, y }; }
  const closeMenu = () => { ui.menu = null; };

  function setTool(t){
    ui.tool = t;
    ui.mA = null;
    ui.mCur = null;
    ui.menu = null;
    if (t !== 'select') cancelRegionDraw();
    // 进入拆改墙体：自动展开左侧面板（那里会换成墙面组件库）；离开则取消选中并清空标记
    if (t === 'demolish') drawer('lib', true);
    else { setWallItem(null); dropElemSel(); ui.openHover = null; }
  }

  /* ======================= 区域绘制 ======================= */
  /** 进入区域绘制：点击 A、再点击 B（或按住拖出矩形），区域内墙体门窗自动扣除 */
  function startRegionDraw(){
    // 不切工具：入口在「拆改墙体」左侧面板的墙体大类下，就地进入绘制，面板保持可见
    ui.regionDraw = { a: null, b: null };
    ui.regionSnap = null;
    ui.mA = null; ui.mCur = null;
    if (narrow()) drawer(null);          // 窄屏：收起抽屉，露出平面图
  }

  function cancelRegionDraw(){
    ui.regionDraw = null;
    ui.regionSnap = null;
  }

  const clearMeasure = () => { ui.mA = null; ui.mCur = null; };

  /** 单选：直接覆盖当前选中项（拆改模式下的墙面 / 门窗元素也只保留最后一个） */
  const select = sel => { ui.sel = sel; ui.menu = null; };

  /** 几何变了以后，选中的下标可能失效，统一清掉 */
  function dropElemSel(){
    if (ui.sel && ELEM_KINDS.includes(ui.sel.kind)) ui.sel = null;
    ui.wallSnap = null;
    ui.menu = null;
  }

  /* ======================= 墙面组件：画墙 / 开洞临时状态 ======================= */
  function setWallItem(id){
    ui.wallItem = id || null;
    ui.wallA = null;
    ui.wallB = null;
    ui.wallAxis = null;
    ui.wallSnap = null;
    ui.wallHover = null;
    ui.openHover = null;
  }

  function cancelWallDraw(){
    ui.wallA = null;
    ui.wallB = null;
    ui.wallAxis = null;
    ui.wallSnap = null;
    ui.wallHover = null;
  }

  /* ======================= 语言 ======================= */
  function setLang(l){
    applyLang(l);
    drawer(null);
  }

  return {
    ui, opt, toast, panes, drawerOpen, viewMode, is3D, narrowMode,
    aiPanelOpen, aiConfigOpen, openAiPanel, closeAiPanel, openAiConfig, closeAiConfig,
    joy, keys, walk,
    showToast, drawer, closeDrawers, clearDragAssist,
    paneCollapsed, collapsePane, expandPane, togglePane,
    openMenu, closeMenu,
    setTool, clearMeasure, select, dropElemSel, setWallItem, cancelWallDraw,
    startRegionDraw, cancelRegionDraw,
    setLang
  };
});
