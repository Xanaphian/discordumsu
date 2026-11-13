import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import {
  Hash, Megaphone, Users, Pin, Search, Reply, Pencil, Trash2, SmilePlus, MoreHorizontal, Plus, X, FileText, Download, CornerUpLeft,
  ArrowDown, LoaderCircle, CircleAlert, Clock, ArrowRight, Globe,
} from 'lucide-react';
import {
  useStore, CMessage, loadHistory, sendMessage, editMessage, deleteMessage, pinMessage, toggleReaction, sendTyping, openMenu,
  openModal, confirmDialog, retryMessage, discardMessage, markRead, uploadFile, hostHttp, toast, updateSettings, request, jumpToMessage,
  selectChannel, jumpToPresent, plainText,
} from '../lib/store';
import { Avatar, Tooltip } from './Common';
import { EmojiPicker } from './Overlays';
import { renderMarkdown, isEmojiOnly, MdCtx } from '../lib/markdown';
import { cx, fmtTime, hm, sameDay, fmtDay, fmtFull, fmtSize, displayName, roleColor, copyText, imageSize, modKey } from '../lib/util';
import { QUICK_REACTIONS, replaceShortcodes, searchEmoji } from '../lib/emoji';
import { can, Perm, isVoiceLike, type Channel, type Community, type Message, type Attachment } from '../../shared/protocol';

const BASE = 1_000_000;
const GROUP_MS = 7 * 60 * 1000;
const drafts = new Map<string, string>();

// ---------------------------------------------------------------------------
function useMdCtx(c: Community): MdCtx {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me.id);
  return useMemo(
    () => ({
      meId: me,
      userName: (id) => (c.users[id] || users[id] ? displayName(c, id, users) : null),
      channelName: (id) => c.channels.find((x) => x.id === id)?.name ?? null,
      onUser: (id, e) => useStore.setState({ popout: { uid: id, cid: c.id, x: e.clientX, y: e.clientY } }),
      onChannel: (id) => c.channels.some((x) => x.id === id) && selectChannel(c.id, id),
    }),
    [c, users, me],
  );
}

// ---------------------------------------------------------------------------
const AttachmentView = memo(function AttachmentView({ a, base }: { a: Attachment; base: string }) {
  const src = a.url.startsWith('blob:') ? a.url : base + a.url;
  if (a.mime.startsWith('image/')) {
    const maxW = 420, maxH = 320;
    let w = a.w || maxW, h = a.h || 240;
    const scale = Math.min(1, maxW / w, maxH / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    return (
      <div className="att-img" style={{ width: w, height: h }} onClick={() => openModal({ type: 'image', src, name: a.name })}>
        <img src={src} alt={a.name} loading="lazy" decoding="async" draggable={false} />
      </div>
    );
  }
  if (a.mime.startsWith('video/')) return <video className="att-video" src={src} controls preload="metadata" style={{ maxWidth: 420, maxHeight: 320 }} />;
  if (a.mime.startsWith('audio/')) return <audio className="att-audio" src={src} controls preload="none" />;
  return (
    <div className="att-file">
      <FileText size={28} />
      <div className="att-meta">
        <a href={src} download={a.name} className="att-name" title={a.name}>
          {a.name}
        </a>
        <span>{fmtSize(a.size)}</span>
      </div>
      <a href={src} download={a.name} className="icon-btn" aria-label="İndir">
        <Download size={18} />
      </a>
    </div>
  );
});

const Reactions = memo(function Reactions({ m, me }: { m: Message; me: string }) {
  const users = useStore((s) => s.users);
  const entries = Object.entries(m.reactions || {});
  if (!entries.length) return null;
  return (
    <div className="reactions">
      {entries.map(([e, uids]) => (
        <Tooltip key={e} side="top" text={`${uids.slice(0, 5).map((u) => users[u]?.name || '?').join(', ')}${uids.length > 5 ? ` ve ${uids.length - 5} kişi` : ''} ${e} ile tepki verdi`}>
          <button className={cx('reaction', uids.includes(me) && 'mine')} onClick={() => toggleReaction(m, e)}>
            <span className="r-emoji">{e}</span>
            <span className="r-count">{uids.length}</span>
          </button>
        </Tooltip>
      ))}
      <button
        className="reaction add"
        onClick={(ev) => {
          const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          useStore.setState({ menu: null });
          openPicker(r.left, r.top, (e) => toggleReaction(m, e));
        }}
        aria-label="Tepki ekle"
      >
        <SmilePlus size={15} />
      </button>
    </div>
  );
});

// tek bir global emoji seçici
let pickerSetter: ((p: { x: number; y: number; onPick: (e: string) => void } | null) => void) | null = null;
export function openPicker(x: number, y: number, onPick: (e: string) => void) {
  pickerSetter?.({ x, y, onPick });
}
export function PickerHost() {
  const [p, setP] = useState<{ x: number; y: number; onPick: (e: string) => void } | null>(null);
  pickerSetter = setP;
  if (!p) return null;
  return <EmojiPicker x={p.x} y={p.y} onPick={(e) => (p.onPick(e), setP(null))} onClose={() => setP(null)} />;
}

function EditBox({ m, onDone }: { m: Message; onDone: () => void }) {
  const [v, setV] = useState(m.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 400) + 'px';
  }, [v]);
  const save = () => {
    const t = replaceShortcodes(v.trim());
    if (!t && !m.attachments?.length) {
      onDone();
      confirmDialog('Mesaj silinsin mi?', 'Boş mesaj kaydedilemez. Silmek ister misin?', () => deleteMessage(m.channelId, m.id), 'Sil');
      return;
    }
    if (t !== m.content) editMessage(m.channelId, m.id, t);
    onDone();
  };
  return (
    <div className="edit-box">
      <textarea
        ref={ref}
        value={v}
        rows={1}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="edit-hint">
        çıkmak için <kbd>Esc</kbd> · kaydetmek için <kbd>Enter</kbd>
      </div>
    </div>
  );
}

