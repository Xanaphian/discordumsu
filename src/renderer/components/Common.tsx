import React, { memo, ReactNode, useEffect, useRef, useState } from 'react';
import type { Community, Status, UserPublic } from '../../shared/protocol';
import type { AvatarShape, ProfileExtra } from '../../shared/profile';
import { cx, initials } from '../lib/util';

export const STATUS_LABEL: Record<Status, string> = {
  online: 'Çevrimiçi',
  idle: 'Uzakta',
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
  const sh = shape || prof?.shape || 'auto'; // auto: daire (kullanıcı başka şekil seçmediyse)
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
  // Tıklanınca ipucu gizlenir; yoksa düğmenin açtığı menü ya da panelin üstüne biner. Fare çıkınca yeniden çalışır.
  const [off, setOff] = useState(false);
  return (
    <span className={cx('tip-wrap', 'tip-' + side, off && 'tip-off')} onMouseDown={() => setOff(true)} onMouseLeave={() => setOff(false)}>
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
  // Xanaphian logosu: xanaphian.com'daki yengeç rozeti; görseli temaya göre CSS seçer (marka.css)
  return <span className="logo-wrap logo-crab" style={{ width: size, height: size, ['--ls' as any]: size + 'px' }} role="img" aria-label="Xanaphian" />;
}
