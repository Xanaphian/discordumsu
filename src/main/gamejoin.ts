// Takım ilanından oyuna katılma.
// LoL: League istemcisinin yerel API'si (LCU, 127.0.0.1 + lockfile parolası). İlan sahibi katılana lobi daveti
// gönderir, katılanın uygulaması gelen daveti kendiliğinden kabul eder. Resmi olmayan ama istemcinin kendi
// arayüzünün kullandığı yerel bağlantıdır; yalnız bu bilgisayardaki istemciyle konuşur.
// Steam (CS2, Dota 2): steam://friends/joingame/<SteamID64> ile arkadaşın oyununa/lobisine katılma.
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { shell } from 'electron';

const isWin = process.platform === 'win32';
const agent = new https.Agent({ rejectUnauthorized: false });

interface Lcu {
  port: number;
  pass: string;
}
let cached: { lcu: Lcu; at: number } | null = null;

function readLockfile(p: string): Lcu | null {
  try {
    const [, , port, pass] = fs.readFileSync(p, 'utf8').split(':');
    if (port && pass) return { port: Number(port), pass };
  } catch {
    /* yok */
  }
  return null;
}

/** Açık LeagueClientUx sürecinin komut satırından port ve parola */
function fromProcess(): Promise<Lcu | null> {
  if (!isWin) return Promise.resolve(null);
  return new Promise((resolve) => {
    const c = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', "(Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\").CommandLine"],
      { windowsHide: true },
    );
    let out = '';
    c.stdout.setEncoding('utf8');
    c.stdout.on('data', (d) => (out += d));
    c.on('close', () => {
      const port = /--app-port=(\d+)/.exec(out)?.[1];
      const pass = /--remoting-auth-token=([\w-]+)/.exec(out)?.[1];
      if (port && pass) return resolve({ port: Number(port), pass });
      const dir = /--install-directory=([^"]+?)"/.exec(out)?.[1];
      resolve(dir ? readLockfile(path.join(dir.trim(), 'lockfile')) : null);
    });
    c.on('error', () => resolve(null));
    setTimeout(() => c.kill(), 8000);
  });
}

async function lcu(): Promise<Lcu | null> {
  if (cached && Date.now() - cached.at < 30_000) return cached.lcu;
  let l = readLockfile('C:\\Riot Games\\League of Legends\\lockfile') || (await fromProcess());
  if (l) cached = { lcu: l, at: Date.now() };
  else cached = null;
  return l;
}

function req(l: Lcu, method: string, p: string, body?: unknown): Promise<{ status: number; data: any }> {
  return new Promise((resolve) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const r = https.request(
      {
        host: '127.0.0.1',
        port: l.port,
        path: p,
        method,
        agent,
        timeout: 5000,
        headers: {
          Authorization: 'Basic ' + Buffer.from('riot:' + l.pass).toString('base64'),
          Accept: 'application/json',
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let b = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          let j: any = null;
          try {
            j = b ? JSON.parse(b) : null;
          } catch {
            j = b;
          }
          resolve({ status: res.statusCode || 0, data: j });
        });
      },
    );
    r.on('error', () => (cached = null, resolve({ status: 0, data: null })));
    r.on('timeout', () => (r.destroy(), resolve({ status: 0, data: null })));
    if (data) r.write(data);
    r.end();
  });
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

export interface LolState {
  running: boolean;
  me?: string;
  lobby: boolean;
}

export async function lolState(): Promise<LolState> {
  if (process.env.KOVAN_FAKE_LOBBY) return { running: true, lobby: process.env.KOVAN_FAKE_LOBBY === '1', me: 'Xanaphian#TR1' };
  const l = await lcu();
  if (!l) return { running: false, lobby: false };
  const me = await req(l, 'GET', '/lol-summoner/v1/current-summoner');
  if (me.status !== 200) return { running: false, lobby: false };
  const lobby = await req(l, 'GET', '/lol-lobby/v2/lobby');
  const id = me.data?.gameName ? `${me.data.gameName}#${me.data.tagLine}` : me.data?.displayName;
  return { running: true, me: id, lobby: lobby.status === 200 };
}

