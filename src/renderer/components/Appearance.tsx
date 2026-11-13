import React from 'react';
import { useStore, updateSettings, type Settings } from '../lib/store';
import { Toggle } from './Common';
import { cx } from '../lib/util';

const ACCENTS = ['#f5a524', '#fbbf24', '#3ecf8e', '#22d3ee', '#6cb6ff', '#a78bfa', '#c084fc', '#fb7185', '#f97316'];

export const THEMES: { id: Settings['theme']; label: string; sub: string; rail: string; side: string; chat: string; ink: string }[] = [
  { id: 'dark', label: 'Bal', sub: 'Sıcak koyu', rail: '#0d0b08', side: '#17140f', chat: '#1d1a14', ink: '#efe9df' },
  { id: 'midnight', label: 'Gece', sub: 'Saf siyah', rail: '#000000', side: '#09090a', chat: '#0f0f11', ink: '#ececf1' },
  { id: 'ocean', label: 'Okyanus', sub: 'Derin mavi', rail: '#060d14', side: '#0c1620', chat: '#111d29', ink: '#e3eef7' },
  { id: 'forest', label: 'Orman', sub: 'Yosun yeşili', rail: '#070c08', side: '#0e1610', chat: '#131d15', ink: '#e4efe4' },
  { id: 'rose', label: 'Gül', sub: 'Mürdüm', rail: '#0f080c', side: '#1a0f15', chat: '#21141b', ink: '#f6e6ee' },
  { id: 'light', label: 'Krem', sub: 'Açık', rail: '#e7e1d6', side: '#f3efe7', chat: '#fbf9f4', ink: '#2a251d' },
];

function SwitchRow({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="pe-switch-row">
      <div>
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

export function AppearanceTab() {
  const s = useStore((x) => x.settings);
  return (
    <div className="ap">
      <h1>Görünüm</h1>
      <h3>Tema</h3>
      <div className="ap-themes">
        {THEMES.map((t) => (
          <button key={t.id} className={cx('ap-theme', s.theme === t.id && 'on')} onClick={() => updateSettings({ theme: t.id })}>
            <span className="ap-mock" style={{ background: t.rail }}>
              <i className="m-top" style={{ background: t.rail }}>
                <b style={{ background: s.accent }} />
                <b style={{ background: t.chat }} />
                <b style={{ background: t.chat }} />
              </i>
              <i className="m-side" style={{ background: t.side }} />
              <i className="m-chat" style={{ background: t.chat }}>
                <em style={{ background: t.ink, opacity: 0.5 }} />
                <em style={{ background: s.accent, opacity: 0.8 }} />
                <em style={{ background: t.ink, opacity: 0.3 }} />
              </i>
            </span>
            <b>{t.label}</b>
            <small>{t.sub}</small>
          </button>
        ))}
      </div>

      <h3>Vurgu rengi</h3>
      <div className="swatches big">
        {ACCENTS.map((c) => (
          <button key={c} className={cx('swatch', s.accent === c && 'on')} style={{ background: c }} onClick={() => updateSettings({ accent: c })} aria-label={c} />
        ))}
        <input type="color" value={s.accent} onChange={(e) => updateSettings({ accent: e.target.value })} className="color-input" title="Özel renk" />
      </div>

      <h3>Yerleşim</h3>
      <div className="ap-choices">
        {(
          [
            ['float', 'Yüzen paneller', 'Paneller arasında boşluk, yuvarlak köşeler.'],
            ['flush', 'Bitişik', 'Paneller kenar kenara, daha fazla alan.'],
          ] as const
        ).map(([id, t, sub]) => (
          <button key={id} className={cx('ap-choice', s.layout === id && 'on')} onClick={() => updateSettings({ layout: id })}>
            <span className={cx('ap-lay', 'lay-' + id)}>
              <i />
              <i />
              <i />
            </span>
            <b>{t}</b>
            <small>{sub}</small>
          </button>
        ))}
      </div>

      <h3>Mesaj stili</h3>
      <div className="ap-choices three">
        {(
          [
            ['petek', 'Petek', 'Her mesaj yumuşak bir balonda.'],
            ['balon', 'Balon', 'Seninkiler sağda, sohbet uygulaması gibi.'],
            ['duz', 'Düz', 'Balonsuz, yoğun liste.'],
          ] as const
        ).map(([id, t, sub]) => (
          <button key={id} className={cx('ap-choice', s.msgStyle === id && 'on')} onClick={() => updateSettings({ msgStyle: id })}>
            <span className={cx('ap-msgs', 'ms-' + id)}>
              <i className="o" />
              <i className="o short" />
              <i className="m" />
            </span>
            <b>{t}</b>
            <small>{sub}</small>
          </button>
        ))}
      </div>

      <h3>Yazı boyutu: {s.fontSize}px</h3>
      <input type="range" min={12} max={20} step={1} value={s.fontSize} onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })} />
      <div className="divider" />
      <SwitchRow title="Petek dokusu" sub="Arka planda hafif bir altıgen desen.">
        <Toggle value={s.backdrop} onChange={(v) => updateSettings({ backdrop: v })} />
      </SwitchRow>
      <SwitchRow title="Sıkışık mod" sub="Mesajlar arasında daha az boşluk, avatarlar gizli.">
        <Toggle value={s.compact} onChange={(v) => updateSettings({ compact: v })} />
      </SwitchRow>
      <SwitchRow title="Hareketi azalt" sub="Animasyonları, profil efektlerini ve geçişleri en aza indirir.">
        <Toggle value={s.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
      </SwitchRow>
    </div>
  );
}
