// Kovan gelişmiş profil: kullanıcıların herkese görünen profil özelleştirmeleri.
// Hem kovan sunucusu (hub) hem istemci aynı doğrulayıcıyı kullanır.

export type AvatarShape = 'hex' | 'circle' | 'squircle' | 'diamond';
export type AvatarFrame = 'none' | 'ring' | 'double' | 'glow' | 'rainbow' | 'orbit';
export type BannerPattern = 'none' | 'honeycomb' | 'dots' | 'waves' | 'grid' | 'stripes' | 'stars';
export type NameFx = 'none' | 'gradient' | 'glow' | 'shimmer';
export type NameFont = 'default' | 'display' | 'serif' | 'mono' | 'hand';
export type CardEffect = 'none' | 'sparkle' | 'bees' | 'snow' | 'aurora' | 'hearts';
export type ActivityKind = 'playing' | 'listening' | 'watching' | 'working' | 'reading';

export interface ProfileBanner {
  kind: 'solid' | 'gradient' | 'image';
  a: string;
  b?: string;
  angle?: number;
  pattern?: BannerPattern;
  image?: string; // data:image/...
  x?: number; // resmin görünen kısmı, yatay % (0-100)
  y?: number; // dikey % (0-100)
  zoom?: number; // % (20-300); 100 = alanı doldurur, altı resmin tamamını gösterir
  h?: number; // açılır karttaki afiş yüksekliği px (72-220); tam profilde ~1.85 katı
}

/** Tüm profil kartının arkasına konan resim */
export interface ProfileBg {
  image: string; // data:image/...
  dim?: number; // 0-85: resmin üstüne koyulan karartma yüzdesi
  blur?: number; // 0-16 px
  x?: number;
  y?: number;
  zoom?: number;
}

export const BANNER_H = { min: 72, max: 220, def: 108 };

/** Konum ve yakınlaştırma alanlarını doğrular */
function framing(src: any, out: { x?: number; y?: number; zoom?: number }) {
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined);
  const x = num(src?.x, 0, 100), y = num(src?.y, 0, 100), z = num(src?.zoom, 20, 300);
  if (x !== undefined && x !== 50) out.x = x;
  if (y !== undefined && y !== 50) out.y = y;
  if (z !== undefined && z !== 100) out.zoom = z;
}

export interface ProfileLink {
  label: string;
  url: string;
}

/** Profile bağlanan hesaplar (adres, servis ve ada göre istemcide kurulur) */
export type AccountService =
  | 'riot' | 'steam' | 'epic' | 'battlenet' | 'xbox' | 'psn' | 'kick' | 'twitch' | 'youtube' | 'spotify' | 'github' | 'x' | 'instagram' | 'tiktok' | 'reddit';
export const ACCOUNT_SERVICES: AccountService[] = [
  'riot', 'steam', 'epic', 'battlenet', 'xbox', 'psn', 'kick', 'twitch', 'youtube', 'spotify', 'github', 'x', 'instagram', 'tiktok', 'reddit',
];
export const RIOT_REGIONS = ['tr', 'euw', 'eune', 'na', 'kr', 'br', 'lan', 'las', 'oce', 'ru', 'jp'] as const;
export type RiotRegion = (typeof RIOT_REGIONS)[number];

export interface LinkedAccount {
  svc: AccountService;
  name: string;
  /** yalnız Riot için: bölge */
  region?: RiotRegion;
}

/** Son 30 günde oynanan / dinlenen / yayın yapılanlar (profilde "Etkinlik" sekmesi) */
export interface RecentActivity {
  kind: 'playing' | 'listening' | 'streaming';
  name: string;
  /** son görülme */
  ts: number;
  /** toplam dakika (son 30 gün) */
  mins?: number;
  /** üst üste oynanan gün sayısı */
  streak?: number;
  /** müzikte: dinlenen son şarkı, sanatçısı ve küçük kapağı (64px) */
  song?: string;
  artist?: string;
  art?: string;
}

/** Anlık etkinlik: oyun, müzik, yayın. Profile kaydedilmez, yalnız çevrimiçiyken yayılır. */
export type LiveKind = 'playing' | 'listening' | 'streaming' | 'watching';
export interface LiveActivity {
  kind: LiveKind;
  /** oyun adı, "Spotify", "Kick" … */
  name: string;
  /** şarkı adı, yayın başlığı, şampiyon … */
  details?: string;
  /** sanatçı, kategori, oyun kipi … */
  state?: string;
  start?: number;
  end?: number;
  /** albüm kapağı / yayın görseli (küçük data URL) */
  art?: string;
  /** oyunun kendi simgesi (küçük data URL) */
  icon?: string;
  url?: string;
  /** kaynak: spotify, kick, twitch, browser, app, game */
  src?: string;
  viewers?: number;
}