/** Riot ID (Ad#Etiket) -> sihirdar kimliği */
async function summonerId(l: Lcu, riotId: string): Promise<number | null> {
  const [name, tag] = riotId.split('#');
  if (tag) {
    const r = await req(l, 'GET', `/lol-summoner/v1/alias/lookup?gameName=${encodeURIComponent(name)}&tagLine=${encodeURIComponent(tag)}`);
    const puuid = r.data?.puuid;
    if (r.status === 200 && puuid) {
      const s = await req(l, 'GET', `/lol-summoner/v2/summoners/puuid/${puuid}`);
      if (s.status === 200 && s.data?.summonerId) return s.data.summonerId;
    }
  }
  const s = await req(l, 'GET', `/lol-summoner/v1/summoners?name=${encodeURIComponent(riotId)}`);
  return s.status === 200 && s.data?.summonerId ? s.data.summonerId : null;
}

/** İlan sahibi: katılana lobi daveti gönder */
export async function lolInvite(riotId: string): Promise<{ ok: boolean; error?: string }> {
  const l = await lcu();
  if (!l) return { ok: false, error: 'LoL istemcisi açık değil.' };
  const lobby = await req(l, 'GET', '/lol-lobby/v2/lobby');
  if (lobby.status !== 200) return { ok: false, error: 'LoL istemcisinde açık bir lobin yok. Önce lobi kur.' };
  const id = await summonerId(l, riotId);
  if (!id) return { ok: false, error: `${riotId} bulunamadı.` };
  const r = await req(l, 'POST', '/lol-lobby/v2/lobby/invitations', [{ toSummonerId: id }]);
  return r.status >= 200 && r.status < 300 ? { ok: true } : { ok: false, error: 'Davet gönderilemedi.' };
}

/** Katılan: ilan sahibinden gelen daveti bekle ve kabul et */
const waiting = new Map<string, NodeJS.Timeout>();
export async function lolAccept(fromRiotId: string, ms = 90_000): Promise<{ ok: boolean; error?: string }> {
  const l0 = await lcu();
  if (!l0) return { ok: false, error: 'LoL istemcisi açık değil.' };
  const key = norm(fromRiotId);
  const name = norm(fromRiotId.split('#')[0]);
  if (waiting.has(key)) clearTimeout(waiting.get(key)!);
  const end = Date.now() + ms;
  return new Promise((resolve) => {
    const tick = async () => {
      const l = await lcu();
      if (l) {
        const r = await req(l, 'GET', '/lol-lobby/v2/received-invitations');
        const inv = Array.isArray(r.data)
          ? r.data.find((x: any) => x?.state === 'Pending' && [x.fromSummonerName, x.fromGameName && `${x.fromGameName}#${x.fromTagLine}`].some((n) => n && (norm(n) === key || norm(n) === name)))
          : null;
        if (inv) {
          waiting.delete(key);
          const a = await req(l, 'POST', `/lol-lobby/v2/received-invitations/${inv.invitationId}/accept`);
          return resolve(a.status >= 200 && a.status < 300 ? { ok: true } : { ok: false, error: 'Davet kabul edilemedi.' });
        }
      }
      if (Date.now() > end) {
        waiting.delete(key);
        return resolve({ ok: false, error: 'Davet gelmedi.' });
      }
      waiting.set(key, setTimeout(tick, 2000));
    };
    tick();
  });
}

/** Steam: arkadaşın oyununa katıl (SteamID64 ya da profil adresi) */
export function steamJoin(id: string): boolean {
  const m = /(\d{17})/.exec(id);
  if (m) {
    shell.openExternal('steam://friends/joingame/' + m[1]);
    return true;
  }
  return false;
}
