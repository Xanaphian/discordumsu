import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, PopoutRoot } from './App';
import { IS_POPOUT } from './lib/popout';
import { HataSiniri } from './components/HataSiniri';
import './lib/yayinci';
import './lib/gorunurluk';
import { boot } from './lib/store';
import './lib/activity';
import { hataDinle } from './lib/hata';
import './styles/app.css';
import './styles/kaydirma.css';
import './styles/admin.css';
import './styles/kovan.css';
import './styles/profile.css';
import './styles/rooms.css';
import './styles/destan.css';
import './styles/social.css';
import './styles/xanaphian.css';
import './styles/temalar.css';
import './styles/sunucu-profili.css';
import './styles/etkinlik.css';
import './styles/marka.css';
import './styles/performans.css';
import './styles/duzeltmeler.css';
import './styles/medya.css';
import './styles/farklar.css';
import './styles/root-ozellikleri.css';
import './styles/tam-profil.css';
import './styles/oda-resmi.css';
import './styles/sag-tik.css';
import './styles/ses-cihazi.css';
import './styles/oda-3d.css';
import './styles/gurultu.css';
import './styles/ana-sayfa.css';
import './styles/yazi-tipi.css';
import './styles/kirpma.css';
import './styles/ses-duzeni.css';
import './styles/okunaklilik.css';
import './styles/ust-cubuk.css';
import './styles/paylasim.css';
import './styles/etiket.css';
import './styles/kucuk-ekler.css';
import './styles/davet.css';
import './styles/klavye.css';
import './styles/davet-baglantisi.css';

hataDinle();

// Bağlantı ve ayarlar hemen başlasın; yazı tiplerini beklemek yalnız ilk çizimi bekletir.
const booting = boot().catch((e) => console.error('Açılış hatası', e));

// Yazı tipleri yüklenmeden çizersek mesaj yükseklikleri sonradan değişir ve liste en altta kalmaz.
// Yalnız gerçekten kullanılan yazı tipleri (her yazı Rubik) beklenir.
const fontsReady = Promise.race([
  Promise.all(['400 14px "Rubik"', '500 14px "Rubik"', '700 14px "Rubik"'].map((f) => document.fonts.load(f, 'aşğıİç'))),
  new Promise((r) => setTimeout(r, 1200)),
]).catch(() => {});

// v1.63.0: ilk çizim ekrana gelince ana süreç açılış ekranını kapatıp pencereyi gösterir
function IlkCizim() {
  React.useEffect(() => {
    if (IS_POPOUT) return;
    booting.then(() => requestAnimationFrame(() => window.kovan.acilisHazir?.()));
  }, []);
  return null;
}

fontsReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <HataSiniri name="uygulama" full>
      {IS_POPOUT ? <PopoutRoot /> : <App />}
      <IlkCizim />
    </HataSiniri>,
  );
  return booting;
});
