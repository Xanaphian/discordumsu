// Anlık etkinlik: bilgisayarda algılanan oyun / müzik / yayın -> gizlilik ayarları -> sunuculara yayılır.
// Başkalarının etkinlikleri presence çerçeveleriyle gelir. Son 30 günün özeti profile ("recent") yazılır.
import { create } from 'zustand';
import type { ID } from '../../shared/protocol';
import type { LiveActivity, RecentActivity } from '../../shared/profile';
import { IS_POPOUT } from './popout';
import { useStore, actHooks, sendAll, sendHost, updateProfile, toast, type Settings } from './store';

export interface DetectedState {
  supported: boolean;
  mediaOk?: boolean;
  sessions?: string[];
  mediaErr?: string;
  game: { name: string; exe: string; start?: number; icon?: string; details?: string; state?: string; matchStart?: number } | null;
  media: {
    app: string;
    src: string;
    appName: string;
    title: string;
    artist?: string;
    album?: string;
    playing: boolean;
    pos?: number;
    dur?: number;
    at?: number;
    art?: string;
  } | null;
  streams: { svc: 'kick' | 'twitch'; name: string; live: boolean; title?: string; category?: string; viewers?: number; start?: number; url: string }[];
  spotify?: SpotifyStatus;
  mediaFrom?: 'account' | 'windows';
}
export type SpotifyStatus = { clientId: string; defaultClientId: boolean; connected: boolean; user?: string; error?: string; redirect: string };

interface ActState {
  /** "Beraber dinle": takip edilen kişi */
  along: ID | null;
  /** herkesin anlık etkinliği (kendimiz dahil) */
  acts: Record<ID, LiveActivity[]>;
  /** bu bilgisayarda algılanan (gizlilikten önce) */
  detected: DetectedState | null;
}

export const useActs = create<ActState>(() => ({ acts: {}, detected: null, along: null }));
const A = () => useActs.getState();
const S = () => useStore.getState();

const EMPTY: LiveActivity[] = [];
export function useActsOf(uid: ID | undefined): LiveActivity[] {
  return useActs((s) => (uid && s.acts[uid]) || EMPTY);
}

let mine: LiveActivity[] = [];
let mineSig = '[]';

actHooks.onReady = (host, f) => {
  if (f.acts !== undefined) {
    const next = { ...A().acts };
    for (const uid of Object.keys(f.presence)) {
      if (uid === S().me.id) continue;
      const a = f.acts[uid];
      if (a?.length) next[uid] = a;
      else delete next[uid];
    }
    useActs.setState({ acts: next });
  }
  // bağlanınca kendi etkinliğimizi bildir
  if (mine.length) sendHost(host, { t: 'activity', acts: mine });
};

actHooks.onPresence = (f) => {
  if (f.uid === S().me.id) return;
  if (f.acts === undefined && f.status !== 'offline') return;
  const a = f.status === 'offline' ? [] : f.acts || [];
  const cur = A().acts[f.uid];
  if (!cur && !a.length) return;
  const next = { ...A().acts };
  if (a.length) next[f.uid] = a;
  else delete next[f.uid];
  useActs.setState({ acts: next });
};

/** Gizlilik ayarlarına göre paylaşılacak etkinlikler */
function build(d: DetectedState | null, st: Settings): LiveActivity[] {
  if (!d || !st.actShare) return [];
  const out: LiveActivity[] = [];
  const accounts = S().me.extra?.accounts || [];
  if (st.actStream)
    for (const s of d.streams)
      if (s.live)
        out.push({
          kind: 'streaming',
          name: s.svc === 'kick' ? 'Kick' : 'Twitch',
          details: s.title || undefined,
          state: s.category || undefined,
          start: s.start,
          url: s.url,
          src: s.svc,
          viewers: s.viewers,
        });
  const g = d.game;
  if (st.actGames && g && !st.hiddenGames.includes(g.name)) {
    const a: LiveActivity = { kind: 'playing', name: g.name, details: g.details, state: g.state, start: g.matchStart || g.start, icon: g.icon, src: 'game' };
    const riot = accounts.find((x) => x.svc === 'riot');
    if (riot && /league of legends|teamfight/i.test(g.name)) a.url = riotUrl(riot.name, riot.region);
    out.push(a);
  }
  const m = d.media;
  if (st.actMusic && m && m.playing && (m.src !== 'browser' || st.actBrowser)) {
    const start = m.pos !== undefined && m.at ? Math.round(m.at - m.pos) : undefined;
    out.push({
      kind: 'listening',
      name: m.appName,
      details: m.title,
      state: m.artist || m.album || undefined,
      start,
      end: start && m.dur ? start + m.dur : undefined,
      art: m.art,
      src: m.src,
    });
  }
  return out.slice(0, 3);
}

