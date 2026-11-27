// Mesaj gönderme, düzenleme, silme ve kalıcılık; özel mesaj (DM) kuralları.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { community, connect, got, join, login, settle, sleep, startServer } from '../ortak/sunucu.mjs';

let srv;
before(async () => (srv = await startServer()));
after(() => srv?.stop());

const textOf = (c) => c.channels.find((x) => x.type === 'text');
const send = async (ws, ch, content, retry = true) => {
  const nonce = 'n' + Math.random().toString(36).slice(2);
  const from = ws.frames.length;
  ws.out({ t: 'send', ch, nonce, content });
  const r = await ws.wait((f) => (f.t === 'msg' || f.t === 'err') && f.nonce === nonce, 4000, from, 'gönderim yanıtı');
  // özel mesajda arka arkaya iki gönderim arasında sunucu kısa bir süre bekletir
  if (retry && r.t === 'err' && /yavaş/i.test(r.msg)) return (await sleep(150), send(ws, ch, content, false));
  return r;
};
const hist = async (ws, ch) => (await ws.req({ t: 'hist', ch })).msgs;

describe('topluluk mesajları', () => {
  let owner, member, outsider, c, ch;
  before(async () => {
    owner = await login(srv, 'Sahip');
    c = await community(srv, owner);
    ch = textOf(c).id;
    owner.out({ t: 'comm.update', cid: c.id, joinMessages: false });
    member = await login(srv, 'Üye');
    await join(member, c);
    outsider = await login(srv, 'Yabancı');
  });
  after(() => [owner, member, outsider].forEach((x) => x.close()));

  test('gönderilen mesaj gönderene ve diğer üyelere ulaşır', async () => {
    const from = member.frames.length;
    const r = await send(owner, ch, 'merhaba **dünya**');
    assert.equal(r.t, 'msg');
    assert.equal(r.m.content, 'merhaba **dünya**');
    assert.equal(r.m.authorId, owner.who.user.id);
    const m = await member.wait((f) => f.t === 'msg' && f.m.id === r.m.id, 4000, from);
    assert.equal(m.m.content, 'merhaba **dünya**');
  });

  test('düzenleme ve silme herkese yansır', async () => {
    const r = await send(member, ch, 'yazım hatsı');
    let from = owner.frames.length;
    member.out({ t: 'edit', ch, id: r.m.id, content: 'yazım hatası' });
    const u = await owner.wait((f) => f.t === 'msg.upd' && f.m.id === r.m.id, 4000, from);
    assert.equal(u.m.content, 'yazım hatası');
    assert.ok(u.m.editedTs);
    from = owner.frames.length;
    member.out({ t: 'del', ch, id: r.m.id });
    await owner.wait((f) => f.t === 'msg.del' && f.id === r.m.id, 4000, from);
    assert.ok(!(await hist(owner, ch)).some((m) => m.id === r.m.id), 'silinen mesaj geçmişte kaldı');
  });

  test('başkasının mesajı düzenlenemez; yetkisiz üye silemez', async () => {
    const r = await send(owner, ch, 'sahibin mesajı');
    const from = owner.frames.length;
    member.out({ t: 'edit', ch, id: r.m.id, content: 'değiştirdim' });
    member.out({ t: 'del', ch, id: r.m.id });
    await settle(member, owner);
    assert.ok(!got(owner, from, (f) => (f.t === 'msg.upd' || f.t === 'msg.del') && (f.m?.id === r.m.id || f.id === r.m.id)));
    const m = (await hist(owner, ch)).find((x) => x.id === r.m.id);
    assert.equal(m?.content, 'sahibin mesajı');
  });

  test('mesaj yönetme yetkisi olan (sahip) başkasının mesajını silebilir', async () => {
    const r = await send(member, ch, 'silinecek');
    const from = member.frames.length;
    owner.out({ t: 'del', ch, id: r.m.id });
    await member.wait((f) => f.t === 'msg.del' && f.id === r.m.id, 4000, from);
  });

  test('üye olmayan mesaj gönderemez, geçmişi okuyamaz, düzenleyemez', async () => {
    const r = await send(owner, ch, 'gizli konuşma');
    const from = owner.frames.length;
    outsider.out({ t: 'send', ch, nonce: 'x', content: 'sızdım' });
    outsider.out({ t: 'edit', ch, id: r.m.id, content: 'ele geçirdim' });
    outsider.out({ t: 'del', ch, id: r.m.id });
    await settle(outsider, owner);
    assert.ok(!got(owner, from, (f) => f.t === 'msg' || f.t === 'msg.upd' || f.t === 'msg.del'));
    assert.deepEqual(await hist(outsider, ch), []);
    assert.ok(!(await outsider.req({ t: 'pins', ch })).msgs?.length);
  });

  test('boş mesaj kaydedilmez, çok uzun mesaj kısaltılır, sahte ek adresi atılır', async () => {
    const before = (await hist(owner, ch)).length;
    owner.out({ t: 'send', ch, nonce: 'bos', content: '   ' });
    await owner.sync();
    assert.equal((await hist(owner, ch)).length, before);
    const long = await send(owner, ch, 'a'.repeat(50_000));
    assert.ok(long.m.content.length <= 8000, 'uzunluk ' + long.m.content.length);
    const nonce = 'ek';
    const from = owner.frames.length;
    owner.out({ t: 'send', ch, nonce, content: 'ek', attachments: [{ id: 'x', name: 'kötü', size: 1, mime: 'text/html', url: 'https://kotu.example/x' }] });
    const m = await owner.wait((f) => f.t === 'msg' && f.nonce === nonce, 4000, from);
    assert.ok(!m.m.attachments?.length, 'dış adresli ek kabul edildi');
  });

  test('gizli kanal yalnızca izinli kişiye görünür', async () => {
    const r = await owner.req({ t: 'chan.create', cid: c.id, name: 'yonetim', type: 'text', categoryId: null, private: true });
    assert.equal(r.t, 'ok');
    const secret = r.data;
    await send(owner, secret, 'yönetim notu');
    assert.deepEqual(await hist(member, secret), []);
    const from = owner.frames.length;
    member.out({ t: 'send', ch: secret, nonce: 's', content: 'ben de' });
    await settle(member, owner);
    assert.ok(!got(owner, from, (f) => f.t === 'msg' && f.m.channelId === secret));
  });

  test('mesajlar sunucu yeniden başlayınca kaybolmaz', async () => {
    const r = await send(owner, ch, 'kalıcı mesaj');
    owner.out({ t: 'edit', ch, id: r.m.id, content: 'kalıcı mesaj (düzenlendi)' });
    await owner.sync();
    [owner, member, outsider].forEach((x) => x.close());
    await srv.restart();
    owner = await connect(srv, owner.who);
    member = await connect(srv, member.who);
    outsider = await connect(srv, outsider.who);
    const m = (await hist(owner, ch)).find((x) => x.id === r.m.id);
    assert.equal(m?.content, 'kalıcı mesaj (düzenlendi)');
    assert.ok(owner.ready.communities.some((x) => x.id === c.id), 'topluluk yeniden başlatmada kayboldu');
  });
});

