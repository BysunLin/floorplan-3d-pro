/* ============================================================================
 *  3D 变换 gizmo：选中家具后的「旋转环 + 两根平移轴」
 *
 *  之前 3D 只有「直接拖家具」：方向自由、落点靠 snapMove 吸附，但没有轴约束。
 *  这里补三件事：
 *    · 旋转环：绕 Y 轴转，角度吸附走 core/geometry/angle.js（墙体走向优先、
 *      其次 15°，Shift 自由转）；
 *    · X / Z 轴箭头：沿轴平移，吸附复用 snapMove（网格 + 贴墙），只取沿轴分量，
 *      因此既能贴齐又不破坏约束；
 *    · 命中不再是「细环带」：旋转允许从环内外各 ~35% 半径处起手，
 *      起手后按指针的投影角计算（拖到环外也继续转），手感接近 Figma / Blender。
 *
 *  gizmo 挂在 activeRoot 下，随楼层标高一起抬；材质 depthTest:false，
 *  家具挡住也能看见、能点中。
 * ========================================================================== */
import * as THREE from 'three';
import { WALLS } from '@/core/model/plan.js';
import { M, wx, wz } from '@/workspace/view3d/coords.js';
import { snapAngle, wallAngles } from '@/core/geometry/angle.js';
import { tr } from '@/i18n.js';

const R_MIN = .38;                 // 环的最小半径（m）
const R_EXTRA = .22;               // 相对家具包围盒外扩
const GRAB_RATIO = .35;            // 旋转起手区：R 的 ±35%（替代原来的细环带）
const KNOB_PX = 16;                // 手柄球的屏幕命中半径（px）
const AXIS_GAP = .22;              // 箭头从离中心多远开始（避开家具本体）
const AXIS_EXTRA = .5;             // 箭头比环长出的部分
const AXIS_HIT = .13;              // 箭头命中半径（m）
const AXIS_HEAD = .14;             // 箭头锥长（m）

const C_RING = 0x2f6fb0;           // 旋转：蓝（与橙色选中框区分）
const C_X = 0xc0504d;              // X 轴：红
const C_Z = 0x3f8f6a;              // Z 轴：绿

const V = new THREE.Vector3();

