<template>
  <div class="mp" ref="hostEl">
    <canvas ref="canvasEl"></canvas>
    <div v-if="dims && measured" class="mp-dims">
      {{ measured.w }} × {{ measured.d }} × {{ measured.h }} mm
    </div>
    <div class="mp-hint">{{ tr('拖动旋转 · 滚轮缩放', 'Drag to orbit · scroll to zoom') }}</div>
  </div>
</template>

<script setup>
/* ============================================================================
 *  单个家具模型预览：独立的小 Three 场景，不影响主 3D 引擎。
 *  · 复用 buildFurniture()，模型居中到原点
 *  · 鼠标拖动环绕（OrbitControls），自动适配相机距离
 *  · 可选：包围盒、尺寸标注、自动旋转
 * ========================================================================== */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildFurniture } from '@/workspace/view3d/build/index.js';
import { OX, OY } from '@/workspace/view3d/coords.js';
import { tr } from '@/i18n.js';

const props = defineProps({
  /** 家具库条目：[type, name, w, d, color] */
  item: { type: Array, default: null },
  box: { type: Boolean, default: false },
  dims: { type: Boolean, default: false },
  spin: { type: Boolean, default: false }
});

const hostEl = ref(null);
const canvasEl = ref(null);
const measured = ref(null);          // { w, d, h }（mm，按模型实际包围盒）

let renderer = null, scene = null, camera = null, controls = null;
let group = null, helper = null, ground = null;
let raf = 0, ro = null;

/* ---------------- 场景 ---------------- */
function initScene(){
  const canvas = canvasEl.value;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  /* 色调映射压一下高光：近距预览时浅色家具容易过曝成一整片白 */
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(35, 1, .01, 200);
  camera.position.set(2, 1.6, 2.6);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.enablePan = false;
  controls.minPolarAngle = .12;
  controls.maxPolarAngle = Math.PI - .12;
  controls.autoRotate = props.spin;
  controls.autoRotateSpeed = 1.8;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9184, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(4, 8, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, .55);
  fill.position.set(-5, 4, -6);
  scene.add(fill);

  resize();
  observeSize();
  load(props.item);
  loop();
}

function resize(){
  const el = hostEl.value;
  if (!el || !renderer) return;
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function observeSize(){
  ro = new ResizeObserver(resize);
  ro.observe(hostEl.value);
}

/** 释放上一个模型的几何（材质是全局缓存，不能销毁） */
function disposeGroup(g){
  g.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
}

function dropHelper(){
  if (!helper) return;
  scene.remove(helper);
  helper.geometry?.dispose();
  helper.material?.dispose();
  helper = null;
}

function dropGround(){
  if (!ground) return;
  scene.remove(ground);
  ground.geometry.dispose();
  ground.material.dispose();
  ground = null;
}

function load(it){
  if (!scene) return;
  dropHelper();
  dropGround();
  if (group){ scene.remove(group); disposeGroup(group); group = null; }
  measured.value = null;
  if (!it) return;

  /* cx / cy 取户型中心 → buildFurniture 内部转成世界原点 */
  const f = {
    id: 'preview', type: it[0], name: it[1], w: it[2], d: it[3], color: it[4],
    cx: OX, cy: OY, rot: 0, sdir: 1
  };
  group = buildFurniture(f);
  const b = new THREE.Box3().setFromObject(group);
  const c = b.getCenter(new THREE.Vector3());
  group.position.sub(c);                       // 居中到原点
  scene.add(group);

  const s = b.getSize(new THREE.Vector3());
  measured.value = {
    w: Math.round(s.x * 1000),
    d: Math.round(s.z * 1000),
    h: Math.round(s.y * 1000)
  };

  /* 相机按包围球适配 */
  const max = Math.max(s.x, s.y, s.z) || 1;
  const dist = max / (2 * Math.tan(camera.fov * Math.PI / 360)) * 1.75;
  /* near/far 比值控制得太夸张会损失深度精度（贴面模型容易闪），这里收紧到 1:400 */
  camera.near = dist / 40;
  camera.far = dist * 10;
  camera.position.set(dist * .62, dist * .5, dist * .72);
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.minDistance = dist * .3;
  controls.maxDistance = dist * 3.2;
  controls.update();

  /* 地面 + 包围盒 */
  const b2 = new THREE.Box3().setFromObject(group);
  const size2 = b2.getSize(new THREE.Vector3());
  ground = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(size2.x, size2.z) * .95, 48),
    new THREE.MeshBasicMaterial({ color: 0x2b2824, transparent: true, opacity: .06, depthWrite: false })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = b2.min.y - .002;
  scene.add(ground);

  if (props.box) addBoxHelper(b2);
}


function addBoxHelper(box){
  helper = new THREE.Box3Helper(box || new THREE.Box3().setFromObject(group), 0x2f8f6a);
  helper.material.transparent = true;
  helper.material.opacity = .75;
  scene.add(helper);
}

function updateBox(on){
  if (!scene) return;
  dropHelper();
  if (on && group) addBoxHelper();
}

/* ---------------- 渲染循环 ---------------- */
function loop(){
  raf = requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
}

watch(() => props.item, it => load(it), { deep: true });
watch(() => props.box, v => updateBox(v));
watch(() => props.spin, v => { if (controls) controls.autoRotate = v; });

onMounted(initScene);

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  ro?.disconnect();
  ro = null;
  if (group){ scene?.remove(group); disposeGroup(group); }
  dropHelper();
  dropGround();
  controls?.dispose();
  renderer?.dispose();
  renderer = scene = camera = controls = group = helper = ground = null;
});
</script>

<style scoped>
.mp{position:relative;flex:1;min-height:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;
  background:linear-gradient(180deg,#fcfaf6,#efe9dd)}
.mp canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
.mp canvas:active{cursor:grabbing}
.mp-dims{position:absolute;left:10px;top:10px;padding:3px 9px;border:1px solid var(--line);border-radius:8px;
  background:rgba(255,253,249,.92);color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums;
  pointer-events:none;backdrop-filter:blur(6px)}
.mp-hint{position:absolute;left:10px;bottom:10px;color:var(--muted);font-size:11px;pointer-events:none;opacity:.8}
</style>
