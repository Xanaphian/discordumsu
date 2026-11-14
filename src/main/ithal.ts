// Dışarıdan gelen verinin (taşıma paketi, ekler) temizlenmesi.
// Taşıma paketi başka bir bilgisayardan gelir; içindeki hiçbir alana güvenilmez:
// kimlikler dosya adı olarak kullanıldığı için biçimi sıkı denetlenir, bilinmeyen alanlar atılır.
import {
  ALL_PERMS, CHANNEL_PERMS, Perm, SELF_ROLE_FORBIDDEN, SHORT_CODE_RE, cleanChannelBanner, cleanChannelImage, cleanRoom3d, cleanSiteUrl,
  isToolChannel, type Attachment, type AuditEntry, type Ban, type Category, type Channel, type ChannelType, type Community, type ID,
  type Member, type Message, type Overwrite, type Role,
} from '../shared/protocol';
import { sanitizeCommunityProfile } from '../shared/profile';
import { sanitizeStickers } from '../shared/stickers';
import { sanitizeGuard } from '../shared/topluluk';

export type ImportedCommunity = Omit<Community, 'users'> & { bans?: Ban[]; audit?: AuditEntry[]; m11?: number; m112?: number; m131?: number; m12?: number };

/** Sunucunun ürettiği kimlikler (makeId): yalnız harf ve rakam. Dosya adında güvenle kullanılabilir. */
export const SAFE_ID = /^[a-z0-9]{6,40}$/i;
/** Kullanıcı kimliği: harf, rakam, tire (yerleşik asistan ve botlar dâhil) */
export const USER_ID = /^[a-z0-9-]{6,40}$/i;

const MAX_CONTENT = 4000;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const name = (v: unknown, max: number) => str(v, 200).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const num = (v: unknown, min: number, max: number, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};
const int = (v: unknown, min: number, max: number, def = 0) => Math.floor(num(v, min, max, def));
const HEX = /^#[0-9a-f]{6}$/i;
const NOW_MAX = 8.64e15;

