// Kovan ağ protokolü: istemci <-> kovan sunucusu (hub) arasında JSON çerçeveler.

export type ID = string;

export type Status = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export interface UserPublic {
  id: ID;
  name: string;
  color: string;
  avatar?: string; // küçük data URL
  bio?: string;
}

export const Perm = {
  ADMIN: 1,
  MANAGE_CHANNELS: 2,
  MANAGE_MESSAGES: 4,
  MANAGE_ROLES: 8,
  KICK: 16,
  MANAGE_COMMUNITY: 32,
  MENTION_EVERYONE: 64,
  // v1.2: ayrıntılı yetkiler
  VIEW_CHANNEL: 1 << 7,
  SEND_MESSAGES: 1 << 8,
  ATTACH_FILES: 1 << 9,
  ADD_REACTIONS: 1 << 10,
  CONNECT: 1 << 11,
  SPEAK: 1 << 12,
  CHANGE_NICKNAME: 1 << 13,
  MANAGE_NICKNAMES: 1 << 14,
  CREATE_INVITE: 1 << 15,
  BAN: 1 << 16,
  TIMEOUT: 1 << 17,
  VIEW_AUDIT_LOG: 1 << 18,
  // 1 << 20 ve üstü başka özellikler için ayrıldı
} as const;

/** Sahip ve yöneticilerin sahip olduğu tüm yetkiler */
export const ALL_PERMS = 0x7fffffff;

/** Yeni topluluklarda @herkes rolünün varsayılan yetkileri */
export const DEFAULT_EVERYONE =
  Perm.VIEW_CHANNEL | Perm.SEND_MESSAGES | Perm.ATTACH_FILES | Perm.ADD_REACTIONS | Perm.CONNECT | Perm.SPEAK | Perm.CHANGE_NICKNAME | Perm.CREATE_INVITE;

/** Kanal düzeyinde anlamı olan yetkiler (izin üzerine yazmalarında kullanılır) */
export const CHANNEL_PERMS =
  Perm.VIEW_CHANNEL | Perm.MANAGE_CHANNELS | Perm.MANAGE_ROLES | Perm.SEND_MESSAGES | Perm.ATTACH_FILES | Perm.ADD_REACTIONS | Perm.MENTION_EVERYONE |
  Perm.MANAGE_MESSAGES | Perm.CONNECT | Perm.SPEAK | Perm.CREATE_INVITE;

/** Zaman aşımındaki üyeden geri alınan yetkiler */
export const TIMEOUT_STRIP = Perm.SEND_MESSAGES | Perm.ADD_REACTIONS | Perm.CONNECT | Perm.SPEAK;

export interface Role {
  id: ID;
  name: string;
  color: string; // '' = renksiz
  perms: number;
  hoist: boolean; // üye listesinde ayrı grup
  position: number; // büyük olan üstte
  mentionable?: boolean; // herkes @rol ile bahsedebilir
  icon?: string; // rol rozeti (emoji)
}

/** Kanal / kategori izin üzerine yazması. id === topluluk id ise @herkes. */
export interface Overwrite {
  id: ID;
  type: 'role' | 'member';
  allow: number;
  deny: number;
}

export interface Member {
  userId: ID;
  nick?: string;
  roles: ID[];
  joinedAt: number;
  timeoutUntil?: number; // zaman aşımı bitişi (ms)
}

export type ChannelType = 'text' | 'voice' | 'announce' | 'space';

/** Sesli bağlantı kurulan kanal türleri (ses ve 3D oda) */
export const isVoiceLike = (t: ChannelType) => t === 'voice' || t === 'space';

// ---- 3D oda ----
export interface AvatarLook {
  color: string;
  hat: 'none' | 'antenna' | 'crown' | 'cap' | 'wizard' | 'halo' | 'headphones';
}
export interface SpaceAvatar {
  sid: ID;
  userId: ID;
  look: AvatarLook;
  x: number;
  z: number;
  ry: number;
  a: number; // 0 bekle, 1 yürü, 2 koş, 3 otur, 4 zıpla
}
export interface Booth {
  owner: ID | null;
  text: string;
}

export interface Channel {
  id: ID;
  name: string;
  type: ChannelType;
  categoryId: ID | null;
  topic?: string;
  position: number;
  slowmode?: number;
  overwrites?: Overwrite[];
  userLimit?: number; // ses / 3D oda kişi sınırı (0 = sınırsız)
}

export interface Category {
  id: ID;
  name: string;
  position: number;
  overwrites?: Overwrite[];
}

export interface AutoMod {
  words: string[]; // yasaklı kelimeler (küçük harf)
  blockLinks: boolean; // yöneticiler dışında bağlantı paylaşımı kapalı
  maxMentions: number; // mesaj başına en fazla bahsetme (0 = sınırsız)
  newMemberWait: number; // yeni üyeler kaç dakika sonra yazabilir (0 = hemen)
}

