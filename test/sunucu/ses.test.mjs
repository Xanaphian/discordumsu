// Ses odaları, gizli kanallar, zaman aşımı, ayrılma ve bu turda eklenen sunucu kuralları.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { community, connect, got, join, login, settle, sleep, startServer } from '../ortak/sunucu.mjs';

let srv;
before(async () => (srv = await startServer()));
after(() => srv?.stop());

const voiceOf = (c) => c.channels.find((x) => x.type === 'voice');
const textOf = (c) => c.channels.find((x) => x.type === 'text');
const latest = async (ws, cid) => {
  await ws.sync();
  return ws.frames.filter((f) => f.t === 'comm' && f.c?.id === cid).pop().c;
};
const joinVoice = async (ws, ch) => {
  const from = ws.frames.length;
  ws.out({ t: 'vc.join', ch, muted: false, deaf: false });
  const you = await ws.wait((f) => f.t === 'vc.you', 4000, from, 'vc.you');
  await ws.wait((f) => f.t === 'vc' && f.ch === ch && f.members.some((m) => m.sessionId === you.sessionId), 4000, from, 'oda listesi');
  return you.sessionId;
};
const send = async (ws, ch, content) => {
  const nonce = 'n' + Math.random().toString(36).slice(2);
  const from = ws.frames.length;
  ws.out({ t: 'send', ch, nonce, content });
  return ws.wait((f) => (f.t === 'msg' || f.t === 'err') && f.nonce === nonce, 4000, from, 'gönderim yanıtı');
};

describe('ses odaları', () => {
  let owner, a, b, c, vch;
  before(async () => {
    owner = await login(srv, 'Sahip');
    c = await community(srv, owner);
    owner.out({ t: 'comm.update', cid: c.id, joinMessages: false });
    vch = voiceOf(c).id;
    a = await login(srv, 'Ali');
    b = await login(srv, 'Bora');
    await join(a, c);
    await join(b, c);
  });
  after(() => [owner, a, b].forEach((x) => x.close()));

  test('katılan kişi odadaki herkese duyurulur; sinyal yalnız odadakine gider', async () => {
    const sa = await joinVoice(a, vch);
    const from = a.frames.length;
    const sb = await joinVoice(b, vch);
    await a.wait((f) => f.t === 'vc' && f.ch === vch && f.members.length === 2, 4000, from);
    const fb = b.frames.length;
    a.out({ t: 'vc.signal', to: sb, data: { x: 1 } });
    const sig = await b.wait((f) => f.t === 'vc.signal', 4000, fb);
    assert.equal(sig.from, sa);
    assert.equal(sig.fromUser, a.who.user.id);
    // odada olmayan biri sinyal gönderemez
    const fa = a.frames.length;
    owner.out({ t: 'vc.signal', to: sa, data: { x: 2 } });
    await settle(owner, a);
    assert.ok(!got(a, fa, (f) => f.t === 'vc.signal'), 'odada olmayanın sinyali ulaştı');
  });

  test('zaman aşımına alınan kişi ses odasından düşer', async () => {
    const from = a.frames.length;
    owner.out({ t: 'member.timeout', cid: c.id, userId: b.who.user.id, minutes: 5 });
    const f = await a.wait((x) => x.t === 'vc' && x.ch === vch && x.members.length === 1, 4000, from, 'oda güncellemesi');
    assert.ok(!f.members.some((m) => m.userId === b.who.user.id));
    // kendisine de bildirilir (uygulama seste asılı kalmasın)
    assert.ok(b.frames.some((x) => x.t === 'vc' && x.ch === vch && !x.members.some((m) => m.userId === b.who.user.id)));
    owner.out({ t: 'member.timeout', cid: c.id, userId: b.who.user.id, minutes: 0 });
    await settle(owner);
  });

  test('topluluktan ayrılan kişi ses odasında kalmaz', async () => {
    await joinVoice(b, vch);
    const from = a.frames.length;
    b.out({ t: 'comm.leave', cid: c.id });
    await a.wait((x) => x.t === 'vc' && x.ch === vch && !x.members.some((m) => m.userId === b.who.user.id), 4000, from, 'ayrılanın odadan düşmesi');
    await join(b, c);
  });

  test('gizli ses kanalındaki kişiler kanalı göremeyene gönderilmez', async () => {
    const r = await owner.req({ t: 'chan.create', cid: c.id, name: 'Gizli', type: 'voice', categoryId: null, private: true });
    assert.equal(r.t, 'ok');
    const secret = r.data;
    const from = a.frames.length;
    await joinVoice(owner, secret);
    await settle(owner, a);
    assert.ok(!got(a, from, (f) => f.t === 'vc' && f.ch === secret), 'gizli odanın üye listesi sızdı');
    // yeniden bağlanınca gelen ilk durumda da yok
    const again = await connect(srv, a.who);
    assert.ok(!again.ready.voice[secret], 'ready içinde gizli oda sızdı');
    again.close();
    owner.out({ t: 'vc.leave' });
    await settle(owner);
  });

  test('ses kanalı silinince oda kapanır', async () => {
    const r = await owner.req({ t: 'chan.create', cid: c.id, name: 'Geçici', type: 'voice', categoryId: null });
    const tmp = r.data;
    await joinVoice(a, tmp);
    owner.out({ t: 'chan.delete', cid: c.id, id: tmp });
    await settle(owner);
    const cc = await latest(a, c.id);
    assert.ok(!cc.channels.some((x) => x.id === tmp));
    // oda kaydı kalmadı: yeni bağlanan biri o odayı dolu görmez
    const again = await connect(srv, b.who);
    assert.ok(!again.ready.voice[tmp]);
    again.close();
    // a başka odaya sorunsuz girebilir
    await joinVoice(a, vch);
  });
});

