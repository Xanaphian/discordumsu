import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { NOISE_MODES, noiseModeOf } from '../lib/ses/gurultu';
import {
  ChevronDown, ChevronRight, Hash, Volume2, Megaphone, Box, Plus, Settings, Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, UserPlus,
  Signal, AudioWaveform, WifiOff, Bell, Lock, Video, VideoOff, MonitorUp, MonitorX, Globe, Users, X, Home, Pin,
} from 'lucide-react';
import {
  useStore, selectChannel, openModal, openMenu, markRead, markCommunityRead, cmd, confirmDialog, leaveCommunity, deleteCommunity, setStatus,
  updateSettings, toggleMuted, toast, selectCommunity, setHomeTab, dmList, closeDm, pendingIn, hiddenDms, isDmHidden, realCommunities, togglePinDm,
} from '../lib/store';
import { useVoice, joinVoice, leaveVoice, toggleMute, toggleDeaf, toggleCamera, stopScreen } from '../lib/voice';
import { enterSpace, exitSpace, toggle3d, useSpace } from '../lib/space';
import { Avatar, CommunityIcon, STATUS_LABEL, Tooltip } from './Common';
import { SiteViewers } from './SiteView';
import { ChannelGlyph, ChannelBannerBg } from './OdaResmi';
import { isToolChannel } from '../../shared/protocol';
import { useSite } from '../lib/site';
import { Banner, NameText } from './profile/ProfileCard';
import { focusProfileSection } from './profile/ProfileEditor';
import { activeCustom, type ProfileExtra } from '../../shared/profile';
import { bannerBackground } from './profile/look';
import { BannerPic } from './Kirpma';
import { BANNER_H } from '../../shared/profile';
import { useActsOf } from '../lib/activity';
import { ActivityLine, ListenAlongBar } from './profile/Activity';
import { useUnread } from './ServerRail';
import { cx, copyText, displayName, countOnline } from '../lib/util';
import { openPopout } from './AyriPencere';
import { memberMenu } from './Moderation';
import { insertMention } from './Members';
import { can, canIn, Perm, isVoiceLike, type Channel, type Community, type Status } from '../../shared/protocol';

/** Sesli kanala katılmadan önce yetki ve kişi sınırı denetimi */
export function voiceBlocked(c: Community, ch: Channel, me: string): string | null {
  if (!canIn(c, me, ch, Perm.CONNECT)) return 'Bu kanala bağlanma yetkin yok.';
  if (ch.userLimit && !canIn(c, me, ch, Perm.MANAGE_CHANNELS)) {
    const n = new Set((useStore.getState().voice[ch.id] || []).map((m) => m.userId).filter((u) => u !== me)).size;
    if (n >= ch.userLimit) return `Kanal dolu (${ch.userLimit} kişi sınırı).`;
  }
  return null;
}

function tryJoinVoice(c: Community, ch: Channel) {
  const why = voiceBlocked(c, ch, useStore.getState().me.id);
  if (why) return void toast(why, 'err');
  joinVoice(c.id, ch.id);
}

