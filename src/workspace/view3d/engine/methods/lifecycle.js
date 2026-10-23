import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WALLS, WINS, DOORS, SLIDES, LINTELS, COARSE, TAP } from '@/core/model/plan.js';
import { tr } from '@/i18n.js';
import { mat, setEnv, setEnvK, setGlassMat, setFrameMat, buildFurniture } from '@/workspace/view3d/build/index.js';
import { H, FOV, M, wx, wz } from '@/workspace/view3d/coords.js';
import { qualityPreset } from '@/workspace/view3d/quality.js';
import { EYE_H, CLIMB_TYPES } from '../constants.js';

/* 画质档位 → three 的阴影贴图类型 */
const SHADOW_TYPES = {
  basic: THREE.BasicShadowMap,
  pcf:   THREE.PCFShadowMap,
  soft:  THREE.PCFSoftShadowMap
};

/** 家具入场前的隐藏矩阵（InstancedMesh 用零缩放） */
const ZERO_MAT = new THREE.Matrix4().makeScale(0, 0, 0);

/** 弹性落地曲线：先加速下落，触底后多次小幅回弹 */
function easeOutBounce(t){
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1) return n1*t*t;
  if (t < 2/d1) return n1*(t -= 1.5/d1)*t + .75;
  if (t < 2.5/d1) return n1*(t -= 2.25/d1)*t + .9375;
  return n1*(t -= 2.625/d1)*t + .984375;
}

/* 节庆串灯只挂在这几类单株乔木上（树阵 / 行道树是组合件，跳过） */
const HOLIDAY_TREES = new Set(['ginkgo', 'cherry', 'osmanthus', 'camphor', 'zelkova', 'tallow', 'palm', 'bamboo']);

