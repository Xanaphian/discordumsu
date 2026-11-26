// Duman sınaması: her sürümden önce (ve her PR'da) kendiliğinden çalışır.
// Sunucuyu ve uygulamayı gerçekten açar, ana ekranları gezer, rastgele tıklar; boş ekran, çökme kutusu
// ya da yakalanmamış hata görürse başarısız olur ve sürüm yayınlanmaz.
//
// Çalıştırma (önce derle):  npm run build && npm run build:server && node test/duman/duman.mjs
// Ekranı olmayan makinede:  xvfb-run -a node test/duman/duman.mjs
// Ek paket gerektirmez: tarayıcıya Chrome'un uzaktan denetim arayüzüyle (CDP), projedeki 'ws' paketi üzerinden bağlanır.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/duman/cikti');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duman-'));
const PORT = Number(process.env.DUMAN_PORT) || 47930;
const CDP = Number(process.env.DUMAN_CDP) || 9340;
const STEPS = Number(process.env.DUMAN_STEPS) || 120;
const SERVER = `http://127.0.0.1:${PORT}`;
const OWNER = { id: 'dumanowner01', name: 'Sınama', color: '#6cb6ff' };
const SECRET = 'd'.repeat(40);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const done = [];
let page = null;

function step(name) {
  done.push(name);
  console.log('✓ ' + name);
}
class Fail extends Error {}
const must = (cond, msg) => {
  if (!cond) throw new Fail(msg);
};
async function until(fn, msg, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Fail('Zaman aşımı: ' + msg);
    await sleep(150);
  }
}

// ---------- sunucu ----------
function startServer() {
  const p = spawn(process.execPath, [path.join(ROOT, 'server/paket/kovan-server.js')], {
    env: { ...process.env, KOVAN_PORT: String(PORT), KOVAN_DATA: path.join(TMP, 'data'), KOVAN_ADMINS: OWNER.id, KOVAN_UPLOAD_PER_10MIN: '3' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {});
  p.stderr.on('data', (d) => process.stderr.write('[sunucu] ' + d));
  procs.push(p);
  return until(() => fetch(SERVER + '/info').then((r) => r.ok), 'sunucu açılmadı');
}

/** Sunucuya sahte bir kişi olarak bağlanır */
function connect(user) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const waiters = new Map();
    let rid = 0;
    ws.frames = [];
    ws.on('message', (d) => {
      const f = JSON.parse(d);
      ws.frames.push(f);
      if (f.rid && waiters.has(f.rid)) {
        waiters.get(f.rid)(f);
        waiters.delete(f.rid);
      }
      if (f.t === 'ready') {
        ws.ready = f;
        res(ws);
      }
    });
    ws.on('error', rej);
    ws.req = (f) =>
      new Promise((r) => {
        const id = 'd' + ++rid;
        waiters.set(id, r);
        ws.send(JSON.stringify({ ...f, rid: id }));
        setTimeout(() => r({ t: 'timeout' }), 5000);
      });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', user, secret: SECRET, status: 'online', v: 1 })));
  });
}

const upload = (uid) =>
  fetch(SERVER + '/upload', { method: 'POST', headers: { 'content-type': 'text/plain', 'x-kovan-user': uid, 'x-kovan-secret': SECRET, 'x-kovan-name': 'not.txt' }, body: 'duman' });

