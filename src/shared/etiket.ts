// v1.50 Kullanıcı etiketi: her hesabın "ad#1234" biçiminde tek bir etiketi vardır (eski "arkadaş kodu"nun yerine).
// - Ad: hesabın kendi adı (profildeki ad). Kod: 4 haneli sayı (0001–9999), sunucu atar.
// - Ad + kod birlikte benzersizdir. Aynı adı taşıyanlar farklı kodla ayrışır.
// - Arama büyük/küçük harfe ve Türkçe karakterlere duyarsızdır: "Şükrü#0042" = "sukru#0042" = "ŞÜKRÜ#0042".
// - Ad değişince kod korunur; yeni adla o kod başkasındaysa yeni bir kod atanır.
// Topluluk davet kodları (xanaphian/kod) ve bağlı oyun hesapları (Riot "ad#TAG") bundan ayrıdır.

/** Sunucunun ready.feats içinde bildirdiği özellik adı */
export const FEAT_TAGS = 'tags';

/** Kod: tam 4 rakam */
export const TAG_CODE_RE = /^\d{4}$/;
export const TAG_CODE_MIN = 1;
export const TAG_CODE_MAX = 9999;

export const formatCode = (n: number) => String(n).padStart(4, '0');

const TR_MAP: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c' };

/** Adı karşılaştırma için sadeleştirir: Türkçe küçük harf, aksanlar ve Türkçe harfler ASCII'ye, boşluklar teke iner. */
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

/** Benzersizlik anahtarı: sadeleşmiş ad + kod */
export const tagKey = (name: string, code: string) => `${foldName(name)}#${code}`;

export type ParsedTag = { ok: true; name: string; code: string } | { ok: false; error: string };

/** Kullanıcının yazdığı etiketi çözer. "ad#1234" (baştaki @ ve boşluklar yok sayılır). */
export function parseTag(input: string): ParsedTag {
  const s = (input || '').trim().replace(/^@/, '');
  if (!s) return { ok: false, error: 'Bir etiket yaz: ad#1234' };
  const i = s.lastIndexOf('#');
  if (i < 0) {
    if (s.includes('/') || /^KVN-/i.test(s))
      return { ok: false, error: 'Bu bir topluluk davet kodu. Davetler için sol menüdeki + > Topluluğa katıl kısmını kullan.' };
    return { ok: false, error: 'Adın sonuna # ve 4 haneli kodu da ekle, ör. ' + (s.slice(0, 24) || 'ad') + '#1234' };
  }
  const name = s.slice(0, i).trim();
  const code = s.slice(i + 1).trim();
  if (!name) return { ok: false, error: '# işaretinden önce kişinin adını yaz.' };
  if (!TAG_CODE_RE.test(code)) return { ok: false, error: '# işaretinden sonra 4 haneli bir sayı olmalı, ör. ' + name + '#1234' };
  if (code === '0000') return { ok: false, error: 'Kod 0001 ile 9999 arasında olur.' };
  return { ok: true, name, code };
}

/** Görünen etiket: "ad#1234"; kod yoksa null */
export function tagOf(u: { name?: string; tag?: string } | null | undefined): string | null {
  return u?.name && u.tag && TAG_CODE_RE.test(u.tag) ? `${u.name}#${u.tag}` : null;
}
