// Yayından hemen sonra: kurulu uygulamaların "Güncelle" düğmesi bu sürümü gerçekten görebiliyor mu?
// release.yml yükleme adımından sonra çalışır. GitHub'daki sürümü yerelde derlenen dosyalarla karşılaştırır.
//
//   GH_TOKEN=... GITHUB_REPOSITORY=sahip/depo node test/surum/yayin-dogrula.mjs <sürüm>
import fs from 'node:fs';
import path from 'node:path';

const ver = process.argv[2];
const repo = process.env.GITHUB_REPOSITORY;
if (!ver || !repo) {
  console.error('Kullanım: GITHUB_REPOSITORY=sahip/depo node test/surum/yayin-dogrula.mjs 1.2.3');
  process.exit(2);
}
const tag = 'v' + ver;
const headers = { accept: 'application/vnd.github+json', 'user-agent': 'xanaphian-sinama' };
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (token) headers.authorization = `Bearer ${token}`;
const api = async (p) => {
  const r = await fetch(`https://api.github.com/repos/${repo}${p}`, { headers });
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json();
};
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GitHub'ın "son sürüm" bilgisi birkaç saniye gecikebilir
let rel, latest;
for (let i = 0; i < 6; i++) {
  rel = await api(`/releases/tags/${tag}`).catch(() => null);
  latest = await api('/releases/latest').catch(() => null);
  if (rel && latest?.tag_name === tag) break;
  await sleep(5000);
}
if (!rel) errors.push(`${tag} sürümü GitHub'da bulunamadı.`);
else {
  if (rel.draft) errors.push(`${tag} taslak olarak kalmış; kullanıcılar göremez.`);
  if (rel.prerelease) errors.push(`${tag} ön sürüm olarak işaretli; güncelleyici ön sürümleri almıyor.`);
  if (latest?.tag_name !== tag) errors.push(`GitHub'da "son sürüm" ${latest?.tag_name || 'yok'}, ${tag} değil; güncelleyici yeni sürümü görmez.`);

  const local = fs.readFileSync(path.join('release', 'latest.yml'), 'utf8');
  const yv = /^version:\s*(\S+)/m.exec(local)?.[1];
  const exe = /^path:\s*(\S+)/m.exec(local)?.[1];
  if (yv !== ver) errors.push(`latest.yml içindeki sürüm (${yv}) ${ver} değil.`);
  const assets = new Map((rel.assets || []).map((a) => [a.name, a]));
  for (const name of ['latest.yml', exe, exe + '.blockmap']) {
    const a = assets.get(name);
    if (!a) {
      errors.push(`${tag} içinde ${name} yok.`);
      continue;
    }
    const size = fs.statSync(path.join('release', name)).size;
    if (a.size !== size) errors.push(`${name} eksik yüklenmiş: GitHub'da ${a.size} bayt, derlenen ${size} bayt.`);
  }
  // güncelleyicinin indireceği latest.yml bizimkiyle aynı mı
  const yml = assets.get('latest.yml');
  if (yml) {
    const r = await fetch(yml.browser_download_url, { headers: { 'user-agent': 'xanaphian-sinama' } });
    const remote = r.ok ? await r.text() : '';
    if (remote.trim() !== local.trim()) errors.push('GitHub\'daki latest.yml derlenenle aynı değil.');
  }
}

if (errors.length) {
  for (const e of errors) console.error('✗ ' + e);
  console.error('\nYayın doğrulanamadı: kurulu uygulamalar bu sürüme güncellenemeyebilir.');
  process.exit(1);
}
console.log(`✓ ${tag} yayında, son sürüm olarak görünüyor; latest.yml, kurulum dosyası ve blockmap tam yüklenmiş.`);
