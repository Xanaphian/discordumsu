import React, { memo, ReactNode, useEffect, useRef } from 'react';
import type { Community, Status, UserPublic } from '../../shared/protocol';
import type { AvatarShape, ProfileExtra } from '../../shared/profile';
import { cx, initials } from '../lib/util';

export const STATUS_LABEL: Record<Status, string> = {
  online: 'Çevrimiçi',
  idle: 'Boşta',
  dnd: 'Rahatsız Etmeyin',
  invisible: 'Görünmez',
  offline: 'Çevrimdışı',
};

type AvatarUser = Pick<UserPublic, 'name' | 'color' | 'avatar'> & { profile?: ProfileExtra; extra?: ProfileExtra };

export const Avatar = memo(function Avatar({
  user,
  size = 40,
  status,
  speaking,
  onClick,
  shape,
  plain,
}: {
  user: AvatarUser | undefined;
  size?: number;
  status?: Status;
  speaking?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  /** profil ayarı yerine bu şekli kullan */
  shape?: AvatarShape;
  /** çerçeve ve efektleri gösterme */
  plain?: boolean;
}) {
  const name = user?.name || '?';
  const prof = user?.profile ?? user?.extra;
  const sh = shape || prof?.shape || 'auto'; // auto: temaya göre (Bal'da petek, Destan'da daire)
  const frame = !plain && size >= 28 ? prof?.frame : undefined;
  const style = { width: size, height: size, ['--av-c' as any]: prof?.frameColor || `color-mix(in srgb, ${user?.color || '#f5a524'} 55%, #fff)` };
  return (
    <div
      className={cx('avatar', 'shape-' + sh, frame && 'frame-' + frame, size >= 64 && 'big', speaking && 'speaking', onClick && 'clickable')}
      style={style}
      onClick={onClick}
    >
      <div className="av-clip">
        {user?.avatar ? (
          <img src={user.avatar} alt="" draggable={false} loading="lazy" decoding="async" />
        ) : (
          <div className="avatar-fallback" style={{ background: user?.color || '#555', fontSize: size * 0.36 }}>
            {initials(name)}
          </div>
        )}
      </div>
      {status && <span className={cx('status-dot', status)} style={{ width: Math.max(10, size * 0.32), height: Math.max(10, size * 0.32) }} />}
    </div>
  );
});

export const CommunityIcon = memo(function CommunityIcon({ c, size = 48 }: { c: Pick<Community, 'name' | 'icon' | 'color'>; size?: number }) {
  return c.icon ? (
    <img className="comm-icon-img" src={c.icon} alt="" style={{ width: size, height: size }} draggable={false} />
  ) : (
    <div className="comm-icon-text" style={{ width: size, height: size, background: c.color, fontSize: size * 0.34 }}>
      {initials(c.name)}
    </div>
  );
});

export function Tooltip({ text, side = 'right', children }: { text: ReactNode; side?: 'right' | 'top' | 'bottom' | 'left'; children: ReactNode }) {
  return (
    <span className={cx('tip-wrap', 'tip-' + side)}>
      {children}
      <span className="tip">{text}</span>
    </span>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={value} disabled={disabled} className={cx('toggle', value && 'on')} onClick={() => onChange(!value)}>
      <span />
    </button>
  );
}

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void, enabled = true) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cbRef.current();
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && cbRef.current();
    const t = setTimeout(() => {
      document.addEventListener('mousedown', h);
      document.addEventListener('keydown', k);
    });
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [enabled, ref]);
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="logo-wrap" style={{ width: size, height: size }}>
      <svg className="logo-kovan" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="kg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd166" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="url(#kg)" />
        <path d="M32 17 44.5 24.2v14.6L32 46 19.5 38.8V24.2z" fill="#1a1306" opacity=".88" />
        <path d="M32 25.5 37.2 28.5v6L32 37.5 26.8 34.5v-6z" fill="url(#kg)" />
      </svg>
      <svg className="logo-destan" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3dca2" />
            <stop offset=".55" stopColor="#c9a35a" />
            <stop offset="1" stopColor="#7a5a2a" />
          </linearGradient>
        </defs>
        <path d="M4 32 15 25v14zM60 32 49 25v14z" fill="url(#dg)" opacity=".75" />
        <path d="M32 2 50 32 32 62 14 32z" fill="url(#dg)" />
        <path d="M32 11.5 44.2 32 32 52.5 19.8 32z" fill="#0a1018" />
        <path d="M32 21 38.6 32 32 43 25.4 32z" fill="#5fd0c8" />
        <path d="M32 26 35.6 32 32 38 28.4 32z" fill="#e9fbf8" />
      </svg>
    </span>
  );
}