export interface ProfileExtra {
  pronouns?: string;
  accounts?: LinkedAccount[];
  recent?: RecentActivity[];
  custom?: { emoji?: string; text?: string; until?: number };
  activity?: { kind: ActivityKind; text: string };
  banner?: ProfileBanner;
  bg?: ProfileBg;
  /** kart renkleri: a üst, b alt, c vurgu (başlıklar, düğmeler) */
  theme?: { a: string; b: string; c?: string };
  shape?: AvatarShape;
  frame?: AvatarFrame;
  frameColor?: string;
  nameFx?: NameFx;
  nameB?: string;
  nameFont?: NameFont;
  links?: ProfileLink[];
  tags?: string[];
  effect?: CardEffect;
  tz?: number; // UTC'ye göre dakika; varsa yerel saat gösterilir
  birthday?: string; // 'AA-GG'
}

export const SHAPES: AvatarShape[] = ['hex', 'circle', 'squircle', 'diamond'];
export const FRAMES: AvatarFrame[] = ['none', 'ring', 'double', 'glow', 'rainbow', 'orbit'];
export const PATTERNS: BannerPattern[] = ['none', 'honeycomb', 'dots', 'waves', 'grid', 'stripes', 'stars'];
export const NAME_FX: NameFx[] = ['none', 'gradient', 'glow', 'shimmer'];
export const NAME_FONTS: NameFont[] = ['default', 'display', 'serif', 'mono', 'hand'];
export const EFFECTS: CardEffect[] = ['none', 'sparkle', 'bees', 'snow', 'aurora', 'hearts'];
export const ACTIVITY_KINDS: ActivityKind[] = ['playing', 'listening', 'watching', 'working', 'reading'];

export const BIO_MAX = 300;
export const BANNER_MAX = 160_000;
export const BG_MAX = 220_000;
const RECENT_ART_MAX = 9_000;
const IMG = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

const HEX = /^#[0-9a-f]{6}$/i;
const col = (v: unknown, def?: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def);
const pick = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

