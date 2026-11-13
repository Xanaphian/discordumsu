// Kaydedilen mesajlar ve zamanlanmış mesajlar. İkisi de yalnız bu bilgisayarda tutulur;
// zamanlanmış mesaj, uygulama açıkken vakti gelince gönderilir (kapalıysa açılınca hemen).
import { create } from 'zustand';
import type { ID, Message } from '../../shared/protocol';
import { useStore, sendMessage, connFor, toast, plainText } from './store';
import { cardSummary } from './cards';

export interface SavedMsg {
  cid: ID;
  ch: ID;
  id: ID;
  author: ID;
  text: string;
  ts: number;
  savedAt: number;
}
export interface ScheduledMsg {
  id: string;
  cid: ID;
  ch: ID;
  content: string;
  at: number;
}

const SAVED_KEY = 'kovan.saved';
const SCHED_KEY = 'kovan.scheduled';

function load<T>(k: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(k) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function store(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* depolama dolu ya da kapalı */
  }
}

export const useLater = create<{ saved: SavedMsg[]; scheduled: ScheduledMsg[] }>(() => ({
  saved: load<SavedMsg>(SAVED_KEY),
  scheduled: load<ScheduledMsg>(SCHED_KEY),
}));
useLater.subscribe((s, p) => {
  if (s.saved !== p.saved) store(SAVED_KEY, s.saved);
  if (s.scheduled !== p.scheduled) store(SCHED_KEY, s.scheduled);
});

export const isSaved = (saved: SavedMsg[], id: ID) => saved.some((x) => x.id === id);

export function toggleSaved(cid: ID, m: Message) {
  const { saved } = useLater.getState();
  if (isSaved(saved, m.id)) {
    useLater.setState({ saved: saved.filter((x) => x.id !== m.id) });
    return false;
  }
  const c = useStore.getState().communities[cid];
  const text = (cardSummary(m.content) || plainText(m.content, c)).slice(0, 400) || (m.attachments?.length ? '📎 ' + m.attachments[0].name : '');
  useLater.setState({ saved: [{ cid, ch: m.channelId, id: m.id, author: m.authorId, text, ts: m.ts, savedAt: Date.now() }, ...saved].slice(0, 300) });
  toast('Mesaj kaydedildi. Kanal başlığındaki yer imi simgesinden bulabilirsin.', 'ok');
  return true;
}

export const removeSaved = (id: ID) => useLater.setState((s) => ({ saved: s.saved.filter((x) => x.id !== id) }));

export function schedule(cid: ID, ch: ID, content: string, at: number) {
  const item: ScheduledMsg = { id: Math.random().toString(36).slice(2, 10), cid, ch, content, at };
  useLater.setState((s) => ({ scheduled: [...s.scheduled, item].sort((a, b) => a.at - b.at) }));
}
export const unschedule = (id: string) => useLater.setState((s) => ({ scheduled: s.scheduled.filter((x) => x.id !== id) }));

function tick() {
  const now = Date.now();
  const { scheduled } = useLater.getState();
  const due = scheduled.filter((x) => x.at <= now);
  if (!due.length) return;
  const sent: string[] = [];
  for (const x of due) {
    const conn = connFor(x.ch);
    // bağlantı kurulmamışsa bir sonraki turda dene
    if (!conn || conn.status !== 'online') continue;
    sendMessage(x.ch, x.content);
    sent.push(x.id);
  }
  if (sent.length) {
    useLater.setState((s) => ({ scheduled: s.scheduled.filter((x) => !sent.includes(x.id)) }));
    toast(sent.length === 1 ? 'Zamanlanmış mesajın gönderildi.' : `${sent.length} zamanlanmış mesaj gönderildi.`, 'ok');
  }
}

let started = false;
export function startLater() {
  if (started) return;
  started = true;
  setInterval(tick, 10_000);
  setTimeout(tick, 4000);
}

/** Hazır zaman seçenekleri */
export function presets(now = new Date()): { label: string; at: number }[] {
  const out: { label: string; at: number }[] = [
    { label: '30 dakika sonra', at: now.getTime() + 30 * 60_000 },
    { label: '1 saat sonra', at: now.getTime() + 60 * 60_000 },
  ];
  const evening = new Date(now);
  evening.setHours(21, 0, 0, 0);
  if (evening.getTime() - now.getTime() > 60 * 60_000) out.push({ label: 'Bu akşam 21:00', at: evening.getTime() });
  const morning = new Date(now);
  morning.setDate(morning.getDate() + 1);
  morning.setHours(9, 0, 0, 0);
  out.push({ label: 'Yarın 09:00', at: morning.getTime() });
  return out;
}

startLater();
