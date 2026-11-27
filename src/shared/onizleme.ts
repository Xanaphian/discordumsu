// Bağlantı önizlemesi: iki tarafın (uygulama + sunucu) ortak türü ve sayfa ayrıştırıcısı.
// v1.67'den beri önizlemeyi sunucu getirir: mesajdaki bağlantının sitesi kullanıcının değil sunucunun adresini görür.

/** Sunucu "önizlemeyi ben getiririm" diyor (eski sunucuda yok: uygulama kendisi getirir) */
export const FEAT_LINKMETA = 'onizleme';

export interface LinkMeta {
  url: string;
  site?: string;
  title?: string;
  desc?: string;
  /** data URL (uygulama gösterirken küçültür) */
  image?: string;
  imageW?: number;
  imageH?: number;
  color?: string;
  icon?: string;
  /** adres doğrudan bir görsel */
  direct?: boolean;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] !== '#') return ENT[e.toLowerCase()] ?? m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x !== undefined);
const clean = (s: string | undefined, max: number) => (s ? decodeEntities(s).replace(/\s+/g, ' ').trim().slice(0, max) : undefined) || undefined;

/**
 * Sayfanın <head> kısmından Open Graph bilgilerini çıkarır. Görseli getirmez: adresini döndürür.
 * `raw` kullanıcının yazdığı adres, `pageUrl` yönlendirmelerden sonra varılan adres.
 */
export function parseLinkMeta(html: string, pageUrl: string, raw: string): { meta: LinkMeta; imageUrl?: string } {
  const head = html.split(/<\/head>/i)[0].slice(0, 300_000);
  const metas = head.match(/<meta\b[^>]*>/gi) || [];
  const get = (...keys: string[]) => {
    for (const k of keys)
      for (const tag of metas) {
        const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
        if (key === k) {
          const v = attr(tag, 'content');
          if (v) return v;
        }
      }
    return undefined;
  };
  const meta: LinkMeta = { url: raw };
  let host = '';
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    /* geçersiz adres */
  }
  meta.site = clean(get('og:site_name', 'application-name', 'twitter:site'), 60) || host || undefined;
  meta.title = clean(get('og:title', 'twitter:title') || head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 160);
  meta.desc = clean(get('og:description', 'twitter:description', 'description'), 300);
  const color = get('theme-color');
  if (color && /^#[0-9a-f]{3,8}$/i.test(color.trim())) meta.color = color.trim();
  const img = get('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
  let imageUrl: string | undefined;
  if (img) {
    try {
      const u = new URL(decodeEntities(img), pageUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') imageUrl = u.toString();
    } catch {
      /* geçersiz adres */
    }
  }
  return { meta, imageUrl };
}
