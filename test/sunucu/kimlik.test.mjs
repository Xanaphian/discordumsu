// Giriş (kimlik doğrulama) ve bozuk girdi: sunucu yanlış anahtarla girişe izin vermemeli, bozuk çerçevede düşmemeli.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import net from 'node:net';
import WebSocket from 'ws';
import { connect, login, person, settle, sleep, startServer } from '../ortak/sunucu.mjs';

let srv;
before(async () => (srv = await startServer()));
after(() => srv?.stop());

describe('giriş ve kayıt', () => {
  test('yeni hesap ilk bağlantıda kaydolur, ready ile kendi kimliğini alır', async () => {
    const p = person('Yeni');
    const ws = await connect(srv, p);
    assert.equal(ws.ready.me, p.user.id);
    ws.close();
  });

  test('aynı kimlik doğru anahtarla yeniden girebilir, ad#kod etiketi korunur', async () => {
    const p = person('Geri');
    const a = await connect(srv, p);
    const tag1 = (await a.req({ t: 'tag.set', code: 'GR7' })).data;
    assert.equal(tag1, 'GR7');
    a.close();
    const b = await connect(srv, p);
    assert.equal(b.ready.me, p.user.id);
    // aynı etiketi yeniden istemek "zaten senin" olarak kabul edilir
    assert.equal((await b.req({ t: 'tag.set', code: 'GR7' })).t, 'ok');
    b.close();
  });

  test('aynı kimlik YANLIŞ anahtarla giremez ve bağlantısı kapanır', async () => {
    const p = person('Kurban');
    (await connect(srv, p)).close();
    const thief = { user: p.user, secret: 'x'.repeat(48) };
    await assert.rejects(connect(srv, thief), /Bağlantı kapandı \(4001\)/);
  });

  test('kısa anahtar ya da boş kimlik reddedilir', async () => {
    const p = person('Kısa');
    await assert.rejects(
      (async () => {
        const ws = await connect(srv, { ...p, secret: 'kisa' }, { hello: false });
        ws.out({ t: 'hello', user: p.user, secret: 'kisa', status: 'online', v: 1 });
        await ws.wait((f) => f.t === 'ready', 800);
      })(),
      /gelmedi/,
    );
    const ws = await connect(srv, p, { hello: false });
    const from = ws.frames.length;
    ws.out({ t: 'hello', user: { name: 'kimliksiz' }, secret: 'y'.repeat(32), status: 'online', v: 1 });
    const e = await ws.wait((f) => f.t === 'err', 2000, from);
    assert.match(e.msg, /Geçersiz kimlik/);
    ws.close();
  });

  test('giriş yapmadan gönderilen çerçeve işlenmez', async () => {
    const ws = await connect(srv, person('Anonim'), { hello: false });
    ws.out({ t: 'comm.create', name: 'izinsiz', color: '#000000', rid: 'x' });
    const e = await ws.wait((f) => f.t === 'err');
    assert.match(e.msg, /kimlik doğrulaması/);
    ws.close();
  });

  test('yükleme: yanlış anahtar ve bilinmeyen kişi 401 alır', async () => {
    const p = person('Yükleyen');
    (await connect(srv, p)).close();
    const up = (uid, secret) =>
      fetch(srv.url + '/upload', { method: 'POST', headers: { 'content-type': 'text/plain', 'x-kovan-user': uid, 'x-kovan-secret': secret }, body: 'merhaba' });
    assert.equal((await up(p.user.id, p.secret)).status, 200);
    assert.equal((await up(p.user.id, 'z'.repeat(48))).status, 401);
    assert.equal((await up('olmayankisi', p.secret)).status, 401);
  });

  test('yüklenen dosya HTML olarak sunulmaz (tarayıcıda betik çalışmasın)', async () => {
    const p = person('Html');
    (await connect(srv, p)).close();
    const r = await fetch(srv.url + '/upload', {
      method: 'POST',
      headers: { 'content-type': 'text/html', 'x-kovan-user': p.user.id, 'x-kovan-secret': p.secret, 'x-kovan-name': 'a.html' },
      body: '<script>alert(1)</script>',
    });
    const att = await r.json();
    const g = await fetch(srv.url + att.url);
    assert.equal(g.headers.get('content-type'), 'application/octet-stream');
    assert.equal(g.headers.get('content-disposition'), 'attachment');
    assert.equal(g.headers.get('x-content-type-options'), 'nosniff');
  });

  test('yüklenen dosyanın adresi tahmin edilemez (uzun, rastgele kimlik)', async () => {
    const p = person('Rastgele');
    (await connect(srv, p)).close();
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const r = await fetch(srv.url + '/upload', { method: 'POST', headers: { 'content-type': 'text/plain', 'x-kovan-user': p.user.id, 'x-kovan-secret': p.secret }, body: 'x' + i });
      ids.push((await r.json()).id);
    }
    for (const id of ids) assert.match(id, /^[a-z0-9]{38}$/);
    // aynı anda yüklenen iki dosyanın zamandan sonraki kısmı tamamen farklıdır
    assert.notEqual(ids[0].slice(9), ids[1].slice(9));
  });

  test('dosya adresinde klasör dışına çıkılamaz', async () => {
    for (const bad of ['/f/..%2F..%2Fhub.json/x', '/f/../hub.json', '/f/%2e%2e/hub.json']) {
      const r = await fetch(srv.url + bad);
      assert.equal(r.status, 404, bad);
    }
  });
});

