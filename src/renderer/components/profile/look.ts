// Profil görünümü için yardımcılar: afiş/kart stilleri, etiketler, hazır görünümler.
import type React from 'react';
import type {
  ActivityKind, AvatarFrame, AvatarShape, BannerPattern, CardEffect, NameFont, NameFx, ProfileBanner, ProfileExtra,
} from '../../../shared/profile';

export const SHAPE_LABEL: Record<AvatarShape, string> = { hex: 'Altıgen', circle: 'Daire', squircle: 'Yumuşak kare', diamond: 'Elmas' };
export const FRAME_LABEL: Record<AvatarFrame, string> = {
  none: 'Yok',
  ring: 'Halka',
  double: 'Çift halka',
  glow: 'Parıltı',
  rainbow: 'Gökkuşağı',
  orbit: 'İki ton',
};
export const PATTERN_LABEL: Record<BannerPattern, string> = {
  none: 'Yok',
  honeycomb: 'Altıgen',
  dots: 'Noktalar',
  waves: 'Dalgalar',
  grid: 'Izgara',
  stripes: 'Çizgiler',
  stars: 'Yıldızlar',
};
export const NAME_FX_LABEL: Record<NameFx, string> = { none: 'Düz', gradient: 'Degrade', glow: 'Işıltı', shimmer: 'Parlama' };
export const NAME_FONT_LABEL: Record<NameFont, string> = { default: 'Standart', display: 'Gösterişli', serif: 'Klasik', mono: 'Daktilo', hand: 'El yazısı' };
export const EFFECT_LABEL: Record<CardEffect, string> = {
  none: 'Yok',
  sparkle: 'Işıltılar',
  bees: 'Arılar',
  snow: 'Kar',
  aurora: 'Kutup ışığı',
  hearts: 'Kalpler',
};
export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  playing: 'oynuyor',
  listening: 'dinliyor',
  watching: 'izliyor',
  working: 'üzerinde çalışıyor',
  reading: 'okuyor',
};
export const ACTIVITY_VERB: Record<ActivityKind, string> = {
  playing: 'Oynuyor',
  listening: 'Dinliyor',
  watching: 'İzliyor',
  working: 'Çalışıyor',
  reading: 'Okuyor',
};

/** #rrggbb -> göreli parlaklık (0..1) */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function bannerBackground(b: ProfileBanner | undefined, fallback: string): string {
  if (!b) return `linear-gradient(135deg, ${fallback}, color-mix(in srgb, ${fallback} 35%, #0b0a09))`;
  if (b.kind === 'image' && b.image) return `center / cover no-repeat url("${b.image}")`;
  if (b.kind === 'gradient') return `linear-gradient(${b.angle ?? 135}deg, ${b.a}, ${b.b || b.a})`;
  return b.a;
}

/** Konumlanmış resim: object-fit cover + seçilen nokta + yakınlaştırma */
export function imgFrameStyle(f: { x?: number; y?: number; zoom?: number } | undefined): React.CSSProperties {
  const x = f?.x ?? 50, y = f?.y ?? 50, z = (f?.zoom ?? 100) / 100;
  return { objectPosition: `${x}% ${y}%`, transformOrigin: `${x}% ${y}%`, transform: z !== 1 ? `scale(${z})` : undefined };
}

export function bannerClass(b: ProfileBanner | undefined) {
  const pat = b ? b.pattern : 'none';
  return pat && pat !== 'none' && b?.kind !== 'image' ? 'pat-' + pat : '';
}

/** Kart teması: iki renkli arka plan; metin tonu renklere göre seçilir. */
export function cardTheme(p: ProfileExtra | undefined): { style: React.CSSProperties; tone: 'dark' | 'light' } | null {
  const t = p?.theme;
  if (!t) return null;
  const lum = (luminance(t.a) + luminance(t.b)) / 2;
  return {
    style: { ['--pc-a' as any]: t.a, ['--pc-b' as any]: t.b, ...(t.c ? { ['--pc-c' as any]: t.c } : {}) },
    tone: lum > 0.45 ? 'light' : 'dark',
  };
}

export function nameStyle(p: ProfileExtra | undefined, base: string | undefined): { className: string; style: React.CSSProperties } {
  const fx = p?.nameFx;
  const font = p?.nameFont;
  const cls = ['name-x', fx ? 'nfx-' + fx : '', font ? 'nf-' + font : ''].filter(Boolean).join(' ');
  const c1 = base || 'var(--text)';
  const style: React.CSSProperties = { color: base || undefined };
  if (fx) {
    (style as any)['--n1'] = c1;
    (style as any)['--n2'] = p?.nameB || '#ffffff';
  }
  return { className: cls, style };
}

