<template>
  <div id="toast" :class="{show: toast.show}">{{ toast.msg }}</div>
</template>

<script setup>
import { useUiStore } from '@/stores/index.js';

const { toast } = useUiStore();
</script>