/* 季节粒子贴图：柔边圆点（花瓣 / 落叶 / 雪片共用） */
let SEASON_TEX = null;
function seasonTexture(){
  if (SEASON_TEX) return SEASON_TEX;
  if (typeof document === 'undefined' || !document.createElement) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g2 = cv.getContext('2d');
  const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(.45, 'rgba(255,255,255,.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = gr;
  g2.fillRect(0, 0, 64, 64);
  SEASON_TEX = new THREE.CanvasTexture(cv);
  return SEASON_TEX;
}

/* View3D.prototype 的方法组：由 engine.js 统一挂载 */
export const lifecycleMethods = {
  /** 高 DPI 屏下的渲染像素比：按画质档位封顶（低 1 / 中 1.5 / 高 2） */
  dprFor(q){
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    return Math.min(dpr, q?.dpr || 1.5);
  },

  init(){
    if (this.inited) return;
    this.inited = true;

    const SW = () => this.stage.clientWidth, SH = () => this.stage.clientHeight;
    // 画质档位（性能）：'auto' 时按平台与机器配置自动落到低 / 中 / 高
    const q = this.quality = qualityPreset(this.uiStore.opt.quality);

    this.renderer = new THREE.WebGLRenderer({
      antialias: q.aa,                 // 创建期固定：运行期切档需重新进入 3D 才生效
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(this.dprFor(q));
    this.renderer.setSize(SW(), SH());
    this.renderer.shadowMap.enabled = q.shadow;
    this.renderer.shadowMap.type = SHADOW_TYPES[q.shadowType] || THREE.PCFSoftShadowMap;
    // 静态场景：阴影贴图只在几何 / 光照变化时重算（否则每帧都要重画一遍阴影，开销很大）
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.host.prepend(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(SW(), SH());
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.host.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, SW()/SH(), .05, 300);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI*.495;
    this.orbit.minDistance = 1.5;
    this.orbit.maxDistance = 45;

    this.walkCtl = new PointerLockControls(this.camera, document.body);
    this.walkCtl.addEventListener('lock',   () => { this.walk.locked = true;  });
    this.walkCtl.addEventListener('unlock', () => { this.walk.locked = false; });
    // 原地转头不改变位置：显式标记重绘（按需渲染下否则要等下一次移动才刷新）
    this.walkCtl.addEventListener('change', () => { this.needsRender = true; });

    this.hemi = new THREE.HemisphereLight(0xfff8ee, 0xb9a88f, 1.1);
    this.sun  = new THREE.DirectionalLight(0xfff1dd, 2.6);
    this.sun.castShadow = q.shadow;
    this.sun.shadow.mapSize.setScalar(q.shadowSize || (COARSE ? 1024 : 2048));
    Object.assign(this.sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 60 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: 0xf2eee7, roughness: 1 })
    );
    this.ground.rotation.x = -Math.PI/2;
    this.ground.position.y = -0.015;
    this.ground.receiveShadow = true;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.ground);

    // 环境反射（PMREM）：低画质跳过（省掉一次离屏渲染，且材质不挂 envMap）
    if (q.env){
      const pm = new THREE.PMREMGenerator(this.renderer);
      setEnv(pm.fromScene(new RoomEnvironment(), .04).texture);
      pm.dispose();
    } else setEnv(null);

    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xcfe6ef, roughness: .05, transparent: true,
      opacity: .28, depthWrite: false, side: THREE.DoubleSide
    });
    this.wallMat  = mat('#f4f1eb', { roughness: .92 });
    this.capMat   = mat('#34312d', { roughness: .9 });
    this.frameMat = mat('#5d6166', { roughness: .5, metalness: .4 });
    // 漫游辅助：墙体棱线 + 踢脚线
    this.edgeMat  = new THREE.LineBasicMaterial({ color: 0x6f675b });
    this.skirtMat = mat('#8b7f6e', { roughness: .6 });
    // 共享给 buildFurniture（淋浴房玻璃 / 窗框）
    setGlassMat(this.glassMat);
    setFrameMat(this.frameMat);

    // 当前楼层（可编辑层）整体放入 activeRoot，按楼层标高 elev 抬高；
    // 其它楼层放入 ghostRoot，作为上下文静态渲染。
    this.activeRoot = new THREE.Group();
    this.ghostRoot  = new THREE.Group();
    this.ghostFurnG = [];                      // 整栋模式下其它楼层的家具组（切显隐时只动这几个组）
    this.archFloor = new THREE.Group();
    this.archUp    = new THREE.Group();
    this.wallG     = new THREE.Group();          // 节点级墙体：按墙签名增量更新，不参与 archUp 的全量清理
    this.furnG     = new THREE.Group();
    this.instG     = new THREE.Group();          // 树木 / 车辆 InstancedMesh（与逐件家具同一坐标系）
    this.labelG    = new THREE.Group();
    this.lampG     = new THREE.Group();
    this.holidayG  = new THREE.Group();          // 节庆串灯（夜间）
    this.roofG     = new THREE.Group();          // 房顶（挂在世界坐标上：属于顶层，不属于当前层）
    this.siteG     = new THREE.Group();          // 场地：地下层基坑土壁 + 周边地坪
    this.activeRoot.add(this.archFloor, this.archUp, this.wallG, this.furnG, this.instG, this.labelG, this.lampG, this.holidayG);
    this.scene.add(this.activeRoot, this.ghostRoot, this.roofG, this.siteG);
    // 季节粒子独立挂场景（世界坐标，随相机环绕）
    this.seasonG = new THREE.Group();
    this.seasonPts = null;
    this.scene.add(this.seasonG);
    this.instMap = new Map();                    // fid → { mesh, index, m }
    this.fx = [];                                // 可交互动画件（道闸 / 大门 / 水柱）
    this.fxState = {};                           // fid → 开合状态（重建几何后保持）
    this.selTemp = null;                         // 选中实例临时实体化出来的普通 Group
    this.selInst = null;                         // 被临时隐藏的实例记录
    this.dropFx = null;                          // 家具弹性入场动画状态
    this.activeElev = 0;                    // 当前楼层标高（米）
    this.activeLevelH = H;                  // 当前楼层净高（米）
    // 其它楼层用半透明材质，既能看出叠层体量，又不完全遮挡当前编辑层
    this.ghostMat = mat('#e6e0d6', { roughness: .95, transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide });
    // 「半透明」模式：外墙用更通透的材质，内部布局一目了然
    this.wallAlphaMat = mat('#eae3d7', { roughness: .9, transparent: true, opacity: .22, depthWrite: false });
    this.selKey = null;
    this.selHelper = null;
    // 性能 HUD 采样窗口
    this._perfT = performance.now();
    this._perfN = 0;

    const cv = this.renderer.domElement;
    this.cv = cv;
    this.downAt = null;
    this.look = null;

    cv.addEventListener('pointerdown', e => {
      this.downAt = [e.clientX, e.clientY];
      this.uiStore.closeDrawers();
      if (this.walk.touch && !this.look){
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
        cv.setPointerCapture(e.pointerId);
      }
    });
    cv.addEventListener('pointermove', e => {
      if (!this.look || e.pointerId !== this.look.id) return;
      this.lookBy(e.clientX - this.look.x, e.clientY - this.look.y);
      this.look.x = e.clientX; this.look.y = e.clientY;
    });
    cv.addEventListener('pointercancel', e => { if (this.look?.id === e.pointerId) this.look = null; });

    // 拖动已选中的家具沿地面摆放（与 2D 共用网格与贴墙吸附）。
    // 在父元素上用捕获阶段监听，赶在 OrbitControls 之前关掉它，避免同时旋转镜头
    this.fdrag = null;
    this.host.addEventListener('pointerdown', e => {
      if (e.target !== cv || !e.isPrimary || this.anim || this.uiStore.opt.mode !== 'orbit' || this.uiStore.ui.sel?.kind !== 'furn') return;
      // 旋转 gizmo 优先：环在家具外侧，点中环就不再开始平移
      if (this.gizmoDown(e)) return;
      const h = this.pick(e), f = h?.fid === this.uiStore.ui.sel.id && this.plan.getF(h.fid), g = f && this.groundAt(e.clientX, e.clientY);
      if (!g) return;
      this.fdrag = {
        id: f.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY,
        ox: g.x - f.cx, oy: g.y - f.cy,
        cx0: f.cx, cy0: f.cy,                 // 落点非法时还原用
        before: this.plan.snap(), moved: false
      };
      this.orbit.enabled = false;
      this.fly = null;
      cv.setPointerCapture(e.pointerId);
    }, true);

    cv.addEventListener('pointermove', e => {
      if (this.grot || this.adrag){ this.gizmoMove(e); return; }
      if (!this.fdrag || e.pointerId !== this.fdrag.pid) return;
      if (!this.fdrag.moved && Math.hypot(e.clientX - this.fdrag.sx, e.clientY - this.fdrag.sy) < TAP) return;
      const f = this.plan.getF(this.fdrag.id), g = this.groundAt(e.clientX, e.clientY);
      if (!f || !g) return;
      this.fdrag.moved = true;
      cv.style.cursor = 'grabbing';
      [f.cx, f.cy] = this.plan.snapMove(f, g.x - this.fdrag.ox, g.y - this.fdrag.oy, g.s);
      this.furnG.children.find(o => o.userData.fid === f.id)?.position.set(wx(f.cx), 0, wz(f.cy));
    });

    // 悬停在 gizmo 上时换成抓手光标（不影响任何拖动逻辑）
    cv.addEventListener('pointermove', e => this.gizmoHover(e));

    const endF = e => {
      if (!this.fdrag || e.pointerId !== this.fdrag.pid) return;
      const d = this.fdrag;
      this.fdrag = null;
      this.orbit.enabled = true;
      cv.style.cursor = '';
      if (!d.moved) return;
      /* 3D 拖动与 2D 共用同一套空间校验（core/geometry/collide.js）：
       * 落点压墙 / 挡门就还原到拖动前，且不写进撤销栈。 */
      const f = this.plan.getF(d.id);
      const chk = f ? this.plan.placementAt(f, f.cx, f.cy) : { ok: true };
      if (!chk.ok){
        if (f){
          f.cx = d.cx0; f.cy = d.cy0;
          const o = this.furnG.children.find(g => g.userData.fid === f.id);
          if (o) o.position.set(wx(f.cx), 0, wz(f.cy));
        }
        this.uiStore.showToast(chk.reason === 'door'
          ? tr('位置挡住了门扇开启范围，已还原', 'Blocks the door swing — reverted')
          : tr('当前位置与墙体 / 门窗重叠，已还原', 'Overlaps a wall or opening — reverted'));
        this.needsRender = true;
        return;
      }
      this.plan.commit(d.before);
    };
    cv.addEventListener('pointerup', endF);
    cv.addEventListener('pointercancel', endF);

    // 旋转 gizmo 的收尾：有角度变化才写撤销栈
    cv.addEventListener('pointerup', e => this.gizmoUp(e));
    cv.addEventListener('pointercancel', e => this.gizmoUp(e));

    cv.addEventListener('pointerup', e => {
      // 刚点过旋转环：这一次抬起不参与「点空白取消选中」
      if (this._gizmoClick){ this._gizmoClick = false; return; }
      const tap = this.downAt && Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) <= TAP;
      if (this.look?.id === e.pointerId){
        this.look = null;
        if (tap){ const h = this.pick(e); if (h?.door && h.dist < 3.5) this.toggleDoor(h.door); }
        return;
      }
      if (this.anim || this.uiStore.opt.mode !== 'orbit' || !tap) return;
      const h = this.pick(e);
      if (h?.door) this.toggleDoor(h.door);
      else if (h?.fid){
        const f = this.plan.getF(h.fid);
        // 可交互资产：点击开合（道闸抬杆 / 大门滑开），同时选中以便继续拖动
        if (f && (f.type === 'barrier' || f.type === 'gate')){
          this.toggleAsset(f.id);
          this.uiStore.select({ kind: 'furn', id: h.fid });
        } else this.uiStore.select({ kind: 'furn', id: h.fid });
      }
      else if (h?.room) this.uiStore.select({ kind: 'room', id: h.room });
      else this.uiStore.select(null);
    });

    this._ro = new ResizeObserver(() => {
      this.renderer.setPixelRatio(this.dprFor(this.quality));   // 换屏 / 缩放窗口后档位像素比不丢
      this.renderer.setSize(this.stage.clientWidth, this.stage.clientHeight);
      this.labelRenderer.setSize(this.stage.clientWidth, this.stage.clientHeight);
      this.camera.aspect = this.stage.clientWidth / this.stage.clientHeight;
      this.camera.updateProjectionMatrix();
      this.needsRender = true;
    });
    this._ro.observe(this.stage);

    addEventListener('keydown', this._onKey);
    addEventListener('keyup', this._onKeyUp);
  },

  /* ======================= 建筑 ======================= */
  sync(force){
    if (!this.inited || (!this.active && !force)) return;
    const st = this.plan.state;
    // 楼梯的上 / 下行会影响楼地面开洞（梯井），一并纳入建筑几何的签名
    const climb = st.furniture
      .filter(f => CLIMB_TYPES.has(f.type))
      .map(f => `${f.id}:${f.sdir ?? 1}:${f.cx}:${f.cy}:${f.rot}:${f.w}:${f.d}`);
    // 多楼层：楼层元信息、当前楼层、各层数据都纳入签名（levelData 含非当前层的几何与家具）
    const a = JSON.stringify([st.levels, st.activeLevel, st.levelData, st.rooms, st.regions, st.demolished, this.uiStore.opt.cut, this.uiStore.opt.allFloors, this.uiStore.opt.wallAlpha, this.uiStore.opt.roof, this.uiStore.opt.site, WALLS, WINS, DOORS, SLIDES, LINTELS, climb]);
    // 当前楼层也要入签名：下层楼梯是否渲染取决于当前层；
    // 整栋 / 漫游时楼梯改由各层 ghost 渲染，所以这两个开关也要触发家具重建
    const f = JSON.stringify([st.activeLevel, this.uiStore.opt.allFloors, this.uiStore.opt.mode,
      st.furniture, Object.values(st.levelData || {}).map(d => d && d.furniture)]);
    const l = JSON.stringify([st.levels, st.activeLevel, st.rooms, st.regions, this.uiStore.opt.cut]);
    if (force || a !== this.sigArch){ this.sigArch = a; this.buildArch(); this.buildGhosts(); }
    if (force || f !== this.sigFurn){ this.sigFurn = f; this.buildFurn(); }
    if (force || l !== this.sigLabels){ this.sigLabels = l; this.buildLabels(); }
  },

  // CSS2DRenderer 只看标签自身的 visible，不继承父级，所以逐个设置
  showLabels(v){
    this.labelG.visible = v;
    this.labelG.children.forEach(o => { o.visible = v; });
    this.needsRender = true;
  },

  applyGrow(){
    if (!this.inited) return;
    /* 墙体「从楼板里长出来」：整组沿 Y 平移，而不是缩放。
     * 缩放会把墙 / 门窗 / 汽车压成接近零厚度，面与面共面后深度值打架 → 闪烁；
     * 平移时墙始终是完整体量，只是暂时藏到楼板以下，由楼板遮挡。 */
    const k = Math.max(0, Math.min(1, this.grow));
    // 多下沉 60mm：起始时墙顶完全落到室外地坪以下，避免与地面 / 楼板出现薄片共面
    const dy = -(1 - k)*((this.activeLevelH || 2.8) + .06);
    this.archUp.position.y = dy;
    if (this.wallG) this.wallG.position.y = dy;
    this.archUp.scale.y = 1;
    if (this.wallG) this.wallG.scale.y = 1;
    // 家具不再整体缩放：由入场动画逐件控制显隐与高度
    this.furnG.scale.y = 1;
    if (this.instG) this.instG.scale.y = 1;
    this.lampG.visible  = k > .99;
    if (this.roofG) this.roofG.visible = k > .99;    // 房顶随生长动画一起出现 / 收起
  },

  /* ======================= 画质档位（性能） ======================= */
  /**
   * 切换画质档位：像素比 / 阴影贴图 / 点光源数量 / 环境反射强度。
   * 抗锯齿是渲染器创建期参数，运行期切档时保持不变（重新进入 3D 后按新档位生效）。
   */
  applyQuality(){
    if (!this.inited) return;                  // 还没进过 3D：init() 会直接按新档位建
    const q = this.quality = qualityPreset(this.uiStore.opt.quality);
    this.renderer.setPixelRatio(this.dprFor(q));
    this.renderer.setSize(this.stage.clientWidth, this.stage.clientHeight);
    this.renderer.shadowMap.enabled = q.shadow;
    this.renderer.shadowMap.type = SHADOW_TYPES[q.shadowType] || THREE.PCFSoftShadowMap;
    this.sun.castShadow = q.shadow;
    // 改阴影贴图分辨率需要丢掉旧的贴图才会真正重建
    if (this.sun.shadow.map){ this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.setScalar(q.shadowSize);
    this.applyNight();                         // 重建顶灯（数量受档位限制）+ 套用光照（含 envK）
    this.needsRender = true;
  },

  /* ======================= 日照 / 夜景 ======================= */
  /** 切夜景 / 日景时调用：重建顶灯与全部点光源，再套用环境光 */
  applyNight(){
    if (!this.inited) return;                    // 还没进过 3D：进入时由 buildArch 统一应用
    // 与 build() 保持同一套判据：剖切高度 / 本层净高（夹层净高可能低于 2.8m）
    const lh = this.activeLevelH || 2.8;
    this.buildLamps(Math.min(this.uiStore.opt.cut, lh), lh);
    this.applyLight();
  },

  applyLight(){
    if (!this.inited) return;                    // 还没进过 3D：灯光等进入时由 buildArch 统一应用
    const t = (this.uiStore.opt.hour - 6)/12, az = Math.PI*(.15 + t*.7);
    const el = Math.sin(Math.PI*t)*1.05 + .15, warm = 1 - Math.sin(Math.PI*t);
    // 地下层：太阳几乎照不进来，用环境光补足，否则地下车库会亮得像室外（阳光还会穿地面）
    const under = (this.activeElev || 0) < -.001;
    this.sun.position.set(Math.cos(az)*18, Math.sin(el)*20 + 3, -Math.sin(az)*10 + 8);
    this.sun.target.position.set(0, 0, 0);
    this.sun.color.setHSL(.09, .5 + warm*.4, .92 - warm*.12);
    this.sun.intensity = this.uiStore.opt.night ? .05 : (under ? .16 : 1.4 + Math.sin(Math.PI*t)*1.6);
    this.hemi.intensity = this.uiStore.opt.night ? (under ? .26 : .12) : (under ? 1.9 : 1.1);
    this.scene.background = new THREE.Color(this.uiStore.opt.night ? 0x1c2130 : 0xf7f4ee);
    this.ground.material.color.set(this.uiStore.opt.night ? 0x2a2e38 : 0xf2eee7);
    this.lampG.children.forEach(o => {
      if (o.isPointLight) o.intensity = this.uiStore.opt.night ? 6 : 0;
      else o.material.emissiveIntensity = this.uiStore.opt.night ? 2 : .3;
    });
    this.renderer.toneMappingExposure = this.uiStore.opt.night ? 1.25 : 1.05;
    // 低画质不挂环境反射（envK=0），其余按昼夜取强度
    setEnvK((!this.quality || this.quality.env) ? (this.uiStore.opt.night ? .15 : 1) : 0);
    this.renderer.shadowMap.needsUpdate = true;      // 太阳位置变了：重算一次阴影
    this.applyHoliday();                             // 节庆灯只在夜间点亮
    this.needsRender = true;
  },

  /* ======================= 季节 / 节庆 / 交互动画 ======================= */
  /** 季节粒子：春花瓣 / 秋落叶 / 冬雪；随相机移动在 70m 范围内循环 */
  applySeason(){
    if (!this.inited || !this.seasonG) return;
    this.clearGroup(this.seasonG);
    this.seasonPts = null;
    this.seasonMeta = null;
    const kind = this.uiStore.opt.season || 'none';
    if (kind === 'none'){ this.needsRender = true; return; }
    const N = kind === 'winter' ? 900 : 620;
    const arr = new Float32Array(N*3), meta = [];
    const cam = this.camera.position, y0 = (this.activeElev || 0) - .4;
    for (let i = 0; i < N; i++){
      arr[i*3] = cam.x + (Math.random()*70 - 35);
      arr[i*3+1] = y0 + Math.random()*18;
      arr[i*3+2] = cam.z + (Math.random()*70 - 35);
      meta.push({
        vy: kind === 'winter' ? .6 + Math.random()*.8 : 1.1 + Math.random()*1.1,
        drift: .2 + Math.random()*.5,
        wind: kind === 'autumn' ? .35 : .12,
        p: Math.random()*Math.PI*2
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const color = kind === 'spring' ? 0xf3b7c8 : kind === 'autumn' ? 0xd9863a : 0xffffff;
    const pm = new THREE.PointsMaterial({
      color, size: kind === 'winter' ? .07 : .11, map: seasonTexture(),
      transparent: true, opacity: .85, depthWrite: false, sizeAttenuation: true, alphaTest: .12
    });
    const pts = new THREE.Points(geo, pm);
    pts.frustumCulled = false;
    this.seasonG.add(pts);
    this.seasonPts = pts;
    this.seasonMeta = meta;
    this.seasonKind = kind;
    this.needsRender = true;
  },

  stepSeason(dt, now){
    if (!this.seasonPts) return;
    const attr = this.seasonPts.geometry.attributes.position;
    const arr = attr.array, cam = this.camera.position;
    const y0 = (this.activeElev || 0) - .5, y1 = (this.activeElev || 0) + 18;
    for (let i = 0; i < this.seasonMeta.length; i++){
      const m = this.seasonMeta[i];
      arr[i*3] += (Math.sin(now*.001 + m.p)*m.drift + m.wind)*dt;
      arr[i*3+1] -= m.vy*dt;
      arr[i*3+2] += Math.cos(now*.0012 + m.p)*m.drift*dt;
      if (arr[i*3+1] < y0 || Math.abs(arr[i*3] - cam.x) > 36 || Math.abs(arr[i*3+2] - cam.z) > 36){
        arr[i*3] = cam.x + (Math.random()*70 - 35);
        arr[i*3+2] = cam.z + (Math.random()*70 - 35);
        arr[i*3+1] = y1 - Math.random()*3;
      }
    }
    attr.needsUpdate = true;
    this.needsRender = true;
  },

  /** 节庆串灯：夜间在树冠挂一圈发光小球（不新增点光源，避免拖垮着色） */
  applyHoliday(){
    if (!this.inited || !this.holidayG) return;
    this.clearGroup(this.holidayG);
    this.holidayG.visible = !!this.uiStore.opt.holiday && !!this.uiStore.opt.night;
    this.needsRender = true;
    if (!this.holidayG.visible) return;
    const geo = new THREE.SphereGeometry(.075, 8, 6);
    const mats = ['#ffd97a', '#ff9f6a', '#8fe3ff', '#ffe9c8']
      .map(cc => mat(cc, { emissive: cc, emissiveIntensity: 2.4, roughness: .4 }));
    // 先收集灯珠位置，再按颜色各建一个 InstancedMesh：几千颗灯也只有 4 个 draw call
    const buckets = [[], [], [], []];
    for (const f of this.plan.state.furniture){
      if (!HOLIDAY_TREES.has(f.type)) continue;
      if (f.w < 1500 || f.w > 9000) continue;          // 跳过树阵 / 行道树这类组合件
      const cx = wx(f.cx), cz = wz(f.cy), R = Math.max(.5, M(f.w)*.3), n = 10;
      for (let k = 0; k < n; k++){
        const a = k/n*Math.PI*2;
        buckets[k%4].push([cx + Math.cos(a)*R, 2.1 + .45*Math.sin(k*1.7), cz + Math.sin(a)*R]);
      }
    }
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), m4 = new THREE.Matrix4();
    buckets.forEach((list, i) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mats[i], list.length);
      list.forEach(([x, y, z], k) => {
        P.set(x, y, z);
        m4.compose(P, Q, S);
        im.setMatrixAt(k, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere?.();
      this.holidayG.add(im);
    });
  },

  /* ======================= 家具弹性入场 ======================= */
  /**
   * 2D → 3D / 重新打开「家具」时，当前楼层家具从上方落下并弹一下。
   * 每件独立计时：少量家具几乎同时开始，数量多时在 1.1s 内分批出发，
   * 单件 0.78s，总体控制在 2s 内（避免上百件家具每帧同时改矩阵）。
   */
  startFurnDrop(){
    if (!this.inited || !this.active) return;
    if (!(this.uiStore.opt.furn || this.uiStore.opt.mode === 'walk')) return;
    const items = [], seen = new Set();
    for (const g of this.furnG.children){
      const fid = g.userData.fid;
      // 注意：不按 g.visible 过滤 —— 上一次动画被打断时家具可能仍是隐藏态，重新入场要一并接管
      if (!fid || g.userData.lowerFloor || seen.has(fid)) continue;
      seen.add(fid);
      g.position.y = 0;
      items.push({ g, fid, y0: 0 });
    }
    for (const [fid, rec] of this.instMap){
      if (seen.has(fid)) continue;
      // 先把实例归位到基础矩阵，再记一份自己的副本用于逐帧改高度
      for (const e of rec.entries){
        e.mesh.setMatrixAt(e.index, rec.m);
        e.mesh.instanceMatrix.needsUpdate = true;
      }
      items.push({ g: null, fid, inst: rec, m: rec.m.clone() });
    }
    const n = items.length;
    if (!n) return;
    const spread = n > 40 ? 1.12 : Math.min(.32, n*.008);
    const dur = .78;
    items.forEach((it, i) => {
      it.delay = n > 1 ? spread*i/(n - 1) : 0;
      it.h = 1.7 + (i%5)*.16;               // 落点高度略有差异，避免所有家具同时触底
      it.done = false;
      it.shown = false;
      // 初始态：全部隐藏，等自己的批次到了才在落下起点出现
      if (it.g) it.g.visible = false;
      else for (const e of it.inst.entries){
        e.mesh.setMatrixAt(e.index, ZERO_MAT);
        e.mesh.instanceMatrix.needsUpdate = true;
      }
    });
    this.dropFx = { t0: performance.now(), dur, items };
    this.needsRender = true;
  },

  stepFurnDrop(now){
    const d = this.dropFx;
    if (!d) return;
    let alive = false;
    for (const it of d.items){
      if (it.done) continue;
      // 动画途中被选中：实例由 updateSel 临时隐藏并实体化，入场动画不再写它的矩阵
      if (it.inst && this.selInst === it.inst){ it.done = true; continue; }
      const t = Math.max(0, Math.min(1, (now - d.t0 - it.delay*1000)/(d.dur*1000)));
      if (t <= 0){ alive = true; continue; }        // 还没轮到：保持隐藏
      if (!it.shown){                               // 批次开始：在落差最高点显形
        it.shown = true;
        if (it.g) it.g.visible = true;
      }
      if (t >= 1){
        // 落地：写回精确基准位置，后续帧不再碰它
        if (it.g){ it.g.visible = true; it.g.position.y = it.y0; }
        else for (const e of it.inst.entries){
          e.mesh.setMatrixAt(e.index, it.inst.m);
          e.mesh.instanceMatrix.needsUpdate = true;
        }
        it.done = true;
        continue;
      }
      const y = (1 - easeOutBounce(t))*it.h;
      if (it.g) it.g.position.y = it.y0 + y;
      else {
        it.m.elements[13] = y;
        for (const e of it.inst.entries){
          e.mesh.setMatrixAt(e.index, it.m);
          e.mesh.instanceMatrix.needsUpdate = true;
        }
      }
      alive = true;
    }
    this.needsRender = true;
    if (!alive){
      this.dropFx = null;
      // 家具全部归位后重算一次阴影，避免动画期间沿用空中的旧阴影
      this.renderer.shadowMap.needsUpdate = true;
    }
  },

  /** 交互动画：道闸抬杆 / 大门滑开 / 喷泉水柱脉动 */
  stepFx(dt, now){
    let dirty = false;
    for (const { obj, fx } of this.fx){
      if (fx.kind === 'jet'){
        obj.scale.y = .55 + .45*Math.sin(now*.0012*fx.speed + fx.phase);
        dirty = true;                              // 水柱持续脉动
      } else if (fx.kind === 'barrier'){
        const tg = fx.target ? fx.openAngle : 0;
        if (Math.abs(obj.rotation.y - tg) > .003){
          obj.rotation.y += (tg - obj.rotation.y)*Math.min(1, dt*6);
          dirty = true;
        }
      } else if (fx.kind === 'gate'){
        const tg = fx.target ? fx.open : fx.closed;
        if (Math.abs(obj.position.x - tg) > .003){
          obj.position.x += (tg - obj.position.x)*Math.min(1, dt*5);
          dirty = true;
        }
      }
    }
    if (dirty) this.needsRender = true;
  },

  /* ======================= 相机位姿 / 动画 ======================= */
  async enter(){
    this.init();
    this.active = true;
    const SW = () => this.stage.clientWidth, SH = () => this.stage.clientHeight;
    this.renderer.setPixelRatio(this.dprFor(this.quality));
    this.renderer.setSize(SW(), SH());
    this.labelRenderer.setSize(SW(), SH());
    this.camera.aspect = SW()/SH();
    this.camera.updateProjectionMatrix();
    this.sync();                              // 仅当 3D 几何签名有变化时才重建（重复切 3D 不再全量重算）
    this.applyHoliday();                      // 节庆灯不随几何重建，进入 3D 时补一次

    this.uiStore.opt.mode = 'orbit';
    this.orbit.enabled = false;
    this.showLabels(false);

    const A = this.planPose(), B = this.isoFrom(A);
    this.grow = 0; this.furnGrow = 1;           // 家具先隐藏，3D 接管后再弹性落下
    this.applyGrow();
    // 家具整体先藏起来：避免缩放成薄片时汽车 / 家具内部面片互相闪烁
    const showFurn = !!this.uiStore.opt.furn || this.uiStore.opt.mode === 'walk';
    if (showFurn){ this.furnG.visible = false; this.instG.visible = false; }
    this.setPose(A);
    this.applySeason();                       // 季节粒子以相机为中心铺开

    this.stage.classList.add('animating');
    this._perfT = performance.now();
    this._perfN = 0;
    this.startLoop();
    this.renderer.render(this.scene, this.camera);
    this.stage.classList.add('is3d');            // 交叉淡入：此刻 3D 画面与 2D 平面完全重合
    await this.wait(420);
    if (showFurn){ this.furnG.visible = true; this.instG.visible = true; }
    this.startFurnDrop();                     // 2D → 3D：家具从上往下弹入
    await this.animate(1700, t => {
      this.camTween(A, B, this.constructor.ease(Math.max(0, Math.min(1, t/.85))));
      this.grow = this.constructor.ease(Math.max(0, Math.min(1, (t - .1)/.55)));
      this.applyGrow();
    });
    this.orbit.enabled = true;
    this.showLabels(this.uiStore.opt.labels);
    this.stage.classList.remove('animating');
    this.renderer.shadowMap.needsUpdate = true;   // 墙体归位 / 家具落地后校准阴影
  },

  async exit(){
    if (this.uiStore.opt.mode === 'walk'){
      this.walkCtl.unlock();
      this.stopTouchWalk();
      this.uiStore.opt.mode = 'orbit';
      this.walkY = this.activeElev + EYE_H;
      this.walkFeet = this.activeElev;
      this.ceilOn = true;
      this.ceils.forEach(c => { c.visible = this.uiStore.opt.cut >= this.activeLevelH; });
      this.sync(true);                    // 退出漫游：其它楼层恢复半透明 / 按「整栋」开关
    }
    this.fly = null;
    this.orbit.enabled = false;
    this.showLabels(false);
    this.stage.classList.add('animating');
    const A = this.curPose(), B = this.planPose();
    await this.animate(1300, t => {
      this.camTween(A, B, this.constructor.ease(Math.max(0, Math.min(1, (t - .1)/.9))));
      this.grow = 1 - this.constructor.ease(Math.max(0, Math.min(1, (t - .2)/.6)));
      this.applyGrow();
    });
    this.stage.classList.remove('is3d');          // 此刻 3D 已压平为正俯视，与 2D 重合后淡出
    await this.wait(450);
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stage.classList.remove('animating');
    this.grow = this.furnGrow = 1;
    this.applyGrow();
  },

  /* ======================= 选择 / 拾取 ======================= */
  startLoop(){
    if (!this.raf){
      this.clock.getDelta();
      this.raf = requestAnimationFrame(this._loop);
    }
  },

  /** 相机位姿签名：位姿未变就不必重绘（静止场景 0 GPU 负担） */
  _pose(){
    const c = this.camera;
    if (this.uiStore.opt.mode === 'orbit'){
      const o = this.orbit.target;
      return [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y,
        c.quaternion.z, c.quaternion.w, o.x, o.y, o.z].map(v => v.toFixed(3)).join(',');
    }
    // 漫游：原地转头（只有四元数变化、位置不动）也要触发重绘，否则鼠标停下时转不了视角
    return [
      c.position.x.toFixed(3), c.position.y.toFixed(3), c.position.z.toFixed(3),
      c.quaternion.x.toFixed(4), c.quaternion.y.toFixed(4),
      c.quaternion.z.toFixed(4), c.quaternion.w.toFixed(4)
    ].join(',');
  },

  _loop(){
    const self = this;
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), .05), now = performance.now();
    if (this.anim){
      const t = Math.max(0, Math.min(1, (now - this.anim.t0)/this.anim.dur));
      this.anim.fn(t);
      if (t >= 1){ const r = this.anim.res; this.anim = null; r(); }
      this.needsRender = true;
    } else if (this.fly){
      const t = Math.max(0, Math.min(1, (now - this.fly.t0)/this.fly.dur));
      this.camTween(this.fly.A, this.fly.B, this.constructor.ease(t));
      if (t >= 1) this.fly = null;
      this.needsRender = true;
    } else if (this.uiStore.opt.mode === 'orbit') this.orbit.update();
    else { this.stepWalk(dt); this.stepHeight(dt); }

    this.doors.forEach(d => {
      const pv = d.pivots || [d.pivot], A0 = d.a0s || [d.a0], A1 = d.a1s || [d.a1], CUR = d.curs || [d.cur];
      let moving = false;
      for (let k = 0; k < pv.length; k++){
        const tg = d.open ? A1[k] : A0[k];
        CUR[k] += (tg - CUR[k]) * Math.min(1, dt*6);
        if (Math.abs(CUR[k] - tg) > 1e-4) moving = true;
        pv[k].rotation.y = CUR[k];
      }
      d.cur = CUR[0];                     // 兼容字段
      if (moving) this.needsRender = true;
    });
    this.slides.forEach(s => {
      const tg = s.open ? 1 : 0;
      if (s.k === tg) return;
      s.k += (tg - s.k) * Math.min(1, dt*6);
      if (Math.abs(tg - s.k) < .002) s.k = tg;      // 收尾对齐，避免停在半路
      s.apply(s.k);
      this.needsRender = true;
    });
    // 池塘水面：贴图缓慢流动
    if (this.waterTex){
      this.waterTex.offset.x = (now % 90000)/27000;
      this.waterTex.offset.y = (now % 90000)/41000;
      this.needsRender = true;
    }
    this.stepFx(dt, now);
    this.stepFurnDrop(now);
    this.stepSeason(dt, now);
    this.updateSel();
    this.updateGizmo();
    // 仅在画面有变化时渲染（静止场景跳过 WebGL + CSS2D 两遍绘制）
    const sig = this._pose();
    if (sig !== this._poseVal || this.needsRender){
      this._poseVal = sig;
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    }
    this.tickPerf(now);
  },

  /** 性能 HUD 采样：约每 500ms 写一次 store，避免每帧触发 Vue 更新 */
  tickPerf(now){
    this._perfN = (this._perfN || 0) + 1;
    const dt = now - (this._perfT || now);
    if (dt < 500) return;
    const fps = Math.round(this._perfN*1000/dt);
    this._perfT = now;
    this._perfN = 0;
    if (!this.uiStore.opt.perfHud || !this.renderer) return;

    const info = this.renderer.info.render;
    let furn = 0;
    for (const o of this.furnG.children) if (o.userData && o.userData.fid) furn++;
    let inst = 0;
    for (const o of this.instG.children) if (o.isInstancedMesh) inst += o.count;
    const p = this.uiStore.perf;
    p.fps = fps;
    p.calls = info.calls;
    p.tris = info.triangles;
    p.furn = furn;
    p.inst = inst;
    p.walls = this.wallG ? this.wallG.children.length : 0;
    p.shadow = !!this.renderer.shadowMap.enabled;
  },

  /** 截图导出 */
  shot(){
    const a = document.createElement('a');
    a.download = tr('户型装修方案', 'floor-plan-design') + '-3D.png';
    a.href = this.renderer.domElement.toDataURL('image/png');
    a.click();
  },

  walking(){ return this.active && this.uiStore.opt.mode === 'walk'; },

  dispose(){
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    removeEventListener('keydown', this._onKey);
    removeEventListener('keyup', this._onKeyUp);
    if (this._ro) this._ro.disconnect();
    if (this.renderer){
      this.clearGroup(this.archFloor);
      this.clearGroup(this.archUp);
      if (this.wallG) this.clearGroup(this.wallG);
      this.wallCache.clear();
      this.clearGroup(this.furnG);
      if (this.instG) this.clearGroup(this.instG);
      if (this.holidayG) this.clearGroup(this.holidayG);
      if (this.seasonG) this.clearGroup(this.seasonG);
      this.instMap?.clear();
      this.fx.length = 0;
      this.clearGroup(this.roofG);
      this.clearGroup(this.siteG);
      this.labelG.children.slice().forEach(o => { o.element.remove(); });
      this.renderer.domElement.remove();
      this.labelRenderer?.domElement.remove();
      this.renderer.dispose();
    }
    this.disposeGizmo();
    this.inited = false;
    this.active = false;
  }
};