describe('mesaj kuralları (bu turda eklenenler)', () => {
  let owner, m, c, ch;
  before(async () => {
    owner = await login(srv, 'Sahip');
    c = await community(srv, owner);
    ch = textOf(c).id;
    m = await login(srv, 'Mert');
    await join(m, c);
  });
  after(() => [owner, m].forEach((x) => x.close()));

  test('katılma (sistem) mesajı düzenlenemez', async () => {
    const msgs = (await m.req({ t: 'hist', ch })).msgs;
    const j = msgs.find((x) => x.kind === 'join' && x.authorId === m.who.user.id);
    assert.ok(j, 'katılma mesajı yok');
    m.out({ t: 'edit', ch, id: j.id, content: 'sahte duyuru' });
    await settle(m);
    const after = (await m.req({ t: 'hist', ch })).msgs.find((x) => x.id === j.id);
    assert.equal(after.content, '');
  });

  test('boş mesaj ve erişilemeyen kanal yanıtsız kalmaz', async () => {
    const r1 = await send(m, ch, '   ');
    assert.equal(r1.t, 'err');
    const r2 = await send(m, 'olmayankanal', 'selam');
    assert.equal(r2.t, 'err');
  });

  test('zaman aşımındaki üye mesajını düzenleyemez', async () => {
    const r = await send(m, ch, 'ilk hali');
    assert.equal(r.t, 'msg');
    owner.out({ t: 'member.timeout', cid: c.id, userId: m.who.user.id, minutes: 5 });
    await settle(owner);
    m.out({ t: 'edit', ch, id: r.m.id, content: 'zaman aşımında değişti' });
    await settle(m);
    const now = (await m.req({ t: 'hist', ch })).msgs.find((x) => x.id === r.m.id);
    assert.equal(now.content, 'ilk hali');
    owner.out({ t: 'member.timeout', cid: c.id, userId: m.who.user.id, minutes: 0 });
    await settle(owner);
  });

  test('yavaş mod yeniden bağlanarak atlatılamaz', async () => {
    owner.out({ t: 'chan.update', cid: c.id, id: ch, slowmode: 30 });
    await settle(owner);
    assert.equal((await send(m, ch, 'bir')).t, 'msg');
    const again = await connect(srv, m.who);
    const r = await send(again, ch, 'iki');
    assert.equal(r.t, 'err');
    assert.match(r.msg, /Yavaş mod/);
    again.close();
    owner.out({ t: 'chan.update', cid: c.id, id: ch, slowmode: 0 });
    await settle(owner);
  });

  test('renk alanına yazı dışında bir şey yazılamaz', async () => {
    const who = { user: { id: 'snrenk' + Date.now().toString(36), name: 'Renkli', color: ['#aabbcc'] }, secret: 'x'.repeat(32) };
    const ws = await connect(srv, who);
    await join(ws, c);
    const cc = await latest(owner, c.id);
    assert.equal(typeof cc.users[who.user.id].color, 'string');
    ws.close();
  });

  test('hız sınırına takılan mesaj "gönderilemedi" yanıtı alır', async () => {
    const ws = await login(srv, 'Hızlı');
    await join(ws, c);
    const from = ws.frames.length;
    for (let i = 0; i < 60; i++) ws.out({ t: 'send', ch, nonce: 'hz' + i, content: 'm' + i });
    const e = await ws.wait((f) => f.t === 'err' && /hızlı/i.test(f.msg), 4000, from, 'hız sınırı hatası');
    assert.ok(typeof e.nonce === 'string' && e.nonce.startsWith('hz'), 'hata hangi mesaja ait belli değil');
    ws.close();
  });
});

