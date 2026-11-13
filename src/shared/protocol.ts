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
} as const;

export interface Role {
  id: ID;
  name: string;
  color: string; // '' = renksiz
  perms: number;
  hoist: boolean; // üye listesinde ayrı grup
  position: number; // büyük olan üstte
}

export interface Member {
  userId: ID;
  nick?: string;
  roles: ID[];
  joinedAt: number;
}

export type ChannelType = 'text' | 'voice' | 'announce';

export interface Channel {
  id: ID;
  name: string;
  type: ChannelType;
  categoryId: ID | null;
  topic?: string;
  position: number;
  slowmode?: number;
}

export interface Category {
  id: ID;
  name: string;
  position: number;
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

export interface VoiceMember {
  userId: ID;
  muted: boolean;
  deaf: boolean;
  sessionId: ID;
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
  | { t: 'comm.update'; cid: ID; name?: string; icon?: string | null; description?: string; color?: string }
  | { t: 'comm.delete'; cid: ID }
  | { t: 'comm.leave'; cid: ID }
  | { t: 'comm.invite.reset'; cid: ID }
  | { t: 'chan.create'; cid: ID; name: string; type: ChannelType; categoryId: ID | null; rid?: string }
  | { t: 'chan.update'; cid: ID; id: ID; name?: string; topic?: string; categoryId?: ID | null; slowmode?: number }
  | { t: 'chan.delete'; cid: ID; id: ID }
  | { t: 'chan.move'; cid: ID; id: ID; categoryId: ID | null; index: number }
  | { t: 'cat.create'; cid: ID; name: string }
  | { t: 'cat.update'; cid: ID; id: ID; name: string }
  | { t: 'cat.delete'; cid: ID; id: ID }
  | { t: 'role.create'; cid: ID; name: string; color: string; perms: number; hoist: boolean }
  | { t: 'role.update'; cid: ID; id: ID; name?: string; color?: string; perms?: number; hoist?: boolean }
  | { t: 'role.delete'; cid: ID; id: ID }
  | { t: 'member.update'; cid: ID; userId: ID; roles?: ID[]; nick?: string | null }
  | { t: 'member.kick'; cid: ID; userId: ID }
  | { t: 'vc.join'; ch: ID; muted: boolean; deaf: boolean }
  | { t: 'vc.leave' }
  | { t: 'vc.state'; muted: boolean; deaf: boolean }
  | { t: 'vc.signal'; to: ID; data: unknown }
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

export function memberPerms(c: Community, userId: ID): number {
  if (c.ownerId === userId) return 0xffff;
  const m = c.members.find((x) => x.userId === userId);
  if (!m) return 0;
  let p = c.roles[0]?.perms ?? 0;
  for (const r of c.roles) if (m.roles.includes(r.id)) p |= r.perms;
  if (p & Perm.ADMIN) return 0xffff;
  return p;
}

export function can(c: Community, userId: ID, perm: number): boolean {
  return (memberPerms(c, userId) & perm) === perm;
}
