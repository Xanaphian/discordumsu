import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { boot } from './lib/store';
import './styles/app.css';
import './styles/kovan.css';
import './styles/profile.css';

// Yazı tipleri yüklenmeden çizersek mesaj yükseklikleri sonradan değişir ve liste en altta kalmaz.
const fontsReady = Promise.race([
  Promise.all(['400 14px "Manrope Variable"', '700 14px "Manrope Variable"', '700 16px "Bricolage Grotesque Variable"'].map((f) => document.fonts.load(f, 'aşğıİç'))),
  new Promise((r) => setTimeout(r, 1200)),
]).catch(() => {});

fontsReady.then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
  boot().catch((e) => console.error('Açılış hatası', e));
});
