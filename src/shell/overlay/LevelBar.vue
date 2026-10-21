<template>
  <div id="levelBar" class="levelbar">
    <div class="lv-list">
      <button
        v-for="lv in levels" :key="lv.id"
        class="lv" :class="{ on: lv.id === activeLevel, base: (lv.elev || 0) < 0 }"
        :title="tr('切换到该楼层', 'Switch to this floor')"
        @click="pick(lv.id)"
      ><b>{{ levelName(lv) }}</b></button>
    </div>
    <button class="lv-add" :title="tr('新增楼层', 'Add floor')" @click="add">＋</button>
    <button class="lv-add b" :title="tr('新增地下层（负一层）', 'Add basement level')" @click="addB">＋B</button>
    <button class="lv-kind" :class="{ on: isLoft }" :title="tr('切换夹层 / 普通楼层', 'Toggle loft / floor')" @click="toggleLoft">
      {{ isLoft ? tr('夹层', 'Loft') : tr('楼层', 'Floor') }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { usePlanStore } from '@/stores/index.js';
import { tr, levelName } from '@/i18n.js';

const plan = usePlanStore();
const levels = computed(() => plan.state.levels);
const activeLevel = computed(() => plan.state.activeLevel);
const isLoft = computed(() =>
  (plan.state.levels.find(l => l.id === plan.state.activeLevel)?.kind) === 'loft');

function pick(id){ if (id !== activeLevel.value) plan.switchLevel(id); }
function add(){ plan.addLevel(); }
function addB(){ plan.addBasement(); }
function toggleLoft(){ plan.toggleLoft(activeLevel.value); }
</script>
