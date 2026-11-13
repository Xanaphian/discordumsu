import React, { useEffect, useState } from 'react';
import { X, Smile } from 'lucide-react';
import { useStore, openModal, updateProfile, meAsUser, toast } from '../../lib/store';
import { EmojiPicker } from '../Overlays';
import { cx } from '../../lib/util';
import { activeCustom } from '../../../shared/profile';
import { ProfileCard } from './ProfileCard';

const close = () => openModal(null);

function Backdrop({ children, className }: { children: React.ReactNode; className?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.emoji-picker') && close();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={cx('modal', className)} role="dialog" aria-modal>
        {children}
      </div>
    </div>
  );
}

/** Tam profil penceresi */
export function ProfileModal({ uid, cid }: { uid: string; cid?: string }) {
  const me = useStore((s) => s.me);
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const c = useStore((s) => (cid ? s.communities[cid] : undefined));
  const isMe = uid === me.id;
  const u = isMe ? meAsUser(me) : users[uid] || c?.users[uid];
  const status = isMe ? (me.status === 'invisible' ? 'offline' : me.status) : uid === 'kovan-asistan' ? 'online' : presence[uid] || 'offline';
  return (
    <Backdrop className="pc-modal">
      <button className="pc-modal-x icon-btn" onClick={close} aria-label="Kapat">
        <X size={20} />
      </button>
      <ProfileCard uid={uid} user={u} status={status} c={c} variant="full" isMe={isMe} onClose={close} />
    </Backdrop>
  );
}

const DURATIONS: [string, number | null][] = [
  ['Süresiz', null],
  ['30 dakika', 30 * 60e3],
  ['1 saat', 60 * 60e3],
  ['4 saat', 4 * 60 * 60e3],
  ['Bugün', -1],
];

const SUGGEST: [string, string][] = [
  ['🎮', 'Oyunda'],
  ['📚', 'Ders çalışıyor'],
  ['💻', 'Kod yazıyor'],
  ['🎧', 'Müzik dinliyor'],
  ['☕', 'Kahve molası'],
  ['😴', 'Uyuyor'],
];

/** Hızlı özel durum penceresi */
export function CustomStatusModal() {
  const me = useStore((s) => s.me);
  const cur = activeCustom(me.extra);
  const [emoji, setEmoji] = useState(cur?.emoji || '');
  const [text, setText] = useState(cur?.text || '');
  const [dur, setDur] = useState(0);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const save = async (clear = false) => {
    const d = DURATIONS[dur][1];
    let until: number | undefined;
    if (d === -1) {
      const t = new Date();
      t.setHours(23, 59, 59, 999);
      until = t.getTime();
    } else if (d) until = Date.now() + d;
    await updateProfile({ extra: { ...me.extra, custom: clear || (!emoji && !text.trim()) ? undefined : { emoji: emoji || undefined, text: text.trim() || undefined, until } } });
    toast(clear ? 'Özel durum temizlendi' : 'Özel durum ayarlandı', 'ok');
    close();
  };
  return (
    <Backdrop className="cs-modal">
      <div className="modal-head">
        <h2>Özel durum</h2>
        <p>Profilinde ve üye listesinde görünür.</p>
        <button className="modal-x icon-btn" onClick={close} aria-label="Kapat">
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">
        <div className="pe-status big">
          <button className="pe-emoji-btn" onClick={(e) => setPicker({ x: e.clientX, y: e.clientY })} title="Emoji seç">
            {emoji || <Smile size={20} />}
          </button>
          <input autoFocus value={text} maxLength={80} placeholder="Neler oluyor?" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </div>
        <div className="cs-suggest">
          {SUGGEST.map(([e, t]) => (
            <button
              key={t}
              onClick={() => {
                setEmoji(e);
                setText(t);
              }}
            >
              <span>{e}</span>
              {t}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Ne zaman temizlensin?</span>
          <select value={dur} onChange={(e) => setDur(Number(e.target.value))}>
            {DURATIONS.map(([l], i) => (
              <option key={l} value={i}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {picker && (
          <EmojiPicker
            x={picker.x}
            y={picker.y + 420}
            onPick={(e) => {
              setEmoji(e);
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
      <div className="modal-foot">
        {cur && (
          <button className="btn ghost" onClick={() => save(true)}>
            Temizle
          </button>
        )}
        <button className="btn primary" onClick={() => save()}>
          Kaydet
        </button>
      </div>
    </Backdrop>
  );
}
