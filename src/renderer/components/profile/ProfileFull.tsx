// Tam profil (v1.31): geniş afişli düzen. Üstte afiş + kimlik şeridi, solda künye kartları,
// sağda büyük düğmeler (Etkinlik, Ortak arkadaşlar, Ortak topluluklar, Hakkında) ve içerik.
// Kişi düğmelerin sırasını, hangilerinin görüneceğini ve açılış düğmesini kendisi seçer.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock, Cake, Pencil, Copy, MessageCircle, X, CalendarDays, HeartHandshake, DoorOpen, Volume2, MonitorUp, LogIn, Users,
  Activity as ActivityIcon, UserRound, Home, SlidersHorizontal, Gamepad2, Link2,
} from 'lucide-react';
import type { Community, Status, UserPublic } from '../../../shared/protocol';
import { idTime } from '../../../shared/protocol';
import { fullTabs, type FullTab } from '../../../shared/profile';
import { Avatar, STATUS_LABEL, Tooltip } from '../Common';
import { useStore, openModal, toast, selectCommunity, openDm, mutualFriends } from '../../lib/store';
import { useVoice, joinVoice } from '../../lib/voice';
import { cx, displayName, fmtDay, memberRoles, copyText, roleColor } from '../../lib/util';
import { bannerBackground, cardTheme, imgFrameStyle } from './look';
import { ActivityCards, AccountList, PrivateNote, RecentList } from './Activity';
import { useActsOf } from '../../lib/activity';
import {
  Banner, CardFx, NameText, CustomStatusBubble, ActivityRow, LinkList, FriendButton, useBadges, useMinuteTick, tzNow, tzDiff, fmtBirthday,
} from './ProfileCard';
import { focusProfileSection } from './ProfileEditor';

/** Kişinin bulunduğu ses odası: odadakiler ve katıl düğmesi */
function VoiceRoomCard({ uid, onClose }: { uid: string; onClose?: () => void }) {
  const myCh = useVoice((v) => v.ch);
  // seçici düz yazı döndürür (her çağrıda yeni nesne sonsuz yeniden çizime yol açar)
  const key = useStore((s) => {
    for (const [ch, list] of Object.entries(s.voice)) {
      if (!list?.some((x) => x.userId === uid)) continue;
      for (const c of Object.values(s.communities)) {
        const chan = c.channels.find((x) => x.id === ch);
        if (chan) return [ch, c.id, c.dm ? '1' : '', chan.name, c.name].join('\u0000');
      }
      return [ch, '', '', 'Sesli oda', ''].join('\u0000');
    }
    return '';
  });
  const [ch, cid, dm, chName, cName] = key.split('\u0000');
  const list = useStore((s) => (ch ? s.voice[ch] : undefined));
  const users = useStore((s) => s.users);
  const comms = useStore((s) => s.communities);
  if (!key || !list) return null;
  const self = list.find((x) => x.userId === uid);
  const people = list.map((m) => users[m.userId] || comms[cid]?.users[m.userId]).filter(Boolean) as UserPublic[];
  const shown = people.slice(0, 6);
  const here = myCh === ch;
  return (
    <div className="xp-room">
      <div className="xp-room-top">
        <span className="xp-room-ic">{self?.screen ? <MonitorUp size={15} /> : <Volume2 size={15} />}</span>
        <div className="xp-room-t">
          <b>{dm ? 'Özel aramada' : chName}</b>
          <small>
            {self?.screen ? 'Ekranını paylaşıyor' : 'Sesli odada'}
            {!dm && cName && ` · ${cName}`}
          </small>
        </div>
      </div>
      <div className="xp-room-people">
        <div className="xp-stack">
          {shown.map((u) => (
            <span key={u.id} className="xp-stack-av" title={u.name}>
              <Avatar user={u} size={30} plain />
            </span>
          ))}
          {people.length > shown.length && <span className="xp-stack-more">+{people.length - shown.length}</span>}
        </div>
        <span className="xp-room-count">{people.length} kişi</span>
        {here ? (
          <span className="xp-room-here">Sen de buradasın</span>
        ) : (
          !dm &&
          cid && (
            <button className="btn sm primary xp-room-join" onClick={() => (onClose?.(), joinVoice(cid, ch))}>
              <LogIn size={14} /> Odaya katıl
            </button>
          )
        )}
      </div>
    </div>
  );
}

