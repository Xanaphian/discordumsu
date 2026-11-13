import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Gamepad2, Headphones, Tv, Briefcase, BookOpen, Clock, Cake, Globe, Crown, Pencil, Copy, Maximize2, AtSign, Sparkles, Bot,
  MessageCircle, UserPlus, UserCheck, Check,
} from 'lucide-react';
import type { Community, Status, UserPublic } from '../../../shared/protocol';
import { idTime } from '../../../shared/protocol';
import { activeCustom, type ActivityKind, type CardEffect, type ProfileExtra } from '../../../shared/profile';
import { Avatar, STATUS_LABEL, Tooltip } from '../Common';
import { useStore, openModal, toast, selectCommunity, openDm, addFriend, acceptFriend } from '../../lib/store';
import { cx, displayName, fmtDay, memberRoles, copyText, roleColor } from '../../lib/util';
import { ACTIVITY_LABEL, bannerBackground, bannerClass, cardTheme, imgFrameStyle, linkBrand, linkTitle, nameStyle } from './look';
import { ActivityCards, AccountList, PrivateNote, RecentList, VoiceStatus } from './Activity';
import { useActsOf } from '../../lib/activity';

export const ACTIVITY_ICON: Record<ActivityKind, React.ComponentType<{ size?: number }>> = {
  playing: Gamepad2,
  listening: Headphones,
  watching: Tv,
  working: Briefcase,
  reading: BookOpen,
};

/** Profil ayarlarına göre biçimlenmiş isim (degrade, ışıltı, yazı tipi) */
export const NameText = memo(function NameText({
  profile,
  color,
  children,
  className,
  onClick,
}: {
  profile?: ProfileExtra;
  color?: string;
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const ns = nameStyle(profile, color);
  return (
    <span className={cx(ns.className, className)} style={ns.style} onClick={onClick}>
      {children}
    </span>
  );
});

const FX_COUNT: Record<CardEffect, number> = { none: 0, sparkle: 14, bees: 4, snow: 22, aurora: 3, hearts: 9 };

/** Kart üzerinde dolaşan süs efekti */
export const CardFx = memo(function CardFx({ effect }: { effect?: CardEffect }) {
  const items = useMemo(() => {
    if (!effect || effect === 'none') return [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: FX_COUNT[effect] }, (_, i) => ({
      i,
      x: rnd() * 100,
      y: rnd() * 100,
      d: rnd() * 6,
      s: 0.6 + rnd() * 0.8,
      t: 4 + rnd() * 6,
    }));
  }, [effect]);
  if (!items.length) return null;
  return (
    <div className={cx('card-fx', 'fx-' + effect)} aria-hidden>
      {items.map((p) => (
        <i
          key={p.i}
          style={{ left: p.x + '%', top: p.y + '%', animationDelay: -p.d + 's', animationDuration: p.t + 's', ['--s' as any]: p.s }}
        >
          {effect === 'bees' ? '🐝' : effect === 'hearts' ? '♥' : effect === 'sparkle' ? '✦' : ''}
        </i>
      ))}
    </div>
  );
});

export function Banner({ user, profile, className, children }: { user?: Pick<UserPublic, 'color'>; profile?: ProfileExtra; className?: string; children?: React.ReactNode }) {
  const b = profile?.banner;
  return (
    <div
      className={cx('pc-banner', bannerClass(b), className)}
      style={{
        background: b?.kind === 'image' && b.image ? b.a : bannerBackground(b, user?.color || '#f5a524'),
        ['--bh' as any]: b?.h ? b.h + 'px' : undefined,
      }}
    >
      {b?.kind === 'image' && b.image && <img className="pc-img" src={b.image} alt="" draggable={false} style={imgFrameStyle(b)} />}
      {children}
    </div>
  );
}