describe('özel mesaj ve arkadaşlık', () => {
  let x, y, c, dm;
  before(async () => {
    x = await login(srv, 'Xu');
    y = await login(srv, 'Yu');
    c = await community(srv, x);
    await join(y, c);
    const r = await x.req({ t: 'dm.open', to: y.who.user.id });
    dm = r.data.ch;
  });
  after(() => [x, y].forEach((w) => w.close()));

  test('engellenen kişinin "yazıyor" bilgisi ve arkadaşlık isteği ulaşmaz', async () => {
    y.out({ t: 'privacy', dms: 'all', blocked: [x.who.user.id] });
    await settle(y);
    const from = y.frames.length;
    x.out({ t: 'typing', ch: dm });
    const r = await x.req({ t: 'friend.req', to: y.who.user.id });
    assert.equal(r.t, 'err');
    await settle(x, y);
    assert.ok(!got(y, from, (f) => f.t === 'typing'), 'engellenenin yazıyor bilgisi ulaştı');
    assert.ok(!got(y, from, (f) => f.t === 'friend'), 'engellenenin isteği ulaştı');
    y.out({ t: 'privacy', dms: 'all', blocked: [] });
    await settle(y);
  });
});

describe('dosyalar', () => {
  test('yüklenen dosya aralık isteğiyle (Range) parça parça alınabilir', async () => {
    const who = await login(srv, 'Dosyacı');
    const body = Buffer.from('0123456789abcdefghij');
    const up = await fetch(srv.url + '/upload', {
      method: 'POST',
      headers: { 'content-type': 'video/mp4', 'x-kovan-user': who.who.user.id, 'x-kovan-secret': who.who.secret, 'x-kovan-name': 'a.mp4' },
      body,
    });
    assert.equal(up.status, 200);
    const att = await up.json();
    const full = await fetch(srv.url + att.url);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.equal(await full.text(), body.toString());
    const part = await fetch(srv.url + att.url, { headers: { range: 'bytes=5-9' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 5-9/20');
    assert.equal(await part.text(), '56789');
    const tail = await fetch(srv.url + att.url, { headers: { range: 'bytes=-4' } });
    assert.equal(await tail.text(), 'ghij');
    const bad = await fetch(srv.url + att.url, { headers: { range: 'bytes=50-' } });
    assert.equal(bad.status, 416);
    who.close();
    await sleep(10);
  });
});
