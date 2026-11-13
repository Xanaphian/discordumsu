// Kaydedilenler ve zamanlanmış mesaj şeridi.
import React, { useEffect, useRef } from 'react';
import { Bookmark, Trash2, CalendarClock } from 'lucide-react';
import { useStore, jumpToMessage, sendMessage } from '../lib/store';
import { useLater, removeSaved, unschedule } from '../lib/later';
import { Avatar } from './Common';
import { cx, displayName, fmtTime } from '../lib/util';
import type { ID } from '../../shared/protocol';

export function SavedPopover({ onClose }: { onClose: () => void }) {
  const saved = useLater((s) => s.saved);
  const users = useStore((s) => s.users);
  const comms = useStore((s) => s.communities);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    setTimeout(() => document.addEventListener('mousedown', h));
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div className="popover saved-pop" ref={ref}>
      <div className="popover-title">Kaydedilenler</div>
      <div className="popover-body scroll-thin">
        {!saved.length && (
          <div className="empty-note">
            Sonra dönmek istediğin mesajları buraya kaydet: mesajın üstündeki <Bookmark size={13} /> simgesine ya da sağ tık menüsündeki "Mesajı kaydet"e bas.
          </div>
        )}
        {saved.map((x) => {
          const c = comms[x.cid];
          const chName = c?.dm ? 'Özel mesaj' : '#' + (c?.channels.find((k) => k.id === x.ch)?.name || 'kanal');
          return (
            <div key={x.id} className={cx('mini-msg saved-row', !c && 'gone')} onClick={() => c && (onClose(), jumpToMessage(x.cid, x.ch, x.id))}>
              <Avatar user={users[x.author] || c?.users[x.author]} size={28} />
              <div>
                <div className="mini-head">
                  <b>{displayName(c, x.author, users)}</b> <span>{fmtTime(x.ts)}</span>
                  <span className="saved-where">
                    {c?.dm ? '' : c?.name + ' · '}
                    {chName}
                  </span>
                </div>
                <div className="mini-body">{x.text}</div>
              </div>
              <button
                className="icon-btn saved-del"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSaved(x.id);
                }}
                aria-label="Kaydı kaldır"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScheduledStrip({ ch }: { ch: ID }) {
  const list = useLater((s) => s.scheduled).filter((x) => x.ch === ch);
  if (!list.length) return null;
  return (
    <div className="sched-strip">
      {list.slice(0, 3).map((x) => (
        <div key={x.id} className="sched-item">
          <CalendarClock size={15} />
          <b>{fmtTime(x.at)}</b>
          <span className="sched-text">{x.content}</span>
          <button
            className="link"
            onClick={() => {
              unschedule(x.id);
              sendMessage(x.ch, x.content);
            }}
          >
            Şimdi gönder
          </button>
          <button className="link danger" onClick={() => unschedule(x.id)}>
            İptal
          </button>
        </div>
      ))}
      {list.length > 3 && <div className="sched-more">ve {list.length - 3} zamanlanmış mesaj daha</div>}
    </div>
  );
}
