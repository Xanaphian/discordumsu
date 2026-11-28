// v1.68 telefonda profil: Discord'un telefon uygulamasındaki düzene yakın. Üstte afiş, solda taşan büyük
// avatar, altında ad ve etiket, tam genişlik düğmeler, sekmeler (Ana Sayfa / Etkinlik / Ortaklar) ve kartlar.
import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, UserPlus, UserCheck, Check, MoreHorizontal, X, Pencil } from 'lucide-react';
import type { Community, Status, UserPublic } from '../../../shared/protocol';
import { idTime } from '../../../shared/protocol';
import { Avatar, BioText } from '../Common';
import { TagChip } from '../Etiket';
import { useStore, openModal, openDm, addFriend, acceptFriend, mutualFriends, selectCommunity, type MenuItem, openMenu } from '../../lib/store';
import { cx, displayName, fmtDay, memberRoles, roleColor } from '../../lib/util';
import { Banner, CustomStatusBubble } from './ProfileCard';
import { ActivityCards, AccountList, PrivateNote } from './Activity';
import { VoiceRoomCard } from './ProfileFull';
import { useActsOf } from '../../lib/activity';

type Tab = 'home' | 'activity' | 'mutual';

export function MobilProfil({ uid, user, status, c, isMe, onClose, menu }: { uid: string; user?: UserPublic; status?: Status; c?: Community; isMe?: boolean; onClose: () => void; menu: () => MenuItem[] }) {
  const users = useStore((s) => s.users);
  const communities = useStore((s) => s.communities);
  const friend = useStore((s) => s.friends[uid]);
  const inVoice = useStore((s) => Object.values(s.voice).some((l) => l?.some((x) => x.userId === uid)));
  const acts = useActsOf(uid);
  const p = user?.profile;
  const member = c?.members.find((x) => x.userId === uid);
  const roles = c && member ? memberRoles(c, member) : [];
  const name = c ? displayName(c, uid, users) : user?.name || 'İsimsiz';
  const color = c ? roleColor(c, uid) : '';
  const [tab, setTab] = useState<Tab>('home');
  const [mutual, setMutual] = useState<UserPublic[] | null | undefined>(undefined);
  useEffect(() => {
    if (isMe) return;
    let live = true;
    mutualFriends(uid).then((r) => live && setMutual(r));
    return () => {
      live = false;
    };
  }, [uid, isMe]);
  const comms = useMemo(() => Object.values(communities).filter((x) => !x.dm && x.members.some((m) => m.userId === uid)), [communities, uid]);
  const isUid = /^[0-9a-z]{14}$/.test(uid);

  return (
    <div className="mp">
      <div className="mp-scroll">
        <Banner user={user} profile={p} className="mp-banner" refW={390} />
        <div className="mp-top">
          <button className="mp-round" aria-label="Diğer seçenekler" onClick={(e) => openMenu(e, menu())}>
            <MoreHorizontal size={20} />
          </button>
          <button className="mp-round" aria-label="Kapat" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="mp-head">
          <div className="mp-avatar">
            <Avatar user={user} size={92} status={status} />
          </div>
          <div className="mp-bubble">
            <CustomStatusBubble profile={p} />
          </div>
        </div>
        <div className="mp-id">
          <h2 style={color ? { color } : undefined}>{name}</h2>
          <div className="mp-sub">
            <TagChip user={user} isMe={isMe} />
            {c && name !== user?.name && <span>{user?.name}</span>}
          </div>
        </div>

        <div className="mp-btns">
          {isMe ? (
            <button className="mp-btn primary" onClick={() => openModal({ type: 'settings', tab: 'profile' })}>
              <Pencil size={18} /> Profili düzenle
            </button>
          ) : (
            <>
              <button className="mp-btn primary" onClick={() => (onClose(), openDm(uid))}>
                <MessageCircle size={18} /> Mesaj
              </button>
              {friend?.state === 'ok' ? (
                <span className="mp-btn">
                  <UserCheck size={18} /> Arkadaşsınız
                </span>
              ) : friend?.state === 'out' ? (
                <span className="mp-btn">
                  <Check size={18} /> İstek gönderildi
                </span>
              ) : friend?.state === 'in' ? (
                <button className="mp-btn" onClick={() => acceptFriend(uid)}>
                  <UserCheck size={18} /> İsteği kabul et
                </button>
              ) : (
                !user?.bot && (
                  <button className="mp-btn" onClick={() => addFriend(uid)}>
                    <UserPlus size={18} /> Arkadaş ekle
                  </button>
                )
              )}
            </>
          )}
        </div>

        <nav className="mp-tabs">
          <button className={cx(tab === 'home' && 'on')} onClick={() => setTab('home')}>
            Ana Sayfa
          </button>
          <button className={cx(tab === 'activity' && 'on')} onClick={() => setTab('activity')}>
            Etkinlik
            {(acts.length > 0 || inVoice) && <i className="mp-dot" />}
          </button>
          {!isMe && (
            <button className={cx(tab === 'mutual' && 'on')} onClick={() => setTab('mutual')}>
              Ortaklar
            </button>
          )}
        </nav>

        {tab === 'home' && (
          <div className="mp-body">
            {user?.bio && (
              <section>
                <h4>Hakkımda</h4>
                <div className="mp-bio">
                  <BioText text={user.bio} />
                </div>
              </section>
            )}
            {(isUid || member) && (
              <section>
                <h4>Şu Tarihten Beri Üye</h4>
                <div className="mp-since">
                  {isUid && <span>Naphian · {fmtDay(idTime(uid))}</span>}
                  {member && c && (
                    <span>
                      {c.name} · {fmtDay(member.joinedAt)}
                    </span>
                  )}
                </div>
              </section>
            )}
            {roles.length > 0 && (
              <section>
                <h4>Roller</h4>
                <div className="mp-roles">
                  {roles.map((r) => (
                    <span key={r.id} className="mp-role">
                      <i style={{ background: r.color || 'var(--text-3)' }} />
                      {r.icon && <span>{r.icon}</span>}
                      {r.name}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {!!p?.accounts?.length && (
              <section>
                <h4>Bağlantılar</h4>
                <div className="mp-card">
                  <AccountList profile={p} />
                </div>
              </section>
            )}
            {!isMe && (
              <section>
                <div className="mp-card mp-note">
                  <PrivateNote uid={uid} />
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'activity' && (
          <div className="mp-body">
            {inVoice && <VoiceRoomCard uid={uid} onClose={onClose} />}
            <ActivityCards uid={uid} />
            {!inVoice && !acts.length && <p className="mp-empty">Şu an bir etkinlik yok.</p>}
          </div>
        )}

        {tab === 'mutual' && (
          <div className="mp-body">
            <section>
              <h4>Ortak arkadaşlar{mutual?.length ? ` — ${mutual.length}` : ''}</h4>
              {mutual === undefined ? (
                <p className="mp-empty">Yükleniyor…</p>
              ) : !mutual?.length ? (
                <p className="mp-empty">Ortak arkadaşınız yok.</p>
              ) : (
                <div className="mp-card">
                  {mutual.map((f) => (
                    <button key={f.id} className="mp-row" onClick={() => openModal({ type: 'profile', uid: f.id })}>
                      <Avatar user={f} size={34} />
                      <b>{f.name}</b>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section>
              <h4>Ortak topluluklar{comms.length ? ` — ${comms.length}` : ''}</h4>
              {!comms.length ? (
                <p className="mp-empty">Ortak topluluğunuz yok.</p>
              ) : (
                <div className="mp-card">
                  {comms.map((x) => (
                    <button key={x.id} className="mp-row" onClick={() => (onClose(), selectCommunity(x.id))}>
                      <span className="mp-comm" style={{ background: x.color }}>
                        {x.icon ? <img src={x.icon} alt="" /> : x.name.slice(0, 2).toUpperCase()}
                      </span>
                      <b>{x.name}</b>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
