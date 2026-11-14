import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Mic, Headphones, Settings } from 'lucide-react';
import { useStore, updateSettings, openModal } from '../lib/store';
import { cx } from '../lib/util';

export type DeviceKind = 'mic' | 'speaker';

/** Ses cihazlarını getirir; takılıp çıkarılınca listeyi tazeler. Adlar boşsa bir kez izin isteyip yeniden dener. */
export function useAudioDevices(enabled = true) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!enabled || !navigator.mediaDevices) return;
    let alive = true;
    let asked = false;
    const load = async () => {
      try {
        let list = await navigator.mediaDevices.enumerateDevices();
        const audio = list.filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput');
        if (!asked && audio.length && audio.every((d) => !d.label)) {
          asked = true;
          const s = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
          s?.getTracks().forEach((t) => t.stop());
          list = await navigator.mediaDevices.enumerateDevices();
        }
        if (alive) setDevices(list);
      } catch {
        /* cihaz listesi alınamadı */
      }
    };
    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => {
      alive = false;
      navigator.mediaDevices.removeEventListener('devicechange', load);
    };
  }, [enabled]);
  return devices;
}

/** "Varsayılan - Mikrofon (Realtek)" → "Mikrofon (Realtek)" */
const stripDefault = (l: string) => l.replace(/^(Default|Varsayılan|Communications|İletişim)\s*-\s*/i, '');

const TEXT = {
  mic: { title: 'Giriş aygıtı', vol: 'Giriş ses düzeyi', fallback: 'Mikrofon', kind: 'audioinput', tip: 'Mikrofon seç' },
  speaker: { title: 'Çıkış aygıtı', vol: 'Çıkış ses düzeyi', fallback: 'Hoparlör', kind: 'audiooutput', tip: 'Kulaklık / hoparlör seç' },
} as const;

/** Mikrofon ve kulaklık düğmesinin yanındaki küçük ok: tıklanınca cihaz seçme menüsü açılır */
export function DeviceChevron({ kind, open, onToggle }: { kind: DeviceKind; open: boolean; onToggle: (r: DOMRect) => void }) {
  return (
    <button
      className={cx('up-chev', open && 'open')}
      aria-label={TEXT[kind].tip}
      title={TEXT[kind].tip}
      onClick={(e) => onToggle((e.currentTarget.parentElement || e.currentTarget).getBoundingClientRect())}
    >
      <ChevronDown size={13} strokeWidth={2.6} />
    </button>
  );
}

export function DeviceMenu({ kind, anchor, onClose }: { kind: DeviceKind; anchor: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = useStore((x) => x.settings);
  const devices = useAudioDevices();
  // dışarı tıklayınca / Esc ile kapanır; oklara tıklama oklar tarafından yönetilir
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (ref.current?.contains(el) || el.closest?.('.up-chev')) return;
      closeRef.current();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, []);
  const t = TEXT[kind];
  const cur = kind === 'mic' ? s.micId : s.speakerId;
  const vol = kind === 'mic' ? s.inputVolume : s.outputVolume;
  const all = devices.filter((d) => d.kind === t.kind);
  const def = all.find((d) => d.deviceId === 'default');
  const list = all.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
  // kayıtlı cihaz şu an takılı değilse varsayılan çalışıyor demektir
  const missing = cur !== 'default' && devices.length > 0 && !list.some((d) => d.deviceId === cur);
  const pick = (id: string) => updateSettings(kind === 'mic' ? { micId: id } : { speakerId: id });
  const setVol = (v: number) => updateSettings(kind === 'mic' ? { inputVolume: v } : { outputVolume: v });

  const [pos, setPos] = useState({ left: anchor.left, top: anchor.top, ready: false });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - r.width / 2, window.innerWidth - r.width - 8));
    const top = Math.max(8, anchor.top - r.height - 8);
    setPos({ left, top, ready: true });
  }, [anchor, devices.length]);

  const Icon = kind === 'mic' ? Mic : Headphones;
  return createPortal(
    <div
      ref={ref}
      className="ctx-menu dev-menu"
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="dev-head">
        <Icon size={14} />
        {t.title}
      </div>
      <button className="ctx-item dev-item" onClick={() => (pick('default'), onClose())}>
        <span className="dev-text">
          <span className="ctx-label">Windows varsayılanı</span>
          {def?.label && <span className="dev-sub">{stripDefault(def.label)}</span>}
        </span>
        <span className={cx('ctx-check', (cur === 'default' || missing) && 'on')}>{(cur === 'default' || missing) && <Check size={12} />}</span>
      </button>
      {list.map((d, i) => (
        <button key={d.deviceId} className="ctx-item dev-item" onClick={() => (pick(d.deviceId), onClose())}>
          <span className="dev-text">
            <span className="ctx-label">{d.label || `${t.fallback} ${i + 1}`}</span>
          </span>
          <span className={cx('ctx-check', cur === d.deviceId && 'on')}>{cur === d.deviceId && <Check size={12} />}</span>
        </button>
      ))}
      {devices.length > 0 && list.length === 0 && <div className="dev-empty">Başka {kind === 'mic' ? 'mikrofon' : 'çıkış aygıtı'} bulunamadı</div>}
      <div className="ctx-sep" />
      <div className="dev-vol">
        <div className="dev-vol-top">
          <span>{t.vol}</span>
          <b>%{vol}</b>
        </div>
        <input type="range" min={0} max={200} step={5} value={vol} onChange={(e) => setVol(Number(e.target.value))} aria-label={t.vol} />
      </div>
      <div className="ctx-sep" />
      <button className="ctx-item" onClick={() => (onClose(), openModal({ type: 'settings', tab: 'voice' }))}>
        <span className="ctx-ic">
          <Settings size={15} />
        </span>
        <span className="ctx-label">Ses ayarları</span>
      </button>
    </div>,
    document.body,
  );
}
