<template>
  <div class="topbar">
    <!-- 第一行：标题与辅助文字（flex-basis:100% 独占一行） -->
    <div class="brand">
      <b>{{ brandTitle }}</b>
      <span id="subtitle">{{ subtitle }}</span>
    </div>

    <!-- 第二行：菜单栏（左） + 常用工具（右），两者共用同一套按钮组样式 -->
    <div class="grp menus">
      <!-- 开始：户型 / 导入导出 / 撤销重做 -->
      <details class="menu">
        <summary class="btn">{{ tr('开始 ▾', 'Start ▾') }}</summary>
        <div class="menu-pop">
          <button class="btn" id="planBtn" @click="act(openPlan)">{{ tr('从样板间开始', 'Start from a sample') }}</button>
          <div class="menu-sep"></div>
          <button class="btn" @click="act(() => fileEl?.click())">{{ tr('导入方案', 'Import plan') }}</button>
          <button class="btn" @click="act(() => imgEl?.click())"
            :title="tr('选择户型图片，自动识别墙体与房间', 'Pick a floor plan image to detect walls and rooms')">{{ tr('导入户型图(beta)', 'Import floor plan') }}</button>
          <button class="btn" @click="act(exportPNG)">{{ tr('导出图片', 'Export image') }}</button>
          <button class="btn" @click="act(exportJSON)">{{ tr('导出方案 JSON', 'Export plan JSON') }}</button>
          <div class="menu-sep"></div>
          <button class="btn" :disabled="!canUndo" :style="{opacity: canUndo ? 1 : .4}"
            :title="tr('撤销 (Ctrl+Z)', 'Undo (Ctrl+Z)')" @click="act(undo)">{{ tr('撤销', 'Undo') }}</button>
          <button class="btn" :disabled="!canRedo" :style="{opacity: canRedo ? 1 : .4}"
            :title="tr('重做 (Ctrl+Shift+Z)', 'Redo (Ctrl+Shift+Z)')" @click="act(redo)">{{ tr('重做', 'Redo') }}</button>
        </div>
      </details>

      <!-- 布局：面板 / 楼层 / 重置 / 清空 -->
      <details class="menu">
        <summary class="btn">{{ tr('布局 ▾', 'Layout ▾') }}</summary>
        <div class="menu-pop">
          <div class="menu-sec">{{ tr('面板', 'Panels') }}</div>
          <div class="menu-row">
            <button class="btn" :class="{on: paneOpen('lib')}" @click="act(() => togglePane('lib'))">
              {{ paneOpen('lib') ? tr('◧ 收起家具库', '◧ Hide library') : tr('◧ 展开家具库', '◧ Show library') }}
            </button>
            <button class="btn" :class="{on: paneOpen('panel')}" @click="act(() => togglePane('panel'))">
              {{ paneOpen('panel') ? tr('◨ 收起属性', '◨ Hide properties') : tr('◨ 展开属性', '◨ Show properties') }}
            </button>
          </div>
          <div class="menu-sep"></div>
          <div class="menu-row">
            <button class="btn" @click="act(addLevel)">{{ tr('新增楼层', 'Add floor') }}</button>
            <button class="btn" :title="tr('在现有最低层之下新增负一层（车库 / 地下室）', 'Add a basement level below the lowest floor')"
              @click="act(addBasement)">{{ tr('新增地下层', 'Add basement') }}</button>
          </div>
          <button class="btn danger" :disabled="state.levels.length <= 1" :style="{opacity: state.levels.length <= 1 ? .4 : 1}"
            :title="state.levels.length <= 1 ? tr('至少保留一层', 'At least one floor must remain') : tr('删除当前楼层及其家具 / 墙体（可撤销）', 'Delete the current floor with its furniture and walls (undoable)')"
            @click="act(() => removeLevel(state.activeLevel))">{{ tr('删除当前楼层', 'Delete floor') }}</button>
          <div class="menu-sep"></div>
          <button class="btn danger" @click="act(resetPlan)"
            :title="tr('把当前户型的家具、墙体与门窗恢复为初始方案（不切换户型）', 'Restore furniture, walls and openings of the current layout (stays on the same layout)')">{{ tr('重置为默认方案', 'Reset to default') }}</button>
          <button class="btn danger" @click="act(clearLayout)"
            :title="tr('清空所有家具家电（可撤销）', 'Remove all furniture and appliances (undoable)')">{{ tr('清空布置', 'Clear layout') }}</button>
        </div>
      </details>

      <!-- 视图：图层 / 缩放 / 3D 视角与显示 -->
      <details class="menu wide">
        <summary class="btn">{{ tr('视图 ▾', 'View ▾') }}</summary>
        <div class="menu-pop">
          <div class="menu-sec only2d">{{ tr('图层', 'Layers') }}</div>
          <div class="menu-row only2d">
            <button v-for="l in LAYERS" :key="l.k" class="btn chip" :class="{on: ui.layers[l.k]}"
              :data-layer="l.k" :title="l.title ? l.title() : ''" @click="toggleLayer(l.k)">{{ l.label() }}</button>
          </div>
          <div class="menu-sec only2d">{{ tr('缩放', 'Zoom') }}</div>
          <div class="menu-row only2d">
            <button class="btn" id="zoomOut" :title="tr('缩小', 'Zoom out')" @click="zoomCenter(.8)">−</button>
            <button class="btn" id="zoomIn"  :title="tr('放大', 'Zoom in')"  @click="zoomCenter(1.25)">＋</button>
            <button class="btn" id="fit"     :title="tr('适应窗口 (F)', 'Fit to window (F)')" @click="fitView">{{ tr('适应', 'Fit') }}</button>
            <button class="btn" id="s60"  :title="tr('按 1:60 显示（与原图同比例）', 'Show at 1:60 (same scale as the original plan)')" @click="setRatio(60)">1:60</button>
            <button class="btn" id="s100" :title="tr('按 1:100 显示', 'Show at 1:100')" @click="setRatio(100)">1:100</button>
          </div>
          <div class="menu-sec only3d">{{ tr('剖切', 'Section') }}</div>
          <div class="menu-row only3d">
            <button v-for="c in CUTS" :key="c.v" class="btn chip" :class="{on: opt.cut === c.v}"
              :data-cut="c.v" :title="c.title()" @click="setCut(c.v)">{{ c.label() }}</button>
            <button class="btn chip" :class="{on: cutAtLevel}" data-cut="level"
              :title="tr('按当前楼层净高剖切，切换楼层时自动跟随', 'Cut at the current storey height (follows the level)')"
              @click="setCutLevel">{{ tr('层高', 'Level') }} {{ levelH.toFixed(1) }} m</button>
          </div>
          <div class="menu-sec only3d">{{ tr('显示', 'Display') }}</div>
          <div class="menu-row only3d">
            <button v-for="t in TOGGLES" :key="t.k" class="btn chip" :class="{on: opt[t.k]}" :data-t="t.k" @click="toggle3d(t.k)">{{ t.label() }}</button>
            <button class="btn chip" :class="{on: opt.wallAlpha}"
              :title="tr('外墙半透明显示，便于查看户型内部', 'Show exterior walls translucent')"
              @click="toggleWallAlpha">{{ tr('半透明', 'Translucent') }}</button>
          </div>
          <div class="menu-sec only3d">{{ tr('性能', 'Performance') }}</div>
          <div class="menu-row only3d">
            <button v-for="q in QUALITY_ITEMS" :key="q.k" class="btn chip" :class="{on: opt.quality === q.k}"
              :data-quality="q.k" :title="qualityTitle(q.k)" @click="setQuality(q.k)">
              {{ q.k === 'auto' ? `${tr('推荐', 'Auto')}·${qualityName(recQuality)}` : tr(q.name, q.en) }}
            </button>
          </div>
          <div class="menu-sec only3d">{{ tr('日照', 'Sun') }}</div>
          <label class="range only3d">
            <input type="range" id="sun" min="7" max="18" step=".25" :value="opt.hour" @input="onSun">
            <span id="sunT">{{ sunText }}</span>
          </label>
          <div class="menu-sec">{{ tr('语言', 'Language') }}</div>
          <div class="menu-row" id="langSel" role="group" :aria-label="tr('语言', 'Language')">
            <button v-for="l in LANGS" :key="l.k" class="btn chip" :class="{on: lang === l.k}" :data-lang="l.k"
              :title="l.t" :aria-pressed="lang === l.k" @click="setLang(l.k)">{{ l.label }}</button>
          </div>
          <div class="menu-sep"></div>
          <button class="btn" id="fullscreen" :title="tr('全屏', 'Fullscreen') + ' (Shift+F)'" @click="act(toggleFullscreen)">
            ⛶ {{ tr(fsOn ? '退出全屏' : '全屏', fsOn ? 'Exit fullscreen' : 'Fullscreen') }}
          </button>
        </div>
      </details>

      <!-- 帮助 -->
      <details class="menu">
        <summary class="btn">{{ tr('帮助 ▾', 'Help ▾') }}</summary>
        <div class="menu-pop">
          <button class="btn" @click="act(openAiConfig)">{{ tr('AI 助手配置', 'AI assistant settings') }}</button>
          <div class="menu-sep"></div>
          <button class="btn" @click="act(() => overviewOpen = true)">{{ tr('模型总览', 'Model overview') }}</button>
          <button class="btn" @click="act(() => helpOpen = true)">{{ tr('键盘快捷键', 'Keyboard shortcuts') }}</button>
          <button class="btn" @click="act(about)">{{ tr('关于', 'About') }}</button>
        </div>
      </details>
    </div>

    <div class="spacer"></div>

    <!-- 常用：2D / 3D 切换 -->
    <div class="grp seg" id="viewSeg" :title="tr('切换 2D / 3D (T)', 'Switch 2D / 3D (T)')">
      <button class="btn" :class="{on: !is3D}" :data-view="'2d'" @click="setView('2d')">{{ tr('2D 平面', '2D Plan') }}</button>
      <button class="btn" :class="{on: is3D}"  :data-view="'3d'" @click="setView('3d')">{{ tr('3D 场景', '3D Scene') }}</button>
    </div>

    <!-- 2D：常用工具（选择 / 测量 / 拆改墙体） -->
    <div class="grp seg only2d" id="tools">
      <button v-for="t in TOOLS" :key="t.id" class="btn" :class="{on: ui.tool === t.id}"
        :data-tool="t.id" :title="t.title()" @click="pickTool(t.id)">{{ t.label() }}</button>
    </div>

    <!-- 3D：视角菜单（鸟瞰 / 漫游 / 斜视 / 俯视） -->
    <div class="grp seg only3d" id="camGrp">
      <button class="btn" :class="{on: opt.mode === 'orbit'}" data-mode="orbit"
        @click="act(() => setMode('orbit'))">{{ tr('鸟瞰', 'Orbit') }}</button>
      <button class="btn" :class="{on: opt.mode === 'walk'}" data-mode="walk"
        @click="act(() => setMode('walk'))">{{ tr('漫游', 'Walk') }}</button>
      <div class="menu-sep"></div>
      <button class="btn" data-mode="iso" @click="act(onIso)">{{ tr('斜视', 'Iso') }}</button>
      <button class="btn" data-mode="top" @click="act(onTop)">{{ tr('俯视', 'Top') }}</button>
    </div>

    <!-- 弹窗挂到 body：卡片有 backdrop-filter，会让内部 fixed 元素不再相对视口定位 -->
    <Teleport to="body">
    <!-- 关于弹窗：技术栈 + 作者信息 -->
    <div class="plan-mask" v-if="aboutOpen" @click.self="aboutOpen = false">
      <div class="plan-dialog dlg-about" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
        <header class="dlg-head">
          <div class="dlg-title">
            <h3 id="aboutTitle">{{ tr('关于', 'About') }}</h3>
            <p class="dlg-sub">{{ tr('户型装修设计 · 平面布置 / 3D 预览工具', 'Interior design · 2D layout & 3D preview') }}</p>
          </div>
          <button class="dlg-x" :title="tr('关闭', 'Close')" :aria-label="tr('关闭', 'Close')" @click="aboutOpen = false">×</button>
        </header>

        <div class="dlg-body about-body">
          <section class="about-sec">
            <h4>{{ tr('技术栈', 'Tech stack') }}</h4>
            <ul class="about-tech">
              <li><b>Vue 3</b><span>{{ tr('Composition API / SFC 组件', 'Composition API / SFC') }}</span></li>
              <li><b>Pinia</b><span>{{ tr('状态管理', 'State management') }}</span></li>
              <li><b>Vite 5</b><span>{{ tr('开发服务器与构建', 'Dev server & build') }}</span></li>
              <li><b>Three.js</b><span>{{ tr('2D 方案实时 3D 渲染', 'Realtime 3D rendering') }}</span></li>
              <li><b>MCP</b><span>{{ tr('AI 工具链（Model Context Protocol）', 'AI tooling (Model Context Protocol)') }}</span></li>
              <li><b>Node.js</b><span>{{ tr('MCP 服务端与本地预览桥', 'MCP server & local preview bridge') }}</span></li>
            </ul>
          </section>

          <section class="about-sec">
            <h4>{{ tr('作者', 'Author') }}</h4>
            <div class="about-row"><span class="about-k">{{ tr('姓名', 'Name') }}</span><b>linbaixiang</b></div>
            <div class="about-row">
              <span class="about-k">{{ tr('邮箱', 'Email') }}</span>
              <a href="mailto:523067900@qq.com">523067900@qq.com</a>
            </div>
            <div class="about-row">
              <span class="about-k">{{ 'Github' }}</span>
              <a href="https://github.com/BysunLin/floorplan-3d-pro" target="_blank">https://github.com/BysunLin/floorplan-3d-pro</a>
            </div>
            
          </section>
        </div>

        <p class="dlg-note">© 2026 linbaixiang · floorplan-3d-pro</p>
      </div>
    </div>

    <!-- 快捷键帮助弹窗 -->
    <div class="plan-mask" v-if="helpOpen" @click.self="helpOpen = false">
      <div class="plan-dialog dlg-help" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
        <header class="dlg-head">
          <div class="dlg-title">
            <h3 id="helpTitle">{{ tr('键盘快捷键', 'Keyboard Shortcuts') }}</h3>
            <p class="dlg-sub">{{ tr('鼠标与触屏操作可直接在平面图上使用，这里只列出键盘快捷键', 'Mouse and touch work directly on the plan — this list covers the keyboard only') }}</p>
          </div>
          <button class="dlg-x" :title="tr('关闭', 'Close')" :aria-label="tr('关闭', 'Close')" @click="helpOpen = false">×</button>
        </header>

        <div class="kbd-groups">
          <section class="kbd-group">
            <h4>{{ tr('工具与视图', 'Tools & view') }}</h4>
            <div class="kbd">
              <kbd>V</kbd><span>{{ tr('选择 / 移动', 'Select / move') }}</span>
              <kbd>M</kbd><span>{{ tr('测量（Shift 锁定水平 / 垂直）', 'Measure (Shift locks the axis)') }}</span>
              <kbd>X</kbd><span>{{ tr('拆改墙体（黑色为承重墙）', 'Demolish walls (black = bearing)') }}</span>
              <kbd>T</kbd><span>{{ tr('切换 2D / 3D', 'Toggle 2D / 3D') }}</span>
              <kbd>F</kbd><span>{{ tr('适应窗口', 'Fit to window') }}</span>
              <kbd>Esc</kbd><span>{{ tr('取消当前操作', 'Cancel current action') }}</span>
            </div>
          </section>

          <section class="kbd-group">
            <h4>{{ tr('编辑', 'Editing') }}</h4>
            <div class="kbd">
              <kbd>R</kbd><span>{{ tr('旋转 90°（Shift 反向）', 'Rotate 90° (Shift reverses)') }}</span>
              <kbd>{{ tr('方向键', 'Arrows') }}</kbd><span>{{ tr('微调 10 mm（Shift 100 mm）', 'Nudge 10 mm (Shift 100 mm)') }}</span>
              <kbd>⌘/Ctrl D</kbd><span>{{ tr('复制选中家具', 'Duplicate selection') }}</span>
              <kbd>⌘/Ctrl C / V</kbd><span>{{ tr('跨楼层复制 / 粘贴', 'Copy / paste across floors') }}</span>
              <kbd>Delete</kbd><span>{{ tr('删除选中', 'Delete selection') }}</span>
            </div>
          </section>

          <section class="kbd-group">
            <h4>{{ tr('历史', 'History') }}</h4>
            <div class="kbd">
              <kbd>⌘/Ctrl Z</kbd><span>{{ tr('撤销', 'Undo') }}</span>
              <kbd>⌘/Ctrl ⇧ Z</kbd><span>{{ tr('重做', 'Redo') }}</span>
            </div>
          </section>

          <section class="kbd-group">
            <h4>{{ tr('3D 漫游', '3D walk') }}</h4>
            <div class="kbd">
              <kbd>W A S D</kbd><span>{{ tr('移动（方向键同效）', 'Move (arrow keys too)') }}</span>
              <kbd>Shift</kbd><span>{{ tr('快走', 'Run') }}</span>
              <kbd>E</kbd><span>{{ tr('开关正前方的门', 'Open the door ahead') }}</span>
              <kbd>Esc</kbd><span>{{ tr('暂停漫游', 'Pause walking') }}</span>
            </div>
          </section>
        </div>

        <p class="dlg-note">{{ tr('触屏：单指拖动平移，双指捏合缩放；3D 漫游用左下摇杆移动、拖动转向', 'Touch: 1-finger pan, 2-finger pinch to zoom; in 3D walk use the joystick and drag to look around') }}</p>
      </div>
    </div>

    <!-- 样板间弹窗 -->
    <div class="plan-mask" v-if="planOpen" @click.self="planOpen = false">
      <div class="plan-dialog dlg-plan" role="dialog" aria-modal="true" aria-labelledby="planTitle">
        <header class="dlg-head">
          <div class="dlg-title">
            <h3 id="planTitle">{{ tr('从样板间开始', 'Start from a sample') }}</h3>
            <p class="dlg-sub">{{ tr('选择一套样板间作为起点，之后可自由修改家具、墙体与楼层', 'Pick a sample as a starting point — furniture, walls and floors stay editable') }}</p>
          </div>
          <button class="dlg-x" :title="tr('关闭', 'Close')" :aria-label="tr('关闭', 'Close')" @click="planOpen = false">×</button>
        </header>

        <div class="dlg-body">
          <div v-for="grp in PLAN_GROUPS" :key="grp.k" class="plan-group">
            <h4>{{ grp.label() }}</h4>
            <div class="plan-cards">
              <button v-for="c in grp.cards" :key="c.id" class="plan-card" @click="pickPlan(c.id)">
                <span class="thumb" v-html="thumb(c.id)"></span>
                <b>{{ c.name() }}<span class="area">{{ planArea(c.id) }} m²</span></b>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 模型总览 -->
    <ModelOverview v-if="overviewOpen" @close="overviewOpen = false"/>

    <!-- 导入户型图：识别 → 预览 → 二次确认 -->
    <ImportFloorPlanDialog v-if="importFile" :file="importFile"
      @close="importFile = null" @apply="onImportApply"/>
    </Teleport>

    <input type="file" id="fileIn" ref="fileEl" accept=".json,application/json" hidden @change="onFile">
    <input type="file" id="imgIn" ref="imgEl" accept="image/*" hidden @change="onImage">
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { fullscreenOn as fsOn, toggleFullscreen } from '@/app/providers/useFullscreen.js';
import { storeToRefs } from 'pinia';
import { usePlanStore, useUiStore, useViewStore } from '@/stores/index.js';
import { setView } from '@/app/providers/useViewSwitch.js';
import { exportProjectJSON, applyProjectDocument } from '@/app/providers/useProjectFile.js';
import ModelOverview from '@/shell/dialog/ModelOverview.vue';
import ImportFloorPlanDialog from '@/shell/dialog/ImportFloorPlanDialog.vue';
import { getEngine } from '@/workspace/view3d/registry.js';
import { QUALITY_ITEMS, qualityTitle, qualityName, detectQuality } from '@/workspace/view3d/quality.js';
import { tr, lang } from '@/i18n.js';
import { BOUNDS, ROOMS } from '@/core/model/plan.js';
import { roomArea } from '@/core/geometry/region.js';
import { makePlan, planName, planArea } from '@/core/plans/index.js';