function siteHost(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Oda satırının altındaki kısa açıklama */
function roomSub(ch: Channel, occupants: number, viewers: number) {
  if (isVoiceLike(ch.type)) return occupants ? `${occupants} kişi sohbette` : 'Sesli oda · boş';
  const host = siteHost(ch.url);
  const where = host && host !== ch.name ? host : ch.siteTitle && ch.siteTitle !== ch.name ? ch.siteTitle : 'Site odası';
  return viewers ? `${where} · ${viewers} kişi geziyor` : `${where} · birlikte gez`;
}

/** Ses odasındaki kişiler: oda satırı genişliğinde, arkasında kendi afişi, üstünde profil resmi (v1.37) */
const VC_SHOW = 8; // kalabalık odada ilk bu kadar kart, gerisi "+N kişi daha"
const VoiceMembers = memo(function VoiceMembers({ c, chId }: { c: Community; chId: string }) {
  const members = useStore((s) => s.voice[chId]);
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.me.id);
  const meExtra = useStore((s) => (s.me as { extra?: ProfileExtra }).extra);
  const speaking = useVoice((s) => s.speaking);
  const [all, setAll] = useState(false);
  if (!members?.length) return null;
  const compact = members.length > 6; // 7+ kişide kartlar incelir
  const shown = all ? members : members.slice(0, VC_SHOW);
  return (
    <div className={cx('vc-members vc-cards', compact && 'compact')}>
      {shown.map((m) => {
        const u = users[m.userId];
        const prof: ProfileExtra | undefined = u?.profile ?? (m.userId === meId ? meExtra : undefined);
        const b = prof?.banner;
        const img = b?.kind === 'image' && b.image ? b.image : undefined;
        const talk = !!speaking[m.userId] && !m.muted;
        return (
          <div
            key={m.sessionId}
            className={cx('vc-member vc-card', talk && 'talking', !img && 'no-img', !b && 'no-banner')}
            style={{ ['--uc' as any]: u?.color || '#c8aa6e', background: img || !b ? undefined : bannerBackground(b, u?.color || '#c8aa6e') }}
            onClick={(e) => useStore.setState({ popout: { uid: m.userId, cid: c.id, x: e.clientX, y: e.clientY } })}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // üye listesindeki kişi menüsünün aynısı: Profil, Bahset, Mesaj, ses düzeyi…
              const name = displayName(c, m.userId, users);
              openMenu(e, memberMenu(c, meId, m.userId, { at: { x: e.clientX, y: e.clientY }, onMention: () => insertMention(name) }));
            }}
          >
            {img && <BannerPic className="vc-card-img" image={img} framing={b} aspect={330 / (b?.h || BANNER_H.def)} align="end" />}
            <span className="vc-card-shade" aria-hidden />
            <Avatar user={u ? { ...u, profile: prof } : undefined} size={compact ? 26 : 34} speaking={talk} />
            <span className="vc-name">{displayName(c, m.userId, users)}</span>
            <span className="vc-flags">
              {m.cam ? <Video size={13} className="cam" /> : null}
              {m.screen ? <span className="live-badge">CANLI</span> : null}
              {m.deaf ? <HeadphoneOff size={13} className="off" /> : m.muted ? <MicOff size={13} className="off" /> : null}
            </span>
          </div>
        );
      })}
      {members.length > VC_SHOW && (
        <button className="vc-more" onClick={() => setAll(!all)}>
          {all ? 'Daha az göster' : `+${members.length - VC_SHOW} kişi daha`}
        </button>
      )}
    </div>
  );
});

