// v1.33 Ana Sayfa > Başlangıç: sabit ipuçları yerine canlı bir pano.
// Selamlama + özet, seste kim var, seni bekleyen mesajlar, toplulukların; sağda çevrimiçi arkadaşlar,
// bekleyen istekler ve Keşfet önerileri. Yeni hesapta "Başlarken" adımları ve Keşfet öne çıkar.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, LogIn, UserPlus, Compass, Volume2, MonitorUp, MessageCircle, Check, X, CheckCheck, ChevronRight, Users,
  Image as ImageIcon, Sparkles, Lightbulb, LoaderCircle, Hash, Swords,
} from 'lucide-react';
import {
  useStore, openModal, selectCommunity, selectChannel, setHomeTab, realCommunities, dmList, hiddenDms, isDmHidden, openDm,
  acceptFriend, removeFriend, markRead, loadHistory, plainText, homeRequest, toast, type State,
} from '../lib/store';
import { useVoice, joinVoice } from '../lib/voice';
import { useActs } from '../lib/activity';
import { parseCard, lfgSlots, type LfgCard } from '../lib/cards';
import { Avatar, CommunityIcon, STATUS_LABEL } from './Common';
import { ChannelGlyph } from './OdaResmi';
import { PresenceLine, ActivityBadge } from './profile/Activity';
import { Banner } from './profile/ProfileCard';
import { useUnread } from './ServerRail';
import { activeCustom } from '../../shared/profile';
import { idTime, isVoiceLike, type Community, type Channel, type ID, type Message, type UserPublic, type VoiceMember } from '../../shared/protocol';
import { catLabel, type ExploreItem } from '../../shared/topluluk';
import { cx, modKey } from '../lib/util';

