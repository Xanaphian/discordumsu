// Topluluk araçları (v1.28): öneri panosu, görev panosu, etkinlik planlayıcı ve ortak duvar.
// Her biri ayrı bir kanal türüdür; veriler kanalın mesajlarıdır (bkz. lib/tools.ts).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Lightbulb, SquareKanban, CalendarDays, Palette, ChevronUp, MessageSquare, Plus, Trash2, Check, X, Clock, MapPin, Bell, BellRing, BellOff,
  Settings, Users, Pencil, StickyNote, Smile, Eraser, Undo2, MousePointer2, Flag, ChevronLeft, ChevronRight, Volume2, Hash, Send,
} from 'lucide-react';
import { type CMessage, useStore, openModal, openMenu, toggleMuted, deleteMessage, sendMessage, confirmDialog, selectChannel, toast } from '../lib/store';
import {
  type Entry, type IdeaItem, type IdeaStatus, type TaskItem, type TaskCol, type EventItem, type WallItem,
  entriesOf, addItem, updateItem, vote, votersOf, useToolItems, fmtWhen, fmtDate, untilText, toLocalInput, setReminder, syncReminders,
  MONTH_NAMES, startReminders, parseItem,
} from '../lib/tools';
import { Avatar, Tooltip } from './Common';
import { cx, displayName, fmtTime } from '../lib/util';
import { renderMarkdown } from '../lib/markdown';
import { useMdCtx } from './Chat';
import { canIn, isVoiceLike, toolEditPerm, Perm, type Channel, type Community, type ID, type ToolType } from '../../shared/protocol';
import { joinVoice } from '../lib/voice';
import '../styles/araclar.css';

startReminders();

export const TOOL_INFO: Record<ToolType, { label: string; sub: string; Icon: typeof Lightbulb }> = {
  ideas: { label: 'Öneri panosu', sub: 'Üyeler fikir yazar, en çok oy alan üste çıkar', Icon: Lightbulb },
  tasks: { label: 'Görev panosu', sub: 'Yapılacak, yapılıyor, bitti sütunlarıyla iş takibi', Icon: SquareKanban },
  events: { label: 'Etkinlikler', sub: 'Tarih koy, kimin geleceğini gör, başlamadan hatırlat', Icon: CalendarDays },
  wall: { label: 'Ortak duvar', sub: 'Birlikte çiz, not ve çıkartma yapıştır', Icon: Palette },
};

export function ToolIcon({ type, size = 18 }: { type: ToolType; size?: number }) {
  const I = TOOL_INFO[type].Icon;
  return <I size={size} />;
}

function useMe() {
  return useStore((s) => s.me.id);
}

