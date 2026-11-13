import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, CircleCheck, CircleAlert, Info, Plus, X, MoreHorizontal, Clock } from 'lucide-react';
import { useStore, MenuItem, openModal, openMenu, cmd, recentEmoji, rememberEmoji, meAsUser } from '../lib/store';
import { ProfileCard } from './profile/ProfileCard';
import { PickerTabs, GifPanel, StickerPanel, type PickerTab } from './MedyaSecici';
import { useClickOutside } from './Common';
import { cx, fmtDay, memberRoles } from '../lib/util';
import { EMOJI_CATS, searchEmoji } from '../lib/emoji';
import { can, canEditRole, isTimedOut, Perm } from '../../shared/protocol';
import { memberMenu } from './Moderation';

function useFit(ref: React.RefObject<HTMLElement | null>, x: number, y: number, deps: unknown[] = []) {
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const pad = 8;
      let left = x, top = y;
      if (left + r.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - r.width - pad);
      if (top + r.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - r.height - pad);
      left = Math.max(pad, left);
      top = Math.max(pad, top);
      setPos((p) => (p.ready && p.left === left && p.top === top ? p : { left, top, ready: true }));
    };
    fit();
    // İçerik sonradan büyüyebilir (etkinlik, resimler, roller); pencereden taşmasın diye yeniden yerleştir.
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, ...deps]);
  return pos;
}

const STATUS_ICON: Record<string, string> = { 'status-online': 'online', 'status-idle': 'idle', 'status-dnd': 'dnd', 'status-invisible': 'offline' };

export function ContextMenu() {
  const menu = useStore((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => useStore.setState({ menu: null });
  useClickOutside(ref, close, !!menu);
  const pos = useFit(ref, menu?.x || 0, menu?.y || 0, [menu]);
  if (!menu) return null;
  return (
    <div ref={ref} className="ctx-menu" style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }} onContextMenu={(e) => e.preventDefault()}>
      <MenuItems items={menu.items} close={close} />
    </div>
  );
}

function MenuItems({ items, close }: { items: MenuItem[]; close: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      {items.map((it: MenuItem, i) =>
        it.sep ? (
          <div key={i} className="ctx-sep" />
        ) : it.emojis ? (
          <div key={i} className="ctx-emojis">
            {it.emojis.map((e) => (
              <button key={e} onClick={() => (close(), it.onEmoji?.(e))}>
                {e}
              </button>
            ))}
          </div>
        ) : it.sub ? (
          <div key={i} className="ctx-sub-wrap" onMouseEnter={() => setOpen(i)} onMouseLeave={() => setOpen((o) => (o === i ? null : o))}>
            <button className={cx('ctx-item', open === i && 'open')} disabled={it.disabled || !it.sub.length} onClick={() => setOpen(i)}>
              <span className="ctx-label">{it.label}</span>
              <ChevronRight size={14} className="ctx-arrow" />
            </button>
            {open === i && it.sub.length > 0 && <SubMenu items={it.sub} close={close} />}
          </div>
        ) : (
          <button
            key={i}
            className={cx('ctx-item', it.danger && 'danger')}
            disabled={it.disabled}
            onMouseEnter={() => setOpen(null)}
            onClick={() => {
              close();
              it.onClick?.();
            }}
          >
            {it.icon && STATUS_ICON[it.icon] && <span className={cx('status-dot inline', STATUS_ICON[it.icon])} />}
            <span className="ctx-label">{it.label}</span>
            {it.hint && <span className="ctx-hint">{it.hint}</span>}
            {it.checked !== undefined && <span className={cx('ctx-check', it.checked && 'on')}>{it.checked && <Check size={12} />}</span>}
          </button>
        ),
      )}
    </>
  );
}

/** Alt menü: sağa, sığmazsa sola açılır */
function SubMenu({ items, close }: { items: MenuItem[]; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<{ left: boolean; shift: number }>({ left: false, shift: 0 });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setSide({ left: r.right > window.innerWidth - 8, shift: Math.min(0, window.innerHeight - 8 - r.bottom) });
  }, []);
  return (
    <div ref={ref} className={cx('ctx-menu ctx-sub', side.left && 'left')} style={{ marginTop: side.shift }}>
      <MenuItems items={items} close={close} />
    </div>
  );
}