describe('bozuk girdi sunucuyu düşürmez', () => {
  test('JSON olmayan, null, sayı, dizi ve türü yanlış çerçeveler', async () => {
    const ws = await login(srv, 'Bozuk');
    for (const raw of ['{', 'null', '5', '"metin"', '[]', 'true', '{"t":5}', '{"t":null}', '{}']) ws.send(raw);
    // türü yanlış alanlar
    for (const f of [
      { t: 'send', ch: { x: 1 }, content: 'a', nonce: 'n' },
      { t: 'send', ch: 'yok', content: { a: 1 }, nonce: 'n' },
      { t: 'edit', ch: ['a'], id: null, content: 5 },
      { t: 'vc.join', ch: 12 },
      { t: 'dm.open', to: { id: 1 }, rid: 'q' },
      { t: 'friend.tag', tag: ['a#1'], rid: 'w' },
      { t: 'join', code: 7, rid: 'e' },
      { t: 'comm.update', cid: null, name: {} },
      { t: 'profile', user: null },
      { t: 'hist', ch: null, rid: 'h' },
    ])
      ws.out(f);
    await sleep(200);
    assert.ok(srv.alive(), 'sunucu süreci kapandı:\n' + srv.log());
    await ws.sync();
    // aynı bağlantı hâlâ çalışıyor
    const r = await ws.req({ t: 'comm.create', name: 'Hâlâ ayakta', color: '#123456' });
    assert.equal(r.t, 'ok');
    ws.close();
  });

  test('çok büyük çerçeve bağlantıyı kapatır ama sunucu ayakta kalır', async () => {
    const ws = await login(srv, 'Büyük');
    const closed = new Promise((r) => ws.once('close', r));
    ws.send(JSON.stringify({ t: 'send', ch: 'x', nonce: 'n', content: 'a'.repeat(9 * 1024 * 1024) }));
    await closed;
    const ok = await login(srv, 'Sonraki');
    assert.ok(ok.ready);
    ok.close();
  });

  test('çok hızlı çerçeve yağmuru yavaşlatılır', async () => {
    const ws = await login(srv, 'Hızlı');
    const from = ws.frames.length;
    for (let i = 0; i < 80; i++) ws.out({ t: 'typing', ch: 'yok' });
    const e = await ws.wait((f) => f.t === 'err' && /yavaşla/.test(f.msg), 3000, from);
    assert.ok(e);
    ws.close();
  });

  test('bozuk HTTP istekleri', async () => {
    const raw = (s) =>
      new Promise((res) => {
        const sock = new net.Socket();
        sock.connect(srv.port, '127.0.0.1', () => sock.end(s));
        sock.on('data', () => {});
        sock.on('close', res);
        sock.on('error', res);
      });
    await raw('GET // HTTP/1.1\r\nHost: x\r\n\r\n');
    await raw('GET /f/%E0%A4%A/x HTTP/1.1\r\nHost: x\r\n\r\n');
    await raw('POST /upload HTTP/1.1\r\nHost: x\r\nContent-Length: abc\r\n\r\n');
    await raw('\x00\x01\x02 çöp\r\n\r\n');
    await fetch(srv.url + '/upload', { method: 'POST', headers: { 'x-kovan-user': '%%%', 'x-kovan-secret': '\u0000' }, body: '' }).catch(() => {});
    assert.ok((await fetch(srv.url + '/info')).ok);
    assert.ok(srv.alive());
  });

  test('WebSocket yolu dışında yükseltme isteği reddedilir', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/baska`);
    const r = await new Promise((res) => {
      ws.on('open', () => res('açıldı'));
      ws.on('error', () => res('reddedildi'));
    });
    assert.equal(r, 'reddedildi');
  });
});