const ChannelRow = memo(function ChannelRow({
  c,
  ch,
  active,
  unread,
  mentions,
  manage,
  onDragStart,
  onDropOn,
}: {
  c: Community;
  ch: Channel;
  active: boolean;
  unread: boolean;
  mentions: number;
  manage: boolean;
  onDragStart: (id: string) => void;
  onDropOn: (ch: Channel) => void;
}) {
  const inVoice = useVoice((s) => s.ch === ch.id);
  const me = useStore((s) => s.me.id);
  const muted = useStore((s) => s.settings.mutedIds.includes(ch.id));
  const devMode = useStore((s) => s.settings.devMode);
  const [over, setOver] = useState(false);
  const editCh = canIn(c, me, ch, Perm.MANAGE_CHANNELS);
  const room = ch.type === 'voice' || ch.type === 'space' || ch.type === 'site';
  const occupants = useStore((s) => (isVoiceLike(ch.type) ? s.voice[ch.id]?.length || 0 : 0));
  const viewers = useSite((s) => (ch.type === 'site' ? new Set((s.viewers[ch.id] || []).map((v) => v.userId)).size : 0));
  const live = useVoice((v) => isVoiceLike(ch.type) && (useStore.getState().voice[ch.id] || []).some((m) => v.speaking[m.userId] && !m.muted));
  const sub = room ? roomSub(ch, occupants, viewers) : ch.banner && ch.topic ? ch.topic.replace(/\s+/g, ' ').slice(0, 80) : '';
  const click = () => {
    if (isVoiceLike(ch.type) && !inVoice) tryJoinVoice(c, ch);
    selectChannel(c.id, ch.id);
  };
  const menu = (e: React.MouseEvent) =>
    openMenu(e, [
      ...(!isVoiceLike(ch.type) ? [{ label: 'Okundu olarak işaretle', onClick: () => markRead(ch.id), disabled: !unread }] : []),
      ...(ch.type === 'text' || ch.type === 'announce' ? [{ label: 'Ayrı pencerede aç', onClick: () => openPopout(c, ch) }] : []),
      ...(isVoiceLike(ch.type)
        ? [
            inVoice ? { label: 'Bağlantıyı kes', onClick: () => leaveVoice() } : { label: 'Katıl', onClick: () => tryJoinVoice(c, ch) },
            ...(c.dm
              ? []
              : [
                  {
                    label: useSpace.getState().ch === ch.id ? '3D görünümü kapat' : '3D görünümde katıl',
                    onClick: () => {
                      if (useSpace.getState().ch === ch.id) return exitSpace();
                      const why = voiceBlocked(c, ch, useStore.getState().me.id);
                      if (why) return void toast(why, 'err');
                      selectChannel(c.id, ch.id);
                      enterSpace(c.id, ch.id);
                    },
                  },
                ]),
          ]
        : []),
      ...(!isVoiceLike(ch.type)
        ? [
            { label: muted ? 'Kanalın sesini aç' : 'Kanalı sessize al', onClick: () => toggleMuted(ch.id) },
            { label: 'Bildirim ayarları', onClick: () => openModal({ type: 'notify', cid: c.id, chId: ch.id }) },
          ]
        : []),
      { label: 'Kanalı etiket olarak kopyala', onClick: () => copyText(`<#${ch.id}>`) },
      ...(devMode ? [{ label: 'Kanal kimliğini kopyala', onClick: () => copyText(ch.id) }] : []),
      ...(editCh
        ? [
            { sep: true },
            { label: 'Kanalı düzenle', onClick: () => openModal({ type: 'editChannel', cid: c.id, chId: ch.id }) },
            ...(canIn(c, me, ch, Perm.MANAGE_ROLES) ? [{ label: 'İzinleri düzenle', onClick: () => openModal({ type: 'editChannel', cid: c.id, chId: ch.id, tab: 'perms' }) }] : []),
            {
              label: 'Kanalı sil',
              danger: true,
              onClick: () => confirmDialog(`#${ch.name} silinsin mi?`, 'Bu kanaldaki tüm mesajlar kalıcı olarak silinir.', () => cmd(c.id, { t: 'chan.delete', cid: c.id, id: ch.id }), 'Kanalı sil'),
            },
          ]
        : []),
    ]);
  const body = (
    <>
      <div
        className={cx(
          'ch-row',
          room && 'room room-' + ch.type,
          ch.banner && 'has-banner',
          (occupants > 0 || viewers > 0) && 'occupied',
          live && 'live',
          active && 'active',
          unread && !active && !muted && 'unread',
          inVoice && 'in-voice',
          over && 'drop-over',
          muted && 'muted',
        )}
        onClick={click}
        onContextMenu={menu}
        draggable={manage}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(ch.id);
        }}
        onDragOver={(e) => {
          if (!manage) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onDropOn(ch);
        }}
      >
        {unread && !active && !muted && <span className="ch-unread-pill" />}
        {room && <span className="room-art" aria-hidden />}
        {ch.banner && <ChannelBannerBg banner={ch.banner} />}
        <span className="ch-icon">
          <ChannelGlyph type={ch.type} icon={ch.icon} size={room ? 20 : 18} />
        </span>
        {room || sub ? (
          <span className="ch-text">
            <span className="ch-name">{ch.name}</span>
            <span className="ch-sub">{sub}</span>
          </span>
        ) : (
          <span className="ch-name">{ch.name}</span>
        )}
        {isVoiceLike(ch.type) && occupants > 0 && (
          <span className="room-eq" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
        {ch.type === 'site' && <span className="room-tag">WEB</span>}
        {ch.overwrites?.some((o) => o.id === c.id && o.deny & Perm.VIEW_CHANNEL) && <Lock size={12} className="ch-lock" aria-label="Özel kanal" />}
        {isVoiceLike(ch.type) && ch.userLimit ? <span className="ch-limit">{(useStore.getState().voice[ch.id] || []).length}/{ch.userLimit}</span> : null}
        {mentions > 0 && <span className="badge">{mentions}</span>}
        {editCh && (
          <button
            className="ch-gear"
            onClick={(e) => {
              e.stopPropagation();
              openModal({ type: 'editChannel', cid: c.id, chId: ch.id });
            }}
            aria-label="Kanalı düzenle"
          >
            <Settings size={14} />
          </button>
        )}
      </div>
      {isVoiceLike(ch.type) && <VoiceMembers c={c} chId={ch.id} />}
      {ch.type === 'site' && <SiteViewers c={c} chId={ch.id} />}
    </>
  );
  // odalar (ses, site) bir çerçevenin içinde: altındaki kişiler odaya ait görünür, kişi kartlarıyla karışmaz
  return room ? <div className={cx('room-box', (active || inVoice) && 'on', (occupants > 0 || viewers > 0) && 'occupied')}>{body}</div> : body;
});

