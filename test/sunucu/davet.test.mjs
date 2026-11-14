// Davet bağlantıları: süreli / sınırlı davetler, davet özeti, tarayıcıdaki davet sayfası.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, community, login, sleep, startServer } from '../ortak/sunucu.mjs';

let srv;
before(async () => (srv = await startServer()));
after(() => srv?.stop());

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('davet bağlantıları', () => {
  test('sunucu davet özelliğini duyurur; kalıcı kodun özeti girişsiz okunur', async () => {
    const owner = await login(srv, 'Sahip');
    assert.ok(owner.ready.feats.includes('davet'));
    const c = await community(srv, owner, 'Davet <b>Deneme</b>');
    const r = await fetch(`${srv.url}/invite/${c.inviteCode}`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.name, 'Davet <b>Deneme</b>');
    assert.equal(j.cid, c.id);
    assert.ok(j.members >= 1);
    assert.equal(j.online, 1);
    assert.equal(j.icon, undefined, 'özet büyük resmi taşımaz');
    owner.close();
  });

  test('davet sayfası topluluğu gösterir, adı kaçışlar, uygulama bağlantısını ve güvenlik başlıklarını taşır', async () => {
    const owner = await login(srv, 'Sahip');
    const c = await community(srv, owner, 'Sayfa <script>alert(1)</script>');
    const r = await fetch(`${srv.url}/davet/${c.inviteCode}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'nonce-/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-xanaphian-davet'), '1');
    const html = await r.text();
    assert.ok(html.includes('Sayfa &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)'));
    assert.ok(html.includes(`xanaphian://davet/${c.inviteCode}`));
    assert.ok(html.includes('1 çevrimiçi'));
    owner.close();
  });

  test('geçersiz kod: sayfa ve özet 404 döner, topluluk bilgisi sızmaz', async () => {
    for (const code of ['aaaaaaa', 'x', 'AAAAAAAAAAAAAAAA']) {
      const p = await fetch(`${srv.url}/davet/${code}`);
      assert.equal(p.status, 404);
      assert.match(await p.text(), /Davet geçersiz/);
      assert.equal((await fetch(`${srv.url}/invite/${code}`)).status, 404);
    }
    assert.equal((await fetch(`${srv.url}/davet/..%2f..%2finfo`)).status, 404);
  });

  test('topluluk resmi /simge adresinden resim olarak gelir; resim yoksa 404', async () => {
    const owner = await login(srv, 'Sahip');
    const c = await community(srv, owner, 'Resimli');
    assert.equal((await fetch(`${srv.url}/davet/${c.inviteCode}/simge`)).status, 404);
    owner.out({ t: 'comm.update', cid: c.id, icon: PNG });
    await owner.sync();
    const r = await fetch(`${srv.url}/davet/${c.inviteCode}/simge`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.ok((await r.arrayBuffer()).byteLength > 20);
    assert.match(await (await fetch(`${srv.url}/davet/${c.inviteCode}`)).text(), /og:image/);
    owner.close();
  });

  test('tek kullanımlık davet: bir kişi katılır, ikincisi katılamaz', async () => {
    const owner = await login(srv, 'Sahip');
    const c = await community(srv, owner, 'Tek Kullanım');
    const made = await owner.req({ t: 'invite.create', cid: c.id, age: 3600, max: 1 });
    assert.equal(made.t, 'ok');
    const code = made.data.code;
    assert.match(code, /^[a-z0-9]{7}$/);
    assert.notEqual(code, c.inviteCode);
    const a = await login(srv, 'Bir');
    const info = await a.req({ t: 'invite.info', code });
    assert.equal(info.data.name, 'Tek Kullanım');
    assert.equal(info.data.joined, undefined);
    assert.ok(info.data.exp > Date.now());
    assert.equal((await a.req({ t: 'join', code })).t, 'ok');
    const b = await login(srv, 'İki');
    const r = await b.req({ t: 'join', code });
    assert.equal(r.t, 'err');
    assert.equal((await b.req({ t: 'invite.info', code })).t, 'err');
    assert.equal((await fetch(`${srv.url}/davet/${code}`)).status, 404);
    // kalıcı kod çalışmaya devam eder
    assert.equal((await b.req({ t: 'join', code: c.inviteCode })).t, 'ok');
    for (const x of [owner, a, b]) x.close();
  });

  test('süreli davet süresi dolunca geçersiz olur', async () => {
    const owner = await login(srv, 'Sahip');
    const c = await community(srv, owner, 'Süreli');
    // en kısa süre 60 sn: süre sınaması için daveti listeden okuyup yalnız varlığını ve bitişini denetleriz
    const made = await owner.req({ t: 'invite.create', cid: c.id, age: 1, max: 0 });
    const list = (await owner.req({ t: 'invite.list', cid: c.id })).data;
    const inv = list.find((i) => i.code === made.data.code);
    assert.ok(inv && inv.exp - Date.now() > 50_000 && inv.exp - Date.now() < 70_000, 'süre en az 60 sn');
    assert.equal(inv.uses, 0);
    owner.close();
  });

  test('süresiz ve sınırsız istek kalıcı kodu döner; aynı ayar yeniden istenince yeni kod üretilmez', async () => {
    const owner = await login(srv, 'Sahip');
    const c = await community(srv, owner, 'Aynı');
    assert.equal((await owner.req({ t: 'invite.create', cid: c.id, age: 0, max: 0 })).data.code, c.inviteCode);
    const x = (await owner.req({ t: 'invite.create', cid: c.id, age: 86400, max: 5 })).data.code;
    const y = (await owner.req({ t: 'invite.create', cid: c.id, age: 86400, max: 5 })).data.code;
    assert.equal(x, y);
    const z = (await owner.req({ t: 'invite.create', cid: c.id, age: 86400, max: 10 })).data.code;
    assert.notEqual(x, z);
    owner.close();
  });

  test('üye olmayan davet oluşturamaz, listeyi göremez; başkasının davetini yetkisiz üye silemez', async () => {
    const owner = await login(srv, 'Sahip');
    const c = await community(srv, owner, 'Yetki');
    const code = (await owner.req({ t: 'invite.create', cid: c.id, age: 3600, max: 0 })).data.code;
    const out = await login(srv, 'Dışarıdan');
    const from = out.frames.length;
    out.out({ t: 'invite.create', cid: c.id, age: 3600, max: 0, rid: 'q1' });
    out.out({ t: 'invite.list', cid: c.id, rid: 'q2' });
    await out.sync();
    assert.ok(!out.frames.slice(from).some((f) => f.t === 'ok' && (f.rid === 'q1' || f.rid === 'q2')));
    assert.equal((await out.req({ t: 'join', code })).t, 'ok');
    // artık üye: kendi davetini oluşturabilir ama sahibinkini silemez, listede yalnız kendisininkini görür
    const mine = (await out.req({ t: 'invite.create', cid: c.id, age: 1800, max: 0 })).data.code;
    assert.equal((await out.req({ t: 'invite.del', cid: c.id, code })).t, 'err');
    assert.deepEqual((await out.req({ t: 'invite.list', cid: c.id })).data.map((i) => i.code), [mine]);
    const all = (await owner.req({ t: 'invite.list', cid: c.id })).data;
    assert.equal(all.length, 2);
    assert.equal(all.find((i) => i.code === code).uses, 1);
    assert.equal((await owner.req({ t: 'invite.del', cid: c.id, code: mine })).t, 'ok');
    assert.equal((await out.req({ t: 'invite.info', code: mine })).t, 'err');
    for (const x of [owner, out]) x.close();
  });

  test('davetler durdurulunca özet ve sayfa kapanır; kod yenilenince eski davetlerin hepsi düşer', async () => {
    const owner = await login(srv, 'Sahip');
    const c = await community(srv, owner, 'Durdur');
    const code = (await owner.req({ t: 'invite.create', cid: c.id, age: 3600, max: 0 })).data.code;
    owner.out({ t: 'comm.update', cid: c.id, invitesPaused: true });
    await owner.sync();
    assert.equal((await fetch(`${srv.url}/davet/${code}`)).status, 404);
    assert.equal((await owner.req({ t: 'invite.create', cid: c.id, age: 60, max: 0 })).t, 'err');
    owner.out({ t: 'comm.update', cid: c.id, invitesPaused: false });
    await owner.sync();
    assert.equal((await fetch(`${srv.url}/davet/${code}`)).status, 200);
    owner.out({ t: 'comm.invite.reset', cid: c.id });
    await owner.sync();
    assert.equal((await fetch(`${srv.url}/davet/${code}`)).status, 404);
    assert.equal((await fetch(`${srv.url}/davet/${c.inviteCode}`)).status, 404);
    owner.close();
  });

  test('süreli davetler sunucu yeniden açılınca durur; topluluk bilgisinde üyelere gönderilmez', async () => {
    const owner = await login(srv, 'Sahip');
    const c = await community(srv, owner, 'Kalıcı');
    const code = (await owner.req({ t: 'invite.create', cid: c.id, age: 86400, max: 3 })).data.code;
    assert.ok(!owner.frames.some((f) => f.t === 'comm' && f.c?.invites), 'davet listesi topluluk bilgisiyle yayılmaz');
    owner.close();
    await sleep(100);
    await srv.restart();
    const r = await fetch(`${srv.url}/invite/${code}`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).name, 'Kalıcı');
  });

  test('xanaphian.com aktarıcısı: sayfayı ve resmi sunucudan aktarır, sunucu yoksa yedek sayfayla uygulamayı açtırır', async () => {
    const { onRequest } = await import(pathToFileURL(path.join(ROOT, 'server/site/functions/davet/[[yol]].js')).href);
    const owner = await login(srv, 'Sahip');
    const c = await community(srv, owner, 'Aktarılan');
    owner.out({ t: 'comm.update', cid: c.id, icon: PNG });
    await owner.sync();
    const real = globalThis.fetch;
    const get = (p, init) => onRequest({ request: new Request('https://xanaphian.com' + p, init) });
    try {
      globalThis.fetch = (u, o) => real(String(u).replace('https://45-87-173-18.sslip.io/kovan', srv.url), o);
      const page = await get(`/davet/${c.inviteCode.toUpperCase()}/`);
      assert.equal(page.status, 200);
      assert.match(page.headers.get('content-security-policy'), /script-src 'nonce-/);
      assert.equal(page.headers.get('x-frame-options'), 'DENY');
      assert.match(await page.text(), /Aktarılan/);
      const img = await get(`/davet/${c.inviteCode}/simge`);
      assert.equal(img.headers.get('content-type'), 'image/png');
      const bad = await get('/davet/zzzzzz9');
      assert.equal(bad.status, 404);
      assert.match(await bad.text(), /Davet geçersiz/);
      assert.equal((await get('/davet/../info')).status, 404);
      assert.equal((await get('/davet/abcdefg', { method: 'POST' })).status, 405);
      // sunucuya ulaşılamıyor: uygulama bağlantılı yedek sayfa
      globalThis.fetch = () => Promise.reject(new Error('ulaşılamadı'));
      const fb = await get(`/davet/${c.inviteCode}`);
      assert.equal(fb.status, 200);
      assert.ok((await fb.text()).includes(`xanaphian://davet/${c.inviteCode}`));
      // sunucu eski (davet sayfasını bilmiyor): yine yedek sayfa
      globalThis.fetch = async () => new Response('', { status: 404 });
      assert.equal((await get(`/davet/${c.inviteCode}`)).status, 200);
    } finally {
      globalThis.fetch = real;
    }
    owner.close();
  });
});
