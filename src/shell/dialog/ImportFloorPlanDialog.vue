<template>
  <div class="plan-mask" @click.self="$emit('close')">
    <div class="plan-dialog dlg-import" role="dialog" aria-modal="true" aria-labelledby="importTitle">
      <header class="dlg-head">
        <div class="dlg-title">
          <h3 id="importTitle">{{ tr('导入户型图', 'Import floor plan') }}</h3>
          <p class="dlg-sub">{{ tr(
            '自动识别图片里的墙体与房间，确认后替换当前户型',
            'Walls and rooms are detected from the image — confirm to replace the current layout'
          ) }}</p>
        </div>
        <button class="dlg-x" :title="tr('关闭', 'Close')" :aria-label="tr('关闭', 'Close')" @click="$emit('close')">×</button>
      </header>

      <!-- 识别中 -->
      <div v-if="phase === 'loading'" class="imp-center">
        <span class="imp-spin"></span>
        <p>{{ tr('正在识别墙体与房间…', 'Detecting walls and rooms…') }}</p>
      </div>

      <!-- 失败 -->
      <div v-else-if="phase === 'error'" class="imp-center imp-fail">
        <p>{{ errText }}</p>
        <button class="btn" @click="$emit('close')">{{ tr('关闭', 'Close') }}</button>
      </div>

      <!-- 识别结果 -->
      <template v-else>
        <div class="dlg-body imp-body">
          <div class="imp-main">
            <div class="imp-modes">
              <button class="btn chip" :class="{ on: view === 'overlay' }" @click="view = 'overlay'">
                {{ tr('原图叠加', 'On image') }}
              </button>
              <button class="btn chip" :class="{ on: view === 'plan' }" @click="view = 'plan'">
                {{ tr('识别结果', 'Result') }}
              </button>
            </div>
            <div class="imp-preview" :class="{ 'is-plan': view === 'plan' }">
              <img :src="imgUrl" :alt="tr('户型图', 'Floor plan')">
              <svg :viewBox="`0 0 ${det.width} ${det.height}`" preserveAspectRatio="xMidYMid meet">
                <path v-for="(r, i) in det.rooms" :key="'r' + i" :d="polyPath(r.poly)" class="imp-room"/>
                <rect v-for="(w, i) in det.walls" :key="'w' + i"
                  :x="w.x0" :y="w.y0" :width="w.x1 - w.x0" :height="w.y1 - w.y0" class="imp-wall"/>
              </svg>
            </div>
          </div>

          <aside class="imp-side">
            <div class="imp-stat">
              <span>{{ tr('墙体', 'Walls') }}</span><b>{{ meta.wallCount }}</b>
            </div>
            <div class="imp-stat">
              <span>{{ tr('房间', 'Rooms') }}</span><b>{{ meta.regionCount }}</b>
            </div>
            <div class="imp-stat">
              <span>{{ tr('使用面积', 'Floor area') }}</span><b>{{ meta.area }} m²</b>
            </div>
            <div class="imp-stat">
              <span>{{ tr('识别尺寸', 'Extent') }}</span>
              <b>{{ meta.totalWidthMM }} × {{ meta.totalHeightMM }}</b>
            </div>

            <label class="imp-field">
              <span>{{ tr('整套实际宽度 (mm)', 'Real total width (mm)') }}</span>
              <input type="number" :min="2000" :max="60000" step="100" v-model.number="totalW">
            </label>
            <p class="imp-hint">{{ tr(
              '按外墙外轮廓的总宽填写，比例会据此换算；改数字即时生效，不用重新识别。',
              'Enter the overall width of the outer walls — the scale updates instantly.'
            ) }}</p>

            <p v-if="!meta.regionCount" class="imp-warn">{{ tr(
              '没有识别到封闭房间，将只导入墙体，房间可稍后在 2D 里手动绘制。',
              'No enclosed rooms found — only walls will be imported; draw areas manually later.'
            ) }}</p>
          </aside>
        </div>

        <footer class="imp-foot">
          <p class="imp-note">{{ tr(
            '导入会替换当前户型、家具与墙体，且不可撤销；需要保留请先导出方案 JSON。',
            'Importing replaces the current layout, furniture and walls, and cannot be undone — export the project first if needed.'
          ) }}</p>
          <div class="imp-actions">
            <button class="btn" @click="$emit('close')">{{ tr('取消', 'Cancel') }}</button>
            <button class="btn primary" :disabled="!built" @click="onApply">{{ tr('导入到当前视图', 'Import into view') }}</button>
          </div>
        </footer>
      </template>
    </div>
  </div>
</template>

<script setup>
/* ============================================================================
 *  导入户型图：识别 → 预览 → 二次确认
 *
 *  · 识别在内存里完成，图片不落盘（用户关掉弹窗即丢弃）；
 *  · 预览用原图 + SVG 叠加，用户能直观看到「识别成了什么样」；
 *  · 调整「实际总宽」只是重新做一次 px → mm 换算，不重新识别。
 * ========================================================================== */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { analyzeFloorPlan, buildGeo } from '@/core/import/index.js';
import { tr } from '@/i18n.js';

const props = defineProps({ file: { type: Object, required: true } });
const emit = defineEmits(['close', 'apply']);

const phase = ref('loading');           // loading | ready | error
const errText = ref('');
const det = ref(null);                  // 像素域识别结果（预览与再次换算都用它）
const totalW = ref(10000);
const imgUrl = ref('');
const view = ref('overlay');            // overlay 原图叠加 / plan 只看识别结果

const built = computed(() => {
  if (!det.value) return null;
  try { return buildGeo(det.value, totalW.value); }
  catch (e){ return null; }
});

const meta = computed(() => built.value?.meta || {
  wallCount: 0, regionCount: 0, area: 0, totalWidthMM: 0, totalHeightMM: 0
});

const polyPath = poly =>
  (poly || []).map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('') + 'Z';

onMounted(async () => {
  try { imgUrl.value = URL.createObjectURL(props.file); } catch (e){ imgUrl.value = ''; }
  try {
    const res = await analyzeFloorPlan(props.file);
    det.value = res.det;
    // 识别出的总宽先按 mm 取整，给用户一个可改的起点
    totalW.value = Math.max(2000, Math.round(res.meta.totalWidthMM / 100) * 100) || 10000;
    phase.value = 'ready';
  } catch (e){
    errText.value = e?.message || tr('识别失败', 'Recognition failed');
    phase.value = 'error';
  }
});

onBeforeUnmount(() => {
  if (imgUrl.value) URL.revokeObjectURL(imgUrl.value);
});

function onApply(){
  if (!built.value) return;
  emit('apply', built.value);
}
</script>
