import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleCheck, CircleAlert, Info } from 'lucide-react';
import { useStore, MenuItem, openModal, recentEmoji, rememberEmoji } from '../lib/store';
import { Avatar, STATUS_LABEL, useClickOutside } from './Common';
import { cx, displayName, fmtDay, memberRoles, copyText } from '../lib/util';
import { EMOJI_CATS, searchEmoji } from '../lib/emoji';
import { idTime } from '../../shared/protocol';

function useFit(ref: React.RefObject<HTMLElement | null>, x: number, y: number, deps: unknown[] = []) {
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    let left = x, top = y;
    if (left + r.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - r.width - pad);
    if (top + r.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - r.height - pad);
    setPos({ left: Math.max(pad, left), top: Math.max(pad, top), ready: true });
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
      {menu.items.map((it: MenuItem, i) =>
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
        ) : (
          <button
            key={i}
            className={cx('ctx-item', it.danger && 'danger')}
            disabled={it.disabled}
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
  const pos = useFit(ref, (p?.x || 0) + 12, (p?.y || 0) - 40, [p]);
  if (!p) return null;
  const u = p.uid === me.id ? me : users[p.uid] || c?.users[p.uid];
  const status = p.uid === me.id ? (me.status === 'invisible' ? 'offline' : me.status) : p.uid === 'kovan-asistan' ? 'online' : presence[p.uid] || 'offline';
  const member = c?.members.find((x) => x.userId === p.uid);
  const roles = c && member ? memberRoles(c, member) : [];
  return (
    <div ref={ref} className="popout" style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}>
      <div className="popout-banner" style={{ background: `linear-gradient(135deg, ${u?.color || '#f5a524'}, color-mix(in srgb, ${u?.color || '#f5a524'} 40%, #000))` }} />
      <div className="popout-avatar">
        <Avatar user={u} size={80} status={status} />
      </div>
      <div className="popout-body">
        <div className="popout-name">{c ? displayName(c, p.uid, users) : u?.name}</div>
        <div className="popout-user">
          {u?.name} · {STATUS_LABEL[status]}
        </div>
        {u?.bio && (
          <div className="popout-section">
            <div className="popout-label">Hakkında</div>
            <div className="popout-bio">{u.bio}</div>
          </div>
        )}
        {member && (
          <div className="popout-section">
            <div className="popout-label">Katılma tarihi</div>
            <div>{fmtDay(member.joinedAt)}</div>
          </div>
        )}
        {p.uid !== 'kovan-asistan' && /^[0-9a-z]{14}$/.test(p.uid) && (
          <div className="popout-section">
            <div className="popout-label">Kovan'a katıldı</div>
            <div>{fmtDay(idTime(p.uid))}</div>
          </div>
        )}
        {roles.length > 0 && (
          <div className="popout-section">
            <div className="popout-label">Roller</div>
            <div className="role-chips">
              {roles.map((r) => (
                <span key={r.id} className="role-chip">
                  <i style={{ background: r.color || 'var(--text-3)' }} />
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="popout-actions">
          {p.uid === me.id ? (
            <button className="btn sm" onClick={() => (close(), openModal({ type: 'settings', tab: 'profile' }))}>
              Profili düzenle
            </button>
          ) : (
            <button className="btn sm ghost" onClick={() => (copyText(p.uid), close())}>
              Kimliği kopyala
            </button>
          )}
        </div>
      </div>
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

export function EmojiPicker({ x, y, onPick, onClose }: { x: number; y: number; onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<{ e: string; n: string } | null>(null);
  useClickOutside(ref, onClose);
  const pos = useFit(ref, x, y - 420);
  const recent = useMemo(() => recentEmoji(), []);
  const results = useMemo(() => (q ? searchEmoji(q, 120) : null), [q]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pick = (e: string) => {
    rememberEmoji(e);
    onPick(e);
  };
  return (
    <div ref={ref} className="emoji-picker" style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}>
      <div className="ep-search">
        <input autoFocus placeholder="Emoji ara (ör. ari, kalp, fire)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && results?.[0] && pick(results[0].e)} />
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