/** Sunucu kuralları: uygulama açılmadan, doğrudan protokol üzerinden */
async function serverChecks() {
  const owner = await connect(OWNER);
  const r = await owner.req({ t: 'comm.create', name: 'Duman Topluluğu', color: '#6cb6ff', template: 'lobby' });
  must(r.t === 'ok' && r.data, 'topluluk kurulamadı: ' + JSON.stringify(r).slice(0, 200));
  const comm = (await until(async () => owner.frames.find((f) => f.t === 'comm' && f.c?.id === r.data), 'topluluk bilgisi gelmedi')).c;
  const text = comm.channels.filter((c) => c.type === 'text');
  const voice = comm.channels.filter((c) => c.type === 'voice');
  must(text.length && voice.length, 'şablonda yazı ve ses kanalı olmalı');
  owner.send(JSON.stringify({ t: 'comm.update', cid: comm.id, joinMessages: false }));

  const bots = [];
  for (let i = 0; i < 4; i++) {
    const b = await connect({ id: 'dumanuye' + i, name: 'Üye ' + i, color: '#3ecf8e' });
    const j = await b.req({ t: 'join', code: comm.inviteCode });
    must(j.t === 'ok', 'üye katılamadı: ' + JSON.stringify(j).slice(0, 200));
    bots.push(b);
  }
  for (let i = 0; i < 40; i++) bots[i % 4].send(JSON.stringify({ t: 'send', ch: text[i % text.length].id, nonce: 'n' + i, content: `duman mesajı ${i} **kalın** https://xanaphian.com/${i}` }));
  await sleep(400);
  step('sunucu: topluluk, üyeler ve mesajlar');

  // mesaj atmadan özel mesaj listesine girilmez
  const before = owner.frames.length;
  const d = await bots[0].req({ t: 'dm.open', to: OWNER.id });
  must(d.t === 'ok' && d.data?.ch, 'özel sohbet açılamadı');
  await sleep(300);
  must(!owner.frames.slice(before).some((f) => f.t === 'dm'), 'mesaj atılmadan açılan özel sohbet karşı tarafa bildirildi');
  bots[0].send(JSON.stringify({ t: 'send', ch: d.data.ch, nonce: 'dm1', content: 'selam' }));
  await until(async () => owner.frames.slice(before).some((f) => f.t === 'dm'), 'ilk mesajda özel sohbet karşı tarafa bildirilmedi', 4000);
  step('sunucu: özel sohbet ilk mesajda görünür');

  // hata bildirimi: herkes gönderebilir, yalnız yönetici görür
  const rep = await bots[1].req({ t: 'err.report', ver: '0.0.0', os: 'duman', items: [{ where: 'duman', msg: 'deneme hatası', stack: 'at deneme.js:1:1', at: Date.now() }] });
  must(rep.t === 'ok', 'hata bildirimi kabul edilmedi');
  must((await bots[1].req({ t: 'err.list' })).t === 'err', 'yönetici olmayan kişi hata bildirimlerini görebildi');
  const list = await owner.req({ t: 'err.list' });
  must(list.t === 'ok' && list.data?.some((x) => x.msg === 'deneme hatası'), 'yönetici hata bildirimini göremedi');
  must(!JSON.stringify(list.data).includes('dumanuye1'), 'hata bildiriminde gönderenin kimliği saklanmış');
  step('sunucu: hata bildirimi');

  // yükleme sınırı (bu sınamada 10 dakikada 3 dosya)
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await upload('dumanuye2')).status);
  must(codes.join() === '200,200,200,429', 'yükleme sınırı beklenen gibi değil: ' + codes.join());
  must((await upload('yok')).status === 401, 'kimliksiz yükleme reddedilmedi');
  step('sunucu: yükleme sınırı');

  // bozuk istek sunucuyu düşürmemeli
  await fetch(SERVER + '//').catch(() => {});
  await fetch(SERVER + '/f/%E0%A4%A/x').catch(() => {});
  must((await fetch(SERVER + '/info')).ok, 'bozuk istekten sonra sunucu yanıt vermiyor');
  step('sunucu: bozuk istek');

  owner.close();
  return { comm, text, voice, bots };
}

// ---------- uygulama (CDP) ----------
function electronPath() {
  const require = createRequire(import.meta.url);
  return require(path.join(ROOT, 'node_modules/electron'));
}