export interface Ban {
  userId: ID;
  name: string;
  by: ID;
  reason?: string;
  ts: number;
}

export interface AuditEntry {
  id: ID;
  ts: number;
  by: ID;
  a: string; // eylem: 'role.update', 'member.ban', ...
  t?: string; // hedefin görünen adı
  d?: string; // ayrıntı
}

export interface Community {
  id: ID;
  name: string;
  icon?: string;
  color: string;
  ownerId: ID;
  createdAt: number;
  description?: string;
  roles: Role[]; // roles[0] her zaman @herkes (id === community.id)
  categories: Category[];
  channels: Channel[];
  members: Member[];
  users: Record<ID, UserPublic>;
  inviteKey?: string; // sadece yönetebilenlere gönderilir
  pv?: number; // yetki sürümü; 2 = ayrıntılı yetkiler (v1.2)
  systemChannelId?: ID | null; // katılma mesajlarının gideceği kanal
  joinMessages?: boolean; // false ise katılma mesajı gönderilmez
  invitesPaused?: boolean; // yeni katılımlar durduruldu
  automod?: AutoMod;
}

export interface Attachment {
  id: ID;
  name: string;
  size: number;
  mime: string;
  url: string; // sunucuya göre göreli: /f/<id>/<name>
  w?: number;
  h?: number;
}

export interface Message {
  id: ID;
  channelId: ID;
  authorId: ID;
  content: string;
  ts: number;
  editedTs?: number;
  replyTo?: ID;
  reactions?: Record<string, ID[]>;
  attachments?: Attachment[];
  pinned?: boolean;
  kind?: 'join' | 'pin' | 'channel';
}

export interface MediaIds {
  mic?: string;
  cam?: string;
  screen?: string;
}

export interface VoiceMember {
  userId: ID;
  muted: boolean;
  deaf: boolean;
  sessionId: ID;
  /** kamera açık */
  cam?: boolean;
  /** ekran paylaşıyor (ör. "1080p60") */
  screen?: string | null;
  /** hangi WebRTC akışı hangisi */
  streams?: MediaIds;
}

// ---- İstemci -> Sunucu ----
export type ClientFrame =
  | { t: 'hello'; user: UserPublic; secret: string; status: Status; v: number }
  | { t: 'join'; cid: ID; key: string; rid?: string }
  | { t: 'send'; ch: ID; nonce: string; content: string; replyTo?: ID; attachments?: Attachment[] }
  | { t: 'edit'; ch: ID; id: ID; content: string }
  | { t: 'del'; ch: ID; id: ID }
  | { t: 'react'; ch: ID; id: ID; e: string; on: boolean }
  | { t: 'pin'; ch: ID; id: ID; on: boolean }
  | { t: 'hist'; ch: ID; before?: ID; around?: ID; rid: string }
  | { t: 'pins'; ch: ID; rid: string }
  | { t: 'search'; cid: ID; q: string; rid: string }
  | { t: 'typing'; ch: ID }
  | { t: 'presence'; status: Status }
  | { t: 'profile'; user: UserPublic }
  | { t: 'comm.create'; name: string; icon?: string; color: string; template?: 'default' | 'lobby'; rid?: string }
  | { t: 'comm.update'; cid: ID; name?: string; icon?: string | null; description?: string; color?: string; systemChannelId?: ID | null; joinMessages?: boolean; invitesPaused?: boolean; automod?: AutoMod }
  | { t: 'comm.delete'; cid: ID }
  | { t: 'comm.leave'; cid: ID }
  | { t: 'comm.invite.reset'; cid: ID }
  | { t: 'chan.create'; cid: ID; name: string; type: ChannelType; categoryId: ID | null; rid?: string; private?: boolean; clone?: ID }
  | { t: 'chan.update'; cid: ID; id: ID; name?: string; topic?: string; categoryId?: ID | null; slowmode?: number; overwrites?: Overwrite[]; userLimit?: number; type?: ChannelType }
  | { t: 'chan.delete'; cid: ID; id: ID }
  | { t: 'chan.move'; cid: ID; id: ID; categoryId: ID | null; index: number }
  | { t: 'cat.create'; cid: ID; name: string }
  | { t: 'cat.update'; cid: ID; id: ID; name?: string; overwrites?: Overwrite[] }
  | { t: 'cat.delete'; cid: ID; id: ID }
  | { t: 'role.create'; cid: ID; name: string; color: string; perms: number; hoist: boolean; mentionable?: boolean; icon?: string; rid?: string }
  | { t: 'role.update'; cid: ID; id: ID; name?: string; color?: string; perms?: number; hoist?: boolean; mentionable?: boolean; icon?: string }
  | { t: 'role.move'; cid: ID; id: ID; dir: 1 | -1 }
  | { t: 'role.delete'; cid: ID; id: ID }
  | { t: 'member.update'; cid: ID; userId: ID; roles?: ID[]; nick?: string | null }
  | { t: 'member.kick'; cid: ID; userId: ID; reason?: string }
  | { t: 'member.ban'; cid: ID; userId: ID; reason?: string; purgeHours?: number }
  | { t: 'member.unban'; cid: ID; userId: ID }
  | { t: 'member.timeout'; cid: ID; userId: ID; minutes: number; reason?: string }
  | { t: 'mod.list'; cid: ID; rid: string }
  | { t: 'vc.join'; ch: ID; muted: boolean; deaf: boolean }
  | { t: 'vc.leave' }
  | { t: 'vc.state'; muted: boolean; deaf: boolean; cam?: boolean; screen?: string | null; streams?: MediaIds }
  | { t: 'vc.signal'; to: ID; data: unknown }
  | { t: 'sp.join'; ch: ID; look: AvatarLook }
  | { t: 'sp.leave' }
  | { t: 'sp.move'; x: number; z: number; ry: number; a: number }
  | { t: 'sp.say'; text: string }
  | { t: 'sp.emote'; e: string }
  | { t: 'sp.booth'; i: number; text: string | null }
  | { t: 'sp.look'; look: AvatarLook }
  | { t: 'ping' };