export const gizmoMethods = {
  /** 当前可操作的对象（只看当前层、环绕模式下选中的家具） */
  gizmoTarget(){
    if (!this.inited || !this.active || this.anim) return null;
    if (this.uiStore.opt.mode !== 'orbit') return null;
    const sel = this.uiStore.ui.sel;
    if (sel?.kind !== 'furn') return null;
    const f = this.plan.getF?.(sel.id);
    const obj = f && this.furnG?.children.find(o => o.userData.fid === f.id);
    return f && obj ? { f, obj } : null;
  },

  /** 惰性创建 gizmo 的几何体（只建一次，之后只改位置 / 缩放） */
  ensureGizmo(){
    if (this.gizmoG) return;
    const flat = c => new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: .92, depthTest: false, depthWrite: false
    });

    this.gizmoG = new THREE.Group();
    this.gizmoRing = new THREE.Mesh(new THREE.TorusGeometry(1, .018, 8, 72), flat(C_RING));
    this.gizmoRing.rotation.x = -Math.PI / 2;
    this.gizmoKnob = new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 12), flat(C_RING));
    this.gizmoRing.renderOrder = 998;
    this.gizmoKnob.renderOrder = 999;

    const arrow = (color, axis) => {
      const m = flat(color);
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, 1, 8), m);
      const head = new THREE.Mesh(new THREE.ConeGeometry(.042, AXIS_HEAD, 12), m);
      shaft.rotation.z = -Math.PI / 2;      // 圆柱默认沿 +Y → 转到 +X
      head.rotation.z = -Math.PI / 2;
      shaft.renderOrder = 994; head.renderOrder = 995;
      g.add(shaft, head);
      if (axis === 'z') g.rotation.y = -Math.PI / 2;   // +X → +Z
      g.userData = { shaft, head, axis };
      return g;
    };
    this.gizmoX = arrow(C_X, 'x');
    this.gizmoZ = arrow(C_Z, 'z');
    this.gizmoG.add(this.gizmoRing, this.gizmoKnob, this.gizmoX, this.gizmoZ);
    this.activeRoot.add(this.gizmoG);
  },

  /** 每帧调用：跟随选中对象重建 / 摆位 */
  updateGizmo(){
    if (!this.inited) return;
    const t = this.gizmoTarget();
    if (!t){
      if (this.gizmoG && this.gizmoG.visible){ this.gizmoG.visible = false; this.needsRender = true; }
      return;
    }
    this.ensureGizmo();
    const { f } = t;
    const R = Math.max(R_MIN, Math.max(M(f.w || 0), M(f.d || 0)) / 2 + R_EXTRA);
    const key = `${f.id}:${R.toFixed(2)}`;

    if (key !== this.gizmoKey){
      this.gizmoKey = key;
      this.gizmoR = R;
      this.gizmoRing.scale.setScalar(R);

      // 箭头：从 AXIS_GAP 画到 R + AXIS_EXTRA
      const L = R + AXIS_EXTRA;
      const shaftLen = Math.max(.05, L - AXIS_HEAD - AXIS_GAP);
      for (const g of [this.gizmoX, this.gizmoZ]){
        const { shaft, head } = g.userData;
        shaft.scale.y = shaftLen;
        shaft.position.x = AXIS_GAP + shaftLen / 2;
        head.position.x = L - AXIS_HEAD / 2;
      }
      this.axisLen = L;
      this.needsRender = true;
    }
    this.gizmoG.visible = true;
    this.gizmoG.position.set(wx(f.cx), .035, wz(f.cy));

    // 手柄落在「家具正面」方向上：局部 +x 转过 rot 之后的方向
    const a = (f.rot || 0) * Math.PI / 180;
    this.gizmoKnob.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
    this.gizmoKnob.scale.setScalar(this.grot ? 1.35 : 1);
  },

  /** 指针 → gizmo 所在平面上的世界坐标 */
  gizmoPlanePoint(e){
    if (!this.gizmoG) return null;
    const r = this.cv.getBoundingClientRect();
    this.ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
    const c = this.gizmoG.getWorldPosition(V.clone());
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -c.y);
    const hit = new THREE.Vector3();
    return this.ray.ray.intersectPlane(plane, hit) ? hit : null;
  },

  /**
   * 命中测试：手柄球（屏幕距离）→ 环带（R ± 35%）→ X / Z 轴线段。
   * @returns {{kind:'ring'|'x'|'z'}|null}
   */
  gizmoHitTest(e){
    if (!this.gizmoG?.visible) return null;
    const c = this.gizmoG.getWorldPosition(V.clone());

    // 手柄球：小目标，按屏幕像素判定更跟手
    if (this.gizmoKnob){
      const kp = this.gizmoKnob.getWorldPosition(V.clone()).project(this.camera);
      const r = this.cv.getBoundingClientRect();
      const sx = (kp.x + 1) / 2 * r.width + r.left;
      const sy = (-kp.y + 1) / 2 * r.height + r.top;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) <= KNOB_PX) return { kind: 'ring' };
    }

    const hit = this.gizmoPlanePoint(e);
    if (!hit) return null;

    // 旋转环：环内外各让 35% 半径都能起手（细环很难点中）
    const d = Math.hypot(hit.x - c.x, hit.z - c.z);
    const band = this.gizmoR * GRAB_RATIO;
    if (Math.abs(d - this.gizmoR) <= band) return { kind: 'ring' };

    // 平移轴：到线段的距离
    const L = this.axisLen || (this.gizmoR + AXIS_EXTRA);
    for (const axis of ['x', 'z']){
      const ux = axis === 'x' ? 1 : 0, uz = axis === 'x' ? 0 : 1;
      const px = hit.x - c.x, pz = hit.z - c.z;
      const t = px * ux + pz * uz;                       // 沿轴投影
      if (t < AXIS_GAP - .05 || t > L + .12) continue;
      const dist = Math.hypot(px - ux * t, pz - uz * t);
      if (dist <= AXIS_HIT) return { kind: axis };
    }
    return null;
  },

  /** 按下：命中环则旋转，命中轴则沿轴平移 */
  gizmoDown(e){
    const t = this.gizmoTarget();
    if (!t) return false;
    const h = this.gizmoHitTest(e);
    if (!h) return false;

    const c = this.gizmoG.getWorldPosition(V.clone());
    const hit = this.gizmoPlanePoint(e);
    const cx0 = t.f.cx, cy0 = t.f.cy;

    if (h.kind === 'ring'){
      const ang = Math.atan2(hit.z - c.z, hit.x - c.x);
      this.grot = {
        id: t.f.id, pid: e.pointerId, ang0: ang, rot0: t.f.rot || 0,
        before: this.plan.snap(), moved: false
      };
    } else {
      const ux = h.kind === 'x' ? 1 : 0, uz = h.kind === 'x' ? 0 : 1;
      const t0 = (hit.x - c.x) * ux + (hit.z - c.z) * uz;
      this.adrag = {
        id: t.f.id, pid: e.pointerId, axis: h.kind, ux, uz, t0, cx0, cy0,
        s: this.groundAt(e.clientX, e.clientY)?.s || .05,
        before: this.plan.snap(), moved: false
      };
    }

    this._gizmoClick = true;               // 抑制 pointerup 的「点空白取消选中」
    this.orbit.enabled = false;
    this.fly = null;
    this.cv.setPointerCapture(e.pointerId);
    this.cv.style.cursor = 'grabbing';
    this.needsRender = true;
    return true;
  },

  /** 拖动中：旋转按投影角，平移按沿轴位移 */
  gizmoMove(e){
    if (this.grot) return this.gizmoRotate(e);
    if (this.adrag) return this.gizmoSlide(e);
  },

  gizmoRotate(e){
    const g = this.grot;
    if (!g || e.pointerId !== g.pid) return;
    const hit = this.gizmoPlanePoint(e);
    if (!hit) return;
    const f = this.plan.getF(g.id);
    if (!f || !this.gizmoG) return;

    const c = this.gizmoG.getWorldPosition(V.clone());
    const ang = Math.atan2(hit.z - c.z, hit.x - c.x);
    const deg = g.rot0 + (ang - g.ang0) * 180 / Math.PI;

    f.rot = snapAngle(deg, wallAngles(WALLS), { step: 15, tol: 6, free: e.shiftKey });
    const o = this.furnG.children.find(x => x.userData.fid === f.id);
    if (o) o.rotation.y = -(f.rot || 0) * Math.PI / 180;
    if (this.viewStore?.cursor) this.viewStore.cursor.hover = `${f.rot}°`;
    g.moved = true;
    this.needsRender = true;
  },

  gizmoSlide(e){
    const g = this.adrag;
    if (!g || e.pointerId !== g.pid) return;
    const hit = this.gizmoPlanePoint(e);
    if (!hit || !this.gizmoG) return;
    const f = this.plan.getF(g.id);
    if (!f) return;

    const c = this.gizmoG.getWorldPosition(V.clone());
    const t = (hit.x - c.x) * g.ux + (hit.z - c.z) * g.uz;
    const dMm = (t - g.t0) * 1000;                       // 世界 m → 户型 mm
    let nx = g.cx0 + dMm * g.ux;
    let ny = g.cy0 + dMm * g.uz;

    // 复用 snapMove 的网格 / 贴墙吸附，再把结果投影回轴方向，约束不被破坏
    const [sx, sy] = this.plan.snapMove(f, nx, ny, g.s);
    const along = (sx - g.cx0) * g.ux + (sy - g.cy0) * g.uz;
    f.cx = Math.round(g.cx0 + along * g.ux);
    f.cy = Math.round(g.cy0 + along * g.uz);

    const o = this.furnG.children.find(x => x.userData.fid === f.id);
    if (o) o.position.set(wx(f.cx), 0, wz(f.cy));
    if (this.viewStore?.cursor)
      this.viewStore.cursor.hover = `${g.axis.toUpperCase()} ${Math.round(Math.abs(along))} mm`;
    g.moved = true;
    this.needsRender = true;
  },

  /** 松手：有变化才写撤销栈；落点非法则还原 */
  gizmoUp(e){
    const g = this.grot || this.adrag;
    if (!g || (e && e.pointerId !== g.pid)) return;
    const isSlide = !this.grot;
    this.grot = null;
    this.adrag = null;
    this.orbit.enabled = true;
    if (this.cv) this.cv.style.cursor = '';
    if (this.viewStore?.cursor) this.viewStore.cursor.hover = '';
    if (!g.moved) return;

    if (isSlide){
      const f = this.plan.getF(g.id);
      const chk = f ? this.plan.placementAt(f, f.cx, f.cy) : { ok: true };
      if (!chk.ok){
        if (f){
          f.cx = g.cx0; f.cy = g.cy0;
          const o = this.furnG.children.find(x => x.userData.fid === f.id);
          if (o) o.position.set(wx(f.cx), 0, wz(f.cy));
        }
        this.uiStore.showToast(chk.reason === 'door'
          ? tr('位置挡住了门扇开启范围，已还原', 'Blocks the door swing — reverted')
          : tr('当前位置与墙体 / 门窗重叠，已还原', 'Overlaps a wall or opening — reverted'));
        this.needsRender = true;
        return;
      }
    }
    this.plan.commit(g.before);
    this.needsRender = true;
  },

  /** 悬停在手柄 / 环 / 轴上时给个抓手光标 */
  gizmoHover(e){
    if (this.fdrag || this.grot || this.adrag) return;
    if (!this.gizmoG?.visible){ if (this.cv && this.cv.style.cursor === 'grab') this.cv.style.cursor = ''; return; }
    const h = this.gizmoHitTest(e);
    if (this.cv) this.cv.style.cursor = h ? 'grab' : '';
  },

  /** 退出 3D / 取消时清理 */
  disposeGizmo(){
    this.grot = null;
    this.adrag = null;
    this._gizmoClick = false;
    if (this.gizmoG){
      this.gizmoG.removeFromParent();
      this.gizmoG.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      this.gizmoG = null;
      this.gizmoRing = null;
      this.gizmoKnob = null;
      this.gizmoX = null;
      this.gizmoZ = null;
      this.gizmoKey = '';
    }
  }
};
