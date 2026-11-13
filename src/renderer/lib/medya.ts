// Hazır GIF'ler ve çıkartmalar + mesaj içindeki GIF/çıkartma işaretleri.
// Sunucuda değişiklik gerekmesin diye GIF ve çıkartma mesaj içeriğinde kısa bir işaret olarak taşınır:
//   <gif:gg>                      hazır GIF
//   <st:gg>                       hazır çıkartma
//   <st:/f/<id>/<ad>|Ad>          topluluğun yüklediği çıkartma (resim sunucuda)
import type { Sticker } from '../../shared/stickers';

const gifUrls = import.meta.glob('../assets/medya/gif/*.gif', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const stUrls = import.meta.glob('../assets/medya/cikartma/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urlOf = (all: Record<string, string>, id: string) => Object.entries(all).find(([k]) => k.endsWith('/' + id + '.gif') || k.endsWith('/' + id + '.webp'))?.[1] || '';

export interface MediaItem {
  id: string;
  name: string;
  tags: string[];
  url: string;
}

const GIF_DEFS: [string, string, string][] = [
  ['gg', 'GG', 'gg iyi oyun tebrik maç kazandık'],
  ['haha', 'Hahaha', 'haha gülmek komik kahkaha lol'],
  ['oha', 'Oha', 'oha şaşırdım vay şok'],
  ['kalpler', 'Kalpler', 'kalp sevgi aşk teşekkür'],
  ['ates', 'Yanıyor', 'ateş yanıyor harika süper'],
  ['alkis', 'Alkış', 'alkış bravo tebrik helal'],
  ['tebrikler', 'Tebrikler', 'tebrik kutlama konfeti doğum günü'],
  ['selam', 'Selam', 'selam merhaba hey el sallamak'],
  ['bekliyorum', 'Bekliyorum', 'bekle bekliyorum hadi yükleniyor'],
  ['hadigel', 'Hadi gel', 'hadi gel çabuk oyun ses'],
  ['iyigeceler', 'İyi geceler', 'gece uyku iyi geceler yatıyorum'],
  ['yokartik', 'Yok artık', 'yok artık şaşkın inanmıyorum'],
  ['sinir', 'Sinirlendim', 'sinir kızgın öfke'],
  ['agliyorum', 'Ağlıyorum', 'ağlamak üzgün hüzün'],
  ['kazandik', 'Kazandık', 'kazandık zafer kupa şampiyon'],
  ['tamamdir', 'Tamamdır', 'tamam ok onay anlaştık'],
  ['hayir', 'Nooo', 'hayır no olamaz'],
  ['efsane', 'Efsane', 'efsane harika muhteşem'],
];

const ST_DEFS: [string, string, string][] = [
  ['xanaphian', 'Xanaphian', 'xanaphian yengeç logo'],
  ['gg', 'GG', 'gg iyi oyun'],
  ['arti1', '+1', 'artı bir katılıyorum evet'],
  ['efsane', 'Efsane', 'efsane yıldız harika'],
  ['tamamdir', 'Tamamdır', 'tamam ok onay'],
  ['kral', 'Kral', 'kral taç kraliçe'],
  ['gelburaya', 'Gel buraya', 'gel buraya hadi'],
  ['bekle', 'Bekle', 'bekle dur'],
  ['haklisin', 'Haklısın', 'haklısın doğru katılıyorum'],
  ['ofya', 'Of ya', 'of ya sıkıldım'],
  ['kalp', 'Kalp', 'kalp sevgi aşk'],
  ['ates', 'Ateş', 'ateş yanıyor'],
  ['hehe', 'Hehe', 'hehe gülmek komik'],
  ['uyku', 'Uyku', 'uyku gece zzz'],
  ['tesekkurler', 'Teşekkürler', 'teşekkür sağol'],
  ['kafayok', 'Kafa yok', 'kafa yok yorgun'],
];

export const GIFS: MediaItem[] = GIF_DEFS.map(([id, name, tags]) => ({ id, name, tags: tags.split(' '), url: urlOf(gifUrls, id) })).filter((x) => x.url);
export const STICKERS: MediaItem[] = ST_DEFS.map(([id, name, tags]) => ({ id, name, tags: tags.split(' '), url: urlOf(stUrls, id) })).filter((x) => x.url);
const gifById = new Map(GIFS.map((g) => [g.id, g]));
const stById = new Map(STICKERS.map((g) => [g.id, g]));

/** Türkçe harfleri sadeleştirir: "Ağlıyorum" → "agliyorum" */
export function fold(s: string) {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâî]/g, (ch) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i' })[ch] as string)
    .trim();
}

export function searchMedia<T extends { name: string; tags?: string[]; tag?: string }>(list: T[], q: string): T[] {
  const f = fold(q);
  if (!f) return list;
  return list.filter((x) => fold(x.name).includes(f) || (x.tags || []).some((t) => fold(t).startsWith(f)) || (x.tag ? x.tag === q.trim() : false));
}

// ---------------------------------------------------------------- mesaj işaretleri
export const gifToken = (id: string) => `<gif:${id}>`;
export const stickerToken = (id: string) => `<st:${id}>`;
export const customStickerToken = (s: Pick<Sticker, 'url' | 'name'>) => `<st:${s.url}|${s.name.replace(/[>|]/g, '')}>`;

export type MediaMsg = { kind: 'gif' | 'sticker'; url: string; name: string; local: boolean };

const TOKEN_RE = /^<(gif|st):([^>|\s]+)(?:\|([^>]*))?>$/;
/** Mesajın tamamı bir GIF ya da çıkartma işaretiyse onu çözer */
export function parseMedia(content: string | undefined): MediaMsg | null {
  if (!content || content.length > 300 || content.charCodeAt(0) !== 60) return null;
  const m = TOKEN_RE.exec(content.trim());
  if (!m) return null;
  const [, k, ref, name] = m;
  if (k === 'gif') {
    const g = gifById.get(ref);
    return g ? { kind: 'gif', url: g.url, name: g.name, local: true } : null;
  }
  if (ref.startsWith('/f/')) return { kind: 'sticker', url: ref, name: name || 'Çıkartma', local: false };
  const s = stById.get(ref);
  return s ? { kind: 'sticker', url: s.url, name: s.name, local: true } : null;
}

/** Bildirim ve yanıt önizlemeleri için kısa metin */
export function mediaLabel(content: string): string | null {
  const m = parseMedia(content);
  return m ? (m.kind === 'gif' ? `[GIF: ${m.name}]` : `[Çıkartma: ${m.name}]`) : null;
}

// ---------------------------------------------------------------- son kullanılanlar / favoriler (yalnız bu bilgisayarda)
const KEY = 'kovan.medya';
type Saved = { recentGif: string[]; recentSt: string[]; favGif: string[] };
function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { recentGif: v.recentGif || [], recentSt: v.recentSt || [], favGif: v.favGif || [] };
  } catch {
    return { recentGif: [], recentSt: [], favGif: [] };
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* depolama kapalı olabilir */
  }
}
export function mediaPrefs() {
  return load();
}
export function rememberMedia(kind: 'gif' | 'st', key: string) {
  const s = load();
  const k = kind === 'gif' ? 'recentGif' : 'recentSt';
  s[k] = [key, ...s[k].filter((x) => x !== key)].slice(0, 12);
  save(s);
}
export function toggleFavGif(id: string) {
  const s = load();
  s.favGif = s.favGif.includes(id) ? s.favGif.filter((x) => x !== id) : [id, ...s.favGif].slice(0, 40);
  save(s);
  return s.favGif;
}