const plan = usePlanStore();
const uiStore = useUiStore();
const viewStore = useViewStore();
const { state } = plan;
const { canUndo, canRedo, planId } = storeToRefs(plan);
const { ui, opt, panes } = uiStore;
const { is3D, drawerOpen, narrowMode } = storeToRefs(uiStore);
const { fitView, zoomCenter, setRatio } = viewStore;
const { undo, redo, clearLayout, resetPlan, applyPlan, addLevel, addBasement, removeLevel } = plan;
const { setTool, togglePane, setLang, openAiConfig } = uiStore;

/** 「推荐」档位按钮上显示当前设备建议的那一档（点击即应用它） */
const recQuality = detectQuality();

const TOOLS = [
  { id: 'select',   label: () => tr('选择', 'Select'),     title: () => tr('选择 / 移动 (V)', 'Select / Move (V)') },
  { id: 'measure',  label: () => tr('测量', 'Measure'),    title: () => tr('测量 (M)', 'Measure (M)') },
  { id: 'demolish', label: () => tr('拆改墙体', 'Demolish'), title: () => tr('拆改非承重墙 (X)', 'Demolish non-bearing walls (X)') },
];

const LAYERS = [
  { k: 'dims',     label: () => tr('尺寸', 'Dims'),             title: null },
  { k: 'labels',  label: () => tr('房间', 'Rooms'),             title: null },
  { k: 'furn',     label: () => tr('家具', 'Furniture'),        title: null },
  { k: 'grid',    label: () => tr('网格', 'Grid'),             title: null },
  { k: 'bearing',  label: () => tr('承重墙', 'Bearing walls'),   title: null },
  { k: 'wallSnap',label: () => tr('贴墙吸附', 'Wall snap'),     title: () => tr('拖动家具时吸附墙面（优先）与家具边线', 'Snap furniture to walls (priority) and furniture edges while dragging') },
  { k: 'lower',   label: () => tr('下层', 'Below'),             title: () => tr('显示下层房间轮廓，便于上下层对位', 'Show the floor below as a dashed outline for alignment') },
];

