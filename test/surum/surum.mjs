// Sürüm ve güncelleme denetimi: uygulamadaki "Güncelle" düğmesinin yeni sürümü gerçekten göreceğinden emin olur.
// Her PR'da ve her sürümden önce çalışır. İnternete ulaşılamazsa yalnızca uyarır, akışı tıkamaz.
//
//   node test/surum/surum.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const errors = [];
const warns = [];
const ok = [];

/** "1.53.1" -> [1,53,1]; geçersizse null */
export function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim());
  return m ? m.slice(1).map(Number) : null;
}
export function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const pkg = JSON.parse(read('package.json'));
const ver = parse(pkg.version);
if (!ver) errors.push(`package.json sürümü "${pkg.version}" geçerli değil; 1.2.3 biçiminde olmalı (güncelleyici başka biçimi anlamaz).`);
else ok.push(`sürüm ${pkg.version}`);

try {
  const lock = JSON.parse(read('package-lock.json'));
  const lv = lock.packages?.['']?.version || lock.version;
  if (lv !== pkg.version) warns.push(`package-lock.json sürümü (${lv}) package.json ile (${pkg.version}) aynı değil; "npm install --package-lock-only" ile eşitle.`);
} catch {
  warns.push('package-lock.json okunamadı.');
}

// Güncelleyicinin baktığı yer: electron-builder.yml > publish
const yml = read('electron-builder.yml');
const pub = yml.split(/^publish:/m)[1] || '';
const field = (k) => new RegExp(`^\\s*-?\\s*${k}:\\s*(\\S+)`, 'm').exec(pub)?.[1];
const owner = field('owner');
const repo = field('repo');
if (field('provider') !== 'github') errors.push('electron-builder.yml: publish.provider "github" olmalı; güncelleyici GitHub Releases\'tan çekiyor.');
if (!owner || !repo) errors.push('electron-builder.yml: publish altında owner ve repo yazmalı.');
const here = process.env.GITHUB_REPOSITORY;
if (owner && repo && here && here.toLowerCase() !== `${owner}/${repo}`.toLowerCase())
  errors.push(`electron-builder.yml güncellemeleri ${owner}/${repo} deposundan arıyor, ama bu depo ${here}. Kurulu uygulamalar yeni sürümleri göremez.`);
const rt = field('releaseType');
if (rt && rt !== 'release') errors.push(`electron-builder.yml: releaseType "${rt}"; taslak ya da ön sürüm güncelleyiciye görünmez, "release" olmalı.`);
if (!/artifactName:\s*Kovan-Setup-\$\{version\}\.\$\{ext\}/.test(yml)) warns.push('Kurulum dosyasının adı değişmiş; release.yml yükleme adımındaki "release/Kovan-Setup-*.exe" kalıbını da güncelle.');

// v1.71.3: görünen ad Naphian; exe adı ve veri klasörü Kovan kalmalı (yoksa kısayollar ve herkesin ayarları/oturumu kopar)
if (!/^\s*executableName:\s*Kovan\s*$/m.test(yml)) errors.push('electron-builder.yml: win.executableName "Kovan" olmalı; exe adı değişirse kısayollar, otomatik başlatma ve bot ayarları bozulur.');
if (!/app\.setPath\('userData',\s*path\.join\(app\.getPath\('appData'\),\s*'Kovan'\)\)/.test(read('src/main/main.ts')))
  errors.push("src/main/main.ts: veri klasörü %APPDATA%/Kovan'a sabitlenmeli (app.setPath('userData', ...)); yoksa herkesin ayarları ve oturumu kaybolur.");

// Yayın akışı latest.yml'i yüklüyor mu (güncelleyici bu dosyayı okur)
const rel = read('.github/workflows/release.yml');
for (const f of ['latest.yml', '.exe.blockmap']) if (!rel.includes(f)) errors.push(`release.yml "${f}" dosyasını yüklemiyor; güncelleme düğmesi çalışmaz.`);
if (!/needs:\s*\[?\s*sinama/.test(rel)) errors.push('release.yml artık otomatik sınamayı beklemiyor (windows işinde "needs: sinama" olmalı).');

// Yeni sürüm yayınlanmış son sürümden küçük olmamalı: yoksa kimse güncelleme almaz
if (ver && owner && repo) {
  try {
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'xanaphian-sinama' };
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`;
    // SURUM_SON_YAYIN=v1.2.3 ile GitHub'a sormadan denenebilir
    const fake = process.env.SURUM_SON_YAYIN;
    const r = fake
      ? new Response(JSON.stringify({ tag_name: fake, assets: [{ name: 'latest.yml' }] }))
      : await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers, signal: AbortSignal.timeout(10000) });
    if (r.status === 404) warns.push('GitHub\'da henüz yayınlanmış sürüm yok.');
    else if (!r.ok) warns.push(`Son yayınlanan sürüm okunamadı (HTTP ${r.status}); karşılaştırma atlandı.`);
    else {
      const latest = await r.json();
      const lv = parse(latest.tag_name);
      if (!lv) warns.push(`Son yayınlanan sürümün etiketi "${latest.tag_name}" anlaşılamadı.`);
      else if (cmp(ver, lv) < 0)
        errors.push(`package.json sürümü (${pkg.version}) yayınlanmış son sürümden (${latest.tag_name}) küçük. Güncelleyici bunu yeni sürüm saymaz; numarayı büyüt.`);
      else {
        ok.push(`son yayın ${latest.tag_name}` + (cmp(ver, lv) === 0 ? ' (aynı sürüm, yeniden yayınlanmaz)' : ' → bu sürüm yeni'));
        if (cmp(ver, lv) > 0 && !(latest.assets || []).some((a) => a.name === 'latest.yml'))
          warns.push(`Son yayın ${latest.tag_name} içinde latest.yml yok; o sürümdeki kullanıcılar güncelleme göremiyor olabilir.`);
        if (cmp(ver, lv) > 0 && !fs.existsSync(path.join(ROOT, 'release-notes', pkg.version + '.md')))
          warns.push(`release-notes/${pkg.version}.md yok; Son eklenenler ve güncelleme notu boş kalır.`);
      }
    }
  } catch (e) {
    warns.push('GitHub\'a ulaşılamadı, son sürümle karşılaştırma atlandı (' + (e?.message || e) + ').');
  }
}

for (const s of ok) console.log('✓ ' + s);
for (const s of warns) console.log('! ' + s);
for (const s of errors) console.error('✗ ' + s);
if (errors.length) {
  console.error(`\nSürüm denetimi başarısız (${errors.length} sorun).`);
  process.exit(1);
}
console.log('\nSürüm denetimi geçti.');