describe('özel mesaj', () => {
  let a, b, x, c;
  before(async () => {
    a = await login(srv, 'Ali');
    b = await login(srv, 'Ayşe');
    x = await login(srv, 'Üçüncü');
    c = await community(srv, a, 'Ortak');
    a.out({ t: 'comm.update', cid: c.id, joinMessages: false });
    await join(b, c);
    await join(x, c);
  });
  after(() => [a, b, x].forEach((w) => w.close()));

  test('ortak topluluğu olmayan yabancıya özel mesaj açılamaz', async () => {
    const lone = await login(srv, 'Yalnız');
    const r = await lone.req({ t: 'dm.open', to: a.who.user.id });
    assert.equal(r.t, 'err');
    lone.close();
  });

  test('özel mesaj iki tarafa ulaşır, üçüncü kişi okuyamaz ve yazamaz', async () => {
    const d = await a.req({ t: 'dm.open', to: b.who.user.id });
    assert.equal(d.t, 'ok');
    const dch = d.data.ch;
    const fromB = b.frames.length;
    const fromX = x.frames.length;
    const r = await send(a, dch, 'sadece sana');
    assert.equal(r.t, 'msg');
    await b.wait((f) => f.t === 'msg' && f.m.id === r.m.id, 4000, fromB);
    await settle(a, x);
    assert.ok(!got(x, fromX, (f) => f.t === 'msg' && f.m.channelId === dch), 'özel mesaj üçüncü kişiye gitti');
    assert.deepEqual(await hist(x, dch), []);
    x.out({ t: 'send', ch: dch, nonce: 'z', content: 'araya girdim' });
    x.out({ t: 'del', ch: dch, id: r.m.id });
    x.out({ t: 'edit', ch: dch, id: r.m.id, content: 'değişti' });
    await x.sync();
    const h = await hist(a, dch);
    assert.equal(h.length, 1);
    assert.equal(h[0].content, 'sadece sana');
  });

  test('özel mesajda karşı tarafın mesajı düzenlenemez/silinemez', async () => {
    const d = await a.req({ t: 'dm.open', to: b.who.user.id });
    const r = await send(a, d.data.ch, 'benim mesajım');
    b.out({ t: 'edit', ch: d.data.ch, id: r.m.id, content: 'onun değil' });
    b.out({ t: 'del', ch: d.data.ch, id: r.m.id });
    await b.sync();
    assert.equal((await hist(a, d.data.ch)).find((m) => m.id === r.m.id)?.content, 'benim mesajım');
  });

  test('"yalnız arkadaşlar" ayarı açıkken yabancı yazamaz', async () => {
    x.out({ t: 'privacy', dms: 'friends' });
    await x.sync();
    const r = await a.req({ t: 'dm.open', to: x.who.user.id });
    if (r.t === 'ok') {
      const s = await send(a, r.data.ch, 'selam');
      assert.equal(s.t, 'err');
    } else assert.match(r.msg, /arkadaş/);
    x.out({ t: 'privacy', dms: 'all' });
    await x.sync();
  });

  test('engellenen kişi yazamaz', async () => {
    const d = await b.req({ t: 'dm.open', to: x.who.user.id });
    assert.equal(d.t, 'ok');
    x.out({ t: 'privacy', dms: 'all', blocked: [b.who.user.id] });
    await x.sync();
    const fromX = x.frames.length;
    const s = await send(b, d.data.ch, 'engellendim mi');
    await settle(b, x);
    assert.equal(s.t, 'err', 'engellenen kişinin mesajı kabul edildi');
    assert.ok(!got(x, fromX, (f) => f.t === 'msg' && f.m.content === 'engellendim mi'), 'engellenen kişinin mesajı ulaştı');
    // engellenen kişi arayamaz da
    const fromB = b.frames.length;
    b.out({ t: 'vc.join', ch: d.data.ch, muted: false, deaf: false });
    const e = await b.wait((f) => f.t === 'err' || f.t === 'vc.you', 4000, fromB);
    assert.equal(e.t, 'err');
    x.out({ t: 'privacy', dms: 'all', blocked: [] });
    await x.sync();
  });

  test('engellenen kişi eski sohbete tepki bırakamaz, mesaj sabitleyemez', async () => {
    const d = await a.req({ t: 'dm.open', to: b.who.user.id });
    const r = await send(b, d.data.ch, 'tepki denemesi');
    b.out({ t: 'privacy', dms: 'all', blocked: [a.who.user.id] });
    await b.sync();
    a.out({ t: 'react', ch: d.data.ch, id: r.m.id, e: '👍', on: true });
    a.out({ t: 'pin', ch: d.data.ch, id: r.m.id, on: true });
    await a.sync();
    const m = (await hist(b, d.data.ch)).find((x1) => x1.id === r.m.id);
    assert.ok(!m.reactions?.['👍'], 'engellenen kişinin tepkisi kaydedildi');
    assert.ok(!m.pinned, 'engellenen kişi mesaj sabitledi');
    b.out({ t: 'privacy', dms: 'all', blocked: [] });
    await b.sync();
  });

  test('ters yazılmış özel mesaj kimliğiyle ikinci bir gizli sohbet açılamaz', async () => {
    const d = await a.req({ t: 'dm.open', to: b.who.user.id });
    const [, p1, p2] = /^d_(.+)_(.+)$/.exec(d.data.ch);
    const rev = `d_${p2}_${p1}`;
    const r = await send(a, rev, 'gizli');
    assert.notEqual(r.t, 'msg', 'ters kimlikli kanala mesaj gitti');
    assert.deepEqual(await hist(a, rev), []);
  });
});
