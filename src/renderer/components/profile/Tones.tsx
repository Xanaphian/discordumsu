// Profil renkleri: kartın üst / alt rengi ve vurgu rengi, ton ton ayarlanır (renk özü, doygunluk, açıklık + ton şeridi).
import React, { useEffect, useState } from 'react';
import { Pipette, Wand2 } from 'lucide-react';
import { cx } from '../../lib/util';

export type Theme = { a: string; b: string; c?: string };

// ---------------- renk dönüşümleri ----------------
export function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

/** Aynı renk özünden açıktan koyuya 9 ton */
export function shades(hex: string): string[] {
  const [h, s] = hexToHsl(hex);
  return [92, 82, 70, 58, 46, 34, 24, 15, 8].map((l) => hslToHex(h, Math.max(s, 18), l));
}

/** Hazır ton çiftleri (xanaphian.com temalarıyla uyumlu) */
export const TONE_PRESETS: { name: string; t: Theme }[] = [
  { name: 'Gece', t: { a: '#15223f', b: '#0a1226', c: '#c8aa6e' } },
  { name: 'Altın', t: { a: '#3a2c12', b: '#140f06', c: '#e6c47e' } },
  { name: 'Bordo', t: { a: '#4a1420', b: '#1c070c', c: '#d6a86e' } },
  { name: 'Koyu yeşil', t: { a: '#163a2a', b: '#08170f', c: '#c8b06a' } },
  { name: 'Turkuaz', t: { a: '#0c3a40', b: '#06161a', c: '#0ac8b9' } },
  { name: 'Mor', t: { a: '#2e1a4f', b: '#110a1f', c: '#b69cff' } },
  { name: 'Kömür', t: { a: '#26272b', b: '#0d0d0f', c: '#c9ccd6' } },
  { name: 'Toz pembe', t: { a: '#f4dde4', b: '#e8c3cf', c: '#b0446a' } },
  { name: 'Arşiv kâğıdı', t: { a: '#f3ead6', b: '#e3d4b2', c: '#6f5318' } },
  { name: 'Bej', t: { a: '#ead9bd', b: '#d2b98f', c: '#7a5a1e' } },
  { name: 'Gökyüzü', t: { a: '#dbeaf7', b: '#b7d0ea', c: '#2563a8' } },
  { name: 'Lav', t: { a: '#4a170b', b: '#170704', c: '#ff8a4c' } },
];

function Slider({ label, value, min, max, onChange, track }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; track: string }) {
  return (
    <label className="tone-sl">
      <span>
        {label}
        <em>{value}</em>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--track' as any]: track }} />
    </label>
  );
}

/** Tek bir rengin ton ton ayarı */
export function ToneSlider({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const [hsl, setHsl] = useState(() => hexToHsl(value));
  const [hex, setHex] = useState(value);
  // dışarıdan gelen değişiklik (hazır ton) -> kaydırıcıları eşitle
  useEffect(() => {
    if (hslToHex(...hsl) !== value.toLowerCase()) setHsl(hexToHsl(value));
    setHex(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const [h, s, l] = hsl;
  const put = (nh: number, ns: number, nl: number) => {
    setHsl([nh, ns, nl]);
    onChange(hslToHex(nh, ns, nl));
  };
  return (
    <div className="tone-box">
      <div className="tone-top">
        <span className="tone-sw big" style={{ background: value }} />
        <div className="tone-title">
          <b>{label}</b>
          {hint && <small>{hint}</small>}
        </div>
        <input
          className="tone-hex"
          value={hex}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
            setHex(v);
            if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase());
          }}
        />
        <label className="icon-btn sm tone-pick" title="Renk seçici">
          <Pipette size={15} />
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
      <Slider
        label="Renk"
        value={h}
        min={0}
        max={359}
        onChange={(v) => put(v, s, l)}
        track={`linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((x) => hslToHex(x % 360, Math.max(s, 35), Math.min(Math.max(l, 35), 65))).join(',')})`}
      />
      <Slider label="Doygunluk" value={s} min={0} max={100} onChange={(v) => put(h, v, l)} track={`linear-gradient(90deg, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})`} />
      <Slider label="Açıklık" value={l} min={3} max={97} onChange={(v) => put(h, s, v)} track={`linear-gradient(90deg, ${hslToHex(h, s, 3)}, ${hslToHex(h, s, 50)}, ${hslToHex(h, s, 97)})`} />
      <div className="tone-strip" role="group" aria-label="Tonlar">
        {shades(value).map((c) => (
          <button key={c} className={cx('tone-sw', c === value.toLowerCase() && 'on')} style={{ background: c }} title={c} onClick={() => onChange(c)} />
        ))}
      </div>
    </div>
  );
}

/** Profil renkleri düzenleyicisi */
export function ToneEditor({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <div className="tone-ed">
      <div className="field">
        <span>Hazır tonlar</span>
        <div className="tone-presets">
          {TONE_PRESETS.map((p) => {
            const on = p.t.a === value.a && p.t.b === value.b;
            return (
              <button key={p.name} className={cx('tone-preset', on && 'on')} onClick={() => onChange({ ...p.t })} title={p.name}>
                <span style={{ background: `linear-gradient(160deg, ${p.t.a}, ${p.t.b})` }}>
                  <i style={{ background: p.t.c }} />
                </span>
                {p.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="tone-grid">
        <ToneSlider label="Üst renk" hint="Kartın üst kısmı" value={value.a} onChange={(a) => onChange({ ...value, a })} />
        <ToneSlider label="Alt renk" hint="Aşağı doğru geçiş yapar" value={value.b} onChange={(b) => onChange({ ...value, b })} />
        <ToneSlider label="Vurgu" hint="Başlıklar, sekmeler ve düğmeler" value={value.c || '#c8aa6e'} onChange={(c) => onChange({ ...value, c })} />
      </div>
      <div className="pe-inline">
        <button
          className="btn ghost sm"
          onClick={() => {
            const [h, s, l] = hexToHsl(value.a);
            onChange({ ...value, b: hslToHex(h, Math.min(100, s + 4), l > 55 ? Math.max(l - 14, 8) : Math.max(l - 12, 4)) });
          }}
        >
          <Wand2 size={14} /> Alt rengi üstle uyumla
        </button>
        <button
          className="btn ghost sm"
          onClick={() => {
            const [h, s, l] = hexToHsl(value.a);
            onChange({ ...value, c: hslToHex(h, Math.max(s, 55), l > 55 ? 32 : 72) });
          }}
        >
          <Wand2 size={14} /> Vurguyu üstle uyumla
        </button>
      </div>
    </div>
  );
}
