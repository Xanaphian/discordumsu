// Davet bağlantıları: "https://xanaphian.com/davet/s3gas25" (ana süreç, sunucu ve arayüz ortak kullanır).
// Bağlantı tarayıcıda açılınca sunucunun davet sayfası gelir ve uygulamayı açar; uygulamaya yapıştırılınca
// doğrudan katılır; sohbete yazılınca "Katıl" düğmeli kart olur.
import { SHORT_CODE_RE, type ID } from './protocol';

/** Davet bağlantılarının başı. Alan adı değişirse yalnız burası değişir (sonunda / yok). */
export const INVITE_LINK_BASE = 'https://xanaphian.com/davet';
/** Uygulamayı açan özel bağlantı: xanaphian://davet/s3gas25 */
export const INVITE_APP_SCHEME = 'xanaphian';
/** Uygulamanın indirildiği sayfa (davet sayfasındaki "İndir" düğmesi) */
export const DOWNLOAD_URL = 'https://github.com/Xanaphian/discordumsu/releases/latest';

/** Sunucu süreli / sınırlı davetleri ve davet önizlemesini destekliyor (ready.feats) */
export const FEAT_INVITES = 'davet';

/** Bir toplulukta aynı anda en çok bu kadar süreli/sınırlı davet durur */
export const MAX_INVITES = 100;

/** Süreli ya da kullanım sınırlı davet. Topluluğun kalıcı kodu (inviteCode) bunların dışındadır. */
export interface Invite {
  code: string;
  /** oluşturan */
  by: ID;
  at: number;
  /** bitiş anı (ms); yoksa süresiz */
  exp?: number;
  /** en çok kaç kişi katılabilir; yoksa sınırsız */
  max?: number;
  /** bu davetle katılan kişi sayısı */
  uses: number;
}

/** Davetin herkese gösterilen özeti (davet sayfası, sohbet kartı, katılma penceresi) */
export interface InviteInfo {
  code: string;
  cid: ID;
  name: string;
  color: string;
  icon?: string;
  /** kısa tanıtım */
  about?: string;
  members: number;
  online: number;
  /** soran kişi zaten üye (yalnız uygulama içinden sorulunca) */
  joined?: boolean;
  exp?: number;
  /** davet sayfasının arka planı: topluluk profilindeki afişten (resim ayrı adresten sunulur) */
  bg?: { k: 'solid' | 'gradient' | 'image'; a: string; b?: string; ang?: number; x?: number; y?: number; z?: number };
}

export const INVITE_AGES: { s: number; label: string }[] = [
  { s: 1800, label: '30 dakika' },
  { s: 3600, label: '1 saat' },
  { s: 6 * 3600, label: '6 saat' },
  { s: 12 * 3600, label: '12 saat' },
  { s: 86400, label: '1 gün' },
  { s: 7 * 86400, label: '7 gün' },
  { s: 0, label: 'Hiçbir zaman' },
];

export const INVITE_USES: { n: number; label: string }[] = [
  { n: 0, label: 'Sınırsız' },
  { n: 1, label: '1 kullanım' },
  { n: 5, label: '5 kullanım' },
  { n: 10, label: '10 kullanım' },
  { n: 25, label: '25 kullanım' },
  { n: 50, label: '50 kullanım' },
  { n: 100, label: '100 kullanım' },
];

export const inviteLink = (code: string) => `${INVITE_LINK_BASE}/${code}`;

const LINK_HOST = INVITE_LINK_BASE.replace(/^https?:\/\//i, '').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** Tam davet bağlantısı (http/https, www'li de olur) ya da uygulama bağlantısı */
const LINK_SRC = `(?:https?:\\/\\/(?:www\\.)?${LINK_HOST}|(?:${INVITE_APP_SCHEME}|kovan):\\/\\/(?:davet|invite))\\/([a-z0-9]{7})(?![a-z0-9])`;

/** Yazı tek başına bir davet bağlantısıysa kodunu verir ("xanaphian.com/davet/kod" da olur) */
export function inviteCodeOfLink(input: string): string | null {
  const s = input.trim().replace(/[/?#]+$/, '');
  const m = new RegExp(`^(?:${LINK_SRC}|(?:www\\.)?${LINK_HOST}\\/([a-z0-9]{7}))$`, 'i').exec(s);
  const code = (m?.[1] || m?.[2] || '').toLowerCase();
  return SHORT_CODE_RE.test(code) ? code : null;
}

/** Mesajdaki davet bağlantılarının kodları (kod blokları ve gizli yazı hariç), en çok 3 */
export function inviteCodesIn(content: string): string[] {
  if (!content.includes('/')) return [];
  const text = content.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/\|\|[\s\S]*?\|\|/g, ' ');
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(LINK_SRC, 'gi'))) {
    const code = m[1].toLowerCase();
    if (!out.includes(code)) out.push(code);
    if (out.length >= 3) break;
  }
  return out;
}

/** Adres bir davet bağlantısı mı (bağlantı önizlemesi yerine davet kartı gösterilir) */
export const isInviteLink = (url: string) => new RegExp(`^${LINK_SRC}`, 'i').test(url.trim());

/** Kalan süre: "6 gün", "3 saat", "12 dk" */
export function inviteLeft(exp: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((exp - now) / 1000));
  if (s >= 2 * 86400) return `${Math.round(s / 86400)} gün`;
  if (s >= 2 * 3600) return `${Math.round(s / 3600)} saat`;
  if (s >= 60) return `${Math.max(1, Math.round(s / 60))} dk`;
  return 'bir dakikadan az';
}
