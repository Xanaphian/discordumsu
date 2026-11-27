// v1.68 telefon uygulaması (Android / iPhone, Capacitor) için arayüz derlemesi: `npm run build:mobil` → dist/mobil
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const version = JSON.parse(readFileSync(page('./package.json'), 'utf8')).version;

export default defineConfig({
  root: 'src/renderer/mobil',
  base: './',
  plugins: [react()],
  resolve: { alias: { dfn3: page('./node_modules/@workadventure/noise-suppression/dist/assets') } },
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)), __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: '../../../dist/mobil',
    emptyOutDir: true,
    // Android 10+ WebView / iOS 16.4+ Safari
    target: ['chrome110', 'safari16'],
    sourcemap: false,
    cssMinify: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5174, strictPort: true },
});