function ToolHeader({ c, ch, children }: { c: Community; ch: Channel; children?: React.ReactNode }) {
  const me = useMe();
  const chMuted = useStore((s) => s.settings.mutedIds.includes(ch.id));
  const editCh = canIn(c, me, ch, Perm.MANAGE_CHANNELS);
  const type = ch.type as ToolType;
  return (
    <div className="chat-header tl-head">
      <span className="ch-head-icon">
        <ToolIcon type={type} size={22} />
      </span>
      <h2>{ch.name}</h2>
      <span className="head-sep" />
      <span className="ch-topic">{ch.topic || TOOL_INFO[type].sub}</span>
      <div className="head-actions">
        {children}
        <Tooltip text={chMuted ? 'Kanalın sesini aç' : 'Bildirim ayarları'} side="bottom">
          <button
            className={cx('icon-btn', chMuted && 'active')}
            onClick={(e) =>
              openMenu(e, [
                { label: chMuted ? 'Kanalın sesini aç' : 'Kanalı sessize al', onClick: () => toggleMuted(ch.id) },
                { label: 'Bildirim ayarları…', onClick: () => openModal({ type: 'notify', cid: c.id, chId: ch.id }) },
              ])
            }
            aria-label="Bildirimler"
          >
            {chMuted ? <BellOff size={19} /> : <Bell size={19} />}
          </button>
        </Tooltip>
        {editCh && (
          <Tooltip text="Kanal ayarları" side="bottom">
            <button className="icon-btn" onClick={() => openModal({ type: 'editChannel', cid: c.id, chId: ch.id })} aria-label="Kanal ayarları">
              <Settings size={19} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function Who({ c, uid, size = 20 }: { c: Community; uid: ID; size?: number }) {
  const users = useStore((s) => s.users);
  const u = users[uid] || c.users[uid];
  return (
    <span className="tl-who">
      <Avatar user={u} size={size} />
      <span>{displayName(c, uid, users)}</span>
    </span>
  );
}

function Faces({ c, ids, max = 5 }: { c: Community; ids: ID[]; max?: number }) {
  const users = useStore((s) => s.users);
  if (!ids.length) return null;
  return (
    <span className="tl-faces">
      {ids.slice(0, max).map((id) => (
        <Avatar key={id} user={users[id] || c.users[id]} size={22} />
      ))}
      {ids.length > max && <span className="tl-more">+{ids.length - max}</span>}
    </span>
  );
}

function Empty({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="tl-empty">
      <div className="tl-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{sub}</p>
      {children}
    </div>
  );
}

const canWrite = (c: Community, me: ID, ch: Channel) => canIn(c, me, ch, Perm.SEND_MESSAGES);
const canEditAny = (c: Community, me: ID, ch: Channel) => canIn(c, me, ch, toolEditPerm(ch.type as ToolType));
const canDelete = (c: Community, me: ID, ch: Channel, author: ID) => author === me || canIn(c, me, ch, Perm.MANAGE_MESSAGES);

export function ToolView({ c, ch }: { c: Community; ch: Channel }) {
  const st = useToolItems(ch.id);
  const type = ch.type as ToolType;
  const body =
    type === 'ideas' ? <IdeasBoard c={c} ch={ch} items={st?.items} /> :
    type === 'tasks' ? <TaskBoard c={c} ch={ch} items={st?.items} /> :
    type === 'events' ? <EventsBoard c={c} ch={ch} items={st?.items} /> :
    <WallBoard c={c} ch={ch} items={st?.items} />;
  return <section className={cx('chat tl-view', `tl-${type}`)}>{st?.loaded || st?.items.length ? body : <div className="tl-loading"><ToolHeader c={c} ch={ch} /><div className="tl-spin" /></div>}</section>;
}

type ItemsProps = { c: Community; ch: Channel; items: CMessage[] | undefined };

// ===================================================================================
// Öneri panosu
const IDEA_STATUS: Record<IdeaStatus, { label: string; cls: string }> = {
  open: { label: 'Açık', cls: 'st-open' },
  plan: { label: 'Planlandı', cls: 'st-plan' },
  doing: { label: 'Yapılıyor', cls: 'st-doing' },
  done: { label: 'Tamamlandı', cls: 'st-done' },
  no: { label: 'Reddedildi', cls: 'st-no' },
};

function IdeasBoard({ c, ch, items }: ItemsProps) {
  const me = useMe();
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [filter, setFilter] = useState<IdeaStatus | 'all'>('all');
  const [open, setOpen] = useState<ID | null>(null);
  const [writing, setWriting] = useState(false);
  const ideas = useMemo(() => entriesOf<IdeaItem>(items, 'idea'), [items]);
  const comments = useMemo(() => {
    const map: Record<ID, number> = {};
    for (const m of items || []) if (m.replyTo && !parseItem(m.content)) map[m.replyTo] = (map[m.replyTo] || 0) + 1;
    return map;
  }, [items]);
  const list = useMemo(() => {
    const l = ideas.filter((x) => filter === 'all' || (x.it.st || 'open') === filter);
    if (sort === 'new') return [...l].reverse();
    return [...l].sort((a, b) => votersOf(b.m, '~up').length - votersOf(a.m, '~up').length || (a.m.id < b.m.id ? 1 : -1));
  }, [ideas, sort, filter]);
  const sel = open ? ideas.find((x) => x.m.id === open) : undefined;
  const counts = useMemo(() => {
    const r: Record<string, number> = { all: ideas.length };
    for (const x of ideas) r[x.it.st || 'open'] = (r[x.it.st || 'open'] || 0) + 1;
    return r;
  }, [ideas]);
  const write = canWrite(c, me, ch);
  return (
    <>
      <ToolHeader c={c} ch={ch} />
      <div className="tl-split">
        <div className="tl-main scroll-thin">
          <div className="tl-bar">
            <div className="tl-seg">
              <button className={cx(sort === 'top' && 'on')} onClick={() => setSort('top')}>En çok oy</button>
              <button className={cx(sort === 'new' && 'on')} onClick={() => setSort('new')}>En yeni</button>
            </div>
            <div className="tl-chips">
              {(['all', 'open', 'plan', 'doing', 'done', 'no'] as const).map((k) => (
                <button key={k} className={cx('tl-chip', filter === k && 'on')} onClick={() => setFilter(k)}>
                  {k === 'all' ? 'Tümü' : IDEA_STATUS[k].label}
                  {!!counts[k] && <i>{counts[k]}</i>}
                </button>
              ))}
            </div>
            <span className="tl-grow" />
            {write && (
              <button className="btn primary sm" onClick={() => setWriting(true)}>
                <Plus size={15} /> Öneri yaz
              </button>
            )}
          </div>
          {writing && <IdeaComposer ch={ch} onDone={() => setWriting(false)} />}
          {!ideas.length && !writing ? (
            <Empty icon={<Lightbulb size={30} />} title="Henüz öneri yok" sub="Topluluk için bir fikrin mi var? Yaz, diğerleri oylasın; en çok istenen en üstte durur.">
              {write && <button className="btn primary" onClick={() => setWriting(true)}><Plus size={15} /> İlk öneriyi yaz</button>}
            </Empty>
          ) : (
            <div className="idea-list">
              {list.map((x) => (
                <IdeaRow key={x.m.id} c={c} e={x} me={me} comments={comments[x.m.id] || 0} on={open === x.m.id} onOpen={() => setOpen(open === x.m.id ? null : x.m.id)} />
              ))}
              {!list.length && <div className="tl-none">Bu durumda öneri yok.</div>}
            </div>
          )}
        </div>
        {sel && <IdeaDetail c={c} ch={ch} e={sel} items={items} onClose={() => setOpen(null)} />}
      </div>
    </>
  );
}

function VoteBtn({ e, me }: { e: Entry; me: ID }) {
  const ups = votersOf(e.m, '~up');
  const mine = ups.includes(me);
  return (
    <button
      className={cx('idea-vote', mine && 'on')}
      onClick={(ev) => {
        ev.stopPropagation();
        vote(e.m, '~up');
      }}
      aria-label={mine ? 'Oyunu geri al' : 'Oy ver'}
    >
      <ChevronUp size={18} />
      <b>{ups.length}</b>
    </button>
  );
}

function IdeaRow({ c, e, me, comments, on, onOpen }: { c: Community; e: Entry<IdeaItem>; me: ID; comments: number; on: boolean; onOpen: () => void }) {
  const st = IDEA_STATUS[e.it.st || 'open'];
  return (
    <div className={cx('idea-row', on && 'on', e.m.pending && 'pending')} onClick={onOpen}>
      <VoteBtn e={e} me={me} />
      <div className="idea-main">
        <div className="idea-title">
          <span>{e.it.t}</span>
          <span className={cx('tl-pill', st.cls)}>{st.label}</span>
        </div>
        {e.it.b && <p className="idea-body">{e.it.b}</p>}
        <div className="idea-meta">
          <Who c={c} uid={e.m.authorId} size={18} />
          <span>· {fmtTime(e.m.ts)}</span>
          <span className="tl-grow" />
          <span className="idea-cm">
            <MessageSquare size={14} /> {comments}
          </span>
        </div>
      </div>
    </div>
  );
}

function IdeaComposer({ ch, onDone }: { ch: Channel; onDone: () => void }) {
  const [t, setT] = useState('');
  const [b, setB] = useState('');
  const submit = () => {
    if (!t.trim()) return;
    addItem(ch.id, { k: 'idea', t: t.trim().slice(0, 120), ...(b.trim() ? { b: b.trim().slice(0, 1500) } : {}) });
    onDone();
  };
  return (
    <div className="tl-form">
      <input autoFocus placeholder="Önerin ne? (ör. Haftalık turnuva yapalım)" value={t} maxLength={120} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <textarea placeholder="Biraz açıkla (isteğe bağlı)" value={b} maxLength={1500} rows={3} onChange={(e) => setB(e.target.value)} />
      <div className="tl-form-foot">
        <button className="btn ghost sm" onClick={onDone}>Vazgeç</button>
        <button className="btn primary sm" disabled={!t.trim()} onClick={submit}>Paylaş</button>
      </div>
    </div>
  );
}

function IdeaDetail({ c, ch, e, items, onClose }: { c: Community; ch: Channel; e: Entry<IdeaItem>; items: ItemsProps['items']; onClose: () => void }) {
  const me = useMe();
  const users = useStore((s) => s.users);
  const [text, setText] = useState('');
  const mod = canEditAny(c, me, ch);
  const md = useMdCtx(c);
  const thread = (items || []).filter((m) => m.replyTo === e.m.id && !parseItem(m.content));
  const st = e.it.st || 'open';
  const send = () => {
    if (!text.trim()) return;
    useStore.setState((s) => ({ replyTo: { ...s.replyTo, [ch.id]: e.m.id } }));
    sendMessage(ch.id, text.trim());
    setText('');
  };
  return (
    <aside className="tl-side scroll-thin">
      <div className="tl-side-head">
        <VoteBtn e={e} me={me} />
        <h3>{e.it.t}</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Kapat">
          <X size={18} />
        </button>
      </div>
      <div className="tl-side-meta">
        <Who c={c} uid={e.m.authorId} /> <span>· {fmtTime(e.m.ts)}</span>
      </div>
      {e.it.b && <div className="tl-side-body">{renderMarkdown(e.it.b, md)}</div>}
      <div className="tl-field">
        <span>Durum</span>
        <div className="tl-chips">
          {(Object.keys(IDEA_STATUS) as IdeaStatus[]).map((k) => (
            <button key={k} disabled={!mod && k !== st} className={cx('tl-chip', IDEA_STATUS[k].cls, st === k && 'on')} onClick={() => mod && updateItem(e.m, { ...e.it, st: k })}>
              {IDEA_STATUS[k].label}
            </button>
          ))}
        </div>
        {!mod && <small>Durumu yöneticiler değiştirir.</small>}
      </div>
      <div className="tl-field">
        <span>Oy verenler · {votersOf(e.m, '~up').length}</span>
        <Faces c={c} ids={votersOf(e.m, '~up')} max={10} />
      </div>
      <div className="tl-field">
        <span>Yorumlar · {thread.length}</span>
        <div className="tl-comments">
          {thread.map((m) => (
            <div key={m.id} className={cx('tl-comment', m.pending && 'pending')}>
              <Avatar user={users[m.authorId] || c.users[m.authorId]} size={26} />
              <div>
                <b>{displayName(c, m.authorId, users)}</b> <small>{fmtTime(m.ts)}</small>
                <div>{renderMarkdown(m.content, md)}</div>
              </div>
            </div>
          ))}
          {!thread.length && <div className="tl-none sm">İlk yorumu sen yaz.</div>}
        </div>
        {canWrite(c, me, ch) && (
          <div className="tl-reply">
            <input placeholder="Yorum yaz" value={text} maxLength={1000} onChange={(ev) => setText(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && send()} />
            <button className="icon-btn" disabled={!text.trim()} onClick={send} aria-label="Gönder">
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
      {canDelete(c, me, ch, e.m.authorId) && (
        <button
          className="btn ghost sm danger tl-del"
          onClick={() => confirmDialog('Öneri silinsin mi?', 'Oylar ve yorumlar da görünmez olur.', () => (deleteMessage(ch.id, e.m.id), onClose()), 'Sil')}
        >
          <Trash2 size={14} /> Öneriyi sil
        </button>
      )}
    </aside>
  );
}

// ===================================================================================
// Görev panosu
const COLS: { col: TaskCol; label: string }[] = [
  { col: 0, label: 'Yapılacak' },
  { col: 1, label: 'Yapılıyor' },
  { col: 2, label: 'Bitti' },
];
const PRIO = ['Normal', 'Yüksek', 'Acil'];

function TaskBoard({ c, ch, items }: ItemsProps) {
  const me = useMe();
  const [mine, setMine] = useState(false);
  const [drag, setDrag] = useState<ID | null>(null);
  const [over, setOver] = useState<TaskCol | null>(null);
  const [adding, setAdding] = useState<TaskCol | null>(null);
  const [edit, setEdit] = useState<ID | null>(null);
  const tasks = useMemo(() => entriesOf<TaskItem>(items, 'task'), [items]);
  const editAny = canEditAny(c, me, ch);
  const cols = useMemo(
    () =>
      COLS.map(({ col }) =>
        tasks
          .filter((x) => (x.it.col || 0) === col && (!mine || x.it.who === me))
          .sort((a, b) => (a.it.o ?? idNum(a.m.id)) - (b.it.o ?? idNum(b.m.id)) || (b.it.pr || 0) - (a.it.pr || 0)),
      ),
    [tasks, mine, me],
  );
  const move = (id: ID, col: TaskCol, before?: ID) => {
    const e = tasks.find((x) => x.m.id === id);
    if (!e) return;
    const list = cols[col].filter((x) => x.m.id !== id);
    const i = before ? list.findIndex((x) => x.m.id === before) : list.length;
    const ord = (k: number) => (list[k] ? list[k].it.o ?? idNum(list[k].m.id) : undefined);
    const prev = ord(i - 1), next = ord(i);
    const o = prev === undefined && next === undefined ? Date.now() : prev === undefined ? next! - 1000 : next === undefined ? prev + 1000 : (prev + next) / 2;
    if (e.it.col === col && e.it.o === o) return;
    updateItem(e.m, { ...e.it, col, o });
  };
  const done = cols[2].length, total = cols.reduce((n, l) => n + l.length, 0);
  const sel = edit ? tasks.find((x) => x.m.id === edit) : undefined;
  return (
    <>
      <ToolHeader c={c} ch={ch}>
        <button className={cx('tl-toggle', mine && 'on')} onClick={() => setMine((x) => !x)}>
          <Flag size={14} /> Bana verilenler
        </button>
      </ToolHeader>
      <div className="tk-progress">
        <span>{total ? `${done} / ${total} görev bitti` : 'Pano boş'}</span>
        <div className="tk-track">
          <i style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
        </div>
      </div>
      <div className="tk-board scroll-thin">
        {COLS.map(({ col, label }) => (
          <div
            key={col}
            className={cx('tk-col', over === col && drag && 'over')}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              setOver(col);
            }}
            onDragLeave={(e) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag) move(drag, col);
              setDrag(null);
              setOver(null);
            }}
          >
            <div className="tk-col-head">
              <i className={`tk-dot c${col}`} />
              <b>{label}</b>
              <span>{cols[col].length}</span>
              <span className="tl-grow" />
              {canWrite(c, me, ch) && (
                <button className="icon-btn sm" onClick={() => setAdding(col)} aria-label="Görev ekle">
                  <Plus size={16} />
                </button>
              )}
            </div>
            <div className="tk-cards">
              {adding === col && <TaskAdd ch={ch} col={col} onDone={() => setAdding(null)} />}
              {cols[col].map((x) => {
                const movable = editAny || x.m.authorId === me;
                return (
                  <TaskCard
                    key={x.m.id}
                    c={c}
                    e={x}
                    dragging={drag === x.m.id}
                    draggable={movable}
                    onDragStart={() => setDrag(x.m.id)}
                    onDragEnd={() => (setDrag(null), setOver(null))}
                    onDropBefore={() => {
                      if (drag && drag !== x.m.id) move(drag, col, x.m.id);
                      setDrag(null);
                      setOver(null);
                    }}
                    onOpen={() => setEdit(x.m.id)}
                  />
                );
              })}
              {!cols[col].length && adding !== col && <div className="tk-none">{col === 0 ? 'Yeni görev eklemek için +' : 'Kartı buraya sürükle'}</div>}
            </div>
          </div>
        ))}
      </div>
      {sel && <TaskEditor c={c} ch={ch} e={sel} onClose={() => setEdit(null)} />}
    </>
  );
}

const idNum = (id: string) => parseInt(id.slice(0, 9), 36) || 0;

function TaskCard({ c, e, dragging, draggable, onDragStart, onDragEnd, onDropBefore, onOpen }: {
  c: Community; e: Entry<TaskItem>; dragging: boolean; draggable: boolean; onDragStart: () => void; onDragEnd: () => void; onDropBefore: () => void; onOpen: () => void;
}) {
  const late = e.it.due && e.it.col !== 2 && e.it.due < Date.now();
  return (
    <div
      className={cx('tk-card', dragging && 'dragging', e.m.pending && 'pending', e.it.col === 2 && 'done', !!e.it.pr && `pr${e.it.pr}`)}
      draggable={draggable}
      onDragStart={(ev) => {
        ev.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(ev) => ev.preventDefault()}
      onDrop={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onDropBefore();
      }}
      onClick={onOpen}
    >
      <div className="tk-title">
        {e.it.col === 2 && <Check size={14} className="tk-check" />}
        <span>{e.it.t}</span>
      </div>
      {e.it.b && <p className="tk-desc">{e.it.b}</p>}
      <div className="tk-meta">
        {!!e.it.pr && <span className={cx('tl-pill', e.it.pr === 2 ? 'st-no' : 'st-plan')}>{PRIO[e.it.pr]}</span>}
        {e.it.due && (
          <span className={cx('tk-due', !!late && 'late')}>
            <Clock size={12} /> {fmtDate(e.it.due)}
          </span>
        )}
        <span className="tl-grow" />
        {e.it.who ? <TaskWho c={c} uid={e.it.who} /> : <span className="tk-free">Sahipsiz</span>}
      </div>
    </div>
  );
}

function TaskWho({ c, uid }: { c: Community; uid: ID }) {
  const users = useStore((s) => s.users);
  return (
    <Tooltip text={displayName(c, uid, users)} side="top">
      <span>
        <Avatar user={users[uid] || c.users[uid]} size={22} />
      </span>
    </Tooltip>
  );
}

function TaskAdd({ ch, col, onDone }: { ch: Channel; col: TaskCol; onDone: () => void }) {
  const [t, setT] = useState('');
  const submit = (keep: boolean) => {
    if (!t.trim()) return onDone();
    addItem(ch.id, { k: 'task', t: t.trim().slice(0, 140), col, o: Date.now() });
    setT('');
    if (!keep) onDone();
  };
  return (
    <div className="tk-add">
      <textarea
        autoFocus
        rows={2}
        placeholder="Görevin adı"
        value={t}
        maxLength={140}
        onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), submit(true));
          if (e.key === 'Escape') onDone();
        }}
      />
      <div className="tl-form-foot">
        <button className="btn ghost sm" onClick={onDone}>Vazgeç</button>
        <button className="btn primary sm" onClick={() => submit(false)}>Ekle</button>
      </div>
    </div>
  );
}

