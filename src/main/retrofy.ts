// Retrofy (Spotify'a bağlı üçüncü taraf oynatıcı) Windows medya denetimlerine kaydolmuyor ve pencere başlığında
// şarkıyı göstermiyor. Sesi çalan "soloist" motoru 127.0.0.1 üzerinde bir WebSocket açıyor ve bağlanana anlık
// çalma durumunu (playback_state) gönderiyor. Burada yalnız dinlenir, hiçbir komut gönderilmez; hesap ya da ayar gerekmez.
// Port her açılışta değişir: %APPDATA%\com.vortelly.retrofy\soloist-data\ws.addr / ws.port dosyalarından okunur.
// Not: belgelenmemiş bir iç arayüz; Retrofy güncellenince değişebilir. O zaman yalnız bu kaynak susar.
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import type { SpotifyTrack } from './spotify';

const dataDir = () => path.join(process.env.APPDATA || '', 'com.vortelly.retrofy', 'soloist-data');

let ws: WebSocket | null = null;
let timer: NodeJS.Timeout | null = null;
let wanted = false;
let lastPort = '';
let onTrack: (t: SpotifyTrack | null) => void = () => {};

export function initRetrofy(cb: (t: SpotifyTrack | null) => void) {
  onTrack = cb;
}

/** Etkinlik paylaşımı açıkken (yalnız Windows) Retrofy'yi bekler ve bağlanır */
export function setRetrofyWatch(on: boolean) {
  wanted = on && process.platform === 'win32' && !!process.env.APPDATA;
  if (process.env.KOVAN_RETROFY_TEST) wanted = on;
  if (wanted && !ws && !timer) schedule(1500);
  if (!wanted) {
    if (timer) clearTimeout(timer), (timer = null);
    if (ws) ws.removeAllListeners(), ws.terminate(), (ws = null), onTrack(null);
  }
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tryConnect, ms);
}

function readTarget(): string | null {
  if (process.env.KOVAN_RETROFY_TEST) return process.env.KOVAN_RETROFY_TEST;
  try {
    const port = fs.readFileSync(path.join(dataDir(), 'ws.port'), 'utf8').trim();
    let addr = '127.0.0.1';
    try {
      addr = fs.readFileSync(path.join(dataDir(), 'ws.addr'), 'utf8').trim() || addr;
    } catch {
      /* yalnız port var */
    }
    // yalnız bu bilgisayara bağlan
    if (!/^\d{2,5}$/.test(port) || !/^(127\.0\.0\.1|localhost|\[?::1\]?)$/.test(addr)) return null;
    return `ws://${addr.includes(':') && !addr.startsWith('[') ? `[${addr}]` : addr}:${port}/`;
  } catch {
    return null;
  }
}

function tryConnect() {
  timer = null;
  if (!wanted || ws) return;
  const url = readTarget();
  if (!url) return schedule(15_000);
  lastPort = url;
  let sock: WebSocket;
  try {
    sock = new WebSocket(url, { handshakeTimeout: 3000, perMessageDeflate: false });
  } catch {
    return schedule(15_000);
  }
  ws = sock;
  sock.on('message', (raw) => {
    let f: any;
    try {
      f = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (f?.type === 'playback_state') onTrack(parseState(f));
    else if (f?.type === 'auth_state' && f.logged_in === false) onTrack(null);
  });
  const down = () => {
    if (ws !== sock) return;
    ws = null;
    onTrack(null);
    // Retrofy kapandıysa ya da yeniden açılıp port değiştiyse dosyadan yeniden oku
    if (wanted) schedule(readTarget() !== lastPort ? 1500 : 10_000);
  };
  sock.on('close', down);
  sock.on('error', () => sock.terminate());
}

const nameOf = (x: any): string => String(x?.decorations?.identity?.name || x?.entity?.decorations?.identity?.name || x?.name || '').trim();

export function parseState(f: any): SpotifyTrack | null {
  const it = f?.item;
  if (!it) return null;
  const title = nameOf(it);
  if (!title) return null;
  const artists = (Array.isArray(it.creators) ? it.creators : []).map((c: any) => nameOf(c.entity || c)).filter(Boolean);
  const album = nameOf(it.decorations?.parent?.entity || it.decorations?.parent);
  const covers: { url?: string; size?: string; width?: number }[] = Array.isArray(it.decorations?.visual_identity?.cover) ? it.decorations.visual_identity.cover : [];
  const order: Record<string, number> = { default: 0, large: 1, small: 2, xlarge: 3 };
  const rank = (c: { size?: string; width?: number }) => (c.width ? Math.abs(c.width - 300) : (order[String(c.size)] ?? 4));
  const okUrl = (u: string) => /^https:\/\//.test(u) || (!!process.env.KOVAN_RETROFY_TEST && u.startsWith('http://127.0.0.1'));
  const cover = covers.filter((c) => typeof c.url === 'string' && okUrl(c.url)).sort((a, b) => rank(a) - rank(b))[0];
  const pos = Number(f.position?.position_ms);
  const ts = Number(f.position?.timestamp_ms);
  const playing = String(f.status || '').toLowerCase() === 'playing';
  const now = Date.now();
  // konum timestamp_ms anında ölçülmüş; saat kayması makulse ileri sar
  const drift = isFinite(ts) && ts > 1e12 && Math.abs(now - ts) < 60_000 ? now - ts : 0;
  const dur = Number(it.playback?.duration_ms);
  const uri = typeof it.uri === 'string' ? it.uri : '';
  return {
    title: title.slice(0, 200),
    artist: artists.join(', ').slice(0, 200) || undefined,
    album: album || undefined,
    playing,
    pos: isFinite(pos) ? Math.max(0, pos + (playing ? drift : 0)) : undefined,
    dur: isFinite(dur) && dur > 0 ? dur : undefined,
    at: now,
    artUrl: cover?.url,
    url: /^spotify:track:[A-Za-z0-9]+$/.test(uri) ? 'https://open.spotify.com/track/' + uri.split(':')[2] : undefined,
  };
}