interface ItemProps {
  m: CMessage;
  prev?: CMessage;
  c: Community;
  md: MdCtx;
  me: string;
  canManage: boolean;
  isEditing: boolean;
  isNew: boolean;
  highlight: boolean;
  compact: boolean;
}

const MessageItem = memo(function MessageItem({ m, prev, c, md, me, canManage, isEditing, isNew, highlight, compact }: ItemProps) {
  const users = useStore((s) => s.users);
  const parent = useStore((s) => (m.replyTo ? s.chans[m.channelId]?.items.find((x) => x.id === m.replyTo) : undefined));
  const newDay = !prev || !sameDay(prev.ts, m.ts);
  const grouped =
    !!prev && !newDay && !m.replyTo && !m.kind && !prev.kind && prev.authorId === m.authorId && m.ts - prev.ts < GROUP_MS && !prev.failed;
  const author = users[m.authorId] || c.users[m.authorId];
  const name = displayName(c, m.authorId, users);
  const color = roleColor(c, m.authorId);
  const mine = m.authorId === me;
  const mentioned = m.content.includes(`<@${me}>`) || /@(everyone|here)\b/.test(m.content) || (parent?.authorId === me && !mine);
  const body = useMemo(() => (m.content ? renderMarkdown(m.content, md) : null), [m.content, md]);
  const jumbo = useMemo(() => isEmojiOnly(m.content), [m.content]);
  const base = hostHttp(c.id);

  const popUser = (e: React.MouseEvent) => useStore.setState({ popout: { uid: m.authorId, cid: c.id, x: e.clientX, y: e.clientY } });
  const startEdit = () => useStore.setState({ editing: m.id });
  const reply = () => {
    useStore.setState((s) => ({ replyTo: { ...s.replyTo, [m.channelId]: m.id } }));
    document.getElementById('composer-input')?.focus();
  };
  const del = (e?: React.MouseEvent) => {
    if (e?.shiftKey) return deleteMessage(m.channelId, m.id);
    confirmDialog('Mesajı sil', 'Bu mesajı silmek istediğine emin misin? (İpucu: Shift basılıyken silersen onay sorulmaz.)', () => deleteMessage(m.channelId, m.id), 'Sil');
  };
  const more = (e: React.MouseEvent) =>
    openMenu(e, [
      { emojis: QUICK_REACTIONS, onEmoji: (x) => toggleReaction(m, x) },
      { label: 'Yanıtla', onClick: reply },
      ...(mine ? [{ label: 'Mesajı düzenle', onClick: startEdit }] : []),
      ...(canManage ? [{ label: m.pinned ? 'Sabitlemeyi kaldır' : 'Mesajı sabitle', onClick: () => pinMessage(m.channelId, m.id, !m.pinned) }] : []),
      { label: 'Metni kopyala', onClick: () => copyText(plainText(m.content, c)) },
      { label: 'Mesaj bağlantısını kopyala', onClick: () => copyText(`${m.channelId}/${m.id}`) },
      ...(mine || canManage ? [{ sep: true }, { label: 'Mesajı sil', danger: true, onClick: () => del() }] : []),
    ]);

  if (m.kind === 'join') {
    return (
      <>
        {newDay && <DayDivider ts={m.ts} />}
        <div className="msg system" onContextMenu={more}>
          <span className="sys-icon">
            <ArrowRight size={16} />
          </span>
          <span>
            <b className="clickable" onClick={popUser} style={{ color: color || undefined }}>
              {name}
            </b>{' '}
            kovana katıldı. Hoş geldin! 🐝
          </span>
          <span className="msg-time-inline">{fmtTime(m.ts)}</span>
        </div>
      </>
    );
  }

  return (
    <>
      {newDay && <DayDivider ts={m.ts} />}
      {isNew && (
        <div className="new-divider">
          <span>YENİ</span>
        </div>
      )}
      <div
        className={cx(
          'msg',
          grouped ? 'grouped' : 'head',
          compact && 'compact',
          mentioned && 'mentioned',
          highlight && 'flash',
          m.pending && 'pending',
          m.failed && 'failed',
          isEditing && 'editing',
        )}
        onContextMenu={more}
        onDoubleClick={(e) => {
          if (mine && !isEditing && !(e.target as HTMLElement).closest('a,button,.att-img,.md-pre')) startEdit();
        }}
      >
        {m.replyTo && (
          <div className="reply-ref" onClick={() => parent && jumpToMessage(c.id, m.channelId, parent.id)}>
            <CornerUpLeft size={14} className="reply-curve" />
            {parent ? (
              <>
                <Avatar user={users[parent.authorId]} size={16} />
                <span className="reply-name" style={{ color: roleColor(c, parent.authorId) || undefined }}>
                  {displayName(c, parent.authorId, users)}
                </span>
                <span className="reply-text">{plainText(parent.content, c) || (parent.attachments?.length ? 'Ek dosya' : '')}</span>
              </>
            ) : (
              <span className="reply-text muted">Orijinal mesaj yüklenmedi ya da silindi</span>
            )}
          </div>
        )}
        <div className="msg-row">
          {grouped ? (
            <span className="msg-gutter-time" title={fmtFull(m.ts)}>
              {hm(m.ts)}
            </span>
          ) : (
            <div className="msg-avatar">
              <Avatar user={author} size={40} onClick={popUser} />
            </div>
          )}
          <div className="msg-main">
            {!grouped && (
              <div className="msg-head">
                <span className="msg-author" style={{ color: color || undefined }} onClick={popUser}>
                  {name}
                </span>
                {m.authorId === 'kovan-asistan' && <span className="tag-bot">ASİSTAN</span>}
                {(users[m.authorId] || c.users[m.authorId])?.bot && <span className="tag-bot">BOT</span>}
                {c.ownerId === m.authorId && m.authorId !== 'kovan-asistan' && (
                  <Tooltip text="Topluluk sahibi" side="top">
                    <span className="owner-crown">♛</span>
                  </Tooltip>
                )}
                <span className="msg-time" title={fmtFull(m.ts)}>
                  {fmtTime(m.ts)}
                </span>
                {m.pinned && (
                  <span className="msg-pinned" title="Sabitlenmiş">
                    <Pin size={12} />
                  </span>
                )}
              </div>
            )}
            {isEditing ? (
              <EditBox m={m} onDone={() => useStore.setState({ editing: null })} />
            ) : (
              body && (
                <div className={cx('msg-body', jumbo && 'jumbo')}>
                  {body}
                  {m.editedTs && (
                    <span className="edited" title={fmtFull(m.editedTs)}>
                      {' '}
                      (düzenlendi)
                    </span>
                  )}
                </div>
              )
            )}
            {!!m.attachments?.length && (
              <div className="atts">
                {m.attachments.map((a) => (
                  <AttachmentView key={a.id || a.url} a={a} base={base} />
                ))}
              </div>
            )}
            <Reactions m={m} me={me} />
            {m.failed && (
              <div className="msg-failed">
                <CircleAlert size={14} /> Gönderilemedi.{' '}
                <button className="link" onClick={() => retryMessage(m)}>
                  Tekrar dene
                </button>{' '}
                ·{' '}
                <button className="link" onClick={() => discardMessage(m)}>
                  Sil
                </button>
              </div>
            )}
          </div>
        </div>
        {!m.pending && !m.failed && !isEditing && (
          <div className="msg-tools">
            {QUICK_REACTIONS.slice(0, 3).map((e) => (
              <button key={e} className="mt-btn emoji" onClick={() => toggleReaction(m, e)}>
                {e}
              </button>
            ))}
            <span className="mt-sep" />
            <Tooltip text="Tepki ekle" side="top">
              <button
                className="mt-btn"
                onClick={(ev) => {
                  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                  openPicker(r.left - 300, r.top, (e) => toggleReaction(m, e));
                }}
              >
                <SmilePlus size={17} />
              </button>
            </Tooltip>
            <Tooltip text="Yanıtla" side="top">
              <button className="mt-btn" onClick={reply}>
                <Reply size={17} />
              </button>
            </Tooltip>
            {mine && (
              <Tooltip text="Düzenle" side="top">
                <button className="mt-btn" onClick={startEdit}>
                  <Pencil size={16} />
                </button>
              </Tooltip>
            )}
            {(mine || canManage) && (
              <Tooltip text="Sil" side="top">
                <button className="mt-btn danger" onClick={del}>
                  <Trash2 size={16} />
                </button>
              </Tooltip>
            )}
            <Tooltip text="Diğer" side="top">
              <button className="mt-btn" onClick={more}>
                <MoreHorizontal size={17} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </>
  );
});

function DayDivider({ ts }: { ts: number }) {
  return (
    <div className="day-divider">
      <span>{fmtDay(ts)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ChannelStart({ ch, loading, more }: { ch: Channel; loading: boolean; more: boolean }) {
  if (more || loading)
    return (
      <div className="list-loading">
        <LoaderCircle size={20} className="spin" />
      </div>
    );
  return (
    <div className="ch-start">
      <div className="ch-start-icon">{ch.type === 'announce' ? <Megaphone size={36} /> : ch.type === 'site' ? <Globe size={38} /> : <Hash size={40} />}</div>
      <h1>{ch.type === 'site' ? `${ch.name} odasına hoş geldin!` : `#${ch.name} kanalına hoş geldin!`}</h1>
      <p>
        {ch.type === 'site' ? 'Odanın sohbeti burada; baktığın sayfayı paylaş düğmesiyle buraya atabilirsin.' : `Bu, #${ch.name} kanalının başlangıcı.`} {ch.topic}
      </p>
    </div>
  );
}

export function MessageList({ c, ch }: { c: Community; ch: Channel }) {
  const st = useStore((s) => s.chans[ch.id]);
  const me = useStore((s) => s.me.id);
  const editing = useStore((s) => s.editing);
  const compact = useStore((s) => s.settings.compact);
  const focused = useStore((s) => s.focused);
  const jumpTo = useStore((s) => s.jumpTo);
  const lastId = useStore((s) => s.lastIds[ch.id]);
  const md = useMdCtx(c);
  const canManage = can(c, me, Perm.MANAGE_MESSAGES);
  const ref = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  // kanal açıldığındaki okunma noktası ("YENİ" çizgisi için)
  const readAtOpen = useMemo(() => useStore.getState().read[ch.id] || '', [ch.id]); // eslint-disable-line
  const items = st?.items || [];
  const firstNewId = useMemo(() => {
    if (!readAtOpen) return null;
    const m = items.find((x) => x.id > readAtOpen && x.authorId !== me && !x.pending && !x.id.startsWith('~'));
    return m?.id || null;
  }, [items, readAtOpen, me]);

  useEffect(() => {
    if (atBottom && focused && !st?.detached) markRead(ch.id);
  }, [atBottom, focused, items.length, ch.id, st?.detached]);

  useEffect(() => {
    if (!jumpTo || jumpTo.ch !== ch.id) return;
    const idx = items.findIndex((x) => x.id === jumpTo.id);
    if (idx < 0) return;
    requestAnimationFrame(() => ref.current?.scrollToIndex({ index: idx, align: 'center', behavior: 'auto' }));
    setFlash(jumpTo.id);
    const t = setTimeout(() => setFlash(null), 1800);
    useStore.setState({ jumpTo: null });
    return () => clearTimeout(t);
  }, [jumpTo, items, ch.id]);

  const startReached = useCallback(() => {
    const s = useStore.getState().chans[ch.id];
    if (s?.more && !s.loading && s.items.length) loadHistory(ch.id, s.items.find((x) => !x.id.startsWith('~'))?.id);
  }, [ch.id]);

  if (!st?.loaded)
    return (
      <div className="msg-list skeleton">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="sk-row">
            <div className="sk-av" />
            <div className="sk-lines">
              <div className="sk-line" style={{ width: 80 + ((i * 37) % 90) }} />
              <div className="sk-line" style={{ width: 160 + ((i * 71) % 300) }} />
            </div>
          </div>
        ))}
      </div>
    );

  const detachedOrBehind = st.detached || (lastId && items.length && items[items.length - 1].id < lastId && !items[items.length - 1].id.startsWith('~'));

  return (
    <div className="msg-list">
      <Virtuoso
        key={ch.id + ':' + (st.epoch || 0)}
        ref={ref}
        className="scroll-thin msg-scroller"
        data={items}
        firstItemIndex={BASE - st.prepended}
        initialTopMostItemIndex={{ index: Math.max(0, items.length - 1), align: 'end' }}
        alignToBottom
        followOutput={(bottom) => (bottom ? 'auto' : false)}
        atBottomStateChange={setAtBottom}
        atBottomThreshold={80}
        startReached={startReached}
        increaseViewportBy={{ top: 600, bottom: 400 }}
        computeItemKey={(_i, m) => m.nonce || m.id}
        components={{
          Header: () => <ChannelStart ch={ch} loading={st.loading} more={st.more} />,
          Footer: () => <div style={{ height: 18 }} />,
        }}
        itemContent={(index, m) => {
          const i = index - (BASE - st.prepended);
          return (
            <MessageItem
              m={m}
              prev={items[i - 1]}
              c={c}
              md={md}
              me={me}
              canManage={canManage}
              isEditing={editing === m.id}
              isNew={m.id === firstNewId}
              highlight={flash === m.id}
              compact={compact}
            />
          );
        }}
      />
      {(!atBottom || detachedOrBehind) && (
        <button
          className="jump-present"
          onClick={() => {
            if (detachedOrBehind) jumpToPresent(ch.id);
            else ref.current?.scrollToIndex({ index: items.length - 1, align: 'end', behavior: 'smooth' });
          }}
        >
          {detachedOrBehind ? 'Eski mesajları görüntülüyorsun' : 'Yeni mesajlar'} <span>Şimdiye dön</span> <ArrowDown size={14} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
interface Suggest {
  kind: 'user' | 'channel' | 'emoji';
  start: number;
  items: { key: string; label: string; sub?: string; insert: string; icon?: React.ReactNode }[];
}

function TypingBar({ chId, c }: { chId: string; c: Community }) {
  const typing = useStore((s) => s.typing[chId]);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me.id);
  const ids = Object.keys(typing || {}).filter((x) => x !== me);
  const names = ids.map((id) => displayName(c, id, users));
  let text = '';
  if (names.length === 1) text = `${names[0]} yazıyor…`;
  else if (names.length === 2) text = `${names[0]} ve ${names[1]} yazıyor…`;
  else if (names.length === 3) text = `${names[0]}, ${names[1]} ve ${names[2]} yazıyor…`;
  else if (names.length > 3) text = 'Birçok kişi yazıyor…';
  return (
    <div className="typing-bar">
      {text && (
        <>
          <span className="typing-dots">
            <i />
            <i />
            <i />
          </span>
          <span>{text}</span>
        </>
      )}
    </div>
  );
}

interface PendingFile {
  id: string;
  file: File;
  preview?: string;
}

export function Composer({ c, ch }: { c: Community; ch: Channel }) {
  const me = useStore((s) => s.me.id);
  const users = useStore((s) => s.users);
  const replyTo = useStore((s) => s.replyTo[ch.id]);
  const parent = useStore((s) => (replyTo ? s.chans[ch.id]?.items.find((x) => x.id === replyTo) : undefined));
  const enterToSend = useStore((s) => s.settings.enterToSend);
  const [value, setValue] = useState(() => drafts.get(ch.id) || '');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sug, setSug] = useState<Suggest | null>(null);
  const [sel, setSel] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canSend = ch.type !== 'announce' || can(c, me, Perm.MANAGE_CHANNELS);

  useEffect(() => {
    setValue(drafts.get(ch.id) || '');
    setFiles([]);
    setSug(null);
    ta.current?.focus();
  }, [ch.id]);
  useEffect(() => {
    drafts.set(ch.id, value);
  }, [value, ch.id]);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.45) + 'px';
  }, [value]);

  // dosya bırakma / yapıştırma
  useEffect(() => {
    const onDrop = (e: Event) => {
      const files = (e as CustomEvent<File[]>).detail;
      if (files?.length) addFiles(files);
    };
    window.addEventListener('kovan:files', onDrop);
    return () => window.removeEventListener('kovan:files', onDrop);
  });

  const addFiles = (list: File[]) => {
    const next = list.slice(0, 10 - files.length).map((file) => ({ id: Math.random().toString(36).slice(2), file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined }));
    const tooBig = list.find((f) => f.size > 25 * 1024 * 1024);
    if (tooBig) return toast(`"${tooBig.name}" çok büyük (en fazla 25 MB).`, 'err');
    setFiles((f) => [...f, ...next]);
  };

  const members = useMemo(() => c.members.map((m) => ({ id: m.userId, name: displayName(c, m.userId, users), user: users[m.userId] || c.users[m.userId] })), [c, users]);

  const computeSuggest = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    let m = /(^|\s)@([\p{L}\p{N}_.-]{0,32})$/u.exec(before);
    if (m) {
      const q = m[2].toLocaleLowerCase('tr');
      const items: Suggest['items'] = members
        .filter((x) => x.name.toLocaleLowerCase('tr').includes(q))
        .slice(0, 8)
        .map((x) => ({ key: x.id, label: x.name, insert: `@${x.name} `, icon: <Avatar user={x.user} size={22} /> }));
      if ('everyone'.startsWith(q) || 'herkes'.startsWith(q)) items.push({ key: 'everyone', label: '@everyone', sub: 'Herkese bildirim', insert: '@everyone ', icon: <span className="sug-at">@</span> });
      setSug(items.length ? { kind: 'user', start: caret - m[2].length - 1, items } : null);
      setSel(0);
      return;
    }
    m = /(^|\s)#([\p{L}\p{N}_-]{0,48})$/u.exec(before);
    if (m) {
      const q = m[2].toLocaleLowerCase('tr');
      const items = c.channels
        .filter((x) => !isVoiceLike(x.type) && x.name.includes(q))
        .slice(0, 8)
        .map((x) => ({ key: x.id, label: x.name, insert: `#${x.name} `, icon: <Hash size={16} /> }));
      setSug(items.length ? { kind: 'channel', start: caret - m[2].length - 1, items } : null);
      setSel(0);
      return;
    }
    m = /(^|\s):([a-z0-9_+-]{2,30})$/.exec(before);
    if (m) {
      const items = searchEmoji(m[2], 8).map((x) => ({ key: x.e + x.n, label: `:${x.n}:`, insert: x.e + ' ', icon: <span className="sug-emoji">{x.e}</span> }));
      setSug(items.length ? { kind: 'emoji', start: caret - m[2].length - 1, items } : null);
      setSel(0);
      return;
    }
    setSug(null);
  };

  const applySuggest = (i: number) => {
    if (!sug) return;
    const it = sug.items[i];
    const el = ta.current!;
    const caret = el.selectionStart;
    const next = value.slice(0, sug.start) + it.insert + value.slice(caret);
    setValue(next);
    setSug(null);
    requestAnimationFrame(() => {
      const pos = sug.start + it.insert.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  };

  const encode = (text: string) => {
    let t = replaceShortcodes(text);
    // @isim -> <@id> (uzun isimler önce)
    const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
    for (const mb of sorted) {
      const esc = mb.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`(^|\\s)@${esc}(?=$|[\\s.,!?:;])`, 'g'), `$1<@${mb.id}>`);
    }
    for (const x of c.channels) {
      if (isVoiceLike(x.type)) continue;
      const esc = x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`(^|\\s)#${esc}(?=$|[\\s.,!?:;])`, 'g'), `$1<#${x.id}>`);
    }
    return t;
  };

  const submit = async () => {
    const text = value.trim();
    if ((!text && !files.length) || uploading) return;
    if (text.length > 4000) return toast('Mesaj en fazla 4000 karakter olabilir.', 'err');
    let atts: Attachment[] | undefined;
    if (files.length) {
      setUploading(true);
      try {
        atts = [];
        for (const f of files) {
          const size = await imageSize(f.file);
          atts.push(await uploadFile(c.id, f.file, size?.w, size?.h));
        }
      } catch (e) {
        setUploading(false);
        return toast((e as Error).message, 'err');
      }
      setUploading(false);
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
    }
    sendMessage(ch.id, encode(text), atts);
    setValue('');
    drafts.delete(ch.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sug) {
      if (e.key === 'ArrowDown') return e.preventDefault(), setSel((s) => (s + 1) % sug.items.length);
      if (e.key === 'ArrowUp') return e.preventDefault(), setSel((s) => (s - 1 + sug.items.length) % sug.items.length);
      if (e.key === 'Tab' || e.key === 'Enter') return e.preventDefault(), applySuggest(sel);
      if (e.key === 'Escape') return e.preventDefault(), setSug(null);
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (enterToSend || e.ctrlKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Escape' && replyTo) useStore.setState((s) => ({ replyTo: { ...s.replyTo, [ch.id]: undefined } }));
    if (e.key === 'ArrowUp' && !value) {
      const items = useStore.getState().chans[ch.id]?.items || [];
      for (let i = items.length - 1; i >= 0; i--)
        if (items[i].authorId === me && !items[i].kind && !items[i].pending) {
          e.preventDefault();
          useStore.setState({ editing: items[i].id });
          break;
        }
    }
  };

  if (!canSend)
    return (
      <div className="composer disabled">
        <div className="composer-box">
          <span className="composer-locked">Bu duyuru kanalına yalnızca yöneticiler yazabilir.</span>
        </div>
      </div>
    );

  return (
    <div className="composer">
      {sug && (
        <div className="suggest">
          <div className="suggest-title">{sug.kind === 'user' ? 'Üyeler' : sug.kind === 'channel' ? 'Kanallar' : 'Emoji'}</div>
          {sug.items.map((it, i) => (
            <div key={it.key} className={cx('suggest-item', i === sel && 'sel')} onMouseEnter={() => setSel(i)} onMouseDown={(e) => (e.preventDefault(), applySuggest(i))}>
              {it.icon}
              <span>{it.label}</span>
              {it.sub && <span className="suggest-sub">{it.sub}</span>}
            </div>
          ))}
        </div>
      )}
      {replyTo && (
        <div className="reply-bar">
          <span>
            <b>{parent ? displayName(c, parent.authorId, users) : 'bir mesaj'}</b> kişisine yanıt veriliyor
          </span>
          <button className="icon-btn sm" onClick={() => useStore.setState((s) => ({ replyTo: { ...s.replyTo, [ch.id]: undefined } }))} aria-label="Yanıtı iptal et">
            <X size={14} />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="pending-files">
          {files.map((f) => (
            <div key={f.id} className="pf">
              {f.preview ? <img src={f.preview} alt="" /> : <FileText size={34} />}
              <span className="pf-name">{f.file.name}</span>
              <button
                className="pf-x"
                onClick={() => {
                  if (f.preview) URL.revokeObjectURL(f.preview);
                  setFiles((x) => x.filter((y) => y.id !== f.id));
                }}
                aria-label="Kaldır"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={cx('composer-box', (replyTo || files.length > 0) && 'joined')}>
        <Tooltip text="Dosya yükle" side="top">
          <button className="composer-btn" onClick={() => fileInput.current?.click()} aria-label="Dosya yükle">
            <Plus size={20} />
          </button>
        </Tooltip>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files || [])]);
            e.target.value = '';
          }}
        />
        <textarea
          id="composer-input"
          ref={ta}
          value={value}
          rows={1}
          spellCheck={false}
          placeholder={ch.type === 'site' ? `${ch.name} odasına mesaj gönder` : `#${ch.name} kanalına mesaj gönder`}
          onChange={(e) => {
            setValue(e.target.value);
            computeSuggest(e.target.value, e.target.selectionStart);
            if (e.target.value) sendTyping(ch.id);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setSug(null), 100)}
          onPaste={(e) => {
            const fl = [...e.clipboardData.files];
            if (fl.length) {
              e.preventDefault();
              addFiles(fl);
            }
          }}
        />
        {uploading && <LoaderCircle size={18} className="spin composer-spin" />}
        {ch.slowmode ? (
          <Tooltip text={`Yavaş mod: ${ch.slowmode} sn`} side="top">
            <span className="composer-btn static">
              <Clock size={17} />
            </span>
          </Tooltip>
        ) : null}
        <Tooltip text="Emoji" side="top">
          <button
            className="composer-btn"
            onClick={(ev) => {
              const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
              openPicker(r.right - 352, r.top, (e) => {
                const el = ta.current!;
                const s = el.selectionStart ?? value.length;
                const next = value.slice(0, s) + e + value.slice(el.selectionEnd ?? s);
                setValue(next);
                requestAnimationFrame(() => {
                  el.focus();
                  el.setSelectionRange(s + e.length, s + e.length);
                });
              });
            }}
            aria-label="Emoji"
          >
            <SmilePlus size={20} />
          </button>
        </Tooltip>
      </div>
      <TypingBar chId={ch.id} c={c} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function PinsPopover({ c, ch, onClose }: { c: Community; ch: Channel; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const users = useStore((s) => s.users);
  const md = useMdCtx(c);
  useEffect(() => {
    request<{ msgs: Message[] }>(ch.id, { t: 'pins', ch: ch.id, rid: '' })
      .then((r) => setMsgs(r.msgs))
      .catch(() => setMsgs([]));
  }, [ch.id]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    setTimeout(() => document.addEventListener('mousedown', h));
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div className="popover pins" ref={ref}>
      <div className="popover-title">Sabitlenmiş mesajlar</div>
      <div className="popover-body scroll-thin">
        {!msgs && <LoaderCircle className="spin" size={20} />}
        {msgs?.length === 0 && <div className="empty-note">Bu kanalda henüz sabitlenmiş mesaj yok. Bir mesajın menüsünden sabitleyebilirsin.</div>}
        {msgs?.map((m) => (
          <div key={m.id} className="mini-msg" onClick={() => (onClose(), jumpToMessage(c.id, ch.id, m.id))}>
            <Avatar user={users[m.authorId]} size={28} />
            <div>
              <div className="mini-head">
                <b style={{ color: roleColor(c, m.authorId) || undefined }}>{displayName(c, m.authorId, users)}</b> <span>{fmtTime(m.ts)}</span>
              </div>
              <div className="mini-body">{renderMarkdown(m.content, md)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatHeader({ c, ch }: { c: Community; ch: Channel }) {
  const membersOpen = useStore((s) => s.settings.membersOpen);
  const [pins, setPins] = useState(false);
  const [q, setQ] = useState('');
  return (
    <div className="chat-header">
      <span className="ch-head-icon">{ch.type === 'announce' ? <Megaphone size={22} /> : <Hash size={22} />}</span>
      <h2>{ch.name}</h2>
      {ch.topic && (
        <>
          <span className="head-sep" />
          <span className="ch-topic" title={ch.topic}>
            {ch.topic}
          </span>
        </>
      )}
      <div className="head-actions">
        <Tooltip text="Sabitlenmiş mesajlar" side="bottom">
          <button className={cx('icon-btn', pins && 'active')} onClick={() => setPins((x) => !x)} aria-label="Sabitlenmiş mesajlar">
            <Pin size={19} />
          </button>
        </Tooltip>
        <Tooltip text={membersOpen ? 'Üye listesini gizle' : 'Üye listesini göster'} side="bottom">
          <button className={cx('icon-btn', membersOpen && 'active')} onClick={() => updateSettings({ membersOpen: !membersOpen })} aria-label="Üye listesi">
            <Users size={19} />
          </button>
        </Tooltip>
        <div className="search-box">
          <input
            placeholder="Ara"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && q.trim()) openModal({ type: 'search', cid: c.id, q: q.trim() });
            }}
          />
          <Search size={15} />
        </div>
        {pins && <PinsPopover c={c} ch={ch} onClose={() => setPins(false)} />}
      </div>
    </div>
  );
}

export function ChatView({ c, ch }: { c: Community; ch: Channel }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  return (
    <section
      className="chat"
      onDragEnter={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        depth.current++;
        setDragging(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      }}
      onDragOver={(e) => [...e.dataTransfer.types].includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        depth.current = 0;
        setDragging(false);
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kovan:files', { detail: [...e.dataTransfer.files] }));
      }}
    >
      <ChatHeader c={c} ch={ch} />
      <MessageList c={c} ch={ch} />
      <Composer key={ch.id} c={c} ch={ch} />
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">
            <div className="drop-hex">
              <Plus size={34} />
            </div>
            <h3>#{ch.name} kanalına yükle</h3>
            <p>Dosyaları bırak; göndermeden önce bir mesaj ekleyebilirsin.</p>
          </div>
        </div>
      )}
    </section>
  );
}

export { modKey };
