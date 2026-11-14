// Arkadaş ekleme (ad#kod), ses odasına girip çıkma, topluluk yetkileri (kim neyi yapabilir).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { community, connect, got, join, login, person, settle, startServer } from '../ortak/sunucu.mjs';

let srv;
before(async () => (srv = await startServer()));
after(() => srv?.stop());

const Perm = { ADMIN: 1, MANAGE_CHANNELS: 2, MANAGE_MESSAGES: 4, MANAGE_ROLES: 8, KICK: 16, MANAGE_COMMUNITY: 32, CONNECT: 1 << 11, BAN: 1 << 16 };
const latest = (ws, cid) => [...ws.frames].reverse().find((f) => f.t === 'comm' && f.c?.id === cid)?.c;

describe('arkadaş ekleme (ad#kod)', () => {
  let a, b;
  before(async () => {
    a = await login(srv, 'Ece');
    b = await login(srv, 'Mert');
  });
  after(() => [a, b].forEach((x) => x.close()));

  test('herkesin girişte bir etiketi olur', () => {
    assert.match(a.ready.tag, /^[\p{L}\p{N}]{1,5}$/u);
  });

  test('etiketle istek gönderilir, karşı taraf kabul eder, iki taraf da arkadaş olur', async () => {
    const tag = `${b.who.user.name}#${b.ready.tag}`;
    const fromB = b.frames.length;
    const r = await a.req({ t: 'friend.tag', tag });
    assert.equal(r.t, 'ok', JSON.stringify(r));
    assert.equal(r.data.uid, b.who.user.id);
    assert.equal(r.data.state, 'out');
    const inc = await b.wait((f) => f.t === 'friend' && f.f.user.id === a.who.user.id, 4000, fromB);
    assert.equal(inc.f.state, 'in');
    const fromA = a.frames.length;
    b.out({ t: 'friend.accept', to: a.who.user.id });
    const ok = await a.wait((f) => f.t === 'friend' && f.f.user.id === b.who.user.id && f.f.state === 'ok', 4000, fromA);
    assert.ok(ok);
    const again = await a.req({ t: 'friend.tag', tag });
    assert.equal(again.t, 'err');
    assert.match(again.msg, /zaten arkadaşın/);
  });

  test('büyük/küçük harf ve Türkçe karakter fark etmez', async () => {
    const c = await login(srv, 'Işık');
    const code = (await c.req({ t: 'tag.set', code: 'İzm' })).data;
    assert.equal(code, 'İzm');
    const r = await a.req({ t: 'friend.tag', tag: `${c.who.user.name.toLocaleLowerCase('tr')}#izm` });
    assert.equal(r.t, 'ok', JSON.stringify(r));
    c.close();
  });

  test('yanlış etiket, kendi etiketi ve davet kodu anlaşılır hata verir', async () => {
    for (const [tag, re] of [
      ['yokboylebiri#9999', /bulunamadı/],
      [`${a.who.user.name}#${a.ready.tag}`, /kendi etiketin/],
      ['adsız', /#/],
      ['#123', /adını/],
      ['ad#', /kodunu/],
      ['ad#çokuzunkod', /en çok 5/],
    ]) {
      const r = await a.req({ t: 'friend.tag', tag });
      assert.equal(r.t, 'err', tag);
      assert.match(r.msg, re, tag + ' → ' + r.msg);
    }
  });

  test('kod değiştirme kuralları: başkasının kodu, uygunsuz ve resmî görünen kodlar alınamaz', async () => {
    const x = await login(srv, 'Kod');
    const y = await connect(srv, { user: { ...person().user, name: x.who.user.name }, secret: person().secret });
    assert.equal((await x.req({ t: 'tag.set', code: 'AB1' })).t, 'ok');
    const taken = await y.req({ t: 'tag.set', code: 'ab1' });
    assert.equal(taken.t, 'err');
    assert.match(taken.msg, /başka birinde/);
    for (const bad of ['a', '000', 'a b', 'x#y', 'çokuzun']) assert.equal((await x.req({ t: 'tag.set', code: bad })).t, 'err', bad);
    x.close();
    y.close();
  });

  test('etiketle hesap taraması sınırlanır (10 dakikada 30 deneme)', async () => {
    const s = await login(srv, 'Tarayıcı');
    let last;
    for (let i = 0; i < 31; i++) {
      last = await s.req({ t: 'friend.tag', tag: `kimse${i}#${1000 + i}` });
      if (i % 9 === 8) await new Promise((r) => setTimeout(r, 1200)); // genel hız sınırına takılmamak için
    }
    assert.match(last.msg, /Çok fazla deneme/);
    s.close();
  });
});

describe('ses odası', () => {
  let owner, m1, m2, c, voice;
  before(async () => {
    owner = await login(srv, 'SesSahip');
    c = await community(srv, owner, 'Ses');
    owner.out({ t: 'comm.update', cid: c.id, joinMessages: false });
    voice = c.channels.find((x) => x.type === 'voice');
    assert.ok(voice, 'şablonda ses kanalı yok');
    m1 = await login(srv, 'Ses1');
    m2 = await login(srv, 'Ses2');
    await join(m1, c);
    await join(m2, c);
  });
  after(() => [owner, m1, m2].forEach((x) => x.close()));

  const roomOf = (ws, from) => ws.frames.slice(from).filter((f) => f.t === 'vc' && f.ch === voice.id).pop()?.members || [];

  test('girince herkes odadakileri görür, çıkınca listeden düşer', async () => {
    let from = owner.frames.length;
    m1.out({ t: 'vc.join', ch: voice.id, muted: false, deaf: false });
    const you = await m1.wait((f) => f.t === 'vc.you');
    await owner.wait((f) => f.t === 'vc' && f.ch === voice.id && f.members.some((x) => x.userId === m1.who.user.id), 4000, from);
    const fromM2j = m2.frames.length;
    m2.out({ t: 'vc.join', ch: voice.id, muted: true, deaf: false });
    await m2.wait((f) => f.t === 'vc.you', 4000, fromM2j);
    await owner.wait((f) => f.t === 'vc' && f.members.length === 2, 4000, from);
    assert.deepEqual(roomOf(owner, from).map((x) => [x.userId, x.muted]).sort(), [[m1.who.user.id, false], [m2.who.user.id, true]].sort());
    // bağlantı kurma sinyali yalnızca odadakiler arasında iletilir
    const m2you = m2.frames.find((f) => f.t === 'vc.you').sessionId;
    const fromM2 = m2.frames.length;
    m1.out({ t: 'vc.signal', to: m2you, data: { sdp: 'deneme' } });
    const sig = await m2.wait((f) => f.t === 'vc.signal', 4000, fromM2);
    assert.equal(sig.from, you.sessionId);
    assert.equal(sig.fromUser, m1.who.user.id);
    from = owner.frames.length;
    m1.out({ t: 'vc.leave' });
    await owner.wait((f) => f.t === 'vc' && f.ch === voice.id && !f.members.some((x) => x.userId === m1.who.user.id), 4000, from);
  });

  test('bağlantısı kopan kişi odadan düşer (hayalet üye kalmaz)', async () => {
    const ghost = await connect(srv, m1.who);
    ghost.out({ t: 'vc.join', ch: voice.id, muted: false, deaf: false });
    await ghost.wait((f) => f.t === 'vc.you');
    const from = owner.frames.length;
    ghost.terminate();
    await owner.wait((f) => f.t === 'vc' && f.ch === voice.id && !f.members.some((x) => x.userId === m1.who.user.id), 4000, from);
  });

  test('odada olmayan kişi sinyal gönderemez, üye olmayan giremez', async () => {
    const outsider = await login(srv, 'SesYabancı');
    const m2you = m2.frames.find((f) => f.t === 'vc.you').sessionId;
    const fromM2 = m2.frames.length;
    outsider.out({ t: 'vc.signal', to: m2you, data: { sdp: 'saldırı' } });
    const fromO = owner.frames.length;
    outsider.out({ t: 'vc.join', ch: voice.id, muted: false, deaf: false });
    await settle(outsider, m2, owner);
    assert.ok(!got(m2, fromM2, (f) => f.t === 'vc.signal'), 'odada olmayanın sinyali iletildi');
    assert.ok(!got(owner, fromO, (f) => f.t === 'vc' && f.members.some((x) => x.userId === outsider.who.user.id)), 'üye olmayan ses odasına girdi');
    assert.ok(!got(outsider, 0, (f) => f.t === 'vc.you'));
    outsider.close();
  });

  test('bağlanma yetkisi olmayan giremez', async () => {
    const r = await owner.req({ t: 'chan.create', cid: c.id, name: 'Kapalı', type: 'voice', categoryId: null });
    owner.out({ t: 'chan.update', cid: c.id, id: r.data, overwrites: [{ id: c.id, type: 'role', allow: 0, deny: Perm.CONNECT }] });
    await owner.sync();
    const from = m1.frames.length;
    m1.out({ t: 'vc.join', ch: r.data, muted: false, deaf: false });
    const e = await m1.wait((f) => f.t === 'err' || f.t === 'vc.you', 4000, from);
    assert.equal(e.t, 'err');
    assert.match(e.msg, /yetkin yok/);
  });
});

describe('topluluk yetkileri', () => {
  let owner, mod, member, c;
  before(async () => {
    owner = await login(srv, 'Kurucu');
    c = await community(srv, owner, 'Yetki');
    owner.out({ t: 'comm.update', cid: c.id, joinMessages: false });
    mod = await login(srv, 'Mod');
    member = await login(srv, 'Sıradan');
    await join(mod, c);
    await join(member, c);
    const modRole = c.roles.find((r) => r.name === 'Moderatör');
    owner.out({ t: 'member.update', cid: c.id, userId: mod.who.user.id, roles: [modRole.id] });
    await owner.sync();
  });
  after(() => [owner, mod, member].forEach((x) => x.close()));

  const expectErr = async (ws, f) => {
    const from = ws.frames.length;
    ws.out(f);
    await ws.sync();
    return ws.frames.slice(from).find((x) => x.t === 'err');
  };

  test('sıradan üye topluluğu değiştiremez, kanal açamaz, rol veremez', async () => {
    const before = latest(owner, c.id);
    assert.ok(await expectErr(member, { t: 'comm.update', cid: c.id, name: 'Ele geçirildi' }));
    assert.ok(await expectErr(member, { t: 'chan.create', cid: c.id, name: 'izinsiz', type: 'text', categoryId: null }));
    assert.ok(await expectErr(member, { t: 'member.update', cid: c.id, userId: member.who.user.id, roles: [c.roles.find((r) => r.name === 'Moderatör').id] }));
    assert.ok(await expectErr(member, { t: 'role.create', cid: c.id, name: 'tanrı', color: '#ffffff', perms: 0x7fffffff, hoist: true }));
    assert.ok(await expectErr(member, { t: 'member.kick', cid: c.id, userId: mod.who.user.id }));
    assert.ok(await expectErr(member, { t: 'member.ban', cid: c.id, userId: mod.who.user.id }));
    await settle(owner);
    const now = latest(owner, c.id);
    assert.equal(now.name, before.name);
    assert.equal(now.channels.length, before.channels.length);
    assert.equal(now.roles.length, before.roles.length);
    assert.equal(now.members.length, 3);
  });

  test('topluluğu yalnızca kurucu silebilir', async () => {
    mod.out({ t: 'comm.delete', cid: c.id });
    member.out({ t: 'comm.delete', cid: c.id });
    await settle(mod, member);
    const r = await member.req({ t: 'hist', ch: c.channels.find((x) => x.type === 'text').id });
    assert.equal(r.t, 'hist');
    assert.ok((await owner.req({ t: 'mod.list', cid: c.id })).t === 'ok', 'topluluk silinmiş');
  });

  test('moderatör kurucuyu atamaz, yasaklayamaz; kendinde olmayan yetkiyi veremez', async () => {
    assert.ok(await expectErr(mod, { t: 'member.kick', cid: c.id, userId: owner.who.user.id }));
    assert.ok(await expectErr(mod, { t: 'member.timeout', cid: c.id, userId: owner.who.user.id, minutes: 10 }));
    const modRole = c.roles.find((r) => r.name === 'Moderatör');
    assert.ok(await expectErr(mod, { t: 'role.update', cid: c.id, id: modRole.id, perms: 0x7fffffff }));
    assert.ok(latest(owner, c.id).members.some((m) => m.userId === owner.who.user.id));
  });

  test('moderatör sıradan üyeyi atabilir', async () => {
    const victim = await login(srv, 'Atılacak');
    await join(victim, c);
    const from = victim.frames.length;
    mod.out({ t: 'member.kick', cid: c.id, userId: victim.who.user.id });
    await victim.wait((f) => f.t === 'comm.del' && f.cid === c.id, 4000, from);
    victim.close();
  });

  test('yasaklanan kişi davetle geri giremez, yazamaz', async () => {
    const bad = await login(srv, 'Yasaklı');
    await join(bad, c);
    owner.out({ t: 'member.ban', cid: c.id, userId: bad.who.user.id });
    await bad.wait((f) => f.t === 'comm.del' && f.cid === c.id, 4000, 0);
    const r = await bad.req({ t: 'join', code: c.inviteCode });
    assert.equal(r.t, 'err');
    assert.match(r.msg, /yasaklandın/);
    const ch = c.channels.find((x) => x.type === 'text').id;
    const from = owner.frames.length;
    bad.out({ t: 'send', ch, nonce: 'y', content: 'geri döndüm' });
    await settle(bad, owner);
    assert.ok(!got(owner, from, (f) => f.t === 'msg'));
    bad.close();
  });

  test('davet durdurulunca yeni kişi katılamaz; geçersiz kod reddedilir', async () => {
    owner.out({ t: 'comm.update', cid: c.id, invitesPaused: true });
    await owner.sync();
    const n = await login(srv, 'Geç');
    const r = await n.req({ t: 'join', code: c.inviteCode });
    assert.equal(r.t, 'err');
    assert.equal((await n.req({ t: 'join', code: 'yokboylekod' })).t, 'err');
    assert.equal((await n.req({ t: 'join', cid: c.id })).t, 'err', 'davet kodu olmadan kimlikle katılındı');
    owner.out({ t: 'comm.update', cid: c.id, invitesPaused: false });
    await owner.sync();
    n.close();
  });

  test('bir kişinin kurabileceği topluluk sayısı sınırlıdır', async () => {
    const s = await startServer({ KOVAN_MAX_OWNED: '2' });
    try {
      const w = await login(s, 'Çok');
      assert.equal((await w.req({ t: 'comm.create', name: 'a', color: '#000000' })).t, 'ok');
      assert.equal((await w.req({ t: 'comm.create', name: 'b', color: '#000000' })).t, 'ok');
      const r = await w.req({ t: 'comm.create', name: 'c', color: '#000000' });
      assert.equal(r.t, 'err');
      w.close();
    } finally {
      await s.stop();
    }
  });
});