async function startApp(cid) {
  const ud = path.join(TMP, 'ud');
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(
    path.join(ud, 'kovan-config.json'),
    JSON.stringify({ profile: { ...OWNER, secret: SECRET, status: 'online' }, hosts: [], onboarded: true, settings: { railOrder: [cid], lookRev: 99 }, bounds: { x: 0, y: 0, width: 1400, height: 900 } }),
  );
  const args = [ROOT, '--no-sandbox', `--user-data-dir=${ud}`, `--remote-debugging-port=${CDP}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const p = spawn(electronPath(), args, { env: { ...process.env, KOVAN_SERVER: SERVER }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const keep = (d) => (log = (log + d).slice(-4000));
  p.stdout.on('data', keep);
  p.stderr.on('data', keep);
  p.on('exit', (c) => {
    if (!finished) console.error('Uygulama beklenmedik biçimde kapandı (kod ' + c + ')\n' + log);
  });
  procs.push(p);
  const target = await until(
    async () => (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page' && /index\.html/.test(t.url)),
    'uygulama penceresi açılmadı',
    40000,
  );
  return attach(target.webSocketDebuggerUrl);
}

function attach(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    const waiters = new Map();
    let id = 0;
    const cdp = { errors: [], ws };
    cdp.send = (method, params = {}) =>
      new Promise((ok, no) => {
        const i = ++id;
        waiters.set(i, { ok, no });
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    /** Sayfada bir ifade çalıştırır ve değerini döndürür */
    cdp.ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('Sayfa ifadesi hata verdi: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n' + expr.slice(0, 200));
      return r.result.value;
    };
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.id && waiters.has(m.id)) {
        const w = waiters.get(m.id);
        waiters.delete(m.id);
        if (m.error) w.no(new Error(m.error.message));
        else w.ok(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') {
        const e = m.params.exceptionDetails;
        cdp.errors.push((e.exception?.description || e.text || 'bilinmeyen hata').slice(0, 600));
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        // Çökme koruması hatayı yakalayıp pencereyi sessizce kapatabilir; kayda düşen satırdan anlaşılır
        const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (/bölümü çizilemedi|Açılış hatası/.test(text)) cdp.errors.push(text.slice(0, 600));
      }
    });
    ws.on('error', rej);
    ws.on('open', async () => {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      res(cdp);
    });
  });
}

const key = async (k, code = k, vk = 0) => {
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
};
const esc = () => key('Escape', 'Escape', 27);
const clickAt = async (x, y, button = 'left') => {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
};
/** Seçiciye (ve isteğe bağlı metne) uyan ilk görünür öğeye tıklar */
const click = (sel, text = '') =>
  page.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getClientRects().length && (!${JSON.stringify(text)} || (x.textContent + (x.getAttribute('aria-label') || '') + (x.title || '')).includes(${JSON.stringify(text)}))); if (!e) return false; e.click(); return true; })()`);
const count = (sel) => page.ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

/** Uygulama ayakta mı: pencere dolu, çökme kutusu yok, yakalanmamış hata yok */
async function healthy(where) {
  const s = await page.ev(`({ app: document.querySelector('.app')?.children.length || 0, box: [...document.querySelectorAll('.hata-kutu')].map((e) => e.innerText.slice(0, 80)) })`);
  must(s.app > 0, `${where}: pencere boş kaldı`);
  must(!s.box.length, `${where}: çökme kutusu göründü (${s.box.join(' / ')})`);
  must(!page.errors.length, `${where}: yakalanmamış hata\n${page.errors.join('\n')}`);
}

async function appChecks({ comm, text, voice, bots }) {
  await until(() => page.ev(`!!document.querySelector('.app .pt-btn')`), 'uygulama çizilmedi', 30000);
  await until(() => click('.pt-btn', comm.name), 'topluluk kenar çubuğunda yok', 20000);
  await until(() => count('.ch-row'), 'kanal listesi gelmedi');
  await healthy('açılış');
  step('uygulama: açılış ve topluluk');

  // kanallar arasında gezinme, mesajlar yükleniyor mu
  for (const c of text) {
    must(await click('.ch-row', c.name), `"${c.name}" kanalı listede yok`);
    await sleep(350);
  }
  await click('.ch-row', text[0].name);
  await until(() => count('.msg'), 'mesajlar yüklenmedi');
  await healthy('kanallar');
  step('uygulama: kanallar ve mesaj geçmişi');

  // mesaj yazıp gönderme, karşıdan gelen mesaj
  must(await page.ev(`(() => { const t = document.querySelector('.composer textarea'); if (!t) return false; t.focus(); return true; })()`), 'mesaj kutusu yok');
  await page.send('Input.insertText', { text: 'duman: uygulamadan gönderildi' });
  await key('Enter', 'Enter', 13);
  await until(() => page.ev(`[...document.querySelectorAll('.msg')].some((m) => m.textContent.includes('duman: uygulamadan gönderildi'))`), 'gönderilen mesaj listede görünmedi');
  bots[2].send(JSON.stringify({ t: 'send', ch: text[0].id, nonce: 'canli', content: 'duman: karşıdan geldi' }));
  await until(() => page.ev(`[...document.querySelectorAll('.msg')].some((m) => m.textContent.includes('duman: karşıdan geldi'))`), 'karşıdan gelen mesaj görünmedi').catch(async (e) => {
    // hata olursa nedenini anlamak için durumu yaz (ekranda ne var, sahte kişiye sunucudan ne döndü)
    const ekranda = await page.ev(`[...document.querySelectorAll('.msg')].slice(-4).map((m) => m.textContent.slice(0, 80)).join(' | ')`).catch(() => '?');
    console.error('Ekrandaki son mesajlar: ' + ekranda);
    console.error('Sahte kişinin son aldıkları: ' + JSON.stringify(bots[2].frames.slice(-5).map((f) => ({ t: f.t, error: f.error, ch: f.m?.channelId, c: f.m?.content }))));
    throw e;
  });
  await healthy('mesajlaşma');
  step('uygulama: mesaj gönderme ve alma');

  // kendi mesajını düzenleme (sağ tık > Mesajı düzenle) ve silme; karşı taraf da görmeli
  const msgAt = (txt) =>
    page.ev(`(() => { const m = [...document.querySelectorAll('.msg')].reverse().find((m) => m.textContent.includes(${JSON.stringify(txt)})); if (!m) return null; m.scrollIntoView({ block: 'center' }); const b = m.getBoundingClientRect(); return { x: b.left + Math.min(200, b.width / 2), y: b.top + b.height / 2 }; })()`);
  let at = await until(() => msgAt('duman: uygulamadan gönderildi'), 'gönderilen mesaj bulunamadı');
  await clickAt(at.x, at.y, 'right');
  must(await until(() => click('.ctx-item', 'Mesajı düzenle'), 'sağ tık menüsünde "Mesajı düzenle" yok', 4000), 'düzenleme açılamadı');
  await until(() => page.ev(`document.activeElement?.closest('.edit-box') ? true : false`), 'düzenleme kutusu açılmadı', 4000);
  await page.ev(`(() => { const t = document.activeElement; t.select(); return true; })()`);
  await page.send('Input.insertText', { text: 'duman: düzenlendi' });
  await key('Enter', 'Enter', 13);
  await until(() => page.ev(`[...document.querySelectorAll('.msg')].some((m) => m.textContent.includes('duman: düzenlendi'))`), 'düzenlenen mesaj ekranda değişmedi');
  await until(async () => bots[2].frames.some((f) => f.t === 'msg.upd' && f.m.content === 'duman: düzenlendi'), 'düzenleme diğer üyeye ulaşmadı', 4000);
  at = await msgAt('duman: düzenlendi');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  must(
    await until(
      () => page.ev(`(() => { const m = [...document.querySelectorAll('.msg')].reverse().find((m) => m.textContent.includes('duman: düzenlendi')); const b = m?.querySelector('.mt-btn.danger'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); return true; })()`),
      'mesajın sil düğmesi görünmedi',
      4000,
    ),
    'silinemedi',
  );
  await until(async () => !(await page.ev(`[...document.querySelectorAll('.msg')].some((m) => m.textContent.includes('duman: düzenlendi'))`)), 'silinen mesaj ekrandan gitmedi');
  await until(async () => bots[2].frames.some((f) => f.t === 'msg.del'), 'silme diğer üyeye ulaşmadı', 4000);
  await healthy('mesaj düzenleme ve silme');
  step('uygulama: mesaj düzenleme ve silme');

  // ses odası: başkaları odadayken gir, çık
  for (const b of bots.slice(0, 2)) b.send(JSON.stringify({ t: 'vc.join', ch: voice[0].id, muted: false, deaf: false }));
  await sleep(300);
  must(await click('.ch-row.room-voice', voice[0].name), 'ses odası listede yok');
  await until(() => count('[aria-label="Bağlantıyı kes"], .vp-leave, .vp-btn.danger'), 'sese bağlanılamadı');
  await sleep(1200);
  await healthy('ses odası');
  await click('.ch-row', text[0].name);
  await sleep(400);
  await healthy('sesteyken sohbet');
  must(await click('[aria-label="Bağlantıyı kes"], .vp-leave, .vp-btn.danger'), 'sesten çıkma düğmesi yok');
  await until(async () => !(await count('[aria-label="Bağlantıyı kes"], .vp-leave, .vp-btn.danger')), 'sesten çıkılamadı');
  for (const b of bots.slice(0, 2)) b.send(JSON.stringify({ t: 'vc.leave' }));
  step('uygulama: ses odasına girip çıkma');

  // ayarların bütün sekmeleri
  must(await click('.icon-btn', 'Ayarlar'), 'ayarlar düğmesi yok');
  await until(() => count('.sn-item'), 'ayarlar açılmadı');
  const tabs = await page.ev(`[...document.querySelectorAll('.sn-item:not(.danger)')].map((e) => e.textContent.trim())`);
  must(tabs.length >= 8, 'ayar sekmeleri eksik: ' + tabs.join(', '));
  for (const t of tabs) {
    await page.ev(`[...document.querySelectorAll('.sn-item:not(.danger)')].find((e) => e.textContent.trim() === ${JSON.stringify(t)})?.click()`);
    await sleep(300);
    await healthy('ayarlar > ' + t);
    must(await count('.sn-item'), `ayarlar > ${t}: ayarlar penceresi kendiliğinden kapandı`);
  }
  await esc();
  await sleep(300);
  step(`uygulama: ayarlar (${tabs.length} sekme)`);

  // ana sayfa bölümleri ve özel mesaj
  must(await click('.pt-home'), 'ana sayfa düğmesi yok');
  await sleep(600);
  for (const t of ['Arkadaşlar', 'Topluluklar', 'Sosyal']) {
    await click('.sidebar .ch-row, .sidebar .side-item, .sidebar button', t);
    await sleep(450);
    await healthy('ana sayfa > ' + t);
  }
  // etiketle arkadaş ekleme: Arkadaşlar > Arkadaş ekle > ad#kod; karşı taraf kabul edince listede görünür
  const friend = bots[3];
  const ftag = `Üye 3#${friend.ready.tag}`;
  await click('.sidebar .ch-row, .sidebar .side-item, .sidebar button', 'Arkadaşlar');
  must(await until(() => click('.fr-tab.add'), 'Arkadaş ekle sekmesi yok', 4000), 'arkadaş ekle açılamadı');
  must(await until(() => page.ev(`(() => { const i = document.querySelector('.tag-add-input'); if (!i) return false; i.focus(); return true; })()`), 'etiket kutusu yok', 4000), 'etiket kutusu yok');
  await page.send('Input.insertText', { text: ftag });
  await key('Enter', 'Enter', 13);
  await until(() => count('.tag-add.is-ok'), `"${ftag}" ile istek gönderilemedi: ` + 'ekranda başarı görünmedi', 6000);
  await until(async () => friend.frames.some((f) => f.t === 'friend' && f.f.user.id === OWNER.id && f.f.state === 'in'), 'istek karşı tarafa ulaşmadı', 4000);
  friend.send(JSON.stringify({ t: 'friend.accept', to: OWNER.id }));
  await page.ev(`[...document.querySelectorAll('.fr-tab')].find((b) => /Tümü|Çevrim/.test(b.textContent))?.click()`);
  await until(() => page.ev(`[...document.querySelectorAll('.fr-row')].some((r) => r.textContent.includes('Üye 3'))`), 'kabul edilen arkadaş listede görünmedi', 6000);
  await healthy('arkadaş ekleme');
  step('uygulama: etiketle arkadaş ekleme');

  must(await click('.sidebar .dm-row, .sidebar .ch-row', 'Üye 0'), 'mesaj atan kişi özel mesaj listesinde yok');
  await until(() => page.ev(`[...document.querySelectorAll('.msg')].some((m) => m.textContent.includes('selam'))`), 'özel mesaj açılmadı');
  await healthy('özel mesaj');
  step('uygulama: ana sayfa ve özel mesaj');

  // kişi kartı
  await click('.pt-btn', comm.name);
  await sleep(500);
  await click('.ch-row', text[0].name);
  await sleep(500);
  await click('.msg .msg-author, .msg .author, .msg .avatar');
  await sleep(600);
  await healthy('kişi kartı');
  await esc();
  await sleep(200);
  step('uygulama: kişi kartı');

  // ayarlar içinden açılan onay kutusu ayar penceresini kapatmamalı
  must(await click('.icon-btn', 'Ayarlar'), 'ayarlar düğmesi yok');
  await until(() => count('.settings'), 'ayarlar açılmadı');
  must(await click('.sn-item', 'Gelişmiş'), 'Gelişmiş sekmesi yok');
  await sleep(300);
  must(await click('button', 'Tercihleri sıfırla'), 'Tercihleri sıfırla düğmesi yok');
  await until(() => count('.modal.confirm'), 'onay kutusu açılmadı');
  must(await count('.settings'), 'onay kutusu açılınca ayarlar kapandı');
  // DUMAN_GORUNTU=1: bu ekranın görüntüsü de kaydedilir (test/duman/cikti)
  if (process.env.DUMAN_GORUNTU) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: 2, mobile: false });
    await sleep(400);
    await shot('ayarlarda-onay-kutusu.png');
    await page.send('Emulation.clearDeviceMetricsOverride');
  }
  await esc();
  await sleep(300);
  must(!(await count('.modal.confirm')), 'Esc onay kutusunu kapatmadı');
  must(await count('.settings'), 'Esc onay kutusuyla birlikte ayarları da kapattı');
  await healthy('ayarlarda onay kutusu');
  await esc();
  await until(async () => !(await count('.settings')), 'ayarlar Esc ile kapanmadı');
  step('uygulama: ayarlarda onay kutusu');

  await monkey();
}