const MODES = [
  { k: 'orbit', label: () => tr('鸟瞰', 'Orbit') },
  { k: 'walk',  label: () => tr('漫游', 'Walk') },
];

/* 剖切高度：住宅 2.8m 即全高；商铺 / 商场层高更高，另给 3.5 / 4.5 两档，
 * 「层高」档跟随当前楼层的净高（见 levels.js 的 followLevelCut） */
const CUTS = [
  { v: 2.8, label: () => '2.8 m', title: () => tr('全高墙（住宅层高 2.8m）', 'Full walls (2.8m residential storey)') },
  { v: 3.5, label: () => '3.5 m', title: () => tr('剖切到 3.5m（商铺 / 裙房）', 'Cut at 3.5 m (shops / podium)') },
  { v: 4.5, label: () => '4.5 m', title: () => tr('剖切到 4.5m（商场 / 大堂）', 'Cut at 4.5 m (mall / lobby)') },
];

const TOGGLES = [
  { k: 'furn',     label: () => tr('家具', 'Furniture') },
  { k: 'labels',   label: () => tr('房间名', 'Labels') },
  { k: 'allFloors',label: () => tr('整栋', 'All floors') },
  { k: 'roof',     label: () => tr('房顶', 'Roof') },
  { k: 'site',     label: () => tr('地面', 'Ground') },
  { k: 'night',    label: () => tr('夜景', 'Night') },
];

