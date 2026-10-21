import * as THREE from 'three';

export const matCache = new Map();
export let envTex = null;
export let envK = 1;

export function setEnv(tex){ envTex = tex; }

/* 玻璃 / 窗框材质：先给一份可用的默认值，引擎在环境贴图就绪后会注入更精细的版本。
 * 默认值让「模型总览」这类独立预览在引擎未初始化时也能正常建模（淋浴房玻璃依赖它）。 */
export let glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xcfe6ef, roughness: .05, transparent: true,
  opacity: .28, depthWrite: false, side: THREE.DoubleSide
});
export let frameMat = new THREE.MeshStandardMaterial({ color: 0x5d6166, roughness: .5, metalness: .4 });
export function setGlassMat(m){ glassMat = m; }
export function setFrameMat(m){ frameMat = m; }

export function mat(color, o = {}){
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)){
    const m = new THREE.MeshStandardMaterial({ color, roughness: .7, ...o });
    // 金属 / 光滑表面挂环境反射，墙面等哑光材质不挂，避免整体变亮
    if (envTex && (m.metalness > 0 || m.roughness < .4)){
      m.envMap = envTex;
      m.userData.env = m.metalness > .5 ? 1 : .5;
      m.envMapIntensity = m.userData.env * envK;
    }
    matCache.set(key, m);
  }
  return matCache.get(key);
}

export function setEnvK(k){
  envK = k;
  matCache.forEach(m => { if (m.envMap) m.envMapIntensity = m.userData.env * envK; });
}

export const metal = () => mat('#cfd2d4', { metalness: .9, roughness: .25 });
export const chrome = () => mat('#eef0f2', { metalness: 1, roughness: .08 });
export const hwMat = () => mat('#b9b3a8', { metalness: .85, roughness: .3 });
export const blackMetal = () => mat('#2b2b2d', { metalness: .6, roughness: .4 });
export const mirror = () => mat('#dfeaee', { metalness: .55, roughness: .06 });
export const ceramic = (o = {}) => mat('#fbfbf9', { roughness: .12, ...o });
export const fabric = c => mat(c, { roughness: .96 });
export const woodM = c => mat(c, { roughness: .55 });
export const screenMat = (glow = '#1a2636') => mat('#0b0e13', { roughness: .1, metalness: .3, emissive: glow, emissiveIntensity: .35 });
export const glowMat = (c = '#fff4dc', e = '#ffdca0', k = .5) => mat(c, { emissive: e, emissiveIntensity: k, roughness: .9, side: THREE.DoubleSide });

export const darker  = (hex, k = .8) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
export const lighter = (hex, k = .2) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();

/** 确定性伪随机（同一件家具每次建模结果一致） */
export function rng(seed){
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const rgbK = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v*k)));
  return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
};

/* ======================= 地面贴图 ======================= */
// 按真实尺寸平铺（UV 单位 = 米）
export const TEX = {
  wood:      { sx: 1.8, sy: .36, base: '#d6b58a', rough: .55 },
  walnut:    { sx: 1.8, sy: .36, base: '#9a6f4b', rough: .5 },
  tile800:   { sx: .8,  sy: .8,  base: '#e7d8bd', grout: '#c9b596', rough: .3 },
  tile600:   { sx: .6,  sy: .6,  base: '#d9e2e6', grout: '#b3c2c9', rough: .35 },
  antislip:  { sx: .3,  sy: .3,  base: '#d3d8d4', grout: '#aab2ac', rough: .8 },
  marble:    { sx: 1.2, sy: 1.2, base: '#f2efe9', grout: '#d9d2c4', rough: .18 },
  terrazzo: { sx: .5,  sy: .5,  base: '#e6dfd3', rough: .4 },
  carpet:   { sx: .3,  sy: .3,  base: '#c6bfd2', rough: 1 },
  cement:   { sx: 2,   sy: 2,   base: '#bfbcb6', rough: .85 },
  asphalt:  { sx: 2.4, sy: 2.4, base: '#3d3d40', rough: .95 },   // 柏油路
  lawn:     { sx: .55, sy: .55, base: '#a9c78a', rough: .95 },   // 草坪
  pond:     { sx: 1.2, sy: 1.2, base: '#2f5561', rough: .9 },    // 池塘：深色池底（水面另有材质）
  // 市政 / 户外
  sidewalk: { sx: .6,  sy: .3,  base: '#d6d2c8', grout: '#bdb7aa', rough: .82 },  // 人行道砖（错缝铺装）
  curb:     { sx: 1.5, sy: .3,  base: '#dcdad3', grout: '#c2beb5', rough: .85 },  // 路缘石
  hedge:    { sx: .5,  sy: .5,  base: '#6f9455', rough: .95 },                    // 绿篱
  soil:     { sx: .9,  sy: .9,  base: '#7a6248', rough: 1 },                      // 种植土
};