// ---- Sunucu -> İstemci ----
export type ServerFrame =
  | { t: 'ready'; hubId: ID; hubName: string; me: ID; communities: Community[]; presence: Record<ID, Status>; lastIds: Record<ID, ID>; voice: Record<ID, VoiceMember[]>; v: number }
  | { t: 'msg'; m: Message; nonce?: string }
  | { t: 'msg.upd'; m: Message }
  | { t: 'msg.del'; ch: ID; id: ID }
  | { t: 'hist'; rid: string; ch: ID; msgs: Message[]; more: boolean }
  | { t: 'pins'; rid: string; ch: ID; msgs: Message[] }
  | { t: 'search'; rid: string; msgs: Message[] }
  | { t: 'typing'; ch: ID; uid: ID }
  | { t: 'presence'; uid: ID; status: Status }
  | { t: 'user'; u: UserPublic }
  | { t: 'comm'; c: Community; lastIds?: Record<ID, ID> }
  | { t: 'comm.del'; cid: ID }
  | { t: 'ok'; rid: string; data?: unknown }
  | { t: 'err'; msg: string; rid?: string; nonce?: string }
  | { t: 'vc'; ch: ID; members: VoiceMember[] }
  | { t: 'vc.signal'; from: ID; fromUser: ID; data: unknown }
  | { t: 'sp.snap'; ch: ID; you: ID; avatars: SpaceAvatar[]; booths: Booth[] }
  | { t: 'sp.add'; av: SpaceAvatar }
  | { t: 'sp.del'; sid: ID }
  | { t: 'sp.mv'; sid: ID; x: number; z: number; ry: number; a: number }
  | { t: 'sp.say'; sid: ID; text: string }
  | { t: 'sp.emote'; sid: ID; e: string }
  | { t: 'sp.booths'; booths: Booth[] }
  | { t: 'sp.look'; sid: ID; look: AvatarLook }
  | { t: 'vc.you'; sessionId: ID }
  | { t: 'pong' };

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 47820;

/** Zamana göre sıralanabilir kimlik (ts base36 9 hane + 5 hane rastgele) */
export function makeId(ts = Date.now()): ID {
  const r = Math.floor(Math.random() * 36 ** 5).toString(36).padStart(5, '0');
  return ts.toString(36).padStart(9, '0') + r;
}

export function idTime(id: ID): number {
  return parseInt(id.slice(0, 9), 36);
}

export interface InviteData {
  h: string[]; // olası adresler: "ip:port"
  c: ID; // topluluk
  k: string; // davet anahtarı
}

