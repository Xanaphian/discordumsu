// v1.68 hesap girişi: e-posta / kullanıcı adı + şifre, cihaz anahtarı, QR ile giriş, hız sınırı, şifre değişince çıkış.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { connect, person, sleep, startServer } from '../ortak/sunucu.mjs';

let srv;
before(async () => (srv = await startServer()));
after(() => srv?.stop());

const post = async (p, body) => {
  const r = await fetch(srv.url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { code: r.status, body: await r.json().catch(() => ({})) };
};
let n = 0;
async function kayitli(sifre = 'Gizli-sifre-1') {
  const p = person('Giriş');
  const ws = await connect(srv, p);
  const k = 'kisi' + Date.now().toString(36) + ++n;
  const r = await ws.req({ t: 'auth.set', email: `${k}@ornek.com`, username: k, password: sifre });
  assert.equal(r.t, 'ok', r.msg);
  return { p, ws, email: `${k}@ornek.com`, user: k, sifre };
}

describe('şifreyle giriş', () => {
  test('sunucu girişi destekliyor (feats)', async () => {
    const ws = await connect(srv, person('Feat'));
    assert.ok(ws.ready.feats.includes('giris'));
    ws.close();
  });

  test('e-posta ve kullanıcı adıyla giriş yapılır, cihaz anahtarı hesaba bağlanır, asıl anahtar çalışmaya devam eder', async () => {
    const h = await kayitli();
    const me = await h.ws.req({ t: 'auth.me' });
    assert.equal(me.data.hasPassword, true);
    assert.equal(me.data.username, h.user);
    for (const login of [h.email, h.user.toUpperCase(), '@' + h.user]) {
      const r = await post('/auth/login', { login, password: h.sifre, device: 'Sınama' });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.id, h.p.user.id);
      assert.equal(r.body.user.name, h.p.user.name);
      const yeni = await connect(srv, { user: { ...r.body.user, id: r.body.id }, secret: r.body.secret });
      assert.equal(yeni.ready.me, h.p.user.id);
      yeni.close();
    }
    h.ws.close();
    // asıl cihaz hâlâ girebilir (anahtar değişmedi)
    const eski = await connect(srv, h.p);
    assert.equal((await eski.req({ t: 'auth.me' })).data.devices, 3);
    eski.close();
  });

  test('yanlış şifre ve olmayan hesap aynı hatayı alır; çok deneme hız sınırına takılır', async () => {
    const h = await kayitli();
    const a = await post('/auth/login', { login: h.user, password: 'yanlis-sifre-9' });
    const b = await post('/auth/login', { login: 'boyle-biri-yok', password: 'yanlis-sifre-9' });
    assert.equal(a.code, 401);
    assert.equal(b.code, 401);
    assert.equal(a.body.msg, b.body.msg);
    let son = 0;
    for (let i = 0; i < 9; i++) son = (await post('/auth/login', { login: h.user, password: 'yanlis-' + i + 'abcd' })).code;
    assert.equal(son, 429);
    // doğru şifre de sınır bitene kadar bekler
    assert.equal((await post('/auth/login', { login: h.user, password: h.sifre })).code, 429);
    h.ws.close();
  });

  test('alınmış e-posta / kullanıcı adı ve zayıf şifre reddedilir; değiştirmek için şu anki şifre gerekir', async () => {
    const h = await kayitli();
    const p2 = await connect(srv, person('İkinci'));
    assert.match((await p2.req({ t: 'auth.set', email: h.email, username: 'baskaad' + n, password: 'Gizli-sifre-1' })).msg, /e-posta/);
    assert.match((await p2.req({ t: 'auth.set', email: 'x' + n + '@ornek.com', username: h.user, password: 'Gizli-sifre-1' })).msg, /alınmış/);
    assert.match((await p2.req({ t: 'auth.set', email: 'y' + n + '@ornek.com', username: 'yeniad' + n, password: '12345678' })).msg, /kolay/);
    assert.match((await h.ws.req({ t: 'auth.set', password: 'Yeni-sifre-22' })).msg, /yanlış/);
    assert.equal((await h.ws.req({ t: 'auth.set', password: 'Yeni-sifre-22', current: h.sifre })).t, 'ok');
    assert.equal((await post('/auth/login', { login: h.user, password: h.sifre })).code, 401);
    assert.equal((await post('/auth/login', { login: h.user, password: 'Yeni-sifre-22' })).code, 200);
    h.ws.close();
    p2.close();
  });

  test('şifre değişince şifreyle giriş yapmış diğer cihaz çıkar', async () => {
    const h = await kayitli();
    const r = await post('/auth/login', { login: h.email, password: h.sifre });
    const kim = { user: { ...r.body.user, id: r.body.id }, secret: r.body.secret };
    const diger = await connect(srv, kim);
    const kapandi = new Promise((res) => diger.once('close', (c) => res(c)));
    assert.equal((await h.ws.req({ t: 'auth.set', password: 'Baska-sifre-33', current: h.sifre })).t, 'ok');
    assert.equal(await kapandi, 4001);
    await assert.rejects(connect(srv, kim), /4001/);
    h.ws.close();
  });

  test('şifre ayarı kaydedilir: sunucu yeniden açılınca giriş ve cihaz anahtarı çalışır', async () => {
    const h = await kayitli();
    const r = await post('/auth/login', { login: h.user, password: h.sifre });
    h.ws.close();
    await srv.restart();
    assert.equal((await post('/auth/login', { login: h.email, password: h.sifre })).code, 200);
    const c = await connect(srv, { user: { ...r.body.user, id: r.body.id }, secret: r.body.secret });
    assert.equal(c.ready.me, h.p.user.id);
    c.close();
  });
});