const LANGS = [
  { k: 'zh',  label: '简', t: '简体中文' },
  { k: 'en',  label: 'EN', t: 'English' },
];

const fileEl = ref(null);
const imgEl = ref(null);
const importFile = ref(null);      // 待识别的户型图片（只在内存里，不落盘）

/* ---------------- 户型选择 ---------------- */
const planOpen = ref(false);
const PLAN_GROUPS = [
  { k: 'flat', label: () => tr('平层', 'Flat'), cards: [
    { id: '4b2l',   name: () => tr('四室两厅', '4 Bed / 2 Living') },
    { id: '3b2b',   name: () => tr('三室两厅', '3 Bed / 2 Living') },
    { id: '2b1l',   name: () => tr('两室一厅', '2 Bed / 1 Living') },
    { id: '1b1l',   name: () => tr('一室一厅', '1 Bed / 1 Living') },
    { id: 'studio', name: () => tr('单间', 'Studio') },
  ]},
  { k: 'villa', label: () => tr('独栋洋房', 'Villa'), cards: [
    { id: 'villa', name: () => tr('独栋洋房 · 三层', 'Detached Villa · 3 Floors') },
  ]},
  { k: 'garden', label: () => tr('花园别墅', 'Garden Villa'), cards: [
    { id: 'garden', name: () => tr('花园别墅 · 两层', 'Garden Villa · 2 Floors') },
  ]},
  { k: 'loft', label: () => tr('loft', 'Loft'), cards: [
    { id: 'loft', name: () => tr('loft 样板', 'Loft Sample') },
  ]},
  { k: 'mall', label: () => tr('商业', 'Commercial'), cards: [
    { id: 'mall', name: () => tr('商场样板 · 三层', 'Mall Sample · 3 Floors') },
  ]},
  { k: 'custom', label: () => tr('自定义', 'Custom'), cards: [
    { id: 'custom', name: () => tr('自定义户型', 'Custom layout') },
  ]},
];

