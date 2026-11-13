// Topluluk çıkartmaları: topluluğu yönetenler yükler, üyeler mesajda kullanır.
// Resim sunucunun dosya deposunda durur (/f/...), toplulukta yalnızca adres ve ad tutulur.

export interface Sticker {
  id: string;
  /** görünen ad */
  name: string;
  /** sunucuya göre göreli adres: /f/<id>/<ad> */
  url: string;
  /** ilgili emoji (aramada ve önerilerde kullanılır) */
  tag?: string;
  /** yükleyen */
  by?: string;
}

export const STICKER_MAX = 30;
export const STICKER_NAME_MAX = 30;
export const STICKER_BYTES_MAX = 512 * 1024;

export function sanitizeStickers(v: unknown): Sticker[] {
  if (!Array.isArray(v)) return [];
  const out: Sticker[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const s = x as Record<string, unknown>;
    const id = typeof s.id === 'string' ? s.id.replace(/[^\w-]/g, '').slice(0, 24) : '';
    const url = typeof s.url === 'string' ? s.url : '';
    const name = typeof s.name === 'string' ? s.name.replace(/\s+/g, ' ').trim().slice(0, STICKER_NAME_MAX) : '';
    if (!id || seen.has(id) || !name || !/^\/f\/[\w-]+\/[^\s"'<>|]{1,120}$/.test(url)) continue;
    seen.add(id);
    const st: Sticker = { id, name, url };
    if (typeof s.tag === 'string' && s.tag.trim()) st.tag = s.tag.trim().slice(0, 16);
    if (typeof s.by === 'string') st.by = s.by.slice(0, 40);
    out.push(st);
    if (out.length >= STICKER_MAX) break;
  }
  return out;
}
