<template>
  <div class="plan-mask" @click.self="$emit('close')">
    <div class="plan-dialog dlg-models" role="dialog" aria-modal="true" aria-labelledby="modelTitle">
      <header class="dlg-head">
        <div class="dlg-title">
          <h3 id="modelTitle">{{ tr('模型总览', 'Model overview') }}</h3>
          <p class="dlg-sub">{{ tr('左侧按分类浏览家具库，点击任意元素在右侧查看 3D 模型', 'Browse the furniture library by category — click an item to preview its 3D model') }}</p>
        </div>
        <button class="dlg-x" :title="tr('关闭', 'Close')" :aria-label="tr('关闭', 'Close')" @click="$emit('close')">×</button>
      </header>

      <div class="mg-body">
        <!-- 左：搜索 + 分类列表 -->
        <aside class="mg-side">
          <div class="mg-search">
            <input v-model="q" type="search" :placeholder="tr('搜索家具…', 'Search furniture…')" @keydown.stop>
            <button v-if="q" class="mg-clear" :title="tr('清除', 'Clear')" @click="q = ''">×</button>
          </div>

          <div class="mg-list">
            <template v-for="g in groups" :key="g.cat">
              <h4>{{ nm(g.cat) }}</h4>
              <div class="mg-grid">
                <button v-for="(it, i) in g.items" :key="g.cat + ':' + i"
                  class="mg-item" :class="{ on: keyOf(it) === selKey }"
                  :title="`${nm(it[1])} · ${it[2]}×${it[3]}`" @click="pick(it)">
                  <svg :viewBox="viewBoxOf(it)" v-html="iconOf(it)"></svg>
                  <b>{{ nm(it[1]) }}</b>
                </button>
              </div>
            </template>
            <p v-if="!groups.length" class="mg-empty">{{ tr('没有匹配的模型', 'No matching model') }}</p>
          </div>
        </aside>

        <!-- 右：3D 预览 -->
        <section class="mg-main">
          <ModelPreview :item="sel" :box="showBox" :dims="showDims" :spin="spin"/>
          <footer class="mg-bar">
            <b class="mg-name">{{ sel ? nm(sel[1]) : tr('未选择', 'Nothing selected') }}</b>
            <span v-if="sel" class="mg-size">{{ sel[2] }} × {{ sel[3] }} mm</span>
            <span class="spacer"></span>
            <label class="mg-opt"><input v-model="showBox" type="checkbox"> {{ tr('包围盒', 'Bounding box') }}</label>
            <label class="mg-opt"><input v-model="showDims" type="checkbox"> {{ tr('尺寸', 'Dimensions') }}</label>
            <label class="mg-opt"><input v-model="spin" type="checkbox"> {{ tr('旋转', 'Auto rotate') }}</label>
          </footer>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
/* ============================================================================
 *  模型总览弹窗：左侧家具库（2D 图例 + 搜索），右侧 3D 预览。
 * ========================================================================== */
import { ref, computed } from 'vue';
import { LIB } from '@/core/library/index.js';
import { furnSVG } from '@/core/library/furnSvg.js';
import { tr, nm } from '@/i18n.js';
import ModelPreview from '@/workspace/view3d/ModelPreview.vue';

defineEmits(['close']);

const q = ref('');
const showBox = ref(false);
const showDims = ref(true);
const spin = ref(true);

/* 选中项用「稳定 key」比较：家具库条目是数组，身份比较在模板里不可靠 */
const keyOf = it => (it ? `${it[0]}|${it[1]}|${it[2]}|${it[3]}` : '');

/* 默认选中第一个分类的第一个家具，右侧一进来就有内容 */
const sel = ref(LIB[0]?.items?.[0] || null);
const selKey = ref(keyOf(sel.value));

const groups = computed(() => {
  const kw = q.value.trim().toLowerCase();
  if (!kw) return LIB.map(g => ({ cat: g.cat, items: g.items }));
  return LIB
    .map(g => ({
      cat: g.cat,
      items: g.items.filter(it =>
        nm(it[1]).toLowerCase().includes(kw)
        || String(it[1]).toLowerCase().includes(kw)
        || String(it[0]).toLowerCase().includes(kw))
    }))
    .filter(g => g.items.length);
});

const viewBoxOf = it => {
  const pad = Math.max(it[2], it[3]) * .08;
  return `${-it[2] / 2 - pad} ${-it[3] / 2 - pad} ${it[2] + 2 * pad} ${it[3] + 2 * pad}`;
};
const iconOf = it => furnSVG(it[0], it[2], it[3], it[4]);

function pick(it){
  sel.value = it;
  selKey.value = keyOf(it);
}
</script>
