import React, { memo, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, Hash, Volume2, Megaphone, Box, Plus, Settings, Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, UserPlus,
  Signal, WifiOff, Bell, Lock, Video, VideoOff, MonitorUp, MonitorX, Globe,
} from 'lucide-react';
import {
  useStore, selectChannel, openModal, openMenu, markRead, markCommunityRead, cmd, confirmDialog, leaveCommunity, deleteCommunity, setStatus,
  updateSettings, toggleMuted, toast,
} from '../lib/store';
import { useVoice, joinVoice, leaveVoice, toggleMute, toggleDeaf, toggleCamera, stopScreen } from '../lib/voice';
import { enterSpace, exitSpace } from '../lib/space';
import { Avatar, STATUS_LABEL, Tooltip } from './Common';
import { SiteViewers } from './SiteView';
import { useUnread } from './ServerRail';
import { cx, copyText, displayName } from '../lib/util';
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

const ChannelIcon = ({ type, size = 18 }: { type: Channel['type']; size?: number }) =>
  type === 'voice' ? <Volume2 size={size} /> : type === 'space' ? <Box size={size} /> : type === 'site' ? <Globe size={size} /> : type === 'announce' ? <Megaphone size={size} /> : <Hash size={size} />;

const VoiceMembers = memo(function VoiceMembers({ c, chId }: { c: Community; chId: string }) {
  const members = useStore((s) => s.voice[chId]);
  const users = useStore((s) => s.users);
  const speaking = useVoice((s) => s.speaking);
  if (!members?.length) return null;
  return (
    <div className="vc-members">
      {members.map((m) => (
        <div key={m.sessionId} className="vc-member" onClick={(e) => useStore.setState({ popout: { uid: m.userId, cid: c.id, x: e.clientX, y: e.clientY } })}>
          <Avatar user={users[m.userId]} size={22} speaking={!!speaking[m.userId] && !m.muted} />
          <span className="vc-name">{displayName(c, m.userId, users)}</span>
          <span className="vc-flags">
            {m.cam ? <Video size={13} className="cam" /> : null}
            {m.screen ? <span className="live-badge">CANLI</span> : null}
            {m.deaf ? <HeadphoneOff size={13} /> : m.muted ? <MicOff size={13} /> : null}
          </span>
        </div>
      ))}
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
  const click = () => {
    if (ch.type === 'voice' && !inVoice) tryJoinVoice(c, ch);
    selectChannel(c.id, ch.id);
  };
  const menu = (e: React.MouseEvent) =>
    openMenu(e, [
      ...(!isVoiceLike(ch.type) ? [{ label: 'Okundu olarak işaretle', onClick: () => markRead(ch.id), disabled: !unread }] : []),
      ...(isVoiceLike(ch.type)
        ? [
            inVoice
              ? { label: ch.type === 'space' ? 'Odadan çık' : 'Bağlantıyı kes', onClick: () => (ch.type === 'space' ? exitSpace() : leaveVoice()) }
              : {
                  label: ch.type === 'space' ? 'Odaya gir' : 'Katıl',
                  onClick: () => {
                    if (ch.type === 'space') {
                      selectChannel(c.id, ch.id);
                      enterSpace(c.id, ch.id);
                    } else tryJoinVoice(c, ch);
                  },
                },
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
  return (
    <>
      <div
        className={cx('ch-row', active && 'active', unread && !active && !muted && 'unread', inVoice && 'in-voice', over && 'drop-over', muted && 'muted')}
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
        <span className="ch-icon">
          <ChannelIcon type={ch.type} />
        </span>
        <span className="ch-name">{ch.name}</span>
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
});

export function ChannelSidebar({ c }: { c: Community }) {
  const me = useStore((s) => s.me.id);
  const active = useStore((s) => s.chanByComm[c.id]);
  const collapsed = useStore((s) => s.settings.collapsed);
  const mentions = useStore((s) => s.mentions);
  const connStatus = useStore((s) => s.conns[s.commHost[c.id]]?.status);
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
      ...(c.inviteKey ? [{ label: 'Davet et', icon: 'invite', onClick: () => openModal({ type: 'invite', cid: c.id }) }] : []),
      { label: 'Topluluk ayarları', icon: 'settings', onClick: () => openModal({ type: 'commSettings', cid: c.id }) },
      ...(can(c, me, Perm.MANAGE_ROLES) ? [{ label: 'Roller', icon: 'roles', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'roles' }) }] : []),
      { label: 'Üyeler', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'members' }) },
      ...(can(c, me, Perm.VIEW_AUDIT_LOG) ? [{ label: 'Denetim kaydı', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'audit' }) }] : []),
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
      <button className="side-header" onClick={headerMenu}>
        <span className="side-title">{c.name}</span>
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

export function VoicePanel() {
  const v = useVoice();
  const c = useStore((s) => (v.cid ? s.communities[v.cid] : undefined));
  if (!v.ch || !c) return null;
  const ch = c.channels.find((x) => x.id === v.ch);
  return (
    <div className="voice-panel">
      <div className="vp-info" onClick={() => selectChannel(c.id, v.ch!)}>
        <div className={cx('vp-state', v.state)}>
          <Signal size={15} /> {v.state === 'connected' ? 'Ses bağlı' : 'Bağlanıyor…'}
        </div>
        <div className="vp-where">
          {ch?.name} / {c.name}
        </div>
      </div>
      {ch?.type === 'voice' && (
        <>
          <Tooltip text={v.cam ? 'Kamerayı kapat' : 'Kamerayı aç'} side="top">
            <button className={cx('icon-btn', v.cam && 'on')} onClick={toggleCamera} aria-label="Kamera">
              {v.cam ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
          </Tooltip>
          <Tooltip text={v.screen ? 'Yayını durdur' : 'Ekran paylaş'} side="top">
            <button className={cx('icon-btn', v.screen && 'live')} onClick={() => (v.screen ? stopScreen() : openModal({ type: 'screenShare' }))} aria-label="Ekran paylaş">
              {v.screen ? <MonitorX size={18} /> : <MonitorUp size={18} />}
            </button>
          </Tooltip>
        </>
      )}
      <Tooltip text="Bağlantıyı kes" side="top">
        <button className="icon-btn danger" onClick={() => leaveVoice()} aria-label="Bağlantıyı kes">
          <PhoneOff size={18} />
        </button>
      </Tooltip>
    </div>
  );
}

const STATUSES: Status[] = ['online', 'idle', 'dnd', 'invisible'];

export function UserPanel() {
  const me = useStore((s) => s.me);
  const muted = useVoice((s) => s.muted);
  const deaf = useVoice((s) => s.deaf);
  const statusMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu({ clientX: r.left, clientY: r.top - 8 - 4 * 34 - 60 }, [
      ...STATUSES.map((st) => ({ label: STATUS_LABEL[st], icon: 'status-' + st, checked: me.status === st, onClick: () => setStatus(st) })),
      { sep: true },
      { label: 'Profili düzenle', onClick: () => openModal({ type: 'settings', tab: 'profile' }) },
      { label: 'Kimliğini kopyala', onClick: () => copyText(me.id) },
    ]);
  };
  return (
    <div className="user-panel">
      <button className="up-me" onClick={statusMenu}>
        <Avatar user={me} size={34} status={me.status === 'invisible' ? 'offline' : me.status} />
        <div className="up-text">
          <div className="up-name">{me.name}</div>
          <div className="up-status">{STATUS_LABEL[me.status]}</div>
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
      {current === 'home' || !c ? <HomeSidebar /> : <ChannelSidebar c={c} />}
      <VoicePanel />
      <UserPanel />
    </aside>
  );
}

function HomeSidebar() {
  const communities = useStore((s) => s.communities);
  const conns = useStore((s) => s.conns);
  const localPort = useStore((s) => s.info?.hubPort);
  const remote = Object.values(conns).filter((x) => !x.local);
  return (
    <>
      <div className="side-header static">
        <span className="side-title">Ana Sayfa</span>
      </div>
      <div className="ch-list scroll-thin">
        <div className="home-links">
          <button className="ch-row" onClick={() => openModal({ type: 'createCommunity' })}>
            <span className="ch-icon"><Plus size={18} /></span>
            <span className="ch-name">Topluluk oluştur</span>
          </button>
          <button className="ch-row" onClick={() => openModal({ type: 'join' })}>
            <span className="ch-icon"><UserPlus size={18} /></span>
            <span className="ch-name">Davetle katıl</span>
          </button>
          <button className="ch-row" onClick={() => openModal({ type: 'settings', tab: 'notifications' })}>
            <span className="ch-icon"><Bell size={18} /></span>
            <span className="ch-name">Bildirimler</span>
          </button>
        </div>
        <div className="cat-row static">
          <span>Bağlantılar</span>
        </div>
        <div className="conn-row">
          <span className={cx('dot', 'online')} />
          <span className="conn-name">Kendi kovanın</span>
          <span className="conn-meta">:{localPort}</span>
        </div>
        {remote.map((x) => (
          <div key={x.host} className="conn-row">
            <span className={cx('dot', x.status)} />
            <span className="conn-name">{x.hubName ? `${x.hubName} kovanı` : x.host}</span>
            <span className="conn-meta">{x.status === 'online' ? 'bağlı' : x.status === 'connecting' ? 'bağlanıyor' : 'çevrimdışı'}</span>
          </div>
        ))}
        <div className="cat-row static">
          <span>Toplulukların ({Object.keys(communities).length})</span>
        </div>
      </div>
    </>
  );
}

export { ChannelIcon };
