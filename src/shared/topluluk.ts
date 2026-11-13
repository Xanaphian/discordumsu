// v1.27: katılma koruması, keşfet listesi ve Discord şablonundan kurulum için ortak tipler.
import type { ChannelType, ID } from './protocol';
import { Perm } from './protocol';
import type { ProfileBanner } from './profile';

// ---------------------------------------------------------------------------
// Katılma koruması
export interface JoinGuard {
  /** hesabın bu sunucuyu ilk kullanışından bu yana en az kaç saat geçmiş olmalı (0 = kural yok) */
  minAgeH: number;
  /** bir dakikada en fazla kaç yeni üye (0 = sınırsız). Aşılırsa topluluk lockMin dakika yeni üye almaz. */
  perMin: number;
  /** baskın algılanınca kaç dakika kapalı kalır */
  lockMin: number;
}
export const DEFAULT_GUARD: JoinGuard = { minAgeH: 0, perMin: 0, lockMin: 10 };

export function sanitizeGuard(g: unknown): JoinGuard {
  const o = (g && typeof g === 'object' ? g : {}) as Partial<JoinGuard>;
  const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  return { minAgeH: n(o.minAgeH, 24 * 90), perMin: n(o.perMin, 100), lockMin: Math.max(1, n(o.lockMin, 24 * 60) || 10) };
}

/** "3 gün", "5 saat" biçiminde süre */
export function fmtHours(h: number): string {
  if (h >= 48 && h % 24 === 0) return `${h / 24} gün`;
  if (h >= 24) return `${Math.round(h / 24)} gün`;
  return `${Math.max(1, Math.round(h))} saat`;
}

// ---------------------------------------------------------------------------
// Keşfet
export const EXPLORE_CATS = [
  { id: 'oyun', label: 'Oyun' },
  { id: 'sohbet', label: 'Sohbet' },
  { id: 'muzik', label: 'Müzik' },
  { id: 'yazilim', label: 'Yazılım' },
  { id: 'egitim', label: 'Eğitim' },
  { id: 'sanat', label: 'Sanat' },
  { id: 'anime', label: 'Anime ve Çizgi' },
  { id: 'spor', label: 'Spor' },
  { id: 'diger', label: 'Diğer' },
] as const;
export type ExploreCat = (typeof EXPLORE_CATS)[number]['id'];
export const catLabel = (id: string) => EXPLORE_CATS.find((x) => x.id === id)?.label || 'Diğer';

/** Toplulukta saklanan liste bilgisi; yoksa keşfette görünmez */
export interface Listing {
  cat: ExploreCat;
  at: number;
}

export interface ExploreItem {
  id: ID;
  name: string;
  icon?: string;
  color: string;
  description?: string;
  banner?: ProfileBanner;
  tagline?: string;
  tags?: string[];
  cat: ExploreCat;
  members: number;
  online: number;
  createdAt: number;
  /** zaten üyesin */
  joined?: boolean;
}

// ---------------------------------------------------------------------------
// Şablon (taslak): Discord şablonundan çevrilen kanal/kategori/rol listesi
export interface BlueprintRole {
  name: string;
  color: string;
  perms: number;
  hoist: boolean;
  mentionable?: boolean;
}
export interface BlueprintOverwrite {
  /** -1 = @herkes, aksi halde roles dizisindeki sıra */
  role: number;
  allow: number;
  deny: number;
}
export interface BlueprintChannel {
  name: string;
  type: ChannelType;
  /** categories dizisindeki sıra; null = kategorisiz */
  cat: number | null;
  topic?: string;
  slowmode?: number;
  userLimit?: number;
  ow?: BlueprintOverwrite[];
}
export interface BlueprintCategory {
  name: string;
  ow?: BlueprintOverwrite[];
}
export interface Blueprint {
  everyone: number;
  /** alttan üste */
  roles: BlueprintRole[];
  categories: BlueprintCategory[];
  channels: BlueprintChannel[];
}

export const BLUEPRINT_LIMITS = { roles: 48, categories: 50, channels: 200 };

// Discord yetki bitleri -> Xanaphian yetkileri
const D: [bigint, number][] = [
  [1n << 0n, Perm.CREATE_INVITE],
  [1n << 1n, Perm.KICK],
  [1n << 2n, Perm.BAN],
  [1n << 3n, Perm.ADMIN],
  [1n << 4n, Perm.MANAGE_CHANNELS],
  [1n << 5n, Perm.MANAGE_COMMUNITY],
  [1n << 6n, Perm.ADD_REACTIONS],
  [1n << 7n, Perm.VIEW_AUDIT_LOG],
  [1n << 10n, Perm.VIEW_CHANNEL],
  [1n << 11n, Perm.SEND_MESSAGES],
  [1n << 13n, Perm.MANAGE_MESSAGES],
  [1n << 15n, Perm.ATTACH_FILES],
  [1n << 17n, Perm.MENTION_EVERYONE],
  [1n << 20n, Perm.CONNECT],
  [1n << 21n, Perm.SPEAK],
  [1n << 26n, Perm.CHANGE_NICKNAME],
  [1n << 27n, Perm.MANAGE_NICKNAMES],
  [1n << 28n, Perm.MANAGE_ROLES],
  [1n << 40n, Perm.TIMEOUT],
];
export function discordPerms(raw: unknown): number {
  let b: bigint;
  try {
    b = BigInt(typeof raw === 'number' || typeof raw === 'string' ? raw : 0);
  } catch {
    return 0;
  }
  let out = 0;
  for (const [d, p] of D) if (b & d) out |= p;
  return out;
}

