import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import {
  Hash, Megaphone, Users, Pin, Search, Reply, Pencil, Trash2, SmilePlus, MoreHorizontal, Plus, X, FileText, Download, CornerUpLeft,
  ArrowDown, LoaderCircle, CircleAlert, Clock, ArrowRight, Settings, Bell, BellOff, EyeOff, Globe,
  Mic, Square, SendHorizontal, Type, Bold, Italic, Strikethrough, Code, Quote, EyeOff as SpoilerIcon, Paperclip, Dices, Coins, Braces, UserRound, Phone, Video,
} from 'lucide-react';
import {
  useStore, CMessage, loadHistory, sendMessage, editMessage, deleteMessage, pinMessage, toggleReaction, sendTyping, openMenu,
  openModal, confirmDialog, retryMessage, discardMessage, markRead, uploadFile, hostHttp, toast, updateSettings, request, jumpToMessage,
  selectChannel, jumpToPresent, plainText, toggleMuted, addFriend, acceptFriend,
} from '../lib/store';
import { activeCustom } from '../../shared/profile';
import { DmCall } from './Media';
import { useVoice, joinVoice, toggleCamera } from '../lib/voice';
import { Avatar, Tooltip, STATUS_LABEL } from './Common';
import { NameText } from './profile/ProfileCard';
import { EmojiPicker } from './Overlays';
import { renderMarkdown, isEmojiOnly, MdCtx } from '../lib/markdown';
import { cx, fmtTime, hm, sameDay, fmtDay, fmtFull, fmtSize, displayName, roleColor, copyText, imageSize, modKey, memberRoles, memberOf } from '../lib/util';
import { QUICK_REACTIONS, replaceShortcodes, searchEmoji } from '../lib/emoji';
import { can, canIn, channelPerms, Perm, isVoiceLike, type Channel, type Community, type Message, type Attachment } from '../../shared/protocol';

const BASE = 1_000_000;
const GROUP_MS = 7 * 60 * 1000;
const drafts = new Map<string, string>();

// ---------------------------------------------------------------------------
// Kullanıcı adlarının imzası: kullanıcı listesi her değiştiğinde değil, yalnız bir ad değiştiğinde yeni değer verir.
// (Profil, etkinlik özeti gibi güncellemeler bütün mesajları yeniden işletmesin.)
let namesOf: unknown = null;
let namesSig = '';
function namesKey(users: Record<string, { name: string }>) {
  if (namesOf !== users) {
    namesOf = users;
    let k = '';
    for (const id in users) k += id + '\u0001' + users[id].name + '\u0002';
    namesSig = k;
  }
  return namesSig;
}

