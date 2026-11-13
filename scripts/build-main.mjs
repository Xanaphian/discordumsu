import { build } from 'esbuild';
import fs from 'node:fs';
const prod = process.env.NODE_ENV !== 'development';
const common = { bundle: true, platform: 'node', target: 'node22', sourcemap: prod ? false : 'inline', minify: prod, logLevel: 'warning', legalComments: 'none' };
await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js', format: 'cjs', external: ['electron', 'electron-updater', 'ws', 'bufferutil', 'utf-8-validate'] });
await build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/main/preload.js', format: 'cjs', external: ['electron'] });
fs.copyFileSync('build/icon.png', 'dist/main/icon.png');
console.log('main + preload derlendi');
