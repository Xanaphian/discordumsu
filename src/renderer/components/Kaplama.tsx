// v1.27 Ayarlar → Oyun İçi Kaplama
import React from 'react';
import { MicOff, Gamepad2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { useActs } from '../lib/activity';
import { useOverlay, setOverlay, type Corner } from '../lib/overlay';
import { cx } from '../lib/util';
import { Toggle } from './Common';
import { Row } from './Settings';
import '../styles/topluluk-araclari.css';

const SHORTCUTS = ['Shift+F1', 'Shift+F2', 'Ctrl+Shift+O', 'Alt+Z', 'F10', ''];

function Preview({ corner, opacity }: { corner: Corner; opacity: number }) {
  const me = useStore((s) => s.me);
  return (
    <div className="kp-screen" aria-hidden>
      <div className="kp-sky" />
      <div className="kp-hud">
        <span />
        <span />
        <span />
      </div>
      <div className={cx('kp-ovl', 'c-' + corner)} style={{ opacity: opacity / 100 }}>
        <div className="kp-card">
          <div className="kp-head">
            <i /> <b>Lobi</b>
          </div>
          <div className="kp-row talk">
            <span className="kp-face" style={{ background: me.color }} />
            {me.name || 'Sen'}
          </div>
          <div className="kp-row">
            <span className="kp-face" style={{ background: '#6aa9ff' }} />
            Arkadaşın
            <MicOff size={9} />
          </div>
        </div>
        <div className="kp-card kp-msg">
          <b>Arkadaşın</b> hadi bir el daha?
        </div>
      </div>
    </div>
  );
}

export function OverlayTab() {
  const { s, hidden } = useOverlay();
  const game = useActs((a) => a.detected?.game?.name || null);
  const supported = useActs((a) => a.detected?.supported);
  const actShare = useStore((x) => x.settings.actShare);
  const corners: [Corner, string][] = [
    ['tl', 'Sol üst'],
    ['tr', 'Sağ üst'],
    ['bl', 'Sol alt'],
    ['br', 'Sağ alt'],
  ];
  return (
    <>
      <h1>Oyun İçi Kaplama</h1>
      <p className="note">
        Oyundayken ekranın köşesinde sesli kanaldakiler (konuşan yeşil yanar) ve gelen mesajlar görünür. Kaplama tıklamaları geçirir, oyunu
        engellemez.
      </p>
      <div className="kp-top">
        <Preview corner={s.corner} opacity={s.opacity} />
        <div className="kp-status">
          <div className={cx('kp-state', s.mode !== 'off' && (s.mode === 'always' || game) && !hidden && 'on')}>
            <Gamepad2 size={15} />
            {s.mode === 'off'
              ? 'Kaplama kapalı'
              : hidden
                ? `Kısayolla gizlendi (${s.shortcut || 'kısayol yok'})`
                : s.mode === 'always'
                  ? 'Kaplama şu an açık'
                  : game
                    ? `${game} açık, kaplama görünüyor`
                    : 'Oyun açılınca görünecek'}
          </div>
          {s.mode === 'game' && (!actShare || supported === false) && (
            <p className="note warn">
              Oyunu tanımak için etkinlik algılama gerekir. Ayarlar → Etkinlik'te "Etkinliğimi paylaş" açık olmalı (oyun adını başkalarına göstermek
              istemiyorsan oyun paylaşımını orada ayrıca kapatabilirsin).
            </p>
          )}
        </div>
      </div>

      <h3>Ne zaman görünsün</h3>
      <div className="radio-list">
        {(
          [
            ['game', 'Oyun açıkken', 'Etkinlikte tanınan bir oyun çalışırken kendiliğinden açılır.'],
            ['always', 'Her zaman', 'Oyun olmasa da masaüstünde durur. Yayın yaparken işe yarar.'],
            ['off', 'Kapalı', 'Kaplama hiç gösterilmez.'],
          ] as const
        ).map(([id, t, sub]) => (
          <button key={id} className={cx('radio-opt', s.mode === id && 'on')} onClick={() => setOverlay({ mode: id })}>
            <span className="radio" />
            <div>
              <b>{t}</b>
              <span>{sub}</span>
            </div>
          </button>
        ))}
      </div>

      <h3>Konum ve görünüş</h3>
      <Row title="Köşe" sub="Kaplamanın duracağı köşe (ana ekran).">
        <div className="kp-corners">
          {corners.map(([id, label]) => (
            <button key={id} className={cx('kp-corner', 'c-' + id, s.corner === id && 'on')} onClick={() => setOverlay({ corner: id })} title={label} aria-label={label}>
              <i />
            </button>
          ))}
        </div>
      </Row>
      <Row title="Görünürlük" sub="Düşük değer kaplamayı daha saydam yapar, oyunu daha az kapatır.">
        <div className="num-ctl">
          <input type="range" min={30} max={100} step={5} value={s.opacity} onChange={(e) => setOverlay({ opacity: Number(e.target.value) })} />
          <b>%{s.opacity}</b>
        </div>
      </Row>
      <Row title="Boyut" sub="Yüksek çözünürlükte büyütmek okumayı kolaylaştırır.">
        <div className="num-ctl">
          <input type="range" min={80} max={130} step={10} value={s.scale} onChange={(e) => setOverlay({ scale: Number(e.target.value) })} />
          <b>%{s.scale}</b>
        </div>
      </Row>

      <h3>İçerik</h3>
      <Row title="Sesli kanaldakiler" sub="Bağlı olduğun ses kanalındaki kişiler, kim konuşuyor, kim susturulmuş.">
        <Toggle value={s.voice} onChange={(v) => setOverlay({ voice: v })} />
      </Row>
      <Row title="Yalnız konuşanları göster" sub="Kalabalık kanallarda listeyi kısa tutar.">
        <Toggle value={s.onlySpeaking} disabled={!s.voice} onChange={(v) => setOverlay({ onlySpeaking: v })} />
      </Row>
      <Row title="Gelen mesajlar" sub="Bildirim alacağın mesajlar köşede 7 saniye görünür. Bildirim ayarlarına ve Rahatsız Etmeyin'e uyar.">
        <Toggle value={s.msgs} onChange={(v) => setOverlay({ msgs: v })} />
      </Row>
      <Row title="Yalnız bahsedilmeler ve özel mesajlar" sub="Oyunun ortasında yalnız sana yazılanlar çıksın.">
        <Toggle value={s.msgsMentions} disabled={!s.msgs} onChange={(v) => setOverlay({ msgsMentions: v })} />
      </Row>

      <h3>Kısayol</h3>
      <Row title="Kaplamayı gizle / göster" sub="Oyundayken bu tuşla kaplamayı anlık kapatıp açarsın.">
        <select className="mini-select" value={s.shortcut} onChange={(e) => setOverlay({ shortcut: e.target.value })}>
          {SHORTCUTS.map((k) => (
            <option key={k} value={k}>
              {k || 'Kısayol yok'}
            </option>
          ))}
        </select>
      </Row>
      <p className="note">
        Not: Oyunun görüntü ayarında <b>kenarlıksız pencere</b> (borderless) ya da pencereli kip seçili olmalı. "Özel tam ekran" (exclusive
        fullscreen) kipinde Windows başka hiçbir pencereyi oyunun üstüne çizdirmez.
      </p>
    </>
  );
}
