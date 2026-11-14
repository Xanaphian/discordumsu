// Oyuna ve dinlemeye davet kartları (mesaj içinde)
import React, { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Headphones, Volume2, Check, X, Play, Music2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { useVoice } from '../lib/voice';
import { useActsOf, useActs, openInSpotify, stopAlong } from '../lib/activity';
import { JOIN_KEY, type PlayCard, type ListenCard } from '../lib/cards';
import { inviteClosed, joinPlay, joinListen, leaveInvite, closeInvite } from '../lib/davet';
import { Avatar } from './Common';
import { cx, displayName } from '../lib/util';
import { useNow, fmtDur, BrandLogo } from './profile/Activity';
import { isVoiceLike, type Community, type Message, type ID } from '../../shared/protocol';

function Joined({ ids, c, label }: { ids: ID[]; c: Community; label: string }) {
  const users = useStore((s) => s.users);
  if (!ids.length) return <span className="xcard-muted">{label}</span>;
  return (
    <span className="inv-joined">
      <span className="inv-faces">
        {ids.slice(0, 5).map((u) => (
          <Avatar key={u} user={users[u] || c.users[u]} size={22} />
        ))}
      </span>
      <span className="xcard-muted">
        {ids.length === 1 ? `${displayName(c, ids[0], users)} katıldı` : `${ids.length} kişi katıldı`}
      </span>
    </span>
  );
}

const STORE_LABEL: Record<string, string> = { steam: 'Steam', epic: 'Epic Games', riot: 'Riot', xbox: 'Xbox', ea: 'EA', ubisoft: 'Ubisoft', gog: 'GOG', battlenet: 'Battle.net' };

export function PlayInviteView({ m, card, c, me }: { m: Message; card: PlayCard; c: Community; me: ID }) {
  const users = useStore((s) => s.users);
  const voice = useStore((s) => s.voice);
  const myVc = useVoice((s) => s.ch);
  const live = useActsOf(m.authorId).find((x) => x.kind === 'playing' && x.name.slice(0, 80) === card.g);
  const now = useNow(!!live?.start, 30_000);
  const closed = inviteClosed(m, card);
  const joined = (m.reactions?.[JOIN_KEY] || []).filter((u) => u !== m.authorId);
  const mine = m.authorId === me;
  const inIt = joined.includes(me);
  const name = displayName(c, m.authorId, users);
  const vc = useMemo(() => c.channels.find((x) => isVoiceLike(x.type) && (voice[x.id] || []).some((v) => v.userId === m.authorId)), [c.channels, voice, m.authorId]);
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (closed || mine) return;
    let on = true;
    (window as any).kovan?.game?.has?.(card.g).then((v: boolean) => on && setHas(!!v)).catch(() => {});
    return () => void (on = false);
  }, [card.g, closed, mine]);
  const sub = [card.d, card.s].filter(Boolean).join(' · ');
  const launch = () => (window as any).kovan?.game?.launch?.(card.g);
  return (
    <div className={cx('xcard invite play', closed && 'ended')}>
      <div className="xcard-head">
        <span className={cx('xcard-ico inv-art', live?.icon && 'img')}>{live?.icon ? <img src={live.icon} alt="" draggable={false} /> : <Gamepad2 size={19} />}</span>
        <div className="xcard-title">
          <em className="inv-kicker">{closed || mine ? (mine ? 'Oyun davetin' : 'Oyun daveti') : `${name} seni oynamaya çağırıyor`}</em>
          <b>{card.g}</b>
          <small>
            {sub || (card.st ? STORE_LABEL[card.st] || '' : '')}
            {live?.start && !closed ? `${sub || card.st ? ' · ' : ''}${fmtDur(now - live.start)} geçti` : ''}
          </small>
        </div>
        {!closed && (
          <span className="inv-live">
            <i /> Oynuyor
          </span>
        )}
      </div>
      {vc && !closed && !mine && (
        <div className="xcard-note inv-note">
          <Volume2 size={14} /> {name} şu an <b>{vc.name}</b> odasında; katılınca oraya geçersin.
        </div>
      )}
      <div className="xcard-foot">
        {closed ? (
          <span className="lfg-closed inv-closed">
            <X size={15} /> Davet sona erdi
            <small>{card.x ? `${name} oyundan çıktı.` : 'Süresi doldu.'}</small>
          </span>
        ) : mine ? (
          <>
            <Joined ids={joined} c={c} label="Davetin açık." />
            <button className="btn ghost sm" onClick={() => closeInvite(m, card)}>
              Daveti kapat
            </button>
          </>
        ) : inIt ? (
          <>
            <span className="xcard-ok">
              <Check size={15} /> Katıldın
            </span>
            <button className="btn ghost sm" onClick={() => leaveInvite(m)} style={{ marginLeft: 'auto' }}>
              Ayrıl
            </button>
            {has ? (
              <button className="btn primary sm" onClick={launch}>
                <Play size={14} /> Oyunu aç
              </button>
            ) : vc && myVc !== vc.id ? (
              <button className="btn primary sm" onClick={() => joinPlay(m, card, c, myVc)}>
                <Volume2 size={14} /> Odaya geç
              </button>
            ) : null}
          </>
        ) : (
          <>
            <Joined ids={joined} c={c} label={has ? 'Oyun bu bilgisayarda kurulu.' : 'Henüz katılan yok.'} />
            <button className="btn primary sm" onClick={() => joinPlay(m, card, c, myVc)}>
              Katıl
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ListenInviteView({ m, card, c, me }: { m: Message; card: ListenCard; c: Community; me: ID }) {
  const users = useStore((s) => s.users);
  const along = useActs((s) => s.along);
  const live = useActsOf(m.authorId).find((x) => x.kind === 'listening');
  const same = !!live && live.details === card.t;
  const timed = same && !!live!.start && !!live!.end;
  const now = useNow(timed);
  const closed = inviteClosed(m, card);
  const joined = (m.reactions?.[JOIN_KEY] || []).filter((u) => u !== m.authorId);
  const mine = m.authorId === me;
  const following = along === m.authorId;
  const name = displayName(c, m.authorId, users);
  const pct = timed ? Math.min(100, Math.max(0, ((now - live!.start!) / (live!.end! - live!.start!)) * 100)) : 0;
  const brand = card.src === 'spotify' ? 'spotify' : undefined;
  return (
    <div className={cx('xcard invite listen', card.src && 'src-' + card.src, closed && 'ended')}>
      <div className="xcard-head">
        <span className={cx('xcard-ico inv-art cover', same && live!.art && 'img')}>
          {same && live!.art ? <img src={live!.art} alt="" draggable={false} /> : <Headphones size={19} />}
        </span>
        <div className="xcard-title">
          <em className="inv-kicker">
            {brand && <BrandLogo k={brand} size={12} plain />}
            {closed || mine ? `${card.p} dinleme davet${mine ? 'in' : 'i'}` : `${name} seni ${card.p} dinlemeye çağırıyor`}
          </em>
          <b>{card.t}</b>
          {card.a && <small>{card.a}</small>}
        </div>
        {!closed && (
          <span className="inv-live">
            <i /> Dinliyor
          </span>
        )}
      </div>
      {timed && !closed && (
        <div className="inv-bar">
          <i>
            <u style={{ width: pct + '%' }} />
          </i>
        </div>
      )}
      {!closed && live && !same && live.details && (
        <div className="xcard-note inv-note">
          <Music2 size={14} /> Şimdi çalıyor: <b>{live.details}</b>
          {live.state ? ` · ${live.state}` : ''}
        </div>
      )}
      <div className="xcard-foot">
        {closed ? (
          <span className="lfg-closed inv-closed">
            <X size={15} /> Davet sona erdi
            <small>{card.x ? `${name} müziği durdurdu.` : 'Süresi doldu.'}</small>
          </span>
        ) : mine ? (
          <>
            <Joined ids={joined} c={c} label="Davetin açık." />
            <button className="btn ghost sm" onClick={() => closeInvite(m, card)}>
              Daveti kapat
            </button>
          </>
        ) : following ? (
          <>
            <span className="xcard-ok">
              <Headphones size={15} /> Beraber dinliyorsun
            </span>
            <button className="btn ghost sm" onClick={() => (stopAlong(), leaveInvite(m))}>
              Bırak
            </button>
          </>
        ) : (
          <>
            <Joined ids={joined} c={c} label="Henüz katılan yok." />
            <button className="btn ghost sm" onClick={() => openInSpotify({ kind: 'listening', name: card.p, details: card.t, state: card.a })} style={{ marginLeft: 'auto' }}>
              Spotify'da aç
            </button>
            <button className="btn primary sm" onClick={() => joinListen(m)}>
              <Headphones size={14} /> Beraber dinle
            </button>
          </>
        )}
      </div>
    </div>
  );
}
