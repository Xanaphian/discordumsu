// Kart mesajları: takım ilanı ve anket.
// Sunucuda değişiklik gerekmesin diye kart, mesaj içeriğinde "xn:<tür> {json}" olarak taşınır;
// takım yerleri ve anket oyları "~" ile başlayan tepkilerdir (sunucu tepkiyi zaten saklar ve yayar).
import type { Message } from '../../shared/protocol';

export const CARD_PREFIX = 'xn:';

export interface LfgCard {
  k: 'lfg';
  /** oyun adı */
  g: string;
  /** oyun şablonu (lfgGames.ts); kartın logosu, rengi ve yerleri buna göre */
  gk?: string;
  /** kip / not (ör. Dereceli Çiftli) */
  m?: string;
  /** açıklama */
  n?: string;
  /** yer adları; kişi sayısı kipinde boş adlar ("") */
  s: string[];
  /** ilanı verenin tuttuğu yer */
  own?: number;
  /** ne zaman (ms); yoksa "şimdi" */
  at?: number;
}

export interface PollCard {
  k: 'poll';
  q: string;
  o: string[];
  /** birden çok seçim */
  multi?: boolean;
  /** bitiş zamanı (ms) */
  end?: number;
}

export type Card = LfgCard | PollCard;

export function encodeCard(c: Card): string {
  return CARD_PREFIX + c.k + ' ' + JSON.stringify(c);
}

const cache = new Map<string, Card | null>();
export function parseCard(content: string): Card | null {
  if (!content || !content.startsWith(CARD_PREFIX)) return null;
  const hit = cache.get(content);
  if (hit !== undefined) return hit;
  let out: Card | null = null;
  try {
    const sp = content.indexOf(' ');
    const kind = content.slice(CARD_PREFIX.length, sp);
    const j = JSON.parse(content.slice(sp + 1));
    if (j && j.k === kind) {
      if (kind === 'lfg' && typeof j.g === 'string' && Array.isArray(j.s) && j.s.length >= 2 && j.s.length <= 10) out = j;
      else if (kind === 'poll' && typeof j.q === 'string' && Array.isArray(j.o) && j.o.length >= 2 && j.o.length <= 10) out = j;
    }
  } catch {
    out = null;
  }
  if (cache.size > 500) cache.clear();
  cache.set(content, out);
  return out;
}

/** Bildirim, yanıt önizlemesi ve arama için okunur özet */
export function cardSummary(content: string): string | null {
  const c = parseCard(content);
  if (!c) return null;
  if (c.k === 'lfg') return `🎮 Takım arıyor: ${c.g}${c.m ? ' · ' + c.m : ''}`;
  return `📊 Anket: ${c.q}`;
}

// ---- tepki anahtarları ----
export const slotKey = (i: number) => '~s' + i;
export const voteKey = (i: number) => '~p' + i;
export const isCardReaction = (e: string) => e.startsWith('~');

/** Takım ilanında her yerde kim var (ilan sahibi kendi yerinde) */
export function lfgSlots(m: Message, c: LfgCard): (string | null)[] {
  const taken = new Set<string>();
  return c.s.map((_, i) => {
    if (c.own === i) return taken.add(m.authorId), m.authorId;
    const u = (m.reactions?.[slotKey(i)] || []).find((x) => !taken.has(x) && x !== m.authorId) || null;
    if (u) taken.add(u);
    return u;
  });
}

export function pollVotes(m: Message, c: PollCard): string[][] {
  return c.o.map((_, i) => m.reactions?.[voteKey(i)] || []);
}
