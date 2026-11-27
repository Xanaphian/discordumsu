// v1.67 güvenlik ekleri: hesap anahtarını yenileme ve bağlantı önizlemesinin sunucudan getirilmesi.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import crypto from 'node:crypto';
import http from 'node:http';
import { connect, person, sleep, startServer } from '../ortak/sunucu.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PAGE = `<!doctype html><html><head><title>Yedek başlık</title>
<meta property="og:title" content="Deneme &amp; başlık">
<meta property="og:description" content="Açıklama yazısı">
<meta property="og:site_name" content="Örnek Site">
<meta name="theme-color" content="#c8aa6e">
<meta property="og:image" content="/kapak.png">
</head><body>merhaba</body></html>`;

let srv, mirror, mirrorUrl;
const asked = [];
before(async () => {
  // sahte "internet": sunucu sayfaları buradan alır (KOVAN_LINK_MIRROR yalnız sınama içindir)
  mirror = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x').searchParams.get('u') || '';
    asked.push(u);
    res.setHeader('connection', 'close'); // bekleyen bağlantı yeniden kullanılırken kapanıp isteği yutmasın
    if (u.endsWith('/kapak.png') || u.endsWith('/resim.png')) return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    if (u.endsWith('/betik.svg')) return res.writeHead(200, { 'content-type': 'image/svg+xml' }).end('<svg xmlns="http://www.w3.org/2000/svg"/>');
    if (u.endsWith('/yok')) return res.writeHead(404).end();
    if (u.endsWith('/dosya.zip')) return res.writeHead(200, { 'content-type': 'application/zip' }).end('PK');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  });
  await new Promise((r) => mirror.listen(0, '127.0.0.1', r));
  mirrorUrl = `http://127.0.0.1:${mirror.address().port}`;
  srv = await startServer({ KOVAN_LINK_MIRROR: mirrorUrl });
});
after(async () => {
  await srv?.stop();
  mirror?.close();
});

describe('hesap anahtarını yenileme', () => {
  test('sunucu özelliği duyurur', async () => {
    const ws = await connect(srv, person('Özellik'));
    assert.ok(ws.ready.feats.includes('rekey'));
    assert.ok(ws.ready.feats.includes('onizleme'));
    ws.close();
  });

  test('yenileyince eski anahtar geçersiz olur, yeni anahtarla girilir, öbür oturum kapanır', async () => {
    const p = person('Yenile');
    const a = await connect(srv, p);
    const other = await connect(srv, p); // aynı hesabın başka cihazdaki oturumu
    const fresh = crypto.randomBytes(32).toString('hex');
    assert.equal((await a.req({ t: 'rekey', secret: fresh })).t, 'ok');
    await sleep(150);
    assert.equal(other.closedWith, 4003, 'öbür oturum kapatılmalı');
    assert.equal(a.closedWith, undefined, 'yenileyen oturum açık kalmalı');
    await assert.rejects(connect(srv, p), /Bağlantı kapandı \(4001\)/, 'eski anahtar artık geçmemeli');
    const b = await connect(srv, { user: p.user, secret: fresh });
    assert.equal(b.ready.me, p.user.id);
    a.close();
    b.close();
  });

  test('yeni anahtar sunucu yeniden başlayınca da geçerli (hemen diske yazılır)', async () => {
    const p = person('Kalıcı');
    const a = await connect(srv, p);
    const fresh = crypto.randomBytes(32).toString('hex');
    assert.equal((await a.req({ t: 'rekey', secret: fresh })).t, 'ok');
    await srv.restart();
    await assert.rejects(connect(srv, p), /Bağlantı kapandı \(4001\)/);
    (await connect(srv, { user: p.user, secret: fresh })).close();
  });

  test('kısa anahtar reddedilir, eski anahtar geçerli kalır', async () => {
    const p = person('Kısa');
    const a = await connect(srv, p);
    assert.equal((await a.req({ t: 'rekey', secret: 'kisa' })).t, 'err');
    assert.equal((await a.req({ t: 'rekey', secret: 12345 })).t, 'err');
    a.close();
    (await connect(srv, p)).close();
  });

  test('bir saatte en çok 6 kez yenilenebilir', async () => {
    const p = person('Çok');
    const a = await connect(srv, p);
    const got = [];
    for (let i = 0; i < 8; i++) got.push((await a.req({ t: 'rekey', secret: crypto.randomBytes(32).toString('hex') })).t);
    assert.deepEqual(got, ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'err', 'err']);
    a.close();
  });
});

