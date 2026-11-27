// v1.68 telefonu bağla: bilgisayar hesabı kısa bir koda bağlar, telefon kodla bir kez alır.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { connect, person, startServer } from '../ortak/sunucu.mjs';

let srv;
before(async () => {
  srv = await startServer();
});
after(async () => {
  await srv?.stop();
});

const offer = (p, blob, secret = p.secret) =>
  fetch(srv.url + '/pair/offer', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kovan-user': p.user.id, 'x-kovan-secret': secret }, body: JSON.stringify({ blob }) });
const claim = (code) => fetch(srv.url + '/pair/claim?code=' + encodeURIComponent(code), { method: 'POST' });

describe('telefonu bağla', () => {
  test('sunucu özelliği duyurur', async () => {
    const ws = await connect(srv, person('Telefon'));
    assert.ok(ws.ready.feats.includes('pair'));
    ws.close();
  });

  test('kod bir kez geçerli; tire ve küçük harf sorun değil', async () => {
    const p = person('Eşle');
    (await connect(srv, p)).close();
    const r = await offer(p, '{"hesap":1}');
    assert.equal(r.status, 200);
    const { code, exp } = await r.json();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.ok(exp > Date.now());
    const c1 = await claim(code.slice(0, 4).toLowerCase() + '-' + code.slice(4));
    assert.equal(c1.status, 200);
    assert.equal((await c1.json()).blob, '{"hesap":1}');
    assert.equal((await claim(code)).status, 404);
  });

  test('yanlış anahtarla kod alınamaz', async () => {
    const p = person('Yabancı');
    (await connect(srv, p)).close();
    assert.equal((await offer(p, '{}', 'b'.repeat(40))).status, 401);
  });

  test('yeni kod eskisini geçersiz kılar', async () => {
    const p = person('İkiKod');
    (await connect(srv, p)).close();
    const a = await (await offer(p, '1')).json();
    const b = await (await offer(p, '2')).json();
    assert.equal((await claim(a.code)).status, 404);
    assert.equal((await claim(b.code)).status, 200);
  });

  test('çok fazla deneme sınırlanır', async () => {
    let last = 0;
    for (let i = 0; i < 14; i++) last = (await claim('AAAAAAAA')).status;
    assert.equal(last, 429);
  });
});