export function UserPopout() {
  const p = useStore((s) => s.popout);
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const me = useStore((s) => s.me);
  const c = useStore((s) => (p?.cid ? s.communities[p.cid] : undefined));
  const ref = useRef<HTMLDivElement>(null);
  const close = () => useStore.setState({ popout: null });
  useClickOutside(ref, close, !!p);
  const anchor = useMemo(() => {
    // Üye listesinden açılan kart listenin üstüne binmesin: listenin soluna yerleşir
    const x = p?.x || 0, y = p?.y || 0;
    const list = document.querySelector('.members')?.getBoundingClientRect();
    if (list && list.width > 0 && x + 300 >= list.left && x + 300 <= list.right && y >= list.top && y <= list.bottom) return { x: list.left - 352, y: y - 20 };
    return { x, y };
  }, [p]);
  const pos = useFit(ref, anchor.x + 12, anchor.y - 40, [p]);
  if (!p) return null;
  const isMe = p.uid === me.id;
  const u = isMe ? meAsUser(me) : users[p.uid] || c?.users[p.uid];
  const status = isMe ? (me.status === 'invisible' ? 'offline' : me.status) : p.uid === 'kovan-asistan' ? 'online' : presence[p.uid] || 'offline';
  const member = c?.members.find((x) => x.userId === p.uid);
  const roles = c && member ? memberRoles(c, member) : [];
  const rolesNode =
    c && member && (roles.length > 0 || can(c, me.id, Perm.MANAGE_ROLES)) ? (
      <section className="pc-sec">
        <h4>Roller</h4>
        <div className="role-chips">
          {roles.map((r) => (
            <span key={r.id} className="role-chip">
              <i style={{ background: r.color || 'var(--text-3)' }} />
              {r.icon && <span className="role-icon">{r.icon}</span>}
              {r.name}
              {canEditRole(c, me.id, r) && (
                <button onClick={() => cmd(c.id, { t: 'member.update', cid: c.id, userId: p.uid, roles: member.roles.filter((x) => x !== r.id) })} aria-label="Rolü kaldır">
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {can(c, me.id, Perm.MANAGE_ROLES) && (
            <button
              className="role-chip add"
              title="Rol ver"
              onClick={(e) => {
                const avail = c.roles.filter((r) => r.id !== c.id && !member.roles.includes(r.id) && canEditRole(c, me.id, r)).sort((a, b) => b.position - a.position);
                openMenu(e, [
                  ...avail.map((r) => ({ label: (r.icon ? r.icon + ' ' : '') + r.name, onClick: () => cmd(c.id, { t: 'member.update', cid: c.id, userId: p.uid, roles: [...member.roles, r.id] }) })),
                  ...(avail.length ? [{ sep: true }] : [{ label: 'Verilebilecek rol yok', disabled: true }]),
                  { label: 'Rolleri yönet…', onClick: () => (close(), openModal({ type: 'commSettings', cid: c.id, tab: 'roles' })) },
                ]);
              }}
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      </section>
    ) : null;
  return (
    <div ref={ref} className="popout pc-pop" style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}>
      <ProfileCard
        uid={p.uid}
        user={u}
        status={status}
        c={c}
        variant="popout"
        isMe={isMe}
        onClose={close}
        rolesNode={rolesNode}
        notice={
          member && isTimedOut(member) ? (
            <div className="pc-sec timeout-note">
              <Clock size={13} /> Zaman aşımında · {fmtDay(member.timeoutUntil!)}
            </div>
          ) : null
        }
        extraActions={
          c && member ? (
            <button className="btn sm ghost pc-more" title="Diğer işlemler" onClick={(e) => openMenu(e, memberMenu(c, me.id, p.uid, { noProfile: true }))}>
              <MoreHorizontal size={16} />
            </button>
          ) : null
        }
      />
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', t.kind)}>
          {t.kind === 'ok' ? <CircleCheck size={16} /> : t.kind === 'err' ? <CircleAlert size={16} /> : <Info size={16} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export interface PickerMedia {
  /** GIF / çıkartma seçilince gönderilecek mesaj işareti */
  onSend: (token: string) => void;
  /** çıkartmaları gösterilecek topluluk */
  cid?: string;
}

let lastTab: PickerTab = 'emoji';

export function EmojiPicker({ x, y, onPick, onClose, media }: { x: number; y: number; onPick: (e: string) => void; onClose: () => void; media?: PickerMedia }) {
  const [tab, setTabRaw] = useState<PickerTab>(media ? lastTab : 'emoji');
  const setTab = (t: PickerTab) => {
    lastTab = t;
    setTabRaw(t);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<{ e: string; n: string } | null>(null);
  useClickOutside(ref, onClose);
  const pos = useFit(ref, x, y - (media ? 468 : 420));
  const recent = useMemo(() => recentEmoji(), []);
  const results = useMemo(() => (q ? searchEmoji(q, 120) : null), [q]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Seçici ilk karede gizli çizildiği için autoFocus tutmuyordu; görünür olunca arama kutusuna odaklan
  useEffect(() => {
    if (pos.ready) searchRef.current?.focus();
  }, [pos.ready]);
  const pick = (e: string) => {
    rememberEmoji(e);
    onPick(e);
  };
  if (media && tab !== 'emoji')
    return (
      <div ref={ref} className="emoji-picker ep-media" style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}>
        <PickerTabs tab={tab} setTab={setTab} />
        {tab === 'gif' ? <GifPanel onSend={media.onSend} inputRef={searchRef} /> : <StickerPanel cid={media.cid} onSend={media.onSend} onClose={onClose} inputRef={searchRef} />}
      </div>
    );
  return (
    <div ref={ref} className={cx('emoji-picker', media && 'ep-media')} style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}>
      {media && <PickerTabs tab={tab} setTab={setTab} />}
      <div className="ep-search">
        <input ref={searchRef} placeholder="Emoji ara (ör. kalp, ateş, yıldız)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && results?.[0] && pick(results[0].e)} />
      </div>
      <div className="ep-main">
        {!q && (
          <div className="ep-cats">
            {recent.length > 0 && (
              <button title="Son kullanılanlar" onClick={() => bodyRef.current?.querySelector('#ep-recent')?.scrollIntoView()}>
                🕘
              </button>
            )}
            {EMOJI_CATS.map((c) => (
              <button key={c.id} title={c.name} onClick={() => bodyRef.current?.querySelector('#ep-' + c.id)?.scrollIntoView()}>
                {c.list[0].e}
              </button>
            ))}
          </div>
        )}
        <div className="ep-body scroll-thin" ref={bodyRef}>
          {results ? (
            <div className="ep-grid">
              {results.map((r) => (
                <button key={r.e + r.n} onClick={() => pick(r.e)} onMouseEnter={() => setHover(r)}>
                  {r.e}
                </button>
              ))}
              {!results.length && <div className="empty-note">Sonuç yok</div>}
            </div>
          ) : (
            <>
              {recent.length > 0 && (
                <div id="ep-recent">
                  <div className="ep-cat-title">Son kullanılanlar</div>
                  <div className="ep-grid">
                    {recent.map((e) => (
                      <button key={e} onClick={() => pick(e)}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {EMOJI_CATS.map((c) => (
                <div key={c.id} id={'ep-' + c.id}>
                  <div className="ep-cat-title">{c.name}</div>
                  <div className="ep-grid">
                    {c.list.map((x) => (
                      <button key={x.e} onClick={() => pick(x.e)} onMouseEnter={() => setHover({ e: x.e, n: x.n[0] })}>
                        {x.e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="ep-foot">
        {hover ? (
          <>
            <span className="ep-foot-emoji">{hover.e}</span> :{hover.n}:
          </>
        ) : (
          <span className="muted">Bir emoji seç</span>
        )}
      </div>
    </div>
  );
}