/* 用户型几何生成弹窗缩略图（清空布置后的样子：房间 / 区域底面 + 墙体，不含家具） */
function thumb(id){
  const g = makePlan(id), b = g.bounds;
  const fillOf = r => ({ lawn: '#bcd49b', cement: '#c9c6bf', pond: '#9cc9d8', asphalt: '#5a5a5e' }[r.mat] || '#efe9dd');
  const pathOf = r => {
    const ring = ring => ring.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('') + 'Z';
    return `<path d="${[r.poly, ...(r.holes || [])].map(ring).join('')}" fill="${fillOf(r)}" fill-rule="evenodd"/>`;
  };
  const rooms = g.rooms.map(pathOf).join('');
  const regions = (g.regions || []).map(pathOf).join('');
  const walls = g.walls.map(([x0, y0, x1, y1, t]) =>
    `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${t === 'b' ? '#26241f' : '#a7a195'}"/>`).join('');
  return `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet">`
    + `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#f7f4ee"/>${regions}${rooms}${walls}</svg>`;
}

function pickPlan(id){
  planOpen.value = false;
  applyPlan(id, { confirmMsg: false });
}

/* ---------------- 派生值 ---------------- */
const brandTitle = computed(() => `${planName(planId.value, lang.value)} · ${tr('装修设计', 'Interior Design')}`);