function safeUrl(v: unknown): string {
  const s = str(v, 200);
  if (!s) return '';
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
  try {
    const u = new URL(withProto);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch {
    return '';
  }
}

/** Afiş verisini doğrular (kullanıcı ve sunucu profili ortak) */
export function sanitizeBanner(b: any): ProfileBanner | undefined {
  if (!b || typeof b !== 'object') return undefined;
  const kind = pick(b.kind, ['solid', 'gradient', 'image'] as const);
  const a = col(b.a);
  if (!kind || !a) return undefined;
  const banner: ProfileBanner = { kind, a };
  const bb = col(b.b);
  if (bb) banner.b = bb;
  if (typeof b.angle === 'number' && isFinite(b.angle)) banner.angle = Math.round(((b.angle % 360) + 360) % 360);
  const pat = pick(b.pattern, PATTERNS);
  if (pat && pat !== 'none') banner.pattern = pat;
  if (kind === 'image') {
    if (typeof b.image === 'string' && b.image.length <= BANNER_MAX && IMG.test(b.image)) {
      banner.image = b.image;
      framing(b, banner);
    } else banner.kind = bb ? 'gradient' : 'solid';
  }
  if (typeof b.h === 'number' && isFinite(b.h)) {
    const h = Math.max(BANNER_H.min, Math.min(BANNER_H.max, Math.round(b.h)));
    if (h !== BANNER_H.def) banner.h = h;
  }
  return banner;
}

/** Sunucu (topluluk) profili: sahibi ve topluluğu yönetenler düzenler, üyeler görür */
export interface CommunityProfile {
  banner?: ProfileBanner;
  /** adın altındaki kısa tanıtım */
  tagline?: string;
  tags?: string[];
  links?: ProfileLink[];
  /** topluluk kuralları, satır satır */
  rules?: string;
}
export const COMM_TAGLINE_MAX = 90;
export const COMM_RULES_MAX = 1500;

export function sanitizeCommunityProfile(p: unknown): CommunityProfile | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const x = p as Record<string, any>;
  const out: CommunityProfile = {};
  const banner = sanitizeBanner(x.banner);
  if (banner) out.banner = banner;
  const tagline = str(x.tagline, COMM_TAGLINE_MAX);
  if (tagline) out.tagline = tagline;
  if (Array.isArray(x.links)) {
    const links = x.links
      .slice(0, 5)
      .map((l: any) => ({ label: str(l?.label, 24), url: safeUrl(l?.url) }))
      .filter((l: ProfileLink) => l.url);
    if (links.length) out.links = links;
  }
  if (Array.isArray(x.tags)) {
    const seen = new Set<string>();
    const tags = x.tags
      .map((t: unknown) => str(t, 20))
      .filter((t: string) => t && !seen.has(t.toLocaleLowerCase('tr')) && seen.add(t.toLocaleLowerCase('tr')))
      .slice(0, 8);
    if (tags.length) out.tags = tags;
  }
  if (typeof x.rules === 'string') {
    const rules = x.rules.replace(/\r/g, '').trim().slice(0, COMM_RULES_MAX);
    if (rules) out.rules = rules;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Gelen profil verisini doğrular; boşsa undefined döner. */
export function sanitizeProfile(p: unknown): ProfileExtra | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const x = p as Record<string, any>;
  const out: ProfileExtra = {};
  const pronouns = str(x.pronouns, 24);
  if (pronouns) out.pronouns = pronouns;
  if (x.custom && typeof x.custom === 'object') {
    const emoji = str(x.custom.emoji, 16);
    const text = str(x.custom.text, 80);
    const until = typeof x.custom.until === 'number' && isFinite(x.custom.until) ? Math.floor(x.custom.until) : undefined;
    if (emoji || text) out.custom = { ...(emoji ? { emoji } : {}), ...(text ? { text } : {}), ...(until ? { until } : {}) };
  }
  if (x.activity && typeof x.activity === 'object') {
    const kind = pick(x.activity.kind, ACTIVITY_KINDS);
    const text = str(x.activity.text, 60);
    if (kind && text) out.activity = { kind, text };
  }
  const banner = sanitizeBanner(x.banner);
  if (banner) out.banner = banner;
  if (x.bg && typeof x.bg === 'object' && typeof x.bg.image === 'string' && x.bg.image.length <= BG_MAX && IMG.test(x.bg.image)) {
    const bg: ProfileBg = { image: x.bg.image };
    if (typeof x.bg.dim === 'number' && isFinite(x.bg.dim)) bg.dim = Math.max(0, Math.min(85, Math.round(x.bg.dim)));
    if (typeof x.bg.blur === 'number' && isFinite(x.bg.blur)) bg.blur = Math.max(0, Math.min(16, Math.round(x.bg.blur)));
    framing(x.bg, bg);
    out.bg = bg;
  }
  if (x.theme && typeof x.theme === 'object') {
    const a = col(x.theme.a), b = col(x.theme.b);
    const c = col(x.theme.c);
    if (a && b) out.theme = c ? { a, b, c } : { a, b };
  }
  if (Array.isArray(x.accounts)) {
    const seen = new Set<string>();
    const acc: LinkedAccount[] = [];
    for (const a of x.accounts.slice(0, 16)) {
      const svc = pick(a?.svc, ACCOUNT_SERVICES);
      const name = str(a?.name, 48).replace(/^@+/, svc === 'riot' || svc === 'battlenet' ? '' : '');
      if (!svc || !name || seen.has(svc + ':' + name.toLowerCase())) continue;
      seen.add(svc + ':' + name.toLowerCase());
      const one: LinkedAccount = { svc, name };
      const region = svc === 'riot' ? pick(a?.region, RIOT_REGIONS) : undefined;
      if (region) one.region = region;
      acc.push(one);
      if (acc.length >= 12) break;
    }
    if (acc.length) out.accounts = acc;
  }
  if (Array.isArray(x.recent)) {
    const rec: RecentActivity[] = [];
    for (const r of x.recent.slice(0, 12)) {
      const kind = pick(r?.kind, ['playing', 'listening', 'streaming'] as const);
      const name = str(r?.name, 64);
      const ts = typeof r?.ts === 'number' && isFinite(r.ts) ? Math.floor(r.ts) : 0;
      if (!kind || !name || !ts) continue;
      const one: RecentActivity = { kind, name, ts };
      if (typeof r.mins === 'number' && isFinite(r.mins) && r.mins > 0) one.mins = Math.min(99999, Math.round(r.mins));
      if (typeof r.streak === 'number' && isFinite(r.streak) && r.streak > 1) one.streak = Math.min(999, Math.round(r.streak));
      if (kind === 'listening') {
        const song = str(r.song, 100);
        if (song) {
          one.song = song;
          const artist = str(r.artist, 100);
          if (artist) one.artist = artist;
          if (typeof r.art === 'string' && r.art.length <= RECENT_ART_MAX && IMG.test(r.art)) one.art = r.art;
        }
      }
      rec.push(one);
      if (rec.length >= 8) break;
    }
    if (rec.length) out.recent = rec;
  }
  const shape = pick(x.shape, SHAPES);
  if (shape) out.shape = shape;
  const frame = pick(x.frame, FRAMES);
  if (frame && frame !== 'none') out.frame = frame;
  const fc = col(x.frameColor);
  if (fc) out.frameColor = fc;
  const fx = pick(x.nameFx, NAME_FX);
  if (fx && fx !== 'none') out.nameFx = fx;
  const nb = col(x.nameB);
  if (nb) out.nameB = nb;
  const font = pick(x.nameFont, NAME_FONTS);
  if (font && font !== 'default') out.nameFont = font;
  if (Array.isArray(x.links)) {
    const links = x.links
      .slice(0, 5)
      .map((l: any) => ({ label: str(l?.label, 24), url: safeUrl(l?.url) }))
      .filter((l: ProfileLink) => l.url);
    if (links.length) out.links = links;
  }
  if (Array.isArray(x.tags)) {
    const seen = new Set<string>();
    const tags = x.tags
      .map((t: unknown) => str(t, 20))
      .filter((t: string) => t && !seen.has(t.toLocaleLowerCase('tr')) && seen.add(t.toLocaleLowerCase('tr')))
      .slice(0, 8);
    if (tags.length) out.tags = tags;
  }
  const effect = pick(x.effect, EFFECTS);
  if (effect && effect !== 'none') out.effect = effect;
  if (typeof x.tz === 'number' && isFinite(x.tz) && Math.abs(x.tz) <= 14 * 60) out.tz = Math.round(x.tz);
  if (typeof x.birthday === 'string' && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(x.birthday)) out.birthday = x.birthday;
  return Object.keys(out).length ? out : undefined;
}

/** Süresi dolmamış özel durum */
export function activeCustom(p?: ProfileExtra, now = Date.now()) {
  const c = p?.custom;
  if (!c || (c.until && c.until < now)) return undefined;
  return c;
}

export const LIVE_KINDS: LiveKind[] = ['playing', 'listening', 'streaming', 'watching'];
const ART_MAX = 24_000;
const ICON_MAX = 12_000;

/** Anlık etkinlik listesini doğrular (en çok 3) */
export function sanitizeActivities(v: unknown): LiveActivity[] {
  if (!Array.isArray(v)) return [];
  const out: LiveActivity[] = [];
  for (const a of v.slice(0, 4)) {
    if (!a || typeof a !== 'object') continue;
    const kind = pick((a as any).kind, LIVE_KINDS);
    const name = str((a as any).name, 64);
    if (!kind || !name) continue;
    const x = a as Record<string, any>;
    const one: LiveActivity = { kind, name };
    const details = str(x.details, 128);
    if (details) one.details = details;
    const state = str(x.state, 128);
    if (state) one.state = state;
    const num = (n: unknown) => (typeof n === 'number' && isFinite(n) && n > 0 ? Math.floor(n) : undefined);
    const start = num(x.start), end = num(x.end);
    if (start) one.start = start;
    if (end && (!start || end > start)) one.end = end;
    if (typeof x.art === 'string' && x.art.length <= ART_MAX && IMG.test(x.art)) one.art = x.art;
    if (typeof x.icon === 'string' && x.icon.length <= ICON_MAX && IMG.test(x.icon)) one.icon = x.icon;
    const url = safeUrl(x.url);
    if (url) one.url = url;
    const src = str(x.src, 16).toLowerCase();
    if (/^[a-z0-9]+$/.test(src)) one.src = src;
    const viewers = num(x.viewers);
    if (viewers !== undefined) one.viewers = Math.min(viewers, 10_000_000);
    out.push(one);
    if (out.length >= 3) break;
  }
  return out;
}
