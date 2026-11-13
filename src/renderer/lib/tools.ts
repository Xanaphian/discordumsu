// Topluluk araçları (v1.28): öneri panosu, görev panosu, etkinlik planlayıcı, ortak duvar.
// Panodaki her öğe kanalın bir mesajıdır: içerik "xn:<tür> {json}". Oy ve katılım "~" ile başlayan tepkilerdir;
// görev taşıma, öneri durumu gibi değişiklikler mesajı düzenleyerek yapılır (sunucu araç kanallarında buna izin verir).
import { useEffect } from 'react';
import { useStore, connFor, sendMessage, editMessage, toggleReaction, toast, selectChannel, type CMessage } from './store';
import type { ID, Message, ToolType } from '../../shared/protocol';

export const TOOL_PREFIX = 'xn:';

export type IdeaStatus = 'open' | 'plan' | 'doing' | 'done' | 'no';
export interface IdeaItem {
  k: 'idea';
  /** başlık */
  t: string;
  /** açıklama */
  b?: string;
  st?: IdeaStatus;
}
export type TaskCol = 0 | 1 | 2;
export interface TaskItem {
  k: 'task';
  t: string;
  b?: string;
  /** 0 yapılacak, 1 yapılıyor, 2 bitti */
  col: TaskCol;
  /** üstlenen */
  who?: ID;
  /** son tarih (ms) */
  due?: number;
  /** öncelik: 0 normal, 1 yüksek, 2 acil */
  pr?: 0 | 1 | 2;
  /** sütun içi sıra (küçük olan üstte) */
  o?: number;
}
export interface EventItem {
  k: 'event';
  t: string;
  b?: string;
  /** başlangıç (ms) */
  at: number;
  /** süre (dakika) */
  dur?: number;
  /** yer: kanal kimliği ya da serbest metin */
  where?: string;
  /** kapak rengi */
  c?: string;
  /** kişi sınırı (0 = sınırsız) */
  cap?: number;
}
export interface WallItem {
  k: 'wall';
  /** s = çıkartma (emoji), n = not kâğıdı, d = çizim */
  w: 's' | 'n' | 'd';
  x: number;
  y: number;
  /** çıkartma: emoji */
  e?: string;
  /** not: yazı */
  tx?: string;
  /** renk (not kâğıdı ya da kalem) */
  c?: string;
  /** çizim: göreli noktalar [dx,dy,dx,dy…] */
  p?: number[];
  /** boyut (çıkartma) ya da kalınlık (çizim) */
  sz?: number;
  /** döndürme (derece) */
  r?: number;
}
export type ToolItem = IdeaItem | TaskItem | EventItem | WallItem;

export const KIND_OF: Record<ToolType, ToolItem['k']> = { ideas: 'idea', tasks: 'task', events: 'event', wall: 'wall' };

export function encodeItem(it: ToolItem): string {
  return TOOL_PREFIX + it.k + ' ' + JSON.stringify(it);
}

const cache = new Map<string, ToolItem | null>();
export function parseItem(content: string): ToolItem | null {
  if (!content.startsWith(TOOL_PREFIX)) return null;
  const hit = cache.get(content);
  if (hit !== undefined) return hit;
  let out: ToolItem | null = null;
  const sp = content.indexOf(' ');
  if (sp > 0) {
    try {
      const v = JSON.parse(content.slice(sp + 1));
      if (v && typeof v === 'object' && v.k === content.slice(3, sp)) out = v as ToolItem;
    } catch {
      /* bozuk öğe */
    }
  }
  if (cache.size > 4000) cache.clear();
  cache.set(content, out);
  return out;
}

/** Bildirim / önizleme metni (plainText kullanır) */
export function toolSummary(content: string): string | null {
  const it = parseItem(content);
  if (!it) return null;
  switch (it.k) {
    case 'idea':
      return `💡 Yeni öneri: ${it.t}`;
    case 'task':
      return `📋 Görev: ${it.t}`;
    case 'event':
      return `📅 Etkinlik: ${it.t} · ${fmtWhen(it.at)}`;
    case 'wall':
      return it.w === 'n' ? `📝 Duvara not: ${it.tx || ''}` : it.w === 's' ? `Duvara çıkartma yapıştırdı ${it.e || ''}` : 'Duvara çizdi';
  }
}

export interface Entry<T extends ToolItem = ToolItem> {
  m: CMessage;
  it: T;
}

/** Kanaldaki öğeler (yorumlar ayrı: xn olmayan, bir öğeye yanıt olan mesajlar) */
export function entriesOf<T extends ToolItem>(items: CMessage[] | undefined, k: T['k']): Entry<T>[] {
  const out: Entry<T>[] = [];
  if (!items) return out;
  for (const m of items) {
    const it = parseItem(m.content);
    if (it && it.k === k) out.push({ m, it: it as T });
  }
  return out;
}

export const votersOf = (m: Message, key: string) => m.reactions?.[key] || [];

export function addItem(ch: ID, it: ToolItem) {
  sendMessage(ch, encodeItem(it));
}

/** İyimser düzenleme: yerelde hemen uygula, sunucuya gönder */
export function updateItem(m: Message, it: ToolItem) {
  const content = encodeItem(it);
  useStore.setState((s) => {
    const st = s.chans[m.channelId];
    if (!st) return {};
    return { chans: { ...s.chans, [m.channelId]: { ...st, items: st.items.map((x) => (x.id === m.id ? { ...x, content } : x)) } } };
  });
  editMessage(m.channelId, m.id, content);
}

export const vote = (m: Message, key: string) => toggleReaction(m, key);