function tzNow(tz: number) {
  const d = new Date(Date.now() + tz * 60000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function tzDiff(tz: number) {
  const mine = -new Date().getTimezoneOffset();
  const diff = Math.round((tz - mine) / 60);
  if (!diff) return 'seninle aynı saat diliminde';
  return diff > 0 ? `senden ${diff} saat ileride` : `senden ${-diff} saat geride`;
}

function useMinuteTick(on: boolean) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setT((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, [on]);
}

export function isBirthday(p?: ProfileExtra) {
  if (!p?.birthday) return false;
  const d = new Date();
  return p.birthday === `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const fmtBirthday = (b: string) => `${Number(b.slice(3))} ${MONTHS[Number(b.slice(0, 2)) - 1]}`;

interface Badge {
  id: string;
  label: string;
  icon: React.ReactNode;
}

function useBadges(uid: string, c: Community | undefined, profile?: ProfileExtra, bot?: boolean): Badge[] {
  const ownsAny = useStore((s) => Object.values(s.communities).some((x) => x.ownerId === uid && x.members.length > 1));
  const out: Badge[] = [];
  if (uid === 'kovan-asistan') out.push({ id: 'bot', label: 'Asistan', icon: <Sparkles size={14} /> });
  else if (bot) out.push({ id: 'bot', label: 'Bot', icon: <Bot size={14} /> });
  if (c?.ownerId === uid) out.push({ id: 'owner', label: 'Topluluk sahibi', icon: <Crown size={14} /> });
  else if (ownsAny) out.push({ id: 'founder', label: 'Topluluk kurucusu', icon: <Crown size={14} /> });
  if (/^[0-9a-z]{14}$/.test(uid) && idTime(uid) < Date.UTC(2027, 0, 1)) out.push({ id: 'early', label: 'İlk gelenlerden (2026)', icon: <Sparkles size={14} /> });
  if (isBirthday(profile)) out.push({ id: 'bday', label: 'Bugün doğum günü!', icon: <Cake size={14} /> });
  return out;
}

export function CustomStatusBubble({ profile }: { profile?: ProfileExtra }) {
  const cs = activeCustom(profile);
  if (!cs) return null;
  return (
    <div className="pc-bubble">
      {cs.emoji && <span className="pc-bubble-emoji">{cs.emoji}</span>}
      {cs.text && <span>{cs.text}</span>}
    </div>
  );
}

export function ActivityRow({ profile }: { profile?: ProfileExtra }) {
  const a = profile?.activity;
  if (!a) return null;
  const Icon = ACTIVITY_ICON[a.kind];
  return (
    <div className="pc-activity">
      <span className="pc-act-icon">
        <Icon size={18} />
      </span>
      <div>
        <b>{a.text}</b>
        <span>{ACTIVITY_LABEL[a.kind]}</span>
      </div>
    </div>
  );
}

export function LinkList({ profile }: { profile?: ProfileExtra }) {
  if (!profile?.links?.length) return null;
  return (
    <div className="pc-links">
      {profile.links.map((l, i) => {
        const brand = linkBrand(l.url);
        return (
          <button key={i} className="pc-link" onClick={() => window.kovan.openExternal(l.url)} title={l.url}>
            <span className="pc-link-ic" style={brand ? { background: brand.bg } : undefined}>
              {brand ? brand.tag : <Globe size={13} />}
            </span>
            <span className="pc-link-t">{linkTitle(l)}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface CardProps {
  uid: string;
  user: UserPublic | undefined;
  status?: Status;
  c?: Community;
  variant: 'popout' | 'full' | 'preview';
  isMe?: boolean;
  onClose?: () => void;
  /** önizlemede gösterilecek sahte isim */
  displayAs?: string;
  /** rol bölümü yerine gösterilecek içerik (rol verme/alma düğmeleriyle) */
  rolesNode?: React.ReactNode;
  /** kartın üstünde gösterilecek uyarı (ör. zaman aşımı) */
  notice?: React.ReactNode;
  /** eylem satırına eklenecek düğmeler */
  extraActions?: React.ReactNode;
}

/** Profil kartındaki arkadaşlık düğmesi: durumuna göre ekle / kabul et / arkadaşsınız */
function FriendButton({ uid }: { uid: string }) {
  const f = useStore((s) => s.friends[uid]);
  if (f?.state === 'ok')
    return (
      <Tooltip text="Arkadaşsınız">
        <span className="btn sm ghost pc-friend on">
          <UserCheck size={14} />
        </span>
      </Tooltip>
    );
  if (f?.state === 'out')
    return (
      <span className="btn sm ghost pc-friend wait">
        <Check size={14} /> İstek gönderildi
      </span>
    );
  if (f?.state === 'in')
    return (
      <button className="btn sm ghost pc-friend" onClick={() => acceptFriend(uid)}>
        <UserCheck size={14} /> İsteği kabul et
      </button>
    );
  return (
    <Tooltip text="Arkadaş ekle">
      <button className="btn sm ghost pc-friend" onClick={() => addFriend(uid)} aria-label="Arkadaş ekle">
        <UserPlus size={14} />
      </button>
    </Tooltip>
  );
}

export function ProfileCard({ uid, user, status, c, variant, isMe, onClose, displayAs, rolesNode, notice, extraActions }: CardProps) {
  const users = useStore((s) => s.users);
  const communities = useStore((s) => s.communities);
  const p = user?.profile;
  const theme = cardTheme(p);
  const badges = useBadges(uid, c, p, user?.bot);
  const [tab, setTab] = useState<'about' | 'activity' | 'mutual'>('about');
  const acts = useActsOf(uid);
  const liveSvcs = acts.filter((a) => a.kind === 'streaming').map((a) => a.src || '');
  useMinuteTick(p?.tz !== undefined);
  const member = c?.members.find((x) => x.userId === uid);
  const roles = c && member ? memberRoles(c, member) : [];
  const shownName = displayAs ?? (c ? displayName(c, uid, users) : user?.name || 'İsimsiz');
  const color = c ? roleColor(c, uid) : '';
  const mutual = useMemo(
    () => (variant === 'full' && !isMe ? Object.values(communities).filter((x) => !x.dm && x.members.some((m) => m.userId === uid)) : []),
    [variant, isMe, communities, uid],
  );
  const full = variant === 'full';
  const avatarSize = full ? 116 : 84;

  const about = (
    <>
      {user?.bio && (
        <section className="pc-sec">
          <h4>Hakkında</h4>
          <div className="pc-bio">{user.bio}</div>
        </section>
      )}
      <VoiceStatus uid={uid} />
      {acts.length > 0 ? (
        <section className="pc-sec pc-sec-acts">
          <ActivityCards uid={uid} compact={variant === 'preview'} />
        </section>
      ) : (
        p?.activity && (
          <section className="pc-sec">
            <h4>Şu an</h4>
            <ActivityRow profile={p} />
          </section>
        )
      )}
      {!!p?.tags?.length && (
        <section className="pc-sec">
          <h4>İlgi alanları</h4>
          <div className="pc-tags">
            {p.tags.map((t) => (
              <span key={t} className="pc-tag">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}
      {!!p?.accounts?.length && (
        <section className="pc-sec">
          <h4>Bağlı hesaplar</h4>
          <AccountList profile={p} liveSvcs={liveSvcs} chips={variant !== 'full'} />
        </section>
      )}
      {!!p?.links?.length && (
        <section className="pc-sec">
          <h4>Bağlantılar</h4>
          <LinkList profile={p} />
        </section>
      )}
      {(p?.tz !== undefined || p?.birthday) && (
        <section className="pc-sec pc-facts">
          {p?.tz !== undefined && (
            <div className="pc-fact">
              <Clock size={14} />
              <span>
                Yerel saat <b>{tzNow(p.tz)}</b>
                {!isMe && <em> · {tzDiff(p.tz)}</em>}
              </span>
            </div>
          )}
          {p?.birthday && (
            <div className="pc-fact">
              <Cake size={14} />
              <span>
                Doğum günü <b>{fmtBirthday(p.birthday)}</b>
              </span>
            </div>
          )}
        </section>
      )}
      {variant !== 'popout' && (/^[0-9a-z]{14}$/.test(uid) || !!member) && <section className="pc-sec pc-dates">
        {/^[0-9a-z]{14}$/.test(uid) && (
          <div>
            <h4>Xanaphian'a katıldı</h4>
            <span>{fmtDay(idTime(uid))}</span>
          </div>
        )}
        {member && (
          <div>
            <h4>Topluluğa katıldı</h4>
            <span>{fmtDay(member.joinedAt)}</span>
          </div>
        )}
      </section>}
      {variant !== 'preview' && !isMe && !user?.bot && uid !== 'kovan-asistan' && (
        <section className="pc-sec">
          <PrivateNote uid={uid} />
        </section>
      )}
      {rolesNode !== undefined ? rolesNode : roles.length > 0 && (
        <section className="pc-sec">
          <h4>Roller</h4>
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
    </>
  );

  return (
    <div
      className={cx('pcard', 'pcard-' + variant, theme && 'themed', theme && 'tone-' + theme.tone, p?.bg && 'has-bg')}
      style={theme?.style}
    >
      {p?.bg && (
        <>
          <div className="pc-bgimg" style={{ filter: p.bg.blur ? `blur(${p.bg.blur}px)` : undefined }}>
            <img className="pc-img" src={p.bg.image} alt="" draggable={false} style={imgFrameStyle(p.bg)} />
          </div>
          <div className="pc-bgdim" style={{ opacity: (p.bg.dim ?? 45) / 100 }} />
        </>
      )}
      <Banner user={user} profile={p} className={full ? 'tall' : ''}>
        {badges.length > 0 && (
          <div className="pc-badges">
            {badges.map((b) => (
              <Tooltip key={b.id} text={b.label} side="left">
                <span className={cx('pc-badge', 'b-' + b.id)}>{b.icon}</span>
              </Tooltip>
            ))}
          </div>
        )}
      </Banner>
      <CardFx effect={p?.effect} />
      <div className="pc-head">
        <div className="pc-avatar">
          <Avatar user={user} size={avatarSize} status={status} />
        </div>
        <CustomStatusBubble profile={p} />
      </div>
      <div className="pc-body">
        <div className="pc-namebox">
          <NameText profile={p} color={color || undefined} className="pc-name">
            {shownName}
          </NameText>
          {(user?.bot || uid === 'kovan-asistan') && <span className="tag-bot pc-bot">{uid === 'kovan-asistan' ? 'ASİSTAN' : 'BOT'}</span>}
          <div className="pc-sub">
            {shownName !== user?.name && user?.name && <span>{user.name}</span>}
            {p?.pronouns && (
              <span className="pc-pron">
                <AtSign size={11} />
                {p.pronouns}
              </span>
            )}
            {status && <span className={cx('pc-status', status)}>{STATUS_LABEL[status]}</span>}
          </div>
        </div>
        {notice}
        {full ? (
          <>
            <div className="pc-tabs">
              <button className={cx(tab === 'about' && 'on')} onClick={() => setTab('about')}>
                Hakkında
              </button>
              <button className={cx(tab === 'activity' && 'on')} onClick={() => setTab('activity')}>
                Etkinlik
                {acts.length > 0 && <i className="pc-tab-dot" />}
              </button>
              {!isMe && mutual.length > 0 && (
                <button className={cx(tab === 'mutual' && 'on')} onClick={() => setTab('mutual')}>
                  Ortak topluluklar · {mutual.length}
                </button>
              )}
            </div>
            {tab === 'about' ? (
              about
            ) : tab === 'activity' ? (
              <>
                {acts.length > 0 && (
                  <section className="pc-sec pc-sec-acts">
                    <h4>Şu an</h4>
                    <ActivityCards uid={uid} />
                  </section>
                )}
                <section className="pc-sec">
                  <h4>Son etkinlik</h4>
                  <p className="pc-sec-sub">Son 30 günde oynadıkları, dinledikleri ve yayınları.</p>
                  <RecentList
                    profile={p}
                    empty={<div className="pc-empty">{isMe ? 'Henüz kaydedilmiş etkinliğin yok. Bir oyun açtığında ya da müzik dinlediğinde burada görünür.' : 'Son 30 günde paylaşılmış bir etkinlik yok.'}</div>}
                  />
                </section>
              </>
            ) : (
              <div className="pc-mutual">
                {mutual.map((m) => (
                  <button
                    key={m.id}
                    className="pc-mutual-row"
                    onClick={() => {
                      onClose?.();
                      selectCommunity(m.id);
                    }}
                  >
                    <span className="pc-mutual-ic" style={{ background: m.color }}>
                      {m.icon ? <img src={m.icon} alt="" /> : m.name.slice(0, 2).toLocaleUpperCase('tr')}
                    </span>
                    <span>{m.name}</span>
                    <em>{m.members.length} üye</em>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          about
        )}
        {variant !== 'preview' && (
          <div className="pc-actions">
            {isMe ? (
              <button className="btn sm primary" onClick={() => (onClose?.(), openModal({ type: 'settings', tab: 'profile' }))}>
                <Pencil size={14} /> Profili düzenle
              </button>
            ) : user?.bot || uid === 'kovan-asistan' ? (
              <button className="btn sm ghost" onClick={() => (copyText(uid), toast('Kimlik kopyalandı', 'ok'), onClose?.())}>
                <Copy size={14} /> Kimliği kopyala
              </button>
            ) : (
              <>
                {c?.dm !== uid && (
                  <button className="btn sm primary" onClick={() => (onClose?.(), openDm(uid))}>
                    <MessageCircle size={14} /> Mesaj gönder
                  </button>
                )}
                <FriendButton uid={uid} />
              </>
            )}
            {variant === 'popout' && (
              isMe || user?.bot ? (
                <button className="btn sm ghost" onClick={() => (onClose?.(), openModal({ type: 'profile', uid, cid: c?.id }))}>
                  <Maximize2 size={14} /> Tam profil
                </button>
              ) : (
                <button className="btn sm ghost pc-more" title="Tam profil" aria-label="Tam profil" onClick={() => (onClose?.(), openModal({ type: 'profile', uid, cid: c?.id }))}>
                  <Maximize2 size={15} />
                </button>
              )
            )}
            {extraActions}
          </div>
        )}
      </div>
    </div>
  );
}
