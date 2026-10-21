import * as THREE from 'three';
import { DOORS } from '@/core/model/plan.js';
import { pointInShape } from '@/core/geometry/region.js';
import { mat } from '@/workspace/view3d/build/index.js';
import { OX, OY, wx, wz } from '@/workspace/view3d/coords.js';
import { FOCUS_Y, EYE_H, CLIMB } from '../constants.js';

/* View3D.prototype 的方法组：由 engine.js 统一挂载 */
export const walkMethods = {
  pick(e){
    if (!e) this.ptr.set(0, 0);
    else {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ptr.set((e.clientX - r.left)/r.width*2 - 1, -(e.clientY - r.top)/r.height*2 + 1);
    }
    this.ray.setFromCamera(this.ptr, this.camera);
    const hits = this.ray.intersectObjects([...(this.uiStore.opt.furn ? [this.furnG] : []), this.archUp, this.archFloor], true);
    for (const h of hits){
      let o = h.object;
      if (o.material === this.glassMat) continue;
      if (o.userData.room) return { room: o.userData.room };
      // 门扇 / 家具都是「组」，需要沿父级向上找归属
      while (o && !o.userData.door && !o.userData.fid && !o.userData.lowerFloor && o !== this.scene) o = o.parent;
      if (o?.userData.lowerFloor) continue;                // 下层楼梯：只作参照，不挡拾取
      if (o?.userData.door) return { door: o.userData.door, dist: h.distance };
      if (o?.userData.fid) return { fid: o.userData.fid };
      return null;                                        // 被墙体挡住
    }
    return null;
  },

  /** 屏幕点 → 地面（y=0）上的户型坐标 mm；s = 该处每 mm 对应的屏幕像素 */
  groundAt(x, y){
    if (!this.active || this.anim) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const hit = new THREE.Vector3();
    this.ptr.set((x - r.left)/r.width*2 - 1, -(y - r.top)/r.height*2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
    if (!this.ray.ray.intersectPlane(this.ground0, hit) || hit.distanceTo(this.camera.position) > 60) return null;

    // 视线先碰到墙体（或飘窗台）时，落点取碰到的位置，而不是穿过墙落到看不见的墙后
    const wall = this.ray.intersectObjects([this.archUp, this.archFloor], true)
      .find(h => h.object.material !== this.glassMat && h.object.visible);
    if (wall && wall.distance < hit.distanceTo(this.camera.position) - .01) hit.set(wall.point.x, 0, wall.point.z);

    const px = v => new THREE.Vector2(v.x*r.width/2, v.y*r.height/2);
    const a = px(hit.clone().project(this.camera));
    const s = Math.max(
      a.distanceTo(px(hit.clone().add(new THREE.Vector3(1, 0, 0)).project(this.camera))),
      a.distanceTo(px(hit.clone().add(new THREE.Vector3(0, 0, 1)).project(this.camera)))
    ) / 1000;
    return { x: hit.x*1000 + OX, y: hit.z*1000 + OY, s };
  },

  updateSel(){
    const key = this.uiStore.ui.sel?.kind === 'furn' ? this.uiStore.ui.sel.id : '';
    if (key !== this.selKey){
      this.selKey = key;
      if (this.selHelper){
        this.scene.remove(this.selHelper);
        this.selHelper.geometry.dispose();
        this.selHelper = null;
      }
      const g = key && this.furnG.children.find(o => o.userData.fid === key);
      if (g){ this.selHelper = new THREE.BoxHelper(g, 0xb5653a); this.scene.add(this.selHelper); }
      this.selDirty = true;
    }
    // 仅在选框对象移动（拖拽 / 重建后换位）或刚选中时才重算包围盒（BoxHelper.update 每帧开销不小）
    if (this.selHelper){
      const g = this.selHelper.object, p = g.position, q = g.quaternion;
      const sig = `${p.x},${p.y},${p.z},${q.x},${q.y},${q.z},${q.w}`;
      if (sig !== this._selObjSig) this.selDirty = true;
      this._selObjSig = sig;
      if (this.selDirty){ this.selHelper.update(); this.selDirty = false; this.needsRender = true; }
    }
  },

  /* ======================= 漫游 ======================= */
  lookBy(dx, dy){
    this._eul.setFromQuaternion(this.camera.quaternion);
    this._eul.y += dx*.005;
    this._eul.x = THREE.MathUtils.clamp(this._eul.x + dy*.005, -1.35, 1.35);
    this.camera.quaternion.setFromEuler(this._eul);
    this.needsRender = true;
  },

  startTouchWalk(){
    this.walk.touch = true;
  },

  stopTouchWalk(){
    this.walk.touch = false;
    this.joy.x = this.joy.y = 0;
    this.joy.id = null;
    const knob = document.querySelector('#joy i');
    if (knob) knob.style.transform = '';
  },

  setMode(m){
    if (this.anim) return;
    this.uiStore.opt.mode = m;
    if (m === 'walk'){
      this.uiStore.select(null);
      if (this.uiStore.opt.cut < this.activeLevelH) this.uiStore.opt.cut = this.activeLevelH;
      this.orbit.enabled = false;
      this.fly = null;
      // 从最底层入户门外开始，站在一层的实际楼面上
      const p = this.walkStartPose();
      this.walkFeet = p.elev;
      this.walkY = p.elev + EYE_H;
      this.walkH = p.elev - this.activeElev;
      this.ceilOn = true;
      this.camera.position.set(wx(p.x), this.walkY, wz(p.y));
      this.camera.lookAt(wx(p.tx), p.elev + 1.55, wz(p.ty));
      this.sync(true);                       // 漫游：所有楼层实色渲染 + 重建碰撞体
    } else {
      this.walkCtl.unlock();
      this.stopTouchWalk();
      this.orbit.enabled = true;
      // 离开漫游：天花恢复显示（上过楼梯时曾被临时隐藏）
      this.ceilOn = true;
      this.ceils.forEach(c => { c.visible = this.uiStore.opt.cut >= this.activeLevelH; });
      const b = this.wholeBox();
      this.orbit.target.set(b.cx, FOCUS_Y + this.activeElev, b.cz);
      this.flyTo(this.isoWhole());
      this.sync(true);                       // 退出漫游：其它楼层恢复半透明 / 按「整栋」开关
    }
    this.showLabels(this.uiStore.opt.labels && m === 'orbit');
    this.archUp.traverse(o => { if (o.userData.walkOnly) o.visible = m === 'walk'; });
    this.needsRender = true;
  },

  /** 漫游起点：最底层「入户门」外侧，朝屋内看 */
  walkStartPose(){
    // 现取一次快照：避免刚换户型 / 切层时用到旧的 walkSnaps
    const snaps = this.plan.levelSnapshots?.() || this.walkSnaps || [];
    const sorted = snaps.slice().sort((a, b) => (a.level.elev || 0) - (b.level.elev || 0));
    // 起点取「最低的、带入户门的楼层」：有地下层时地下层没有入户门，仍从首层门口进
    const ground = sorted.find(s => (s.doors || []).some(d => d.entry)) || sorted[0];
    const elev = ((ground?.level.elev || 0)) / 1000;
    const rooms = ground?.rooms || [];
    const onFloor = (x, y) => rooms.some(r => r.poly && r.poly.length >= 3 && pointInShape(x, y, r));
    const door = (ground?.doors || DOORS).find(d => d.entry);
    let pose = { x: 4200, y: 8400, tx: 4200, ty: 6800, elev };   // 兜底：入户走廊外
    if (door){
      const [x0, y0, x1, y1] = door.rect;
      const cx = (x0 + x1)/2, cy = (y0 + y1)/2;
      const [ox, oy] = door.o || [0, -1];           // 开门方向 = 朝屋内
      pose = {
        x: cx - ox*900, y: cy - oy*900,             // 站在门外（沿开门方向退 0.9 m）
        tx: cx + ox*1200, ty: cy + oy*1200,         // 视线朝向室内
        elev
      };
    }
    // 起点必须落在有楼板的区域（没有入户走廊 / 自定义户型）：退到第一个房间中心
    if (!onFloor(pose.x, pose.y)){
      const at = rooms.find(r => !r.outdoor && r.at)?.at;
      if (at) pose = { x: at[0], y: at[1], tx: at[0], ty: at[1] - 1200, elev };
    }
    return pose;
  },

  blocked(x, z, r = .22){
    const feet = this.walkFeet ?? 0;
    const xmm = x*1000 + OX, ymm = z*1000 + OY;
    // 目标点踩上去之后的站立面：上楼跨步的那一步要按「跨上去之后的标高」判断，
    // 否则一层墙顶（= 二层楼面）正好卡在脚下，会被误判成障碍，出现「二层走不动」。
    const sup = this.walkSupport(xmm, ymm, feet);
    const stand = sup != null ? sup : feet;
    // 只有「脚下这一层及以上」的构件才挡人：
    //   · 顶面不高于站立面（含 6cm 容差）→ 下层墙体 / 门窗 / 推拉门，忽略；
    //   · 底面高过头顶 → 头顶构件，忽略。
    const head = stand + 1.9;
    const inSpan = (y0 = -99, y1 = 99) => y1 > stand + .06 && y0 < head;
    for (const c of this.colliders){
      const [x0, z0, x1, z1, y0 = -99, y1 = 99] = c;
      if (!inSpan(y0, y1)) continue;
      if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
    }
    for (const d of this.doors){
      if (!inSpan(d.y0, d.y1)) continue;            // 门扇只在自己所属楼层挡人
      const len = d.len || .9;
      for (const p of d.pivots || [d.pivot]){       // 双开门两扇都要挡人
        const a = p.rotation.y;
        const px = p.position.x, pz = p.position.z;
        const ex = px + Math.cos(a)*len, ez = pz - Math.sin(a)*len;
        const t = Math.max(0, Math.min(1, ((x - px)*(ex - px) + (z - pz)*(ez - pz)) / ((ex - px)**2 + (ez - pz)**2)));
        if (Math.hypot(x - (px + t*(ex - px)), z - (pz + t*(ez - pz))) < r*.8) return true;
      }
    }
    for (const s of this.slides){                       // 推拉门关着时挡住洞口
      if (s.k > .5) continue;
      if (!inSpan(s.y0, s.y1)) continue;
      const [x0, z0, x1, z1] = s.rect;
      if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
    }
    // 落差保护：不让走下楼板边缘（夹层没有栏杆处也不会掉下去）
    if (sup != null){
      if (sup < feet - .55) return true;
    } else if (!this.floorNear(xmm, ymm, 300, feet)){
      // 没有铺地板的区域不允许进入；门口 / 门槛这类窄缝附近有楼板，仍可正常通行
      return true;
    }
    return false;
  },

  /** 目标点附近（四个方向 r mm）是否有可站立面：用于区分「门槛窄缝」与「真的没铺地板」 */
  floorNear(x, y, r, feet){
    return this.walkSupport(x + r, y, feet) != null
      || this.walkSupport(x - r, y, feet) != null
      || this.walkSupport(x, y + r, feet) != null
      || this.walkSupport(x, y - r, feet) != null;
  },

  stepWalk(dt){
    if (!this.walkCtl.isLocked && !this.walk.touch) return;
    const sp = (this.keys.ShiftLeft || this.keys.ShiftRight ? 2.6 : 1.4) * dt;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
    if (this.keys.KeyW || this.keys.ArrowUp)    mv.add(fwd);
    if (this.keys.KeyS || this.keys.ArrowDown) mv.sub(fwd);
    if (this.keys.KeyD || this.keys.ArrowRight) mv.add(right);
    if (this.keys.KeyA || this.keys.ArrowLeft)  mv.sub(right);
    if (this.walk.touch) mv.addScaledVector(fwd, -this.joy.y).addScaledVector(right, this.joy.x);
    const mag = Math.min(1, mv.length());          // 摇杆推得越远走得越快
    if (mag < .05) return;
    mv.normalize().multiplyScalar(sp*mag);
    const p = this.camera.position;
    if (!this.blocked(p.x + mv.x, p.z)) p.x += mv.x;
    if (!this.blocked(p.x, p.z + mv.z)) p.z += mv.z;
  },

  /**
   * 平面坐标（mm）处可站立的最高面（绝对标高 m）：各层楼板 + 楼梯 / 旋转步梯 / 扶梯踏步。
   * feet = 当前脚下高度，只接受「抬脚能上去」的候选，避免误踩到头顶的楼板。
   */
  walkSupport(x, y, feet = 0){
    const snaps = this.walkSnaps || [];
    let best = null;
    const take = h => {
      if (h <= feet + .55 && (best == null || h > best)) best = h;
    };
    for (const s of snaps){
      const elev = (s.level.elev || 0) / 1000;
      for (const r of s.rooms || []){
        if (!r.poly || r.poly.length < 3) continue;
        if (s.roomsMeta?.[r.id]?.mat === 'void') continue;
        if (r.counted === false && !r.outdoor) continue;    // 飘窗台不当作可行走楼板
        if (pointInShape(x, y, r)){ take(elev); break; }
      }
      for (const f of s.furniture || []){
        const fn = CLIMB[f.type];
        if (!fn) continue;
        const sd = f.sdir < 0 ? -1 : 1;
        const rise = this.stairRiseAt(f, s.level.elev || 0);
        const a = f.rot*Math.PI/180, c = Math.cos(a), si = Math.sin(a);
        const dx = x - f.cx, dy = y - f.cy;
        const lx = dx*c + dy*si, ly = -dx*si + dy*c;
        const hw = f.w/2, hd = f.d/2;
        if (Math.abs(lx) > hw || Math.abs(ly) > hd) continue;
        take(elev + fn(lx, ly, hw, hd, sd, rise));
      }
    }
    return best;
  },

  /** 漫游视高：站在踏步 / 任意楼层楼板上时平滑抬升 / 下降（上楼、下楼都有过渡） */
  stepHeight(dt){
    const p = this.camera.position;
    const sup = this.walkSupport(p.x*1000 + OX, p.z*1000 + OY, this.walkFeet ?? 0);
    if (sup != null) this.walkFeet = sup;
    this.walkH = this.walkFeet - this.activeElev;   // 相对当前编辑层的标高（仅作参考）
    this.walkY += (EYE_H + this.walkFeet - this.walkY) * Math.min(1, dt*8);
    p.y = this.walkY;
    // 上到楼层高度时天花会挡在眼前：临时隐藏天花面片
    const on = this.walkY < this.activeElev + this.activeLevelH - .05;
    if (on !== this.ceilOn){
      this.ceilOn = on;
      this.ceils.forEach(c => { c.visible = on && this.uiStore.opt.cut >= this.activeLevelH; });
    }
  },

  _onKey(e){
    if (e.target.matches('input,select,textarea')) return;
    this.keys[e.code] = true;
    if (this.uiStore.opt.mode === 'walk' && e.code === 'KeyE'){
      const h = this.pick();
      if (h?.door && h.dist < 2.5) this.toggleDoor(h.door);
    }
  },
  _onKeyUp(e){ this.keys[e.code] = false; }

  /* ======================= 主循环 ======================= */
};