describe('bağlantı önizlemesi sunucudan', () => {
  test('sayfanın başlığı, açıklaması, rengi ve görseli döner', async () => {
    const ws = await connect(srv, person('Önizle'));
    const r = await ws.req({ t: 'link.meta', url: 'https://ornek.example/yazi' });
    assert.equal(r.t, 'ok');
    assert.equal(r.data.title, 'Deneme & başlık');
    assert.equal(r.data.desc, 'Açıklama yazısı');
    assert.equal(r.data.site, 'Örnek Site');
    assert.equal(r.data.color, '#c8aa6e');
    assert.match(r.data.image, /^data:image\/png;base64,/);
    assert.ok(asked.includes('https://ornek.example/kapak.png'), 'görsel sayfanın adresine göre çözülmeli');
    ws.close();
  });

  test('aynı adres ikinci kez istenince yeniden getirilmez', async () => {
    const ws = await connect(srv, person('Bellek'));
    const url = 'https://ornek.example/tek-sefer';
    await ws.req({ t: 'link.meta', url });
    const n = asked.filter((u) => u === url).length;
    await ws.req({ t: 'link.meta', url });
    assert.equal(asked.filter((u) => u === url).length, n);
    assert.equal(n, 1);
    ws.close();
  });

  test('doğrudan görsel adresi görsel olarak döner; SVG, 404 ve dosya önizlenmez', async () => {
    const ws = await connect(srv, person('Görsel'));
    const img = (await ws.req({ t: 'link.meta', url: 'https://ornek.example/resim.png' })).data;
    assert.equal(img.direct, true);
    assert.match(img.image, /^data:image\/png;base64,/);
    assert.equal((await ws.req({ t: 'link.meta', url: 'https://ornek.example/betik.svg' })).data, null);
    assert.equal((await ws.req({ t: 'link.meta', url: 'https://ornek.example/yok' })).data, null);
    assert.equal((await ws.req({ t: 'link.meta', url: 'https://ornek.example/dosya.zip' })).data, null);
    ws.close();
  });

  test('http(s) olmayan, çok uzun ya da bozuk adres için istek atılmaz', async () => {
    const ws = await connect(srv, person('Bozuk'));
    const before = asked.length;
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://ornek.example/a', 'https://ornek.example/' + 'a'.repeat(2100), 42, null, { a: 1 }])
      assert.equal((await ws.req({ t: 'link.meta', url })).data, null);
    assert.equal(asked.length, before);
    ws.close();
  });

  test('kişi başına dakikada 40 yeni adresle sınırlı', async () => {
    const ws = await connect(srv, person('Yağmur'));
    let ok = 0;
    let err = 0;
    try {
      for (let i = 0; i < 46; i++) {
        const r = await ws.req({ t: 'link.meta', url: `https://ornek.example/sayfa-${i}` });
        if (r.t === 'ok') ok++;
        else err++;
        await sleep(140); // genel çerçeve hız sınırına (5 sn'de 40) takılmamak için
      }
    } finally {
      ws.close();
    }
    assert.equal(ok, 40);
    assert.equal(err, 6);
  });
});

describe('önizleme: gerçek sunucuda iç ağ korunur', () => {
  test('ayna yokken bu makineye ve iç ağa giden adresler getirilmez', async () => {
    const real = await startServer();
    try {
      const ws = await connect(real, person('İçAğ'));
      for (const url of [mirrorUrl + '/', 'http://localhost:3100/', 'http://127.0.0.1:3100/', 'http://192.168.1.1/', 'http://10.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/'])
        assert.equal((await ws.req({ t: 'link.meta', url }, 12000)).data, null, url);
      ws.close();
    } finally {
      await real.stop();
    }
  });
});
