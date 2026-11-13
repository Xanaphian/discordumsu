import type { Community, Member, Role, UserPublic } from '../../shared/protocol';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

const pad = (n: number) => String(n).padStart(2, '0');
export const hm = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function sameDay(a: number, b: number) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function fmtTime(ts: number) {
  const now = Date.now();
  if (sameDay(ts, now)) return `Bugün ${hm(ts)}`;
  if (sameDay(ts, now - 86400000)) return `Dün ${hm(ts)}`;
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${hm(ts)}`;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export function fmtDay(ts: number) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtFull(ts: number) {
  const d = new Date(ts);
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  return `${fmtDay(ts)} ${days[d.getDay()]} ${hm(ts)}`;
}

export function fmtSize(n: number) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr');
  return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr');
}

// Üye arama dizini: büyük topluluklarda her satır/mesaj için listeyi baştan taramamak için.
// Üye dizisi değişmez (her değişiklikte yeni dizi gelir), bu yüzden diziye bağlı önbellek güvenli.
const memberIdx = new WeakMap<Member[], Map<string, Member>>();
export function memberOf(c: Community | undefined, uid: string): Member | undefined {
  if (!c) return undefined;
  let idx = memberIdx.get(c.members);
  if (!idx) {
    idx = new Map();
    for (const m of c.members) idx.set(m.userId, m);
    memberIdx.set(c.members, idx);
  }
  return idx.get(uid);
}

const rolesCache = new WeakMap<Role[], WeakMap<string[], Role[]>>();
export function memberRoles(c: Community, m: Member | undefined): Role[] {
  if (!m) return [];
  let byMember = rolesCache.get(c.roles);
  if (!byMember) rolesCache.set(c.roles, (byMember = new WeakMap()));
  let list = byMember.get(m.roles);
  if (!list) byMember.set(m.roles, (list = c.roles.filter((r) => m.roles.includes(r.id)).sort((a, b) => b.position - a.position)));
  return list;
}

export function roleColor(c: Community, uid: string): string {
  const m = memberOf(c, uid);
  for (const r of memberRoles(c, m)) if (r.color) return r.color;
  return '';
}

export function displayName(c: Community | undefined, uid: string, users: Record<string, UserPublic>) {
  const m = memberOf(c, uid);
  return m?.nick || users[uid]?.name || c?.users[uid]?.name || 'Bilinmeyen';
}

/** Resmi kare kırpıp küçültür ve data URL döndürür. */
export function resizeImage(file: File | Blob, size = 128, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/webp', quality));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export const COLORS = ['#f5a524', '#3ecf8e', '#6cb6ff', '#f2555a', '#c084fc', '#22d3ee', '#fb7185', '#a3e635', '#f97316', '#94a3b8'];

export function copyText(s: string) {
  return navigator.clipboard.writeText(s).catch(() => {});
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export const isMac = navigator.platform.startsWith('Mac');
export const modKey = isMac ? '⌘' : 'Ctrl';

/** Topluluktaki çevrimiçi üye sayısı; yalnız üye listesi ya da durumlar değişince yeniden sayılır. */
const onlineCache = new WeakMap<Member[], { presence: object; me: string; n: number }>();
export function countOnline(members: Member[], presence: Record<string, string>, me: string): number {
  const hit = onlineCache.get(members);
  if (hit && hit.presence === presence && hit.me === me) return hit.n;
  let n = 0;
  for (const m of members) if (m.userId === me || m.userId === 'kovan-asistan' || (presence[m.userId] && presence[m.userId] !== 'offline')) n++;
  onlineCache.set(members, { presence, me, n });
  return n;
}
