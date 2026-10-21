import { ref } from 'vue';

export const fullscreenOn = ref(false);

const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;

function syncFullscreen(){ fullscreenOn.value = !!fsEl(); }

export function toggleFullscreen(){
  const de = document.documentElement;
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!req) return;
    Promise.resolve(req.call(de)).catch(() => {});
  }
}

export function installFullscreenSync(){
  const types = ['fullscreenchange', 'webkitfullscreenchange'];
  types.forEach(t => document.addEventListener(t, syncFullscreen));
  syncFullscreen();
  return () => types.forEach(t => document.removeEventListener(t, syncFullscreen));
}
