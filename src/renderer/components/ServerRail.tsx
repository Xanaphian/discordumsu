import React, { memo, useMemo, useState } from 'react';
import { Plus, LogIn, WifiOff, Home, Compass } from 'lucide-react';
import { useStore, selectCommunity, openModal, openMenu, markCommunityRead, updateSettings, leaveCommunity, deleteCommunity, confirmDialog, toggleMuted, dmList, closeDm, pendingIn, isDmHidden, hiddenDms } from '../lib/store';
import { Avatar, CommunityIcon, Tooltip } from './Common';
import { cx, copyText } from '../lib/util';
import type { Community } from '../../shared/protocol';
import { can, Perm, isVoiceLike } from '../../shared/protocol';

export function useUnread() {
  const communities = useStore((s) => s.communities);
  const lastIds = useStore((s) => s.lastIds);
  const read = useStore((s) => s.read);
  const mentions = useStore((s) => s.mentions);
  const mutedIds = useStore((s) => s.settings.mutedIds);
  return useMemo(() => {
    const unreadCh: Record<string, boolean> = {};
    const comm: Record<string, { unread: boolean; mentions: number }> = {};
    for (const c of Object.values(communities)) {
      let unread = false, m = 0;
      for (const ch of c.channels) {
        if (isVoiceLike(ch.type)) continue;
        const last = lastIds[ch.id];
        const u = !!last && (!read[ch.id] || last > read[ch.id]);
        unreadCh[ch.id] = u;
        if (u && !mutedIds.includes(ch.id) && !mutedIds.includes(c.id)) unread = true;
        m += mentions[ch.id] || 0;
      }
      comm[c.id] = { unread, mentions: m };
    }
    return { unreadCh, comm };
  }, [communities, lastIds, read, mentions, mutedIds]);
}

const RailItem = memo(function RailItem({
  c,
  active,
  unread,
  mentions,
  offline,
  onDragStart,
  onDrop,
}: {
  c: Community;
  active: boolean;
  unread: boolean;
  mentions: number;
  offline: boolean;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const me = useStore((s) => s.me.id);
  const [over, setOver] = useState(false);
  const menu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: 'Okundu olarak işaretle', onClick: () => markCommunityRead(c.id), disabled: !unread },
      { sep: true },
      ...(c.inviteKey ? [{ label: 'Davet et', onClick: () => openModal({ type: 'invite', cid: c.id }) }] : []),
      { label: 'Topluluk ayarları', onClick: () => openModal({ type: 'commSettings', cid: c.id }) },
      ...(can(c, me, Perm.MANAGE_ROLES) ? [{ label: 'Roller', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'roles' }) }] : []),
      { label: 'Bildirim ayarları', onClick: () => openModal({ type: 'notify', cid: c.id }) },
      { label: useStore.getState().settings.mutedIds.includes(c.id) ? 'Topluluğun sesini aç' : 'Topluluğu sessize al', onClick: () => toggleMuted(c.id) },
      { sep: true },
      c.ownerId === me
        ? {
            label: 'Topluluğu sil',
            danger: true,
            onClick: () => confirmDialog(`"${c.name}" silinsin mi?`, 'Tüm kanallar ve mesajlar kalıcı olarak silinir. Bu işlem geri alınamaz.', () => deleteCommunity(c.id), 'Topluluğu sil'),
          }
        : {
            label: 'Topluluktan ayrıl',
            danger: true,
            onClick: () => confirmDialog(`"${c.name}" topluluğundan ayrıl?`, 'Tekrar katılmak için yeni bir davet gerekir.', () => leaveCommunity(c.id), 'Ayrıl'),
          },
      { sep: true },
      { label: 'Kimliği kopyala', hint: c.id.slice(-6), onClick: () => copyText(c.id) },
    ]);
  const btn = (
    <button
      className={cx('pt-btn', active && 'on', unread && 'unread', offline && 'offline', over && 'drop-over')}
      style={{ ['--cc' as any]: c.color }}
      onClick={() => selectCommunity(c.id)}
      onContextMenu={menu}
      aria-label={c.name}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop();
      }}
    >
      <span className="pt-hex">
        <CommunityIcon c={c} size={30} />
      </span>
      <span className="pt-name">{c.name}</span>
      {offline && (
        <span className="pt-offline">
          <WifiOff size={10} />
        </span>
      )}
      {mentions > 0 && <span className="badge pt-badge">{mentions > 99 ? '99+' : mentions}</span>}
      {unread && !active && <span className="pt-dot" />}
    </button>
  );
  return (
    <Tooltip text={c.name} side="right">
      {btn}
    </Tooltip>
  );
});

