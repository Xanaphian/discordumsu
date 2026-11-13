// Kart mesajları: takım ilanı, anket ve bunları kuran pencereler.
import React, { useMemo, useState } from 'react';
import { Swords, ChartNoAxesColumn, Check, Volume2, UsersRound, Clock, X, Plus, Minus, CalendarClock } from 'lucide-react';
import { useStore, toggleReaction, sendMessage, toast } from '../lib/store';
import { useVoice, joinVoice } from '../lib/voice';
import { Avatar } from './Common';
import { cx, displayName, hm, fmtTime } from '../lib/util';
import {
  encodeCard, lfgSlots, pollVotes, slotKey, voteKey,
  type LfgCard, type PollCard, type Card,
} from '../lib/cards';
import { presets, schedule } from '../lib/later';
import { useActs } from '../lib/activity';
import { LFG_GAMES, lfgGameOf, slotsFor, type LfgGame } from '../lib/lfgGames';
import { BrandLogo } from './profile/Activity';
import { isVoiceLike, type Community, type Message, type ID } from '../../shared/protocol';

// ---------------------------------------------------------------------------
// Takım ilanı
function LfgView({ m, card, c, me }: { m: Message; card: LfgCard; c: Community; me: ID }) {
  const users = useStore((s) => s.users);
  const voice = useStore((s) => s.voice);
  const myVc = useVoice((s) => s.ch);
  const slots = lfgSlots(m, card);
  const filled = slots.filter(Boolean).length;
  const full = filled === slots.length;
  const mySlot = slots.indexOf(me);
  const roles = card.s.some((x) => x);
  const mineCard = m.authorId === me;

  const take = (i: number) => {
    if (slots[i] && slots[i] !== me) return;
    if (mineCard && card.own !== undefined) return toast('Bu senin ilanın; zaten takımdasın.', 'info');
    // tek yer: önce eski yerden çık
    for (let j = 0; j < card.s.length; j++) if (j !== i && m.reactions?.[slotKey(j)]?.includes(me)) toggleReaction(m, slotKey(j));
    toggleReaction(m, slotKey(i));
  };

  // takım dolunca: ilan sahibinin bulunduğu ya da ilk ses odası
  const team = slots.filter(Boolean) as ID[];
  const vc = useMemo(() => {
    const vcs = c.channels.filter((x) => isVoiceLike(x.type));
    return vcs.find((x) => (voice[x.id] || []).some((v) => v.userId === m.authorId)) || vcs.find((x) => x.type === 'voice') || vcs[0];
  }, [c.channels, voice, m.authorId]);
  const inTeam = team.includes(me);

  const game = lfgGameOf(card);
  const theme = game?.theme.a ? ({ '--g-a': game.theme.a, '--g-b': game.theme.b, '--g-bg': game.theme.bg, '--g-ink': game.theme.ink || '#111' } as React.CSSProperties) : undefined;
  const cols = slots.length <= 5 ? slots.length : Math.ceil(slots.length / 2);

  return (
    <div className={cx('xcard lfg', full && 'full', theme && 'themed', game && 'g-' + game.key)} style={theme}>
      <div className="xcard-head">
        {game?.brand ? (
          <BrandLogo k={game.brand} size={40} className="lfg-logo" />
        ) : (
          <span className="xcard-ico">
            <Swords size={18} />
          </span>
        )}
        <div className="xcard-title">
          <b>{card.g}</b>
          <small>
            {card.m || 'Takım arıyor'} · {card.at && card.at > Date.now() + 60_000 ? `${fmtTime(card.at)} için` : 'şimdi'}
          </small>
        </div>
        <span className={cx('xcard-count', full && 'ok')}>
          {filled}/{slots.length}
        </span>
      </div>
      {card.n && <div className="xcard-note">{card.n}</div>}
      <div className="lfg-slots" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {slots.map((u, i) => {
          const name = roles ? card.s[i] : `${i + 1}. ${game?.slotWord || 'oyuncu'}`;
          return (
            <button
              key={i}
              className={cx('lfg-slot', u && 'taken', u === me && 'me')}
              onClick={() => take(i)}
              disabled={!!u && u !== me}
              title={u === me ? 'Yerinden çık' : u ? undefined : 'Bu yere geç'}
            >
              <span className={cx('lfg-state', u ? 'on' : 'off')}>{u ? 'Dolu' : 'Boş'}</span>
              {u ? <Avatar user={users[u] || c.users[u]} size={36} /> : <span className="lfg-empty">+</span>}
              <span className="lfg-role">{name}</span>
              <span className="lfg-who">{u ? (u === me ? 'Sen' : displayName(c, u, users)) : 'Katıl'}</span>
            </button>
          );
        })}
      </div>
      <div className="xcard-foot">
        {full ? (
          <>
            <span className="xcard-ok">
              <Check size={15} /> Takım hazır!
            </span>
            {inTeam && vc && myVc !== vc.id && (
              <button className="btn primary sm" onClick={() => joinVoice(c.id, vc.id)}>
                <Volume2 size={14} /> {vc.name} odasına geç
              </button>
            )}
          </>
        ) : (
          <>
            <span className="xcard-muted">
              <UsersRound size={14} /> {slots.length - filled} boş yer
            </span>
            {mySlot >= 0 && !(mineCard && card.own !== undefined) && (
              <button className="btn ghost sm" onClick={() => take(mySlot)}>
                Ayrıl
              </button>
            )}
            {mySlot < 0 && (
              <button className="btn primary sm" onClick={() => take(slots.findIndex((x) => !x))}>
                Katıl
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anket
function PollView({ m, card, c, me }: { m: Message; card: PollCard; c: Community; me: ID }) {
  const users = useStore((s) => s.users);
  const votes = pollVotes(m, card);
  const voters = new Set(votes.flat());
  const total = voters.size;
  const ended = !!card.end && card.end < Date.now();
  const top = Math.max(...votes.map((v) => v.length));
  const vote = (i: number) => {
    if (ended) return;
    const has = votes[i].includes(me);
    if (!card.multi && !has) for (let j = 0; j < votes.length; j++) if (j !== i && votes[j].includes(me)) toggleReaction(m, voteKey(j));
    toggleReaction(m, voteKey(i));
  };
  return (
    <div className={cx('xcard poll', ended && 'ended')}>
      <div className="xcard-head">
        <span className="xcard-ico">
          <ChartNoAxesColumn size={18} />
        </span>
        <div className="xcard-title">
          <b>{card.q}</b>
          <small>{card.multi ? 'Birden çok seçebilirsin' : 'Bir seçenek seç'}</small>
        </div>
      </div>
      <div className="poll-opts">
        {card.o.map((o, i) => {
          const n = votes[i].length;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const mine = votes[i].includes(me);
          return (
            <button key={i} className={cx('poll-opt', mine && 'mine', ended && n === top && n > 0 && 'win')} onClick={() => vote(i)} disabled={ended}>
              <span className="poll-bar" style={{ width: pct + '%' }} />
              <span className="poll-check">{mine && <Check size={13} />}</span>
              <span className="poll-label">{o}</span>
              <span className="poll-voters">
                {votes[i].slice(0, 3).map((u) => (
                  <Avatar key={u} user={users[u] || c.users[u]} size={18} />
                ))}
              </span>
              <span className="poll-pct">{total ? pct + '%' : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="xcard-foot">
        <span className="xcard-muted">
          {total} oy{card.end ? ` · ${ended ? 'Anket bitti' : `${fmtTime(card.end)} bitiyor`}` : ''}
        </span>
      </div>
    </div>
  );
}

export function CardView({ m, card, c, me }: { m: Message; card: Card; c: Community; me: ID }) {
  if (card.k === 'lfg') return <LfgView m={m} card={card} c={c} me={me} />;
  return <PollView m={m} card={card} c={c} me={me} />;
}

// ---------------------------------------------------------------------------
// Kurulum pencereleri
function Dialog({ title, sub, onClose, children, foot, className, style }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; foot: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal xdialog', className)} style={style}>
        <div className="modal-head">
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
          <button className="icon-btn modal-x" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body scroll-thin">{children}</div>
        <div className="modal-foot">{foot}</div>
      </div>
    </div>
  );
}

export function LfgCreator({ ch, onClose }: { ch: ID; onClose: () => void }) {
  const playing = useActs((s) => s.detected?.game?.name);
  const start = playing ? lfgGameOf({ g: playing }) : undefined;
  const [game, setGame] = useState<LfgGame | null>(start || null);
  const [custom, setCustom] = useState('');
  const [modeIx, setModeIx] = useState(0);
  const [count, setCount] = useState(4);
  const [n, setN] = useState('');
  const [own, setOwn] = useState<number | null>(null);

  const pick = (g: LfgGame) => {
    setGame(g);
    setModeIx(g.key === 'lol' ? 1 : 0);
    setCount(g.size || 4);
    setOwn(null);
  };

  if (!game)
    return (
      <Dialog title="Takım kur" sub="Hangi oyun için takım arıyorsun?" onClose={onClose} foot={<button className="btn ghost" onClick={onClose}>Vazgeç</button>}>
        <div className="lfg-games">
          {LFG_GAMES.map((g) => (
            <button
              key={g.key}
              className="lfg-game"
              style={g.theme.a ? ({ '--g-a': g.theme.a, '--g-bg': g.theme.bg } as React.CSSProperties) : undefined}
              onClick={() => pick(g)}
            >
              {g.brand ? <BrandLogo k={g.brand} size={44} /> : <span className="lfg-game-other"><Plus size={22} /></span>}
              <span>{g.name}</span>
            </button>
          ))}
        </div>
      </Dialog>
    );

  const mode = game.modes[modeIx];
  const slots = slotsFor(game, mode, count);
  const named = slots.some((x) => x);
  const fixedSize = !!mode?.size || (named && !mode?.size);
  const name = game.key === 'diger' ? custom.trim() : game.name;
  const theme = game.theme.a ? ({ '--g-a': game.theme.a, '--g-b': game.theme.b, '--g-bg': game.theme.bg, '--g-ink': game.theme.ink || '#111' } as React.CSSProperties) : undefined;

  const send = () => {
    const card: LfgCard = { k: 'lfg', g: name || 'Oyun', gk: game.key, s: slots };
    if (mode) card.m = mode.name;
    if (n.trim()) card.n = n.trim().slice(0, 200);
    card.own = named ? (own ?? undefined) : 0;
    if (card.own === undefined) delete card.own;
    sendMessage(ch, encodeCard(card));
    onClose();
  };
  return (
    <Dialog
      title="Takım kur"
      onClose={onClose}
      className={cx('lfg-dialog', theme && 'themed')}
      style={theme}
      foot={
        <>
          <button className="btn ghost" onClick={() => setGame(null)}>
            Oyunu değiştir
          </button>
          <button className="btn primary lfg-send" onClick={send} disabled={game.key === 'diger' && !name}>
            İlanı paylaş
          </button>
        </>
      }
    >
      <div className="lfg-hero">
        {game.brand ? <BrandLogo k={game.brand} size={52} /> : <span className="lfg-game-other"><Swords size={24} /></span>}
        <div>
          {game.key === 'diger' ? (
            <input className="lfg-custom" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={48} placeholder="Oyunun adı" autoFocus />
          ) : (
            <b>{game.name}</b>
          )}
          <small>{named ? `${slots.length} ${game.slotWord.toLocaleLowerCase('tr')} · kendi yerini seç` : `${slots.length} kişilik takım`}</small>
        </div>
      </div>
      {game.modes.length > 0 && (
        <div className="field">
          <span>Kip</span>
          <div className="lfg-chips">
            {game.modes.map((x, i) => (
              <button key={x.name} className={cx('lfg-chip', i === modeIx && 'on')} onClick={() => (setModeIx(i), setOwn(null))}>
                {x.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <span>{named ? `${game.slotWord} · senin yerin hangisi?` : 'Takım'}</span>
        <div className="lfg-preview" style={{ gridTemplateColumns: `repeat(${slots.length <= 5 ? slots.length : Math.ceil(slots.length / 2)}, minmax(0, 1fr))` }}>
          {slots.map((r, i) => {
            const mine = named ? own === i : i === 0;
            return (
              <button key={i} className={cx('lfg-pslot', mine && 'mine')} onClick={() => named && setOwn(own === i ? null : i)} disabled={!named}>
                <span className={cx('lfg-state', mine ? 'on' : 'off')}>{mine ? 'Sen' : 'Boş'}</span>
                <b>{r || `${i + 1}. ${game.slotWord}`}</b>
              </button>
            );
          })}
        </div>
        {!fixedSize && (
          <div className="stepper">
            <button className="icon-btn" onClick={() => setCount(Math.max(2, count - 1))} aria-label="Azalt">
              <Minus size={16} />
            </button>
            <b>{count}</b>
            <button className="icon-btn" onClick={() => setCount(Math.min(10, count + 1))} aria-label="Artır">
              <Plus size={16} />
            </button>
            <small>kişi (sen dahil)</small>
          </div>
        )}
      </div>
      <label className="field">
        <span>Not (isteğe bağlı)</span>
        <input value={n} onChange={(e) => setN(e.target.value)} maxLength={200} placeholder="Seviye, saat, mikrofon şartı…" />
      </label>
    </Dialog>
  );
}

export function PollCreator({ ch, onClose }: { ch: ID; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [o, setO] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [dur, setDur] = useState(0);
  const valid = q.trim() && o.filter((x) => x.trim()).length >= 2;
  const send = () => {
    const card: PollCard = { k: 'poll', q: q.trim().slice(0, 200), o: o.map((x) => x.trim().slice(0, 80)).filter(Boolean) };
    if (multi) card.multi = true;
    if (dur) card.end = Date.now() + dur * 3600_000;
    sendMessage(ch, encodeCard(card));
    onClose();
  };
  return (
    <Dialog
      title="Anket"
      sub="Herkes tek tıkla oy verir, sonuçlar canlı güncellenir."
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" onClick={send} disabled={!valid}>
            Anketi paylaş
          </button>
        </>
      }
    >
      <label className="field">
        <span>Soru</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} placeholder="Bu akşam ne oynayalım?" autoFocus />
      </label>
      <div className="field">
        <span>Seçenekler</span>
        <div className="lfg-role-edit">
          {o.map((x, i) => (
            <div key={i} className="lfg-role-row">
              <input
                value={x}
                maxLength={80}
                placeholder={`${i + 1}. seçenek`}
                onChange={(e) => {
                  const next = o.map((y, j) => (j === i ? e.target.value : y));
                  if (i === o.length - 1 && e.target.value && o.length < 10) next.push('');
                  setO(next);
                }}
              />
              {o.length > 2 && (
                <button className="icon-btn" onClick={() => setO(o.filter((_, j) => j !== i))} aria-label="Seçeneği kaldır">
                  <Minus size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Süre</span>
        <div className="seg">
          {[
            [0, 'Süresiz'],
            [1, '1 saat'],
            [24, '1 gün'],
            [168, '1 hafta'],
          ].map(([h, l]) => (
            <button key={h} className={cx(dur === h && 'on')} onClick={() => setDur(h as number)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Birden çok seçime izin ver
      </label>
    </Dialog>
  );
}

function toLocalInput(ts: number) {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export function ScheduleDialog({ cid, ch, content, onClose, onDone }: { cid: ID; ch: ID; content: string; onClose: () => void; onDone: () => void }) {
  const [custom, setCustom] = useState(() => toLocalInput(Date.now() + 2 * 3600_000));
  const pick = (at: number) => {
    if (at < Date.now() + 30_000) return toast('İleri bir zaman seç.', 'err');
    schedule(cid, ch, content, at);
    toast(`Mesajın ${fmtTime(at)} için zamanlandı.`, 'ok');
    onDone();
    onClose();
  };
  return (
    <Dialog
      title="Zamanlanmış gönder"
      sub="Mesaj seçtiğin anda kendiliğinden gider. Uygulama o an kapalıysa açtığında gönderilir."
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" onClick={() => pick(new Date(custom).getTime())}>
            <CalendarClock size={15} /> Zamanla
          </button>
        </>
      }
    >
      <div className="sched-preview">{content.length > 220 ? content.slice(0, 220) + '…' : content}</div>
      <div className="sched-presets">
        {presets().map((p) => (
          <button key={p.label} className="btn ghost" onClick={() => pick(p.at)}>
            <Clock size={14} /> {p.label} <small>{hm(p.at)}</small>
          </button>
        ))}
      </div>
      <label className="field">
        <span>Ya da tarih ve saat seç</span>
        <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
      </label>
    </Dialog>
  );
}
