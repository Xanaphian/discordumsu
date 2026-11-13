// Takım kur: oyun şablonları. Her oyunun kendi yerleri (rol/koridor), kipleri ve kart renkleri var.
// Logolar brands.ts'teki Simple Icons yollarından gelir (oyun görseli/çizimi kullanılmaz).

export interface LfgMode {
  name: string;
  /** bu kipte kaç kişi (yoksa oyunun yer sayısı) */
  size?: number;
}
export interface LfgGame {
  key: string;
  name: string;
  /** brands.ts anahtarı */
  brand?: string;
  /** yer adları; boş dizi = adsız yerler (kişi sayısı) */
  slots: string[];
  /** adsız yerlerde varsayılan kişi sayısı */
  size?: number;
  modes: LfgMode[];
  /** kart rengi: vurgu, ikinci renk, zemin */
  theme: { a: string; b: string; bg: string; ink?: string };
  /** yer başlığı ("Koridor", "Rol", "Oyuncu") */
  slotWord: string;
}

export const LFG_GAMES: LfgGame[] = [
  {
    key: 'lol',
    name: 'League of Legends',
    brand: 'leagueoflegends',
    slots: ['Üst', 'Orman', 'Orta', 'Alt', 'Destek'],
    modes: [{ name: 'Dereceli Tekli/Çiftli', size: 2 }, { name: 'Dereceli Esnek' }, { name: 'Normal' }, { name: 'ARAM' }, { name: 'Arena', size: 2 }],
    theme: { a: '#c8aa6e', b: '#0ac8b9', bg: 'linear-gradient(135deg, #0a1428 0%, #091c2a 60%, #0c2230 100%)', ink: '#0a1428' },
    slotWord: 'Koridor',
  },
  {
    key: 'valorant',
    name: 'Valorant',
    brand: 'valorant',
    slots: ['Entry', 'Gözcü', 'Kontrol', 'Öncü', 'Esnek'],
    modes: [{ name: 'Rekabetçi' }, { name: 'Derecesiz' }, { name: 'Premier' }, { name: 'Spike Rush' }, { name: 'Tam Takım', size: 5 }],
    theme: { a: '#ff4655', b: '#ece8e1', bg: 'linear-gradient(135deg, #0f1923 0%, #1b1f27 55%, #2a1218 100%)', ink: '#ffffff' },
    slotWord: 'Rol',
  },
  {
    key: 'fortnite',
    name: 'Fortnite',
    brand: 'fortnite',
    slots: [],
    size: 4,
    modes: [{ name: 'Dörtlü', size: 4 }, { name: 'Üçlü', size: 3 }, { name: 'İkili', size: 2 }, { name: 'Dereceli Dörtlü', size: 4 }, { name: 'Sıfır İnşa Dörtlü', size: 4 }],
    theme: { a: '#3fb2f5', b: '#f7d23e', bg: 'linear-gradient(135deg, #10204a 0%, #1a3d8a 60%, #3a2a7a 100%)', ink: '#08142e' },
    slotWord: 'Oyuncu',
  },
  {
    key: 'cs2',
    name: 'Counter-Strike 2',
    brand: 'counterstrike',
    slots: ['Entry', 'AWP', 'Destek', 'Lurker', 'Lider'],
    modes: [{ name: 'Premier' }, { name: 'Rekabetçi' }, { name: 'Wingman', size: 2 }, { name: 'FACEIT' }],
    theme: { a: '#de9b35', b: '#5d79ae', bg: 'linear-gradient(135deg, #12161d 0%, #1c222c 60%, #2a2116 100%)', ink: '#14100a' },
    slotWord: 'Rol',
  },
  {
    key: 'dota2',
    name: 'Dota 2',
    brand: 'dota2',
    slots: ['Taşıyıcı', 'Orta', 'Offlane', 'Destek 4', 'Destek 5'],
    modes: [{ name: 'Dereceli' }, { name: 'Normal' }, { name: 'Turbo' }],
    theme: { a: '#e3482c', b: '#c9b27a', bg: 'linear-gradient(135deg, #140b0a 0%, #1d1110 60%, #2a120c 100%)', ink: '#ffffff' },
    slotWord: 'Pozisyon',
  },
  {
    key: 'thefinals',
    name: 'THE FINALS',
    brand: 'thefinals',
    slots: ['Hafif', 'Orta', 'Ağır'],
    modes: [{ name: 'Dereceli' }, { name: 'Hızlı Para' }, { name: 'Bank It' }],
    theme: { a: '#d31f3c', b: '#f2f2f2', bg: 'linear-gradient(135deg, #141414 0%, #1e1e1e 60%, #2a1014 100%)', ink: '#ffffff' },
    slotWord: 'Sınıf',
  },
  {
    key: 'pubg',
    name: 'PUBG',
    brand: 'pubg',
    slots: [],
    size: 4,
    modes: [{ name: 'Dörtlü', size: 4 }, { name: 'İkili', size: 2 }, { name: 'Dereceli', size: 4 }],
    theme: { a: '#f2a900', b: '#e8e2d0', bg: 'linear-gradient(135deg, #17150f 0%, #24201a 60%, #2c2412 100%)', ink: '#111111' },
    slotWord: 'Oyuncu',
  },
  {
    key: 'roblox',
    name: 'Roblox',
    brand: 'roblox',
    slots: [],
    size: 4,
    modes: [{ name: 'Birlikte oyna' }],
    theme: { a: '#e8e8ea', b: '#335fff', bg: 'linear-gradient(135deg, #17181c 0%, #22242b 100%)', ink: '#121215' },
    slotWord: 'Oyuncu',
  },
  {
    key: 'diger',
    name: 'Başka oyun',
    slots: [],
    size: 4,
    modes: [],
    theme: { a: '', b: '', bg: '' },
    slotWord: 'Oyuncu',
  },
];

export const lfgGame = (key?: string) => LFG_GAMES.find((g) => g.key === key);

/** Eski ilanlar (oyun anahtarı yok) için addan tahmin */
export function lfgGameOf(card: { gk?: string; g: string }): LfgGame | undefined {
  if (card.gk) return lfgGame(card.gk);
  const n = card.g.toLowerCase();
  return LFG_GAMES.find((g) => g.key !== 'diger' && n.startsWith(g.name.toLowerCase()));
}

/** Kipe göre yer listesi */
export function slotsFor(g: LfgGame, mode: LfgMode | undefined, count: number): string[] {
  if (!g.slots.length) return Array.from({ length: mode?.size || count }, () => '');
  const size = mode?.size;
  if (size && size < g.slots.length) return Array.from({ length: size }, () => '');
  return [...g.slots];
}
