// Spotify hesabından "şu an çalan" (Discord'un yaptığı gibi): hangi oynatıcıdan dinlenirse dinlensin
// (Spotify masaüstü, telefon, Retrofy gibi Spotify'a bağlı uygulamalar) şarkı ve kapak hesaptan okunur.
// Yetkilendirme PKCE ile yapılır: yalnız Client ID gerekir, gizli anahtar (client secret) hiç kullanılmaz.
// Yenileme jetonu bu bilgisayarda Windows'un şifreli deposunda (safeStorage) saklanır.
import { app, net, safeStorage, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

/** Xanaphian'ın Spotify geliştirici uygulamasının Client ID'si (gizli değildir). Boşsa Ayarlar'dan girilir. */
export const DEFAULT_SPOTIFY_CLIENT_ID = '';
export const SPOTIFY_REDIRECT_PORT = 47833;
export const SPOTIFY_REDIRECT = `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}/spotify`;
const SCOPES = 'user-read-currently-playing user-read-playback-state';
// deneme için sahte Spotify sunucusu (yalnız geliştirme): KOVAN_SPOTIFY_TEST=http://127.0.0.1:port
const TEST = process.env.KOVAN_SPOTIFY_TEST || '';
const ACCOUNTS = TEST || 'https://accounts.spotify.com';
const API = TEST || 'https://api.spotify.com';

export interface SpotifyTrack {
  title: string;
  artist?: string;
  album?: string;
  playing: boolean;
  pos?: number;
  dur?: number;
  at: number;
  /** kapağın internet adresi (activity.ts küçültüp data: adresine çevirir) */
  artUrl?: string;
  url?: string;
}
export interface SpotifyStatus {
  clientId: string;
  defaultClientId: boolean;
  connected: boolean;
  user?: string;
  error?: string;
  redirect: string;
}

interface Saved {
  clientId?: string;
  refresh?: string; // safeStorage ile şifreli (base64)
  user?: string;
}

const file = () => path.join(app.getPath('userData'), 'spotify.json');
let saved: Saved = {};
let access: { token: string; until: number } | null = null;
let lastError: string | undefined;
let timer: NodeJS.Timeout | null = null;
let wanted = false;
let onTrack: (t: SpotifyTrack | null) => void = () => {};
let onStatus: () => void = () => {};
let pending: { server: http.Server; timeout: NodeJS.Timeout } | null = null;

function load() {
  try {
    saved = JSON.parse(fs.readFileSync(file(), 'utf8')) || {};
  } catch {
    saved = {};
  }
}
function save() {
  try {
    fs.writeFileSync(file(), JSON.stringify(saved));
  } catch {
    /* yazılamadı */
  }
}
const enc = (s: string) => (safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(s).toString('base64') : 'p:' + s);
const dec = (s?: string) => {
  if (!s) return undefined;
  try {
    return s.startsWith('e:') ? safeStorage.decryptString(Buffer.from(s.slice(2), 'base64')) : s.startsWith('p:') ? s.slice(2) : undefined;
  } catch {
    return undefined;
  }
};
const clientId = () => (saved.clientId || DEFAULT_SPOTIFY_CLIENT_ID).trim();

export function spotifyStatus(): SpotifyStatus {
  return {
    clientId: saved.clientId || '',
    defaultClientId: !!DEFAULT_SPOTIFY_CLIENT_ID,
    connected: !!saved.refresh && !!clientId(),
    user: saved.user,
    error: lastError,
    redirect: SPOTIFY_REDIRECT,
  };
}

export function initSpotify(track: (t: SpotifyTrack | null) => void, status: () => void) {
  onTrack = track;
  onStatus = status;
  load();
}

/** Etkinlik paylaşımı açıkken yoklama çalışır */
export function setSpotifyPolling(on: boolean) {
  wanted = on;
  if (on && saved.refresh && !timer) schedule(500);
  if (!on && timer) clearTimeout(timer), (timer = null), onTrack(null);
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(poll, ms);
}

async function tokenRequest(body: Record<string, string>): Promise<any> {
  const r = await net.fetch(ACCOUNTS + '/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error_description || j.error || 'HTTP ' + r.status), { code: j.error });
  return j;
}

async function getAccess(): Promise<string | null> {
  if (access && access.until > Date.now() + 30_000) return access.token;
  const rt = dec(saved.refresh);
  if (!rt || !clientId()) return null;
  try {
    const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: rt, client_id: clientId() });
    access = { token: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
    if (j.refresh_token && j.refresh_token !== rt) (saved.refresh = enc(j.refresh_token)), save();
    if (lastError) (lastError = undefined), onStatus();
    return access.token;
  } catch (e: any) {
    if (e.code === 'invalid_grant' || e.code === 'invalid_client') {
      // izin geri alındı ya da Client ID değişti: bağlantıyı düşür
      saved.refresh = undefined;
      save();
      lastError = 'Spotify bağlantısı sona erdi, yeniden bağlan.';
    } else lastError = 'Spotify\'a ulaşılamadı: ' + e.message;
    onStatus();
    return null;
  }
}

async function poll() {
  timer = null;
  if (!wanted || !saved.refresh) return;
  let next = 5000;
  try {
    const tok = await getAccess();
    if (!tok) {
      onTrack(null);
      if (saved.refresh) schedule(60_000);
      return;
    }
    const r = await net.fetch(API + '/v1/me/player/currently-playing', { headers: { authorization: 'Bearer ' + tok } });
    if (r.status === 204) onTrack(null);
    else if (r.status === 401) (access = null), (next = 1000);
    else if (r.status === 429) next = Math.min(120, Number(r.headers.get('retry-after')) || 30) * 1000;
    else if (r.ok) {
      const j: any = await r.json();
      const it = j?.item;
      if (!it || j.currently_playing_type !== 'track') onTrack(null);
      else {
        const imgs: { url: string; width?: number }[] = it.album?.images || [];
        const img = imgs.slice().sort((a, b) => (a.width || 0) - (b.width || 0)).find((x) => (x.width || 0) >= 200) || imgs[0];
        onTrack({
          title: String(it.name || ''),
          artist: (it.artists || []).map((a: any) => a.name).filter(Boolean).join(', ') || undefined,
          album: it.album?.name || undefined,
          playing: !!j.is_playing,
          pos: typeof j.progress_ms === 'number' ? j.progress_ms : undefined,
          dur: typeof it.duration_ms === 'number' ? it.duration_ms : undefined,
          at: Date.now(),
          artUrl: img?.url,
          url: it.external_urls?.spotify,
        });
      }
    } else next = 30_000;
  } catch {
    next = 20_000;
  }
  if (wanted && saved.refresh) schedule(next);
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Tarayıcıda Spotify izin sayfasını açar; dönüşü 127.0.0.1 üzerinden yakalar */
export function spotifyConnect(id?: string): Promise<SpotifyStatus> {
  if (id !== undefined) {
    const clean = String(id).trim();
    if (clean && !/^[0-9a-f]{32}$/i.test(clean)) return Promise.resolve({ ...spotifyStatus(), error: "Client ID 32 karakterlik bir kod olmalı (Spotify panelinde 'Client ID' yazan yer)." });
    if (clean !== (saved.clientId || '')) (saved.clientId = clean || undefined), (saved.refresh = undefined), (access = null), save();
  }
  const cid = clientId();
  if (!cid) return Promise.resolve({ ...spotifyStatus(), error: 'Önce Client ID gir.' });
  cancelPending();
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const st = b64url(crypto.randomBytes(16));
  return new Promise((resolve) => {
    const done = (err?: string) => {
      cancelPending();
      lastError = err;
      onStatus();
      resolve(spotifyStatus());
    };
    const page = (res: http.ServerResponse, ok: boolean, msg: string) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Xanaphian</title><body style="font:16px system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>${ok ? 'Spotify bağlandı' : 'Bağlanamadı'}</h2><p>${msg}</p><p style="opacity:.6">Bu sekmeyi kapatıp Xanaphian'a dönebilirsin.</p></div>`,
      );
    };
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url || '/', SPOTIFY_REDIRECT);
      if (u.pathname !== '/spotify') return res.writeHead(404).end();
      if (u.searchParams.get('state') !== st) return page(res, false, 'Geçersiz istek.');
      const code = u.searchParams.get('code');
      if (!code) {
        page(res, false, 'İzin verilmedi.');
        return done(u.searchParams.get('error') === 'access_denied' ? 'İzin verilmedi.' : 'Spotify hata döndürdü: ' + (u.searchParams.get('error') || ''));
      }
      try {
        const j = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT, client_id: cid, code_verifier: verifier });
        access = { token: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
        saved.refresh = enc(j.refresh_token);
        try {
          const me: any = await (await net.fetch(API + '/v1/me', { headers: { authorization: 'Bearer ' + j.access_token } })).json();
          saved.user = String(me.display_name || me.id || '').slice(0, 64) || undefined;
        } catch {
          /* ad alınamadı */
        }
        save();
        page(res, true, saved.user ? `${saved.user} hesabı Xanaphian'a bağlandı.` : 'Hesap Xanaphian\'a bağlandı.');
        done();
        if (wanted) schedule(300);
      } catch (e: any) {
        page(res, false, e.message);
        done(
          /user not registered|not registered/i.test(e.message)
            ? "Bu Spotify hesabı geliştirici uygulamasının kullanıcı listesinde değil (Spotify panelinde User Management'e ekle)."
            : 'Bağlanamadı: ' + e.message,
        );
      }
    });
    server.on('error', () => done(`${SPOTIFY_REDIRECT_PORT} numaralı yerel bağlantı noktası kullanılıyor; biraz sonra yeniden dene.`));
    server.listen(SPOTIFY_REDIRECT_PORT, '127.0.0.1', () => {
      const q = new URLSearchParams({
        client_id: cid,
        response_type: 'code',
        redirect_uri: SPOTIFY_REDIRECT,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        scope: SCOPES,
        state: st,
      });
      const url = ACCOUNTS + '/authorize?' + q.toString();
      if (TEST) net.fetch(url).catch(() => {});
      else shell.openExternal(url);
    });
    pending = { server, timeout: setTimeout(() => done('Süre doldu: tarayıcıda izin verilmedi.'), 5 * 60_000) };
  });
}

function cancelPending() {
  if (!pending) return;
  clearTimeout(pending.timeout);
  pending.server.close();
  pending = null;
}

export function spotifyDisconnect(): SpotifyStatus {
  cancelPending();
  saved = { clientId: saved.clientId };
  save();
  access = null;
  lastError = undefined;
  if (timer) clearTimeout(timer), (timer = null);
  onTrack(null);
  return spotifyStatus();
}