function TaskEditor({ c, ch, e, onClose }: { c: Community; ch: Channel; e: Entry<TaskItem>; onClose: () => void }) {
  const me = useMe();
  const users = useStore((s) => s.users);
  const editable = canEditAny(c, me, ch) || e.m.authorId === me;
  const [t, setT] = useState(e.it.t);
  const [b, setB] = useState(e.it.b || '');
  const save = (patch: Partial<TaskItem>) => editable && updateItem(e.m, { ...e.it, ...patch });
  const members = useMemo(() => c.members.filter((m) => !users[m.userId]?.bot && !c.users[m.userId]?.bot), [c.members, users, c.users]);
  return (
    <div className="tl-overlay" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="tk-editor">
        <div className="tl-side-head">
          <span className={`tk-dot c${e.it.col}`} />
          <input className="tk-ed-title" value={t} disabled={!editable} maxLength={140} onChange={(ev) => setT(ev.target.value)} onBlur={() => t.trim() && t !== e.it.t && save({ t: t.trim() })} />
          <button className="icon-btn" onClick={onClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>
        <div className="tl-side-meta">
          <Who c={c} uid={e.m.authorId} size={18} /> <span>ekledi · {fmtTime(e.m.ts)}</span>
        </div>
        <div className="tl-field">
          <span>Sütun</span>
          <div className="tl-seg">
            {COLS.map((x) => (
              <button key={x.col} disabled={!editable} className={cx(e.it.col === x.col && 'on')} onClick={() => save({ col: x.col, o: Date.now() })}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tk-ed-grid">
          <label className="tl-field">
            <span>Üstlenen</span>
            <select value={e.it.who || ''} disabled={!editable} onChange={(ev) => save({ who: ev.target.value || undefined })}>
              <option value="">Kimse</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {displayName(c, m.userId, users)}
                </option>
              ))}
            </select>
          </label>
          <label className="tl-field">
            <span>Son tarih</span>
            <input
              type="date"
              disabled={!editable}
              value={e.it.due ? toLocalInput(e.it.due).slice(0, 10) : ''}
              onChange={(ev) => save({ due: ev.target.value ? new Date(ev.target.value + 'T23:59').getTime() : undefined })}
            />
          </label>
          <label className="tl-field">
            <span>Öncelik</span>
            <select value={e.it.pr || 0} disabled={!editable} onChange={(ev) => save({ pr: Number(ev.target.value) as 0 | 1 | 2 })}>
              {PRIO.map((p, i) => (
                <option key={p} value={i}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="tl-field">
          <span>Açıklama</span>
          <textarea rows={4} value={b} disabled={!editable} maxLength={1500} placeholder="Ayrıntı, bağlantı, not…" onChange={(ev) => setB(ev.target.value)} onBlur={() => b !== (e.it.b || '') && save({ b: b.trim() || undefined })} />
        </label>
        <div className="tl-form-foot">
          {e.it.who !== me && editable && (
            <button className="btn ghost sm" onClick={() => save({ who: me, col: e.it.col === 0 ? 1 : e.it.col })}>
              Ben üstleniyorum
            </button>
          )}
          <span className="tl-grow" />
          {canDelete(c, me, ch, e.m.authorId) && (
            <button className="btn ghost sm danger" onClick={() => (deleteMessage(ch.id, e.m.id), onClose())}>
              <Trash2 size={14} /> Sil
            </button>
          )}
          <button className="btn primary sm" onClick={onClose}>Tamam</button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================================
// Etkinlik planlayıcı
const EV_COLORS = ['#c8aa6e', '#0ac8b9', '#6cb6ff', '#f2555a', '#c084fc', '#3ecf8e'];

function EventsBoard({ c, ch, items }: ItemsProps) {
  const me = useMe();
  const [tab, setTab] = useState<'next' | 'past'>('next');
  const [creating, setCreating] = useState<EventItem | null>(null);
  const [editing, setEditing] = useState<Entry<EventItem> | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const events = useMemo(() => entriesOf<EventItem>(items, 'event').sort((a, b) => a.it.at - b.it.at), [items]);
  useEffect(() => syncReminders(events, me), [events, me]);
  const now = Date.now();
  const isPast = (x: Entry<EventItem>) => x.it.at + (x.it.dur || 60) * 60000 < now;
  const shown = events.filter((x) => (tab === 'past' ? isPast(x) : !isPast(x)) && (!day || dayKey(x.it.at) === day));
  if (tab === 'past') shown.reverse();
  const write = canWrite(c, me, ch);
  const blank = (): EventItem => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(21, 0, 0, 0);
    return { k: 'event', t: '', at: d.getTime(), dur: 60, c: EV_COLORS[0] };
  };
  return (
    <>
      <ToolHeader c={c} ch={ch} />
      <div className="tl-split">
        <div className="tl-main scroll-thin">
          <div className="tl-bar">
            <div className="tl-seg">
              <button className={cx(tab === 'next' && 'on')} onClick={() => setTab('next')}>Yaklaşan</button>
              <button className={cx(tab === 'past' && 'on')} onClick={() => setTab('past')}>Geçmiş</button>
            </div>
            {day && (
              <button className="tl-chip on" onClick={() => setDay(null)}>
                {fmtDate(new Date(day).getTime())} <X size={12} />
              </button>
            )}
            <span className="tl-grow" />
            {write && (
              <button className="btn primary sm" onClick={() => setCreating(blank())}>
                <Plus size={15} /> Etkinlik oluştur
              </button>
            )}
          </div>
          {!shown.length ? (
            <Empty
              icon={<CalendarDays size={30} />}
              title={tab === 'next' ? 'Yaklaşan etkinlik yok' : 'Geçmiş etkinlik yok'}
              sub="Turnuva, film gecesi, birlikte oyun… Bir tarih koy, kimlerin geleceğini gör; katılanlara başlamadan haber verilir."
            >
              {write && tab === 'next' && <button className="btn primary" onClick={() => setCreating(blank())}><Plus size={15} /> Etkinlik oluştur</button>}
            </Empty>
          ) : (
            <div className="ev-list">
              {shown.map((x, i) => {
                const head = i === 0 || dayKey(shown[i - 1].it.at) !== dayKey(x.it.at);
                return (
                  <React.Fragment key={x.m.id}>
                    {head && <div className="ev-day">{dayLabel(x.it.at)}</div>}
                    <EventCard c={c} ch={ch} e={x} me={me} onEdit={() => setEditing(x)} />
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
        <aside className="tl-side ev-side scroll-thin">
          <MiniCalendar month={month} setMonth={setMonth} events={events} day={day} setDay={setDay} />
          <div className="ev-mine">
            <h4>Katılacakların</h4>
            {events.filter((x) => !isPast(x) && votersOf(x.m, '~go').includes(me)).slice(0, 5).map((x) => (
              <div key={x.m.id} className="ev-mine-row">
                <i style={{ background: x.it.c || EV_COLORS[0] }} />
                <span>{x.it.t}</span>
                <small>{fmtWhen(x.it.at)}</small>
              </div>
            ))}
            {!events.some((x) => !isPast(x) && votersOf(x.m, '~go').includes(me)) && <div className="tl-none sm">Henüz katılacağını söylediğin bir etkinlik yok.</div>}
          </div>
        </aside>
      </div>
      {(creating || editing) && (
        <EventEditor
          c={c}
          init={editing ? editing.it : creating!}
          isNew={!editing}
          onClose={() => (setCreating(null), setEditing(null))}
          onSave={(it) => {
            if (editing) updateItem(editing.m, it);
            else addItem(ch.id, it);
            setCreating(null);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function dayLabel(ts: number) {
  const w = fmtWhen(ts);
  return w.slice(0, w.lastIndexOf(' '));
}

function EventCard({ c, ch, e, me, onEdit }: { c: Community; ch: Channel; e: Entry<EventItem>; me: ID; onEdit: () => void }) {
  const go = votersOf(e.m, '~go');
  const maybe = votersOf(e.m, '~maybe');
  const mineGo = go.includes(me), mineMaybe = maybe.includes(me);
  const now = Date.now();
  const end = e.it.at + (e.it.dur || 60) * 60000;
  const live = now >= e.it.at && now < end;
  const past = now >= end;
  const full = !!e.it.cap && go.length >= e.it.cap && !mineGo;
  const place = e.it.where ? c.channels.find((x) => x.id === e.it.where) : undefined;
  const d = new Date(e.it.at);
  const editable = e.m.authorId === me || canEditAny(c, me, ch);
  const rsvp = (key: '~go' | '~maybe') => {
    const on = !(key === '~go' ? mineGo : mineMaybe);
    if (on) {
      const other = key === '~go' ? '~maybe' : '~go';
      if (votersOf(e.m, other).includes(me)) vote(e.m, other);
    }
    vote(e.m, key);
    setReminder(e.m, e.it, on || (key === '~go' ? mineMaybe : mineGo));
    if (on) toast('Başlamadan 15 dakika önce hatırlatacağım.', 'ok');
  };
  return (
    <div className={cx('ev-card', live && 'live', past && 'past', e.m.pending && 'pending')} style={{ ['--ev' as any]: e.it.c || EV_COLORS[0] }}>
      <div className="ev-date">
        <b>{d.getDate()}</b>
        <span>{MONTH_NAMES[d.getMonth()].slice(0, 3)}</span>
      </div>
      <div className="ev-main">
        <div className="ev-title">
          <span>{e.it.t}</span>
          {live && <span className="tl-pill st-live">Şimdi</span>}
        </div>
        <div className="ev-info">
          <span>
            <Clock size={13} /> {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}
            {' – '}
            {new Date(end).toTimeString().slice(0, 5)}
            {!past && !live && <em> · {untilText(e.it.at, now)}</em>}
          </span>
          {(place || e.it.where) && (
            <span
              className={cx(place && 'ev-place')}
              onClick={() => {
                if (!place) return;
                if (isVoiceLike(place.type)) joinVoice(c.id, place.id);
                selectChannel(c.id, place.id);
              }}
            >
              {place ? isVoiceLike(place.type) ? <Volume2 size={13} /> : <Hash size={13} /> : <MapPin size={13} />} {place ? place.name : e.it.where}
            </span>
          )}
        </div>
        {e.it.b && <p className="ev-desc">{e.it.b}</p>}
        <div className="ev-foot">
          <Faces c={c} ids={go} />
          <span className="ev-count">
            {go.length} katılıyor{e.it.cap ? ` / ${e.it.cap}` : ''}
            {maybe.length ? ` · ${maybe.length} belki` : ''}
          </span>
          <span className="tl-grow" />
          {!past && (
            <>
              <button className={cx('btn sm', mineGo ? 'primary' : 'ghost')} disabled={full} onClick={() => rsvp('~go')}>
                {mineGo ? <Check size={14} /> : null} {full ? 'Dolu' : 'Katılıyorum'}
              </button>
              <button className={cx('btn sm ghost', mineMaybe && 'on')} onClick={() => rsvp('~maybe')}>
                Belki
              </button>
              {(mineGo || mineMaybe) && (
                <Tooltip text="15 dakika kala ve başlarken bildirim gelir" side="top">
                  <span className="ev-bell">
                    <BellRing size={15} />
                  </span>
                </Tooltip>
              )}
            </>
          )}
          {editable && (
            <button
              className="icon-btn sm"
              onClick={(ev) =>
                openMenu(ev, [
                  { label: 'Düzenle', onClick: onEdit },
                  ...(canDelete(c, me, ch, e.m.authorId) ? [{ label: 'Etkinliği sil', danger: true, onClick: () => confirmDialog('Etkinlik silinsin mi?', e.it.t, () => deleteMessage(ch.id, e.m.id), 'Sil') }] : []),
                ])
              }
              aria-label="Seçenekler"
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniCalendar({ month, setMonth, events, day, setDay }: { month: number; setMonth: (m: number) => void; events: Entry<EventItem>[]; day: string | null; setDay: (d: string | null) => void }) {
  const m = new Date(month);
  const first = (m.getDay() + 6) % 7; // pazartesi başlar
  const daysIn = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const has = new Map<string, string>();
  for (const x of events) if (!has.has(dayKey(x.it.at))) has.set(dayKey(x.it.at), x.it.c || EV_COLORS[0]);
  const today = dayKey(Date.now());
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  return (
    <div className="ev-cal">
      <div className="ev-cal-head">
        <button className="icon-btn sm" onClick={() => setMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1).getTime())} aria-label="Önceki ay">
          <ChevronLeft size={16} />
        </button>
        <b>
          {MONTH_NAMES[m.getMonth()]} {m.getFullYear()}
        </b>
        <button className="icon-btn sm" onClick={() => setMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime())} aria-label="Sonraki ay">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="ev-cal-grid">
        {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((d) => (
          <span key={d} className="ev-cal-dow">{d}</span>
        ))}
        {cells.map((n, i) => {
          if (!n) return <span key={i} />;
          const k = dayKey(new Date(m.getFullYear(), m.getMonth(), n).getTime());
          const dot = has.get(k);
          return (
            <button key={i} className={cx('ev-cal-day', k === today && 'today', k === day && 'on', dot && 'has')} onClick={() => setDay(day === k ? null : dot ? k : null)}>
              {n}
              {dot && <i style={{ background: dot }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventEditor({ c, init, isNew, onClose, onSave }: { c: Community; init: EventItem; isNew: boolean; onClose: () => void; onSave: (it: EventItem) => void }) {
  const [it, setIt] = useState<EventItem>(init);
  const [placeText, setPlaceText] = useState(init.where && !c.channels.some((x) => x.id === init.where) ? init.where : '');
  const rooms = c.channels.filter((x) => isVoiceLike(x.type) || x.type === 'text');
  const set = (p: Partial<EventItem>) => setIt((x) => ({ ...x, ...p }));
  const placeSel = it.where && c.channels.some((x) => x.id === it.where) ? it.where : it.where ? '~' : '';
  const ok = it.t.trim() && it.at > 0;
  return (
    <div className="tl-overlay" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="tk-editor ev-editor">
        <div className="tl-side-head">
          <CalendarDays size={20} />
          <h3>{isNew ? 'Etkinlik oluştur' : 'Etkinliği düzenle'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>
        <label className="tl-field">
          <span>Ad</span>
          <input autoFocus value={it.t} maxLength={90} placeholder="ör. Cuma akşamı turnuvası" onChange={(e) => set({ t: e.target.value })} />
        </label>
        <div className="tk-ed-grid">
          <label className="tl-field">
            <span>Başlangıç</span>
            <input type="datetime-local" value={toLocalInput(it.at)} onChange={(e) => e.target.value && set({ at: new Date(e.target.value).getTime() })} />
          </label>
          <label className="tl-field">
            <span>Süre</span>
            <select value={it.dur || 60} onChange={(e) => set({ dur: Number(e.target.value) })}>
              {[30, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} dakika` : `${m / 60} saat`}
                </option>
              ))}
            </select>
          </label>
          <label className="tl-field">
            <span>Kişi sınırı</span>
            <select value={it.cap || 0} onChange={(e) => set({ cap: Number(e.target.value) || undefined })}>
              {[0, 2, 4, 5, 8, 10, 16, 20, 32, 50].map((n) => (
                <option key={n} value={n}>
                  {n ? `${n} kişi` : 'Sınırsız'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="tl-field">
          <span>Nerede</span>
          <select
            value={placeSel}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '~') set({ where: placeText || ' ' });
              else set({ where: v || undefined });
            }}
          >
            <option value="">Belirtilmedi</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {isVoiceLike(r.type) ? '🔊 ' : '# '}
                {r.name}
              </option>
            ))}
            <option value="~">Başka bir yer…</option>
          </select>
          {placeSel === '~' && (
            <input
              value={placeText}
              maxLength={80}
              placeholder="ör. Kadıköy, oyun içi lobi…"
              onChange={(e) => {
                setPlaceText(e.target.value);
                set({ where: e.target.value || ' ' });
              }}
            />
          )}
        </label>
        <label className="tl-field">
          <span>Açıklama</span>
          <textarea rows={3} value={it.b || ''} maxLength={1000} placeholder="Ne yapacağız, ne gerekiyor?" onChange={(e) => set({ b: e.target.value || undefined })} />
        </label>
        <div className="tl-field">
          <span>Renk</span>
          <div className="ev-colors">
            {EV_COLORS.map((col) => (
              <button key={col} className={cx(it.c === col && 'on')} style={{ background: col }} onClick={() => set({ c: col })} aria-label="Renk" />
            ))}
          </div>
        </div>
        <div className="tl-form-foot">
          <button className="btn ghost sm" onClick={onClose}>Vazgeç</button>
          <button
            className="btn primary sm"
            disabled={!ok}
            onClick={() => onSave({ ...it, t: it.t.trim(), b: it.b?.trim() || undefined, where: it.where?.trim() || undefined })}
          >
            {isNew ? 'Oluştur' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================================
// Ortak duvar: çizim, not kâğıdı, çıkartma
const W = 1600, H = 1000;
const PEN = ['#f0e6d2', '#c8aa6e', '#0ac8b9', '#6cb6ff', '#f2555a', '#3ecf8e', '#c084fc', '#111827'];
const NOTE = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa'];
const STICKERS = ['😂', '🔥', '❤️', '👍', '🎉', '😎', '🏆', '⭐', '💯', '👀', '🎮', '🍕', '🥳', '😭', '🤝', '✨', '💀', '🤔', '🙌', '🚀', '🌙', '☕', '🎧', '👑'];
type WTool = 'move' | 'pen' | 'note' | 'sticker' | 'erase';

function WallBoard({ c, ch, items }: ItemsProps) {
  const me = useMe();
  const users = useStore((s) => s.users);
  const [tool, setTool] = useState<WTool>('pen');
  const [pen, setPen] = useState(PEN[1]);
  const [size, setSize] = useState(4);
  const [note, setNote] = useState(NOTE[0]);
  const [sticker, setSticker] = useState(STICKERS[0]);
  const [live, setLive] = useState<number[] | null>(null);
  const [drag, setDrag] = useState<{ id: ID; dx: number; dy: number; x: number; y: number } | null>(null);
  const [noteEdit, setNoteEdit] = useState<{ x: number; y: number; id?: ID; text: string } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const all = useMemo(() => entriesOf<WallItem>(items, 'wall'), [items]);
  const write = canWrite(c, me, ch);
  const moveAny = canEditAny(c, me, ch);
  const mod = canIn(c, me, ch, Perm.MANAGE_MESSAGES);
  const authors = useMemo(() => new Set(all.map((x) => x.m.authorId)), [all]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.max(0.3, Math.min((el.clientWidth - 32) / W, 1.2)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pt = (e: React.PointerEvent | PointerEvent) => {
    const r = board.current!.getBoundingClientRect();
    return { x: Math.round((e.clientX - r.left) / scale), y: Math.round((e.clientY - r.top) / scale) };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!write || e.button !== 0) return;
    const p = pt(e);
    if (tool === 'pen') {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setLive([p.x, p.y]);
    } else if (tool === 'sticker') {
      addItem(ch.id, { k: 'wall', w: 's', x: p.x, y: p.y, e: sticker, sz: 64, r: Math.round(Math.random() * 24 - 12) });
    } else if (tool === 'note') {
      e.preventDefault(); // yoksa tarayıcı odağı yeni not kutusundan alır
      if (noteEdit) return saveNote();
      setNoteEdit({ x: p.x, y: p.y, text: '' });
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (live) {
      const p = pt(e);
      const lx = live[live.length - 2], ly = live[live.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) >= 3) setLive([...live, p.x, p.y]);
    } else if (drag) {
      const p = pt(e);
      setDrag({ ...drag, x: p.x - drag.dx, y: p.y - drag.dy });
    }
  };
  const onUp = () => {
    if (live) {
      if (live.length >= 4) sendStroke(live);
      else if (live.length === 2) sendStroke([live[0], live[1], live[0] + 1, live[1]]);
      setLive(null);
    }
    if (drag) {
      const e = all.find((x) => x.m.id === drag.id);
      if (e && (e.it.x !== drag.x || e.it.y !== drag.y)) updateItem(e.m, { ...e.it, x: clamp(drag.x, 0, W), y: clamp(drag.y, 0, H) });
      setDrag(null);
    }
  };
  const sendStroke = (pts: number[]) => {
    // mesaj sınırı (4000 karakter) için uzun çizgiler parçalanır; noktalar ilk noktaya göre göreli
    const step = 360;
    for (let i = 0; i < pts.length - 2; i += step) {
      const part = pts.slice(i, i + step + 2);
      const x = part[0], y = part[1];
      const p: number[] = [];
      for (let j = 2; j < part.length; j += 2) p.push(part[j] - x, part[j + 1] - y);
      addItem(ch.id, { k: 'wall', w: 'd', x, y, p, c: pen, sz: size });
    }
  };
  const itemDown = (e: React.PointerEvent, x: Entry<WallItem>) => {
    if (tool === 'erase') {
      e.stopPropagation();
      if (canDelete(c, me, ch, x.m.authorId)) deleteMessage(ch.id, x.m.id);
      else toast('Yalnız kendi eklediklerini silebilirsin.', 'err');
      return;
    }
    if (tool !== 'move' || x.it.w === 'd') return;
    e.stopPropagation();
    if (!(moveAny || x.m.authorId === me)) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pt(e);
    setDrag({ id: x.m.id, dx: p.x - x.it.x, dy: p.y - x.it.y, x: x.it.x, y: x.it.y });
  };
  const undo = () => {
    const mine = all.filter((x) => x.m.authorId === me && !x.m.pending);
    const last = mine[mine.length - 1];
    if (last) deleteMessage(ch.id, last.m.id);
  };
  const saveNote = () => {
    if (!noteEdit) return;
    const text = noteEdit.text.trim().slice(0, 240);
    if (noteEdit.id) {
      const e = all.find((x) => x.m.id === noteEdit.id);
      if (e && text) updateItem(e.m, { ...e.it, tx: text });
    } else if (text) addItem(ch.id, { k: 'wall', w: 'n', x: noteEdit.x, y: noteEdit.y, tx: text, c: note, r: Math.round(Math.random() * 6 - 3) });
    setNoteEdit(null);
  };
  const strokes = all.filter((x) => x.it.w === 'd');
  const things = all.filter((x) => x.it.w !== 'd');
  return (
    <>
      <ToolHeader c={c} ch={ch}>
        <span className="wl-who">
          <Users size={14} /> {authors.size} kişi katkı verdi
        </span>
      </ToolHeader>
      {write && (
        <div className="wl-tools">
          <div className="wl-group">
            {(
              [
                ['move', <MousePointer2 size={17} />, 'Taşı'],
                ['pen', <Pencil size={17} />, 'Kalem'],
                ['note', <StickyNote size={17} />, 'Not'],
                ['sticker', <Smile size={17} />, 'Çıkartma'],
                ['erase', <Eraser size={17} />, 'Sil'],
              ] as [WTool, React.ReactNode, string][]
            ).map(([k, icon, label]) => (
              <button key={k} className={cx('wl-tool', tool === k && 'on')} onClick={() => setTool(k)}>
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
          <span className="wl-sep" />
          {tool === 'pen' && (
            <div className="wl-group">
              {PEN.map((p) => (
                <button key={p} className={cx('wl-swatch', pen === p && 'on')} style={{ background: p }} onClick={() => setPen(p)} aria-label="Renk" />
              ))}
              <span className="wl-sep" />
              {[2, 4, 8, 14].map((s) => (
                <button key={s} className={cx('wl-size', size === s && 'on')} onClick={() => setSize(s)} aria-label={`${s} px`}>
                  <i style={{ width: s + 2, height: s + 2 }} />
                </button>
              ))}
            </div>
          )}
          {tool === 'note' && (
            <div className="wl-group">
              {NOTE.map((p) => (
                <button key={p} className={cx('wl-swatch sq', note === p && 'on')} style={{ background: p }} onClick={() => setNote(p)} aria-label="Not rengi" />
              ))}
              <small className="wl-hint">Duvarda bir yere tıkla, notunu yaz.</small>
            </div>
          )}
          {tool === 'sticker' && (
            <div className="wl-group wl-stickers">
              {STICKERS.map((s) => (
                <button key={s} className={cx('wl-st', sticker === s && 'on')} onClick={() => setSticker(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {tool === 'move' && <small className="wl-hint">Not ve çıkartmaları sürükleyerek yerini değiştir.</small>}
          {tool === 'erase' && <small className="wl-hint">Silmek istediğin çizgiye, nota ya da çıkartmaya tıkla{mod ? '' : ' (yalnız kendi eklediklerin)'}.</small>}
          <span className="tl-grow" />
          <Tooltip text="Son eklediğini geri al" side="bottom">
            <button className="icon-btn" onClick={undo} aria-label="Geri al">
              <Undo2 size={18} />
            </button>
          </Tooltip>
        </div>
      )}
      <div className="wl-wrap scroll-thin" ref={wrap}>
        <div className="wl-sizer" style={{ width: W * scale, height: H * scale }}>
          <div
            ref={board}
            className={cx('wl-board', `t-${tool}`)}
            style={{ width: W, height: H, transform: `scale(${scale})` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <svg className="wl-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              {strokes.map((x) => (
                <path
                  key={x.m.id}
                  d={pathOf(x.it)}
                  stroke={x.it.c || PEN[0]}
                  strokeWidth={x.it.sz || 4}
                  className={cx(x.m.pending && 'pending')}
                  onPointerDown={(e) => itemDown(e, x)}
                />
              ))}
              {live && <path d={pathOf({ x: live[0], y: live[1], p: rel(live) } as WallItem)} stroke={pen} strokeWidth={size} />}
            </svg>
            {things.map((x) => {
              const pos = drag?.id === x.m.id ? drag : x.it;
              const style = { left: pos.x, top: pos.y, ['--r' as any]: `${x.it.r || 0}deg` } as React.CSSProperties;
              if (x.it.w === 's')
                return (
                  <div key={x.m.id} className={cx('wl-sticker', drag?.id === x.m.id && 'drag')} style={{ ...style, fontSize: x.it.sz || 64 }} onPointerDown={(e) => itemDown(e, x)} title={displayName(c, x.m.authorId, users)}>
                    {x.it.e}
                  </div>
                );
              return (
                <div
                  key={x.m.id}
                  className={cx('wl-note', drag?.id === x.m.id && 'drag')}
                  style={{ ...style, background: x.it.c || NOTE[0] }}
                  onPointerDown={(e) => itemDown(e, x)}
                  onDoubleClick={() => (x.m.authorId === me || moveAny) && setNoteEdit({ x: x.it.x, y: x.it.y, id: x.m.id, text: x.it.tx || '' })}
                >
                  <p>{x.it.tx}</p>
                  <small>{displayName(c, x.m.authorId, users)}</small>
                </div>
              );
            })}
            {noteEdit && (
              <div className="wl-note editing" style={{ left: noteEdit.x, top: noteEdit.y, background: noteEdit.id ? all.find((x) => x.m.id === noteEdit.id)?.it.c : note }} onPointerDown={(e) => e.stopPropagation()}>
                <textarea
                  autoFocus
                  value={noteEdit.text}
                  maxLength={240}
                  placeholder="Notunu yaz…"
                  onChange={(e) => setNoteEdit({ ...noteEdit, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), saveNote());
                    if (e.key === 'Escape') setNoteEdit(null);
                  }}
                  onBlur={saveNote}
                />
              </div>
            )}
            {!all.length && !live && !noteEdit && (
              <div className="wl-empty">
                <Palette size={34} />
                <b>Duvar bomboş</b>
                <span>Kalemle çiz, not bırak ya da çıkartma yapıştır. Herkes aynı duvarı görür.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function rel(pts: number[]) {
  const out: number[] = [];
  for (let i = 2; i < pts.length; i += 2) out.push(pts[i] - pts[0], pts[i + 1] - pts[1]);
  return out;
}
function pathOf(it: Pick<WallItem, 'x' | 'y' | 'p'>) {
  const p = it.p || [];
  let d = `M${it.x} ${it.y}`;
  if (p.length < 4) {
    for (let i = 0; i < p.length; i += 2) d += `L${it.x + p[i]} ${it.y + p[i + 1]}`;
    return d;
  }
  // yumuşak çizgi: ara noktalardan geçen ikinci derece eğriler
  let px = it.x, py = it.y;
  for (let i = 0; i < p.length - 2; i += 2) {
    const x = it.x + p[i], y = it.y + p[i + 1];
    const nx = it.x + p[i + 2], ny = it.y + p[i + 3];
    d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
    px = nx;
    py = ny;
  }
  return d + `L${px} ${py}`;
}