export function ChannelSidebar({ c }: { c: Community }) {
  const me = useStore((s) => s.me.id);
  const active = useStore((s) => s.chanByComm[c.id]);
  const collapsed = useStore((s) => s.settings.collapsed);
  const mentions = useStore((s) => s.mentions);
  const connStatus = useStore((s) => s.conns[s.commHost[c.id]]?.status);
  const onlineCount = useStore((s) => countOnline(c.members, s.presence, s.me.id));
  const { unreadCh } = useUnread();
  const manage = can(c, me, Perm.MANAGE_CHANNELS);
  const commMuted = useStore((s) => s.settings.mutedIds.includes(c.id));
  const devMode = useStore((s) => s.settings.devMode);
  const [drag, setDrag] = useState<string | null>(null);

  const groups = useMemo(() => {
    const cats = [...c.categories].sort((a, b) => a.position - b.position);
    const byCat = (id: string | null) =>
      c.channels.filter((x) => x.categoryId === id).sort((a, b) => (isVoiceLike(a.type) ? 1 : 0) - (isVoiceLike(b.type) ? 1 : 0) || a.position - b.position);
    return [{ cat: null as null | (typeof cats)[0], chans: byCat(null) }, ...cats.map((cat) => ({ cat, chans: byCat(cat.id) }))];
  }, [c]);

  const toggleCat = (id: string) => updateSettings({ collapsed: collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id] });

  const dropOn = (target: Channel | null, categoryId: string | null) => {
    if (!drag) return;
    const list = c.channels.filter((x) => x.categoryId === (target ? target.categoryId : categoryId) && x.id !== drag).sort((a, b) => a.position - b.position);
    const index = target ? list.findIndex((x) => x.id === target.id) : list.length;
    cmd(c.id, { t: 'chan.move', cid: c.id, id: drag, categoryId: target ? target.categoryId : categoryId, index: Math.max(0, index) });
    setDrag(null);
  };

  const headerMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu({ clientX: r.left + 8, clientY: r.bottom + 4 }, [
      { label: 'Sunucu profili', icon: 'profile', onClick: () => openModal({ type: 'commProfile', cid: c.id }) },
      { label: 'Topluluk istatistikleri', icon: 'stats', onClick: () => openModal({ type: 'stats', cid: c.id }) },
      ...(c.inviteKey ? [{ label: 'Davet et', icon: 'invite', onClick: () => openModal({ type: 'invite', cid: c.id }) }] : []),
      { label: 'Topluluk ayarları', icon: 'settings', onClick: () => openModal({ type: 'commSettings', cid: c.id }) },
      ...(can(c, me, Perm.MANAGE_ROLES) ? [{ label: 'Roller', icon: 'roles', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'roles' }) }] : []),
      { label: 'Üyeler', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'members' }) },
      ...(can(c, me, Perm.VIEW_AUDIT_LOG) ? [{ label: 'Denetim kaydı', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'audit' }) }] : []),
      ...(can(c, me, Perm.MANAGE_COMMUNITY) ? [{ label: 'Botlar ve yapay zekâ', icon: 'bot', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'bots' }) }] : []),
      ...(manage
        ? [
            { label: 'Kanal oluştur', icon: 'plus', onClick: () => openModal({ type: 'createChannel', cid: c.id, categoryId: null }) },
            { label: 'Kategori oluştur', icon: 'folder', onClick: () => openModal({ type: 'createCategory', cid: c.id }) },
          ]
        : []),
      { sep: true },
      { label: 'Bildirim ayarları', onClick: () => openModal({ type: 'notify', cid: c.id }) },
      { label: commMuted ? 'Topluluğun sesini aç' : 'Topluluğu sessize al', onClick: () => toggleMuted(c.id) },
      ...(can(c, me, Perm.CHANGE_NICKNAME) || can(c, me, Perm.MANAGE_NICKNAMES)
        ? [{ label: 'Takma adını değiştir', onClick: () => openModal({ type: 'moderate', cid: c.id, uid: me, action: 'nick' }) }]
        : []),
      ...(c.roles.some((r) => r.selfAssign) ? [{ label: 'Rollerini seç', icon: 'roles', onClick: () => openModal({ type: 'selfRoles', cid: c.id }) }] : []),
      { label: 'Tümünü okundu işaretle', icon: 'check', onClick: () => markCommunityRead(c.id) },
      ...(devMode ? [{ label: 'Topluluk kimliğini kopyala', onClick: () => copyText(c.id) }] : []),
      { sep: true },
      c.ownerId === me
        ? { label: 'Topluluğu sil', danger: true, onClick: () => confirmDialog(`"${c.name}" silinsin mi?`, 'Tüm kanallar ve mesajlar kalıcı olarak silinir.', () => deleteCommunity(c.id), 'Sil') }
        : { label: 'Topluluktan ayrıl', danger: true, onClick: () => confirmDialog(`"${c.name}" topluluğundan ayrıl?`, 'Tekrar katılmak için davet gerekir.', () => leaveCommunity(c.id), 'Ayrıl') },
    ]);
  };

  return (
    <>
      <button className={cx('side-header comm-head', c.profile?.banner && 'has-banner')} onClick={headerMenu} style={{ ['--cc' as any]: c.color }}>
        {c.profile?.banner && <Banner user={{ color: c.color }} profile={{ banner: c.profile.banner }} refW={560} className="sh-banner" />}
        <span className="sh-icon">
          <CommunityIcon c={c} size={34} />
        </span>
        <span className="sh-text">
          <span className="side-title">{c.name}</span>
          <span className="sh-sub">
            <i className="dot online" /> {onlineCount} çevrimiçi · {c.members.length} üye
          </span>
        </span>
        <ChevronDown size={18} />
      </button>
      {connStatus !== 'online' && (
        <div className="conn-banner">
          <WifiOff size={14} /> {connStatus === 'connecting' ? 'Bağlanılıyor…' : 'Bağlantı yok, yeniden deneniyor…'}
        </div>
      )}
      <div className="ch-list scroll-thin">
        {groups.map(({ cat, chans }) => {
          if (!cat && !chans.length) return null;
          const isCollapsed = !!cat && collapsed.includes(cat.id);
          return (
            <div key={cat?.id || 'none'} className="ch-group">
              {cat && (
                <div
                  className="cat-row"
                  onClick={() => toggleCat(cat.id)}
                  onDragOver={(e) => manage && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOn(null, cat.id);
                  }}
                  onContextMenu={(e) =>
                    manage &&
                    openMenu(e, [
                      { label: 'Kanal oluştur', onClick: () => openModal({ type: 'createChannel', cid: c.id, categoryId: cat.id }) },
                      {
                        label: 'Kategoriyi yeniden adlandır',
                        onClick: () => openModal({ type: 'createCategory', cid: c.id, catId: cat.id }),
                      },
                      { label: 'Kategoriyi düzenle', onClick: () => openModal({ type: 'editCategory', cid: c.id, catId: cat.id }) },
                      ...(can(c, me, Perm.MANAGE_ROLES) ? [{ label: 'Kategori izinleri', onClick: () => openModal({ type: 'editCategory', cid: c.id, catId: cat.id, tab: 'perms' }) }] : []),
                      { sep: true },
                      { label: 'Kategoriyi sil', danger: true, onClick: () => confirmDialog(`"${cat.name}" kategorisi silinsin mi?`, 'Kanallar silinmez, kategorisiz kalır.', () => cmd(c.id, { t: 'cat.delete', cid: c.id, id: cat.id }), 'Sil') },
                    ])
                  }
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span>{cat.name}</span>
                  {manage && (
                    <Tooltip text="Kanal oluştur" side="top">
                      <button
                        className="cat-add"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal({ type: 'createChannel', cid: c.id, categoryId: cat.id, kind: chans.every((x) => isVoiceLike(x.type)) && chans.length ? 'voice' : 'text' });
                        }}
                        aria-label="Kanal oluştur"
                      >
                        <Plus size={15} />
                      </button>
                    </Tooltip>
                  )}
                </div>
              )}
              {chans.map((ch) =>
                isCollapsed && ch.id !== active && !(mentions[ch.id] > 0) ? null : (
                  <ChannelRow
                    key={ch.id}
                    c={c}
                    ch={ch}
                    active={ch.id === active}
                    unread={!!unreadCh[ch.id]}
                    mentions={mentions[ch.id] || 0}
                    manage={manage}
                    onDragStart={setDrag}
                    onDropOn={(t) => dropOn(t, t.categoryId)}
                  />
                ),
              )}
            </div>
          );
        })}
        {manage && c.channels.length === 0 && (
          <button className="empty-cta" onClick={() => openModal({ type: 'createChannel', cid: c.id, categoryId: null })}>
            <Plus size={16} /> İlk kanalını oluştur
          </button>
        )}
      </div>
    </>
  );
}