/** Rastgele tıklama: aynı tohumla hep aynı sırayı izler */
async function monkey() {
  let seed = Number(process.env.DUMAN_SEED) || 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff);
  // geri alınamayan ya da pencereyi kapatan işlemlere dokunma
  const BAD = 'sil|ayrıl|çık|yasakla|\\\\bat\\\\b|kaldır|sıfırla|devret|engelle|uzaklaştır|kapat|taşı|temizle|çıkar|güncelle|denetle|yeniden başlat|yeniden yükle|ayrı pencere|pencerede aç|3d|bağlantı|indir|tarayıcı|kes';
  const hist = [];
  for (let i = 0; i < STEPS; i++) {
    const r = rnd();
    if (r < 0.14) {
      await esc();
      hist.push('ESC');
    } else {
      const t = await page.ev(`(() => {
        const bad = new RegExp(${JSON.stringify(BAD)}, 'i');
        const els = [...document.querySelectorAll('button, [role=button], .ch-row, .pt-btn, .sn-item, .ctx-item, .tab, .msg, .member, .dm-row')].filter((e) => {
          const b = e.getBoundingClientRect();
          if (b.width < 4 || b.height < 4 || b.top < 0 || b.left < 0 || b.bottom > innerHeight || b.right > innerWidth) return false;
          if (e.closest('.titlebar, .title-bar, a[href]')) return false;
          return !bad.test(e.textContent + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.title || '') + ' ' + e.className);
        });
        if (!els.length) return null;
        const e = els[Math.floor(${rnd()} * els.length)];
        const b = e.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, n: (e.className + '|' + (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)).slice(0, 60) };
      })()`);
      if (t) {
        const right = rnd() < 0.15;
        await clickAt(t.x, t.y, right ? 'right' : 'left');
        hist.push((right ? 'R:' : 'L:') + t.n);
      }
    }
    await sleep(110);
    if (i % 8 === 7) {
      await healthy(`rastgele tıklama, adım ${i + 1} (son adımlar: ${hist.slice(-8).join(' → ')})`);
      for (let k = 0; k < 3; k++) await esc();
      // dışarı çıkıldıysa (ör. açılır pencere) ana pencere hâlâ yanıt veriyor mu
      must((await page.ev('1 + 1')) === 2, 'pencere yanıt vermiyor');
    }
  }
  await sleep(500);
  await healthy('rastgele tıklama sonu');
  step(`uygulama: ${STEPS} adım rastgele tıklama`);
}

