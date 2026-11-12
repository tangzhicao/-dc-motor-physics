import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // 确保在 GitHub Pages 等二级子路径部署时，静态资源（JS/CSS）能使用相对路径正常加载
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