export function encodeInvite(d: InviteData): string {
  const json = JSON.stringify(d);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
  return 'KVN-' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeInvite(code: string): InviteData | null {
  try {
    const raw = code.trim().replace(/^kovan:\/\/invite\//i, '').replace(/^KVN-/i, '');
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
    const d = JSON.parse(json);
    if (!d || !Array.isArray(d.h) || typeof d.c !== 'string' || typeof d.k !== 'string') return null;
    return d;
  } catch {
    return null;
  }
}

/** Yetki hesabı için topluluğun gereken kısmı (sunucu kullanıcı listesi olmadan da çağırır) */
export type PermSource = Pick<Community, 'id' | 'ownerId' | 'roles' | 'members' | 'categories' | 'pv'>;

export function memberPerms(c: PermSource, userId: ID): number {
  if (c.ownerId === userId) return ALL_PERMS;
  const m = c.members.find((x) => x.userId === userId);
  if (!m) return 0;
  let p = c.roles[0]?.perms ?? 0;
  // v1.2 öncesi kovanlar: temel yetkiler herkese açıktı
  if (!c.pv) p |= DEFAULT_EVERYONE;
  for (const r of c.roles) if (m.roles.includes(r.id)) p |= r.perms;
  if (p & Perm.ADMIN) return ALL_PERMS;
  if (m.timeoutUntil && m.timeoutUntil > Date.now()) p &= ~TIMEOUT_STRIP;
  return p;
}

export function can(c: PermSource, userId: ID, perm: number): boolean {
  return (memberPerms(c, userId) & perm) === perm;
}

function applyOverwrites(p: number, list: Overwrite[] | undefined, c: PermSource, m: Member): { p: number; sendAllowed: boolean } {
  if (!list?.length) return { p, sendAllowed: false };
  let sendAllowed = false;
  const ev = list.find((o) => o.id === c.id);
  if (ev) {
    p = (p & ~ev.deny) | ev.allow;
    if (ev.allow & Perm.SEND_MESSAGES) sendAllowed = true;
  }
  let allow = 0, deny = 0;
  for (const o of list) if (o.type === 'role' && o.id !== c.id && m.roles.includes(o.id)) (allow |= o.allow), (deny |= o.deny);
  p = (p & ~deny) | allow;
  if (allow & Perm.SEND_MESSAGES) sendAllowed = true;
  const mo = list.find((o) => o.type === 'member' && o.id === m.userId);
  if (mo) {
    p = (p & ~mo.deny) | mo.allow;
    if (mo.allow & Perm.SEND_MESSAGES) sendAllowed = true;
  }
  return { p, sendAllowed };
}

/** Bir kanaldaki etkin yetkiler: rol yetkileri + kategori ve kanal üzerine yazmaları. */
export function channelPerms(c: PermSource, userId: ID, ch: Pick<Channel, 'type' | 'categoryId' | 'overwrites'>): number {
  const base = memberPerms(c, userId);
  if (base === ALL_PERMS) return ALL_PERMS;
  const m = c.members.find((x) => x.userId === userId);
  if (!m) return 0;
  const cat = ch.categoryId ? c.categories.find((x) => x.id === ch.categoryId) : undefined;
  const a = applyOverwrites(base, cat?.overwrites, c, m);
  const b = applyOverwrites(a.p, ch.overwrites, c, m);
  let p = b.p;
  if (m.timeoutUntil && m.timeoutUntil > Date.now()) p &= ~TIMEOUT_STRIP;
  if (!(p & Perm.VIEW_CHANNEL)) return 0;
  // duyuru kanalına kanal yöneticileri ya da açıkça izin verilenler yazar
  if (ch.type === 'announce' && !(p & Perm.MANAGE_CHANNELS) && !(a.sendAllowed || b.sendAllowed)) p &= ~Perm.SEND_MESSAGES;
  return p;
}

export function canIn(c: PermSource, userId: ID, ch: Pick<Channel, 'type' | 'categoryId' | 'overwrites'>, perm: number): boolean {
  return (channelPerms(c, userId, ch) & perm) === perm;
}

/** Üyenin en yüksek rol konumu (sahip için sonsuz) */
export function topPosition(c: PermSource, userId: ID): number {
  if (c.ownerId === userId) return Infinity;
  const m = c.members.find((x) => x.userId === userId);
  if (!m) return -1;
  let top = 0;
  for (const r of c.roles) if (m.roles.includes(r.id) && r.position > top) top = r.position;
  return top;
}

/** actor, target üyesi üzerinde işlem yapabilir mi (rol hiyerarşisi) */
export function outranks(c: PermSource, actor: ID, target: ID): boolean {
  if (target === c.ownerId || actor === target) return false;
  return topPosition(c, actor) > topPosition(c, target);
}

/** actor bu rolü düzenleyebilir / verebilir mi */
export function canEditRole(c: PermSource, actor: ID, role: Pick<Role, 'id' | 'position'>): boolean {
  if (!can(c, actor, Perm.MANAGE_ROLES)) return false;
  if (c.ownerId === actor) return true;
  return role.id === c.id || role.position < topPosition(c, actor);
}

export function isTimedOut(m: Pick<Member, 'timeoutUntil'> | undefined): boolean {
  return !!m?.timeoutUntil && m.timeoutUntil > Date.now();
}
