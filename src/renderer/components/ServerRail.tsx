import React, { memo, useMemo, useState } from 'react';
import { Plus, LogIn, WifiOff } from 'lucide-react';
import { useStore, selectCommunity, openModal, openMenu, markCommunityRead, updateSettings, leaveCommunity, deleteCommunity, confirmDialog } from '../lib/store';
import { CommunityIcon, Logo, Tooltip } from './Common';
import { cx, copyText } from '../lib/util';
import type { Community } from '../../shared/protocol';
import { can, Perm, isVoiceLike } from '../../shared/protocol';

export function useUnread() {
  const communities = useStore((s) => s.communities);
  const lastIds = useStore((s) => s.lastIds);
  const read = useStore((s) => s.read);
  const mentions = useStore((s) => s.mentions);
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
        if (u) unread = true;
        m += mentions[ch.id] || 0;
      }
      comm[c.id] = { unread, mentions: m };
    }
    return { unreadCh, comm };
  }, [communities, lastIds, read, mentions]);
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
      { label: 'Davet et', onClick: () => openModal({ type: 'invite', cid: c.id }) },
      ...(can(c, me, Perm.MANAGE_COMMUNITY) || can(c, me, Perm.MANAGE_ROLES) ? [{ label: 'Topluluk ayarları', onClick: () => openModal({ type: 'commSettings', cid: c.id }) }] : []),
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
  return (
    <div
      className={cx('rail-item', active && 'active', unread && 'unread', over && 'drop-over')}
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
      <span className="rail-pill" />
      <Tooltip text={c.name}>
        <button className={cx('rail-btn hex', offline && 'offline')} onClick={() => selectCommunity(c.id)} onContextMenu={menu} aria-label={c.name}>
          <CommunityIcon c={c} size={48} />
          {offline && (
            <span className="rail-offline">
              <WifiOff size={12} />
            </span>
          )}
        </button>
      </Tooltip>
      {mentions > 0 && <span className="badge rail-badge">{mentions > 99 ? '99+' : mentions}</span>}
    </div>
  );
});

export function ServerRail() {
  const current = useStore((s) => s.current);
  const communities = useStore((s) => s.communities);
  const order = useStore((s) => s.settings.railOrder);
  const commHost = useStore((s) => s.commHost);
  const conns = useStore((s) => s.conns);
  const { comm } = useUnread();
  const [drag, setDrag] = useState<string | null>(null);
  const list = useMemo(() => {
    const ids = order.filter((id) => communities[id]);
    for (const id of Object.keys(communities)) if (!ids.includes(id)) ids.push(id);
    return ids.map((id) => communities[id]);
  }, [order, communities]);
  const totalMentions = Object.values(comm).reduce((a, b) => a + b.mentions, 0);

  const drop = (target: string) => {
    if (!drag || drag === target) return;
    const ids = list.map((c) => c.id).filter((x) => x !== drag);
    ids.splice(ids.indexOf(target), 0, drag);
    updateSettings({ railOrder: ids });
    setDrag(null);
  };

  return (
    <nav className="rail">
      <div className={cx('rail-item', current === 'home' && 'active')}>
        <span className="rail-pill" />
        <Tooltip text="Ana Sayfa">
          <button className="rail-btn home" onClick={() => selectCommunity('home')} aria-label="Ana Sayfa">
            <Logo size={28} />
          </button>
        </Tooltip>
        {totalMentions > 0 && current !== 'home' ? null : null}
      </div>
      <div className="rail-sep" />
      <div className="rail-list">
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
        <div className="rail-item">
          <Tooltip text="Topluluk oluştur">
            <button className="rail-btn action hex" onClick={() => openModal({ type: 'createCommunity' })} aria-label="Topluluk oluştur">
              <Plus size={22} />
            </button>
          </Tooltip>
        </div>
        <div className="rail-item">
          <Tooltip text="Davetle katıl">
            <button className="rail-btn action hex" onClick={() => openModal({ type: 'join' })} aria-label="Davetle katıl">
              <LogIn size={20} />
            </button>
          </Tooltip>
        </div>
      </div>
    </nav>
  );
}
