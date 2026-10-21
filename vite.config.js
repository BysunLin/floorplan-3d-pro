import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// three 的 addons 走 npm 包的 examples/jsm 路径，这里无需额外 alias。
// mode === 'single'（npm run build:single）时启用单文件内联打包：
// vite-plugin-singlefile 会关闭代码分割、把 JS / CSS / 资源全部内联进一个 HTML，
// 产物可直接用 file:// 打开。
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
    },
    plugins: [vue(), ...(single ? [viteSingleFile()] : [])],
    server: { host: true, port: 5173 },
    build: single
      ? { target: 'es2020', outDir: 'dist' }
      : { target: 'es2020', chunkSizeWarningLimit: 2000 }
  };
});
