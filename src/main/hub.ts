// Kovan sunucusu (hub): her uygulama kendi topluluklarını barındırabilir.
// HTTP (dosya yükleme/indirme) + WebSocket (/ws) aynı portta.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import {
  Attachment, Category, Channel, ChannelType, ClientFrame, Community, ID, Member, Message, Perm, PROTOCOL_VERSION,
  Role, ServerFrame, Status, UserPublic, VoiceMember, can, makeId, isVoiceLike, SpaceAvatar, Booth, AvatarLook,
  hasFreeName, cleanSiteUrl, DEFAULT_SITE_URL, WebViewer,
} from '../shared/protocol';

const MAX_CONTENT = 4000;
const MAX_UPLOAD = 25 * 1024 * 1024;
const HISTORY_PAGE = 60;

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const clampStr = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '');
const cleanName = (s: unknown, max = 32) => clampStr(s, 200).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const channelSlug = (s: unknown) =>
  cleanName(s, 100)
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-+/g, '-')
    .slice(0, 48) || 'kanal';

async function atomicWrite(file: string, data: string) {
  const tmp = file + '.' + process.pid + '.tmp';
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

// ----- Kanal mesaj günlüğü: ekleme-yalnız NDJSON, açılışta yeniden oynatılır -----
class ChannelLog {
  list: Message[] = [];
  byId = new Map<ID, Message>();
  private ops = 0;
  constructor(private file: string) {}

  load() {
    if (!fs.existsSync(this.file)) return;
    const text = fs.readFileSync(this.file, 'utf8');
    for (const line of text.split('\n')) {
      if (!line) continue;
      this.ops++;
      try {
        const op = JSON.parse(line);
        if (op.o === 'm' || op.o === 'u') {
          const prev = this.byId.get(op.m.id);
          if (prev) Object.assign(prev, op.m);
          else {
            this.byId.set(op.m.id, op.m);
            this.list.push(op.m);
          }
        } else if (op.o === 'd') {
          const m = this.byId.get(op.id);
          if (m) {
            this.byId.delete(op.id);
            const i = this.list.indexOf(m);
            if (i >= 0) this.list.splice(i, 1);
          }
        }
      } catch {
        /* bozuk satırı atla */
      }
    }
    this.list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (this.ops > 200 && this.ops > this.list.length * 2) this.compact();
  }

  private append(op: object) {
    this.ops++;
    try {
      fs.appendFileSync(this.file, JSON.stringify(op) + '\n');
    } catch {
      /* disk hatası: bellekteki durum korunur */
    }
  }

  compact() {
    const data = this.list.map((m) => JSON.stringify({ o: 'm', m })).join('\n') + (this.list.length ? '\n' : '');
    this.ops = this.list.length;
    try {
      fs.writeFileSync(this.file + '.tmp', data);
      fs.renameSync(this.file + '.tmp', this.file);
    } catch {
      /* yoksay */
    }
  }

  add(m: Message) {
    this.list.push(m);
    this.byId.set(m.id, m);
    this.append({ o: 'm', m });
  }
  update(m: Message) {
    this.append({ o: 'u', m });
  }
  remove(id: ID) {
    const m = this.byId.get(id);
    if (!m) return;
    this.byId.delete(id);
    const i = this.list.lastIndexOf(m);
    if (i >= 0) this.list.splice(i, 1);
    this.append({ o: 'd', id });
  }
  last(): ID | undefined {
    return this.list[this.list.length - 1]?.id;
  }
  page(before?: ID, around?: ID): { msgs: Message[]; more: boolean } {
    const L = this.list;
    if (around) {
      let i = L.findIndex((m) => m.id >= around);
      if (i < 0) i = L.length - 1;
      const start = Math.max(0, i - HISTORY_PAGE / 2);
      return { msgs: L.slice(start, start + HISTORY_PAGE), more: start > 0 };
    }
    let end = L.length;
    if (before) {
      // ikili arama
      let lo = 0, hi = L.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (L[mid].id < before) lo = mid + 1;
        else hi = mid;
      }
      end = lo;
    }
    const start = Math.max(0, end - HISTORY_PAGE);
    return { msgs: L.slice(start, end), more: start > 0 };
  }
}

interface StoredUser {
  pub: UserPublic;
  secretHash: string;
}

interface HubData {
  hubId: ID;
  users: Record<ID, StoredUser>;
  communities: ID[];
}

type StoredCommunity = Omit<Community, 'users'>;

interface Session {
  sid: ID;
  ws: WebSocket;
  userId: ID | null;
  loopback: boolean;
  status: Status;
  alive: boolean;
  voice: { ch: ID; muted: boolean; deaf: boolean } | null;
  space: ID | null;
  web: ID | null; // bakılan site odası
  lastMove: number;
  bucket: number;
  bucketTs: number;
  lastSend: Record<ID, number>;
}

export const BOT_ID = 'kovan-asistan';

const HATS = ['none', 'antenna', 'crown', 'cap', 'wizard', 'halo', 'headphones'] as const;
function cleanLook(l: Partial<AvatarLook> | undefined): AvatarLook {
  return {
    color: typeof l?.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#f5a524',
    hat: HATS.includes(l?.hat as any) ? (l!.hat as AvatarLook['hat']) : 'antenna',
  };
}

