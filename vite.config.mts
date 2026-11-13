import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    target: 'chrome140',
    sourcemap: false,
    cssMinify: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
    // v1.27: oyun içi kaplama ayrı, küçük bir sayfa
    rollupOptions: { input: { index: page('./src/renderer/index.html'), overlay: page('./src/renderer/overlay.html') } },
  },
  server: { port: 5173, strictPort: true },
});