/** Bağlantı simgesi: bilinen siteler için kısa marka etiketi */
export function linkBrand(url: string): { tag: string; bg: string; name: string } | null {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  const map: [RegExp, string, string, string][] = [
    [/github\.com$/, 'GH', '#24292f', 'GitHub'],
    [/instagram\.com$/, 'IG', 'linear-gradient(45deg,#f9a825,#e1306c,#833ab4)', 'Instagram'],
    [/(youtube\.com|youtu\.be)$/, 'YT', '#e62117', 'YouTube'],
    [/(twitter\.com|x\.com)$/, 'X', '#0f0f0f', 'X'],
    [/twitch\.tv$/, 'TV', '#9146ff', 'Twitch'],
    [/spotify\.com$/, 'SP', '#1db954', 'Spotify'],
    [/steamcommunity\.com$|steampowered\.com$/, 'ST', '#1b2838', 'Steam'],
    [/tiktok\.com$/, 'TT', '#111111', 'TikTok'],
    [/linkedin\.com$/, 'in', '#0a66c2', 'LinkedIn'],
    [/reddit\.com$/, 'R', '#ff4500', 'Reddit'],
    [/kick\.com$/, 'K', '#53fc18', 'Kick'],
  ];
  for (const [re, tag, bg, name] of map) if (re.test(host)) return { tag, bg, name };
  return null;
}

export function linkTitle(l: { label: string; url: string }) {
  if (l.label) return l.label;
  const b = linkBrand(l.url);
  if (b) return b.name;
  try {
    return new URL(l.url).hostname.replace(/^www\./, '');
  } catch {
    return l.url;
  }
}

export interface Preset {
  id: string;
  name: string;
  extra: Pick<ProfileExtra, 'banner' | 'theme' | 'frame' | 'nameFx' | 'nameB' | 'effect' | 'frameColor'>;
}

export const PRESETS: Preset[] = [
  {
    id: 'bal',
    name: 'Altın',
    extra: { banner: { kind: 'gradient', a: '#c9a35a', b: '#6b4e1f', angle: 135, pattern: 'none' }, theme: { a: '#1d1709', b: '#0d0b07' }, frame: 'ring', nameFx: 'gradient', nameB: '#f3dca2', effect: 'sparkle' },
  },
  {
    id: 'gece',
    name: 'Gece yarısı',
    extra: { banner: { kind: 'gradient', a: '#1e1b4b', b: '#7c3aed', angle: 160, pattern: 'stars' }, theme: { a: '#14122b', b: '#0a0914' }, frame: 'glow', frameColor: '#a78bfa', nameFx: 'glow', nameB: '#c4b5fd', effect: 'sparkle' },
  },
  {
    id: 'okyanus',
    name: 'Okyanus',
    extra: { banner: { kind: 'gradient', a: '#0ea5e9', b: '#14b8a6', angle: 120, pattern: 'waves' }, theme: { a: '#082f49', b: '#042f2e' }, frame: 'double', frameColor: '#22d3ee', nameFx: 'gradient', nameB: '#5eead4' },
  },
  {
    id: 'orman',
    name: 'Orman',
    extra: { banner: { kind: 'gradient', a: '#166534', b: '#84cc16', angle: 200, pattern: 'dots' }, theme: { a: '#0f2417', b: '#0a140d' }, frame: 'ring', frameColor: '#4ade80', nameFx: 'gradient', nameB: '#bef264' },
  },
  {
    id: 'gul',
    name: 'Gül',
    extra: { banner: { kind: 'gradient', a: '#fb7185', b: '#f0abfc', angle: 135, pattern: 'none' }, theme: { a: '#3b0f1f', b: '#1f0b1c' }, frame: 'glow', frameColor: '#fb7185', nameFx: 'shimmer', nameB: '#fbcfe8', effect: 'hearts' },
  },
  {
    id: 'kutup',
    name: 'Kutup',
    extra: { banner: { kind: 'gradient', a: '#e0f2fe', b: '#a5b4fc', angle: 180, pattern: 'stars' }, theme: { a: '#e8eefc', b: '#f8fafc' }, frame: 'double', frameColor: '#93c5fd', nameFx: 'gradient', nameB: '#6366f1', effect: 'snow' },
  },
  {
    id: 'lav',
    name: 'Lav',
    extra: { banner: { kind: 'gradient', a: '#dc2626', b: '#f97316', angle: 30, pattern: 'stripes' }, theme: { a: '#2a0a06', b: '#120604' }, frame: 'orbit', frameColor: '#fb923c', nameFx: 'gradient', nameB: '#fde047' },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    extra: { banner: { kind: 'gradient', a: '#22d3ee', b: '#a855f7', angle: 100, pattern: 'none' }, theme: { a: '#071a24', b: '#160a26' }, frame: 'rainbow', nameFx: 'shimmer', nameB: '#67e8f9', effect: 'aurora' },
  },
];
