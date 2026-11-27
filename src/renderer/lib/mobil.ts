// v1.68 telefon düzeni: dar ekranda ya kanal listesi ya da içerik (sohbet, ses odası…) görünür.
// Masaüstünde hiçbir etkisi yok (IS_MOBILE false).
import { create } from 'zustand';

export const IS_MOBILE = typeof window !== 'undefined' && !!window.kovan?.mobile;

export const useMobil = create<{ panel: 'liste' | 'icerik' }>(() => ({ panel: 'liste' }));

/** Bir kanal / özel mesaj / Ana Sayfa sekmesi açıldı: içeriği göster */
export const mobilIcerik = () => void (IS_MOBILE && useMobil.getState().panel !== 'icerik' && useMobil.setState({ panel: 'icerik' }));
/** Kanal listesine dön */
export const mobilListe = () => void (IS_MOBILE && useMobil.getState().panel !== 'liste' && useMobil.setState({ panel: 'liste' }));
