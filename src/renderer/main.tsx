import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, PopoutRoot } from './App';
import { IS_POPOUT } from './lib/popout';
import './lib/yayinci';
import { boot } from './lib/store';
import './lib/activity';
import './styles/app.css';
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

// Bağlantı ve ayarlar hemen başlasın; yazı tiplerini beklemek yalnız ilk çizimi bekletir.
const booting = boot().catch((e) => console.error('Açılış hatası', e));

// Yazı tipleri yüklenmeden çizersek mesaj yükseklikleri sonradan değişir ve liste en altta kalmaz.
// Yalnız gerçekten kullanılan yazı tipleri (metin: Source Sans 3, başlık: Marcellus) beklenir.
const fontsReady = Promise.race([
  Promise.all(['400 14px "Source Sans 3"', '700 14px "Source Sans 3"', '400 16px "Marcellus"'].map((f) => document.fonts.load(f, 'aşğıİç'))),
  new Promise((r) => setTimeout(r, 1200)),
]).catch(() => {});

fontsReady.then(() => {
  createRoot(document.getElementById('root')!).render(IS_POPOUT ? <PopoutRoot /> : <App />);
  return booting;
});
