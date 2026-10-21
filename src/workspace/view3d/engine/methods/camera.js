import * as THREE from 'three';
import { ROOMS, WALLS, WINS } from '@/core/model/plan.js';
import { FOV, wx, wz, M } from '@/workspace/view3d/coords.js';
import { ISO_DIR, FOCUS_Y } from '../constants.js';

/* View3D.prototype 的方法组：由 engine.js 统一挂载 */
export const cameraMethods = {
  planPose(){
    const cx = this.viewStore.view.x0 + this.viewStore.size.w/2/this.viewStore.view.s, cy = this.viewStore.view.y0 + this.viewStore.size.h/2/this.viewStore.view.s;
    const visH = this.viewStore.size.h/this.viewStore.view.s/1000;
    const dist = visH/2/Math.tan(FOV/2*Math.PI/180);
    const y = this.activeElev;
    const t = new THREE.Vector3(wx(cx), y, wz(cy));
    return { t, p: new THREE.Vector3(t.x, y + dist, t.z + 1e-4) };
  },

  isoFrom(P){
    const d = THREE.MathUtils.clamp(P.p.y, 5, 30);
    const dir = new THREE.Vector3(.3, .82, .49).normalize();
    return { t: P.t.clone(), p: P.t.clone().addScaledVector(dir, d) };
  },

  /** 当前户型在世界坐标里的包围盒（含墙体厚度、飘窗与阳台），按户型几何实时推导 */
  wholeBox(){
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const add = (x, y) => {
      const X = wx(x), Z = wz(y);
      if (X < x0) x0 = X;
      if (X > x1) x1 = X;
      if (Z < z0) z0 = Z;
      if (Z > z1) z1 = Z;
    };
    WALLS.forEach(w => { add(w[0], w[1]); add(w[2], w[3]); });
    WINS.forEach(r => { add(r[0], r[1]); add(r[2], r[3]); });
    ROOMS.forEach(r => r.poly.forEach(([x, y]) => add(x, y)));
    if (!isFinite(x0)) return { cx: 0, cz: 0, r: 0 };
    return {
      cx: (x0 + x1)/2, cz: (z0 + z1)/2,
      r: Math.hypot(x1 - x0, z1 - z0)/2            // 平面半对角线
    };
  },

  /** 把整个户型收进画面的机位距离：受纵向 / 横向视角中较窄的一侧约束 */
  fitDist(){
    const r = Math.max(this.wholeBox().r, .5);
    const vFov = FOV*Math.PI/180;
    const hFov = 2*Math.atan(Math.tan(vFov/2)*Math.max(this.camera.aspect, .1));
    return r / Math.tan(Math.min(vFov, hFov)/2);
  },

  /** 全部楼层的标高范围（米）：整栋取景时把地下层也框进画面 */
  elevSpan(){
    const lvls = this.plan.state.levels || [];
    let lo = this.activeElev;
    let hi = this.activeElev + (this.activeLevelH || 2.8);
    for (const l of lvls){
      const e = (l.elev || 0)/1000;
      lo = Math.min(lo, e);
      hi = Math.max(hi, e + (l.clearH || 2800)/1000);
    }
    return { lo, hi, h: Math.max(0, hi - lo), underground: lo < -.001 };
  },

  /** 鸟瞰整体：始终以当前户型的中心为目标点，按户型大小自动取景。
   *  有地下层时目标点抬到整体高度中位、机位距离同时覆盖竖向跨度，否则地下室在画面外。 */
  isoWhole(){
    const b = this.wholeBox();
    const sp = this.elevSpan();
    const y = sp.underground ? (sp.lo + sp.hi)/2 : FOCUS_Y + this.activeElev;
    const d = Math.max(this.fitDist(), sp.underground ? sp.h * 1.1 : 0);
    const t = new THREE.Vector3(b.cx, y, b.cz);
    return { t, p: t.clone().addScaledVector(ISO_DIR, d) };
  },

  /** 正俯视整体（同上，机位在户型正上方） */
  topWhole(){
    const b = this.wholeBox();
    const sp = this.elevSpan();
    const y = sp.underground ? (sp.lo + sp.hi)/2 : this.activeElev;
    const d = Math.max(this.fitDist(), sp.underground ? sp.h * 1.1 : 0);
    return { t: new THREE.Vector3(b.cx, y, b.cz), p: new THREE.Vector3(b.cx, y + d, b.cz + 1e-4) };
  },

  /** 户型切换后把镜头重新对准新户型的整体（未进入 3D 时不做任何事） */
  resetView(){
    if (!this.inited || !this.active) return;
    if (this.uiStore.opt.mode === 'walk') return this.setMode('orbit');  // 漫游中切户型 → 回到鸟瞰整体
    this.flyTo(this.isoWhole(), 800);
  },

  curPose(){ return { t: this.orbit.target.clone(), p: this.camera.position.clone() }; },

  /** 以目标点为中心做球坐标插值：镜头沿弧线倾斜环绕，而不是直线穿越 */
  camTween(A, B, e){
    const t = A.t.clone().lerp(B.t, e);
    const sa = new THREE.Spherical().setFromVector3(A.p.clone().sub(A.t));
    const sb = new THREE.Spherical().setFromVector3(B.p.clone().sub(B.t));
    let dth = sb.theta - sa.theta;
    dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    const s = new THREE.Spherical(
      sa.radius + (sb.radius - sa.radius)*e,
      sa.phi   + (sb.phi   - sa.phi)*e,
      sa.theta + dth*e
    );
    this.camera.position.copy(t).add(new THREE.Vector3().setFromSpherical(s));
    this.camera.lookAt(t);
    this.orbit.target.copy(t);
  },

  setPose(P){
    this.camera.position.copy(P.p);
    this.orbit.target.copy(P.t);
    this.camera.lookAt(P.t);
  },

  animate(dur, fn){
    return new Promise(res => {
      this.anim = { t0: performance.now(), dur, fn, res };
    });
  },

  wait(ms){ return new Promise(r => setTimeout(r, ms)); },

  flyTo(B, dur = 900){
    this.fly = { t0: performance.now(), dur, A: this.curPose(), B };
  },

  flyToRoom(id){
    const r = ROOMS.find(x => x.id === id);
    const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]);
    const t = new THREE.Vector3(
      wx((Math.min(...xs) + Math.max(...xs))/2), this.activeElev + .6,
      wz((Math.min(...ys) + Math.max(...ys))/2)
    );
    const size = M(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
    const dir = this.camera.position.clone().sub(this.orbit.target).setY(0);
    if (dir.lengthSq() < .01) dir.set(.6, 0, .8);
    dir.normalize();
    const dist = size*1.3 + 2.2;
    this.flyTo({ t, p: new THREE.Vector3(t.x + dir.x*dist*.7, dist*1.05, t.z + dir.z*dist*.7) });
  }

  /* ======================= 进入 / 退出 3D ======================= */
};
