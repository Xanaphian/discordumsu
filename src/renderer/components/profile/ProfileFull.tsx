// Tam profil (v1.29): geniş pencere, solda kimlik sütunu, sağda sekmeli içerik.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock, Cake, Pencil, Copy, MessageCircle, X, CalendarDays, HeartHandshake, DoorOpen, Volume2, MonitorUp, LogIn, Users,
  Activity as ActivityIcon, UserRound, Home,
} from 'lucide-react';
import type { Community, Status, UserPublic } from '../../../shared/protocol';
import { idTime } from '../../../shared/protocol';
import { Avatar, STATUS_LABEL, Tooltip } from '../Common';
import { useStore, openModal, toast, selectCommunity, openDm, mutualFriends } from '../../lib/store';
import { useVoice, joinVoice } from '../../lib/voice';
import { cx, displayName, fmtDay, memberRoles, copyText, roleColor } from '../../lib/util';
import { cardTheme, imgFrameStyle } from './look';
import { ActivityCards, AccountList, PrivateNote, RecentList } from './Activity';
import { useActsOf } from '../../lib/activity';
import {
  Banner, CardFx, NameText, CustomStatusBubble, ActivityRow, LinkList, FriendButton, useBadges, useMinuteTick, tzNow, tzDiff, fmtBirthday,
} from './ProfileCard';

type Tab = 'activity' | 'about' | 'friends' | 'comms';

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
  const info = key && list ? { ch, cid, list, dm: !!dm, chName, cName } : null;
  const users = useStore((s) => s.users);
  const comms = useStore((s) => s.communities);
  if (!info) return null;
  const self = info.list.find((x) => x.userId === uid);
  const people = info.list.map((m) => users[m.userId] || comms[info.cid]?.users[m.userId]).filter(Boolean) as UserPublic[];
  const shown = people.slice(0, 6);
  const here = myCh === info.ch;
  return (
    <div className="xp-room">
      <div className="xp-room-top">
        <span className="xp-room-ic">{self?.screen ? <MonitorUp size={15} /> : <Volume2 size={15} />}</span>
        <div className="xp-room-t">
          <b>{info.dm ? 'Özel aramada' : info.chName}</b>
          <small>
            {self?.screen ? 'Ekranını paylaşıyor' : 'Sesli odada'}
            {!info.dm && info.cName && ` · ${info.cName}`}
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
          !info.dm &&
          info.cid && (
            <button className="btn sm primary xp-room-join" onClick={() => (onClose?.(), joinVoice(info.cid, info.ch))}>
              <LogIn size={14} /> Odaya katıl
            </button>
          )
        )}
      </div>
    </div>
  );
}

