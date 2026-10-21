<template>
  <component :is="tag" class="glass-card">
    <slot/>
  </component>
</template>

<script setup>
/* ============================================================================
 *  浮动卡片容器：圆角 + 半透明磨砂背景 + 柔和投影
 *  界面上的每个区域（标题菜单栏 / 组件面板 / 属性面板 / 状态栏）都用它包一层，
 *  具体区域的位置与尺寸由 AppShell 的 .ui-* 类决定。
 * ========================================================================== */
defineProps({
  /** 语义标签：header / aside / footer / section / div */
  tag: { type: String, default: 'div' }
});
</script>