/** Araç kanalının bütün öğelerini yükle (sunucu `full` biliyorsa tek istek, yoksa sayfa sayfa) */
const loadingAll = new Set<ID>();
export async function loadAll(ch: ID) {
  const conn = connFor(ch);
  if (!conn || loadingAll.has(ch)) return;
  loadingAll.add(ch);
  try {
    let r = await conn.request<{ msgs: Message[]; more: boolean }>({ t: 'hist', ch, rid: '', full: true });
    let msgs = r.msgs;
    for (let i = 0; r.more && i < 30 && msgs.length; i++) {
      r = await conn.request<{ msgs: Message[]; more: boolean }>({ t: 'hist', ch, rid: '', before: msgs[0].id });
      msgs = [...r.msgs, ...msgs];
    }
    useStore.setState((s) => {
      const pend = s.chans[ch]?.items.filter((x) => x.pending) || [];
      return { chans: { ...s.chans, [ch]: { items: [...msgs, ...pend], more: false, loaded: true, loading: false, prepended: 0 } } };
    });
  } catch {
    /* bağlantı yoksa sonra tekrar */
  } finally {
    loadingAll.delete(ch);
  }
}

export function useToolItems(ch: ID) {
  const st = useStore((s) => s.chans[ch]);
  const online = useStore((s) => s.conns[s.commHost[s.chanComm[ch]]]?.status === 'online');
  useEffect(() => {
    if (online) void loadAll(ch);
  }, [ch, online]);
  return st;
}

// ---- tarih yardımcıları ----
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const pad = (n: number) => String(n).padStart(2, '0');
export const MONTH_NAMES = MONTHS;
export const DAY_NAMES = DAYS;
export function fmtWhen(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const dayDiff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (dayDiff === 0) return `Bugün ${hm}`;
  if (dayDiff === 1) return `Yarın ${hm}`;
  if (dayDiff === -1) return `Dün ${hm}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${DAYS[d.getDay()]} ${hm}`;
}
export function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function untilText(ts: number, now = Date.now()) {
  const diff = ts - now;
  if (diff <= 0) return '';
  const min = Math.round(diff / 60000);
  if (min < 60) return `${min} dk sonra`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} saat sonra`;
  return `${Math.round(h / 24)} gün sonra`;
}
/** <input type="datetime-local"> değeri */
export function toLocalInput(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- etkinlik hatırlatmaları ----
// "Katılıyorum" ya da "Belki" denen etkinlikler yerelde tutulur; 15 dakika kala ve başlarken bildirim gelir.
interface Reminder {
  ch: ID;
  id: ID;
  t: string;
  at: number;
  /** gönderilen uyarılar: 1 = 15 dk kala, 2 = başladı */
  sent?: number;
}
const REM_KEY = 'xn.eventReminders';
function readRem(): Record<ID, Reminder> {
  try {
    return JSON.parse(localStorage.getItem(REM_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeRem(r: Record<ID, Reminder>) {
  try {
    localStorage.setItem(REM_KEY, JSON.stringify(r));
  } catch {
    /* yoksay */
  }
}
export function hasReminder(id: ID) {
  return !!readRem()[id];
}
export function setReminder(m: Message, ev: EventItem, on: boolean) {
  const r = readRem();
  if (on) {
    const prev = r[m.id];
    r[m.id] = { ch: m.channelId, id: m.id, t: ev.t, at: ev.at, sent: prev && prev.at === ev.at ? prev.sent : 0 };
  } else delete r[m.id];
  writeRem(r);
}
/** Kanaldaki etkinlik değişince (saat kaydırıldı vb.) hatırlatmayı güncelle */
export function syncReminders(entries: Entry<EventItem>[], me: ID) {
  const r = readRem();
  let changed = false;
  for (const { m, it } of entries) {
    const going = votersOf(m, '~go').includes(me) || votersOf(m, '~maybe').includes(me);
    const cur = r[m.id];
    if (going && (!cur || cur.at !== it.at || cur.t !== it.t)) {
      r[m.id] = { ch: m.channelId, id: m.id, t: it.t, at: it.at, sent: cur && cur.at === it.at ? cur.sent : 0 };
      changed = true;
    } else if (!going && cur) {
      delete r[m.id];
      changed = true;
    }
  }
  if (changed) writeRem(r);
}

function tickReminders() {
  const r = readRem();
  const now = Date.now();
  let changed = false;
  for (const [id, x] of Object.entries(r)) {
    if (now > x.at + 3 * 3600_000) {
      delete r[id];
      changed = true;
      continue;
    }
    const want = now >= x.at ? 2 : now >= x.at - 15 * 60_000 ? 1 : 0;
    if (want > (x.sent || 0)) {
      x.sent = want;
      changed = true;
      const title = want === 2 ? `${x.t} başladı` : `${x.t} 15 dakika sonra`;
      const body = want === 2 ? 'Katılacağını söylediğin etkinlik şimdi başlıyor.' : 'Katılacağını söylediğin etkinlik yaklaşıyor.';
      try {
        window.kovan?.notify({ title, body, tag: x.ch, silent: false });
      } catch {
        /* yoksay */
      }
      toast(`📅 ${title}`, 'info');
    }
  }
  if (changed) writeRem(r);
}
let remTimer: number | undefined;
export function startReminders() {
  if (remTimer) return;
  remTimer = window.setInterval(tickReminders, 30_000);
  setTimeout(tickReminders, 4000);
}

export function openItemChannel(cid: ID, ch: ID) {
  selectChannel(cid, ch);
}
