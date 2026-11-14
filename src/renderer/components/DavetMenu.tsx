// Yazma kutusu: artı menüsündeki "oynamaya / dinlemeye davet et" ve oyun açıkken kutunun üstündeki şerit
import React, { useState } from 'react';
import { Gamepad2, Headphones, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { useActs } from '../lib/activity';
import { sendPlayInvite, sendListenInvite, startInvites } from '../lib/davet';

startInvites();
import type { Channel, Community } from '../../shared/protocol';

const KEY = 'xn.davetSeridiKapali';
function readClosed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function useInviteables() {
  const game = useActs((s) => s.detected?.game?.name || '');
  const media = useActs((s) => (s.detected?.media?.playing && s.detected.media.title ? s.detected.media.appName || 'Müzik' : ''));
  return { game, media };
}

function useTarget(c: Community, ch: Channel) {
  const dmName = useStore((s) => (c.dm ? s.users[c.dm]?.name : undefined));
  return c.dm ? { label: `@${dmName || ch.name}`, word: 'kişisini' } : { label: `#${ch.name}`, word: 'kanalını' };
}

export function InviteMenuItems({ c, ch }: { c: Community; ch: Channel }) {
  const { game, media } = useInviteables();
  const t = useTarget(c, ch);
  if (!game && !media) return null;
  return (
    <>
      {game && (
        <button onClick={() => sendPlayInvite(ch.id)} className="cp-invite">
          <Gamepad2 size={17} />
          <span>
            <b>
              {t.label} {t.word} {game} oynamaya davet et
            </b>
            <small>Katılan, odana geçer ve oyunu açabilir</small>
          </span>
        </button>
      )}
      {media && (
        <button onClick={() => sendListenInvite(ch.id)} className="cp-invite">
          <Headphones size={17} />
          <span>
            <b>
              {t.label} {t.word} {media} dinlemeye davet et
            </b>
            <small>Katılan, sen şarkı değiştirdikçe seninle dinler</small>
          </span>
        </button>
      )}
      <div className="cp-sep" />
    </>
  );
}

/** Discord'daki "X oyun davetlerini destekliyor. Kapat" şeridi */
export function InviteStrip({ c, ch }: { c: Community; ch: Channel }) {
  const { game } = useInviteables();
  const [closed, setClosed] = useState(readClosed);
  const t = useTarget(c, ch);
  if (!game || closed.includes(game)) return null;
  const close = () => {
    const next = [...closed.filter((x) => x !== game), game].slice(-30);
    setClosed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* yok say */
    }
  };
  return (
    <div className="invite-strip">
      <Gamepad2 size={14} />
      <span>
        <b>{game}</b> oynuyorsun; {t.label} {t.word} davet edebilirsin.
      </span>
      <button className="link-btn" onClick={() => sendPlayInvite(ch.id)}>
        Davet et
      </button>
      <button className="link-btn dim" onClick={close}>
        Kapat
      </button>
    </div>
  );
}
