import React from 'react';
import { useStore, updateSettings, openModal, type Settings } from '../lib/store';
import { Toggle } from './Common';
import { Check } from 'lucide-react';
import { cx } from '../lib/util';

const ACCENTS = ['#c8aa6e', '#0ac8b9', '#d6a86e', '#c8b06a', '#c9ccd6', '#b0446a', '#7a5a1e', '#6f5318', '#6cb6ff', '#c084fc', '#fb7185'];

export interface ThemeDef {
  id: Settings['theme'];
  label: string;
  sub: string;
  /** zemin, yüzey, vurgu (sitedeki tema seçicinin üç rengi) */
  rail: string;
  side: string;
  chat: string;
  ink: string;
  /** temanın vurgu rengi (sitedeki --gold) */
  accent: string;
  light: boolean;
}

/** xanaphian.com'daki temaların birebir aynısı (ad, sıra ve renkler) */
export const THEMES: ThemeDef[] = [
  { id: 'destan', label: 'Gece', sub: 'gece mavisi · altın', rail: '#0a1226', side: '#15223f', chat: '#0e1830', ink: '#f0e6d2', accent: '#c8aa6e', light: false },
  { id: 'kagit', label: 'Arşiv Kâğıdı', sub: 'aydınlık · krem', rail: '#f4efe4', side: '#e2d9c6', chat: '#fbf7ee', ink: '#1d1813', accent: '#6f5318', light: true },
  { id: 'tozpembe', label: 'Toz Pembe', sub: 'pudra · gül kurusu', rail: '#faf0f1', side: '#ecd8dc', chat: '#fff2f5', ink: '#33191f', accent: '#b0446a', light: true },
  { id: 'siyah', label: 'Siyah', sub: 'saf siyah · gümüş', rail: '#000000', side: '#0e0e10', chat: '#0a0a0c', ink: '#f2f3f6', accent: '#c9ccd6', light: false },
  { id: 'bej', label: 'Bej', sub: 'keten · bronz', rail: '#f2ebdb', side: '#ded2b8', chat: '#f6efdf', ink: '#20190f', accent: '#7a5a1e', light: true },
  { id: 'bordo', label: 'Bordo', sub: 'şarap · eski altın', rail: '#1a0508', side: '#311015', chat: '#240a0e', ink: '#f8ecdf', accent: '#d6a86e', light: false },
  { id: 'koyuyesil', label: 'Koyu Yeşil', sub: 'orman · pirinç', rail: '#04120c', side: '#0c2619', chat: '#071b12', ink: '#eef6e8', accent: '#c8b06a', light: false },
];

export const DESTAN_FAMILY = THEMES.map((t) => t.id) as string[];

/** Tema seç; vurgu rengi önceki temanın rengiyse (kullanıcı özel renk seçmediyse) yenisine geçer. */
export function pickTheme(t: ThemeDef, withAccent?: boolean) {
  const st = useStore.getState().settings;
  const prev = THEMES.find((x) => x.id === st.theme);
  const follow = withAccent ?? (!prev || prev.accent.toLowerCase() === st.accent.toLowerCase() || THEMES.some((x) => x.accent.toLowerCase() === st.accent.toLowerCase()));
  updateSettings(follow ? { theme: t.id, accent: t.accent } : { theme: t.id });
}

/** Sitedeki tema seçicinin satırı: üç renk, ad, büyük harfli alt yazı, seçiliyse tik */
function ThemeList({ grid }: { grid?: boolean }) {
  const theme = useStore((x) => x.settings.theme);
  return (
    <div className={cx('tm-list', grid && 'grid')}>
      {THEMES.map((t) => (
        <button key={t.id} className={cx('tm-row', theme === t.id && 'on')} onClick={() => pickTheme(t, true)}>
          <span className="tm-sw" aria-hidden>
            <i style={{ background: t.rail }} />
            <i style={{ background: t.side }} />
            <i style={{ background: t.accent }} />
          </span>
          <span className="tm-txt">
            <b>{t.label}</b>
            <small>{t.sub}</small>
          </span>
          {theme === t.id && <Check size={16} className="tm-ok" />}
        </button>
      ))}
    </div>
  );
}

/** Üst çubuktaki hızlı tema seçici */
export function ThemeQuick({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="tq-scrim" onMouseDown={onClose} />
      <div className="tq">
        <div className="tq-h">
          <b>Temalar</b>
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
        <ThemeList />
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
      <p className="ap-note">xanaphian.com'daki temaların aynısı; renkler, zemin ve dokular siteyle birebir.</p>
      <ThemeList grid />

      <h3>Vurgu rengi</h3>
      <p className="ap-note">Tema seçince temanın kendi rengine döner.</p>
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
            ['float', 'Yüzen paneller', 'Paneller arasında boşluk.'],
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