function Label({ children, count, right }: { children: React.ReactNode; count?: number; right?: React.ReactNode }) {
  return (
    <h4 className="xp-label">
      <span>{children}</span>
      {count !== undefined && <em>{count}</em>}
      <i />
      {right}
    </h4>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="xp-fact">
      <span className="xp-fact-ic">{icon}</span>
      <span className="xp-fact-l">{label}</span>
      <span className="xp-fact-v">{children}</span>
    </div>
  );
}

function PersonRow({ u, sub, onClick }: { u: UserPublic; sub?: string; onClick: () => void }) {
  const st = useStore((s) => s.presence[u.id] || 'offline');
  return (
    <button className="xp-person" onClick={onClick}>
      <Avatar user={u} size={40} status={st} />
      <span className="xp-person-t">
        <NameText profile={u.profile}>{u.name}</NameText>
        <small>{sub || STATUS_LABEL[st]}</small>
      </span>
    </button>
  );
}

function Empty({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="xp-empty">
      <span className="xp-empty-ic">{icon}</span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

const openLayout = (onClose?: () => void) => {
  focusProfileSection('fulllayout');
  onClose?.();
  openModal({ type: 'settings', tab: 'profile' });
};

export function ProfileFull({ uid, user, status, c, isMe, onClose }: { uid: string; user: UserPublic | undefined; status?: Status; c?: Community; isMe?: boolean; onClose?: () => void }) {
  const users = useStore((s) => s.users);
  const communities = useStore((s) => s.communities);
  const friends = useStore((s) => s.friends);
  const friend = friends[uid];
  const inVoice = useStore((s) => Object.values(s.voice).some((l) => l?.some((x) => x.userId === uid)));
  const p = user?.profile;
  const layout = p?.full;
  const theme = cardTheme(p);
  const badges = useBadges(uid, c, p, user?.bot);
  const acts = useActsOf(uid);
  const liveSvcs = acts.filter((a) => a.kind === 'streaming').map((a) => a.src || '');
  useMinuteTick(p?.tz !== undefined);
  const bot = !!user?.bot || uid === 'kovan-asistan';
  const member = c?.members.find((x) => x.userId === uid);
  const roles = c && member ? memberRoles(c, member) : [];
  const shownName = c ? displayName(c, uid, users) : user?.name || 'İsimsiz';
  const color = c ? roleColor(c, uid) : '';
  const recent = (p?.recent || []).filter((r) => r.ts > Date.now() - 30 * 86_400_000);

  // ortak topluluklar (kendi profilinde: toplulukların)
  const comms = useMemo(
    () => Object.values(communities).filter((x) => !x.dm && (isMe || x.members.some((m) => m.userId === uid))),
    [isMe, communities, uid],
  );
  // ortak arkadaşlar (kendi profilinde: arkadaşların). Eski sunucu cevap vermezse null.
  const myFriends = useMemo(() => Object.values(friends).filter((f) => f.state === 'ok').map((f) => f.user), [friends]);
  const [mutualF, setMutualF] = useState<UserPublic[] | null | undefined>(undefined);
  useEffect(() => {
    if (isMe || bot) return;
    let live = true;
    mutualFriends(uid).then((r) => live && setMutualF(r));
    return () => {
      live = false;
    };
  }, [uid, isMe, bot]);
  const friendList = isMe ? myFriends : mutualF;

  let tabs = fullTabs(layout);
  if (bot) tabs = tabs.filter((t) => t !== 'friends');
  if (!tabs.length) tabs = ['activity'];
  const hasAbout = !!(user?.bio || p?.tags?.length || p?.links?.length || roles.length || p?.activity);
  const [tab, setTab] = useState<FullTab>(() => {
    if (layout?.open && tabs.includes(layout.open)) return layout.open;
    if (layout?.order?.length) return tabs[0];
    if (tabs.includes('activity') && (acts.length || inVoice || recent.length)) return 'activity';
    if (tabs.includes('about') && hasAbout) return 'about';
    return tabs[0];
  });
  const isUid = /^[0-9a-z]{14}$/.test(uid);

  const live = acts[0];
  const META: Record<FullTab, { icon: React.ReactNode; title: string; sub: string; n?: number; dot?: boolean }> = {
    activity: {
      icon: <ActivityIcon size={18} />,
      title: 'Etkinlik',
      sub: live ? (live.kind === 'listening' ? live.details || live.name : live.name) : inVoice ? 'Sesli odada' : recent.length ? `Son 30 günde ${recent.length} kayıt` : 'Şu an sessiz',
      dot: !!live || inVoice,
    },
    friends: {
      icon: <Users size={18} />,
      title: isMe ? 'Arkadaşların' : 'Ortak arkadaşlar',
      sub: friendList ? (friendList.length ? `${friendList.length} kişi` : 'Henüz yok') : friendList === null ? 'Sunucu güncellenince' : 'Yükleniyor…',
      n: friendList?.length,
    },
    comms: {
      icon: <Home size={18} />,
      title: isMe ? 'Toplulukların' : 'Ortak topluluklar',
      sub: comms.length ? `${comms.length} topluluk` : 'Henüz yok',
      n: comms.length,
    },
    about: {
      icon: <UserRound size={18} />,
      title: 'Hakkında',
      sub: p?.tags?.length ? p.tags.slice(0, 2).join(' · ') : user?.bio ? 'Biyografi' : 'Kendinden bahset',
    },
  };

  const openProfile = (id: string) => openModal({ type: 'profile', uid: id });
  const heroImg = p?.banner?.kind === 'image' ? p.banner.image : undefined;
  const heroColor = p?.banner?.a || user?.color || '#c8aa6e';

  return (
    <div
      className={cx('pcard pcard-full pcard-wide xp2', 'btn-' + (layout?.btn || 'tiles'), theme && 'themed', theme && 'tone-' + theme.tone, p?.bg && 'has-bg')}
      style={{ ...theme?.style, ['--hero' as any]: heroColor }}
    >
      {p?.bg && (
        <>
          <div className="pc-bgimg" style={{ filter: p.bg.blur ? `blur(${p.bg.blur}px)` : undefined }}>
            <img className="pc-img" src={p.bg.image} alt="" draggable={false} style={imgFrameStyle(p.bg)} />
          </div>
          <div className="pc-bgdim" style={{ opacity: (p.bg.dim ?? 45) / 100 }} />
        </>
      )}
      {/* afişin rengi/resmi pencerenin üstüne yumuşakça taşar */}
      <div className="xp-glow" aria-hidden style={heroImg ? undefined : { background: bannerBackground(p?.banner, user?.color || '#c8aa6e') }}>
        {heroImg && <img src={heroImg} alt="" draggable={false} />}
      </div>
      <CardFx effect={p?.effect} />

      <header className="xp-hero">
        <Banner user={user} profile={p} className="xp-banner" />
        <button className="icon-btn xp-close" onClick={onClose} aria-label="Kapat">
          <X size={18} />
        </button>
      </header>

      <div className="xp-idbar">
        <div className="xp-av">
          <Avatar user={user} size={124} status={status} />
        </div>
        <div className="xp-idtext">
          <div className="xp-nameline">
            <NameText profile={p} color={color || undefined} className="pc-name xp-name">
              {shownName}
            </NameText>
            {badges.length > 0 && (
              <span className="xp-badges">
                {badges.map((b) => (
                  <Tooltip key={b.id} text={b.label}>
                    <span className={cx('xp-badge', 'b-' + b.id)}>{b.icon}</span>
                  </Tooltip>
                ))}
              </span>
            )}
          </div>
          <div className="xp-handle">
            {user?.name && <span>@{user.name}</span>}
            {p?.pronouns && <span>{p.pronouns}</span>}
            {status && <span className={cx('xp-status', status)}>{STATUS_LABEL[status]}</span>}
            {bot && <span className="tag-bot">{uid === 'kovan-asistan' ? 'ASİSTAN' : 'BOT'}</span>}
          </div>
          <CustomStatusBubble profile={p} />
        </div>
        <div className="xp-actions pc-actions">
          {isMe ? (
            <>
              <button className="btn ghost xp-sq-txt" onClick={() => openLayout(onClose)} title="Tam profil düzenini değiştir">
                <SlidersHorizontal size={15} /> Düzen
              </button>
              <button className="btn primary xp-main-btn" onClick={() => (onClose?.(), openModal({ type: 'settings', tab: 'profile' }))}>
                <Pencil size={15} /> Profili düzenle
              </button>
            </>
          ) : bot ? (
            <button className="btn ghost xp-main-btn" onClick={() => (copyText(uid), toast('Kimlik kopyalandı', 'ok'), onClose?.())}>
              <Copy size={15} /> Kimliği kopyala
            </button>
          ) : (
            <>
              <FriendButton uid={uid} />
              <Tooltip text="Kimliği kopyala">
                <button className="btn sm ghost xp-sq" aria-label="Kimliği kopyala" onClick={() => (copyText(uid), toast('Kimlik kopyalandı', 'ok'))}>
                  <Copy size={15} />
                </button>
              </Tooltip>
              {c?.dm !== uid && (
                <button className="btn primary xp-main-btn" onClick={() => (onClose?.(), openDm(uid))}>
                  <MessageCircle size={15} /> Mesaj yaz
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="xp-body">
        {/* ---------------- sol: künye ---------------- */}
        <aside className="xp-side">
          {(isUid || member || friend?.state === 'ok' || p?.tz !== undefined || p?.birthday) && (
            <section className="xp-card">
              <Label>Künye</Label>
              <div className="xp-facts">
                {isUid && (
                  <Fact icon={<CalendarDays size={14} />} label="Xanaphian'da">
                    {fmtDay(idTime(uid))}
                  </Fact>
                )}
                {friend?.state === 'ok' && (
                  <Fact icon={<HeartHandshake size={14} />} label="Arkadaşsınız">
                    {fmtDay(friend.ts)}
                  </Fact>
                )}
                {member && (
                  <Fact icon={<DoorOpen size={14} />} label="Toplulukta">
                    {fmtDay(member.joinedAt)}
                  </Fact>
                )}
                {p?.tz !== undefined && (
                  <Fact icon={<Clock size={14} />} label="Yerel saat">
                    <b>{tzNow(p.tz)}</b>
                    {!isMe && <em>{tzDiff(p.tz)}</em>}
                  </Fact>
                )}
                {p?.birthday && (
                  <Fact icon={<Cake size={14} />} label="Doğum günü">
                    {fmtBirthday(p.birthday)}
                  </Fact>
                )}
              </div>
            </section>
          )}
          {!!p?.accounts?.length ? (
            <section className="xp-card">
              <Label count={p.accounts.length}>Bağlı hesaplar</Label>
              <AccountList profile={p} liveSvcs={liveSvcs} chips />
            </section>
          ) : (
            isMe && (
              <button className="xp-card xp-add" onClick={() => (focusProfileSection('accounts'), onClose?.(), openModal({ type: 'settings', tab: 'profile' }))}>
                <Link2 size={16} /> Hesap bağla <em>Steam, Riot, Spotify…</em>
              </button>
            )
          )}
          {!isMe && !bot && (
            <section className="xp-card xp-note-card">
              <PrivateNote uid={uid} />
            </section>
          )}
        </aside>

        {/* ---------------- sağ: düğmeler + içerik ---------------- */}
        <main className="xp-main">
          <nav className="xp-nav" role="tablist" style={{ ['--n' as any]: tabs.length }}>
            {tabs.map((k) => {
              const m = META[k];
              return (
                <button key={k} role="tab" aria-selected={tab === k} className={cx('xp-tile', 't-' + k, tab === k && 'on')} onClick={() => setTab(k)}>
                  <span className="xp-tile-ic">
                    {m.icon}
                    {m.dot && <i className="xp-live" />}
                  </span>
                  <span className="xp-tile-t">
                    <b>
                      {m.title}
                      {m.n !== undefined && <em>{m.n}</em>}
                    </b>
                    <small>{m.sub}</small>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="xp-pane">
            {tab === 'activity' && (
              <>
                {(acts.length > 0 || inVoice) && (
                  <section className="xp-block">
                    <Label>Şu an</Label>
                    <div className="xp-now">
                      {acts.length > 0 && <ActivityCards uid={uid} />}
                      <VoiceRoomCard uid={uid} onClose={onClose} />
                    </div>
                  </section>
                )}
                <section className="xp-block">
                  <Label count={recent.length || undefined}>Son etkinlik</Label>
                  <RecentList
                    profile={p}
                    empty={
                      <Empty
                        icon={<Gamepad2 size={22} />}
                        title={isMe ? 'Henüz kayıt yok' : 'Son 30 günde paylaşılmış etkinlik yok'}
                        text={isMe ? 'Bir oyun açtığında ya da müzik dinlediğinde burada görünür.' : undefined}
                      />
                    }
                  />
                </section>
              </>
            )}

            {tab === 'about' && (
              <>
                {user?.bio && (
                  <section className="xp-block">
                    <Label>Hakkında</Label>
                    <div className="pc-bio xp-bio">{user.bio}</div>
                  </section>
                )}
                {p?.activity && (
                  <section className="xp-block">
                    <Label>Durum</Label>
                    <ActivityRow profile={p} />
                  </section>
                )}
                {!!p?.tags?.length && (
                  <section className="xp-block">
                    <Label>İlgi alanları</Label>
                    <div className="pc-tags">
                      {p.tags.map((t) => (
                        <span key={t} className="pc-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
                {!!p?.links?.length && (
                  <section className="xp-block">
                    <Label>Bağlantılar</Label>
                    <LinkList profile={p} />
                  </section>
                )}
                {roles.length > 0 && (
                  <section className="xp-block">
                    <Label count={roles.length}>Roller</Label>
                    <div className="role-chips">
                      {roles.map((r) => (
                        <span key={r.id} className="role-chip">
                          <i style={{ background: r.color || 'var(--text-3)' }} />
                          {r.icon && <span className="role-icon">{r.icon}</span>}
                          {r.name}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
                {!hasAbout && (
                  <Empty
                    icon={<UserRound size={22} />}
                    title={isMe ? 'Kendini anlat' : 'Henüz kendinden bahsetmemiş'}
                    text={isMe ? 'Biyografi, ilgi alanları ve bağlantılar burada görünür.' : undefined}
                    action={
                      isMe && (
                        <button className="btn sm primary" onClick={() => (onClose?.(), openModal({ type: 'settings', tab: 'profile' }))}>
                          <Pencil size={14} /> Profili düzenle
                        </button>
                      )
                    }
                  />
                )}
              </>
            )}

            {tab === 'friends' &&
              (friendList ? (
                friendList.length ? (
                  <div className="xp-people">
                    {friendList.map((f) => (
                      <PersonRow key={f.id} u={f} onClick={() => openProfile(f.id)} />
                    ))}
                  </div>
                ) : (
                  <Empty icon={<Users size={22} />} title={isMe ? 'Henüz arkadaşın yok' : 'Ortak arkadaşınız yok'} text={isMe ? 'Bir profilden arkadaşlık isteği gönderebilir ya da arkadaş kodunu paylaşabilirsin.' : undefined} />
                )
              ) : (
                <Empty
                  icon={<Users size={22} />}
                  title={friendList === null ? 'Ortak arkadaşlar şu an görünmüyor' : 'Yükleniyor…'}
                  text={friendList === null ? 'Sunucu güncellendiğinde burada listelenecek.' : undefined}
                />
              ))}

            {tab === 'comms' &&
              (comms.length ? (
                <div className="xp-people">
                  {comms.map((m) => (
                    <button
                      key={m.id}
                      className="xp-person"
                      onClick={() => {
                        onClose?.();
                        selectCommunity(m.id);
                      }}
                    >
                      <span className="pc-mutual-ic xp-comm-ic" style={{ background: m.color }}>
                        {m.icon ? <img src={m.icon} alt="" /> : m.name.slice(0, 2).toLocaleUpperCase('tr')}
                      </span>
                      <span className="xp-person-t">
                        <b>{m.name}</b>
                        <small>{m.members.length} üye</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty icon={<Home size={22} />} title={isMe ? 'Henüz bir topluluğun yok' : 'Ortak topluluğunuz yok'} />
              ))}
          </div>
        </main>
      </div>
    </div>
  );
}