/** Ses panelinde gürültü engelleme düğmesi: basınca modlar açılır, seçim ayarlarda saklanır */
function NoiseButton() {
  const mode = useStore((s) => noiseModeOf(s.settings));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', off);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const cur = NOISE_MODES.find((m) => m.id === mode)!;
  return (
    <div className="ns-wrap" ref={ref}>
      <Tooltip text={`Gürültü engelleme: ${cur.label}`} side="top">
        <button className={cx('icon-btn ns-btn', mode !== 'kapali' && 'on', `m-${mode}`, open && 'open')} onClick={() => setOpen(!open)} aria-label="Gürültü engelleme" aria-expanded={open}>
          <AudioWaveform size={18} />
          {mode !== 'kapali' && <i className="ns-dot" />}
        </button>
      </Tooltip>
      {open && (
        <div className="ns-pop" role="menu">
          <div className="ns-head">
            <AudioWaveform size={16} />
            <b>Gürültü engelleme</b>
          </div>
          {NOISE_MODES.map((m) => (
            <button
              key={m.id}
              role="menuitemradio"
              aria-checked={m.id === mode}
              className={cx('ns-opt', m.id === mode && 'on')}
              onClick={() => updateSettings({ noiseMode: m.id, noiseSuppression: m.id !== 'kapali' })}
            >
              <i className="ns-radio" />
              <span>
                <b>{m.label}</b>
                <small>{m.sub}</small>
              </span>
              <span className={cx('ns-bars', `b-${m.id}`)} aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </button>
          ))}
          <button
            className="ns-more"
            onClick={() => {
              setOpen(false);
              openModal({ type: 'settings', tab: 'voice' });
            }}
          >
            Ses ayarları ve mikrofon denemesi
          </button>
        </div>
      )}
    </div>
  );
}