export const floorMats = {};
export function floorMat(kind, renderer){
  if (floorMats[kind]) return floorMats[kind];
  const s = TEX[kind] || TEX.tile800, R = rng(kind.length*977 + 13), cv = document.createElement('canvas');
  const wood = kind === 'wood' || kind === 'walnut';
  cv.width = wood ? 1024 : 512; cv.height = wood ? 205 : 512;
  const g = cv.getContext('2d'), W = cv.width, Hh = cv.height;
  g.fillStyle = s.base; g.fillRect(0, 0, W, Hh);
  if (wood){
    const rowH = Hh/2, joints = [[W*2/3], [W/3]];
    for (let r = 0; r < 2; r++){
      let x0 = 0;
      [...joints[r], W].forEach(x1 => {
        g.fillStyle = rgbK(s.base, .9 + R()*.2); g.fillRect(x0, r*rowH, x1 - x0, rowH);
        g.strokeStyle = rgbK(s.base, .8); g.globalAlpha = .35; g.lineWidth = 1.2;
        for (let k = 0; k < 7; k++){
          const y = r*rowH + 6 + R()*(rowH - 12);
          g.beginPath(); g.moveTo(x0, y);
          for (let x = x0; x <= x1; x += 40) g.lineTo(x, y + Math.sin(x*.02 + k)*2.5);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = rgbK(s.base, .62); g.fillRect(x1 - 1.5, r*rowH, 3, rowH);
        x0 = x1;
      });
      g.fillStyle = rgbK(s.base, .62); g.fillRect(0, r*rowH, W, 2.5);
    }
  } else if (kind === 'marble'){
    g.strokeStyle = 'rgba(160,150,135,.35)';
    for (let k = 0; k < 6; k++){
      g.lineWidth = 1 + R()*3;
      g.beginPath(); g.moveTo(R()*W, 0);
      g.bezierCurveTo(R()*W, R()*Hh, R()*W, R()*Hh, R()*W, Hh);
      g.stroke();
    }
  } else if (kind === 'terrazzo'){
    const cs = ['#b9a58c', '#8fa3a0', '#c9b7a2', '#a88f76', '#7e8a86'];
    for (let k = 0; k < 160; k++){
      g.fillStyle = cs[k % 5];
      g.beginPath(); g.arc(R()*W, R()*Hh, 2 + R()*7, 0, 7); g.fill();
    }
  } else if (kind === 'lawn'){
    // 草叶：细密的短划线 + 少量深浅斑块
    for (let k = 0; k < 260; k++){
      g.fillStyle = `rgba(90,130,70,${.03 + R()*.05})`;
      g.beginPath(); g.arc(R()*W, R()*Hh, 8 + R()*26, 0, 7); g.fill();
    }
    for (let k = 0; k < 900; k++){
      const x = R()*W, y = R()*Hh;
      g.strokeStyle = R() > .45 ? '#8db169' : '#c2da9f';
      g.lineWidth = 1.6 + R()*1.6;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + (R() - .5)*7, y - 5 - R()*8);
      g.stroke();
    }
  } else if (kind === 'sidewalk'){
    // 人行道砖：4 皮错缝铺装（每皮 1/4 高），留 3px 灰缝
    const rowH = Hh/4, bw = W/2;
    g.fillStyle = s.grout; g.fillRect(0, 0, W, Hh);
    for (let r = 0; r < 4; r++){
      const off = (r % 2) ? -bw/2 : 0;
      for (let i = -1; i < 3; i++){
        g.fillStyle = rgbK(s.base, .92 + R()*.14);
        g.fillRect(off + i*bw + 3, r*rowH + 3, bw - 6, rowH - 6);
      }
    }
  } else if (kind === 'hedge'){
    // 绿篱：深浅叶片团 + 短枝，比草坪更密
    for (let k = 0; k < 90; k++){
      g.fillStyle = R() > .5 ? 'rgba(120,165,95,.55)' : 'rgba(70,105,55,.5)';
      g.beginPath(); g.arc(R()*W, R()*Hh, 8 + R()*22, 0, 7); g.fill();
    }
    for (let k = 0; k < 700; k++){
      const x = R()*W, y = R()*Hh;
      g.strokeStyle = R() > .5 ? '#8fb96d' : '#4f7440';
      g.lineWidth = 2 + R()*2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5)*9, y - 6 - R()*9); g.stroke();
    }
  } else if (kind === 'soil'){
    // 种植土：细土粒 + 小石子
    g.fillStyle = '#6b5540'; g.fillRect(0, 0, W, Hh);
    for (let k = 0; k < 2600; k++){
      g.fillStyle = R() > .5 ? 'rgba(150,125,100,.28)' : 'rgba(45,34,24,.3)';
      g.fillRect(R()*W, R()*Hh, 2 + R()*3, 2 + R()*3);
    }
    for (let k = 0; k < 90; k++){
      g.fillStyle = R() > .5 ? '#8d7458' : '#5b4734';
      g.beginPath(); g.arc(R()*W, R()*Hh, 2 + R()*4, 0, 7); g.fill();
    }
  } else if (kind === 'asphalt'){
    // 柏油路：细砂粒感（浅 / 深两种斑点交错），比瓷砖粗糙
    for (let k = 0; k < 3800; k++){
      const v = R() > .52 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${.012 + R()*.05})`;
      g.fillRect(R()*W, R()*Hh, 1 + R()*2.2, 1 + R()*2.2);
    }
  } else {
    for (let k = 0; k < 1500; k++){
      g.fillStyle = `rgba(0,0,0,${R()*.04})`;
      g.fillRect(R()*W, R()*Hh, 2, 2);
    }
  }
  if (s.grout){ g.fillStyle = s.grout; g.fillRect(0, 0, W, 3); g.fillRect(0, 0, 3, Hh); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1/s.sx, 1/s.sy);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return floorMats[kind] = new THREE.MeshStandardMaterial({ map: t, roughness: s.rough });
}

/* ---------- 水面材质（池塘）：波光贴图 + 缓慢流动 ---------- */
export let waterM = null;
export function waterMat(){
  if (waterM) return waterM;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#7db7c9'; g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 9; k++){
    const y0 = k*57 + 14;
    g.strokeStyle = k % 2 ? 'rgba(255,255,255,.34)' : 'rgba(214,240,247,.5)';
    g.lineWidth = k % 2 ? 5 : 8;
    g.beginPath(); g.moveTo(-40, y0);
    for (let x = -40; x <= 552; x += 74){
      g.quadraticCurveTo(x + 37, y0 + ((x/74) % 2 ? -13 : 13), x + 74, y0);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(.45, .45);
  t.colorSpace = THREE.SRGBColorSpace;
  waterM = new THREE.MeshStandardMaterial({
    map: t, color: '#e2f3f8', transparent: true, opacity: .86,
    roughness: .06, metalness: .35, depthWrite: false
  });
  waterM.userData.tex = t;
  return waterM;
}

/* ======================= 几何小工具 ======================= */