// ---------------------------------------------------------------------------
// küçük yardımcılar

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'İyi geceler';
  if (h < 11) return 'Günaydın';
  if (h < 17) return 'İyi günler';
  if (h < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'şimdi';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa`;
  const g = Math.round(h / 24);
  return g < 7 ? `${g} gün` : new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

const TIPS = [
  { t: `${modKey}+K`, d: 'Hızlı geçiş: yazmaya başla, her kanala ve kişiye iki tuşla git.' },
  { t: 'Davet kodu', d: "Topluluk adına tıkla, Davet et'i seç ve kodu arkadaşına gönder." },
  { t: 'Tek tuşla güncelleme', d: 'Yeni sürüm çıkınca üst çubukta Güncelle düğmesi belirir.' },
  { t: 'Sağ tık', d: 'Bir kişiye sağ tıklayıp tam profilini, ortak arkadaşlarınızı ve notunu görebilirsin.' },
  { t: 'Takım kur', d: 'Oyun açıkken yazma kutusundaki + menüsünden takım ilanı ver, arkadaşların tek tıkla katılsın.' },
  { t: 'Sen yokken', d: 'Uzun süre bakmadığın bir kanala girince kaçırdıklarının özeti en üstte durur.' },
  { t: 'Görünüm', d: 'Üst çubuktaki palet ile yedi tema arasında anında geçiş yapabilirsin.' },
];

function useMinute() {
  const [, setT] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setT((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
}

const isOn = (st: string | undefined) => !!st && st !== 'offline';

// ---------------------------------------------------------------------------
// veri: seste olanlar, okunmamışlar, ilanlar

interface Room {
  c: Community;
  ch: Channel;
  members: VoiceMember[];
  friends: number;
}

function useRooms(): Room[] {
  const voice = useStore((s) => s.voice);
  const communities = useStore((s) => s.communities);
  const chanComm = useStore((s) => s.chanComm);
  const friends = useStore((s) => s.friends);
  return useMemo(() => {
    const out: Room[] = [];
    for (const [chId, list] of Object.entries(voice)) {
      if (!list?.length) continue;
      const c = communities[chanComm[chId]];
      if (!c || c.dm) continue;
      const ch = c.channels.find((x) => x.id === chId);
      if (!ch) continue;
      out.push({ c, ch, members: list, friends: list.filter((m) => friends[m.userId]?.state === 'ok').length });
    }
    // arkadaşların olduğu ve kalabalık odalar önce
    return out.sort((a, b) => b.friends - a.friends || b.members.length - a.members.length);
  }, [voice, communities, chanComm, friends]);
}

interface Waiting {
  c: Community;
  ch: Channel;
  last: ID;
  mentions: number;
}

function useWaiting(): Waiting[] {
  const communities = useStore((s) => s.communities);
  const lastIds = useStore((s) => s.lastIds);
  const read = useStore((s) => s.read);
  const mentions = useStore((s) => s.mentions);
  const muted = useStore((s) => s.settings.mutedIds);
  return useMemo(() => {
    const hidden = hiddenDms();
    const out: Waiting[] = [];
    for (const c of Object.values(communities)) {
      if (c.dm && isDmHidden(c, hidden)) continue;
      for (const ch of c.channels) {
        if (isVoiceLike(ch.type)) continue;
        const last = lastIds[ch.id];
        if (!last || (read[ch.id] && last <= read[ch.id])) continue;
        const m = mentions[ch.id] || 0;
        // susturulanlarda yalnız bahsetmeler
        if (!m && (muted.includes(ch.id) || muted.includes(c.id))) continue;
        out.push({ c, ch, last, mentions: c.dm ? Math.max(1, m) : m });
      }
    }
    return out.sort((a, b) => (b.mentions ? 1 : 0) - (a.mentions ? 1 : 0) || (b.last > a.last ? 1 : -1));
  }, [communities, lastIds, read, mentions, muted]);
}

interface OpenLfg {
  c: Community;
  ch: Channel;
  m: Message;
  card: LfgCard;
  free: number;
}

/** Yüklü kanallardaki son 3 saatin boş yeri olan takım ilanları */
function useOpenLfg(): OpenLfg[] {
  const chans = useStore((s) => s.chans);
  const communities = useStore((s) => s.communities);
  const chanComm = useStore((s) => s.chanComm);
  return useMemo(() => {
    const since = Date.now() - 3 * 3600_000;
    const out: OpenLfg[] = [];
    for (const [chId, st] of Object.entries(chans)) {
      const c = communities[chanComm[chId]];
      if (!c || c.dm || !st?.items?.length) continue;
      const ch = c.channels.find((x) => x.id === chId);
      if (!ch) continue;
      for (let i = st.items.length - 1; i >= 0 && i >= st.items.length - 60; i--) {
        const m = st.items[i];
        if (m.ts < since) break;
        const card = parseCard(m.content);
        if (!card || card.k !== 'lfg') continue;
        if (card.at && card.at < Date.now() - 3600_000) continue;
        const free = lfgSlots(m, card).filter((x) => !x).length;
        if (free > 0) out.push({ c, ch, m, card, free });
      }
    }
    return out.sort((a, b) => b.m.ts - a.m.ts).slice(0, 3);
  }, [chans, communities, chanComm]);
}

// ---------------------------------------------------------------------------

export function HomeStart() {
  useMinute();
  const me = useStore((s) => s.me);
  const communities = useStore((s) => s.communities);
  const presence = useStore((s) => s.presence);
  const friendsMap = useStore((s) => s.friends);
  const users = useStore((s) => s.users);
  const conns = useStore((s) => s.conns);
  const list = useMemo(() => realCommunities(communities), [communities]);
  const rooms = useRooms();
  const waiting = useWaiting();
  const lfg = useOpenLfg();
  const friends = useMemo(() => Object.values(friendsMap).filter((f) => f.state === 'ok'), [friendsMap]);
  const onlineFriends = friends.filter((f) => isOn(presence[f.user.id]));
  const inVoiceFriends = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rooms) for (const m of r.members) if (friendsMap[m.userId]?.state === 'ok') ids.add(m.userId);
    return ids.size;
  }, [rooms, friendsMap]);
  const mentionTotal = waiting.reduce((n, w) => n + w.mentions, 0);
  const homeOnline = Object.values(conns).some((x) => x.home && x.status === 'online');

  // bekleyenlerin son mesajını göstermek için ilk birkaç kanalın geçmişini önden yükle
  const preload = waiting.slice(0, 6).map((w) => w.ch.id).join(',');
  useEffect(() => {
    const chans = useStore.getState().chans;
    for (const ch of preload.split(',').filter(Boolean)) if (!chans[ch]?.loaded && !chans[ch]?.loading) loadHistory(ch);
  }, [preload, homeOnline]);

  const parts: string[] = [];
  if (onlineFriends.length) parts.push(`${onlineFriends.length} arkadaşın çevrimiçi`);
  if (inVoiceFriends) parts.push(`${inVoiceFriends} tanesi seste`);
  if (waiting.length) parts.push(`${waiting.length} sohbette seni bekleyen mesaj var`);
  const summary = parts.length
    ? parts.join(', ') + '.'
    : list.length && !friends.length
      ? 'Henüz arkadaşın yok. Birini ekleyince ne oynadığını, ne dinlediğini burada görürsün.'
      : list.length
        ? 'Şimdilik sessiz. Her şeyi okudun, kimse seste değil.'
      : "Xanaphian'a hoş geldin. Bir topluluk kur ya da bir davetle katıl, arkadaşların burada belirsin.";

  const firstRun = !list.length || !friends.length;
  const now = new Date();
  const ext = me.extra;
  return (
    <section className="ah scroll-thin">
      <div className="ah-glow" aria-hidden>
        {ext?.banner?.kind === 'image' && ext.banner.image ? (
          <img src={ext.banner.image} alt="" draggable={false} />
        ) : (
          <span style={{ background: `radial-gradient(60% 80% at 20% 0%, color-mix(in srgb, ${me.color} 55%, transparent), transparent 70%)` }} />
        )}
      </div>
      <div className="ah-in">
        <header className="ah-hero">
          <div className="ah-hero-main">
            <button className="ah-me" onClick={() => openModal({ type: 'profile', uid: me.id })} title="Profilini aç">
              <Avatar user={{ name: me.name, color: me.color, avatar: me.avatar, extra: me.extra }} size={76} status={me.status} />
            </button>
            <div className="ah-hello">
              <span className="ah-date">{now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              <h1>
                {greeting(now)}, <em>{me.name}</em>
              </h1>
              <p>{summary}</p>
            </div>
          </div>
          <div className="ah-stats">
            <Stat n={onlineFriends.length} label="çevrimiçi arkadaş" on={() => setHomeTab('online')} tone="ok" />
            <Stat n={rooms.reduce((n, r) => n + r.members.length, 0)} label="kişi seste" tone="voice" on={() => document.getElementById('ah-rooms')?.scrollIntoView({ behavior: 'smooth' })} />
            <Stat n={waiting.length} label="okunmamış sohbet" on={() => document.getElementById('ah-wait')?.scrollIntoView({ behavior: 'smooth' })} />
            <Stat n={mentionTotal} label="bahsetme" tone={mentionTotal ? 'alert' : undefined} on={() => document.getElementById('ah-wait')?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
          <div className="ah-actions">
            <button className="ah-act primary" onClick={() => openModal({ type: 'createCommunity' })}>
              <Plus size={18} /> <span>Topluluk oluştur</span>
            </button>
            <button className="ah-act" onClick={() => openModal({ type: 'join' })}>
              <LogIn size={17} /> <span>Davetle katıl</span>
            </button>
            <button className="ah-act" onClick={() => setHomeTab('add')}>
              <UserPlus size={17} /> <span>Arkadaş ekle</span>
            </button>
            <button className="ah-act" onClick={() => selectCommunity('explore')}>
              <Compass size={17} /> <span>Keşfet</span>
            </button>
          </div>
        </header>

        <div className="ah-grid">
          <div className="ah-main">
            <GettingStarted hasComm={list.length > 0} hasFriend={friends.length > 0} />

            {rooms.length > 0 && (
              <Section id="ah-rooms" icon={<Volume2 size={16} />} title="Seste şimdi" count={rooms.length}>
                <div className="ah-rooms">
                  {rooms.slice(0, 6).map((r) => (
                    <RoomCard key={r.ch.id} r={r} users={users} />
                  ))}
                </div>
              </Section>
            )}

            {lfg.length > 0 && (
              <Section icon={<Swords size={16} />} title="Açık takım ilanları" count={lfg.length}>
                <div className="ah-list">
                  {lfg.map((x) => (
                    <LfgRow key={x.m.id} x={x} users={users} />
                  ))}
                </div>
              </Section>
            )}

            {(list.length > 0 || waiting.length > 0) && (
              <Section
                id="ah-wait"
                icon={<MessageCircle size={16} />}
                title="Seni bekleyenler"
                count={waiting.length || undefined}
                extra={
                  waiting.length > 1 ? (
                    <button className="ah-link" onClick={() => waiting.forEach((w) => markRead(w.ch.id))}>
                      <CheckCheck size={14} /> Hepsini okundu say
                    </button>
                  ) : null
                }
              >
                {waiting.length ? (
                  <div className="ah-list">
                    {waiting.slice(0, 6).map((w) => (
                      <WaitRow key={w.ch.id} w={w} users={users} />
                    ))}
                    {waiting.length > 6 && <div className="ah-more">ve {waiting.length - 6} sohbet daha</div>}
                  </div>
                ) : (
                  <div className="ah-allread">
                    <span className="ah-allread-ic">
                      <Check size={18} />
                    </span>
                    <div>
                      <b>Hepsini okudun</b>
                      <span>Yeni bir mesaj ya da bahsetme gelince burada görünecek.</span>
                    </div>
                  </div>
                )}
              </Section>
            )}

            <Section icon={<Hash size={16} />} title="Toplulukların" count={list.length || undefined}>
              <div className="ah-comms">
                {list.map((c) => (
                  <CommCard key={c.id} c={c} />
                ))}
                <button className="ah-comm add" onClick={() => openModal({ type: 'createCommunity' })}>
                  <span className="ah-add-ic">
                    <Plus size={22} />
                  </span>
                  <b>Topluluk oluştur</b>
                  <span>ya da bir davetle katıl</span>
                </button>
              </div>
            </Section>

            {firstRun && <ExploreSuggest big />}
          </div>

          <aside className="ah-side">
            <FriendsPanel />
            {!firstRun && <ExploreSuggest />}
            <Tip />
          </aside>
        </div>
      </div>
    </section>
  );
}

function Stat({ n, label, on, tone }: { n: number; label: string; on: () => void; tone?: 'ok' | 'voice' | 'alert' }) {
  return (
    <button className={cx('ah-stat', tone, !n && 'zero')} onClick={on}>
      <b>{n}</b>
      <span>{label}</span>
    </button>
  );
}

function Section({ id, icon, title, count, extra, children }: { id?: string; icon: React.ReactNode; title: string; count?: number; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ah-sec" id={id}>
      <h3 className="ah-h">
        {icon}
        <span>{title}</span>
        {count !== undefined && <i>{count}</i>}
        <span className="ah-h-fill" />
        {extra}
      </h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------

function RoomCard({ r, users }: { r: Room; users: State['users'] }) {
  const cur = useVoice((s) => s.ch);
  const here = cur === r.ch.id;
  const screen = r.members.some((m) => m.screen);
  const shown = r.members.slice(0, 5);
  const names = r.members
    .map((m) => users[m.userId]?.name || r.c.users[m.userId]?.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  return (
    <div className={cx('ah-room', here && 'here')} style={{ ['--cc' as any]: r.c.color }}>
      <button className="ah-room-top" onClick={() => selectChannel(r.c.id, r.ch.id)}>
        <span className="ah-room-ic"><ChannelGlyph type={r.ch.type} size={20} /></span>
        <span className="ah-room-t">
          <b>{r.ch.name}</b>
          <span>
            <CommunityIcon c={r.c} size={14} /> {r.c.name}
          </span>
        </span>
        {screen && (
          <span className="ah-live" title="Ekran paylaşılıyor">
            <MonitorUp size={12} /> CANLI
          </span>
        )}
      </button>
      <div className="ah-room-people">
        <div className="ah-stack">
          {shown.map((m) => (
            <span key={m.sessionId} className="ah-stack-av" title={users[m.userId]?.name}>
              <Avatar user={users[m.userId] || r.c.users[m.userId]} size={30} plain />
            </span>
          ))}
          {r.members.length > shown.length && <span className="ah-stack-more">+{r.members.length - shown.length}</span>}
        </div>
        <span className="ah-room-names">{names}</span>
      </div>
      <button className={cx('ah-join', here && 'on')} disabled={here} onClick={() => joinVoice(r.c.id, r.ch.id)}>
        {here ? (
          <>
            <Check size={15} /> Buradasın
          </>
        ) : (
          <>
            <Volume2 size={15} /> Katıl
          </>
        )}
      </button>
    </div>
  );
}

function WaitRow({ w, users }: { w: Waiting; users: State['users'] }) {
  const last = useStore((s) => {
    const items = s.chans[w.ch.id]?.items;
    return items?.length ? items[items.length - 1] : undefined;
  });
  const peer = w.c.dm ? users[w.c.dm] || w.c.users[w.c.dm] : undefined;
  const author = last ? (last.authorId === useStore.getState().me.id ? 'Sen' : users[last.authorId]?.name || w.c.users[last.authorId]?.name || '') : '';
  const text = last ? plainText(last.content, w.c) || (last.attachments?.length ? 'bir dosya gönderdi' : '') : '';
  const open = () => (w.c.dm ? selectCommunity(w.c.id) : selectChannel(w.c.id, w.ch.id));
  return (
    <button className={cx('ah-row', w.mentions > 0 && 'hot')} onClick={open}>
      <span className="ah-row-ic">{peer ? <Avatar user={peer} size={38} status={useStore.getState().presence[peer.id]} /> : <CommunityIcon c={w.c} size={38} />}</span>
      <span className="ah-row-t">
        <span className="ah-row-title">
          {peer ? (
            <b>{peer.name}</b>
          ) : (
            <>
              <b>
                <ChannelGlyph type={w.ch.type} size={13} /> {w.ch.name}
              </b>
              <span className="ah-row-where">{w.c.name}</span>
            </>
          )}
        </span>
        <span className="ah-row-sub">
          {text ? (
            <>
              {author && !peer && <em>{author}: </em>}
              {text}
            </>
          ) : peer ? (
            'Yeni özel mesaj'
          ) : (
            'Yeni mesajlar'
          )}
        </span>
      </span>
      <span className="ah-row-end">
        <time>{ago(idTime(w.last))}</time>
        {w.mentions > 0 && <span className="badge">{w.mentions}</span>}
      </span>
    </button>
  );
}

function LfgRow({ x, users }: { x: OpenLfg; users: State['users'] }) {
  const who = users[x.m.authorId] || x.c.users[x.m.authorId];
  return (
    <button className="ah-row" onClick={() => selectChannel(x.c.id, x.ch.id)}>
      <span className="ah-row-ic">
        <Avatar user={who} size={38} />
      </span>
      <span className="ah-row-t">
        <span className="ah-row-title">
          <b>{x.card.g}</b>
          {x.card.m && <span className="ah-row-where">{x.card.m}</span>}
        </span>
        <span className="ah-row-sub">
          <em>{who?.name}</em> · #{x.ch.name} · {x.c.name}
        </span>
      </span>
      <span className="ah-row-end">
        <span className="ah-slots">{x.free} boş yer</span>
      </span>
    </button>
  );
}

function CommCard({ c }: { c: Community }) {
  const presence = useStore((s) => s.presence);
  const voice = useStore((s) => s.voice);
  const meId = useStore((s) => s.me.id);
  const { comm } = useUnread();
  const online = c.members.filter((m) => m.userId === meId || isOn(presence[m.userId])).length;
  const inVoice = c.channels.reduce((n, ch) => n + (isVoiceLike(ch.type) ? voice[ch.id]?.length || 0 : 0), 0);
  const u = comm[c.id];
  return (
    <button className={cx('ah-comm', u?.unread && 'unread')} onClick={() => selectCommunity(c.id)} style={{ ['--cc' as any]: c.color }}>
      {c.profile?.banner ? (
        <Banner user={{ color: c.color }} profile={{ banner: c.profile.banner }} refW={560} className="ah-comm-ban" />
      ) : (
        <span className="ah-comm-ban" style={{ background: `linear-gradient(135deg, ${c.color}, color-mix(in srgb, ${c.color} 25%, #000))` }} />
      )}
      <span className="ah-comm-ic">
        <CommunityIcon c={c} size={44} />
      </span>
      {u?.mentions ? <span className="badge ah-comm-badge">{u.mentions}</span> : u?.unread ? <span className="ah-comm-dot" title="Yeni mesajlar" /> : null}
      <b>{c.name}</b>
      <span className="ah-comm-meta">
        <span>
          <i className="dot online" /> {online} çevrimiçi
        </span>
        {inVoice > 0 && (
          <span className="v">
            <Volume2 size={12} /> {inVoice} seste
          </span>
        )}
        {!inVoice && <span>{c.members.length} üye</span>}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------

function FriendsPanel() {
  const friends = useStore((s) => s.friends);
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const acts = useActs((s) => s.acts);
  const voice = useStore((s) => s.voice);
  const rows = useMemo(() => {
    const inVoice = new Set<string>();
    for (const l of Object.values(voice)) for (const m of l || []) inVoice.add(m.userId);
    return Object.values(friends)
      .filter((f) => f.state === 'ok' && isOn(presence[f.user.id]))
      .map((f) => ({ u: users[f.user.id] || f.user, rank: (acts[f.user.id]?.length ? 2 : 0) + (inVoice.has(f.user.id) ? 3 : 0) + (presence[f.user.id] === 'online' ? 1 : 0) }))
      .sort((a, b) => b.rank - a.rank || a.u.name.localeCompare(b.u.name, 'tr'));
  }, [friends, users, presence, acts, voice]);
  const pending = useMemo(() => Object.values(friends).filter((f) => f.state === 'in').sort((a, b) => b.ts - a.ts), [friends]);
  const total = Object.values(friends).filter((f) => f.state === 'ok').length;
  return (
    <div className="ah-panel">
      <h3 className="ah-h">
        <Users size={16} />
        <span>Arkadaşlar</span>
        <i>
          {rows.length}/{total}
        </i>
        <span className="ah-h-fill" />
        <button className="ah-link" onClick={() => setHomeTab('all')}>
          Tümü <ChevronRight size={14} />
        </button>
      </h3>
      {pending.length > 0 && (
        <div className="ah-req">
          {pending.slice(0, 3).map((f) => (
            <div key={f.user.id} className="ah-fr req">
              <Avatar user={users[f.user.id] || f.user} size={34} />
              <span className="ah-fr-t">
                <b>{f.user.name}</b>
                <span>Arkadaşlık isteği</span>
              </span>
              <button className="ah-ib ok" onClick={() => acceptFriend(f.user.id)} title="Kabul et" aria-label="Kabul et">
                <Check size={16} />
              </button>
              <button className="ah-ib no" onClick={() => removeFriend(f.user.id)} title="Reddet" aria-label="Reddet">
                <X size={16} />
              </button>
            </div>
          ))}
          {pending.length > 3 && (
            <button className="ah-link" onClick={() => setHomeTab('pending')}>
              {pending.length - 3} istek daha
            </button>
          )}
        </div>
      )}
      {rows.length ? (
        <div className="ah-frs">
          {rows.slice(0, 10).map(({ u }) => (
            <FriendLine key={u.id} u={u} status={presence[u.id]} />
          ))}
          {rows.length > 10 && (
            <button className="ah-link center" onClick={() => setHomeTab('online')}>
              {rows.length - 10} kişi daha çevrimiçi
            </button>
          )}
        </div>
      ) : (
        <div className="ah-empty">
          <div className="ah-empty-avs" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <b>{total ? 'Şu an kimse çevrimiçi değil' : 'Henüz arkadaşın yok'}</b>
          <span>{total ? 'Arkadaşların gelince ne yaptıkları burada görünür.' : 'Topluluklarındaki birini ekle ya da arkadaş kodunu paylaş.'}</span>
          {!total && (
            <button className="btn primary sm" onClick={() => setHomeTab('add')}>
              <UserPlus size={14} /> Arkadaş ekle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FriendLine({ u, status }: { u: UserPublic; status: State['presence'][string] }) {
  const hasAct = useActs((s) => !!s.acts[u.id]?.length);
  const inVoice = useStore((s) => Object.values(s.voice).some((l) => l?.some((m) => m.userId === u.id)));
  const cs = activeCustom(u.profile);
  return (
    <div className="ah-fr" onClick={(e) => useStore.setState({ popout: { uid: u.id, x: e.clientX - 320, y: e.clientY - 40 } })} role="button">
      <Avatar user={u} size={36} status={status} />
      <span className="ah-fr-t">
        <b>{u.name}</b>
        {hasAct || inVoice ? (
          <PresenceLine uid={u.id} className="ah-fr-sub" />
        ) : (
          <span className="ah-fr-sub">{cs?.text ? `${cs.emoji ? cs.emoji + ' ' : ''}${cs.text}` : STATUS_LABEL[status]}</span>
        )}
      </span>
      <ActivityBadge uid={u.id} />
      <button
        className="ah-ib msg"
        onClick={(e) => {
          e.stopPropagation();
          openDm(u.id);
        }}
        title="Mesaj gönder"
        aria-label="Mesaj gönder"
      >
        <MessageCircle size={16} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

const START_KEY = 'xn.home.start';

function GettingStarted({ hasComm, hasFriend }: { hasComm: boolean; hasFriend: boolean }) {
  const me = useStore((s) => s.me);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(START_KEY) === '1';
    } catch {
      return false;
    }
  });
  const steps = [
    { done: !!me.avatar, icon: <ImageIcon size={18} />, t: 'Profil resmi ekle', d: 'Arkadaşların seni hemen tanısın.', go: () => openModal({ type: 'settings', tab: 'profile' }) },
    { done: !!(me.extra?.banner || me.bio), icon: <Sparkles size={18} />, t: 'Profilini süsle', d: 'Afiş, renkler ve hakkında yazısı.', go: () => openModal({ type: 'settings', tab: 'profile' }) },
    { done: hasComm, icon: <Plus size={18} />, t: 'Bir topluluğa gir', d: 'Kendin kur, davetle katıl ya da Keşfet.', go: () => openModal({ type: 'createCommunity' }) },
    { done: hasFriend, icon: <UserPlus size={18} />, t: 'Bir arkadaş ekle', d: 'Kodunu paylaş, özelden yazışın.', go: () => setHomeTab('add') },
  ];
  const n = steps.filter((s) => s.done).length;
  if (hidden || n === steps.length) return null;
  return (
    <section className="ah-start">
      <div className="ah-start-head">
        <div>
          <b>Başlarken</b>
          <span>
            {n}/{steps.length} adım tamam
          </span>
        </div>
        <div className="ah-prog">
          <i style={{ width: `${(n / steps.length) * 100}%` }} />
        </div>
        <button
          className="ah-ib"
          title="Gizle"
          aria-label="Gizle"
          onClick={() => {
            try {
              localStorage.setItem(START_KEY, '1');
            } catch {}
            setHidden(true);
          }}
        >
          <X size={16} />
        </button>
      </div>
      <div className="ah-steps">
        {steps.map((s) => (
          <button key={s.t} className={cx('ah-step', s.done && 'done')} onClick={s.go} disabled={s.done}>
            <span className="ah-step-ic">{s.done ? <Check size={18} /> : s.icon}</span>
            <b>{s.t}</b>
            <span>{s.d}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

let exploreCache: { at: number; items: ExploreItem[] } | null = null;

function ExploreSuggest({ big }: { big?: boolean }) {
  const homeOnline = useStore((s) => Object.values(s.conns).some((x) => x.home && x.status === 'online'));
  const [items, setItems] = useState<ExploreItem[] | null>(exploreCache?.items || null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!homeOnline || (exploreCache && Date.now() - exploreCache.at < 5 * 60_000)) return;
    let on = true;
    homeRequest<{ data: ExploreItem[] }>({ t: 'explore', rid: '' })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        exploreCache = { at: Date.now(), items: list };
        if (on) setItems(list);
      })
      .catch(() => on && setItems([]));
    return () => {
      on = false;
    };
  }, [homeOnline]);
  const shown = (items || []).filter((x) => !x.joined).sort((a, b) => b.online - a.online || b.members - a.members).slice(0, big ? 6 : 3);
  if (items && !shown.length) return null;
  const join = async (it: ExploreItem) => {
    setBusy(it.id);
    try {
      const r = await homeRequest<{ data: string }>({ t: 'join', cid: it.id, rid: '' });
      exploreCache = null;
      selectCommunity(r.data);
      toast(`${it.name} topluluğuna katıldın!`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
    setBusy(null);
  };
  return (
    <section className={cx(big ? 'ah-sec' : 'ah-panel', 'ah-ex', big && 'big')}>
      <h3 className="ah-h">
        <Compass size={16} />
        <span>{big ? 'Katılabileceğin topluluklar' : 'Keşfet'}</span>
        <span className="ah-h-fill" />
        <button className="ah-link" onClick={() => selectCommunity('explore')}>
          Tümü <ChevronRight size={14} />
        </button>
      </h3>
      {items === null ? (
        <div className="ah-loading">
          <LoaderCircle size={18} className="spin" />
        </div>
      ) : (
        <div className="ah-ex-list">
          {shown.map((it) => (
            <div key={it.id} className="ah-ex-item" style={{ ['--cc' as any]: it.color }}>
              <CommunityIcon c={it} size={big ? 46 : 38} />
              <span className="ah-ex-t">
                <b>{it.name}</b>
                <span>{it.tagline || it.description || catLabel(it.cat)}</span>
                <span className="ah-ex-meta">
                  <i className="dot online" /> {it.online} çevrimiçi · {it.members} üye
                </span>
              </span>
              <button className="btn primary sm" disabled={busy === it.id} onClick={() => join(it)}>
                {busy === it.id ? <LoaderCircle size={14} className="spin" /> : 'Katıl'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Tip() {
  const [i, setI] = useState(() => Math.floor(Date.now() / 86_400_000) % TIPS.length);
  const t = TIPS[i];
  return (
    <div className="ah-tip">
      <Lightbulb size={16} />
      <span>
        <b>{t.t}</b> {t.d}
      </span>
      <button className="ah-ib" onClick={() => setI((i + 1) % TIPS.length)} title="Sonraki ipucu" aria-label="Sonraki ipucu">
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
