// Merkezi sunucu paketi: tek dosya, Node 18+; sunucuda npm install gerekmez.
import { build } from 'esbuild';
import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
await build({
  entryPoints: ['server/node.ts'],
  outfile: 'server/paket/kovan-server.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  external: ['bufferutil', 'utf-8-validate', 'electron'],
  banner: { js: `// Kovan sunucusu v${pkg.version}` },
  define: { 'process.env.KOVAN_SERVER_VERSION': JSON.stringify(pkg.version) },
});
console.log('sunucu derlendi: server/paket/kovan-server.js', (fs.statSync('server/paket/kovan-server.js').size / 1024).toFixed(0) + ' KB');