export class Hub {
  private dir: string;
  private data!: HubData;
  private comms = new Map<ID, StoredCommunity>();
  private chanToComm = new Map<ID, ID>();
  private logs = new Map<ID, ChannelLog>();
  private sessions = new Set<Session>();
  private userSessions = new Map<ID, Set<Session>>();
  private voiceRooms = new Map<ID, Map<ID, VoiceMember>>();
  private spaceRooms = new Map<ID, Map<ID, { s: Session; av: SpaceAvatar }>>();
  private booths = new Map<ID, Booth[]>();
  private webRooms = new Map<ID, Map<ID, WebViewer>>();
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private heartbeat: NodeJS.Timeout | null = null;
  port = 0;
  ownerName = 'Kovan';

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, 'hub');
  }

  // ---------- kalıcılık ----------
  private load() {
    fs.mkdirSync(path.join(this.dir, 'communities'), { recursive: true });
    fs.mkdirSync(path.join(this.dir, 'messages'), { recursive: true });
    fs.mkdirSync(path.join(this.dir, 'files'), { recursive: true });
    const hf = path.join(this.dir, 'hub.json');
    try {
      this.data = JSON.parse(fs.readFileSync(hf, 'utf8'));
    } catch {
      this.data = { hubId: makeId(), users: {}, communities: [] };
      fs.writeFileSync(hf, JSON.stringify(this.data));
    }
    for (const cid of this.data.communities) {
      try {
        const c: StoredCommunity = JSON.parse(fs.readFileSync(path.join(this.dir, 'communities', cid + '.json'), 'utf8'));
        this.comms.set(cid, c);
        for (const ch of c.channels) this.chanToComm.set(ch.id, cid);
        this.migrate(c);
      } catch {
        /* eksik topluluk dosyası */
      }
    }
    this.ensureBot();
  }

  /** v1.1: karşılama lobilerine 3D oda, v1.2: site odası ekle */
  private migrate(c: StoredCommunity) {
    this.migrateSite(c);
    if (!c.members.some((m) => m.userId === BOT_ID) || c.channels.some((x) => x.type === 'space') || (c as any).m11) return;
    (c as any).m11 = 1;
    const cat: Category = { id: makeId(), name: '3D Odalar', position: c.categories.length };
    c.categories.push(cat);
    const ch: Channel = { id: makeId(), name: 'Kovan Meydanı', type: 'space', categoryId: cat.id, position: 0, topic: 'Avatarınla dolaş, yakındakilerle sesli konuş' };
    c.channels.push(ch);
    this.chanToComm.set(ch.id, c.id);
    const welcome = c.channels.find((x) => x.type === 'announce');
    if (welcome) {
      const m: Message = {
        id: makeId(),
        channelId: welcome.id,
        authorId: BOT_ID,
        ts: Date.now(),
        content:
          '## Yeni: 3D Odalar 🐝\n**Kovan Meydanı**\'na gir, avatarınla dolaş. Yanına yaklaştığın kişinin sesi yükselir, uzaklaştıkça kısılır; ses yönünü de duyarsın.\n- **WASD / ok tuşları** yürü, **Shift** koş, **Boşluk** zıpla, sağ tık sürükle kamera\n- **Enter** ile yaz: mesajın başının üstünde balon olarak çıkar\n- **1-7** ile emote: el salla, dans, alkış, kalp…\n- **Sahneye** çık: herkes seni mesafeden bağımsız duyar\n- **Stand** kirala: yanına git, **E** bas, tabelana yazını yaz\n- **Kamp ateşi** banklarına **E** ile otur',
      };
      this.log(welcome.id).add(m);
    }
    this.saveComm(c.id);
  }

  /** v1.2: karşılama lobilerine xanaphian.com site odası ekle */
  private migrateSite(c: StoredCommunity) {
    if (!c.members.some((m) => m.userId === BOT_ID) || c.channels.some((x) => x.type === 'site') || (c as any).m12) return;
    (c as any).m12 = 1;
    let cat = c.categories.find((x) => x.name === 'Site Odaları');
    if (!cat) {
      cat = { id: makeId(), name: 'Site Odaları', position: c.categories.length };
      c.categories.push(cat);
    }
    const ch: Channel = { id: makeId(), name: 'xanaphian.com', type: 'site', categoryId: cat.id, position: 0, url: DEFAULT_SITE_URL, topic: 'Siteyi birlikte gez, yanında sohbet et' };
    c.channels.push(ch);
    this.chanToComm.set(ch.id, c.id);
    const welcome = c.channels.find((x) => x.type === 'announce');
    if (welcome) {
      this.log(welcome.id).add({
        id: makeId(),
        channelId: welcome.id,
        authorId: BOT_ID,
        ts: Date.now(),
        content:
          '## Yeni: Site Odaları 🌐\n**xanaphian.com** artık Kovan\'ın içinde. Soldaki **Site Odaları** bölümünden odaya gir; site ortada açılır, sağda o odanın sohbeti durur.\n- Üstteki çubuktan **şampiyon ara**, menülere atla, geri/ileri git\n- Odada kimin hangi sayfaya baktığını görürsün; birinin üstüne tıklayıp **takip et**, o gezdikçe sen de gezersin\n- **Paylaş** düğmesi baktığın sayfayı sohbete atar; sohbetteki xanaphian.com bağlantıları da doğrudan odada açılır\n- Yöneticiler kanal oluştururken türü **Site Odası** seçip başka bir site de bağlayabilir',
      });
    }
    this.saveComm(c.id);
  }

  private ensureBot() {
    if (!this.data.users[BOT_ID]) {
      this.data.users[BOT_ID] = {
        pub: { id: BOT_ID, name: 'Kovan Asistanı', color: '#f5a524', bio: 'Kovan\'ın yerleşik yardımcısı. Mesajlara yanıt vermez, sadece bilgilendirir.' },
        secretHash: sha(crypto.randomBytes(32).toString('hex')),
      };
      this.saveHub();
    }
  }

  private debounce(key: string, fn: () => Promise<void>, ms = 400) {
    const t = this.saveTimers.get(key);
    if (t) clearTimeout(t);
    this.saveTimers.set(
      key,
      setTimeout(() => {
        this.saveTimers.delete(key);
        fn().catch(() => {});
      }, ms),
    );
  }
  private saveHub() {
    this.debounce('hub', () => atomicWrite(path.join(this.dir, 'hub.json'), JSON.stringify(this.data)));
  }
  private saveComm(cid: ID) {
    this.debounce('c:' + cid, async () => {
      const c = this.comms.get(cid);
      if (c) await atomicWrite(path.join(this.dir, 'communities', cid + '.json'), JSON.stringify(c));
    });
  }

  private log(ch: ID): ChannelLog {
    let l = this.logs.get(ch);
    if (!l) {
      l = new ChannelLog(path.join(this.dir, 'messages', ch + '.ndjson'));
      l.load();
      this.logs.set(ch, l);
    }
    return l;
  }

  // ---------- başlatma ----------
  async start(preferredPort: number): Promise<number> {
    this.load();
    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024, perMessageDeflate: { threshold: 1024 } });
    this.server.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/ws')) return socket.destroy();
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, req));
    });
    const tryListen = (port: number) =>
      new Promise<number>((resolve, reject) => {
        const onErr = (e: Error) => {
          this.server!.off('listening', onOk);
          reject(e);
        };
        const onOk = () => {
          this.server!.off('error', onErr);
          resolve((this.server!.address() as any).port);
        };
        this.server!.once('error', onErr);
        this.server!.once('listening', onOk);
        this.server!.listen(port, '0.0.0.0');
      });
    let port = 0;
    for (let i = 0; i < 10 && !port; i++) {
      try {
        port = await tryListen(preferredPort + i);
      } catch {
        /* sonraki port */
      }
    }
    if (!port) port = await tryListen(0);
    this.port = port;
    this.heartbeat = setInterval(() => {
      for (const s of this.sessions) {
        if (!s.alive) {
          s.ws.terminate();
          continue;
        }
        s.alive = false;
        try {
          s.ws.ping();
        } catch {
          /* yoksay */
        }
      }
    }, 30000);
    return port;
  }

  /** Bekleyen kayıtları eşzamanlı olarak diske yazar ve sunucuyu kapatır. */
  stop() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    const syncWrite = (file: string, data: string) => {
      try {
        fs.writeFileSync(file + '.tmp', data);
        fs.renameSync(file + '.tmp', file);
      } catch {
        /* yoksay */
      }
    };
    for (const [key, t] of this.saveTimers) {
      clearTimeout(t);
      if (key === 'hub') syncWrite(path.join(this.dir, 'hub.json'), JSON.stringify(this.data));
      else if (key.startsWith('c:')) {
        const c = this.comms.get(key.slice(2));
        if (c) syncWrite(path.join(this.dir, 'communities', c.id + '.json'), JSON.stringify(c));
      }
    }
    this.saveTimers.clear();
    for (const s of this.sessions) s.ws.close(1001);
    this.server?.close();
  }

  static lanAddresses(): string[] {
    const out: string[] = [];
    const ifs = os.networkInterfaces();
    for (const name of Object.keys(ifs)) {
      for (const a of ifs[name] || []) {
        if (a.family === 'IPv4' && !a.internal) out.push(a.address);
      }
    }
    // özel ağlar önce
    return out.sort((a, b) => Number(!/^(192\.168|10\.|172\.)/.test(a)) - Number(!/^(192\.168|10\.|172\.)/.test(b)));
  }

  // ---------- HTTP ----------
  private cors(res: http.ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-kovan-user, x-kovan-secret, x-kovan-name, x-kovan-w, x-kovan-h');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    this.cors(res);
    const url = new URL(req.url || '/', 'http://x');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/info') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ app: 'kovan', hubId: this.data.hubId, v: PROTOCOL_VERSION }));
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/f/')) {
      const id = url.pathname.split('/')[2] || '';
      if (!/^[a-z0-9]+$/.test(id)) return void res.writeHead(404).end();
      const file = path.join(this.dir, 'files', id);
      fs.stat(file, (err, st) => {
        if (err) return void res.writeHead(404).end();
        let mime = 'application/octet-stream';
        try {
          mime = fs.readFileSync(file + '.mime', 'utf8');
        } catch {
          /* varsayılan */
        }
        const safeInline = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm)|audio\/(mpeg|ogg|wav|webm))$/.test(mime);
        res.writeHead(200, {
          'content-type': safeInline ? mime : 'application/octet-stream',
          'content-length': st.size,
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
          ...(safeInline ? {} : { 'content-disposition': 'attachment' }),
        });
        fs.createReadStream(file).pipe(res);
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/upload') {
      const uid = String(req.headers['x-kovan-user'] || '');
      const secret = String(req.headers['x-kovan-secret'] || '');
      const u = this.data.users[uid];
      if (!u || u.secretHash !== sha(secret)) return void res.writeHead(401).end();
      const len = Number(req.headers['content-length'] || 0);
      if (!len || len > MAX_UPLOAD) return void res.writeHead(413).end();
      const id = makeId();
      const file = path.join(this.dir, 'files', id);
      const out = fs.createWriteStream(file);
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_UPLOAD) {
          req.destroy();
          out.destroy();
          fs.unlink(file, () => {});
        }
      });
      req.pipe(out);
      out.on('finish', () => {
        const mime = clampStr(req.headers['content-type'] || 'application/octet-stream', 100);
        fs.writeFileSync(file + '.mime', mime);
        let name = decodeURIComponent(String(req.headers['x-kovan-name'] || 'dosya')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'dosya';
        const att: Attachment = { id, name, size, mime, url: `/f/${id}/${encodeURIComponent(name)}` };
        const w = Number(req.headers['x-kovan-w']), h = Number(req.headers['x-kovan-h']);
        if (w > 0 && h > 0) {
          att.w = Math.min(w, 20000);
          att.h = Math.min(h, 20000);
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(att));
      });
      out.on('error', () => res.writeHead(500).end());
      return;
    }
    res.writeHead(404).end();
  }

  // ---------- WebSocket ----------
  private onConnection(ws: WebSocket, req: http.IncomingMessage) {
    const ip = req.socket.remoteAddress || '';
    const s: Session = {
      sid: makeId(),
      ws,
      userId: null,
      loopback: ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1',
      status: 'online',
      alive: true,
      voice: null,
      space: null,
      web: null,
      lastMove: 0,
      bucket: 40,
      bucketTs: Date.now(),
      lastSend: {},
    };
    this.sessions.add(s);
    ws.on('pong', () => (s.alive = true));
    ws.on('message', (raw) => {
      s.alive = true;
      let f: ClientFrame;
      try {
        f = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const now = Date.now();
      if (f.t === 'sp.move') {
        // 3D oda hareketi: en fazla ~25/sn
        if (now - s.lastMove < 35) return;
        s.lastMove = now;
      } else if (f.t !== 'vc.signal' && f.t !== 'ping') {
        // basit hız sınırı: 40 çerçeve / 5 sn
        s.bucket = Math.min(40, s.bucket + ((now - s.bucketTs) / 5000) * 40);
        s.bucketTs = now;
        if (s.bucket < 1) return this.send(s, { t: 'err', msg: 'Çok hızlı gidiyorsun, biraz yavaşla.' });
        s.bucket -= 1;
      }
      try {
        this.handle(s, f);
      } catch (e) {
        this.send(s, { t: 'err', msg: 'Sunucu hatası: ' + (e as Error).message, rid: (f as any).rid });
      }
    });
    ws.on('close', () => this.onClose(s));
    ws.on('error', () => {});
  }

  private onClose(s: Session) {
    this.sessions.delete(s);
    if (s.voice) this.leaveVoice(s);
    if (s.space) this.leaveSpace(s);
    if (s.web) this.leaveWeb(s);
    if (s.userId) {
      const set = this.userSessions.get(s.userId);
      set?.delete(s);
      if (!set || set.size === 0) {
        this.userSessions.delete(s.userId);
        this.broadcastPresence(s.userId);
      }
    }
  }

  private send(s: Session, f: ServerFrame) {
    if (s.ws.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify(f));
  }
  private sendRaw(s: Session, data: string) {
    if (s.ws.readyState === WebSocket.OPEN) s.ws.send(data);
  }

  private memberSessions(c: StoredCommunity, except?: Session): Session[] {
    const out: Session[] = [];
    for (const m of c.members) {
      const set = this.userSessions.get(m.userId);
      if (set) for (const s of set) if (s !== except) out.push(s);
    }
    return out;
  }

  private broadcast(c: StoredCommunity, f: ServerFrame, except?: Session) {
    const data = JSON.stringify(f);
    for (const s of this.memberSessions(c, except)) this.sendRaw(s, data);
  }

  private snapshot(c: StoredCommunity): Community {
    const users: Record<ID, UserPublic> = {};
    for (const m of c.members) {
      const u = this.data.users[m.userId];
      if (u) users[m.userId] = u.pub;
    }
    return { ...c, users };
  }

  private lastIdsFor(c: StoredCommunity): Record<ID, ID> {
    const out: Record<ID, ID> = {};
    for (const ch of c.channels) {
      if (isVoiceLike(ch.type)) continue;
      const l = this.log(ch.id).last();
      if (l) out[ch.id] = l;
    }
    return out;
  }

  private pushComm(c: StoredCommunity) {
    this.saveComm(c.id);
    this.broadcast(c, { t: 'comm', c: this.snapshot(c) });
  }

  private effectiveStatus(uid: ID): Status {
    const set = this.userSessions.get(uid);
    if (!set || set.size === 0) return 'offline';
    let st: Status = 'invisible';
    const rank: Record<Status, number> = { online: 4, dnd: 3, idle: 2, invisible: 1, offline: 0 };
    for (const s of set) if (rank[s.status] > rank[st]) st = s.status;
    return st === 'invisible' ? 'offline' : st;
  }

  private broadcastPresence(uid: ID) {
    const status = this.effectiveStatus(uid);
    const data = JSON.stringify({ t: 'presence', uid, status } satisfies ServerFrame);
    const sent = new Set<Session>();
    for (const c of this.comms.values()) {
      if (!c.members.some((m) => m.userId === uid)) continue;
      for (const s of this.memberSessions(c)) {
        if (sent.has(s)) continue;
        sent.add(s);
        this.sendRaw(s, data);
      }
    }
  }

  private userComms(uid: ID): StoredCommunity[] {
    const out: StoredCommunity[] = [];
    for (const cid of this.data.communities) {
      const c = this.comms.get(cid);
      if (c && c.members.some((m) => m.userId === uid)) out.push(c);
    }
    return out;
  }

  private sendReady(s: Session) {
    const uid = s.userId!;
    const comms = this.userComms(uid);
    const presence: Record<ID, Status> = {};
    const lastIds: Record<ID, ID> = {};
    const voice: Record<ID, VoiceMember[]> = {};
    const web: Record<ID, WebViewer[]> = {};
    for (const c of comms) {
      for (const m of c.members) presence[m.userId] = m.userId === BOT_ID ? 'online' : this.effectiveStatus(m.userId);
      Object.assign(lastIds, this.lastIdsFor(c));
      for (const ch of c.channels) {
        const room = this.voiceRooms.get(ch.id);
        if (room && room.size) voice[ch.id] = [...room.values()];
        const wr = this.webRooms.get(ch.id);
        if (wr && wr.size) web[ch.id] = [...wr.values()];
      }
    }
    this.send(s, {
      t: 'ready',
      hubId: this.data.hubId,
      hubName: this.ownerName,
      me: uid,
      communities: comms.map((c) => this.snapshot(c)),
      presence,
      lastIds,
      voice,
      web,
      v: PROTOCOL_VERSION,
    });
  }

  private commOfChannel(s: Session, ch: ID): { c: StoredCommunity; channel: Channel } | null {
    const cid = this.chanToComm.get(ch);
    const c = cid ? this.comms.get(cid) : undefined;
    if (!c || !s.userId || !c.members.some((m) => m.userId === s.userId)) return null;
    const channel = c.channels.find((x) => x.id === ch);
    return channel ? { c, channel } : null;
  }

  private commFor(s: Session, cid: ID, perm = 0): StoredCommunity | null {
    const c = this.comms.get(cid);
    if (!c || !s.userId || !c.members.some((m) => m.userId === s.userId)) return null;
    if (perm && !can(this.snapshot(c), s.userId, perm)) {
      this.send(s, { t: 'err', msg: 'Bunun için yetkin yok.' });
      return null;
    }
    return c;
  }

  // ---------- çerçeve işleyici ----------
  private handle(s: Session, f: ClientFrame) {
    if (f.t === 'ping') return this.send(s, { t: 'pong' });
    if (f.t === 'hello') return this.onHello(s, f);
    if (!s.userId) return this.send(s, { t: 'err', msg: 'Önce kimlik doğrulaması gerekli.' });
    const uid = s.userId;

    switch (f.t) {
      case 'join': {
        const c = this.comms.get(f.cid);
        if (!c || c.inviteKey !== f.key) return this.send(s, { t: 'err', msg: 'Davet geçersiz ya da süresi dolmuş.', rid: f.rid });
        if (!c.members.some((m) => m.userId === uid)) {
          c.members.push({ userId: uid, roles: [], joinedAt: Date.now() });
          const first = c.channels.find((x) => !isVoiceLike(x.type));
          if (first) {
            const m: Message = { id: makeId(), channelId: first.id, authorId: uid, content: '', ts: Date.now(), kind: 'join' };
            this.log(first.id).add(m);
            this.pushComm(c);
            this.broadcast(c, { t: 'msg', m });
          } else this.pushComm(c);
          this.broadcastPresence(uid);
        }
        for (const x of this.userSessions.get(uid) || [s])
          for (const m of c.members) this.send(x, { t: 'presence', uid: m.userId, status: m.userId === BOT_ID ? 'online' : this.effectiveStatus(m.userId) });
        this.send(s, { t: 'comm', c: this.snapshot(c), lastIds: this.lastIdsFor(c) });
        if (f.rid) this.send(s, { t: 'ok', rid: f.rid, data: c.id });
        return;
      }
      case 'send': {
        const r = this.commOfChannel(s, f.ch);
        if (!r || isVoiceLike(r.channel.type)) return;
        if (r.channel.type === 'announce' && !can(this.snapshot(r.c), uid, Perm.MANAGE_CHANNELS))
          return this.send(s, { t: 'err', msg: 'Bu kanala sadece yöneticiler yazabilir.', nonce: f.nonce });
        const content = clampStr(f.content, MAX_CONTENT).trim();
        const atts = Array.isArray(f.attachments) ? f.attachments.slice(0, 10).filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/f/')) : [];
        if (!content && !atts.length) return;
        if (r.channel.slowmode && !can(this.snapshot(r.c), uid, Perm.MANAGE_MESSAGES)) {
          const last = s.lastSend[f.ch] || 0;
          if (Date.now() - last < r.channel.slowmode * 1000)
            return this.send(s, { t: 'err', msg: `Yavaş mod açık: ${r.channel.slowmode} sn bekle.`, nonce: f.nonce });
        }
        s.lastSend[f.ch] = Date.now();
        const m: Message = { id: makeId(), channelId: f.ch, authorId: uid, content, ts: Date.now() };
        if (f.replyTo && this.log(f.ch).byId.has(f.replyTo)) m.replyTo = f.replyTo;
        if (atts.length) m.attachments = atts.map((a) => ({ id: clampStr(a.id, 20), name: clampStr(a.name, 120), size: Number(a.size) || 0, mime: clampStr(a.mime, 100), url: clampStr(a.url, 300), w: a.w, h: a.h }));
        this.log(f.ch).add(m);
        this.broadcast(r.c, { t: 'msg', m }, s);
        this.send(s, { t: 'msg', m, nonce: f.nonce });
        return;
      }
      case 'edit': {
        const r = this.commOfChannel(s, f.ch);
        const m = r && this.log(f.ch).byId.get(f.id);
        if (!r || !m || m.authorId !== uid) return;
        const content = clampStr(f.content, MAX_CONTENT).trim();
        if (!content && !m.attachments?.length) return;
        m.content = content;
        m.editedTs = Date.now();
        this.log(f.ch).update(m);
        this.broadcast(r.c, { t: 'msg.upd', m });
        return;
      }
      case 'del': {
        const r = this.commOfChannel(s, f.ch);
        const m = r && this.log(f.ch).byId.get(f.id);
        if (!r || !m) return;
        if (m.authorId !== uid && !can(this.snapshot(r.c), uid, Perm.MANAGE_MESSAGES)) return;
        this.log(f.ch).remove(f.id);
        this.broadcast(r.c, { t: 'msg.del', ch: f.ch, id: f.id });
        return;
      }
      case 'react': {
        const r = this.commOfChannel(s, f.ch);
        const m = r && this.log(f.ch).byId.get(f.id);
        const e = clampStr(f.e, 32);
        if (!r || !m || !e) return;
        m.reactions ||= {};
        const arr = m.reactions[e] || [];
        if (f.on) {
          if (arr.includes(uid)) return;
          if (!m.reactions[e] && Object.keys(m.reactions).length >= 20) return;
          m.reactions[e] = [...arr, uid];
        } else {
          const next = arr.filter((x) => x !== uid);
          if (next.length) m.reactions[e] = next;
          else delete m.reactions[e];
        }
        this.log(f.ch).update(m);
        this.broadcast(r.c, { t: 'msg.upd', m });
        return;
      }
      case 'pin': {
        const r = this.commOfChannel(s, f.ch);
        const m = r && this.log(f.ch).byId.get(f.id);
        if (!r || !m || !can(this.snapshot(r.c), uid, Perm.MANAGE_MESSAGES)) return;
        m.pinned = !!f.on;
        this.log(f.ch).update(m);
        this.broadcast(r.c, { t: 'msg.upd', m });
        return;
      }
      case 'hist': {
        const r = this.commOfChannel(s, f.ch);
        if (!r) return this.send(s, { t: 'hist', rid: f.rid, ch: f.ch, msgs: [], more: false });
        const p = this.log(f.ch).page(f.before, f.around);
        return this.send(s, { t: 'hist', rid: f.rid, ch: f.ch, msgs: p.msgs, more: p.more });
      }
      case 'pins': {
        const r = this.commOfChannel(s, f.ch);
        const msgs = r ? this.log(f.ch).list.filter((m) => m.pinned).slice(-50).reverse() : [];
        return this.send(s, { t: 'pins', rid: f.rid, ch: f.ch, msgs });
      }
      case 'search': {
        const c = this.commFor(s, f.cid);
        const q = clampStr(f.q, 200).toLocaleLowerCase('tr').trim();
        const out: Message[] = [];
        if (c && q) {
          for (const ch of c.channels) {
            if (isVoiceLike(ch.type)) continue;
            const L = this.log(ch.id).list;
            for (let i = L.length - 1; i >= 0 && out.length < 400; i--) {
              if (L[i].content.toLocaleLowerCase('tr').includes(q)) out.push(L[i]);
            }
          }
        }
        out.sort((a, b) => (a.id < b.id ? 1 : -1));
        return this.send(s, { t: 'search', rid: f.rid, msgs: out.slice(0, 50) });
      }
      case 'typing': {
        const r = this.commOfChannel(s, f.ch);
        if (r) this.broadcast(r.c, { t: 'typing', ch: f.ch, uid }, s);
        return;
      }
      case 'presence': {
        if (!['online', 'idle', 'dnd', 'invisible'].includes(f.status)) return;
        s.status = f.status;
        this.broadcastPresence(uid);
        return;
      }
      case 'profile': {
        const u = this.data.users[uid];
        u.pub = this.sanitizeUser(f.user, uid);
        this.saveHub();
        const data = JSON.stringify({ t: 'user', u: u.pub } satisfies ServerFrame);
        const sent = new Set<Session>();
        for (const c of this.userComms(uid))
          for (const x of this.memberSessions(c)) if (!sent.has(x)) (sent.add(x), this.sendRaw(x, data));
        return;
      }
      case 'comm.create': {
        if (!s.loopback) return this.send(s, { t: 'err', msg: 'Bu kovanda topluluk oluşturamazsın.', rid: f.rid });
        const c = this.createCommunity(uid, cleanName(f.name, 48) || 'Yeni Topluluk', f.color, f.icon, f.template);
        this.send(s, { t: 'comm', c: this.snapshot(c), lastIds: this.lastIdsFor(c) });
        if (f.rid) this.send(s, { t: 'ok', rid: f.rid, data: c.id });
        return;
      }
      case 'comm.update': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_COMMUNITY);
        if (!c) return;
        if (f.name !== undefined) c.name = cleanName(f.name, 48) || c.name;
        if (f.description !== undefined) c.description = clampStr(f.description, 300);
        if (f.color !== undefined && /^#[0-9a-f]{6}$/i.test(f.color)) c.color = f.color;
        if (f.icon !== undefined) {
          if (f.icon === null) delete c.icon;
          else if (typeof f.icon === 'string' && f.icon.startsWith('data:image/') && f.icon.length < 400_000) c.icon = f.icon;
        }
        this.pushComm(c);
        return;
      }
      case 'comm.invite.reset': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_COMMUNITY);
        if (!c) return;
        c.inviteKey = crypto.randomBytes(9).toString('base64url');
        this.pushComm(c);
        return;
      }
      case 'comm.delete': {
        const c = this.comms.get(f.cid);
        if (!c || c.ownerId !== uid) return;
        this.broadcast(c, { t: 'comm.del', cid: c.id });
        this.comms.delete(c.id);
        this.data.communities = this.data.communities.filter((x) => x !== c.id);
        for (const ch of c.channels) {
          this.chanToComm.delete(ch.id);
          this.logs.delete(ch.id);
          fsp.unlink(path.join(this.dir, 'messages', ch.id + '.ndjson')).catch(() => {});
        }
        fsp.unlink(path.join(this.dir, 'communities', c.id + '.json')).catch(() => {});
        this.saveHub();
        return;
      }
      case 'comm.leave': {
        const c = this.commFor(s, f.cid);
        if (!c || c.ownerId === uid) return;
        c.members = c.members.filter((m) => m.userId !== uid);
        for (const x of this.userSessions.get(uid) || []) this.send(x, { t: 'comm.del', cid: c.id });
        this.pushComm(c);
        return;
      }
      case 'chan.create': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        if (!c || c.channels.length >= 200) return;
        const type: ChannelType = isVoiceLike(f.type) || f.type === 'announce' || f.type === 'site' ? f.type : 'text';
        const catId = f.categoryId && c.categories.some((x) => x.id === f.categoryId) ? f.categoryId : null;
        const ch: Channel = {
          id: makeId(),
          name: hasFreeName(type) ? cleanName(f.name, 48) || (type === 'space' ? '3D Oda' : type === 'site' ? 'Site' : 'Ses') : channelSlug(f.name),
          type,
          categoryId: catId,
          position: Math.max(-1, ...c.channels.filter((x) => x.categoryId === catId).map((x) => x.position)) + 1,
        };
        if (type === 'site') ch.url = cleanSiteUrl(f.url) || DEFAULT_SITE_URL;
        c.channels.push(ch);
        this.chanToComm.set(ch.id, c.id);
        this.pushComm(c);
        if (f.rid) this.send(s, { t: 'ok', rid: f.rid, data: ch.id });
        return;
      }
      case 'chan.update': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        const ch = c?.channels.find((x) => x.id === f.id);
        if (!c || !ch) return;
        if (f.name !== undefined) ch.name = hasFreeName(ch.type) ? cleanName(f.name, 48) || ch.name : channelSlug(f.name);
        if (f.url !== undefined && ch.type === 'site') ch.url = cleanSiteUrl(f.url) || ch.url || DEFAULT_SITE_URL;
        if (f.topic !== undefined) ch.topic = clampStr(f.topic, 512);
        if (f.slowmode !== undefined) ch.slowmode = Math.max(0, Math.min(3600, Number(f.slowmode) || 0));
        if (f.categoryId !== undefined) ch.categoryId = f.categoryId && c.categories.some((x) => x.id === f.categoryId) ? f.categoryId : null;
        this.pushComm(c);
        return;
      }
      case 'chan.move': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        const ch = c?.channels.find((x) => x.id === f.id);
        if (!c || !ch) return;
        const catId = f.categoryId && c.categories.some((x) => x.id === f.categoryId) ? f.categoryId : null;
        const siblings = c.channels.filter((x) => x.categoryId === catId && x.id !== ch.id).sort((a, b) => a.position - b.position);
        ch.categoryId = catId;
        siblings.splice(Math.max(0, Math.min(siblings.length, f.index)), 0, ch);
        siblings.forEach((x, i) => (x.position = i));
        this.pushComm(c);
        return;
      }
      case 'chan.delete': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        if (!c) return;
        c.channels = c.channels.filter((x) => x.id !== f.id);
        for (const x of this.sessions) if (x.web === f.id) x.web = null;
        this.webRooms.delete(f.id);
        this.chanToComm.delete(f.id);
        this.logs.delete(f.id);
        fsp.unlink(path.join(this.dir, 'messages', f.id + '.ndjson')).catch(() => {});
        this.pushComm(c);
        return;
      }
      case 'cat.create': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        if (!c || c.categories.length >= 50) return;
        c.categories.push({ id: makeId(), name: cleanName(f.name, 40) || 'Kategori', position: c.categories.length });
        this.pushComm(c);
        return;
      }
      case 'cat.update': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        const cat = c?.categories.find((x) => x.id === f.id);
        if (!c || !cat) return;
        cat.name = cleanName(f.name, 40) || cat.name;
        this.pushComm(c);
        return;
      }
      case 'cat.delete': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        if (!c) return;
        c.categories = c.categories.filter((x) => x.id !== f.id);
        for (const ch of c.channels) if (ch.categoryId === f.id) ch.categoryId = null;
        this.pushComm(c);
        return;
      }
      case 'role.create': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_ROLES);
        if (!c || c.roles.length >= 50) return;
        const r: Role = {
          id: makeId(),
          name: cleanName(f.name, 32) || 'yeni rol',
          color: /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '',
          perms: Number(f.perms) & 0xff,
          hoist: !!f.hoist,
          position: Math.max(0, ...c.roles.map((x) => x.position)) + 1,
        };
        c.roles.push(r);
        this.pushComm(c);
        return;
      }
      case 'role.update': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_ROLES);
        const r = c?.roles.find((x) => x.id === f.id);
        if (!c || !r) return;
        if (f.name !== undefined && r.id !== c.id) r.name = cleanName(f.name, 32) || r.name;
        if (f.color !== undefined) r.color = /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '';
        if (f.perms !== undefined) r.perms = Number(f.perms) & 0xff;
        if (f.hoist !== undefined && r.id !== c.id) r.hoist = !!f.hoist;
        this.pushComm(c);
        return;
      }
      case 'role.delete': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_ROLES);
        if (!c || f.id === c.id) return;
        c.roles = c.roles.filter((x) => x.id !== f.id);
        for (const m of c.members) m.roles = m.roles.filter((x) => x !== f.id);
        this.pushComm(c);
        return;
      }
      case 'member.update': {
        const c = this.comms.get(f.cid);
        const m = c?.members.find((x) => x.userId === f.userId);
        if (!c || !m) return;
        if (f.roles !== undefined) {
          if (!this.commFor(s, f.cid, Perm.MANAGE_ROLES)) return;
          m.roles = f.roles.filter((r) => c.roles.some((x) => x.id === r && x.id !== c.id));
        }
        if (f.nick !== undefined) {
          if (f.userId !== uid && !this.commFor(s, f.cid, Perm.MANAGE_ROLES)) return;
          const n = f.nick === null ? '' : cleanName(f.nick, 32);
          if (n) m.nick = n;
          else delete m.nick;
        }
        this.pushComm(c);
        return;
      }
      case 'member.kick': {
        const c = this.commFor(s, f.cid, Perm.KICK);
        if (!c || f.userId === c.ownerId || f.userId === uid) return;
        c.members = c.members.filter((m) => m.userId !== f.userId);
        for (const x of this.userSessions.get(f.userId) || []) this.send(x, { t: 'comm.del', cid: c.id });
        this.pushComm(c);
        return;
      }
      case 'sp.join': {
        const r = this.commOfChannel(s, f.ch);
        if (!r || r.channel.type !== 'space') return;
        if (s.space) this.leaveSpace(s);
        s.space = f.ch;
        let room = this.spaceRooms.get(f.ch);
        if (!room) this.spaceRooms.set(f.ch, (room = new Map()));
        const look = cleanLook(f.look);
        // giriş noktası: meydanın güney kenarında rastgele
        const ang = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
        const av: SpaceAvatar = { sid: s.sid, userId: uid, look, x: Math.cos(ang) * 10, z: Math.sin(ang) * 10, ry: Math.PI, a: 0 };
        const add = JSON.stringify({ t: 'sp.add', av } satisfies ServerFrame);
        for (const o of room.values()) this.sendRaw(o.s, add);
        room.set(s.sid, { s, av });
        if (!this.booths.has(f.ch)) this.booths.set(f.ch, Array.from({ length: 6 }, () => ({ owner: null, text: '' })));
        this.send(s, { t: 'sp.snap', ch: f.ch, you: s.sid, avatars: [...room.values()].map((x) => x.av), booths: this.booths.get(f.ch)! });
        return;
      }
      case 'sp.look': {
        const room = s.space && this.spaceRooms.get(s.space);
        const me = room && room.get(s.sid);
        if (!room || !me) return;
        me.av.look = cleanLook(f.look);
        const data = JSON.stringify({ t: 'sp.look', sid: s.sid, look: me.av.look } satisfies ServerFrame);
        for (const o of room.values()) this.sendRaw(o.s, data);
        return;
      }
      case 'sp.leave':
        return this.leaveSpace(s);
      case 'sp.move': {
        const room = s.space && this.spaceRooms.get(s.space);
        const me = room && room.get(s.sid);
        if (!room || !me) return;
        const num = (v: unknown, lim: number) => (typeof v === 'number' && isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
        me.av.x = num(f.x, 60);
        me.av.z = num(f.z, 60);
        me.av.ry = num(f.ry, 100);
        me.av.a = Math.max(0, Math.min(9, Math.round(num(f.a, 9))));
        const data = JSON.stringify({ t: 'sp.mv', sid: s.sid, x: me.av.x, z: me.av.z, ry: me.av.ry, a: me.av.a } satisfies ServerFrame);
        for (const o of room.values()) if (o.s !== s) this.sendRaw(o.s, data);
        return;
      }
      case 'sp.say': {
        const room = s.space && this.spaceRooms.get(s.space);
        const text = clampStr(f.text, 200).trim();
        if (!room || !text) return;
        const data = JSON.stringify({ t: 'sp.say', sid: s.sid, text } satisfies ServerFrame);
        for (const o of room.values()) this.sendRaw(o.s, data);
        return;
      }
      case 'sp.emote': {
        const room = s.space && this.spaceRooms.get(s.space);
        if (!room || !['wave', 'dance', 'jump', 'clap', 'heart', 'laugh', 'spin'].includes(f.e)) return;
        const data = JSON.stringify({ t: 'sp.emote', sid: s.sid, e: f.e } satisfies ServerFrame);
        for (const o of room.values()) this.sendRaw(o.s, data);
        return;
      }
      case 'sp.booth': {
        const ch = s.space;
        const room = ch && this.spaceRooms.get(ch);
        const booths = ch && this.booths.get(ch);
        if (!room || !booths || !Number.isInteger(f.i) || !booths[f.i]) return;
        const b = booths[f.i];
        if (f.text === null) {
          if (b.owner === uid) booths[f.i] = { owner: null, text: '' };
        } else {
          if (b.owner && b.owner !== uid && room.has(this.sidOfUserIn(room, b.owner) || '')) return; // başkasının dolu standı
          for (const x of booths) if (x.owner === uid && x !== b) (x.owner = null), (x.text = '');
          booths[f.i] = { owner: uid, text: clampStr(f.text, 60).trim() || 'Stand' };
        }
        const data = JSON.stringify({ t: 'sp.booths', booths } satisfies ServerFrame);
        for (const o of room.values()) this.sendRaw(o.s, data);
        return;
      }
      case 'web.at': {
        const r = this.commOfChannel(s, f.ch);
        if (!r || r.channel.type !== 'site') return;
        const url = cleanSiteUrl(f.url);
        if (!url) return;
        if (s.web && s.web !== f.ch) this.leaveWeb(s);
        s.web = f.ch;
        let room = this.webRooms.get(f.ch);
        if (!room) this.webRooms.set(f.ch, (room = new Map()));
        room.set(s.sid, { userId: uid, sessionId: s.sid, url, title: cleanName(f.title, 120) });
        this.broadcast(r.c, { t: 'web', ch: f.ch, viewers: [...room.values()] });
        return;
      }
      case 'web.leave':
        return this.leaveWeb(s);
      case 'vc.join': {
        const r = this.commOfChannel(s, f.ch);
        if (!r || !isVoiceLike(r.channel.type)) return;
        if (s.voice) this.leaveVoice(s);
        s.voice = { ch: f.ch, muted: !!f.muted, deaf: !!f.deaf };
        let room = this.voiceRooms.get(f.ch);
        if (!room) this.voiceRooms.set(f.ch, (room = new Map()));
        room.set(s.sid, { userId: uid, muted: !!f.muted, deaf: !!f.deaf, sessionId: s.sid });
        this.send(s, { t: 'vc.you', sessionId: s.sid });
        this.broadcast(r.c, { t: 'vc', ch: f.ch, members: [...room.values()] });
        return;
      }
      case 'vc.leave':
        return this.leaveVoice(s);
      case 'vc.state': {
        if (!s.voice) return;
        s.voice.muted = !!f.muted;
        s.voice.deaf = !!f.deaf;
        const room = this.voiceRooms.get(s.voice.ch);
        const vm = room?.get(s.sid);
        if (!room || !vm) return;
        vm.muted = s.voice.muted;
        vm.deaf = s.voice.deaf;
        vm.cam = !!f.cam;
        vm.screen = typeof f.screen === 'string' ? clampStr(f.screen, 24) : null;
        const sid = (v: unknown) => (typeof v === 'string' && /^[\w{}-]{1,64}$/.test(v) ? v : undefined);
        vm.streams = f.streams ? { mic: sid(f.streams.mic), cam: sid(f.streams.cam), screen: sid(f.streams.screen) } : undefined;
        const cid = this.chanToComm.get(s.voice.ch);
        const c = cid && this.comms.get(cid);
        if (c) this.broadcast(c, { t: 'vc', ch: s.voice.ch, members: [...room.values()] });
        return;
      }
      case 'vc.signal': {
        if (!s.voice) return;
        const room = this.voiceRooms.get(s.voice.ch);
        if (!room?.has(f.to)) return;
        for (const x of this.sessions) {
          if (x.sid === f.to) {
            this.send(x, { t: 'vc.signal', from: s.sid, fromUser: uid, data: f.data });
            break;
          }
        }
        return;
      }
    }
  }

  private sidOfUserIn(room: Map<ID, { s: Session; av: SpaceAvatar }>, uid: ID): ID | null {
    for (const [sid, x] of room) if (x.av.userId === uid) return sid;
    return null;
  }

  private leaveSpace(s: Session) {
    const ch = s.space;
    if (!ch) return;
    s.space = null;
    const room = this.spaceRooms.get(ch);
    if (!room) return;
    room.delete(s.sid);
    const data = JSON.stringify({ t: 'sp.del', sid: s.sid } satisfies ServerFrame);
    for (const o of room.values()) this.sendRaw(o.s, data);
    // ayrılanın standı boşalsın
    const booths = this.booths.get(ch);
    if (booths && s.userId && !this.sidOfUserIn(room, s.userId)) {
      let changed = false;
      for (const b of booths) if (b.owner === s.userId) (b.owner = null), (b.text = ''), (changed = true);
      if (changed) {
        const bd = JSON.stringify({ t: 'sp.booths', booths } satisfies ServerFrame);
        for (const o of room.values()) this.sendRaw(o.s, bd);
      }
    }
    if (!room.size) this.spaceRooms.delete(ch);
  }

  private leaveWeb(s: Session) {
    const ch = s.web;
    if (!ch) return;
    s.web = null;
    const room = this.webRooms.get(ch);
    if (!room) return;
    room.delete(s.sid);
    if (!room.size) this.webRooms.delete(ch);
    const cid = this.chanToComm.get(ch);
    const c = cid && this.comms.get(cid);
    if (c) this.broadcast(c, { t: 'web', ch, viewers: [...room.values()] });
  }

  private leaveVoice(s: Session) {
    if (!s.voice) return;
    const ch = s.voice.ch;
    s.voice = null;
    const room = this.voiceRooms.get(ch);
    if (!room) return;
    room.delete(s.sid);
    if (!room.size) this.voiceRooms.delete(ch);
    const cid = this.chanToComm.get(ch);
    const c = cid && this.comms.get(cid);
    if (c) this.broadcast(c, { t: 'vc', ch, members: room ? [...room.values()] : [] });
  }

  private sanitizeUser(u: UserPublic, id: ID): UserPublic {
    const out: UserPublic = {
      id,
      name: cleanName(u?.name, 32) || 'Arı',
      color: /^#[0-9a-f]{6}$/i.test(u?.color) ? u.color : '#f5a524',
    };
    if (typeof u?.avatar === 'string' && u.avatar.startsWith('data:image/') && u.avatar.length < 200_000) out.avatar = u.avatar;
    if (u?.bio) out.bio = clampStr(u.bio, 190);
    return out;
  }

  private onHello(s: Session, f: Extract<ClientFrame, { t: 'hello' }>) {
    if (s.userId) return;
    const id = clampStr(f.user?.id, 40);
    const secret = clampStr(f.secret, 200);
    if (!id || id === BOT_ID || secret.length < 16) return this.send(s, { t: 'err', msg: 'Geçersiz kimlik.' });
    const existing = this.data.users[id];
    if (existing && existing.secretHash !== sha(secret)) {
      this.send(s, { t: 'err', msg: 'Kimlik doğrulanamadı.' });
      return void s.ws.close(4001, 'auth');
    }
    const pub = this.sanitizeUser(f.user, id);
    const changed = !existing || JSON.stringify(existing.pub) !== JSON.stringify(pub);
    this.data.users[id] = { pub, secretHash: sha(secret) };
    if (changed) this.saveHub();
    s.userId = id;
    s.status = ['online', 'idle', 'dnd', 'invisible'].includes(f.status) ? f.status : 'online';
    let set = this.userSessions.get(id);
    if (!set) this.userSessions.set(id, (set = new Set()));
    set.add(s);
    if (s.loopback) this.ownerName = pub.name;
    this.sendReady(s);
    this.broadcastPresence(id);
    if (changed && existing) {
      const data = JSON.stringify({ t: 'user', u: pub } satisfies ServerFrame);
      for (const c of this.userComms(id)) for (const x of this.memberSessions(c, s)) this.sendRaw(x, data);
    }
  }

  // ---------- topluluk oluşturma ----------
  private createCommunity(ownerId: ID, name: string, color: string, icon: string | undefined, template: 'default' | 'lobby' = 'default'): StoredCommunity {
    const id = makeId();
    const roles: Role[] = [
      { id, name: '@herkes', color: '', perms: 0, hoist: false, position: 0 },
      { id: makeId(), name: 'Moderatör', color: '#3ecf8e', perms: Perm.MANAGE_MESSAGES | Perm.KICK | Perm.MANAGE_CHANNELS, hoist: true, position: 2 },
    ];
    const categories: Category[] = [];
    const channels: Channel[] = [];
    const cat = (n: string) => {
      const c = { id: makeId(), name: n, position: categories.length };
      categories.push(c);
      return c.id;
    };
    const chan = (n: string, type: ChannelType, catId: ID | null, topic?: string) => {
      const c: Channel = { id: makeId(), name: n, type, categoryId: catId, position: channels.filter((x) => x.categoryId === catId).length, topic };
      channels.push(c);
      return c;
    };
    let welcome: Channel | null = null;
    if (template === 'lobby') {
      roles.push({ id: makeId(), name: 'Bot', color: '#f5a524', perms: 0, hoist: true, position: 3 });
      const info = cat('Bilgi');
      welcome = chan('hoş-geldin', 'announce', info, 'Kovan\'a hoş geldin! Buradan başla.');
      chan('duyurular', 'announce', info, 'Önemli duyurular');
      const talk = cat('Sohbet');
      chan('genel', 'text', talk, 'Her şeyden konuşulur');
      chan('medya', 'text', talk, 'Görsel, video ve dosya paylaşımı');
      chan('kod', 'text', talk, '```kod blokları``` burada güzel görünür');
      const voice = cat('Ses Kanalları');
      chan('Lobi', 'voice', voice);
      chan('Oyun', 'voice', voice);
      const space = cat('3D Odalar');
      chan('Kovan Meydanı', 'space', space, 'Avatarınla dolaş, yakındakilerle sesli konuş');
      const sites = cat('Site Odaları');
      chan('xanaphian.com', 'site', sites, 'Siteyi birlikte gez, yanında sohbet et').url = DEFAULT_SITE_URL;
    } else {
      const talk = cat('Metin Kanalları');
      chan('genel', 'text', talk);
      chan('medya', 'text', talk);
      const voice = cat('Ses Kanalları');
      chan('Genel', 'voice', voice);
    }
    const members: Member[] = [{ userId: ownerId, roles: [], joinedAt: Date.now() }];
    if (template === 'lobby') members.push({ userId: BOT_ID, roles: [roles[2].id], joinedAt: Date.now() });
    const c: StoredCommunity = {
      id,
      name,
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#f5a524',
      ownerId,
      createdAt: Date.now(),
      roles,
      categories,
      channels,
      members,
      inviteKey: crypto.randomBytes(9).toString('base64url'),
    };
    if (icon && icon.startsWith('data:image/') && icon.length < 400_000) c.icon = icon;
    this.comms.set(id, c);
    this.data.communities.push(id);
    for (const ch of channels) this.chanToComm.set(ch.id, id);
    if (welcome) this.seedWelcome(welcome.id);
    this.saveHub();
    this.saveComm(id);
    return c;
  }

  private seedWelcome(ch: ID) {
    const texts = [
      '# Kovan\'a hoş geldin! 🐝\nBurası senin kovanın. Topluluklar oluştur, kanallar aç, arkadaşlarını davet et ve gerçek zamanlı sohbet et.',
      '## Hızlı başlangıç\n- **Arkadaş davet et:** sol üstteki topluluk adına tıkla → *Davet et*. Kodu gönder, karşı taraf *Davetle katıl* ile girer.\n- **Kanal aç:** kategori başlığındaki **+** düğmesi.\n- **Hızlı geçiş:** `Ctrl+K` ile kanallar ve topluluklar arasında atla.\n- **Yanıtla / düzenle / tepki:** mesajın üzerine gel, sağda araç çubuğu çıkar. Kendi son mesajını düzenlemek için boş kutuda `↑` tuşu.',
      '## Biçimlendirme\n**kalın**, *italik*, __altı çizili__, ~~üstü çizili~~, `satır içi kod`, ||spoiler|| ve\n```js\nconst kovan = "hızlı ve hafif";\n```\n> Alıntı da yapabilirsin.',
      '## Güncellemeler\nYeni sürüm çıktığında üst çubukta **Güncelle** düğmesi belirir. Tek tıkla indirip yeniden başlatır, tekrar kurulum dosyası indirmen gerekmez. Ayarlar → *Güncellemeler* bölümünden elle de denetleyebilirsin.',
    ];
    const base = Date.now();
    const log = this.log(ch);
    texts.forEach((content, i) => log.add({ id: makeId(base + i), channelId: ch, authorId: BOT_ID, content, ts: base + i }));
  }

  hasCommunities() {
    return this.data.communities.length > 0;
  }
  get hubId() {
    return this.data.hubId;
  }
}
