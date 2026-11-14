// v1.50 Kullanıcı etiketi: her hesabın "ad#kod" biçiminde tek bir etiketi vardır (eski "arkadaş kodu"nun yerine).
// - Ad: hesabın kendi adı (profildeki ad).
// - Kod: 1–5 harf ya da rakam. İlk girişte sunucu 4 haneli bir sayı atar (ör. 4821); kişi sonra
//   Ayarlar > Profilim'den kendi kodunu seçebilir (2–5 harf/rakam, ör. OVA). Kod yazıldığı gibi görünür.
// - Ad + kod birlikte benzersizdir. Karşılaştırma büyük/küçük harfe ve Türkçe karakterlere duyarsızdır:
//   "Yağmur#OVA" = "yagmur#ova" = "YAĞMUR#Ova".
// - Ad değişince kod korunur; yeni adla o kod başkasındaysa yeni bir sayı kodu atanır.
// Topluluk davet kodları (xanaphian/kod) ve bağlı oyun hesapları (Riot "ad#TAG") bundan ayrıdır.

/** Sunucunun ready.feats içinde bildirdiği özellik adı */
export const FEAT_TAGS = 'tags';

/** Geçerli (saklanan / aranan) kod: 1–5 harf ya da rakam */
export const TAG_CODE_RE = /^[\p{L}\p{N}]{1,5}$/u;
/** Kişinin kendi seçtiği kod: 2–5 harf ya da rakam */
export const TAG_CUSTOM_MIN = 2;
export const TAG_CUSTOM_MAX = 5;
/** Otomatik kodlar: 0001–9999 */
export const TAG_CODE_MIN = 1;
export const TAG_CODE_MAX = 9999;
/** Kendi kodunu değiştirme sınırı: 24 saatte en çok bu kadar */
export const TAG_CHANGES_PER_DAY = 3;

export const formatCode = (n: number) => String(n).padStart(4, '0');

const TR_MAP: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c' };

/** Metni karşılaştırma için sadeleştirir: Türkçe küçük harf, aksanlar ve Türkçe harfler ASCII'ye, boşluklar teke iner. */
export function foldName(name: string): string {
  return (name || '')
    .normalize('NFKC')
    .toLocaleLowerCase('tr')
    .replace(/[ışğüöç]/g, (c) => TR_MAP[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Benzersizlik anahtarı: sadeleşmiş ad + sadeleşmiş kod */
export const tagKey = (name: string, code: string) => `${foldName(name)}#${foldName(code)}`;

// Uygunsuz ya da yetkili/resmî görünen kodlar (sadeleşmiş hâlde, içinde geçmesi yeter)
const BAD_PARTS = ['amk', 'amq', 'yarak', 'yarra', 'orosp', 'ibne', 'pezev', 'kahpe', 'fuck', 'nigg', 'porn', 'gavat', 'sikik', 'sikis'];
const BAD_EXACT = ['sik', 'pic', 'got', 'aq', 'oc', 'amcik'];
const RESERVED_PARTS = ['admin', 'yetki', 'staff', 'modr', 'moder', 'xana', 'xnph', 'kovan', 'destek', 'sistem', 'system', 'resmi', 'offic', 'claude'];
const RESERVED_EXACT = ['mod', 'bot', 'gm', 'dev', 'xan', 'help'];

/** Kişinin seçtiği kodu denetler: hata mesajı ya da null */
export function customCodeError(raw: string): string | null {
  const code = (raw || '').trim();
  if (code.length < TAG_CUSTOM_MIN || code.length > TAG_CUSTOM_MAX) return `Kod ${TAG_CUSTOM_MIN}–${TAG_CUSTOM_MAX} karakter olmalı.`;
  if (!TAG_CODE_RE.test(code)) return 'Kodda yalnızca harf ve rakam olabilir (boşluk, # ya da işaret olmaz).';
  if (/^0+$/.test(code)) return 'Kod yalnız sıfırlardan oluşamaz.';
  const f = foldName(code);
  if (BAD_EXACT.includes(f) || BAD_PARTS.some((b) => f.includes(b))) return 'Bu kod uygun değil, başka bir kod seç.';
  if (RESERVED_EXACT.includes(f) || RESERVED_PARTS.some((b) => f.includes(b))) return 'Bu kod yetkili ya da resmî hesap gibi göründüğü için kullanılamaz.';
  return null;
}

export type ParsedTag = { ok: true; name: string; code: string } | { ok: false; error: string };

/** Kullanıcının yazdığı etiketi çözer. "ad#kod" (baştaki @ ve boşluklar yok sayılır). */
export function parseTag(input: string): ParsedTag {
  const s = (input || '').trim().replace(/^@/, '');
  if (!s) return { ok: false, error: 'Bir etiket yaz: ad#kod' };
  const i = s.lastIndexOf('#');
  if (i < 0) {
    if (s.includes('/') || /^KVN-/i.test(s))
      return { ok: false, error: 'Bu bir topluluk davet kodu. Davetler için sol menüdeki + > Topluluğa katıl kısmını kullan.' };
    return { ok: false, error: 'Adın sonuna # ve kodu da ekle, ör. ' + (s.slice(0, 24) || 'ad') + '#1234' };
  }
  const name = s.slice(0, i).trim();
  const code = s.slice(i + 1).trim();
  if (!name) return { ok: false, error: '# işaretinden önce kişinin adını yaz.' };
  if (!code) return { ok: false, error: '# işaretinden sonra kişinin kodunu yaz, ör. ' + name + '#1234' };
  if (!TAG_CODE_RE.test(code)) return { ok: false, error: '# işaretinden sonraki kod en çok 5 harf ya da rakam olur, ör. ' + name + '#OVA' };
  return { ok: true, name, code };
}

/** Görünen etiket: "ad#kod"; kod yoksa null */
export function tagOf(u: { name?: string; tag?: string } | null | undefined): string | null {
  return u?.name && u.tag && TAG_CODE_RE.test(u.tag) ? `${u.name}#${u.tag}` : null;
}

/** Kullanıcı adı sınırları (etiketin ad kısmı). Eski hesaplardaki kısa adlar bozulmaz; sınır yalnız ad değiştirilirken uygulanır. */
export const NAME_MIN = 2;
export const NAME_MAX = 32;
export function nameError(raw: string): string | null {
  const n = (raw || '').trim();
  if (!n) return 'Kullanıcı adı boş olamaz.';
  if ([...n].length < NAME_MIN) return `Kullanıcı adı en az ${NAME_MIN} karakter olmalı.`;
  if ([...n].length > NAME_MAX) return `Kullanıcı adı en çok ${NAME_MAX} karakter olabilir.`;
  if (n.includes('#')) return 'Kullanıcı adında # olamaz; # etiketin kodunu ayırır.';
  return null;
}
