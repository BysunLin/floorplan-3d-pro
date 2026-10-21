<template>
  <div id="roomList">
    <button v-for="r in counted" :key="r.id" :data-room="r.id" :class="{on: active === r.id}" @click="onRoom(r)">
      <span>{{ nm(state.rooms[r.id]?.name || r.name) }}</span>
      <small>{{ isVoid(r) ? tr('挑空', 'Void') : roomArea(r).toFixed(2) + ' m²' }}</small>
    </button>
    <button data-room="__all" :class="{on: active === '__all'}" @click="onAll">
      <span>{{ tr('全屋', 'Whole home') }}</span>
      <small>{{ total.toFixed(2) }} m²</small>
    </button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { usePlanStore } from '@/stores/index.js';
import { ROOMS } from '@/core/model/plan.js';
import { roomArea } from '@/core/geometry/region.js';
import { tr, nm } from '@/i18n.js';
import { getEngine } from '@/workspace/view3d/registry.js';

const { state } = usePlanStore();

/* 必须响应式：切换户型时 ROOMS / state.rooms 会整体替换；挑空不计入总面积 */
const isVoid = r => state.rooms[r.id]?.mat === 'void';
const counted = computed(() => ROOMS.filter(r => r.counted !== false));
const total = computed(() => counted.value.filter(r => !isVoid(r)).reduce((a, r) => a + roomArea(r), 0));
const active = ref('');

function onRoom(r){
  active.value = r.id;
  const e = getEngine();
  if (!e) return;
  e.setMode('orbit');
  e.flyToRoom(r.id);
}

function onAll(){
  active.value = '__all';
  const e = getEngine();
  if (!e) return;
  e.setMode('orbit');
  e.flyTo(e.isoWhole());
}
</script>