export function VoicePanel() {
  const v = useVoice();
  const c = useStore((s) => (v.cid ? s.communities[v.cid] : undefined));
  const in3d = useSpace((s) => !!v.ch && s.ch === v.ch && s.status !== 'idle');
  const joining3d = useSpace((s) => s.status === 'joining');
  if (!v.ch || !c) return null;
  const ch = c.channels.find((x) => x.id === v.ch);
  const media = isVoiceLike(ch?.type || 'text') || !!c.dm;
  return (
    <div className="voice-panel vp2">
      <div className="vp-head">
        <div className="vp-info" onClick={() => selectChannel(c.id, v.ch!)}>
          <div className={cx('vp-state', v.state)}>
            <Signal size={15} /> {v.state === 'connected' ? (in3d ? '3D odadasın' : 'Ses bağlı') : 'Bağlanıyor…'}
          </div>
          <div className="vp-where">{c.dm ? `@${useStore.getState().users[c.dm]?.name || c.name} ile arama` : `${ch?.name} / ${c.name}`}</div>
        </div>
        <NoiseButton />
        <Tooltip text="Bağlantıyı kes" side="top">
          <button className="icon-btn danger" onClick={() => leaveVoice()} aria-label="Bağlantıyı kes">
            <PhoneOff size={18} />
          </button>
        </Tooltip>
      </div>
      {media && (
        <div className="vp-btns">
          <Tooltip text={v.cam ? 'Kamerayı kapat' : 'Kamerayı aç'} side="top">
            <button className={cx('vp-btn', v.cam && 'on')} onClick={toggleCamera} aria-label="Kamera">
              {v.cam ? <Video size={17} /> : <VideoOff size={17} />}
            </button>
          </Tooltip>
          <Tooltip text={v.screen ? 'Yayını durdur' : 'Ekran paylaş'} side="top">
            <button className={cx('vp-btn', v.screen && 'live')} onClick={() => (v.screen ? stopScreen() : openModal({ type: 'screenShare' }))} aria-label="Ekran paylaş">
              {v.screen ? <MonitorX size={17} /> : <MonitorUp size={17} />}
            </button>
          </Tooltip>
          {!c.dm && ch && (
            <Tooltip text={in3d ? '3D görünümü kapat' : '3D oda'} side="top">
              <button
                className={cx('vp-btn vp-3d', in3d && 'on', joining3d && 'busy')}
                onClick={() => {
                  if (!in3d) selectChannel(c.id, ch.id);
                  toggle3d();
                }}
                aria-label="3D oda"
                aria-pressed={in3d}
              >
                <Box size={17} />
              </button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

const STATUSES: Status[] = ['online', 'idle', 'dnd', 'invisible'];
/** durum menüsünde daha açıklayıcı adlar */
const STATUS_MENU: Partial<Record<Status, string>> = {
  dnd: 'Rahatsız Etmeyin (bildirimler susar)',
  invisible: 'Görünmez (çevrimdışı görün)',
};

export function UserPanel() {
  const me = useStore((s) => s.me);
  const muted = useVoice((s) => s.muted);
  const deaf = useVoice((s) => s.deaf);
  const myLive = useActsOf(me.id).length > 0;
  const actShare = useStore((s) => s.settings.actShare);
  const statusMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu({ clientX: r.left, clientY: r.top - 8 - 10 * 34 - 70 }, [
      ...STATUSES.map((st) => ({ label: STATUS_MENU[st] || STATUS_LABEL[st], icon: 'status-' + st, checked: me.status === st, onClick: () => setStatus(st) })),
      { sep: true },
      { label: activeCustom(me.extra) ? 'Özel durumu değiştir' : 'Özel durum ayarla', onClick: () => openModal({ type: 'customStatus' }) },
      { label: 'Etkinliğimi paylaş', checked: actShare, onClick: () => updateSettings({ actShare: !actShare }) },
      { label: 'Etkinlik ayarları', onClick: () => openModal({ type: 'settings', tab: 'activity' }) },
      { sep: true },
      { label: 'Profilimi görüntüle', onClick: () => openModal({ type: 'profile', uid: me.id }) },
      { label: 'Profili düzenle', onClick: () => openModal({ type: 'settings', tab: 'profile' }) },
      { label: 'Afiş ve arka plan', onClick: () => (focusProfileSection('banner'), openModal({ type: 'settings', tab: 'profile' })) },
      { label: 'Kimliğini kopyala', onClick: () => copyText(me.id) },
    ]);
  };
  return (
    <div className="user-panel">
      <Banner user={me} profile={me.extra} className="up-banner" />
      <button className="up-me" onClick={statusMenu}>
        <Avatar user={me} size={34} status={me.status === 'invisible' ? 'offline' : me.status} />
        <div className="up-text">
          <NameText profile={me.extra} className="up-name">
            {me.name}
          </NameText>
          <div className="up-status">
            {myLive && me.status !== 'invisible' ? (
              <ActivityLine uid={me.id} />
            ) : activeCustom(me.extra) ? (
              <>
                {activeCustom(me.extra)!.emoji} {activeCustom(me.extra)!.text}
              </>
            ) : (
              STATUS_LABEL[me.status]
            )}
          </div>
        </div>
      </button>
      <Tooltip text={muted ? 'Sesi aç' : 'Sustur'} side="top">
        <button className={cx('icon-btn', muted && 'danger-on')} onClick={toggleMute} aria-label="Mikrofon">
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
      </Tooltip>
      <Tooltip text={deaf ? 'Sağırlaştırmayı kapat' : 'Sağırlaştır'} side="top">
        <button className={cx('icon-btn', deaf && 'danger-on')} onClick={toggleDeaf} aria-label="Kulaklık">
          {deaf ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
        </button>
      </Tooltip>
      <Tooltip text="Kullanıcı ayarları" side="top">
        <button className="icon-btn" onClick={() => openModal({ type: 'settings' })} aria-label="Ayarlar">
          <Settings size={18} />
        </button>
      </Tooltip>
    </div>
  );
}

export function Sidebar() {
  const current = useStore((s) => s.current);
  const c = useStore((s) => (s.current !== 'home' ? s.communities[s.current] : undefined));
  return (
    <aside className="sidebar">
      {current === 'home' || !c || c.dm ? <HomeSidebar /> : <ChannelSidebar c={c} />}
      <VoicePanel />
      <ListenAlongBar />
      <UserPanel />
    </aside>
  );
}

/** Ana Sayfa kenar çubuğundaki özel sohbet satırı */
function DmRow({ c, active, unread, mentions }: { c: Community; active: boolean; unread: boolean; mentions: number }) {
  const user = useStore((s) => s.users[c.dm!] || c.users[c.dm!]);
  const status = useStore((s) => s.presence[c.dm!]);
  const custom = activeCustom(user?.profile);
  const live = useActsOf(c.dm).length > 0;
  const pinned = useStore((s) => s.settings.pinnedDms.includes(c.id));
  const menu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: 'Okundu olarak işaretle', onClick: () => markCommunityRead(c.id), disabled: !unread },
      { label: pinned ? 'Sabitlemeyi kaldır' : 'Listenin üstüne sabitle', onClick: () => togglePinDm(c.id) },
      { label: 'Ayrı pencerede aç', onClick: () => c.channels[0] && openPopout(c, c.channels[0]) },
      { label: 'Profil', onClick: () => openModal({ type: 'profile', uid: c.dm!, cid: c.id }) },
      { label: isMutedId(c.id) ? 'Bildirimleri aç' : 'Sessize al', onClick: () => toggleMuted(c.id) },
      { sep: true },
      { label: 'Sohbeti kapat', onClick: () => closeDm(c.id) },
    ]);
  return (
    <div className={cx('ch-row dm-row', active && 'active', unread && 'unread', pinned && 'pinned')} onClick={() => selectCommunity(c.id)} onContextMenu={menu} role="button" tabIndex={0}>
      <Avatar user={user} size={32} status={status || 'offline'} />
      <span className="dm-text">
        <span className="ch-name">
          {user?.name || c.name}
          {pinned && <Pin size={12} className="dm-pin" aria-label="Sabitlendi" />}
        </span>
        {live ? <ActivityLine uid={c.dm!} className="ch-sub" /> : custom?.text ? <span className="ch-sub">{custom.emoji ? custom.emoji + ' ' : ''}{custom.text}</span> : null}
      </span>
      {mentions > 0 ? (
        <span className="badge">{mentions}</span>
      ) : (
        <button
          className="dm-close"
          aria-label="Sohbeti kapat"
          onClick={(e) => {
            e.stopPropagation();
            closeDm(c.id);
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

const isMutedId = (id: string) => useStore.getState().settings.mutedIds.includes(id);

function HomeSidebar() {
  const communities = useStore((s) => s.communities);
  const current = useStore((s) => s.current);
  const homeTab = useStore((s) => s.homeTab);
  const friends = useStore((s) => s.friends);
  const conns = useStore((s) => s.conns);
  const { comm } = useUnread();
  const remote = Object.values(conns).filter((x) => !x.local && !x.home);
  const home = Object.values(conns).find((x) => x.home);
  const requests = pendingIn(friends);
  const pinnedIds = useStore((s) => s.settings.pinnedDms);
  const dms = useMemo(() => {
    const hidden = hiddenDms();
    const list = dmList(communities).filter((c) => current === c.id || pinnedIds.includes(c.id) || !isDmHidden(c, hidden));
    // sabitlenenler en üstte, sabitlendikleri sırayla
    const pinned = pinnedIds.map((id) => list.find((c) => c.id === id)).filter((c): c is Community => !!c);
    return [...pinned, ...list.filter((c) => !pinnedIds.includes(c.id))];
  }, [communities, current, pinnedIds]);
  const onHome = current === 'home';
  return (
    <>
      <div className="side-header static">
        <span className="side-title">Ana Sayfa</span>
      </div>
      <div className="ch-list scroll-thin">
        <div className="home-links">
          <button className={cx('ch-row', onHome && homeTab === 'home' && 'active')} onClick={() => setHomeTab('home')}>
            <span className="ch-icon"><Home size={18} /></span>
            <span className="ch-name">Başlangıç</span>
          </button>
          <button className={cx('ch-row', onHome && homeTab !== 'home' && 'active')} onClick={() => setHomeTab(requests ? 'pending' : 'online')}>
            <span className="ch-icon"><Users size={18} /></span>
            <span className="ch-name">Arkadaşlar</span>
            {requests > 0 && <span className="badge">{requests}</span>}
          </button>
        </div>
        <div className="cat-row static">
          <span>Özel mesajlar</span>
          <Tooltip text="Arkadaş ekle">
            <button className="cat-add" onClick={() => setHomeTab('add')} aria-label="Arkadaş ekle">
              <Plus size={15} />
            </button>
          </Tooltip>
        </div>
        {dms.map((c) => (
          <DmRow key={c.id} c={c} active={current === c.id} unread={!!comm[c.id]?.unread} mentions={comm[c.id]?.mentions || 0} />
        ))}
        {!dms.length && <div className="dm-empty">Henüz özel mesajın yok. Bir arkadaşının profiline tıklayıp <b>Mesaj gönder</b> diyebilirsin.</div>}
        <div className="cat-row static">
          <span>Bağlantılar</span>
        </div>
        {home && (
          <div className="conn-row">
            <span className={cx('dot', home.status)} />
            <span className="conn-name">Sunucu</span>
            <span className="conn-meta">{home.status === 'online' ? 'bağlı' : home.status === 'connecting' ? 'bağlanıyor' : 'çevrimdışı'}</span>
          </div>
        )}
        {remote.map((x) => (
          <div key={x.host} className="conn-row">
            <span className={cx('dot', x.status)} />
            <span className="conn-name">{x.hubName ? `${x.hubName} sunucusu` : x.host}</span>
            <span className="conn-meta">{x.status === 'online' ? 'bağlı' : x.status === 'connecting' ? 'bağlanıyor' : 'çevrimdışı'}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export { ChannelGlyph as ChannelIcon };
