import { createApp } from 'vue';
import '@/styles/app.css';
import App from '@/App.vue';
import { pinia } from '@/stores/index.js';

createApp(App).use(pinia).mount('#app');
