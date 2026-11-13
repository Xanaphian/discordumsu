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
}

export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileExtra {
  pronouns?: string;
  custom?: { emoji?: string; text?: string; until?: number };
  activity?: { kind: ActivityKind; text: string };
  banner?: ProfileBanner;
  theme?: { a: string; b: string };
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
  if (x.banner && typeof x.banner === 'object') {
    const b = x.banner;
    const kind = pick(b.kind, ['solid', 'gradient', 'image'] as const);
    const a = col(b.a);
    if (kind && a) {
      const banner: ProfileBanner = { kind, a };
      const bb = col(b.b);
      if (bb) banner.b = bb;
      if (typeof b.angle === 'number' && isFinite(b.angle)) banner.angle = Math.round(((b.angle % 360) + 360) % 360);
      const pat = pick(b.pattern, PATTERNS);
      if (pat && pat !== 'none') banner.pattern = pat;
      if (kind === 'image') {
        if (typeof b.image === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(b.image) && b.image.length <= BANNER_MAX) banner.image = b.image;
        else banner.kind = bb ? 'gradient' : 'solid';
      }
      out.banner = banner;
    }
  }
  if (x.theme && typeof x.theme === 'object') {
    const a = col(x.theme.a), b = col(x.theme.b);
    if (a && b) out.theme = { a, b };
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