const hex = (n: unknown) => (typeof n === 'number' && n > 0 ? '#' + n.toString(16).padStart(6, '0').slice(-6) : '');

export interface TemplateSummary {
  code: string;
  name: string;
  description: string;
  guildName: string;
  usage: number;
  blueprint: Blueprint;
}

/** Discord şablon kodunu bağlantıdan çıkarır: discord.new/KOD, discord.com/template/KOD ya da çıplak kod */
export function templateCode(raw: string): string | null {
  const t = raw.trim();
  const m = /(?:discord\.new\/|discord(?:app)?\.com\/template\/|^)([A-Za-z0-9]{6,32})\/?$/.exec(t);
  return m ? m[1] : null;
}

/** Discord'un /guilds/templates/<kod> cevabını taslağa çevirir */
export function blueprintFromDiscord(j: any): TemplateSummary {
  const g = j?.serialized_source_guild;
  if (!g || !Array.isArray(g.channels) || !Array.isArray(g.roles)) throw new Error('Şablon okunamadı.');
  const roles = (g.roles as any[]).slice();
  const everyoneRole = roles.find((r) => r.id === 0) || roles[0];
  const others = roles.filter((r) => r !== everyoneRole && !r.managed).slice(0, BLUEPRINT_LIMITS.roles);
  // Discord şablonunda roller üstten alta listelenir; biz alttan üste saklarız
  others.reverse();
  const roleIndex = new Map<unknown, number>();
  others.forEach((r, i) => roleIndex.set(r.id, i));
  const ow = (list: any[] | undefined): BlueprintOverwrite[] | undefined => {
    const out: BlueprintOverwrite[] = [];
    for (const o of list || []) {
      if (o.type !== 0 && o.type !== 'role') continue; // üye üzerine yazmaları şablonda anlamsız
      const role = o.id === everyoneRole?.id ? -1 : roleIndex.get(o.id);
      if (role === undefined) continue;
      const allow = discordPerms(o.allow), deny = discordPerms(o.deny);
      if (allow || deny) out.push({ role, allow, deny });
    }
    return out.length ? out : undefined;
  };
  const chans = (g.channels as any[]).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const cats = chans.filter((c) => c.type === 4).slice(0, BLUEPRINT_LIMITS.categories);
  const catIndex = new Map<unknown, number>();
  cats.forEach((c, i) => catIndex.set(c.id, i));
  const typeOf = (t: number): ChannelType | null => (t === 0 || t === 15 || t === 16 ? 'text' : t === 5 ? 'announce' : t === 2 || t === 13 ? 'voice' : null);
  const channels: BlueprintChannel[] = [];
  // kategorisizler önce, sonra kategori sırasıyla (Discord'daki görünüm)
  const ordered = [...chans.filter((c) => c.type !== 4 && c.parent_id == null), ...cats.flatMap((k) => chans.filter((c) => c.type !== 4 && c.parent_id === k.id))];
  for (const c of ordered) {
    const type = typeOf(c.type);
    if (!type || channels.length >= BLUEPRINT_LIMITS.channels) continue;
    const ch: BlueprintChannel = { name: String(c.name || 'kanal').slice(0, 48), type, cat: c.parent_id == null ? null : (catIndex.get(c.parent_id) ?? null) };
    if (c.topic) ch.topic = String(c.topic).slice(0, 512);
    if (c.rate_limit_per_user) ch.slowmode = Math.min(21600, Number(c.rate_limit_per_user) || 0);
    if (type === 'voice' && c.user_limit) ch.userLimit = Math.min(99, Number(c.user_limit) || 0);
    const o = ow(c.permission_overwrites);
    if (o) ch.ow = o;
    channels.push(ch);
  }
  return {
    code: String(j.code || ''),
    name: String(j.name || g.name || 'Şablon'),
    description: String(j.description || ''),
    guildName: String(g.name || j.name || ''),
    usage: Number(j.usage_count) || 0,
    blueprint: {
      everyone: discordPerms(everyoneRole?.permissions),
      roles: others.map((r) => ({ name: String(r.name || 'rol').slice(0, 32), color: hex(r.color), perms: discordPerms(r.permissions), hoist: !!r.hoist, ...(r.mentionable ? { mentionable: true } : {}) })),
      categories: cats.map((k) => ({ name: String(k.name || 'Kategori').slice(0, 40), ...(ow(k.permission_overwrites) ? { ow: ow(k.permission_overwrites) } : {}) })),
      channels,
    },
  };
}