function Label({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h4 className="xp-label">
      <span>{children}</span>
      {count !== undefined && <em>{count}</em>}
      <i />
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

export function ProfileFull({ uid, user, status, c, isMe, onClose }: { uid: string; user: UserPublic | undefined; status?: Status; c?: Community; isMe?: boolean; onClose?: () => void }) {
  const users = useStore((s) => s.users);
  const communities = useStore((s) => s.communities);
  const friend = useStore((s) => s.friends[uid]);
  const presence = useStore((s) => s.presence);
  const inVoice = useStore((s) => Object.values(s.voice).some((l) => l?.some((x) => x.userId === uid)));
  const p = user?.profile;
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
  const mutualC = useMemo(
    () => (isMe ? [] : Object.values(communities).filter((x) => !x.dm && x.members.some((m) => m.userId === uid))),
    [isMe, communities, uid],
  );
  const [mutualF, setMutualF] = useState<UserPublic[] | null>(null);
  useEffect(() => {
    if (isMe || bot) return;
    let live = true;
    mutualFriends(uid).then((r) => live && setMutualF(r));
    return () => {
      live = false;
    };
  }, [uid, isMe, bot]);
  const hasAbout = !!(user?.bio || p?.tags?.length || p?.links?.length || roles.length || p?.activity);
  const [tab, setTab] = useState<Tab>(() => (acts.length || inVoice || recent.length || !hasAbout ? 'activity' : 'about'));
  const isUid = /^[0-9a-z]{14}$/.test(uid);

  const tabs: [Tab, string, React.ReactNode, number?][] = [
    ['activity', 'Etkinlik', <ActivityIcon size={14} key="a" />],
    ['about', 'Hakkında', <UserRound size={14} key="b" />],
  ];
  if (!isMe && !bot && mutualF) tabs.push(['friends', 'Arkadaşlar', <Users size={14} key="c" />, mutualF.length]);
  if (!isMe && mutualC.length) tabs.push(['comms', 'Topluluklar', <Home size={14} key="d" />, mutualC.length]);

  const openProfile = (id: string) => openModal({ type: 'profile', uid: id });

  return (
    <div className={cx('pcard pcard-full pcard-wide', theme && 'themed', theme && 'tone-' + theme.tone, p?.bg && 'has-bg')} style={theme?.style}>
      {p?.bg && (
        <>
          <div className="pc-bgimg" style={{ filter: p.bg.blur ? `blur(${p.bg.blur}px)` : undefined }}>
            <img className="pc-img" src={p.bg.image} alt="" draggable={false} style={imgFrameStyle(p.bg)} />
          </div>
          <div className="pc-bgdim" style={{ opacity: (p.bg.dim ?? 45) / 100 }} />
        </>
      )}
      <CardFx effect={p?.effect} />

      {/* ---------------- sol: kimlik ---------------- */}
      <aside className="xp-side">
        <Banner user={user} profile={p} className="xp-banner" />
        <div className="xp-id">
          <div className="xp-av">
            <Avatar user={user} size={108} status={status} />
          </div>
          <CustomStatusBubble profile={p} />
          <NameText profile={p} color={color || undefined} className="pc-name xp-name">
            {shownName}
          </NameText>
          <div className="xp-handle">
            {user?.name && <span>@{user.name}</span>}
            {p?.pronouns && <span>{p.pronouns}</span>}
            {bot && <span className="tag-bot">{uid === 'kovan-asistan' ? 'ASİSTAN' : 'BOT'}</span>}
          </div>
          {status && <span className={cx('xp-status', status)}>{STATUS_LABEL[status]}</span>}
          {badges.length > 0 && (
            <div className="xp-badges">
              {badges.map((b) => (
                <Tooltip key={b.id} text={b.label}>
                  <span className={cx('xp-badge', 'b-' + b.id)}>{b.icon}</span>
                </Tooltip>
              ))}
            </div>
          )}
          <div className="xp-actions pc-actions">
            {isMe ? (
              <button className="btn primary xp-main-btn" onClick={() => (onClose?.(), openModal({ type: 'settings', tab: 'profile' }))}>
                <Pencil size={15} /> Profili düzenle
              </button>
            ) : bot ? (
              <button className="btn ghost xp-main-btn" onClick={() => (copyText(uid), toast('Kimlik kopyalandı', 'ok'), onClose?.())}>
                <Copy size={15} /> Kimliği kopyala
              </button>
            ) : (
              <>
                {c?.dm !== uid && (
                  <button className="btn primary xp-main-btn" onClick={() => (onClose?.(), openDm(uid))}>
                    <MessageCircle size={15} /> Mesaj yaz
                  </button>
                )}
                <FriendButton uid={uid} />
                <Tooltip text="Kimliği kopyala">
                  <button className="btn sm ghost xp-sq" aria-label="Kimliği kopyala" onClick={() => (copyText(uid), toast('Kimlik kopyalandı', 'ok'))}>
                    <Copy size={14} />
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        <div className="xp-side-body">
          {(isUid || member || friend?.state === 'ok' || p?.tz !== undefined || p?.birthday) && (
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
          )}
          {!!p?.accounts?.length && (
            <section className="xp-block">
              <Label>Bağlı hesaplar</Label>
              <AccountList profile={p} liveSvcs={liveSvcs} chips />
            </section>
          )}
          {!isMe && !bot && (
            <section className="xp-block">
              <PrivateNote uid={uid} />
            </section>
          )}
        </div>
      </aside>

      {/* ---------------- sağ: sekmeler ---------------- */}
      <main className="xp-main">
        <div className="xp-top">
          <nav className="xp-tabs" role="tablist">
            {tabs.map(([k, label, icon, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={cx(tab === k && 'on')} onClick={() => setTab(k)} title={k === 'friends' ? 'Ortak arkadaşlarınız' : k === 'comms' ? 'Ortak topluluklarınız' : undefined}>
                {icon}
                <span>{label}</span>
                {n !== undefined && <em>{n}</em>}
                {k === 'activity' && (acts.length > 0 || inVoice) && <i className="xp-live" />}
              </button>
            ))}
          </nav>
          <button className="icon-btn xp-close" onClick={onClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

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
                <Label count={recent.length || undefined}>Son 30 gün</Label>
                <RecentList
                  profile={p}
                  empty={
                    <div className="xp-empty">
                      {isMe ? 'Henüz kaydedilmiş etkinliğin yok. Bir oyun açtığında ya da müzik dinlediğinde burada görünür.' : 'Son 30 günde paylaşılmış bir etkinlik yok.'}
                    </div>
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
              {!hasAbout && <div className="xp-empty">{isMe ? 'Profilinde henüz bir şey yazmıyor. "Profili düzenle"den kendini anlatabilirsin.' : 'Henüz kendinden bahsetmemiş.'}</div>}
            </>
          )}

          {tab === 'friends' && mutualF && (
            <div className="xp-people">
              {mutualF.length === 0 && <div className="xp-empty">Ortak arkadaşınız yok.</div>}
              {mutualF.map((f) => (
                <button key={f.id} className="xp-person" onClick={() => openProfile(f.id)}>
                  <Avatar user={f} size={38} status={presence[f.id] || 'offline'} />
                  <span className="xp-person-t">
                    <NameText profile={f.profile}>{f.name}</NameText>
                    <small>{STATUS_LABEL[presence[f.id] || 'offline']}</small>
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === 'comms' && (
            <div className="xp-people">
              {mutualC.map((m) => (
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
          )}
        </div>
      </main>
    </div>
  );
}