export function riotUrl(name: string, region?: string) {
  const [n, tag] = name.split('#');
  return `https://xanaphian.com/summoner/${region || 'tr'}/${encodeURIComponent((n || '').trim())}-${encodeURIComponent((tag || region || 'TR1').trim())}`;
}

/** Spotify konumu her örnekte birkaç ms kayar; gereksiz yayını önlemek için başlangıcı yuvarla */
const sig = (a: LiveActivity[]) => JSON.stringify(a.map((x) => ({ ...x, start: x.start && Math.round(x.start / 5000), end: x.end && Math.round(x.end / 5000) })));

function recompute() {
  const st = S().settings;
  const next = build(A().detected, st);
  const s = sig(next);
  if (s === mineSig) return;
  mineSig = s;
  mine = next;
  const me = S().me.id;
  if (me) {
    const acts = { ...A().acts };
    if (next.length) acts[me] = next;
    else delete acts[me];
    useActs.setState({ acts });
  }
  sendAll({ t: 'activity', acts: next });
  trackRecent();
}

// ---------------------------------------------------------------------------
// Son etkinlik: yerelde tutulur, özeti profile yazılır
interface RecentRow {
  kind: RecentActivity['kind'];
  name: string;
  ts: number;
  /** gün -> dakika */
  days: Record<string, number>;
}
const RKEY = 'kovan.recent';
const DAY = 86_400_000;
const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function loadRecent(): RecentRow[] {
  try {
    const r = JSON.parse(localStorage.getItem(RKEY) || '[]');
    // eski sürümler uygulamanın kendi sesini "com.xanaphian.kovan dinledi" diye kaydediyordu
    return Array.isArray(r) ? r.filter((x) => x && !/xanaphian|kovan/i.test(String(x.name))) : [];
  } catch {
    return [];
  }
}
function saveRecent(r: RecentRow[]) {
  try {
    localStorage.setItem(RKEY, JSON.stringify(r));
  } catch {
    /* depolama dolu */
  }
}

let lastTick = Date.now();
/** Her dakika: şu an süren etkinliklere süre ekler */
function tickRecent() {
  const now = Date.now();
  const mins = Math.min(5, Math.max(0, (now - lastTick) / 60_000));
  lastTick = now;
  if (!mine.length) return;
  const rows = loadRecent();
  const k = dayKey(now);
  for (const a of mine) {
    if (a.kind === 'watching') continue;
    const name = a.name;
    let r = rows.find((x) => x.kind === a.kind && x.name === name);
    if (!r) rows.push((r = { kind: a.kind, name, ts: now, days: {} }));
    r.ts = now;
    r.days[k] = (r.days[k] || 0) + mins;
  }
  // 30 günden eskileri at
  const cutoff = now - 30 * DAY;
  const kept = rows
    .filter((r) => r.ts >= cutoff)
    .map((r) => ({ ...r, days: Object.fromEntries(Object.entries(r.days).filter(([d]) => Date.parse(d) >= cutoff - DAY)) }));
  saveRecent(kept);
}

function trackRecent() {
  tickRecent();
  publishRecent();
}

function summarize(rows: RecentRow[]): RecentActivity[] {
  const now = Date.now();
  return rows
    .filter((r) => r.ts >= now - 30 * DAY)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8)
    .map((r) => {
      const mins = Math.round(Object.values(r.days).reduce((x, y) => x + y, 0));
      let streak = 0;
      for (let i = 0; i < 60; i++) {
        const k = dayKey(now - i * DAY);
        if (r.days[k]) streak++;
        else if (i > 0) break;
      }
      const out: RecentActivity = { kind: r.kind, name: r.name, ts: Math.round(r.ts / 60_000) * 60_000 };
      if (mins > 0) out.mins = mins;
      if (streak > 1) out.streak = streak;
      return out;
    });
}

let pubTimer: ReturnType<typeof setTimeout> | null = null;
const wantRecent = () => {
  const st = S();
  return st.settings.actRecent && st.settings.actShare ? summarize(loadRecent()) : [];
};
function runPublish() {
  pubTimer = null;
  const st = S();
  if (!st.booted || !st.me.id) return;
  const want = wantRecent();
  const have = st.me.extra?.recent || [];
  if (JSON.stringify(want) === JSON.stringify(have)) return;
  updateProfile({ extra: { ...st.me.extra, recent: want.length ? want : undefined } });
}
/** Profildeki özeti günceller: liste değişince birkaç saniye içinde, yalnız süreler değişince en çok 10 dakikada bir */
function publishRecent(force = false) {
  const names = (r: RecentActivity[]) => JSON.stringify(r.map((x) => [x.kind, x.name]));
  const soon = force || names(wantRecent()) !== names(S().me.extra?.recent || []);
  if (soon) {
    if (pubTimer) clearTimeout(pubTimer);
    pubTimer = setTimeout(runPublish, 3000);
  } else if (!pubTimer) pubTimer = setTimeout(runPublish, 10 * 60_000);
}

