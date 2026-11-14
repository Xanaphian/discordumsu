// Sınamalar için ortak yardımcılar: derlenmiş sunucuyu geçici bir veri klasörüyle açar,
// sahte kişileri WebSocket üzerinden bağlar. Ek paket gerektirmez (projedeki 'ws' yeterli).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SERVER_JS = path.join(ROOT, 'server/paket/kovan-server.js');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Boş bir port bulur (sınamalar aynı anda çalışınca çakışmasın) */
function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

/**
 * Sunucuyu açar. env ile ortam değişkeni verilebilir (ör. { KOVAN_ADMINS: 'x' }).
 * Dönen nesne: { url, port, dir, stop(), restart() }
 */
export async function startServer(env = {}) {
  if (!fs.existsSync(SERVER_JS)) throw new Error('Önce sunucuyu derle: npm run build:server');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kovan-sinama-'));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  let proc = null;
  let log = '';
  const open = async () => {
    proc = spawn(process.execPath, [SERVER_JS], {
      env: { ...process.env, KOVAN_PORT: String(port), KOVAN_HOST: '127.0.0.1', KOVAN_DATA: path.join(dir, 'data'), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const keep = (d) => (log = (log + d).slice(-8000));
    proc.stdout.on('data', keep);
    proc.stderr.on('data', keep);
    const end = Date.now() + 15000;
    for (;;) {
      if (proc.exitCode !== null) throw new Error('Sunucu açılırken kapandı:\n' + log);
      const ok = await fetch(url + '/info').then((r) => r.ok).catch(() => false);
      if (ok) break;
      if (Date.now() > end) throw new Error('Sunucu 15 sn içinde açılmadı:\n' + log);
      await sleep(100);
    }
  };
  const close = () =>
    new Promise((res) => {
      if (!proc || proc.exitCode !== null) return res();
      proc.once('exit', res);
      proc.kill('SIGTERM');
      setTimeout(() => proc.exitCode === null && proc.kill('SIGKILL'), 3000);
    });
  await open();
  return {
    url,
    port,
    dir,
    log: () => log,
    alive: () => proc.exitCode === null,
    /** Sunucuyu kapatıp aynı veriyle yeniden açar (diske yazılanlar kalıcı mı) */
    async restart() {
      await close();
      await open();
    },
    async stop() {
      await close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

let seq = 0;
/** Bu çalıştırmaya özgü, benzersiz sahte kişi */
export function person(name = 'Kişi') {
  const id = ('sn' + crypto.randomBytes(5).toString('hex') + (++seq).toString(36)).slice(0, 20);
  return { user: { id, name: `${name}${seq}`, color: '#6cb6ff' }, secret: crypto.randomBytes(24).toString('hex') };
}

/**
 * Sunucuya bir kişi olarak bağlanır. Dönen bağlantıda:
 *  ws.ready         sunucunun 'ready' çerçevesi
 *  ws.frames        gelen bütün çerçeveler
 *  ws.out(f)        çerçeve yollar (yanıt beklemez)
 *  ws.req(f)        rid ekleyip yanıtı bekler ('ok', 'err', 'hist' …)
 *  ws.wait(pred)    koşula uyan çerçeveyi bekler (önceden gelmişse hemen döner)
 *  ws.sync()        sunucunun bu bağlantıdaki önceki bütün çerçeveleri işlediğinden emin olur
 */
export function connect(srv, who, { hello = true } = {}) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const waiters = [];
    let rid = 0;
    ws.frames = [];
    ws.who = who;
    const check = () => {
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        const f = ws.frames.slice(w.from).find(w.pred);
        if (f) {
          waiters.splice(i, 1);
          clearTimeout(w.timer);
          w.ok(f);
        }
      }
    };
    ws.on('message', (d) => {
      const f = JSON.parse(d.toString());
      ws.frames.push(f);
      if (f.t === 'ready' && !ws.ready) {
        ws.ready = f;
        res(ws);
      }
      check();
    });
    ws.on('error', rej);
    ws.on('close', (code) => {
      ws.closedWith = code;
      if (!ws.ready && hello) rej(new Error('Bağlantı kapandı (' + code + '): ' + JSON.stringify(ws.frames).slice(0, 300)));
    });
    ws.out = (f) => ws.send(JSON.stringify(f));
    /** from: frames dizisinde aramaya başlanacak yer (varsayılan: şimdiden sonra gelenler) */
    ws.wait = (pred, ms = 4000, from = ws.frames.length, what = 'çerçeve') =>
      new Promise((ok, no) => {
        const f = ws.frames.slice(from).find(pred);
        if (f) return ok(f);
        const w = { pred, from, ok, timer: setTimeout(() => (waiters.splice(waiters.indexOf(w), 1), no(new Error(`Beklenen ${what} gelmedi (${ms} ms). Son gelenler: ${JSON.stringify(ws.frames.slice(-4)).slice(0, 500)}`))), ms) };
        waiters.push(w);
      });
    ws.req = (f, ms = 4000) => {
      const id = 'r' + ++rid;
      const from = ws.frames.length;
      ws.out({ ...f, rid: id });
      return ws.wait((x) => x.rid === id, ms, from, `"${f.t}" yanıtı`);
    };
    ws.sync = async () => {
      const from = ws.frames.length;
      ws.out({ t: 'ping' });
      await ws.wait((x) => x.t === 'pong', 4000, from, 'pong');
    };
    ws.on('open', () => {
      if (hello) ws.out({ t: 'hello', user: who.user, secret: who.secret, status: 'online', v: 1 });
      else res(ws);
    });
  });
}

/** Yeni bir kişi oluşturup bağlar */
export const login = (srv, name) => connect(srv, person(name));

/** Topluluk kurar; sahibi ve topluluk bilgisini döner */
export async function community(srv, owner, name = 'Sınama Topluluğu') {
  const from = owner.frames.length;
  const r = await owner.req({ t: 'comm.create', name, color: '#6cb6ff', template: 'default' });
  if (r.t !== 'ok') throw new Error('Topluluk kurulamadı: ' + JSON.stringify(r));
  const c = (await owner.wait((f) => f.t === 'comm' && f.c?.id === r.data, 4000, from)).c;
  return c;
}

/** Kişiyi davet koduyla topluluğa katar, güncel topluluk bilgisini döner */
export async function join(ws, c) {
  const r = await ws.req({ t: 'join', code: c.inviteCode });
  if (r.t !== 'ok') throw new Error('Katılamadı: ' + JSON.stringify(r));
  return (await ws.wait((f) => f.t === 'comm' && f.c?.id === c.id, 4000, 0)).c;
}

/** Bir dizi bağlantının sunucuyla eşitlenmesini bekler: bunlardan sonra 'gelmedi' denetimi güvenilirdir */
export async function settle(...conns) {
  for (const c of conns) await c.sync();
}

/** Belirli bir andan sonra koşula uyan çerçeve gelmiş mi */
export const got = (ws, from, pred) => ws.frames.slice(from).some(pred);
