// Kart mesajları: takım ilanı, anket ve bunları kuran pencereler.
import React, { useMemo, useState } from 'react';
import { Swords, ChartNoAxesColumn, Check, Volume2, UsersRound, Clock, X, Plus, Minus, CalendarClock } from 'lucide-react';
import { useStore, toggleReaction, sendMessage, toast } from '../lib/store';
import { useVoice, joinVoice } from '../lib/voice';
import { Avatar } from './Common';
import { cx, displayName, hm, fmtTime } from '../lib/util';
import {
  encodeCard, lfgSlots, pollVotes, slotKey, voteKey, LOL_ROLES,
  type LfgCard, type PollCard, type Card,
} from '../lib/cards';
import { presets, schedule } from '../lib/later';
import { useActs } from '../lib/activity';
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

  return (
    <div className={cx('xcard lfg', full && 'full')}>
      <div className="xcard-head">
        <span className="xcard-ico">
          <Swords size={18} />
        </span>
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
      <div className="lfg-slots" style={{ gridTemplateColumns: `repeat(${Math.min(slots.length, 5)}, minmax(0, 1fr))` }}>
        {slots.map((u, i) => {
          const name = roles ? card.s[i] : `${i + 1}. oyuncu`;
          return (
            <button
              key={i}
              className={cx('lfg-slot', u && 'taken', u === me && 'me')}
              onClick={() => take(i)}
              disabled={!!u && u !== me}
              title={u === me ? 'Yerinden çık' : u ? undefined : 'Bu yere geç'}
            >
              {u ? <Avatar user={users[u] || c.users[u]} size={34} /> : <span className="lfg-empty">+</span>}
              <span className="lfg-role">{name}</span>
              <span className="lfg-who">{u ? (u === me ? 'Sen' : displayName(c, u, users)) : 'Boş yer'}</span>
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
              <UsersRound size={14} /> {slots.length - filled} kişi aranıyor
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
function Dialog({ title, sub, onClose, children, foot }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal xdialog">
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

const GAME_PRESETS = ['League of Legends', 'Valorant', 'Counter-Strike 2', 'Teamfight Tactics', 'Minecraft'];

export function LfgCreator({ ch, onClose }: { ch: ID; onClose: () => void }) {
  const playing = useActs((s) => s.detected?.game?.name);
  const [g, setG] = useState<string>(playing || 'League of Legends');
  const [m, setM] = useState('');
  const [n, setN] = useState('');
  const [kind, setKind] = useState<'roles' | 'count'>('roles');
  const [count, setCount] = useState(5);
  const [own, setOwn] = useState<number | null>(null);
  const [roles, setRoles] = useState<string[]>(LOL_ROLES);
  const isLol = /league of legends/i.test(g);
  const effKind = kind === 'roles' && !isLol && roles === LOL_ROLES ? 'count' : kind;
  const send = () => {
    const s = effKind === 'roles' ? roles.map((r) => r.trim() || '?') : Array.from({ length: count }, () => '');
    const card: LfgCard = { k: 'lfg', g: g.trim() || 'Oyun', s };
    if (m.trim()) card.m = m.trim().slice(0, 60);
    if (n.trim()) card.n = n.trim().slice(0, 200);
    card.own = effKind === 'roles' ? (own ?? undefined) : 0;
    if (card.own === undefined) delete card.own;
    sendMessage(ch, encodeCard(card));
    onClose();
  };
  return (
    <Dialog
      title="Takım kur"
      sub="Kanala bir ilan düşer; arkadaşların tek tıkla boş yerlere geçer."
      onClose={onClose}
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" onClick={send}>
            İlanı paylaş
          </button>
        </>
      }
    >
      <label className="field">
        <span>Oyun</span>
        <input value={g} onChange={(e) => setG(e.target.value)} maxLength={48} list="xn-games" autoFocus />
        <datalist id="xn-games">
          {GAME_PRESETS.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>Kip</span>
        <input value={m} onChange={(e) => setM(e.target.value)} maxLength={60} placeholder={isLol ? 'Dereceli Esnek, ARAM, Normal…' : 'Rekabetçi, eğlencesine…'} />
      </label>
      <div className="field">
        <span>Kimler lazım</span>
        <div className="seg">
          <button className={cx(effKind === 'roles' && 'on')} onClick={() => (setKind('roles'), !isLol && roles === LOL_ROLES && setRoles(['Rol 1', 'Rol 2', 'Rol 3']))}>
            Rollere göre
          </button>
          <button className={cx(effKind === 'count' && 'on')} onClick={() => setKind('count')}>
            Kişi sayısı
          </button>
        </div>
      </div>
      {effKind === 'roles' ? (
        <div className="field">
          <span>Roller · kendi rolüne tıkla</span>
          <div className="lfg-role-edit">
            {roles.map((r, i) => (
              <div key={i} className={cx('lfg-role-row', own === i && 'own')}>
                <input value={r} maxLength={16} onChange={(e) => setRoles(roles.map((x, j) => (j === i ? e.target.value : x)))} />
                <button className={cx('btn sm', own === i ? 'primary' : 'ghost')} onClick={() => setOwn(own === i ? null : i)}>
                  {own === i ? 'Ben' : 'Benim rolüm'}
                </button>
                {roles.length > 2 && (
                  <button className="icon-btn" onClick={() => (setRoles(roles.filter((_, j) => j !== i)), own === i && setOwn(null))} aria-label="Rolü kaldır">
                    <Minus size={15} />
                  </button>
                )}
              </div>
            ))}
            {roles.length < 10 && (
              <button className="btn ghost sm" onClick={() => setRoles([...roles, 'Rol ' + (roles.length + 1)])}>
                <Plus size={14} /> Rol ekle
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="field">
          <span>Kaç kişilik takım (sen dahil)</span>
          <div className="stepper">
            <button className="icon-btn" onClick={() => setCount(Math.max(2, count - 1))} aria-label="Azalt">
              <Minus size={16} />
            </button>
            <b>{count}</b>
            <button className="icon-btn" onClick={() => setCount(Math.min(10, count + 1))} aria-label="Artır">
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}
      <label className="field">
        <span>Not (isteğe bağlı)</span>
        <input value={n} onChange={(e) => setN(e.target.value)} maxLength={200} placeholder="Altın IV civarı, mikrofon şart…" />
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