describe('QR ile giriş', () => {
  test('telefon kodu okutup onaylayınca bilgisayar giriş anahtarını alır; kod tek kullanımlık', async () => {
    const tel = await connect(srv, person('Telefon'));
    const q = (await post('/auth/qr', { device: 'Windows bilgisayar' })).body;
    assert.equal(q.k.length, 43);
    assert.equal((await post('/auth/qr/durum', { k: q.k, p: q.p })).body.state, 'bekliyor');
    // QR'ı gören biri soru anahtarını bilmeden sonucu alamaz
    assert.equal((await post('/auth/qr/durum', { k: q.k, p: 'yanlis' })).code, 404);
    const okut = await tel.req({ t: 'qr.scan', k: q.k });
    assert.equal(okut.t, 'ok');
    assert.equal(okut.data.device, 'Windows bilgisayar');
    assert.equal((await post('/auth/qr/durum', { k: q.k, p: q.p })).body.state, 'okundu');
    // başka bir hesap aynı kodu onaylayamaz
    const yabanci = await connect(srv, person('Yabancı'));
    assert.equal((await yabanci.req({ t: 'qr.ok', k: q.k })).t, 'err');
    assert.equal((await tel.req({ t: 'qr.ok', k: q.k })).t, 'ok');
    const son = await post('/auth/qr/durum', { k: q.k, p: q.p });
    assert.equal(son.body.id, tel.who.user.id);
    const pc = await connect(srv, { user: { ...son.body.user, id: son.body.id }, secret: son.body.secret });
    assert.equal(pc.ready.me, tel.who.user.id);
    assert.equal((await post('/auth/qr/durum', { k: q.k, p: q.p })).code, 404);
    assert.equal((await tel.req({ t: 'qr.ok', k: q.k })).t, 'err');
    pc.close();
    tel.close();
    yabanci.close();
  });

  test('telefonda vazgeçilirse bilgisayar "red" görür', async () => {
    const tel = await connect(srv, person('Vazgeçen'));
    const q = (await post('/auth/qr', {})).body;
    await tel.req({ t: 'qr.scan', k: q.k });
    assert.equal((await tel.req({ t: 'qr.no', k: q.k })).t, 'ok');
    assert.equal((await post('/auth/qr/durum', { k: q.k, p: q.p })).body.state, 'red');
    tel.close();
  });

  test('anahtar yenilenince QR ile açılmış cihaz da çıkar', async () => {
    const tel = await connect(srv, person('Yenileyen'));
    const q = (await post('/auth/qr', {})).body;
    await tel.req({ t: 'qr.scan', k: q.k });
    await tel.req({ t: 'qr.ok', k: q.k });
    const r = (await post('/auth/qr/durum', { k: q.k, p: q.p })).body;
    const kim = { user: { ...r.user, id: r.id }, secret: r.secret };
    const pc = await connect(srv, kim);
    const kapandi = new Promise((res) => pc.once('close', (c) => res(c)));
    assert.equal((await tel.req({ t: 'rekey', secret: 'b'.repeat(64) })).t, 'ok');
    assert.ok([4001, 4003].includes(await kapandi));
    await sleep(50);
    await assert.rejects(connect(srv, kim), /4001/);
    tel.close();
  });

  test('şifre sıfırlama e-postası ayarı yoksa açık bir hata döner', async () => {
    const r = await post('/auth/unuttum', { email: 'biri@ornek.com' });
    assert.equal(r.code, 503);
    assert.match(r.body.msg, /henüz/);
  });
});