/** Ayarlardaki "son etkinliği temizle" */
export function clearRecent() {
  saveRecent([]);
  const st = S();
  if (st.me.extra?.recent) updateProfile({ extra: { ...st.me.extra, recent: undefined } });
}

// ---------------------------------------------------------------------------
function configureMain() {
  const st = S();
  const s = st.settings;
  const streams = s.actStream
    ? (st.me.extra?.accounts || []).filter((a) => a.svc === 'kick' || a.svc === 'twitch').map((a) => ({ svc: a.svc as 'kick' | 'twitch', name: a.name }))
    : [];
  const enabled = s.actShare && (s.actGames || s.actMusic || streams.length > 0);
  window.kovan.activity
    .configure({ enabled, customGames: s.customGames, streams })
    .then((d: DetectedState) => {
      useActs.setState({ detected: d });
      recompute();
    })
    .catch(() => {});
}

/** "Oyun ekle" penceresi için açık uygulamalar */
export const runningApps = (): Promise<{ exe: string; title: string; path?: string; icon?: string; game?: string }[]> => window.kovan.activity.apps();

let started = false;
function start() {
  if (started || IS_POPOUT) return; // ayrı pencere etkinlik göndermez (ana pencere gönderir)
  started = true;
  window.kovan.activity.onUpdate((d: DetectedState) => {
    useActs.setState({ detected: d });
    recompute();
  });
  configureMain();
  let prev = S();
  useStore.subscribe((s) => {
    const a = prev.settings, b = s.settings;
    const accChanged = prev.me.extra?.accounts !== s.me.extra?.accounts;
    const statusChanged = prev.me.status !== s.me.status;
    prev = s;
    if (
      accChanged ||
      a.actShare !== b.actShare ||
      a.actGames !== b.actGames ||
      a.actMusic !== b.actMusic ||
      a.actStream !== b.actStream ||
      a.customGames !== b.customGames
    )
      configureMain();
    if (a.actBrowser !== b.actBrowser || a.hiddenGames !== b.hiddenGames || accChanged) recompute();
    if (a.actRecent !== b.actRecent || a.actShare !== b.actShare) publishRecent(true);
    if (statusChanged) {
      // görünmezken kendi kartımızda da gösterme
      const acts = { ...A().acts };
      if (s.me.status === 'invisible') delete acts[s.me.id];
      else if (mine.length) acts[s.me.id] = mine;
      useActs.setState({ acts });
    }
  });
  setInterval(() => (tickRecent(), mine.length && publishRecent()), 60_000);
}

if (S().booted) start();
else {
  const un = useStore.subscribe((s) => {
    if (s.booted && s.me.id) {
      un();
      start();
    }
  });
}

// ---------------------------------------------------------------------------
// Beraber dinle: takip edilen kişinin şarkısı değiştikçe kendi Spotify'ında açılır.
export function spotifyUri(a: LiveActivity) {
  const q = [a.details, a.state].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return 'spotify:search:' + encodeURIComponent(q);
}
export function openInSpotify(a: LiveActivity) {
  window.kovan.openExternal(spotifyUri(a));
}
const songOf = (uid: ID) => A().acts[uid]?.find((x) => x.kind === 'listening');
let alongKey = '';
export function startAlong(uid: ID) {
  const a = songOf(uid);
  if (!a) return;
  alongKey = (a.details || '') + '|' + (a.state || '');
  useActs.setState({ along: uid });
  openInSpotify(a);
}
export function stopAlong() {
  alongKey = '';
  useActs.setState({ along: null });
}
useActs.subscribe((s, prev) => {
  if (!s.along || s.acts === prev.acts) return;
  const a = songOf(s.along);
  if (!a) {
    // dinlemeyi bıraktı ya da çevrimdışı oldu
    toast('Beraber dinleme bitti: karşı taraf müziği durdurdu.', 'info');
    return stopAlong();
  }
  const key = (a.details || '') + '|' + (a.state || '');
  if (key !== alongKey) {
    alongKey = key;
    openInSpotify(a);
  }
});
