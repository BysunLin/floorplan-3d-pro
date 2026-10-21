import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WALLS, WINS, DOORS, SLIDES, LINTELS, COARSE, TAP } from '@/core/model/plan.js';
import { tr } from '@/i18n.js';
import { mat, setEnv, setEnvK, setGlassMat, setFrameMat, buildFurniture } from '@/workspace/view3d/build/index.js';
import { H, FOV, wx, wz } from '@/workspace/view3d/coords.js';
import { EYE_H, CLIMB_TYPES } from '../constants.js';

/* View3D.prototype 的方法组：由 engine.js 统一挂载 */
export const lifecycleMethods = {
  init(){
    if (this.inited) return;
    this.inited = true;

    const SW = () => this.stage.clientWidth, SH = () => this.stage.clientHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    // 高 DPI 屏下按 1.75 倍封顶：像素量比 2 倍少 ~23%，肉眼几乎无差别
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(SW(), SH());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(COARSE ? 1024 : 2048);
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

    const pm = new THREE.PMREMGenerator(this.renderer);
    setEnv(pm.fromScene(new RoomEnvironment(), .04).texture);
    pm.dispose();

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
    this.furnG     = new THREE.Group();
    this.labelG    = new THREE.Group();
    this.lampG     = new THREE.Group();
    this.roofG     = new THREE.Group();          // 房顶（挂在世界坐标上：属于顶层，不属于当前层）
    this.siteG     = new THREE.Group();          // 场地：地下层基坑土壁 + 周边地坪
    this.activeRoot.add(this.archFloor, this.archUp, this.furnG, this.labelG, this.lampG);
    this.scene.add(this.activeRoot, this.ghostRoot, this.roofG, this.siteG);
    this.activeElev = 0;                    // 当前楼层标高（米）
    this.activeLevelH = H;                  // 当前楼层净高（米）
    // 其它楼层用半透明材质，既能看出叠层体量，又不完全遮挡当前编辑层
    this.ghostMat = mat('#e6e0d6', { roughness: .95, transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide });
    // 「半透明」模式：外墙用更通透的材质，内部布局一目了然
    this.wallAlphaMat = mat('#eae3d7', { roughness: .9, transparent: true, opacity: .22, depthWrite: false });
    this.selKey = null;
    this.selHelper = null;

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
      const h = this.pick(e), f = h?.fid === this.uiStore.ui.sel.id && this.plan.getF(h.fid), g = f && this.groundAt(e.clientX, e.clientY);
      if (!g) return;
      this.fdrag = { id: f.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: g.x - f.cx, oy: g.y - f.cy, before: this.plan.snap(), moved: false };
      this.orbit.enabled = false;
      this.fly = null;
      cv.setPointerCapture(e.pointerId);
    }, true);

    cv.addEventListener('pointermove', e => {
      if (!this.fdrag || e.pointerId !== this.fdrag.pid) return;
      if (!this.fdrag.moved && Math.hypot(e.clientX - this.fdrag.sx, e.clientY - this.fdrag.sy) < TAP) return;
      const f = this.plan.getF(this.fdrag.id), g = this.groundAt(e.clientX, e.clientY);
      if (!f || !g) return;
      this.fdrag.moved = true;
      cv.style.cursor = 'grabbing';
      [f.cx, f.cy] = this.plan.snapMove(f, g.x - this.fdrag.ox, g.y - this.fdrag.oy, g.s);
      this.furnG.children.find(o => o.userData.fid === f.id)?.position.set(wx(f.cx), 0, wz(f.cy));
    });

    const endF = e => {
      if (!this.fdrag || e.pointerId !== this.fdrag.pid) return;
      const d = this.fdrag;
      this.fdrag = null;
      this.orbit.enabled = true;
      cv.style.cursor = '';
      if (d.moved){ this.plan.commit(d.before); }
    };
    cv.addEventListener('pointerup', endF);
    cv.addEventListener('pointercancel', endF);

    cv.addEventListener('pointerup', e => {
      const tap = this.downAt && Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) <= TAP;
      if (this.look?.id === e.pointerId){
        this.look = null;
        if (tap){ const h = this.pick(e); if (h?.door && h.dist < 3.5) this.toggleDoor(h.door); }
        return;
      }
      if (this.anim || this.uiStore.opt.mode !== 'orbit' || !tap) return;
      const h = this.pick(e);
      if (h?.door) this.toggleDoor(h.door);
      else if (h?.fid) this.uiStore.select({ kind: 'furn', id: h.fid });
      else if (h?.room) this.uiStore.select({ kind: 'room', id: h.room });
      else this.uiStore.select(null);
    });

    this._ro = new ResizeObserver(() => {
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
    this.archUp.scale.y = Math.max(this.grow, .001);
    this.furnG.scale.y  = Math.max(this.furnGrow, .001);
    this.lampG.visible  = this.grow > .99;
    if (this.roofG) this.roofG.visible = this.grow > .99;    // 房顶随生长动画一起出现 / 收起
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
    setEnvK(this.uiStore.opt.night ? .15 : 1);
    this.renderer.shadowMap.needsUpdate = true;      // 太阳位置变了：重算一次阴影
    this.needsRender = true;
  },

  /* ======================= 相机位姿 / 动画 ======================= */
  async enter(){
    this.init();
    this.active = true;
    const SW = () => this.stage.clientWidth, SH = () => this.stage.clientHeight;
    this.renderer.setSize(SW(), SH());
    this.labelRenderer.setSize(SW(), SH());
    this.camera.aspect = SW()/SH();
    this.camera.updateProjectionMatrix();
    this.sync();                              // 仅当 3D 几何签名有变化时才重建（重复切 3D 不再全量重算）

    this.uiStore.opt.mode = 'orbit';
    this.orbit.enabled = false;
    this.showLabels(false);

    const A = this.planPose(), B = this.isoFrom(A);
    this.grow = 0; this.furnGrow = 0;
    this.applyGrow();
    this.setPose(A);

    this.stage.classList.add('animating');
    this.startLoop();
    this.renderer.render(this.scene, this.camera);
    this.stage.classList.add('is3d');            // 交叉淡入：此刻 3D 画面与 2D 平面完全重合
    await this.wait(420);
    await this.animate(1700, t => {
      this.camTween(A, B, this.constructor.ease(Math.max(0, Math.min(1, t/.85))));
      this.grow     = this.constructor.ease(Math.max(0, Math.min(1, (t - .1)/.55)));
      this.furnGrow = this.constructor.ease(Math.max(0, Math.min(1, (t - .45)/.5)));
      this.applyGrow();
    });
    this.orbit.enabled = true;
    this.showLabels(this.uiStore.opt.labels);
    this.stage.classList.remove('animating');
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
      this.furnGrow = 1 - this.constructor.ease(Math.max(0, Math.min(1, t/.45)));
      this.grow     = 1 - this.constructor.ease(Math.max(0, Math.min(1, (t - .2)/.6)));
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
    this.updateSel();
    // 仅在画面有变化时渲染（静止场景跳过 WebGL + CSS2D 两遍绘制）
    const sig = this._pose();
    if (sig !== this._poseVal || this.needsRender){
      this._poseVal = sig;
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    }
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
      this.clearGroup(this.furnG);
      this.clearGroup(this.ghostRoot);
      this.clearGroup(this.roofG);
      this.clearGroup(this.siteG);
      this.labelG.children.slice().forEach(o => { o.element.remove(); });
      this.renderer.domElement.remove();
      this.labelRenderer?.domElement.remove();
      this.renderer.dispose();
    }
    this.inited = false;
    this.active = false;
  }
};