function useMdCtx(c: Community): MdCtx {
  const names = useStore((s) => namesKey(s.users));
  const me = useStore((s) => s.me.id);
  const cRef = useRef(c);
  cRef.current = c;
  return useMemo(
    () => ({
      meId: me,
      userName: (id) => {
        const c = cRef.current;
        const users = useStore.getState().users;
        return c.users[id] || users[id] ? displayName(c, id, users) : null;
      },
      channelName: (id) => c.channels.find((x) => x.id === id)?.name ?? null,
      onUser: (id, e) => useStore.setState({ popout: { uid: id, cid: c.id, x: e.clientX, y: e.clientY } }),
      onChannel: (id) => c.channels.some((x) => x.id === id) && selectChannel(c.id, id),
      roleInfo: (id) => {
        const r = c.roles.find((x) => x.id === id);
        return r ? { name: r.name, color: r.color, mine: !!memberOf(c, me)?.roles.includes(id) } : null;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.id, c.members, c.roles, c.channels, names, me],
  );
}

// ---------------------------------------------------------------------------
const AttachmentView = memo(function AttachmentView({ a, base }: { a: Attachment; base: string }) {
  const src = a.url.startsWith('blob:') ? a.url : base + a.url;
  const inline = useStore((s) => s.settings.inlineMedia);
  if (!inline && a.mime.startsWith('image/'))
    return (
      <div className="att-file clickable" onClick={() => openModal({ type: 'image', src, name: a.name })}>
        <FileText size={28} />
        <div className="att-meta">
          <span className="att-name">{a.name}</span>
          <span>Görsel · {fmtSize(a.size)} · açmak için tıkla</span>
        </div>
      </div>
    );
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

// Yanıtlanan mesajı bulmak için kanal başına dizin (her mesaj için listeyi taramamak için)
const itemIdx = new WeakMap<CMessage[], Map<string, CMessage>>();
function findItem(items: CMessage[] | undefined, id: string) {
  if (!items) return undefined;
  let idx = itemIdx.get(items);
  if (!idx) {
    idx = new Map();
    for (const x of items) if (!idx.has(x.id)) idx.set(x.id, x);
    itemIdx.set(items, idx);
  }
  return idx.get(id);
}

// Topluluk nesnesi her profil güncellemesinde yenilenir; mesaj yalnız kendisini ilgilendiren alanlar değişince yeniden çizilsin.
function sameItem(a: ItemProps, b: ItemProps) {
  for (const k of Object.keys(a) as (keyof ItemProps)[]) if (k !== 'c' && a[k] !== b[k]) return false;
  const x = a.c, y = b.c;
  return x === y || (x.id === y.id && x.ownerId === y.ownerId && x.members === y.members && x.roles === y.roles && x.channels === y.channels && x.users[a.m.authorId] === y.users[b.m.authorId]);
}

const MessageItem = memo(function MessageItem({ m, prev, c, md, me, canManage, isEditing, isNew, highlight, compact }: ItemProps) {
  const authorUser = useStore((s) => s.users[m.authorId]);
  const parent = useStore((s) => (m.replyTo ? findItem(s.chans[m.channelId]?.items, m.replyTo) : undefined));
  const parentUser = useStore((s) => (parent ? s.users[parent.authorId] : undefined));
  const newDay = !prev || !sameDay(prev.ts, m.ts);
  const grouped =
    !!prev && !newDay && !m.replyTo && !m.kind && !prev.kind && prev.authorId === m.authorId && m.ts - prev.ts < GROUP_MS && !prev.failed;
  const author = authorUser || c.users[m.authorId];
  const name = displayName(c, m.authorId, authorUser ? { [m.authorId]: authorUser } : {});
  const color = roleColor(c, m.authorId);
  const mine = m.authorId === me;
  const myRoles = memberOf(c, me)?.roles;
  const mentioned =
    m.content.includes(`<@${me}>`) || /@(everyone|here)\b/.test(m.content) || (parent?.authorId === me && !mine) || !!myRoles?.some((r) => m.content.includes(`<@&${r}>`));
  const blocked = useStore((s) => s.settings.blocked.includes(m.authorId));
  const showJoin = useStore((s) => s.settings.showJoinMessages);
  const showIcons = useStore((s) => s.settings.showRoleIcons);
  const [reveal, setReveal] = useState(false);
  const roleIcon = showIcons ? memberRoles(c, memberOf(c, m.authorId)).find((r) => r.icon)?.icon : undefined;
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

  if (m.kind === 'join' && !showJoin) return newDay ? <DayDivider ts={m.ts} /> : null;
  if (blocked && !reveal && !m.kind) {
    return (
      <>
        {newDay && <DayDivider ts={m.ts} />}
        <div className="msg system blocked-msg">
          <span className="sys-icon">
            <EyeOff size={15} />
          </span>
          <span>Engellediğin bir kişiden gelen mesaj.</span>
          <button className="link" onClick={() => setReveal(true)}>
            Göster
          </button>
        </div>
      </>
    );
  }

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
            aramıza katıldı. Hoş geldin! 👋
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
          mine && 'mine',
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
                <Avatar user={parentUser} size={16} />
                <span className="reply-name" style={{ color: roleColor(c, parent.authorId) || undefined }}>
                  {displayName(c, parent.authorId, parentUser ? { [parent.authorId]: parentUser } : {})}
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
                  <NameText profile={author?.profile} color={color || undefined}>
                    {name}
                  </NameText>
                </span>
                {roleIcon && <span className="role-icon">{roleIcon}</span>}
                {m.authorId === 'kovan-asistan' && <span className="tag-bot">ASİSTAN</span>}
                {author?.bot && <span className="tag-bot">BOT</span>}
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
}, sameItem);

function DayDivider({ ts }: { ts: number }) {
  return (
    <div className="day-divider">
      <span>{fmtDay(ts)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ChannelStart({ c, ch, loading, more }: { c?: Community; ch: Channel; loading: boolean; more: boolean }) {
  // Dönen simge yalnız gerçekten yüklenirken çizilir: daha eski mesaj varken hep dönmesi (görünmese bile)
  // pencere açıkken arayüzü saniyede 60 kez yeniden boyatıyordu.
  if (more || loading)
    return <div className="list-loading">{loading ? <LoaderCircle size={20} className="spin" /> : <span className="list-loading-slot" aria-hidden />}</div>;
  if (c?.dm) return <DmStart c={c} />;
  return (
    <div className="ch-start">
      <div className="ch-start-icon">{ch.type === 'announce' ? <Megaphone size={36} /> : ch.type === 'site' ? (ch.icon ? <img src={ch.icon} alt="" width={40} height={40} className="ch-site-icon" /> : <Globe size={38} />) : <Hash size={40} />}</div>
      <h1>{ch.type === 'site' ? `${ch.name} odasına hoş geldin!` : `#${ch.name} kanalına hoş geldin!`}</h1>
      <p>
        {ch.type === 'site' ? 'Odanın sohbeti burada; sohbetteki site bağlantıları doğrudan odada açılır.' : `Bu, #${ch.name} kanalının başlangıcı.`} {ch.topic}
      </p>
    </div>
  );
}

function DmStart({ c }: { c: Community }) {
  const uid = c.dm!;
  const user = useStore((s) => s.users[uid] || c.users[uid]);
  const fr = useStore((s) => s.friends[uid]);
  return (
    <div className="ch-start dm-start">
      <Avatar user={user} size={80} />
      <h1>{user?.name || c.name}</h1>
      <p>
        <b>{user?.name || c.name}</b> ile özel mesajlaşmanın başlangıcı. Burada yazdıklarınızı yalnızca ikiniz görürsünüz.
      </p>
      <div className="btn-row">
        {fr?.state === 'ok' ? (
          <span className="fr-tag">Arkadaşsınız</span>
        ) : fr?.state === 'in' ? (
          <button className="btn sm primary" onClick={() => acceptFriend(uid)}>
            Arkadaşlık isteğini kabul et
          </button>
        ) : fr?.state === 'out' ? (
          <span className="fr-tag">Arkadaşlık isteği gönderildi</span>
        ) : (
          <button className="btn sm primary" onClick={() => addFriend(uid)}>
            Arkadaş ekle
          </button>
        )}
      </div>
    </div>
  );
}

// Virtuoso'nun üst/alt parçaları sabit bileşenler: her çizimde yeni bileşen verilirse baştan kurulurlar
type ListCtx = { c: Community; ch: Channel; loading: boolean; more: boolean };
const LIST_PARTS = {
  Header: ({ context }: { context?: ListCtx }) => (context ? <ChannelStart c={context.c} ch={context.ch} loading={context.loading} more={context.more} /> : null),
  Footer: () => <div style={{ height: 18 }} />,
};

export function MessageList({ c, ch }: { c: Community; ch: Channel }) {
  const st = useStore((s) => s.chans[ch.id]);
  const me = useStore((s) => s.me.id);
  const editing = useStore((s) => s.editing);
  const compact = useStore((s) => s.settings.compact);
  const focused = useStore((s) => s.focused);
  const jumpTo = useStore((s) => s.jumpTo);
  const lastId = useStore((s) => s.lastIds[ch.id]);
  const md = useMdCtx(c);
  const canManage = canIn(c, me, ch, Perm.MANAGE_MESSAGES);
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

  const headCtx = useMemo<ListCtx>(() => ({ c, ch, loading: !!st?.loading, more: !!st?.more }), [c, ch, st?.loading, st?.more]);

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
        context={headCtx}
        components={LIST_PARTS}
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

const fmtSecs = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

/** Sesli mesaj kaydı: mikrofonu açar, bitince .webm dosyası verir. */
function useRecorder(onDone: (f: File) => void) {
  const [on, setOn] = useState(false);
  const [secs, setSecs] = useState(0);
  const r = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; keep: boolean; timer: number } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const cleanup = () => {
    const x = r.current;
    if (!x) return;
    clearInterval(x.timer);
    x.stream.getTracks().forEach((t) => t.stop());
    r.current = null;
    setOn(false);
  };
  useEffect(() => () => {
    if (r.current) {
      r.current.keep = false;
      if (r.current.mr.state !== 'inactive') r.current.mr.stop();
      cleanup();
    }
  }, []);
  const start = async () => {
    if (r.current) return;
    try {
      const st = useStore.getState().settings;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: st.micId && st.micId !== 'default' ? { ideal: st.micId } : undefined, echoCancellation: true, noiseSuppression: st.noiseSuppression },
      });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
      const x = { mr, stream, chunks: [] as Blob[], keep: true, timer: 0 };
      mr.ondataavailable = (e) => e.data.size && x.chunks.push(e.data);
      mr.onstop = () => {
        const keep = x.keep && x.chunks.length > 0;
        const blob = new Blob(x.chunks, { type: 'audio/webm' });
        cleanup();
        if (keep) {
          const d = new Date();
          const name = `sesli-mesaj-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.webm`;
          done.current(new File([blob], name, { type: 'audio/webm' }));
        }
      };
      const t0 = Date.now();
      x.timer = window.setInterval(() => {
        const n = Math.floor((Date.now() - t0) / 1000);
        setSecs(n);
        if (n >= 300 && mr.state === 'recording') mr.stop(); // en fazla 5 dakika
      }, 250);
      r.current = x;
      mr.start(500);
      setSecs(0);
      setOn(true);
    } catch {
      toast('Mikrofona erişilemedi.', 'err');
    }
  };
  const stop = (keep: boolean) => {
    const x = r.current;
    if (!x) return;
    x.keep = keep;
    if (x.mr.state !== 'inactive') x.mr.stop();
    else cleanup();
  };
  return { on, secs, start, stop };
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
  const [plusOpen, setPlusOpen] = useState(false);
  const [fmtOpen, setFmtOpen] = useState(false);
  const rec = useRecorder((f) => addFiles([f]));
  const cp = channelPerms(c, me, ch);
  const canSend = (cp & Perm.SEND_MESSAGES) !== 0;
  const canAttach = (cp & Perm.ATTACH_FILES) !== 0;
  const emojiConvert = useStore((s) => s.settings.emojiConvert);
  const myMember = c.members.find((x) => x.userId === me);
  const lockReason =
    myMember?.timeoutUntil && myMember.timeoutUntil > Date.now()
      ? `Zaman aşımındasın. ${fmtTime(myMember.timeoutUntil)} sonrasında tekrar yazabilirsin.`
      : ch.type === 'announce'
        ? 'Bu duyuru kanalına yalnızca yöneticiler yazabilir.'
        : 'Bu kanala mesaj gönderme yetkin yok.';
  const mentionableRoles = useMemo(
    () => c.roles.filter((r) => r.id !== c.id && (r.mentionable || (cp & Perm.MENTION_EVERYONE) !== 0)),
    [c.roles, c.id, cp],
  );

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
    if (!canAttach) return toast('Bu kanalda dosya gönderme yetkin yok.', 'err');
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
      for (const r of mentionableRoles.filter((x) => x.name.toLocaleLowerCase('tr').includes(q)).slice(0, 5))
        items.push({ key: 'r' + r.id, label: '@' + r.name, sub: 'Rol', insert: `@${r.name} `, icon: <span className="sug-at" style={{ color: r.color || undefined }}>@</span> });
      if (('everyone'.startsWith(q) || 'herkes'.startsWith(q)) && cp & Perm.MENTION_EVERYONE) items.push({ key: 'everyone', label: '@everyone', sub: 'Herkese bildirim', insert: '@everyone ', icon: <span className="sug-at">@</span> });
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
    let t = emojiConvert ? replaceShortcodes(text) : text;
    // @rol -> <@&id>
    for (const r of [...mentionableRoles].sort((a, b) => b.name.length - a.name.length)) {
      const esc = r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`(^|\\s)@${esc}(?=$|[\\s.,!?:;])`, 'g'), `$1<@&${r.id}>`);
    }
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

  /** Seçili metni biçim işaretleriyle sarar (seçim yoksa imleç ortada kalır). */
  const wrap = (open: string, close = open, linePrefix = false) => {
    const el = ta.current;
    if (!el) return;
    const a = el.selectionStart ?? value.length;
    const b = el.selectionEnd ?? a;
    const sel = value.slice(a, b);
    const ins = linePrefix ? (sel || '').split('\n').map((l) => open + l).join('\n') : open + sel + close;
    const next = value.slice(0, a) + ins + value.slice(b);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      if (sel) el.setSelectionRange(a, a + ins.length);
      else el.setSelectionRange(a + open.length, a + open.length);
    });
  };
  const insertText = (t: string) => {
    const el = ta.current;
    const a = el?.selectionStart ?? value.length;
    const b = el?.selectionEnd ?? a;
    setValue(value.slice(0, a) + t + value.slice(b));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + t.length, a + t.length);
    });
  };
  const roll = () => {
    const n = 1 + Math.floor(Math.random() * 6);
    sendMessage(ch.id, `🎲 Zar attı: **${n}**`);
  };
  const flip = () => sendMessage(ch.id, `🪙 Yazı tura: **${Math.random() < 0.5 ? 'Yazı' : 'Tura'}**`);

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
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault();
      wrap(e.key === 'b' ? '**' : '*');
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
          <span className="composer-locked">{lockReason}</span>
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
      {plusOpen && (
        <>
          <div className="cp-scrim" onMouseDown={() => setPlusOpen(false)} />
          <div className="cp-plus" onClick={() => setPlusOpen(false)}>
            {canAttach && (
              <button onClick={() => fileInput.current?.click()}>
                <Paperclip size={17} />
                <span>
                  <b>Dosya yükle</b>
                  <small>Resim, video, belge · 25 MB</small>
                </span>
              </button>
            )}
            {canAttach && (
              <button onClick={() => rec.start()}>
                <Mic size={17} />
                <span>
                  <b>Sesli mesaj</b>
                  <small>Kaydet ve gönder</small>
                </span>
              </button>
            )}
            <button onClick={() => wrap('```\n', '\n```')}>
              <Braces size={17} />
              <span>
                <b>Kod bloğu</b>
                <small>Renkli kod paylaş</small>
              </span>
            </button>
            <button onClick={() => wrap('||')}>
              <SpoilerIcon size={17} />
              <span>
                <b>Sürpriz metin</b>
                <small>Tıklayınca görünür</small>
              </span>
            </button>
            <div className="cp-sep" />
            <button onClick={roll}>
              <Dices size={17} />
              <span>
                <b>Zar at</b>
                <small>1 ile 6 arası</small>
              </span>
            </button>
            <button onClick={flip}>
              <Coins size={17} />
              <span>
                <b>Yazı tura</b>
                <small>Şansına güven</small>
              </span>
            </button>
          </div>
        </>
      )}
      {fmtOpen && !rec.on && (
        <div className="cp-fmt">
          <Tooltip text="Kalın (Ctrl+B)" side="top">
            <button onMouseDown={(e) => (e.preventDefault(), wrap('**'))} aria-label="Kalın">
              <Bold size={15} />
            </button>
          </Tooltip>
          <Tooltip text="İtalik (Ctrl+I)" side="top">
            <button onMouseDown={(e) => (e.preventDefault(), wrap('*'))} aria-label="İtalik">
              <Italic size={15} />
            </button>
          </Tooltip>
          <Tooltip text="Üstü çizili" side="top">
            <button onMouseDown={(e) => (e.preventDefault(), wrap('~~'))} aria-label="Üstü çizili">
              <Strikethrough size={15} />
            </button>
          </Tooltip>
          <i />
          <Tooltip text="Satır içi kod" side="top">
            <button onMouseDown={(e) => (e.preventDefault(), wrap('`'))} aria-label="Kod">
              <Code size={15} />
            </button>
          </Tooltip>
          <Tooltip text="Alıntı" side="top">
            <button onMouseDown={(e) => (e.preventDefault(), wrap('> ', '', true))} aria-label="Alıntı">
              <Quote size={15} />
            </button>
          </Tooltip>
          <Tooltip text="Sürpriz metin" side="top">
            <button onMouseDown={(e) => (e.preventDefault(), wrap('||'))} aria-label="Sürpriz metin">
              <SpoilerIcon size={15} />
            </button>
          </Tooltip>
        </div>
      )}
      <div className={cx('composer-box', (replyTo || files.length > 0) && 'joined', rec.on && 'recording')}>
        <Tooltip text="Ekle" side="top">
          <button className={cx('composer-btn', 'cp-plus-btn', plusOpen && 'on')} onClick={() => setPlusOpen((v) => !v)} aria-label="Ekle">
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
        {rec.on && (
          <div className="cp-rec">
            <span className="cp-rec-dot" />
            <b>Kaydediliyor</b>
            <span className="cp-rec-time">{fmtSecs(rec.secs)}</span>
            <span className="cp-rec-wave" aria-hidden>
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} style={{ animationDelay: `${(i * 83) % 600}ms` }} />
              ))}
            </span>
            <button className="btn ghost sm" onClick={() => rec.stop(false)}>
              İptal
            </button>
            <button className="btn primary sm" onClick={() => rec.stop(true)}>
              <Square size={12} /> Bitir
            </button>
          </div>
        )}
        <textarea
          hidden={rec.on}
          id="composer-input"
          ref={ta}
          value={value}
          rows={1}
          spellCheck={false}
          placeholder={c.dm ? `@${useStore.getState().users[c.dm]?.name || ch.name} kişisine mesaj gönder` : ch.type === 'site' ? `${ch.name} odasına mesaj gönder` : `#${ch.name} kanalına mesaj gönder`}
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
        {!rec.on && (
          <div className="cp-right">
        <Tooltip text="Biçimlendirme" side="top">
          <button className={cx('composer-btn', fmtOpen && 'on')} onClick={() => setFmtOpen((v) => !v)} aria-label="Biçimlendirme">
            <Type size={19} />
          </button>
        </Tooltip>
        {canAttach && !value.trim() && !files.length && (
          <Tooltip text="Sesli mesaj" side="top">
            <button className="composer-btn" onClick={() => rec.start()} aria-label="Sesli mesaj">
              <Mic size={19} />
            </button>
          </Tooltip>
        )}
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
        {(value.trim() || files.length > 0) && (
          <Tooltip text="Gönder" side="top">
            <button className="composer-btn cp-send" onClick={submit} aria-label="Gönder" disabled={uploading}>
              <SendHorizontal size={18} />
            </button>
          </Tooltip>
        )}
          </div>
        )}
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