const subtitle = computed(() => {
  const tot = ROOMS.filter(r => r.counted !== false && state.rooms[r.id]?.mat !== 'void')
    .reduce((a, r) => a + roomArea(r), 0);
  return tr(`套内使用面积约 ${tot.toFixed(2)} m² · 尺寸单位 mm · 原图比例 1:60`,
            `Net floor area ≈ ${tot.toFixed(2)} m² · Units: mm · Original scale 1:60`);
});

const sunText = computed(() => {
  const h = Math.floor(opt.hour), m = Math.round((opt.hour - h)*60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function paneOpen(k){
  if (narrowMode.value) return drawerOpen.value === k;
  return !panes[k === 'lib' ? 'hideLib' : 'hidePanel'];
}

/* ---------------- 顶部菜单 ---------------- */
const helpOpen = ref(false);
const overviewOpen = ref(false);
const aboutOpen = ref(false);

function openPlan(){ planOpen.value = true; }

/** 执行菜单项前先收起所有下拉菜单 */
function closeMenus(){ document.querySelectorAll('details.menu').forEach(d => { d.open = false; }); }
/* 注意：模板里写成 @click="act(fn)"，Vue 会把整个调用表达式包成事件处理器，
   因此 act 必须「立即执行」传入的函数，不能返回柯里化函数（返回值不会被调用）。 */
function act(fn){ closeMenus(); return fn(); }

/** 常用工具在 3D 中点击时先切回 2D（工具属于平面编辑） */
function pickTool(id){
  if (is3D.value) setView('2d');
  setTool(id);
}

function about(){
  aboutOpen.value = true;
}

/* ---------------- 交互 ---------------- */
function toggleLayer(k){ ui.layers[k] = !ui.layers[k]; }

function setCut(v){ if (opt.mode === 'walk') return; opt.cut = v; }

/** 当前楼层净高（米）：用于「层高」剖切档 */
const levelH = computed(() => ((state.levels.find(l => l.id === state.activeLevel)?.clearH) || 2800) / 1000);
const cutAtLevel = computed(() => Math.abs(opt.cut - levelH.value) < .001);
function setCutLevel(){
  if (opt.mode === 'walk') return;
  opt.cut = levelH.value;
}

/** 外墙半透明：只是显示方式，切换后重建一次建筑几何 */
function toggleWallAlpha(){
  if (opt.mode === 'walk') return;          // 漫游时墙体保持实心
  opt.wallAlpha = !opt.wallAlpha;
  getEngine()?.sync();                      // 只重建建筑（家具不变）
}

/** 3D 开关：家具 / 房间名由 View3DHost 的 watch 同步，夜景需要重算一遍灯光 */
function toggle3d(k){
  opt[k] = !opt[k];
  if (k === 'night') getEngine()?.applyNight();
  if (k === 'allFloors') getEngine()?.sync(true);
  if (k === 'roof') getEngine()?.sync();       // 房顶整体重建（只影响顶层体量）
  if (k === 'site') getEngine()?.sync();       // 场地（大地面 / 地下层土体）重建
}

function onSun(e){ opt.hour = +e.target.value; getEngine()?.applyLight(); }

/** 画质档位（性能）：像素比 / 阴影 / 灯光数量 / 环境反射立即生效（抗锯齿需重进 3D）
 *  「推荐」不是一个独立档位：按当前设备在低 / 中 / 高里挑一个直接用 */
function setQuality(k){
  const q = k === 'auto' ? detectQuality() : k;
  if (opt.quality !== q){
    opt.quality = q;
    getEngine()?.applyQuality();
  }
  uiStore.showToast(tr(`画质已设为「${qualityName(q)}」${k === 'auto' ? tr('（推荐）', ' (recommended)') : ''}`,
    `Quality set to ${qualityName(q)}${k === 'auto' ? ' (recommended)' : ''}`));
}

function setMode(m){ getEngine()?.setMode(m); }

function onIso(){
  const e = getEngine();
  if (!e) return;
  e.setMode('orbit');
  e.flyTo(e.isoWhole());
}

function onTop(){
  const e = getEngine();
  if (!e) return;
  e.setMode('orbit');
  e.flyTo(e.topWhole());
}

/* ---------------- 导入导出 ---------------- */
function download(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportPNG(){
  if (is3D.value){ getEngine()?.shot(); return; }
  const svg = document.querySelector('#plan');
  if (!svg) return;
  const clone = svg.cloneNode(true), W = 3200, H = Math.round(W*BOUNDS.h/BOUNDS.w);
  clone.setAttribute('viewBox', `${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}`);
  clone.setAttribute('width', W);
  clone.setAttribute('height', H);
  const selEl = clone.querySelector('#gSel');
  if (selEl) selEl.innerHTML = '';
  const gridEl = clone.querySelector('#gGrid');
  if (gridEl){
    gridEl.innerHTML = `<rect x="-20000" y="-20000" width="55000" height="55000" fill="${ui.layers.grid ? 'url(#grid)' : '#f7f4ee'}"/>`;
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x: -20000, y: -20000, width: 55000, height: 55000, fill: '#f7f4ee' })
      .forEach(([k, v]) => bg.setAttribute(k, v));
    clone.insertBefore(bg, gridEl);
  }
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(img, 0, 0, W, H);
    cv.toBlob(b => download(tr('户型装修方案', 'floor-plan-design') + '.png', b));
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
}

function exportJSON(){
  try {
    const { name, text } = exportProjectJSON();
    download(name, new Blob([text], { type: 'application/json' }));
    uiStore.showToast(tr('已导出方案（楼层 / 家具 / 区域 / 墙体）', 'Project exported (floors, furniture, areas, walls)'));
  } catch (err){
    uiStore.showToast(tr('导出失败：', 'Export failed: ') + (err?.message || ''));
  }
}

async function onFile(e){
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const txt = await file.text();
    const { legacy } = applyProjectDocument(JSON.parse(txt));
    uiStore.showToast(legacy
      ? tr('已导入（旧版文件）', 'Imported (legacy file)')
      : tr('已导入方案', 'Project imported'));
  } catch (err){
    uiStore.showToast(tr('导入失败：', 'Import failed: ') + (err?.message || tr('文件格式不正确', 'invalid file')));
  }
}

/* ---------------- 导入户型图（图片 → 可编辑平面） ---------------- */
function onImage(e){
  const file = e.target.files[0];
  e.target.value = '';                 // 允许重复选择同一张图
  if (!file) return;
  if (!/^image\//.test(file.type))
    return uiStore.showToast(tr('请选择图片文件（PNG / JPG）', 'Please pick an image file (PNG / JPG)'));
  importFile.value = file;             // 交给弹窗去识别 + 二次确认
}

function onImportApply({ geo, meta }){
  importFile.value = null;
  try {
    plan.applyImportedGeo(geo, meta);
    if (is3D.value) setView('2d');     // 导入结果就是平面图，直接切回 2D
    fitView();
  } catch (err){
    uiStore.showToast(tr('导入失败：', 'Import failed: ') + (err?.message || ''));
  }
}
</script>
