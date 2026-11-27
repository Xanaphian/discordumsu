// v1.68 telefon düzeninin küçük parçaları (yalnız telefonda çizilir)
import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useStore, updateSettings } from '../lib/store';
import { mobilListe } from '../lib/mobil';

/** İçeriğin sol üstünde: kanal listesine dön. Başka yerde okunmamış bahsetme varsa küçük bir sayı gösterir. */
export function MobilGeri() {
  const mentions = useStore((s) => Object.values(s.mentions || {}).reduce((a: number, b) => a + (Number(b) || 0), 0));
  return (
    <button className="mob-back" onClick={mobilListe} aria-label="Kanal listesine dön">
      <ChevronLeft size={24} />
      {mentions > 0 && <span className="mob-back-badge">{mentions > 99 ? '99+' : mentions}</span>}
    </button>
  );
}

/** Sağdan açılan üye listesinin arkasındaki karartı: basınca liste kapanır */
export function MobilPerde() {
  return <div className="mob-scrim" onClick={() => updateSettings({ membersOpen: false })} />;
}
