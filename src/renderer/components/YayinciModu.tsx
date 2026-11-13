// v1.26 Yayıncı modu ayarları, üst çubuktaki işaret ve özel mesaj gizliliği bölümü
import React from 'react';
import { Radio, ShieldCheck } from 'lucide-react';
import { useStore, updateSettings, sendAll, type Settings } from '../lib/store';
import { useStreamer } from '../lib/yayinci';
import { Toggle, Tooltip } from './Common';
import { Row } from './Settings';
import { cx } from '../lib/util';

export function StreamerTab() {
  const s = useStore((x) => x.settings);
  const { obs, active } = useStreamer();
  const modes: [Settings['streamerMode'], string, string][] = [
    ['auto', 'OBS açılınca kendiliğinden', 'OBS, Streamlabs, XSplit, PRISM ya da Twitch Studio açılınca devreye girer, kapanınca kapanır.'],
    ['on', 'Her zaman açık', 'Yayın programı açık olmasa da gizleme sürer.'],
    ['off', 'Kapalı', 'Hiçbir şey gizlenmez.'],
  ];
  return (
    <>
      <h1>Yayıncı modu</h1>
      <div className={cx('sm-status', active && 'on')}>
        <Radio size={18} />
        <div>
          <b>{active ? 'Yayıncı modu açık' : 'Yayıncı modu kapalı'}</b>
          <span>{obs ? 'Bir yayın programı açık görünüyor.' : s.streamerMode === 'auto' ? 'Yayın programı açılınca kendiliğinden açılacak.' : 'Yayın programı algılanmadı.'}</span>
        </div>
      </div>
      <h3>Ne zaman açılsın?</h3>
      <div className="radio-list">
        {modes.map(([id, t, sub]) => (
          <button key={id} className={cx('radio-opt', s.streamerMode === id && 'on')} onClick={() => updateSettings({ streamerMode: id })}>
            <span className="radio" />
            <div>
              <b>{t}</b>
              <span>{sub}</span>
            </div>
          </button>
        ))}
      </div>
      <h3>Açıkken neler gizlensin?</h3>
      <Row title="Bildirimleri gösterme" sub="Masaüstü bildirimleri hiç çıkmaz; yayında mesaj içeriği görünmez.">
        <Toggle value={s.streamerHideNotifs} onChange={(v) => updateSettings({ streamerHideNotifs: v })} />
      </Row>
      <Row title="Davet kodlarını gizle" sub="Davet pencerelerindeki ve topluluk ayarlarındaki kodlar kapatılır. Kopyala düğmesi çalışmaya devam eder.">
        <Toggle value={s.streamerHideInvites} onChange={(v) => updateSettings({ streamerHideInvites: v })} />
      </Row>
      <Row title="Kişisel bilgileri gizle" sub="Arkadaş kodun, sunucu ve ağ adreslerin, kimlik numaraların ve bağlı hesapların görünmez.">
        <Toggle value={s.streamerHidePersonal} onChange={(v) => updateSettings({ streamerHidePersonal: v })} />
      </Row>
      <Row title="Sesleri kapat" sub="Mesaj ve bahsetme sesleri çalmaz.">
        <Toggle value={s.streamerMuteSounds} onChange={(v) => updateSettings({ streamerMuteSounds: v })} />
      </Row>
    </>
  );
}

/** Üst çubukta: yayıncı modu açıkken küçük işaret; tıklayınca ayarı açar */
export function StreamerBadge({ onOpen }: { onOpen: () => void }) {
  const active = useStreamer((s) => s.active);
  const obs = useStreamer((s) => s.obs);
  if (!active) return null;
  return (
    <Tooltip text={obs ? 'Yayın programı açık: bildirimler ve kişisel bilgiler gizleniyor' : 'Bildirimler ve kişisel bilgiler gizleniyor'} side="bottom">
      <button className="sm-badge" onClick={onOpen}>
        <span className="sm-dot" /> Yayıncı modu
      </button>
    </Tooltip>
  );
}

/** Gizlilik sekmesindeki bölüm: kimler özel mesaj gönderebilir */
export function DmPrivacySection() {
  const v = useStore((x) => x.settings.dmPrivacy);
  const set = (dms: Settings['dmPrivacy']) => {
    updateSettings({ dmPrivacy: dms });
    sendAll({ t: 'privacy', dms });
  };
  const opts: [Settings['dmPrivacy'], string, string][] = [
    ['all', 'Herkes', 'Ortak bir topluluğunuz olan herkes sana yeni özel mesaj yazabilir.'],
    ['friends', 'Yalnızca arkadaşlarım', 'Arkadaşın olmayanlar sana yeni mesaj gönderemez; önce arkadaşlık isteği atmaları gerekir. Eski yazışmaların silinmez.'],
  ];
  return (
    <>
      <h3>
        <ShieldCheck size={15} className="h3-icon" /> Kimler sana özel mesaj gönderebilir?
      </h3>
      <div className="radio-list">
        {opts.map(([id, t, sub]) => (
          <button key={id} className={cx('radio-opt', v === id && 'on')} onClick={() => set(id)}>
            <span className="radio" />
            <div>
              <b>{t}</b>
              <span>{sub}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
