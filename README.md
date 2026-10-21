# 户型装修设计（floorplan-3d-pro）

> 本目录是X 用户[@akokoi1](https://x.com/akokoi1) 的热门分享户型设计工具的**模块化重构pro版**：
> 从单个 `index.html` 迁移到 **Vue 3 + Vite + Three.js** 工程。功能、交互与外观保持一致，
> 但代码按 AppShell 的区域分层（外壳 / 工作区 / 领域内核 / 状态），便于扩展（多楼层、loft 夹层、漫游等）。
> 根目录 README 描述的是无需构建的单文件版本，本文档描述工程化版本。

中文 | [English](README.en.md)

纯前端的户型装修设计工具：在 2D 平面图上摆放家具、拆改墙体、测量尺寸，一键切换到 Three.js 3D 场景，可以鸟瞰，也可以第一人称漫游。支持多楼层与 loft 夹层。

## 功能

**2D 平面布置**
- 按原始户型 1:60 / 1:100 比例显示，尺寸单位 mm
- 从左侧家具库拖入 80 种家具家电（卧室、客厅、餐厨、卫浴、家电、书房休闲、隔断、楼层、户外·车库：轿车 / SUV / MPV / 停车位 / 路灯 / 灌木 / 樟树）
- 拖动移动、旋转（`Shift` 自由角度）、调整尺寸，贴墙 / 贴家具边线自动吸附（墙体优先）；同类家具靠近时显示虚线辅助框，并按行 / 列拉出**边框延长线**——即使两件家具相隔较远，也能沿延长线吸附成一条直线，把餐椅排成整齐的一排
- 家具不能穿墙：落点压到墙体 / 门窗时显示红色警示框与「与墙体 / 门窗重叠」提示，松开后自动还原到拖动前的位置
- 测量工具（靠近墙面自动吸附，`Shift` 锁定水平 / 垂直）
- 拆改非承重墙，承重墙单独标示；可在墙上开门 / 开窗 / 加隔断
- 拉框绘制「区域」作为楼板，区域可设地面材料、可标记挑空

**多楼层 & loft 夹层**
- 楼层管理：新增楼层、切换当前层、把任意层设为夹层（loft）
- 夹层是独立平面：有自己的外墙与楼板区域，不继承一层的墙面与房间
- 夹层按户型需求生成一圈围护外墙，挑空区域保留栏杆
- 一层上行楼梯（步梯 / 旋转步梯 / 扶梯）的占地自动在夹层楼板开洞，移动 / 旋转楼梯会同步更新
- loft 户型必须保留至少一处楼梯（一层最后一处不可删除 / 清空）

**3D 场景**
- 鸟瞰、斜视、俯视多种视角，点击房间列表可飞到对应房间
- 漫游模式：桌面端 `WASD` + 鼠标，触屏用虚拟摇杆；从入户门外开始，一层与夹层全程实色渲染，模拟人的行走视角；未铺地板的区域算法上禁止进入，不会穿出楼板边缘
- 全高墙 / 剖切墙切换，新增「半透明」外墙开关，便于查看户型内部
- 日照时间滑块、夜景灯光；「整栋」开关控制其它楼层实色渲染（含家具）或半透明体量
- 门扇模型：入户门 / 房门（木门套、凹板、双面把手）默认打开，可点门开关；推拉门为门套 + 玻璃双扇，默认滑开
- 精细家具模型：柜门分缝与拉手、软包床头、带环境反射的金属与陶瓷材质等
- 在 3D 中也能选中、拖动家具，与 2D 方案实时同步
- 帮助 → **模型总览**：按分类浏览家具库的 2D 图例，点击即可在右侧 3D 预览（拖动环绕、滚轮缩放，可开关包围盒 / 尺寸 / 自动旋转）

**方案与统计**
- 房间面积与套内使用面积自动统计（楼梯洞口、挑空会从面积中扣除）
- 为每个房间 / 区域更换地面材料（木地板、地砖、大理石、水磨石、地毯等），按面积加 5% 损耗估算造价
- 撤销 / 重做，方案自动保存在浏览器本地（`localStorage` / `IndexedDB`）
- 中文 / English 界面切换（顶栏右侧按钮，默认中文，选择会记住）
- 导出 PNG 图片；导出 / 导入方案 JSON（含所有楼层、家具、房间区域与墙体门窗，不含视图状态）

## 快速开始

需要 Node.js 18+，推荐使用 pnpm：

```bash
git clone <仓库地址>
cd floorplan-3d-pro
pnpm install          # 或 npm install
pnpm dev              # 本地开发服务器（默认 http://localhost:5173）
```

生产构建：

```bash
pnpm build            # 输出到 dist/
pnpm build:single     # 借助 vite-plugin-singlefile 打包成单个 HTML 文件
pnpm preview          # 预览构建产物
```

> 3D 场景依赖 [Three.js](https://threejs.org/)（已作为 npm 依赖打包，构建后无需联网）。

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `T` | 切换 2D / 3D |
| `V` / `M` / `X` | 选择 / 测量 / 拆改墙体 |
| `R` / `Shift+R` | 选中家具顺时针 / 逆时针旋转 90° |
| `Delete` / `Backspace` | 删除选中家具 |
| `Ctrl/⌘ + D` | 复制选中家具 |
| `Ctrl/⌘ + Z`，`Ctrl/⌘ + Shift + Z` | 撤销，重做 |
| `F` | 适应窗口 |
| `+` / `-` | 放大 / 缩小 |
| `[` / `]` | 展开 / 收起左侧家具库、右侧面板 |
| `Shift + F` | 全屏 |
| `Esc` | 取消当前操作 |
| 漫游：`WASD` / 方向键，`Shift`，鼠标 / 触屏摇杆 | 移动，快走，转动视角 |

## 技术栈

- **Vue 3**（`<script setup>`）+ **Pinia** 状态管理
- **Three.js** r160（OrbitControls、PointerLockControls、RoundedBoxGeometry、RoomEnvironment、CSS2DRenderer）
- **Vite 5** 构建；`vite-plugin-singlefile` 可输出单文件版本
- 2D 平面图用 **SVG** 绘制
- 目录按 AppShell 区域划分：`shell/` 只负责布局，`workspace/` 是内容区，`core/` 是无框架依赖的纯逻辑，`stores/` 是唯一状态来源；导入统一使用 `@/` 别名
- 中英文文案集中在 `src/i18n.js`
- 方案数据保存在浏览器本地存储，自动恢复

## 项目结构

```
floorplan-3d-pro/
├─ index.html              入口 HTML
├─ vite.config.js          Vite 配置（@ → src 别名、single-file 模式）
├─ src/
│  ├─ main.js              Vue + Pinia 启动入口
│  ├─ App.vue              应用入口：AppShell + ToastHost，只负责全局生命周期
│  ├─ i18n.js              中英文词条
│  ├─ app/                 应用装配层
│  │  ├─ AppShell.vue      五区骨架：顶栏 / 左右面板 / 工作区 / 状态栏 / 浮层
│  │  └─ providers/
│  │     ├─ useShortcuts.js     全局键盘快捷键
│  │     ├─ useFullscreen.js    全屏切换
│  │     └─ useViewSwitch.js    2D ⇄ 3D 切换（带过渡动画与忙碌锁）
│  ├─ shell/               应用外壳：一个目录对应屏幕上的一块区域
│  │  ├─ header/AppHeader.vue        顶栏：户型选择、剖切/半透明、2D/3D、整栋、夜景、语言等
│  │  ├─ left-panel/
│  │  │  ├─ LibPanel.vue             左侧家具 / 墙面组件库
│  │  │  └─ RoomList.vue             房间列表（点击飞入 3D）
│  │  ├─ right-panel/
│  │  │  ├─ PropPanel.vue            属性面板：按选中对象分发
│  │  │  └─ panels/                  Overview / Room / Furn / Elem
│  │  ├─ status-bar/StatusBar.vue    状态栏（坐标 / 比例 / 操作提示）
│  │  └─ overlay/                    工作区浮层
│  │     ├─ OverlayLayer.vue         浮层容器（模式提示 / 比例尺）
│  │     ├─ LevelBar.vue             楼层切换条
│  │     └─ FloatingBar.vue          选中后的浮动工具条
│  ├─ workspace/           内容区：铺满整屏的 2D 画布与 3D 场景
│  │  ├─ Workspace.vue     2D / 3D 叠放容器
│  │  ├─ plan2d/
│  │  │  ├─ PlanCanvas.vue           2D SVG 平面图（墙体/门窗/家具/区域/量尺/下层虚影）
│  │  │  ├─ interaction/usePlanInteraction.js  拖拽 / 吸附 / 画墙 / 开洞 / 区域绘制
│  │  │  └─ render/                  SVG 片段：defs（材质图案）/ dims（尺寸链）/ measure（测量线）
│  │  └─ view3d/
│  │     ├─ View3DHost.vue           Three.js 画布容器与渲染循环
│  │     ├─ registry.js              全局引擎实例注册
│  │     ├─ coords.js                平面 mm ⇄ 世界 m 换算
│  │     ├─ engine/
│  │     │  ├─ engine.js             引擎类：构造函数 + 字段
│  │     │  ├─ constants.js          常量（视距 / 门高 / 楼梯类型…）
│  │     │  └─ methods/              按职责分组挂在原型上
│  │     │     ├─ build.js           建筑 / 门窗 / 家具 / 灯光的几何构建
│  │     │     ├─ camera.js          视角、飞行、过渡动画
│  │     │     ├─ walk.js            漫游、碰撞、按楼层找楼板
│  │     │     └─ lifecycle.js       初始化 / 同步 / 进出 3D / 渲染循环 / 销毁
│  │     └─ build/
│  │        ├─ materials.js          材质缓存、地面 / 水面材质、环境贴图
│  │        ├─ primitives.js         建模图元：box / rbox / cylinder / lathe / 手柄 / 柜门…
│  │        └─ furniture.js          各类家具 / 家电 / 楼梯 / 洁具的 3D 模型
│  ├─ stores/              唯一状态目录
│  │  ├─ index.js          createPinia + store 组合根
│  │  ├─ ui.js             交互状态：当前工具、选中项、图层开关、3D 显示选项、漫游输入
│  │  ├─ view.js           2D 视口：缩放 / 平移 / 适配 / 比例尺
│  │  └─ plan/             方案数据（对外仍只有 usePlanStore()，内部按会话拆分）
│  │     ├─ index.js            组合根，装配下列模块并导出 API
│  │     ├─ context.js          共享 state、几何缓存与变更广播
│  │     ├─ geometry.js         静态几何 + 用户增量 → 全局几何数组
│  │     ├─ levels.js           楼层 / 夹层 / 各层快照与面积
│  │     ├─ history.js          撤销栈与快照
│  │     ├─ furniture.js        家具增删改、吸附、跨层剪贴板
│  │     ├─ walls.js            画墙 / 开洞 / 拆改 / 墙段合并
│  │     ├─ regions.js          区域绘制、房间删除
│  │     └─ plans.js            户型切换 / 重置 / 导入
│  ├─ core/                与框架无关的领域内核
│  │  ├─ model/
│  │  │  ├─ plan.js             纯几何工具：坐标换算、墙体分段、点在多边形内、户型外轮廓
│  │  │  └─ level.js            几何解析：resolveGeometry / regionRooms / 楼板开洞裁剪
│  │  ├─ geometry/
│  │  │  ├─ region.js           面积 / 多边形布尔 / 楼板与天花轮廓
│  │  │  └─ wallMath.js         墙体类型判定（是否可开洞、厚度、合并）
│  │  ├─ library/
│  │  │  ├─ index.js            家具工厂 `F`、家具库 `LIB`、类型与吸附分类
│  │  │  ├─ furnSvg.js          家具 2D SVG 图例
│  │  │  └─ wallItems.js        墙面组件库（门 / 窗 / 隔断 / 楼梯元素）
│  │  └─ plans/index.js         内置户型、静态几何（含 loft 夹层）、地面材料与单价、geoVersion
│  ├─ shared/              通用且无业务含义
│  │  ├─ ui/GlassCard.vue       磨砂浮动卡片
│  │  ├─ ui/ToastHost.vue       轻提示
│  │  └─ dom/planSvg.js         平面图 <svg> 元素登记表
│  └─ styles/
│     ├─ app.css                样式入口：只按序 @import 下列文件
│     ├─ tokens.css             设计令牌与全局重置
│     ├─ shell.css              外壳：区域层 / 卡片 / 标题栏与菜单
│     ├─ panels.css             左右面板与属性面板内容
│     ├─ workspace.css          2D 画布 / 3D 场景 / 浮层 / 工具条
│     └─ responsive.css         窄屏抽屉 / 宽屏收起 / 触屏适配
```

## 自定义户型

户型数据集中在 `src/core`：

- `core/plans/index.js` 的 `PLANS` 定义每个户型的静态几何（`LOFT_GEO`、`DEFAULT_GEO` 等）：墙体 `walls`、窗 `wins`、门 `doors`、推拉门 `slides`、房间 `rooms`、楼板区域 `regions`，以及地面材料 `MATS` 与单价。
- `core/library/index.js` 的 `F(...)` 创建家具，`LIB` 定义左侧家具库分组；`core/library/furnSvg.js` 给出 2D 图例，`workspace/view3d/build/furniture.js` 给出 3D 模型。
- 夹层的独立几何通过 `levelGeos` 指定；`geoVersion` 用于本地存档迁移（几何变更时递增，旧存档会自动重算）。
- 新增数据或组件时按层归位：纯几何 / 纯数据放 `core/`，界面放 `shell/` 或 `workspace/`，状态放 `stores/`，导入统一写 `@/...`。

修改这些数据即可换成自己的户型；新增的内置户型在 `PLANS` 中登记后，顶栏下拉即可选择。

## 致谢

特别感谢 [wy51ai/floorplan-3d](https://github.com/wy51ai/floorplan-3d) 这个项目：第一次看到它时就被「平面图直接长出 3D 家」的体验打动，本项目的很多思路与细节都从中受益，特此致谢。

## 许可协议

[MIT](LICENSE)