/** Mesaj ekleri: adres yalnızca bu sunucudaki bir dosyayı gösterebilir; boyut alanları sayı olmalı. */
export function cleanAttachments(list: unknown): Attachment[] {
  const out: Attachment[] = [];
  for (const a of Array.isArray(list) ? list.slice(0, 10) : []) {
    if (!a || typeof a !== 'object') continue;
    const url = str((a as Attachment).url, 300);
    if (!/^\/f\/[a-z0-9]{6,40}(?:\/[^/\\?#\s]*)?$/.test(url)) continue;
    const x = a as Partial<Attachment>;
    const att: Attachment = { id: str(x.id, 20), name: str(x.name, 120), size: int(x.size, 0, 1e12), mime: str(x.mime, 100), url };
    const w = int(x.w, 0, 20000), h = int(x.h, 0, 20000);
    if (w > 0 && h > 0) (att.w = w), (att.h = h);
    out.push(att);
  }
  return out;
}

/** Taşınan bir mesaj satırı. Geçersizse null. */
export function cleanImportedMessage(raw: unknown, ch: ID): Message | null {
  const m = raw as Partial<Message> | null;
  if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !SAFE_ID.test(m.id) || m.channelId !== ch) return null;
  if (typeof m.authorId !== 'string' || !USER_ID.test(m.authorId)) return null;
  const out: Message = { id: m.id, channelId: ch, authorId: m.authorId, content: str(m.content, MAX_CONTENT), ts: num(m.ts, 0, NOW_MAX) };
  if (m.editedTs) out.editedTs = num(m.editedTs, 0, NOW_MAX);
  if (typeof m.replyTo === 'string' && SAFE_ID.test(m.replyTo)) out.replyTo = m.replyTo;
  if (m.pinned) out.pinned = true;
  if (m.kind === 'join' || m.kind === 'pin' || m.kind === 'channel') out.kind = m.kind;
  const atts = cleanAttachments(m.attachments);
  if (atts.length) out.attachments = atts;
  if (m.reactions && typeof m.reactions === 'object' && !Array.isArray(m.reactions)) {
    const r: Record<string, ID[]> = {};
    let n = 0;
    for (const [k, v] of Object.entries(m.reactions)) {
      if (n >= 20 || !k || k.length > 32 || k === '__proto__' || !Array.isArray(v)) continue;
      const ids = [...new Set(v.filter((x): x is string => typeof x === 'string' && USER_ID.test(x)))].slice(0, 5000);
      if (ids.length) (r[k] = ids), n++;
    }
    if (n) out.reactions = r;
  }
  if (!out.content && !out.attachments && !out.kind) return null;
  return out;
}

const CHANNEL_TYPES: ChannelType[] = ['text', 'voice', 'announce', 'space', 'site', 'ideas', 'tasks', 'events', 'wall'];

/**
 * Taşıma paketindeki topluluğu baştan kurar: yalnız bilinen alanlar, doğrulanmış kimlikler.
 * Hata varsa kullanıcıya gösterilecek metin döner.
 */
export function cleanImportedCommunity(raw: unknown, ownerId: ID): ImportedCommunity | string {
  const c = raw as Partial<ImportedCommunity> | null;
  const bad = 'Paket bozuk.';
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !SAFE_ID.test(c.id)) return bad;
  if (c.ownerId !== ownerId) return 'Yalnızca topluluğun sahibi taşıyabilir.';
  if (!Array.isArray(c.channels) || !Array.isArray(c.members) || !Array.isArray(c.roles)) return bad;
  const cats = Array.isArray(c.categories) ? c.categories : [];
  if (c.channels.length > 500 || cats.length > 100 || c.roles.length > 250 || c.members.length > 20_000) return 'Topluluk taşınamayacak kadar büyük.';

  // ---- roller ----
  const roles: Role[] = [];
  const roleIds = new Set<ID>();
  for (const r of c.roles) {
    if (!r || typeof r.id !== 'string' || !SAFE_ID.test(r.id) || roleIds.has(r.id)) return bad;
    roleIds.add(r.id);
    const everyone = r.id === c.id;
    const role: Role = {
      id: r.id,
      name: name(r.name, 32) || (everyone ? '@herkes' : 'rol'),
      color: HEX.test(String(r.color)) ? String(r.color) : '',
      perms: (Number(r.perms) | 0) & ALL_PERMS & (everyone ? ~Perm.ADMIN : ALL_PERMS),
      hoist: !!r.hoist,
      position: everyone ? 0 : int(r.position, 1, 10_000, 1),
    };
    if (r.mentionable && !everyone) role.mentionable = true;
    if (r.selfAssign && !everyone && !(role.perms & SELF_ROLE_FORBIDDEN)) role.selfAssign = true;
    const icon = str(r.icon, 16).trim();
    if (icon && !everyone) role.icon = icon;
    roles.push(role);
  }
  // @herkes her zaman ilk sırada ve var
  const evIdx = roles.findIndex((r) => r.id === c.id);
  if (evIdx < 0) return bad;
  if (evIdx > 0) roles.unshift(...roles.splice(evIdx, 1));

  // ---- üyeler ----
  const members: Member[] = [];
  const memberIds = new Set<ID>();
  for (const m of c.members) {
    if (!m || typeof m.userId !== 'string' || !USER_ID.test(m.userId) || memberIds.has(m.userId)) continue;
    memberIds.add(m.userId);
    const mem: Member = {
      userId: m.userId,
      roles: (Array.isArray(m.roles) ? m.roles : []).filter((x, i, a) => typeof x === 'string' && x !== c.id && roleIds.has(x) && a.indexOf(x) === i).slice(0, 250),
      joinedAt: num(m.joinedAt, 0, NOW_MAX, Date.now()),
    };
    const nick = name(m.nick, 32);
    if (nick) mem.nick = nick;
    if (m.timeoutUntil) mem.timeoutUntil = num(m.timeoutUntil, 0, NOW_MAX);
    members.push(mem);
  }

  const overwrites = (list: unknown): Overwrite[] | undefined => {
    const out: Overwrite[] = [];
    const seen = new Set<ID>();
    for (const o of Array.isArray(list) ? list.slice(0, 100) : []) {
      if (!o || typeof o.id !== 'string' || seen.has(o.id)) continue;
      const type: Overwrite['type'] = o.type === 'member' ? 'member' : 'role';
      if (type === 'role' ? !roleIds.has(o.id) : !memberIds.has(o.id)) continue;
      const allow = (Number(o.allow) | 0) & CHANNEL_PERMS;
      const deny = (Number(o.deny) | 0) & CHANNEL_PERMS & ~allow;
      if (!allow && !deny) continue;
      seen.add(o.id);
      out.push({ id: o.id, type, allow, deny });
    }
    return out.length ? out : undefined;
  };

  // ---- kategoriler ----
  const categories: Category[] = [];
  const catIds = new Set<ID>();
  for (const k of cats) {
    if (!k || typeof k.id !== 'string' || !SAFE_ID.test(k.id) || catIds.has(k.id)) return bad;
    catIds.add(k.id);
    const cat: Category = { id: k.id, name: name(k.name, 40) || 'Kategori', position: int(k.position, 0, 10_000) };
    const ow = overwrites(k.overwrites);
    if (ow) cat.overwrites = ow;
    categories.push(cat);
  }

  // ---- kanallar ----
  const channels: Channel[] = [];
  const chanIds = new Set<ID>();
  for (const x of c.channels) {
    // kanal kimliği mesaj dosyasının adıdır: yalnız harf ve rakam olabilir
    if (!x || typeof x.id !== 'string' || !SAFE_ID.test(x.id) || chanIds.has(x.id)) return bad;
    chanIds.add(x.id);
    const type: ChannelType = CHANNEL_TYPES.includes(x.type as ChannelType) ? (x.type as ChannelType) : 'text';
    const ch: Channel = {
      id: x.id,
      name: name(x.name, 48) || (type === 'voice' ? 'Ses' : 'kanal'),
      type,
      categoryId: typeof x.categoryId === 'string' && catIds.has(x.categoryId) ? x.categoryId : null,
      position: int(x.position, 0, 10_000),
    };
    const topic = str(x.topic, 512);
    if (topic) ch.topic = topic;
    const slow = int(x.slowmode, 0, 21600);
    if (slow) ch.slowmode = slow;
    const limit = int(x.userLimit, 0, 99);
    if (limit) ch.userLimit = limit;
    const ow = overwrites(x.overwrites);
    if (ow) ch.overwrites = ow;
    if (type === 'site') {
      const url = cleanSiteUrl(x.url);
      if (!url) continue; // adresi geçersiz site odası taşınmaz
      ch.url = url;
    }
    const image = cleanChannelImage(x.image);
    if (image) ch.image = image;
    const banner = cleanChannelBanner(x.banner);
    if (banner) ch.banner = banner;
    const room = cleanRoom3d(x.room3d);
    if (room && room !== 'salon') ch.room3d = room;
    channels.push(ch);
  }
  if (!channels.length) return bad;

  const out: ImportedCommunity = {
    id: c.id,
    name: name(c.name, 48) || 'Topluluk',
    color: HEX.test(String(c.color)) ? String(c.color) : '#f5a524',
    ownerId,
    createdAt: num(c.createdAt, 0, NOW_MAX, Date.now()),
    roles,
    categories,
    channels,
    members,
    pv: int(c.pv, 0, 100),
    joinMessages: c.joinMessages !== false,
  };
  if (typeof c.icon === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(c.icon) && c.icon.length < 400_000) out.icon = c.icon;
  const desc = str(c.description, 300);
  if (desc) out.description = desc;
  const profile = c.profile ? sanitizeCommunityProfile(c.profile) : undefined;
  if (profile) out.profile = profile;
  if (typeof c.inviteKey === 'string' && /^[\w-]{8,40}$/.test(c.inviteKey)) out.inviteKey = c.inviteKey;
  if (typeof c.inviteCode === 'string' && SHORT_CODE_RE.test(c.inviteCode)) out.inviteCode = c.inviteCode;
  if (typeof c.systemChannelId === 'string' && channels.some((x) => x.id === c.systemChannelId && (x.type === 'text' || x.type === 'announce' || isToolChannel(x.type)))) out.systemChannelId = c.systemChannelId;
  if (c.invitesPaused) out.invitesPaused = true;
  if (c.automod && typeof c.automod === 'object') {
    const a = c.automod;
    out.automod = {
      words: (Array.isArray(a.words) ? a.words : []).map((w) => str(w, 40).toLocaleLowerCase('tr').trim()).filter(Boolean).slice(0, 200),
      blockLinks: !!a.blockLinks,
      maxMentions: int(a.maxMentions, 0, 50),
      newMemberWait: int(a.newMemberWait, 0, 1440),
    };
  }
  if (c.joinGuard) {
    const g = sanitizeGuard(c.joinGuard);
    if (g.minAgeH || g.perMin) out.joinGuard = g;
  }
  const stickers = c.stickers ? sanitizeStickers(c.stickers) : [];
  if (stickers.length) out.stickers = stickers;
  if (Array.isArray(c.bans)) {
    const bans: Ban[] = [];
    for (const b of c.bans.slice(-1000)) {
      if (!b || typeof b.userId !== 'string' || !USER_ID.test(b.userId)) continue;
      const reason = str(b.reason, 200);
      bans.push({ userId: b.userId, name: name(b.name, 32) || 'bilinmeyen', by: typeof b.by === 'string' && USER_ID.test(b.by) ? b.by : ownerId, ts: num(b.ts, 0, NOW_MAX), ...(reason ? { reason } : {}) });
    }
    if (bans.length) out.bans = bans;
  }
  if (Array.isArray(c.audit)) {
    const audit: AuditEntry[] = [];
    for (const e of c.audit.slice(-300)) {
      if (!e || typeof e.id !== 'string' || !SAFE_ID.test(e.id) || typeof e.by !== 'string' || !USER_ID.test(e.by)) continue;
      const t = str(e.t, 80), d = str(e.d, 300);
      audit.push({ id: e.id, ts: num(e.ts, 0, NOW_MAX), by: e.by, a: str(e.a, 40), ...(t ? { t } : {}), ...(d ? { d } : {}) });
    }
    if (audit.length) out.audit = audit;
  }
  // göç işaretleri (karşılama odaları yeniden eklenmesin)
  for (const k of ['m11', 'm112', 'm131', 'm12'] as const) if (c[k]) out[k] = 1;
  return out;
}
