import React from 'react';
import { useStore, updateSettings, openModal, type Settings } from '../lib/store';
import { Toggle } from './Common';
import { cx } from '../lib/util';

const ACCENTS = ['#c8aa6e', '#0ac8b9', '#f5a524', '#fbbf24', '#3ecf8e', '#22d3ee', '#6cb6ff', '#a78bfa', '#c084fc', '#fb7185', '#f97316'];

export interface ThemeDef {
  id: Settings['theme'];
  label: string;
  sub: string;
  rail: string;
  side: string;
  chat: string;
  ink: string;
  /** temanın önerdiği vurgu rengi (hızlı seçicide birlikte uygulanır) */
  accent: string;
  /** destan: altın çerçeveli oyun havası; klasik: yumuşak yuvarlak paneller */
  family: 'destan' | 'klasik';
}

export const THEMES: ThemeDef[] = [
  { id: 'destan', label: 'Gece', sub: 'Gece mavisi ve altın', rail: '#0a1226', side: '#0f1a34', chat: '#0e1830', ink: '#f0e6d2', accent: '#c8aa6e', family: 'destan' },
  { id: 'kor', label: 'Kor', sub: 'Kömür ve bakır', rail: '#0b0706', side: '#140d0b', chat: '#19110e', ink: '#f3e4da', accent: '#e07a45', family: 'destan' },
  { id: 'buzul', label: 'Buzul', sub: 'Gece mavisi ve gümüş', rail: '#050a12', side: '#0a1320', chat: '#0d1828', ink: '#e6eef8', accent: '#8fc3ea', family: 'destan' },
  { id: 'zumrut', label: 'Zümrüt', sub: 'Orman ve yeşim', rail: '#040a08', side: '#09130f', chat: '#0c1813', ink: '#e4f1e8', accent: '#4fc490', family: 'destan' },
  { id: 'alaca', label: 'Alacakaranlık', sub: 'Mor ve gül altını', rail: '#08060f', side: '#110c1b', chat: '#161022', ink: '#efe6f6', accent: '#c38cf0', family: 'destan' },
  { id: 'dark', label: 'Amber', sub: 'Sıcak koyu', rail: '#0d0b08', side: '#17140f', chat: '#1d1a14', ink: '#efe9df', accent: '#f5a524', family: 'klasik' },
  { id: 'midnight', label: 'Siyah', sub: 'Saf siyah', rail: '#000000', side: '#09090a', chat: '#0f0f11', ink: '#ececf1', accent: '#6cb6ff', family: 'klasik' },
  { id: 'ocean', label: 'Okyanus', sub: 'Derin mavi', rail: '#060d14', side: '#0c1620', chat: '#111d29', ink: '#e3eef7', accent: '#22d3ee', family: 'klasik' },
  { id: 'forest', label: 'Orman', sub: 'Yosun yeşili', rail: '#070c08', side: '#0e1610', chat: '#131d15', ink: '#e4efe4', accent: '#3ecf8e', family: 'klasik' },
  { id: 'rose', label: 'Gül', sub: 'Mürdüm', rail: '#0f080c', side: '#1a0f15', chat: '#21141b', ink: '#f6e6ee', accent: '#fb7185', family: 'klasik' },
  { id: 'light', label: 'Krem', sub: 'Açık', rail: '#e7e1d6', side: '#f3efe7', chat: '#fbf9f4', ink: '#2a251d', accent: '#f5a524', family: 'klasik' },
];

export const DESTAN_FAMILY = THEMES.filter((t) => t.family === 'destan').map((t) => t.id);

/** Tema seç; vurgu rengi önceki temanın önerisiyle aynıysa (kullanıcı özel renk seçmediyse) yenisine geçer. */
export function pickTheme(t: ThemeDef, withAccent?: boolean) {
  const st = useStore.getState().settings;
  const prev = THEMES.find((x) => x.id === st.theme);
  const follow = withAccent ?? (!prev || prev.accent.toLowerCase() === st.accent.toLowerCase() || ACCENTS.includes(st.accent));
  updateSettings(follow ? { theme: t.id, accent: t.accent } : { theme: t.id });
}

function ThemeMock({ t, accent }: { t: ThemeDef; accent: string }) {
  return (
    <span className={cx('ap-mock', 'fam-' + t.family)} style={{ background: t.rail, ['--mk-a' as any]: accent }}>
      <i className="m-top" style={{ background: t.rail }}>
        <b style={{ background: accent }} />
        <b style={{ background: t.chat }} />
        <b style={{ background: t.chat }} />
      </i>
      <i className="m-side" style={{ background: t.side }} />
      <i className="m-chat" style={{ background: t.chat }}>
        <em style={{ background: t.ink, opacity: 0.5 }} />
        <em style={{ background: accent, opacity: 0.8 }} />
        <em style={{ background: t.ink, opacity: 0.3 }} />
      </i>
    </span>
  );
}

function ThemeGrid({ compact }: { compact?: boolean }) {
  const s = useStore((x) => x.settings);
  return (
    <>
      {(['destan', 'klasik'] as const).map((fam) => (
        <div key={fam} className="ap-fam">
          <div className="ap-fam-h">
            <b>{fam === 'destan' ? 'Xanaphian temaları' : 'Klasik temalar'}</b>
            <span>{fam === 'destan' ? 'xanaphian.com ile aynı renkler ve yazı tipleri' : 'Yumuşak köşeler, sade paneller'}</span>
          </div>
          <div className={cx('ap-themes', compact && 'compact')}>
            {THEMES.filter((t) => t.family === fam).map((t) => (
              <button key={t.id} className={cx('ap-theme', s.theme === t.id && 'on')} onClick={() => pickTheme(t)}>
                <ThemeMock t={t} accent={s.theme === t.id ? s.accent : t.accent} />
                <b>{t.label}</b>
                {!compact && <small>{t.sub}</small>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** Üst çubuktaki hızlı tema seçici */
export function ThemeQuick({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.settings);
  return (
    <>
      <div className="tq-scrim" onMouseDown={onClose} />
      <div className="tq">
        <div className="tq-h">
          <b>Renk teması</b>
          <button
            className="link"
            onClick={() => {
              onClose();
              openModal({ type: 'settings', tab: 'appearance' });
            }}
          >
            Tüm görünüm ayarları
          </button>
        </div>
        <ThemeGrid compact />
        <div className="ap-fam-h">
          <b>Vurgu rengi</b>
        </div>
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button key={c} className={cx('swatch', s.accent === c && 'on')} style={{ background: c }} onClick={() => updateSettings({ accent: c })} aria-label={c} />
          ))}
          <input type="color" value={s.accent} onChange={(e) => updateSettings({ accent: e.target.value })} className="color-input" title="Özel renk" />
        </div>
      </div>
    </>
  );
}

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
      <ThemeGrid />

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
            ['petek', 'Yumuşak', 'Her mesaj yumuşak bir balonda.'],
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
      <SwitchRow title="Arka plan dokusu" sub="Arka planda hafif bir ışık ve doku.">
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