// ---------- akış ----------
let finished = false;
async function shot(name) {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const r = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  } catch {
    /* pencere yoksa görüntü de yok */
  }
}
function cleanup() {
  finished = true;
  for (const p of procs) {
    try {
      p.kill('SIGKILL');
    } catch {
      /* zaten kapalı */
    }
  }
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* geçici klasör silinemediyse sorun değil */
  }
}

const t0 = Date.now();
const guard = setTimeout(() => {
  console.error('✗ Sınama 6 dakikada bitmedi, durduruldu.');
  cleanup();
  process.exit(1);
}, 6 * 60_000);

try {
  must(fs.existsSync(path.join(ROOT, 'dist/renderer/index.html')), 'Önce derle: npm run build');
  must(fs.existsSync(path.join(ROOT, 'server/paket/kovan-server.js')), 'Önce sunucuyu derle: npm run build:server');
  await startServer();
  const ctx = await serverChecks();
  page = await startApp(ctx.comm.id);
  await appChecks(ctx);
  await shot('son.png');
  console.log(`\nDuman sınaması geçti: ${done.length} adım, ${Math.round((Date.now() - t0) / 1000)} sn.`);
  clearTimeout(guard);
  cleanup();
  process.exit(0);
} catch (e) {
  console.error('\n✗ Duman sınaması başarısız: ' + (e instanceof Fail ? e.message : e?.stack || e));
  console.error('Geçen adımlar: ' + (done.join(', ') || 'yok'));
  if (page) await shot('hata.png');
  clearTimeout(guard);
  cleanup();
  process.exit(1);
}
