// Mesaj taslakları: kanal başına yarım kalan yazı. Uygulama kapanıp açılınca kaybolmaz
// (localStorage), kanal listesi taslağı olan kanalı kalem simgesiyle gösterir.
import { useSyncExternalStore } from 'react';

const KEY = 'xn.taslaklar';
const MAX_CHANS = 60;
const MAX_LEN = 4000;

function load(): Map<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const m = new Map<string, string>();
    if (raw && typeof raw === 'object') for (const k of Object.keys(raw)) if (typeof raw[k] === 'string' && raw[k]) m.set(k, raw[k]);
    return m;
  } catch {
    return new Map();
  }
}

const map = load();
const subs = new Set<() => void>();
let saveT: ReturnType<typeof setTimeout> | null = null;

function save() {
  saveT = null;
  try {
    // en son yazılanlar sonda durur; sınır aşılırsa en eskiler düşer
    const entries = [...map.entries()].slice(-MAX_CHANS);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* depolama dolu ya da kapalı: taslak yalnız bu oturumda kalır */
  }
}

function changed(hadBefore: boolean, hasNow: boolean) {
  if (!saveT) saveT = setTimeout(save, 400);
  if (hadBefore !== hasNow) subs.forEach((f) => f());
}

export const drafts = {
  get: (ch: string) => map.get(ch),
  set(ch: string, text: string) {
    const had = map.has(ch);
    if (!text.trim()) {
      if (had) map.delete(ch), changed(true, false);
      return;
    }
    if (map.get(ch) === text) return;
    map.delete(ch); // sona taşı
    map.set(ch, text.slice(0, MAX_LEN));
    changed(had, true);
  },
  delete(ch: string) {
    if (map.delete(ch)) changed(true, false);
  },
  has: (ch: string) => map.has(ch),
};

window.addEventListener('beforeunload', () => saveT && save());

const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f));

/** Kanalda gönderilmemiş taslak var mı (kanal listesindeki kalem simgesi için). */
export function useHasDraft(ch: string): boolean {
  return useSyncExternalStore(subscribe, () => map.has(ch));
}