/** Özel sohbet başlığı: karşı tarafın avatarı, adı ve durumu */
function DmHeader({ c, ch, pins, setPins }: { c: Community; ch: Channel; pins: boolean; setPins: React.Dispatch<React.SetStateAction<boolean>> }) {
  const uid = c.dm!;
  const user = useStore((s) => s.users[uid] || c.users[uid]);
  const status = useStore((s) => s.presence[uid]) || 'offline';
  const membersOpen = useStore((s) => s.settings.membersOpen);
  const chMuted = useStore((s) => s.settings.mutedIds.includes(c.id));
  const custom = activeCustom(user?.profile);
  const pop = (e: React.MouseEvent) => useStore.setState({ popout: { uid, cid: c.id, x: e.clientX, y: e.clientY + 16 } });
  const inCall = useVoice().ch === ch.id;
  return (
    <div className="chat-header dm-head">
      <span className="dm-head-av" onClick={pop}>
        <Avatar user={user} size={28} status={status} plain />
      </span>
      <h2 className="dm-head-name" onClick={pop}>
        {user?.name || c.name}
      </h2>
      <span className="dm-head-status">{custom?.text ? `${custom.emoji ? custom.emoji + ' ' : ''}${custom.text}` : STATUS_LABEL[status]}</span>
      <div className="head-actions">
        {!inCall && (
          <>
            <Tooltip text="Sesli arama başlat" side="bottom">
              <button className="icon-btn" onClick={() => joinVoice(c.id, ch.id)} aria-label="Sesli arama">
                <Phone size={19} />
              </button>
            </Tooltip>
            <Tooltip text="Görüntülü arama başlat" side="bottom">
              <button className="icon-btn" onClick={async () => (await joinVoice(c.id, ch.id), toggleCamera())} aria-label="Görüntülü arama">
                <Video size={20} />
              </button>
            </Tooltip>
          </>
        )}
        <Tooltip text={chMuted ? 'Bildirimleri aç' : 'Sessize al'} side="bottom">
          <button className={cx('icon-btn', chMuted && 'active')} onClick={() => toggleMuted(c.id)} aria-label="Bildirimler">
            {chMuted ? <BellOff size={19} /> : <Bell size={19} />}
          </button>
        </Tooltip>
        <Tooltip text="Sabitlenmiş mesajlar" side="bottom">
          <button className={cx('icon-btn', pins && 'active')} onClick={() => setPins((x) => !x)} aria-label="Sabitlenmiş mesajlar">
            <Pin size={19} />
          </button>
        </Tooltip>
        <Tooltip text={membersOpen ? 'Profili gizle' : 'Profili göster'} side="bottom">
          <button className={cx('icon-btn', membersOpen && 'active')} onClick={() => updateSettings({ membersOpen: !membersOpen })} aria-label="Profil">
            <UserRound size={19} />
          </button>
        </Tooltip>
        {pins && <PinsPopover c={c} ch={ch} onClose={() => setPins(false)} />}
      </div>
    </div>
  );
}

export function ChatHeader({ c, ch }: { c: Community; ch: Channel }) {
  const membersOpen = useStore((s) => s.settings.membersOpen);
  const chMuted = useStore((s) => s.settings.mutedIds.includes(ch.id));
  const me = useStore((s) => s.me.id);
  const editCh = canIn(c, me, ch, Perm.MANAGE_CHANNELS);
  const [pins, setPins] = useState(false);
  const [q, setQ] = useState('');
  if (c.dm) return <DmHeader c={c} ch={ch} pins={pins} setPins={setPins} />;
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
      {c.dm && <DmCall c={c} ch={ch} />}
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