/** Rail'de, okunmamış mesajı olan özel sohbet (Discord'daki gibi Ana Sayfa'nın altında) */
const DmRailItem = memo(function DmRailItem({ c, active, mentions }: { c: Community; active: boolean; mentions: number }) {
  const user = useStore((s) => s.users[c.dm!] || c.users[c.dm!]);
  const status = useStore((s) => s.presence[c.dm!]);
  const name = user?.name || c.name;
  const menu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: 'Okundu olarak işaretle', onClick: () => markCommunityRead(c.id), disabled: !mentions },
      { label: 'Profil', onClick: () => useStore.setState({ popout: { uid: c.dm!, cid: c.id, x: e.clientX + 20, y: e.clientY } }) },
      { sep: true },
      { label: 'Sohbeti kapat', onClick: () => closeDm(c.id) },
    ]);
  return (
    <Tooltip text={name} side="right">
      <button className={cx('pt-btn pt-dm', active && 'on', mentions > 0 && 'unread')} onClick={() => selectCommunity(c.id)} onContextMenu={menu} aria-label={name}>
        <span className="pt-hex">
          <Avatar user={user} size={46} status={status} plain shape="circle" />
        </span>
        {mentions > 0 && <span className="badge pt-badge">{mentions > 99 ? '99+' : mentions}</span>}
      </button>
    </Tooltip>
  );
});

/** Soldaki dikey topluluk listesi (1.9'da üst çubuktan geri taşındı) */
export function ServerRail() {
  const current = useStore((s) => s.current);
  const communities = useStore((s) => s.communities);
  const order = useStore((s) => s.settings.railOrder);
  const commHost = useStore((s) => s.commHost);
  const conns = useStore((s) => s.conns);
  const { comm } = useUnread();
  const [drag, setDrag] = useState<string | null>(null);
  const friends = useStore((s) => s.friends);
  const list = useMemo(() => {
    const ids = order.filter((id) => communities[id] && !communities[id].dm);
    for (const id of Object.keys(communities)) if (!ids.includes(id) && !communities[id].dm) ids.push(id);
    return ids.map((id) => communities[id]);
  }, [order, communities]);
  // okunmamış özel mesajlar (ve açık olan sohbet) en üstte, en son yazan en üstte
  const dms = useMemo(() => {
    const hidden = hiddenDms();
    return dmList(communities).filter((c) => (comm[c.id]?.mentions || current === c.id) && !isDmHidden(c, hidden)).slice(0, 6);
  }, [communities, comm, current]);
  const requests = pendingIn(friends);
  const homeOn = current === 'home' || !!communities[current]?.dm;

  const drop = (target: string) => {
    if (!drag || drag === target) return;
    const ids = list.map((c) => c.id).filter((x) => x !== drag);
    ids.splice(ids.indexOf(target), 0, drag);
    updateSettings({ railOrder: ids });
    setDrag(null);
  };

  return (
    <nav className="petek rail-v">
      <Tooltip text={requests ? `Ana Sayfa · ${requests} arkadaşlık isteği` : 'Ana Sayfa ve özel mesajlar'} side="right">
        <button className={cx('pt-btn pt-home', homeOn && 'on')} onClick={() => selectCommunity('home')} aria-label="Ana Sayfa">
          <span className="pt-hex">
            <Home size={16} />
          </span>
          {requests > 0 && <span className="badge pt-badge">{requests}</span>}
        </button>
      </Tooltip>
      {dms.map((c) => (
        <DmRailItem key={c.id} c={c} active={current === c.id} mentions={comm[c.id]?.mentions || 0} />
      ))}
      <span className="pt-sep" />
      <div className="pt-list">
        {list.map((c) => (
          <RailItem
            key={c.id}
            c={c}
            active={current === c.id}
            unread={!!comm[c.id]?.unread}
            mentions={comm[c.id]?.mentions || 0}
            offline={conns[commHost[c.id]]?.status !== 'online'}
            onDragStart={() => setDrag(c.id)}
            onDrop={() => drop(c.id)}
          />
        ))}
      </div>
      <Tooltip text="Topluluk oluştur" side="right">
        <button className="pt-btn pt-act" onClick={() => openModal({ type: 'createCommunity' })} aria-label="Topluluk oluştur">
          <span className="pt-hex">
            <Plus size={16} />
          </span>
        </button>
      </Tooltip>
      <Tooltip text="Davetle katıl" side="right">
        <button className="pt-btn pt-act" onClick={() => openModal({ type: 'join' })} aria-label="Davetle katıl">
          <span className="pt-hex">
            <LogIn size={15} />
          </span>
        </button>
      </Tooltip>
      <Tooltip text="Toplulukları keşfet" side="right">
        <button className={cx('pt-btn pt-act', current === 'explore' && 'on')} onClick={() => selectCommunity('explore')} aria-label="Toplulukları keşfet">
          <span className="pt-hex">
            <Compass size={16} />
          </span>
        </button>
      </Tooltip>
    </nav>
  );
}
