import * as THREE from 'three';
import { usePlanStore, useUiStore, useViewStore } from '@/stores/index.js';
import { EYE_H } from './constants.js';

import { buildMethods } from './methods/build.js';
import { cameraMethods } from './methods/camera.js';
import { walkMethods } from './methods/walk.js';
import { lifecycleMethods } from './methods/lifecycle.js';

export class View3D {
  constructor(host, stage){
    this.host  = host;
    this.stage = stage;
    this.inited = false;
    this.active = false;
    this.raf = 0;
    this.anim = null;
    this.fly = null;
    this.grow = 1;
    this.furnGrow = 1;
    this.walkY = EYE_H;                            // 漫游时的实际视高（随楼梯上下）
    this.walkH = 0;                                // 脚下的楼梯标高（下行时为负）
    this.walkFeet = 0;                             // 脚下支撑面绝对标高（m，跨楼层用）
    this.walkSnaps = [];                           // 各楼层解析快照（漫游找楼板 / 楼梯用）
    this.ceilOn = true;
    this.ceils = [];                               // 天花面片：上到楼层高度时临时隐藏
    this.sigArch = '';
    this.sigFurn = '';
    this.sigLabels = '';
    this.needsRender = true;                     // 需要重绘一帧（几何 / 光照 / 选择 / 动画变化后）
    this._poseVal = '';                         // 上一帧相机位姿签名（用于按需渲染）
    this.selDirty = true;                        // 选框需要重算
    this._selObjSig = '';                        // 选中对象的位姿签名
    this.colliders = [];
    this.doors = [];                               // 平开门（门扇开合 + 漫游碰撞）
    this.slides = [];                              // 推拉门扇（沿轨道滑动）
    this.doorState = {};                           // 门的开合记忆（重建几何后仍保持）
    this.plan = usePlanStore();
    this.uiStore = useUiStore();
    this.viewStore = useViewStore();
    this.keys = this.uiStore.keys;                 // 全局按键表（响应式）
    this.joy = this.uiStore.joy;
    this.walk = this.uiStore.walk;
    this.clock = new THREE.Clock();
    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2();
    this.ground0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._onKey = this._onKey.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._loop = this._loop.bind(this);
  }

  /* ======================= 初始化 ======================= */

  static ease(t){ return t < .5 ? 4*t*t*t : 1 - (-2*t + 2)**3/2; }
}

/* 方法按职责分组定义在 methods/ 下，这里一次性挂到原型上 */
Object.assign(View3D.prototype, buildMethods, cameraMethods, walkMethods, lifecycleMethods);
