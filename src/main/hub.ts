// Kovan sunucusu (hub): her uygulama kendi topluluklarını barındırabilir.
// HTTP (dosya yükleme/indirme) + WebSocket (/ws) aynı portta.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import {
  Attachment, Category, Channel, ChannelType, ClientFrame, Community, ID, Member, Message, Perm, PROTOCOL_VERSION,
  Role, ServerFrame, Status, UserPublic, VoiceMember, can, makeId, isVoiceLike, SpaceAvatar, Booth, AvatarLook,
  ALL_PERMS, DEFAULT_EVERYONE, CHANNEL_PERMS, AuditEntry, AutoMod, Ban, Overwrite, canEditRole, channelPerms, memberPerms, outranks,
  hasFreeName, isToolChannel, toolEditPerm, type CommunityStats, type ToolType, cleanSiteUrl, DEFAULT_SITE_URL, WebViewer, siteHost, makeShortCode,
  DmInfo, isDmChannel, dmChannelId, dmPeerOf, FriendInfo, SELF_ROLE_FORBIDDEN,
} from '../shared/protocol';
import { sanitizeProfile, sanitizeCommunityProfile, sanitizeActivities, BIO_MAX, type LiveActivity } from '../shared/profile';
import { BotManager, type BotHost } from './bots';
import { sanitizeStickers } from '../shared/stickers';
import { sanitizeGuard, fmtHours, EXPLORE_CATS, catLabel, BLUEPRINT_LIMITS, type ExploreItem, type Blueprint, type BlueprintOverwrite } from '../shared/topluluk';

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
  /** bu sunucuyu ilk kullandığı an (katılma korumasındaki hesap yaşı); 1 = sürüm 1.27'den önce gelmiş eski hesap */
  since?: number;
}

interface HubData {
  hubId: ID;
  users: Record<ID, StoredUser>;
  communities: ID[];
  /** özel mesaj kanalları: kanal -> son mesaj kimliği */
  dms?: Record<ID, ID | ''>;
  /** arkadaşlıklar: 'd_<a>_<b>' -> kim istedi, kabul edildi mi */
  friends?: Record<ID, { from: ID; ok: boolean; ts: number }>;
  /** arkadaş kodları: kod -> kullanıcı */
  friendCodes?: Record<string, ID>;
  /** merkezi sunucuya taşınan topluluklar: topluluk -> sunucu adresi */
  moved?: Record<ID, string>;
  /** özel mesaj gizliliği: yalnız arkadaşlarından yeni mesaj alan kullanıcılar */
  dmFriendsOnly?: Record<ID, 1>;
}

/** Bir topluluğun taşınma paketi (yerel kovan → merkezi sunucu) */
export interface CommunityExport {
  comm: StoredCommunity;
  users: UserPublic[];
  files: { id: string; mime: string; size: number }[];
}

type StoredCommunity = Omit<Community, 'users'> & { bans?: Ban[]; audit?: AuditEntry[]; m11?: number; m112?: number };

const MAX_TIMEOUT_MIN = 28 * 24 * 60;
const LINK_RE = /(https?:\/\/|www\.)\S+/i;
const MENTION_RE = /<@&?[\w-]+>|@(everyone|here|herkes)\b/g;

/** WebSocket bağlantısı: Node'da 'ws', Cloudflare'de WebSocketPair sarmalayıcısı */
export interface Sock {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  ping(): void;
  on(ev: 'message', fn: (raw: { toString(): string }) => void): void;
  on(ev: 'close' | 'pong' | 'error', fn: (...a: any[]) => void): void;
}

export interface HubOptions {
  /** Merkezi sunucu kipi: herkes topluluk kurabilir, sahip bilgisayar yoktur */
  server?: boolean;
  /** Sunucu kipinde kişi başı kurulabilecek topluluk sayısı */
  maxOwned?: number;
}

interface Session {
  sid: ID;
  ws: Sock;
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
/** Araç kanallarının adı boş bırakılınca kullanılan adlar */
const TOOL_NAMES: Record<ToolType, string> = { ideas: 'Öneri panosu', tasks: 'Görev panosu', events: 'Etkinlikler', wall: 'Ortak duvar' };

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
  /** katılma koruması: topluluk başına son bir dakikadaki katılım anları */
  private joinTimes = new Map<ID, number[]>();
  private chanToComm = new Map<ID, ID>();
  private logs = new Map<ID, ChannelLog>();
  private sessions = new Set<Session>();
  private userSessions = new Map<ID, Set<Session>>();
  /** kullanıcıların anlık etkinlikleri (oyun, müzik, yayın); bellekte tutulur */
  private acts = new Map<ID, LiveActivity[]>();
  private voiceRooms = new Map<ID, Map<ID, VoiceMember>>();
  private spaceRooms = new Map<ID, Map<ID, { s: Session; av: SpaceAvatar }>>();
  private booths = new Map<ID, Booth[]>();
  private webRooms = new Map<ID, Map<ID, WebViewer>>();
  /** site odası için başlık + simge getirici (main.ts verir; Electron ağı ile) */
  siteMeta: ((url: string) => Promise<{ title?: string; icon?: string } | null>) | null = null;
  private metaBusy = new Set<ID>();
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private heartbeat: NodeJS.Timeout | null = null;
  port = 0;
  ownerName = 'Xanaphian';
  /** Bot API anahtarlarını şifrelemek için (main.ts safeStorage ile ayarlar) */
  crypt: BotHost['crypt'] = null;
  readonly bots: BotManager;

  readonly serverMode: boolean;
  private maxOwned: number;

  constructor(baseDir: string, opts: HubOptions = {}) {
    this.dir = path.join(baseDir, 'hub');
    this.serverMode = !!opts.server;
    this.maxOwned = opts.maxOwned ?? 20;
    if (this.serverMode) this.ownerName = 'Kovan';
    this.bots = new BotManager(this.botHost());
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

  /** Hub içinde benzersiz 7 karakterlik kısa davet kodu */
  private newInviteCode(): string {
    for (;;) {
      const code = makeShortCode((n) => crypto.randomBytes(n));
      if (![...this.comms.values()].some((x) => x.inviteCode === code)) return code;
    }
  }

  private migrate(c: StoredCommunity) {
    // v1.7: kısa davet kodu
    if (!c.inviteCode) {
      c.inviteCode = this.newInviteCode();
      this.saveComm(c.id);
    }
    this.migrateSite(c);
    this.migrate11(c);
    // v1.12: Xanaphian kimliği. Kendiliğinden kurulan adlardaki "Kovan" kalkar (kullanıcının verdiği adlara dokunulmaz).
    if (!c.m112) {
      c.m112 = 1;
      for (const ch of c.channels) if (ch.type === 'space' && ch.name === 'Kovan Meydanı') ch.name = 'Meydan';
      const owner = this.data.users[c.ownerId]?.pub.name;
      if (owner && c.name === `${owner} Kovanı`) c.name = `${owner} Topluluğu`;
      this.saveComm(c.id);
    }
    // v1.4: ayrıntılı yetkiler. Eskiden herkesin yapabildiği temel işler @herkes rolüne yazılır.
    if ((c.pv || 0) < 2) {
      c.pv = 2;
      if (c.roles[0]) c.roles[0].perms |= DEFAULT_EVERYONE;
      if (c.joinMessages === undefined) c.joinMessages = true;
      this.saveComm(c.id);
    }
  }

  /** v1.1: karşılama lobilerine 3D oda ekle */
  private migrate11(c: StoredCommunity) {
    if (!c.members.some((m) => m.userId === BOT_ID) || c.channels.some((x) => x.type === 'space') || c.m11) return;
    c.m11 = 1;
    const cat: Category = { id: makeId(), name: '3D Odalar', position: c.categories.length };
    c.categories.push(cat);
    const ch: Channel = { id: makeId(), name: 'Meydan', type: 'space', categoryId: cat.id, position: 0, topic: 'Avatarınla dolaş, yakındakilerle sesli konuş' };
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
          '## Yeni: 3D Odalar 🧭\n**Meydan**\'a gir, avatarınla dolaş. Yanına yaklaştığın kişinin sesi yükselir, uzaklaştıkça kısılır; ses yönünü de duyarsın.\n- **WASD / ok tuşları** yürü, **Shift** koş, **Boşluk** zıpla, sağ tık sürükle kamera\n- **Enter** ile yaz: mesajın başının üstünde balon olarak çıkar\n- **1-7** ile emote: el salla, dans, alkış, kalp…\n- **Sahneye** çık: herkes seni mesafeden bağımsız duyar\n- **Stand** kirala: yanına git, **E** bas, tabelana yazını yaz\n- **Kamp ateşi** banklarına **E** ile otur',
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
          '## Yeni: Site Odaları 🌐\n**xanaphian.com** artık Xanaphian\'ın içinde. Soldaki **Site Odaları** bölümünden odaya gir; site ortada açılır, sağda o odanın sohbeti durur.\n- Odada kimin hangi sayfaya baktığını görürsün; birinin üstüne tıklayıp **takip et**, o gezdikçe sen de gezersin\n- Sohbetteki xanaphian.com bağlantıları doğrudan odada açılır\n- Yöneticiler kanal oluştururken türü **Site Odası** seçip başka bir site de bağlayabilir',
      });
    }
    this.saveComm(c.id);
  }

  private ensureBot() {
    const b = this.data.users[BOT_ID];
    if (b && b.pub.name === 'Kovan Asistanı') {
      b.pub = { ...b.pub, name: 'Asistan', color: '#c9a35a', bio: 'Xanaphian\'ın yerleşik yardımcısı. Mesajlara yanıt vermez, sadece bilgilendirir.' };
      this.saveHub();
    }
    if (!this.data.users[BOT_ID]) {
      this.data.users[BOT_ID] = {
        pub: { id: BOT_ID, name: 'Asistan', color: '#c9a35a', bio: 'Xanaphian\'ın yerleşik yardımcısı. Mesajlara yanıt vermez, sadece bilgilendirir.' },
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
  /** Verileri yükler ve canlılık denetimini başlatır (HTTP dinlemeden). Cloudflare bunu kullanır. */
  init() {
    this.load();
    this.bots.load();
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
  }

  async start(preferredPort: number, host = '0.0.0.0'): Promise<number> {
    this.init();
    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 2 * 1024 * 1024,
      perMessageDeflate: {
        threshold: 1024,
        // Hızlı sıkıştırma ve küçük pencere: oran neredeyse aynı (JSON), işlemci ~3 kat, bağlantı başına bellek ~2,5 kat daha az.
        zlibDeflateOptions: { level: 1, memLevel: 7 },
        serverMaxWindowBits: 13,
      },
    });
    this.server.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/ws')) return socket.destroy();
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.attach(ws as unknown as Sock, req.socket.remoteAddress || ''));
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
        this.server!.listen(port, host);
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
    this.bots.flush();
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
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, mcp-protocol-version, mcp-session-id, x-kovan-user, x-kovan-secret, x-kovan-name, x-kovan-w, x-kovan-h');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    this.cors(res);
    const url = new URL(req.url || '/', 'http://x');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (this.bots.handleHttp(req, res, url)) return;
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
    if (req.method === 'POST' && this.serverMode && (url.pathname === '/import' || url.pathname === '/import/file')) {
      const uid = String(req.headers['x-kovan-user'] || '');
      if (!this.checkUser(uid, String(req.headers['x-kovan-secret'] || ''))) return void res.writeHead(401).end();
      const limit = url.pathname === '/import' ? 200 * 1024 * 1024 : MAX_UPLOAD;
      if (Number(req.headers['content-length'] || 0) > limit) return void res.writeHead(413).end();
      if (url.pathname === '/import/file') {
        const c = this.comms.get(url.searchParams.get('cid') || '');
        const id = url.searchParams.get('id') || '';
        if (!c || c.ownerId !== uid || !/^[a-z0-9]{6,40}$/.test(id)) return void res.writeHead(403).end();
        const file = path.join(this.dir, 'files', id);
        if (fs.existsSync(file)) return void res.writeHead(200).end('{}');
      }
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (d: Buffer) => {
        size += d.length;
        if (size > limit) {
          res.writeHead(413).end();
          req.destroy();
        } else chunks.push(d);
      });
      req.on('end', () => {
        if (size > limit) return;
        const body = Buffer.concat(chunks);
        if (url.pathname === '/import/file') {
          const id = url.searchParams.get('id')!;
          const file = path.join(this.dir, 'files', id);
          fs.writeFileSync(file, body);
          fs.writeFileSync(file + '.mime', clampStr(req.headers['content-type'] || 'application/octet-stream', 100));
          return void res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        }
        const lines = body.toString('utf8').split('\n');
        let head: CommunityExport;
        try {
          head = JSON.parse(lines.shift() || '');
        } catch {
          return void res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Paket okunamadı.' }));
        }
        const err = this.importCommunity(uid, head, lines);
        res.writeHead(err ? 409 : 200, { 'content-type': 'application/json' }).end(JSON.stringify(err ? { error: err } : { ok: true, inviteCode: this.comms.get(head.comm.id)?.inviteCode }));
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
  /** Yeni bir WebSocket bağlantısını hub'a bağlar */
  attach(ws: Sock, ip: string) {
    const s: Session = {
      sid: makeId(),
      ws,
      userId: null,
      loopback: !this.serverMode && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'),
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
        this.acts.delete(s.userId);
        this.broadcastPresence(s.userId);
      }
    }
  }

  private send(s: Session, f: ServerFrame) {
    if (s.ws.readyState === 1) s.ws.send(JSON.stringify(f));
  }
  private sendRaw(s: Session, data: string) {
    if (s.ws.readyState === 1) s.ws.send(data);
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

  /** Kullanıcıya özel topluluk görüntüsü: göremediği kanallar ve yönetim verileri çıkarılır. */
  private commUsers(c: StoredCommunity): Record<ID, UserPublic> {
    const users: Record<ID, UserPublic> = {};
    for (const m of c.members) {
      const u = this.data.users[m.userId];
      if (u) users[m.userId] = u.pub;
    }
    return users;
  }

  private snapshot(c: StoredCommunity, uid?: ID, users = this.commUsers(c)): Community {
    const { bans: _b, audit: _a, m11: _m, m112: _m2, ...rest } = c;
    const out: Community = { ...rest, users };
    if (uid) {
      out.channels = c.channels.filter((ch) => this.canView(c, uid, ch));
      if (!(memberPerms(c, uid) & (Perm.CREATE_INVITE | Perm.MANAGE_COMMUNITY)) || c.invitesPaused) {
        if (!(memberPerms(c, uid) & Perm.MANAGE_COMMUNITY)) {
          delete out.inviteKey;
          delete out.inviteCode;
        }
      }
    }
    return out;
  }

  private canView(c: StoredCommunity, uid: ID, ch: Channel): boolean {
    return (channelPerms(c, uid, ch) & Perm.VIEW_CHANNEL) !== 0;
  }

  private lastIdsFor(c: StoredCommunity, uid?: ID): Record<ID, ID> {
    const out: Record<ID, ID> = {};
    for (const ch of c.channels) {
      if (isVoiceLike(ch.type)) continue;
      if (uid && !this.canView(c, uid, ch)) continue;
      const l = this.log(ch.id).last();
      if (l) out[ch.id] = l;
    }
    return out;
  }

  private pushComm(c: StoredCommunity) {
    this.saveComm(c.id);
    // Üyelerin çoğu topluluğu aynı görür: aynı görünüm (görülen kanallar + davet bilgisi) bir kez paketlenir.
    // Eskiden her üye için ayrı ayrı paketleniyordu; kalabalık toplulukta her katılma sunucuyu yüzlerce ms kilitliyordu.
    const users = this.commUsers(c);
    const packed = new Map<string, string>();
    for (const s of this.memberSessions(c)) {
      const snap = this.snapshot(c, s.userId!, users);
      const key = (snap.inviteCode ? 'c' : '') + (snap.inviteKey ? 'k' : '') + '|' + snap.channels.map((ch) => ch.id).join(',');
      let data = packed.get(key);
      if (data === undefined) packed.set(key, (data = JSON.stringify({ t: 'comm', c: snap, lastIds: this.lastIdsFor(c, s.userId!) } satisfies ServerFrame)));
      this.sendRaw(s, data);
    }
  }

  /** Sadece kanalı görebilen üyelere gönder */
  private broadcastChan(c: StoredCommunity, ch: Channel, f: ServerFrame, except?: Session) {
    const data = JSON.stringify(f);
    for (const s of this.memberSessions(c, except)) if (this.canView(c, s.userId!, ch)) this.sendRaw(s, data);
  }

  private audit(c: StoredCommunity, by: ID, a: string, t?: string, d?: string) {
    const list = (c.audit ||= []);
    const e: AuditEntry = { id: makeId(), ts: Date.now(), by, a };
    if (t) e.t = t.slice(0, 80);
    if (d) e.d = d.slice(0, 300);
    list.push(e);
    if (list.length > 300) list.splice(0, list.length - 300);
  }

  /** Katılma koruması: baskın kilidi, hesap yaşı ve dakikalık katılım sınırı. Sorun yoksa null. */
  private joinGuardCheck(c: StoredCommunity, uid: ID): string | null {
    const now = Date.now();
    if (c.raidUntil && c.raidUntil > now) {
      const m = Math.max(1, Math.ceil((c.raidUntil - now) / 60_000));
      return `Bu toplulukta katılma koruması devrede: kısa sürede çok fazla kişi katılmaya çalıştı. ${m} dakika sonra tekrar dene.`;
    }
    if (c.raidUntil) delete c.raidUntil;
    const g = c.joinGuard;
    if (!g) return null;
    if (g.minAgeH) {
      const since = this.data.users[uid]?.since || 1;
      const ageH = (now - since) / 3_600_000;
      if (since > 1 && ageH < g.minAgeH)
        return `Bu topluluk yalnızca en az ${fmtHours(g.minAgeH)} önce açılmış hesapları kabul ediyor. Yaklaşık ${fmtHours(Math.ceil(g.minAgeH - ageH))} sonra tekrar dene.`;
    }
    if (g.perMin) {
      const list = (this.joinTimes.get(c.id) || []).filter((t) => now - t < 60_000);
      if (list.length >= g.perMin) {
        c.raidUntil = now + g.lockMin * 60_000;
        this.joinTimes.delete(c.id);
        this.audit(c, BOT_ID, 'comm.update', c.name, `baskın algılandı: bir dakikada ${list.length} katılım, yeni üyeler ${g.lockMin} dakika durduruldu`);
        this.pushComm(c);
        return `Bu toplulukta katılma koruması devrede: kısa sürede çok fazla kişi katılmaya çalıştı. ${g.lockMin} dakika sonra tekrar dene.`;
      }
      list.push(now);
      this.joinTimes.set(c.id, list);
    }
    return null;
  }

  private userName(c: StoredCommunity, uid: ID): string {
    return c.members.find((m) => m.userId === uid)?.nick || this.data.users[uid]?.pub.name || 'bilinmeyen';
  }

  /** Yasaklı kelime, bağlantı, bahsetme sınırı ve yeni üye bekleme süresi */
  private automodCheck(c: StoredCommunity, uid: ID, content: string, isNew: boolean): string | null {
    const am = c.automod;
    if (!am) return null;
    const m = c.members.find((x) => x.userId === uid);
    if (isNew && am.newMemberWait > 0 && m && Date.now() - m.joinedAt < am.newMemberWait * 60000) {
      const left = Math.ceil((am.newMemberWait * 60000 - (Date.now() - m.joinedAt)) / 60000);
      return `Yeni üyeler topluluğa katıldıktan ${am.newMemberWait} dakika sonra yazabilir (${left} dk kaldı).`;
    }
    const low = content.toLocaleLowerCase('tr');
    if (am.words.some((w) => w && low.includes(w))) return 'Mesajın topluluğun kelime filtresine takıldı.';
    if (am.blockLinks && LINK_RE.test(content)) return 'Bu toplulukta bağlantı paylaşımı kapalı.';
    if (am.maxMentions > 0 && (content.match(MENTION_RE)?.length || 0) > am.maxMentions) return `Bir mesajda en fazla ${am.maxMentions} bahsetme yapabilirsin.`;
    return null;
  }

  /** @everyone ve bahsedilemeyen rol etiketlerini etkisizleştir */
  private sanitizeMentions(c: StoredCommunity, content: string, cp: number): string {
    if (cp & Perm.MENTION_EVERYONE) return content;
    return content
      .replace(/@(everyone|here|herkes)\b/g, '@\u200b$1')
      .replace(/<@&([\w-]+)>/g, (all, id) => {
        const r = c.roles.find((x) => x.id === id);
        return r && r.mentionable ? all : '@' + (r?.name || 'rol');
      });
  }

  /** İzin üzerine yazmalarını temizler. Kişi sahip olmadığı yetkiyi değiştiremez. */
  private cleanOverwrites(c: StoredCommunity, list: unknown, old: Overwrite[] | undefined, actorPerms: number): Overwrite[] | string {
    if (!Array.isArray(list)) return old || [];
    const out: Overwrite[] = [];
    const seen = new Set<string>();
    for (const o of list.slice(0, 100)) {
      if (!o || typeof o.id !== 'string' || seen.has(o.id)) continue;
      const type: Overwrite['type'] = o.type === 'member' ? 'member' : 'role';
      if (type === 'role' && !c.roles.some((r) => r.id === o.id)) continue;
      if (type === 'member' && !c.members.some((m) => m.userId === o.id)) continue;
      const allow = (Number(o.allow) | 0) & CHANNEL_PERMS;
      const deny = (Number(o.deny) | 0) & CHANNEL_PERMS & ~allow;
      if (!allow && !deny && o.id !== c.id) continue;
      const prev = old?.find((x) => x.id === o.id);
      const changed = (allow ^ (prev?.allow || 0)) | (deny ^ (prev?.deny || 0));
      if (changed & ~actorPerms) return 'Sahip olmadığın bir yetkiyi değiştiremezsin.';
      seen.add(o.id);
      out.push({ id: o.id, type, allow, deny });
    }
    for (const prev of old || []) if (!seen.has(prev.id) && (prev.allow | prev.deny) & ~actorPerms) return 'Sahip olmadığın bir yetkiyi kaldıramazsın.';
    return out;
  }

  /** Üyeyi topluluktan çıkarır ve oturumlarına bildirir */
  private evict(c: StoredCommunity, userId: ID) {
    c.members = c.members.filter((m) => m.userId !== userId);
    for (const x of this.userSessions.get(userId) || []) {
      if (x.voice && this.chanToComm.get(x.voice.ch) === c.id) this.leaveVoice(x);
      if (x.space && this.chanToComm.get(x.space) === c.id) this.leaveSpace(x);
      this.send(x, { t: 'comm.del', cid: c.id });
    }
  }

  private effectiveStatus(uid: ID): Status {
    if (this.bots.isBot(uid)) return 'online';
    const set = this.userSessions.get(uid);
    if (!set || set.size === 0) return 'offline';
    let st: Status = 'invisible';
    const rank: Record<Status, number> = { online: 4, dnd: 3, idle: 2, invisible: 1, offline: 0 };
    for (const s of set) if (rank[s.status] > rank[st]) st = s.status;
    return st === 'invisible' ? 'offline' : st;
  }

  /** Görünür etkinlikler: çevrimdışı / görünmez kullanıcınınki gösterilmez */
  private actsOf(uid: ID, status = this.effectiveStatus(uid)): LiveActivity[] {
    return status === 'offline' ? [] : this.acts.get(uid) || [];
  }

  private presenceFrame(uid: ID): ServerFrame {
    if (uid === BOT_ID) return { t: 'presence', uid, status: 'online' };
    const status = this.effectiveStatus(uid);
    return { t: 'presence', uid, status, acts: this.actsOf(uid, status) };
  }

  private broadcastPresence(uid: ID) {
    const data = JSON.stringify(this.presenceFrame(uid));
    const sent = new Set<Session>();
    for (const c of this.comms.values()) {
      if (!c.members.some((m) => m.userId === uid)) continue;
      for (const s of this.memberSessions(c)) {
        if (sent.has(s)) continue;
        sent.add(s);
        this.sendRaw(s, data);
      }
    }
    for (const p of this.contactsOf(uid)) for (const s of this.userSessions.get(p) || []) if (!sent.has(s)) (sent.add(s), this.sendRaw(s, data));
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
    // taşınmış topluluklar: üyeye yeni adresi bildir
    for (const [cid, host] of Object.entries(this.data.moved || {})) this.send(s, { t: 'comm.moved', cid, host });
    const comms = this.userComms(uid);
    const presence: Record<ID, Status> = {};
    const lastIds: Record<ID, ID> = {};
    const voice: Record<ID, VoiceMember[]> = {};
    const web: Record<ID, WebViewer[]> = {};
    for (const c of comms) {
      for (const m of c.members) presence[m.userId] = m.userId === BOT_ID ? 'online' : this.effectiveStatus(m.userId);
      Object.assign(lastIds, this.lastIdsFor(c, uid));
      for (const ch of c.channels) {
        const room = this.voiceRooms.get(ch.id);
        if (room && room.size) voice[ch.id] = [...room.values()];
        const wr = this.webRooms.get(ch.id);
        if (wr && wr.size) web[ch.id] = [...wr.values()];
      }
    }
    for (const p of this.contactsOf(uid)) presence[p] = this.effectiveStatus(p);
    const acts: Record<ID, LiveActivity[]> = {};
    for (const p of Object.keys(presence)) {
      const a = this.actsOf(p, presence[p]);
      if (a.length) acts[p] = a;
    }
    for (const d of this.dmsFor(uid)) {
      const room = this.voiceRooms.get(d.ch);
      if (room && room.size) voice[d.ch] = [...room.values()];
    }
    this.send(s, {
      t: 'ready',
      hubId: this.data.hubId,
      hubName: this.ownerName,
      me: uid,
      communities: comms.map((c) => this.snapshot(c, uid)),
      presence,
      lastIds,
      voice,
      web,
      dms: this.dmsFor(uid),
      friends: this.friendsFor(uid),
      acts,
      v: PROTOCOL_VERSION,
    });
  }

  // ---------- özel mesajlar ----------
  /** İki kullanıcı bu kovanda en az bir toplulukta birlikte mi? */
  private shareCommunity(a: ID, b: ID) {
    return this.userComms(a).some((c) => c.members.some((m) => m.userId === b));
  }

  private dmsFor(uid: ID): DmInfo[] {
    const out: DmInfo[] = [];
    for (const [ch, lastId] of Object.entries(this.data.dms || {})) {
      const peer = dmPeerOf(ch, uid);
      const pu = peer && this.data.users[peer];
      if (pu) out.push({ ch, peer: pu.pub, ...(lastId ? { lastId } : {}) });
    }
    return out;
  }

  private dmInfo(ch: ID, uid: ID): DmInfo | null {
    const peer = dmPeerOf(ch, uid);
    const pu = peer && this.data.users[peer];
    if (!pu) return null;
    const lastId = this.data.dms?.[ch];
    return { ch, peer: pu.pub, ...(lastId ? { lastId } : {}) };
  }

  /** Kullanıcının bu DM'e erişimi var mı (taraflardan biri ve ya kayıtlı DM ya da ortak topluluk) */
  private dmAllowed(uid: ID, ch: ID): ID | null {
    const peer = dmPeerOf(ch, uid);
    if (!peer || peer === uid || peer === BOT_ID || !this.data.users[peer] || this.bots.isBot(peer)) return null;
    if (this.data.dms && ch in this.data.dms) return peer;
    return this.canMessage(uid, peer) ? peer : null;
  }

  private canMessage(a: ID, b: ID) {
    return !this.dmBlockReason(a, b);
  }

  /** a, b'ye özel mesaj yazamıyorsa nedeni (arkadaşlık, ortak topluluk ve b'nin gizlilik ayarı) */
  private dmBlockReason(a: ID, b: ID): string | null {
    const friends = !!this.data.friends?.[dmChannelId(a, b)]?.ok;
    if (friends) return null;
    if (this.data.dmFriendsOnly?.[b]) return 'Bu kişi yalnızca arkadaşlarından özel mesaj alıyor. Önce arkadaşlık isteği gönder.';
    if (!this.shareCommunity(a, b)) return 'Bu kişiyle ortak bir topluluğun olmadığı için mesajlaşamazsın.';
    return null;
  }

  /** Arkadaşları, istek bekleyenleri ve DM yazışanları (varlık/profil güncellemeleri için) */
  private contactsOf(uid: ID): ID[] {
    const out = new Set<ID>();
    for (const k of Object.keys(this.data.friends || {})) {
      const p = dmPeerOf(k, uid);
      if (p) out.add(p);
    }
    for (const k of Object.keys(this.data.dms || {})) {
      const p = dmPeerOf(k, uid);
      if (p) out.add(p);
    }
    out.delete(uid);
    return [...out];
  }

  // ---------- arkadaşlar ----------
  private friendsFor(uid: ID): FriendInfo[] {
    const out: FriendInfo[] = [];
    for (const k of Object.keys(this.data.friends || {})) {
      const fi = this.friendInfo(k, uid);
      if (fi) out.push(fi);
    }
    return out;
  }

  private friendInfo(key: ID, uid: ID): FriendInfo | null {
    const r = this.data.friends?.[key];
    const peer = dmPeerOf(key, uid);
    const pu = peer && this.data.users[peer];
    if (!r || !pu) return null;
    return { user: pu.pub, state: r.ok ? 'ok' : r.from === uid ? 'out' : 'in', ts: r.ts };
  }

  private pushFriend(key: ID) {
    const m = /^d_([\w-]+)_([\w-]+)$/.exec(key);
    if (!m) return;
    for (const u of [m[1], m[2]]) {
      const fi = this.friendInfo(key, u);
      const other = u === m[1] ? m[2] : m[1];
      for (const x of this.userSessions.get(u) || []) {
        if (fi) {
          this.send(x, { t: 'friend', f: fi });
          this.send(x, this.presenceFrame(other));
        } else this.send(x, { t: 'friend.del', uid: other });
      }
    }
  }

  /** a, b'ye arkadaşlık isteği gönderir; karşı taraf zaten istemişse arkadaş olurlar */
  private friendRequest(a: ID, b: ID, direct = false): string | null {
    if (a === b) return 'Kendine arkadaşlık isteği gönderemezsin.';
    if (!this.data.users[b] || b === BOT_ID || this.bots.isBot(b) || this.bots.isBot(a)) return 'Bu kişi bulunamadı.';
    const key = dmChannelId(a, b);
    this.data.friends ||= {};
    const r = this.data.friends[key];
    if (r?.ok) return null;
    if (!direct && !r && !this.shareCommunity(a, b)) return 'Arkadaş eklemek için ortak bir topluluğunuz olmalı ya da onun arkadaş kodunu kullanmalısın.';
    if (direct || (r && r.from === b)) this.data.friends[key] = { from: r?.from || a, ok: true, ts: Date.now() };
    else this.data.friends[key] = { from: a, ok: false, ts: Date.now() };
    this.saveHub();
    this.pushFriend(key);
    return null;
  }

  private friendCodeOf(uid: ID, reset = false): string {
    this.data.friendCodes ||= {};
    const codes = this.data.friendCodes;
    let code = Object.keys(codes).find((k) => codes[k] === uid);
    if (code && reset) delete codes[code], (code = undefined);
    if (!code) {
      do code = makeShortCode((n) => crypto.randomBytes(n));
      while (codes[code] || [...this.comms.values()].some((c) => c.inviteCode === code));
      codes[code] = uid;
      this.saveHub();
    }
    return code;
  }

  private handleFriend(s: Session, uid: ID, f: ClientFrame): boolean {
    switch (f.t) {
      case 'friend.req': {
        const err = this.friendRequest(uid, String(f.to || ''));
        if (err) this.send(s, { t: 'err', msg: err, rid: f.rid });
        else if (f.rid) this.send(s, { t: 'ok', rid: f.rid });
        return true;
      }
      case 'friend.accept': {
        const key = dmChannelId(uid, String(f.to || ''));
        const r = this.data.friends?.[key];
        if (r && !r.ok && r.from !== uid) {
          r.ok = true;
          r.ts = Date.now();
          this.saveHub();
          this.pushFriend(key);
        }
        return true;
      }
      case 'friend.remove': {
        const key = dmChannelId(uid, String(f.to || ''));
        if (this.data.friends?.[key]) {
          delete this.data.friends[key];
          this.saveHub();
          this.pushFriend(key);
        }
        return true;
      }
      case 'friend.code':
        this.send(s, { t: 'ok', rid: f.rid, data: this.friendCodeOf(uid, !!f.reset) });
        return true;
      case 'friend.mutual': {
        // iki kişinin de onaylı arkadaşı olanlar
        const other = String(f.uid || '');
        const fr = this.data.friends || {};
        const out: UserPublic[] = [];
        if (other && other !== uid) {
          for (const k of Object.keys(fr)) {
            if (!fr[k].ok) continue;
            const p = dmPeerOf(k, uid);
            if (!p || p === other || !fr[dmChannelId(other, p)]?.ok) continue;
            const pu = this.data.users[p];
            if (pu) out.push(pu.pub);
          }
        }
        this.send(s, { t: 'ok', rid: f.rid, data: out.slice(0, 200) });
        return true;
      }
      case 'privacy': {
        const on = f.dms === 'friends';
        if (on === !!this.data.dmFriendsOnly?.[uid]) return true;
        this.data.dmFriendsOnly ||= {};
        if (on) this.data.dmFriendsOnly[uid] = 1;
        else delete this.data.dmFriendsOnly[uid];
        this.saveHub();
        return true;
      }
    }
    return false;
  }

  private dmBroadcast(ch: ID, f: ServerFrame, except?: Session) {
    const m = /^d_([\w-]+)_([\w-]+)$/.exec(ch);
    if (!m) return;
    const data = JSON.stringify(f);
    for (const uid of [m[1], m[2]]) for (const x of this.userSessions.get(uid) || []) if (x !== except) this.sendRaw(x, data);
  }

  /** DM kaydını oluşturur/günceller; yeni ise iki tarafa da haber verir */
  private dmTouch(ch: ID, lastId: ID | '') {
    this.data.dms ||= {};
    const isNew = !(ch in this.data.dms);
    this.data.dms[ch] = lastId || this.data.dms[ch] || '';
    this.saveHub();
    if (isNew) {
      const m = /^d_([\w-]+)_([\w-]+)$/.exec(ch)!;
      for (const uid of [m[1], m[2]]) {
        const info = this.dmInfo(ch, uid);
        if (info) for (const x of this.userSessions.get(uid) || []) this.send(x, { t: 'dm', dm: info });
      }
    }
  }

  private handleDm(s: Session, uid: ID, f: ClientFrame): boolean {
    if (f.t === 'dm.open') {
      const ch = dmChannelId(uid, String(f.to || ''));
      if (!this.dmAllowed(uid, ch)) {
        const to = String(f.to || '');
        const why = this.data.users[to] && to !== uid ? this.dmBlockReason(uid, to) : null;
        this.send(s, { t: 'err', msg: why || 'Bu kişiyle ortak bir topluluğun olmadığı için mesajlaşamazsın.', rid: f.rid });
        return true;
      }
      this.dmTouch(ch, '');
      this.send(s, { t: 'ok', rid: f.rid, data: this.dmInfo(ch, uid) });
      return true;
    }
    const ch = (f as { ch?: unknown }).ch;
    if (typeof ch !== 'string' || !isDmChannel(ch)) return false;
    if (!['send', 'edit', 'del', 'react', 'pin', 'hist', 'pins', 'typing'].includes(f.t)) return f.t !== 'vc.join';
    const peer = this.dmAllowed(uid, ch);
    if (!peer) {
      if (f.t === 'hist') this.send(s, { t: 'hist', rid: f.rid, ch, msgs: [], more: false });
      return true;
    }
    const L = this.log(ch);
    switch (f.t) {
      case 'send': {
        if (!this.canMessage(uid, peer)) {
          const why = this.data.dmFriendsOnly?.[peer] ? this.dmBlockReason(uid, peer)! : 'Bu kişiyle artık ortak bir topluluğunuz yok ve arkadaş değilsiniz, mesaj gönderemezsin.';
          return this.send(s, { t: 'err', msg: why, nonce: f.nonce }), true;
        }
        if (Date.now() - (s.lastSend[ch] || 0) < 80) return this.send(s, { t: 'err', msg: 'Biraz yavaş yaz.', nonce: f.nonce }), true;
        s.lastSend[ch] = Date.now();
        const content = clampStr(f.content, MAX_CONTENT).trim();
        const atts = Array.isArray(f.attachments) ? f.attachments.slice(0, 10).filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/f/')) : [];
        if (!content && !atts.length) return true;
        const m: Message = { id: makeId(), channelId: ch, authorId: uid, content, ts: Date.now() };
        if (f.replyTo && L.byId.has(f.replyTo)) m.replyTo = f.replyTo;
        if (atts.length) m.attachments = atts.map((a) => ({ id: clampStr(a.id, 20), name: clampStr(a.name, 120), size: Number(a.size) || 0, mime: clampStr(a.mime, 100), url: clampStr(a.url, 300), w: a.w, h: a.h }));
        L.add(m);
        this.dmTouch(ch, m.id);
        this.dmBroadcast(ch, { t: 'msg', m }, s);
        this.send(s, { t: 'msg', m, nonce: f.nonce });
        return true;
      }
      case 'edit': {
        const m = L.byId.get(f.id);
        const content = clampStr(f.content, MAX_CONTENT).trim();
        if (!m || m.authorId !== uid || (!content && !m.attachments?.length)) return true;
        m.content = content;
        m.editedTs = Date.now();
        L.update(m);
        this.dmBroadcast(ch, { t: 'msg.upd', m });
        return true;
      }
      case 'del': {
        const m = L.byId.get(f.id);
        if (!m || m.authorId !== uid) return true;
        L.remove(f.id);
        this.dmBroadcast(ch, { t: 'msg.del', ch, id: f.id });
        return true;
      }
      case 'react': {
        const m = L.byId.get(f.id);
        const e = clampStr(f.e, 32);
        if (!m || !e) return true;
        m.reactions ||= {};
        const arr = m.reactions[e] || [];
        if (f.on) {
          if (arr.includes(uid) || (!m.reactions[e] && Object.keys(m.reactions).length >= 20)) return true;
          m.reactions[e] = [...arr, uid];
        } else {
          const next = arr.filter((x) => x !== uid);
          if (next.length) m.reactions[e] = next;
          else delete m.reactions[e];
        }
        L.update(m);
        this.dmBroadcast(ch, { t: 'msg.upd', m });
        return true;
      }
      case 'pin': {
        const m = L.byId.get(f.id);
        if (!m) return true;
        m.pinned = !!f.on;
        L.update(m);
        this.dmBroadcast(ch, { t: 'msg.upd', m });
        return true;
      }
      case 'hist': {
        const p = L.page(f.before, f.around);
        this.send(s, { t: 'hist', rid: f.rid, ch, msgs: p.msgs, more: p.more });
        return true;
      }
      case 'pins':
        this.send(s, { t: 'pins', rid: f.rid, ch, msgs: L.list.filter((m) => m.pinned).slice(-50).reverse() });
        return true;
      case 'typing':
        this.dmBroadcast(ch, { t: 'typing', ch, uid }, s);
        return true;
    }
    return true;
  }

  private commOfChannel(s: Session, ch: ID): { c: StoredCommunity; channel: Channel } | null {
    const cid = this.chanToComm.get(ch);
    const c = cid ? this.comms.get(cid) : undefined;
    if (!c || !s.userId || !c.members.some((m) => m.userId === s.userId)) return null;
    const channel = c.channels.find((x) => x.id === ch);
    return channel && this.canView(c, s.userId, channel) ? { c, channel } : null;
  }

  private commFor(s: Session, cid: ID, perm = 0): StoredCommunity | null {
    const c = this.comms.get(cid);
    if (!c || !s.userId || !c.members.some((m) => m.userId === s.userId)) return null;
    if (perm && !can(c, s.userId, perm)) {
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
    if (f.t.startsWith('bot.')) return this.bots.handleFrame(uid, f as Extract<ClientFrame, { t: `bot.${string}` }>, (x) => this.send(s, x));
    if (this.handleFriend(s, uid, f) || this.handleDm(s, uid, f)) return;

    switch (f.t) {
      case 'join': {
        const code = typeof f.code === 'string' ? f.code.toLowerCase() : '';
        const c = code ? [...this.comms.values()].find((x) => x.inviteCode === code) : f.cid ? this.comms.get(f.cid) : undefined;
        if (this.bots.isBot(uid)) return this.send(s, { t: 'err', msg: 'Botlar davetle katılamaz.', rid: f.rid });
        const friendOf = !c && code ? this.data.friendCodes?.[code] : undefined;
        if (friendOf) {
          // arkadaş kodu: kodun sahibiyle doğrudan arkadaş olunur
          if (friendOf === uid) return this.send(s, { t: 'err', msg: 'Bu senin kendi arkadaş kodun. Arkadaşına gönder, o yapıştırsın.', rid: f.rid });
          const err = this.friendRequest(uid, friendOf, true);
          if (err) return this.send(s, { t: 'err', msg: err, rid: f.rid });
          if (f.rid) this.send(s, { t: 'ok', rid: f.rid, data: '@' + friendOf });
          return;
        }
        if (!c || (!code && c.inviteKey !== f.key && !c.listing)) return this.send(s, { t: 'err', msg: 'Davet geçersiz ya da süresi dolmuş.', rid: f.rid });
        if (!c.members.some((m) => m.userId === uid)) {
          if (c.bans?.some((b) => b.userId === uid)) return this.send(s, { t: 'err', msg: 'Bu topluluktan yasaklandın.', rid: f.rid });
          if (c.invitesPaused) return this.send(s, { t: 'err', msg: 'Bu topluluk şu an yeni üye kabul etmiyor.', rid: f.rid });
          const guardErr = this.joinGuardCheck(c, uid);
          if (guardErr) return this.send(s, { t: 'err', msg: guardErr, rid: f.rid });
          c.members.push({ userId: uid, roles: [], joinedAt: Date.now() });
          const sys = c.systemChannelId ? c.channels.find((x) => x.id === c.systemChannelId && !isVoiceLike(x.type)) : undefined;
          const first = sys || c.channels.find((x) => !isVoiceLike(x.type) && this.canView(c, uid, x));
          if (first && c.joinMessages !== false) {
            const m: Message = { id: makeId(), channelId: first.id, authorId: uid, content: '', ts: Date.now(), kind: 'join' };
            this.log(first.id).add(m);
            this.pushComm(c);
            this.broadcastChan(c, first, { t: 'msg', m });
          } else this.pushComm(c);
          this.broadcastPresence(uid);
          this.bots.onJoin(c, uid);
        }
        for (const x of this.userSessions.get(uid) || [s])
          for (const m of c.members) this.send(x, this.presenceFrame(m.userId));
        this.send(s, { t: 'comm', c: this.snapshot(c, uid), lastIds: this.lastIdsFor(c, uid) });
        if (f.rid) this.send(s, { t: 'ok', rid: f.rid, data: c.id });
        return;
      }
      case 'send': {
        const r = this.commOfChannel(s, f.ch);
        if (!r || isVoiceLike(r.channel.type)) return;
        const cp = channelPerms(r.c, uid, r.channel);
        const mem = r.c.members.find((m) => m.userId === uid);
        if (!(cp & Perm.SEND_MESSAGES)) {
          const msg =
            mem?.timeoutUntil && mem.timeoutUntil > Date.now()
              ? `Zaman aşımındasın: ${Math.ceil((mem.timeoutUntil - Date.now()) / 60000)} dakika daha yazamazsın.`
              : r.channel.type === 'announce'
                ? 'Bu kanala sadece yöneticiler yazabilir.'
                : 'Bu kanala mesaj gönderme yetkin yok.';
          return this.send(s, { t: 'err', msg, nonce: f.nonce });
        }
        let content = clampStr(f.content, MAX_CONTENT).trim();
        const atts = Array.isArray(f.attachments) ? f.attachments.slice(0, 10).filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/f/')) : [];
        if (!content && !atts.length) return;
        if (atts.length && !(cp & Perm.ATTACH_FILES)) return this.send(s, { t: 'err', msg: 'Bu kanalda dosya gönderme yetkin yok.', nonce: f.nonce });
        if (!(cp & Perm.MANAGE_MESSAGES)) {
          if (r.channel.slowmode) {
            const last = s.lastSend[f.ch] || 0;
            if (Date.now() - last < r.channel.slowmode * 1000)
              return this.send(s, { t: 'err', msg: `Yavaş mod açık: ${r.channel.slowmode} sn bekle.`, nonce: f.nonce });
          }
          const am = this.automodCheck(r.c, uid, content, true);
          if (am) return this.send(s, { t: 'err', msg: am, nonce: f.nonce });
        }
        content = this.sanitizeMentions(r.c, content, cp);
        s.lastSend[f.ch] = Date.now();
        const m: Message = { id: makeId(), channelId: f.ch, authorId: uid, content, ts: Date.now() };
        if (f.replyTo && this.log(f.ch).byId.has(f.replyTo)) m.replyTo = f.replyTo;
        if (atts.length) m.attachments = atts.map((a) => ({ id: clampStr(a.id, 20), name: clampStr(a.name, 120), size: Number(a.size) || 0, mime: clampStr(a.mime, 100), url: clampStr(a.url, 300), w: a.w, h: a.h }));
        this.log(f.ch).add(m);
        this.broadcastChan(r.c, r.channel, { t: 'msg', m }, s);
        this.send(s, { t: 'msg', m, nonce: f.nonce });
        this.bots.onMessage(r.c, r.channel, m);
        return;
      }
      case 'edit': {
        const r = this.commOfChannel(s, f.ch);
        const m = r && this.log(f.ch).byId.get(f.id);
        if (!r || !m) return;
        let content = clampStr(f.content, MAX_CONTENT).trim();
        if (m.authorId !== uid) {
          // araç kanallarında pano öğesi (xn:<tür>) başkası tarafından da güncellenebilir: görev taşıma, öneri durumu…
          const t = r.channel.type;
          if (!isToolChannel(t) || !(channelPerms(r.c, uid, r.channel) & toolEditPerm(t))) return;
          const kind = (x: string) => /^xn:[a-z]+ /.exec(x)?.[0];
          if (!kind(m.content) || kind(m.content) !== kind(content)) return;
        }
        if (!content && !m.attachments?.length) return;
        const cp = channelPerms(r.c, uid, r.channel);
        if (!(cp & Perm.MANAGE_MESSAGES)) {
          const am = this.automodCheck(r.c, uid, content, false);
          if (am) return this.send(s, { t: 'err', msg: am });
        }
        content = this.sanitizeMentions(r.c, content, cp);
        m.content = content;
        m.editedTs = Date.now();
        this.log(f.ch).update(m);
        this.broadcastChan(r.c, r.channel, { t: 'msg.upd', m });
        return;
      }
      case 'del': {
        const r = this.commOfChannel(s, f.ch);
        const m = r && this.log(f.ch).byId.get(f.id);
        if (!r || !m) return;
        if (m.authorId !== uid) {
          if (!(channelPerms(r.c, uid, r.channel) & Perm.MANAGE_MESSAGES)) return;
          this.audit(r.c, uid, 'msg.delete', this.userName(r.c, m.authorId), '#' + r.channel.name);
          this.saveComm(r.c.id);
        }
        this.log(f.ch).remove(f.id);
        this.broadcastChan(r.c, r.channel, { t: 'msg.del', ch: f.ch, id: f.id });
        return;
      }
      case 'react': {
        const r = this.commOfChannel(s, f.ch);
        const m = r && this.log(f.ch).byId.get(f.id);
        const e = clampStr(f.e, 32);
        if (!r || !m || !e) return;
        if (f.on && !(channelPerms(r.c, uid, r.channel) & Perm.ADD_REACTIONS)) return this.send(s, { t: 'err', msg: 'Bu kanalda tepki ekleme yetkin yok.' });
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
        this.broadcastChan(r.c, r.channel, { t: 'msg.upd', m });
        return;
      }
      case 'pin': {
        const r = this.commOfChannel(s, f.ch);
        const m = r && this.log(f.ch).byId.get(f.id);
        if (!r || !m || !(channelPerms(r.c, uid, r.channel) & Perm.MANAGE_MESSAGES)) return;
        m.pinned = !!f.on;
        this.log(f.ch).update(m);
        this.broadcastChan(r.c, r.channel, { t: 'msg.upd', m });
        return;
      }
      case 'hist': {
        const r = this.commOfChannel(s, f.ch);
        if (!r) return this.send(s, { t: 'hist', rid: f.rid, ch: f.ch, msgs: [], more: false });
        if (f.full && isToolChannel(r.channel.type) && !f.before && !f.around) {
          const L = this.log(f.ch).list;
          return this.send(s, { t: 'hist', rid: f.rid, ch: f.ch, msgs: L.slice(-2000), more: L.length > 2000 });
        }
        const p = this.log(f.ch).page(f.before, f.around);
        return this.send(s, { t: 'hist', rid: f.rid, ch: f.ch, msgs: p.msgs, more: p.more });
      }
      case 'stats': {
        const c = this.commFor(s, f.cid);
        if (!c) return;
        return this.send(s, { t: 'ok', rid: f.rid, data: this.stats(c, uid, f.days) });
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
            if (isVoiceLike(ch.type) || !this.canView(c, uid, ch)) continue;
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
        if (r) this.broadcastChan(r.c, r.channel, { t: 'typing', ch: f.ch, uid }, s);
        return;
      }
      case 'presence': {
        if (!['online', 'idle', 'dnd', 'invisible'].includes(f.status)) return;
        s.status = f.status;
        this.broadcastPresence(uid);
        return;
      }
      case 'activity': {
        if (this.data.users[uid]?.pub.bot) return;
        const acts = sanitizeActivities(f.acts);
        const prev = this.acts.get(uid);
        if (JSON.stringify(prev || []) === JSON.stringify(acts)) return;
        if (acts.length) this.acts.set(uid, acts);
        else this.acts.delete(uid);
        this.broadcastPresence(uid);
        return;
      }
      case 'profile': {
        const u = this.data.users[uid];
        if (u.pub.bot) return;
        u.pub = this.sanitizeUser(f.user, uid);
        this.saveHub();
        const data = JSON.stringify({ t: 'user', u: u.pub } satisfies ServerFrame);
        const sent = new Set<Session>();
        for (const c of this.userComms(uid))
          for (const x of this.memberSessions(c)) if (!sent.has(x)) (sent.add(x), this.sendRaw(x, data));
        for (const p of [uid, ...this.contactsOf(uid)]) for (const x of this.userSessions.get(p) || []) if (!sent.has(x)) (sent.add(x), this.sendRaw(x, data));
        return;
      }
      case 'comm.create': {
        if (this.serverMode) {
          const owned = [...this.comms.values()].filter((x) => x.ownerId === uid).length;
          if (owned >= this.maxOwned) return this.send(s, { t: 'err', msg: `En fazla ${this.maxOwned} topluluk kurabilirsin.`, rid: f.rid });
        } else if (!s.loopback) return this.send(s, { t: 'err', msg: 'Bu sunucuda topluluk oluşturamazsın.', rid: f.rid });
        const c = this.createCommunity(uid, cleanName(f.name, 48) || 'Yeni Topluluk', f.color, f.icon, f.template, f.blueprint);
        for (const ch of c.channels) if (ch.type === 'site') this.refreshSiteMeta(c.id, ch.id);
        this.send(s, { t: 'comm', c: this.snapshot(c, uid), lastIds: this.lastIdsFor(c, uid) });
        if (f.rid) this.send(s, { t: 'ok', rid: f.rid, data: c.id });
        return;
      }
      case 'comm.update': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_COMMUNITY);
        if (!c) return;
        const changed: string[] = [];
        if (f.name !== undefined) {
          const n = cleanName(f.name, 48) || c.name;
          if (n !== c.name) changed.push(`ad: ${n}`);
          c.name = n;
        }
        if (f.description !== undefined) (c.description = clampStr(f.description, 300)), changed.push('açıklama');
        if (f.profile !== undefined) {
          const p = f.profile === null ? undefined : sanitizeCommunityProfile(f.profile);
          if (p) c.profile = p;
          else delete c.profile;
          changed.push('sunucu profili');
        }
        if (f.color !== undefined && /^#[0-9a-f]{6}$/i.test(f.color)) (c.color = f.color), changed.push('renk');
        if (f.icon !== undefined) {
          if (f.icon === null) delete c.icon;
          else if (typeof f.icon === 'string' && f.icon.startsWith('data:image/') && f.icon.length < 400_000) c.icon = f.icon;
          changed.push('simge');
        }
        if (f.systemChannelId !== undefined) {
          c.systemChannelId = f.systemChannelId && c.channels.some((x) => x.id === f.systemChannelId && !isVoiceLike(x.type)) ? f.systemChannelId : null;
          changed.push('sistem kanalı');
        }
        if (f.joinMessages !== undefined) (c.joinMessages = !!f.joinMessages), changed.push(`katılma mesajları ${f.joinMessages ? 'açık' : 'kapalı'}`);
        if (f.invitesPaused !== undefined) (c.invitesPaused = !!f.invitesPaused), changed.push(f.invitesPaused ? 'davetler durduruldu' : 'davetler açıldı');
        if (f.stickers !== undefined) {
          const st = sanitizeStickers(f.stickers);
          if (st.length) c.stickers = st;
          else delete c.stickers;
          changed.push('çıkartmalar');
        }
        if (f.automod !== undefined) {
          const a = f.automod as Partial<AutoMod>;
          c.automod = {
            words: (Array.isArray(a?.words) ? a.words : [])
              .map((w) => clampStr(w, 40).toLocaleLowerCase('tr').trim())
              .filter(Boolean)
              .slice(0, 200),
            blockLinks: !!a?.blockLinks,
            maxMentions: Math.max(0, Math.min(50, Math.floor(Number(a?.maxMentions) || 0))),
            newMemberWait: Math.max(0, Math.min(1440, Math.floor(Number(a?.newMemberWait) || 0))),
          };
          changed.push('otomatik moderasyon');
        }
        if (changed.length) this.audit(c, uid, 'comm.update', c.name, changed.join(', '));
        this.pushComm(c);
        return;
      }
      case 'comm.guard': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_COMMUNITY);
        if (!c) return;
        if (f.guard !== undefined) {
          const g = sanitizeGuard(f.guard);
          if (!g.minAgeH && !g.perMin) delete c.joinGuard;
          else c.joinGuard = g;
          this.audit(c, uid, 'comm.update', c.name, `katılma koruması: ${g.minAgeH ? 'hesap en az ' + fmtHours(g.minAgeH) : 'hesap yaşı serbest'}, ${g.perMin ? 'dakikada en çok ' + g.perMin + ' katılım' : 'hız sınırı yok'}`);
        }
        if (f.unlock && c.raidUntil) {
          delete c.raidUntil;
          this.joinTimes.delete(c.id);
          this.audit(c, uid, 'comm.update', c.name, 'baskın kilidi kaldırıldı');
        }
        this.pushComm(c);
        return;
      }
      case 'comm.listing': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_COMMUNITY);
        if (!c) return;
        const cat = f.listing && EXPLORE_CATS.some((x) => x.id === f.listing!.cat) ? f.listing.cat : null;
        if (cat) c.listing = { cat, at: c.listing?.at || Date.now() };
        else delete c.listing;
        this.audit(c, uid, 'comm.update', c.name, cat ? `keşfette listelendi (${catLabel(cat)})` : 'keşfetten kaldırıldı');
        this.pushComm(c);
        return;
      }
      case 'explore': {
        const out: ExploreItem[] = [];
        for (const c of this.comms.values()) {
          if (!c.listing) continue;
          let online = 0;
          for (const m of c.members) {
            const set = this.userSessions.get(m.userId);
            if (set && [...set].some((x) => x.status !== 'invisible')) online++;
          }
          const it: ExploreItem = { id: c.id, name: c.name, color: c.color, cat: c.listing.cat, members: c.members.filter((m) => m.userId !== BOT_ID).length, online, createdAt: c.createdAt };
          if (c.icon) it.icon = c.icon;
          if (c.description) it.description = c.description;
          const p = c.profile;
          // büyük afiş resimleri listeyi şişirmesin (kart rengiyle düz afiş gösterilir)
          if (p?.banner && !(p.banner.image && p.banner.image.length > 250_000)) it.banner = p.banner;
          if (p?.tagline) it.tagline = p.tagline;
          if (p?.tags?.length) it.tags = p.tags;
          if (c.members.some((m) => m.userId === uid)) it.joined = true;
          out.push(it);
        }
        out.sort((a, b) => b.online - a.online || b.members - a.members);
        this.send(s, { t: 'ok', rid: f.rid, data: out.slice(0, 200) });
        return;
      }
      case 'comm.invite.reset': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_COMMUNITY);
        if (!c) return;
        c.inviteKey = crypto.randomBytes(9).toString('base64url');
        c.inviteCode = this.newInviteCode();
        this.audit(c, uid, 'invite.reset');
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
        this.bots.onCommDeleted(c.id);
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
        const src = f.clone ? c.channels.find((x) => x.id === f.clone) : undefined;
        const want = src ? src.type : f.type;
        const type: ChannelType = isVoiceLike(want) || want === 'announce' || want === 'site' || isToolChannel(want) ? want : 'text';
        const catId = f.categoryId && c.categories.some((x) => x.id === f.categoryId) ? f.categoryId : null;
        const ch: Channel = {
          id: makeId(),
          name: hasFreeName(type)
            ? cleanName(f.name, 48) || (type === 'space' ? '3D Oda' : type === 'site' ? siteHost(cleanSiteUrl(src ? src.url : f.url) || DEFAULT_SITE_URL) || 'Site' : isToolChannel(type) ? TOOL_NAMES[type] : 'Ses')
            : channelSlug(f.name),
          type,
          categoryId: catId,
          position: Math.max(-1, ...c.channels.filter((x) => x.categoryId === catId).map((x) => x.position)) + 1,
        };
        if (src) {
          if (src.topic) ch.topic = src.topic;
          if (src.slowmode) ch.slowmode = src.slowmode;
          if (src.userLimit) ch.userLimit = src.userLimit;
          if (src.overwrites?.length) ch.overwrites = src.overwrites.map((o) => ({ ...o }));
        } else if (f.private) {
          ch.overwrites = [
            { id: c.id, type: 'role', allow: 0, deny: Perm.VIEW_CHANNEL },
            { id: uid, type: 'member', allow: Perm.VIEW_CHANNEL, deny: 0 },
          ];
        }
        if (type === 'site') {
          ch.url = cleanSiteUrl(src ? src.url : f.url) || DEFAULT_SITE_URL;
          if (src?.url === ch.url && src.icon) (ch.icon = src.icon), (ch.siteTitle = src.siteTitle), (ch.metaAt = src.metaAt);
        }
        c.channels.push(ch);
        this.chanToComm.set(ch.id, c.id);
        this.audit(c, uid, 'chan.create', (hasFreeName(type) ? '' : '#') + ch.name, src ? 'kopya' : f.private ? 'özel kanal' : undefined);
        this.pushComm(c);
        if (type === 'site') this.refreshSiteMeta(c.id, ch.id);
        if (f.rid) this.send(s, { t: 'ok', rid: f.rid, data: ch.id });
        return;
      }
      case 'chan.update': {
        const c = this.commFor(s, f.cid);
        const ch = c?.channels.find((x) => x.id === f.id);
        if (!c || !ch) return;
        const cp = channelPerms(c, uid, ch);
        if (!(cp & Perm.MANAGE_CHANNELS)) return this.send(s, { t: 'err', msg: 'Bu kanalı düzenleme yetkin yok.' });
        const changed: string[] = [];
        if (f.overwrites !== undefined) {
          if (!(cp & Perm.MANAGE_ROLES)) return this.send(s, { t: 'err', msg: 'Kanal izinlerini değiştirmek için "Rolleri yönet" yetkisi gerekir.' });
          const ow = this.cleanOverwrites(c, f.overwrites, ch.overwrites, cp);
          if (typeof ow === 'string') return this.send(s, { t: 'err', msg: ow });
          ch.overwrites = ow;
          changed.push('izinler');
        }
        if (f.name !== undefined) {
          const n = hasFreeName(ch.type) ? cleanName(f.name, 48) || ch.name : channelSlug(f.name);
          if (n !== ch.name) changed.push(`ad: ${ch.name} → ${n}`);
          ch.name = n;
        }
        if (f.topic !== undefined && f.topic !== (ch.topic || '')) (ch.topic = clampStr(f.topic, 512)), changed.push('konu');
        if (f.slowmode !== undefined) {
          const v = Math.max(0, Math.min(21600, Number(f.slowmode) || 0));
          if (v !== (ch.slowmode || 0)) changed.push(`yavaş mod: ${v ? v + ' sn' : 'kapalı'}`);
          ch.slowmode = v;
        }
        if (f.userLimit !== undefined && isVoiceLike(ch.type)) {
          const v = Math.max(0, Math.min(99, Math.floor(Number(f.userLimit) || 0)));
          if (v !== (ch.userLimit || 0)) changed.push(`kişi sınırı: ${v || 'sınırsız'}`);
          ch.userLimit = v;
        }
        if (f.type !== undefined && f.type !== ch.type && (f.type === 'text' || f.type === 'announce') && (ch.type === 'text' || ch.type === 'announce')) {
          ch.type = f.type;
          changed.push(f.type === 'announce' ? 'duyuru kanalına çevrildi' : 'metin kanalına çevrildi');
        }
        if (f.url !== undefined && ch.type === 'site') {
          const u = cleanSiteUrl(f.url) || ch.url || DEFAULT_SITE_URL;
          if (u !== ch.url) {
            changed.push(`adres: ${u}`);
            ch.url = u;
            delete ch.icon;
            delete ch.metaAt;
            setTimeout(() => this.refreshSiteMeta(c.id, ch.id, true), 0);
          }
        }
        if (f.categoryId !== undefined) ch.categoryId = f.categoryId && c.categories.some((x) => x.id === f.categoryId) ? f.categoryId : null;
        if (changed.length) this.audit(c, uid, 'chan.update', (hasFreeName(ch.type) ? '' : '#') + ch.name, changed.join(', '));
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
        const ch = c.channels.find((x) => x.id === f.id);
        if (!ch) return;
        c.channels = c.channels.filter((x) => x.id !== f.id);
        if (c.systemChannelId === f.id) c.systemChannelId = null;
        for (const x of this.sessions) if (x.web === f.id) x.web = null;
        this.webRooms.delete(f.id);
        this.chanToComm.delete(f.id);
        this.logs.delete(f.id);
        fsp.unlink(path.join(this.dir, 'messages', f.id + '.ndjson')).catch(() => {});
        this.audit(c, uid, 'chan.delete', (hasFreeName(ch.type) ? '' : '#') + ch.name);
        this.pushComm(c);
        return;
      }
      case 'cat.create': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        if (!c || c.categories.length >= 50) return;
        const cat: Category = { id: makeId(), name: cleanName(f.name, 40) || 'Kategori', position: c.categories.length };
        c.categories.push(cat);
        this.audit(c, uid, 'cat.create', cat.name);
        this.pushComm(c);
        return;
      }
      case 'cat.update': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        const cat = c?.categories.find((x) => x.id === f.id);
        if (!c || !cat) return;
        const changed: string[] = [];
        if (f.overwrites !== undefined) {
          const ap = memberPerms(c, uid);
          if (!(ap & Perm.MANAGE_ROLES)) return this.send(s, { t: 'err', msg: 'Kategori izinlerini değiştirmek için "Rolleri yönet" yetkisi gerekir.' });
          const ow = this.cleanOverwrites(c, f.overwrites, cat.overwrites, ap);
          if (typeof ow === 'string') return this.send(s, { t: 'err', msg: ow });
          cat.overwrites = ow;
          changed.push('izinler');
        }
        if (f.name !== undefined) {
          const n = cleanName(f.name, 40) || cat.name;
          if (n !== cat.name) changed.push(`ad: ${n}`);
          cat.name = n;
        }
        if (changed.length) this.audit(c, uid, 'cat.update', cat.name, changed.join(', '));
        this.pushComm(c);
        return;
      }
      case 'cat.delete': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_CHANNELS);
        if (!c) return;
        const cat = c.categories.find((x) => x.id === f.id);
        c.categories = c.categories.filter((x) => x.id !== f.id);
        for (const ch of c.channels) if (ch.categoryId === f.id) ch.categoryId = null;
        if (cat) this.audit(c, uid, 'cat.delete', cat.name);
        this.pushComm(c);
        return;
      }
      case 'role.create': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_ROLES);
        if (!c || c.roles.length >= 50) return;
        const ap = memberPerms(c, uid);
        // yeni rol en alta (@herkes'in hemen üstüne) eklenir
        for (const x of c.roles) if (x.id !== c.id) x.position += 1;
        const r: Role = {
          id: makeId(),
          name: cleanName(f.name, 32) || 'yeni rol',
          color: /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '',
          perms: (Number(f.perms) & ALL_PERMS) & ap,
          hoist: !!f.hoist,
          position: 1,
        };
        if (f.mentionable) r.mentionable = true;
        if (f.selfAssign && !(r.perms & SELF_ROLE_FORBIDDEN)) r.selfAssign = true;
        const icon = clampStr(f.icon, 16).trim();
        if (icon) r.icon = icon;
        c.roles.push(r);
        this.normalizeRoles(c);
        this.audit(c, uid, 'role.create', r.name);
        this.pushComm(c);
        if (f.rid) this.send(s, { t: 'ok', rid: f.rid, data: r.id });
        return;
      }
      case 'role.update': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_ROLES);
        const r = c?.roles.find((x) => x.id === f.id);
        if (!c || !r) return;
        if (!canEditRole(c, uid, r)) return this.send(s, { t: 'err', msg: 'Bu rol senin en yüksek rolünle aynı seviyede ya da üstünde; düzenleyemezsin.' });
        const changed: string[] = [];
        if (f.name !== undefined && r.id !== c.id) {
          const n = cleanName(f.name, 32) || r.name;
          if (n !== r.name) changed.push(`ad: ${r.name} → ${n}`);
          r.name = n;
        }
        if (f.color !== undefined) (r.color = /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : ''), changed.push('renk');
        if (f.perms !== undefined) {
          const next = Number(f.perms) & ALL_PERMS;
          const diff = next ^ r.perms;
          if (diff & ~memberPerms(c, uid)) return this.send(s, { t: 'err', msg: 'Sahip olmadığın bir yetkiyi verip alamazsın.' });
          if (diff) changed.push('yetkiler');
          r.perms = next;
        }
        if (f.hoist !== undefined && r.id !== c.id) (r.hoist = !!f.hoist), changed.push(f.hoist ? 'ayrı gösteriliyor' : 'ayrı gösterilmiyor');
        if (f.mentionable !== undefined && r.id !== c.id) {
          if (f.mentionable) r.mentionable = true;
          else delete r.mentionable;
          changed.push(f.mentionable ? 'bahsedilebilir' : 'bahsedilemez');
        }
        if (f.icon !== undefined && r.id !== c.id) {
          const icon = clampStr(f.icon, 16).trim();
          if (icon) r.icon = icon;
          else delete r.icon;
          changed.push('rozet');
        }
        if (f.selfAssign !== undefined && r.id !== c.id) {
          if (f.selfAssign && r.perms & SELF_ROLE_FORBIDDEN)
            return this.send(s, { t: 'err', msg: 'Yönetim yetkisi olan bir rolü üyeler kendisi alamaz. Önce bu rolden yönetim yetkilerini kaldır.' });
          if (f.selfAssign) r.selfAssign = true;
          else delete r.selfAssign;
          changed.push(f.selfAssign ? 'üyeler kendisi alabilir' : 'üyeler kendisi alamaz');
        }
        // yönetim yetkisi verilen rol artık kendine verilemez
        if (r.selfAssign && r.perms & SELF_ROLE_FORBIDDEN) delete r.selfAssign;
        if (changed.length) this.audit(c, uid, 'role.update', r.name, changed.join(', '));
        this.pushComm(c);
        return;
      }
      case 'role.move': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_ROLES);
        const r = c?.roles.find((x) => x.id === f.id);
        if (!c || !r || r.id === c.id) return;
        this.normalizeRoles(c);
        const list = c.roles.filter((x) => x.id !== c.id).sort((a, b) => a.position - b.position);
        const i = list.indexOf(r);
        const j = i + (f.dir > 0 ? 1 : -1);
        const other = list[j];
        if (!other) return;
        if (!canEditRole(c, uid, r) || !canEditRole(c, uid, other)) return this.send(s, { t: 'err', msg: 'Kendi en yüksek rolünün üstüne rol taşıyamazsın.' });
        [r.position, other.position] = [other.position, r.position];
        this.audit(c, uid, 'role.move', r.name, f.dir > 0 ? 'yukarı' : 'aşağı');
        this.pushComm(c);
        return;
      }
      case 'role.delete': {
        const c = this.commFor(s, f.cid, Perm.MANAGE_ROLES);
        const r = c?.roles.find((x) => x.id === f.id);
        if (!c || !r || f.id === c.id) return;
        if (!canEditRole(c, uid, r)) return this.send(s, { t: 'err', msg: 'Bu rolü silemezsin: senin en yüksek rolünle aynı seviyede ya da üstünde.' });
        c.roles = c.roles.filter((x) => x.id !== f.id);
        for (const m of c.members) m.roles = m.roles.filter((x) => x !== f.id);
        for (const ch of c.channels) if (ch.overwrites) ch.overwrites = ch.overwrites.filter((o) => o.id !== f.id);
        for (const cat of c.categories) if (cat.overwrites) cat.overwrites = cat.overwrites.filter((o) => o.id !== f.id);
        this.normalizeRoles(c);
        this.audit(c, uid, 'role.delete', r.name);
        this.pushComm(c);
        return;
      }
      case 'role.self': {
        const c = this.comms.get(f.cid);
        const r = c?.roles.find((x) => x.id === f.id);
        const m = c?.members.find((x) => x.userId === uid);
        const fail = (msg: string) => this.send(s, { t: 'err', msg, rid: f.rid });
        if (!c || !r || !m || r.id === c.id) return fail('Rol bulunamadı.');
        if (!r.selfAssign || r.perms & SELF_ROLE_FORBIDDEN) return fail('Bu rolü kendine veremezsin.');
        const has = m.roles.includes(r.id);
        if (f.on && !has) m.roles.push(r.id);
        else if (!f.on && has) m.roles = m.roles.filter((x) => x !== r.id);
        else {
          if (f.rid) this.send(s, { t: 'ok', rid: f.rid });
          return;
        }
        this.audit(c, uid, 'member.selfrole', this.userName(c, uid), `${f.on ? '+' : '-'} ${r.name}`);
        this.pushComm(c);
        if (f.rid) this.send(s, { t: 'ok', rid: f.rid });
        return;
      }
      case 'member.update': {
        const c = this.comms.get(f.cid);
        const m = c?.members.find((x) => x.userId === f.userId);
        if (!c || !m || !c.members.some((x) => x.userId === uid)) return;
        if (f.roles !== undefined) {
          if (!this.commFor(s, f.cid, Perm.MANAGE_ROLES)) return;
          const next = (Array.isArray(f.roles) ? f.roles : []).filter((r, i, a) => a.indexOf(r) === i && c.roles.some((x) => x.id === r && x.id !== c.id));
          const added = next.filter((r) => !m.roles.includes(r));
          const removed = m.roles.filter((r) => !next.includes(r));
          for (const id of [...added, ...removed]) {
            const role = c.roles.find((x) => x.id === id);
            if (role && !canEditRole(c, uid, role)) return this.send(s, { t: 'err', msg: `"${role.name}" rolünü veremezsin: senin en yüksek rolünle aynı seviyede ya da üstünde.` });
          }
          m.roles = next;
          const names = (ids: ID[]) => ids.map((id) => c.roles.find((x) => x.id === id)?.name).filter(Boolean).join(', ');
          if (added.length || removed.length)
            this.audit(c, uid, 'member.roles', this.userName(c, f.userId), [added.length && `+ ${names(added)}`, removed.length && `- ${names(removed)}`].filter(Boolean).join(' · '));
        }
        if (f.nick !== undefined) {
          if (f.userId === uid) {
            if (!can(c, uid, Perm.CHANGE_NICKNAME) && !can(c, uid, Perm.MANAGE_NICKNAMES)) return this.send(s, { t: 'err', msg: 'Takma adını değiştirme yetkin yok.' });
          } else {
            if (!can(c, uid, Perm.MANAGE_NICKNAMES) && !can(c, uid, Perm.MANAGE_ROLES)) return this.send(s, { t: 'err', msg: 'Bunun için yetkin yok.' });
            if (!outranks(c, uid, f.userId)) return this.send(s, { t: 'err', msg: 'Senden yüksek ya da eşit roldeki birinin takma adını değiştiremezsin.' });
          }
          const n = f.nick === null ? '' : cleanName(f.nick, 32);
          if (n) m.nick = n;
          else delete m.nick;
          if (f.userId !== uid) this.audit(c, uid, 'member.nick', this.data.users[f.userId]?.pub.name || '', n || 'kaldırıldı');
        }
        this.pushComm(c);
        return;
      }
      case 'member.kick': {
        const c = this.commFor(s, f.cid, Perm.KICK);
        if (!c || !c.members.some((m) => m.userId === f.userId)) return;
        if (!outranks(c, uid, f.userId)) return this.send(s, { t: 'err', msg: 'Senden yüksek ya da eşit roldeki birini atamazsın.' });
        this.audit(c, uid, 'member.kick', this.userName(c, f.userId), clampStr(f.reason, 200) || undefined);
        this.evict(c, f.userId);
        this.pushComm(c);
        this.bots.onKick(c, f.userId);
        return;
      }
      case 'member.ban': {
        const c = this.commFor(s, f.cid, Perm.BAN);
        if (!c || f.userId === BOT_ID) return;
        if (c.members.some((m) => m.userId === f.userId) ? !outranks(c, uid, f.userId) : f.userId === c.ownerId || f.userId === uid)
          return this.send(s, { t: 'err', msg: 'Senden yüksek ya da eşit roldeki birini yasaklayamazsın.' });
        const name = this.userName(c, f.userId);
        const reason = clampStr(f.reason, 200).trim();
        c.bans = (c.bans || []).filter((b) => b.userId !== f.userId);
        c.bans.push({ userId: f.userId, name, by: uid, ts: Date.now(), ...(reason ? { reason } : {}) });
        if (c.bans.length > 1000) c.bans.splice(0, c.bans.length - 1000);
        const hours = Math.max(0, Math.min(168, Number(f.purgeHours) || 0));
        let purged = 0;
        if (hours) {
          const since = Date.now() - hours * 3600_000;
          for (const ch of c.channels) {
            if (isVoiceLike(ch.type)) continue;
            const log = this.log(ch.id);
            for (const m of log.list.filter((x) => x.authorId === f.userId && x.ts >= since)) {
              log.remove(m.id);
              purged++;
              this.broadcastChan(c, ch, { t: 'msg.del', ch: ch.id, id: m.id });
            }
          }
        }
        this.audit(c, uid, 'member.ban', name, [reason, purged ? `${purged} mesaj silindi` : ''].filter(Boolean).join(' · ') || undefined);
        if (c.members.some((m) => m.userId === f.userId)) this.evict(c, f.userId);
        this.pushComm(c);
        return;
      }
      case 'member.unban': {
        const c = this.commFor(s, f.cid, Perm.BAN);
        const b = c?.bans?.find((x) => x.userId === f.userId);
        if (!c || !b) return;
        c.bans = c.bans!.filter((x) => x.userId !== f.userId);
        this.audit(c, uid, 'member.unban', b.name);
        this.saveComm(c.id);
        return;
      }
      case 'member.timeout': {
        const c = this.commFor(s, f.cid, Perm.TIMEOUT);
        const m = c?.members.find((x) => x.userId === f.userId);
        if (!c || !m) return;
        if (!outranks(c, uid, f.userId) || can(c, f.userId, Perm.ADMIN))
          return this.send(s, { t: 'err', msg: 'Bu üyeye zaman aşımı uygulayamazsın.' });
        const min = Math.max(0, Math.min(MAX_TIMEOUT_MIN, Math.floor(Number(f.minutes) || 0)));
        if (min) m.timeoutUntil = Date.now() + min * 60000;
        else delete m.timeoutUntil;
        const reason = clampStr(f.reason, 200).trim();
        this.audit(c, uid, 'member.timeout', this.userName(c, f.userId), [min ? `${min} dk` : 'kaldırıldı', reason].filter(Boolean).join(' · '));
        this.pushComm(c);
        return;
      }
      case 'mod.list': {
        const c = this.commFor(s, f.cid);
        if (!c) return;
        const p = memberPerms(c, uid);
        const bans = p & (Perm.BAN | Perm.KICK) ? [...(c.bans || [])].reverse() : [];
        const audit = p & Perm.VIEW_AUDIT_LOG ? [...(c.audit || [])].reverse() : [];
        return this.send(s, { t: 'ok', rid: f.rid, data: { bans, audit } });
      }
      case 'sp.join': {
        const r = this.commOfChannel(s, f.ch);
        if (!r || r.channel.type !== 'space') return;
        const deny = this.voiceDenied(r.c, r.channel, uid, s.space === f.ch);
        if (deny) return this.send(s, { t: 'err', msg: deny });
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
        if (typeof f.ch === 'string' && isDmChannel(f.ch)) {
          // özel arama: iki taraftan biri ve yazışabiliyorlar
          const peer = this.dmAllowed(uid, f.ch);
          if (!peer || !this.canMessage(uid, peer)) return this.send(s, { t: 'err', msg: 'Bu kişiyi arayamazsın.' });
          if (s.voice) this.leaveVoice(s);
          s.voice = { ch: f.ch, muted: !!f.muted, deaf: !!f.deaf };
          let room = this.voiceRooms.get(f.ch);
          if (!room) this.voiceRooms.set(f.ch, (room = new Map()));
          room.set(s.sid, { userId: uid, muted: !!f.muted, deaf: !!f.deaf, sessionId: s.sid });
          this.dmTouch(f.ch, '');
          this.send(s, { t: 'vc.you', sessionId: s.sid });
          this.dmBroadcast(f.ch, { t: 'vc', ch: f.ch, members: [...room.values()] });
          return;
        }
        const r = this.commOfChannel(s, f.ch);
        if (!r || !isVoiceLike(r.channel.type)) return;
        const deny = r.channel.type === 'voice' ? this.voiceDenied(r.c, r.channel, uid, s.voice?.ch === f.ch) : null;
        if (deny) return this.send(s, { t: 'err', msg: deny });
        // konuşma yetkisi yoksa susturulmuş katılır
        const muted = !!f.muted || !(channelPerms(r.c, uid, r.channel) & Perm.SPEAK);
        if (s.voice) this.leaveVoice(s);
        s.voice = { ch: f.ch, muted, deaf: !!f.deaf };
        let room = this.voiceRooms.get(f.ch);
        if (!room) this.voiceRooms.set(f.ch, (room = new Map()));
        room.set(s.sid, { userId: uid, muted, deaf: !!f.deaf, sessionId: s.sid });
        this.send(s, { t: 'vc.you', sessionId: s.sid });
        this.broadcast(r.c, { t: 'vc', ch: f.ch, members: [...room.values()] });
        return;
      }
      case 'vc.leave':
        return this.leaveVoice(s);
      case 'vc.state': {
        if (!s.voice) return;
        const vr = isDmChannel(s.voice.ch) ? null : this.commOfChannel(s, s.voice.ch);
        s.voice.muted = !!f.muted || (!!vr && !(channelPerms(vr.c, uid, vr.channel) & Perm.SPEAK));
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
        if (isDmChannel(s.voice.ch)) return this.dmBroadcast(s.voice.ch, { t: 'vc', ch: s.voice.ch, members: [...room.values()] });
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

  /** Ses / 3D oda katılım denetimi: bağlanma yetkisi ve kişi sınırı */
  private voiceDenied(c: StoredCommunity, ch: Channel, uid: ID, already: boolean): string | null {
    const cp = channelPerms(c, uid, ch);
    if (!(cp & Perm.CONNECT)) {
      const m = c.members.find((x) => x.userId === uid);
      return m?.timeoutUntil && m.timeoutUntil > Date.now() ? 'Zaman aşımındayken sesli kanallara katılamazsın.' : 'Bu kanala bağlanma yetkin yok.';
    }
    if (!already && ch.userLimit && !(cp & Perm.MANAGE_CHANNELS)) {
      const users = new Set<ID>();
      const room = ch.type === 'space' ? this.spaceRooms.get(ch.id) : this.voiceRooms.get(ch.id);
      if (room) for (const v of room.values()) users.add('av' in v ? v.av.userId : v.userId);
      users.delete(uid);
      if (users.size >= ch.userLimit) return `Kanal dolu (${ch.userLimit} kişi sınırı).`;
    }
    return null;
  }

  /** Rol konumlarını 0..n aralığında sıkıştırır; @herkes her zaman 0 */
  /** Topluluk istatistikleri: üyenin görebildiği kanallardaki mesajlardan hesaplanır */
  private stats(c: StoredCommunity, uid: ID, daysIn: number): CommunityStats {
    const days = [7, 30, 90].includes(daysIn) ? daysIn : 30;
    const TZ = 3 * 3600_000; // Türkiye saati
    const DAY = 86400_000;
    const today = Math.floor((Date.now() + TZ) / DAY);
    const first = today - days + 1;
    const since = first * DAY - TZ;
    const perDay = new Array(days).fill(0);
    const perHour = new Array(24).fill(0);
    const chN = new Map<ID, number>();
    const userN = new Map<ID, number>();
    let messages = 0;
    for (const ch of c.channels) {
      if (isVoiceLike(ch.type) || !this.canView(c, uid, ch)) continue;
      const L = this.log(ch.id).list;
      for (let i = L.length - 1; i >= 0; i--) {
        const m = L[i];
        if (m.ts < since) break;
        if (m.kind || m.authorId === BOT_ID) continue;
        const local = m.ts + TZ;
        const d = Math.floor(local / DAY) - first;
        if (d < 0 || d >= days) continue;
        perDay[d]++;
        perHour[Math.floor((local % DAY) / 3600_000)]++;
        chN.set(ch.id, (chN.get(ch.id) || 0) + 1);
        userN.set(m.authorId, (userN.get(m.authorId) || 0) + 1);
        messages++;
      }
    }
    const members = c.members.filter((m) => m.userId !== BOT_ID);
    const joined = members.filter((m) => m.joinedAt >= since).length;
    const memberCurve = perDay.map((_, i) => {
      const end = (first + i + 1) * DAY - TZ;
      return members.filter((m) => m.joinedAt < end).length;
    });
    const top = (map: Map<ID, number>) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, n]) => ({ id, n }));
    return { days, perDay, perHour, messages, activeMembers: userN.size, joined, memberCurve, topChannels: top(chN), topMembers: top(userN) };
  }

  private normalizeRoles(c: StoredCommunity) {
    const rest = c.roles.filter((r) => r.id !== c.id).sort((a, b) => a.position - b.position);
    rest.forEach((r, i) => (r.position = i + 1));
    const ev = c.roles.find((r) => r.id === c.id);
    if (ev) ev.position = 0;
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

  /** Site odasının başlığını ve simgesini (favicon) getirip kanala yaz. Ad hâlâ varsayılansa başlığı ad yapar. */
  private refreshSiteMeta(cid: ID, chId: ID, force = false) {
    const c0 = this.comms.get(cid);
    const ch0 = c0?.channels.find((x) => x.id === chId);
    if (!this.siteMeta || !ch0 || ch0.type !== 'site' || !ch0.url || this.metaBusy.has(chId)) return;
    if (!force && ch0.metaAt && ch0.icon !== undefined && Date.now() - ch0.metaAt < 24 * 3600_000) return;
    const url = ch0.url;
    this.metaBusy.add(chId);
    this.siteMeta(url)
      .then((m) => {
        const c = this.comms.get(cid);
        const ch = c?.channels.find((x) => x.id === chId);
        if (!c || !ch || ch.url !== url || !m) return;
        ch.metaAt = Date.now();
        if (typeof m.icon === 'string' && m.icon.startsWith('data:image/') && m.icon.length <= 120_000) ch.icon = m.icon;
        const title = cleanName(m.title, 48);
        if (title) {
          // kullanıcı adı elle değiştirmediyse (varsayılan ya da önceki site başlığı) sitenin başlığını kullan
          const auto = ch.name === siteHost(url) || ch.name === 'Site' || ch.name === 'xanaphian.com' || (!!ch.siteTitle && ch.name === ch.siteTitle);
          if (auto) ch.name = title;
          ch.siteTitle = title;
        }
        this.pushComm(c);
      })
      .catch(() => {})
      .finally(() => this.metaBusy.delete(chId));
  }

  /** Açılışta ve günde bir: tüm site odalarının bilgisini tazele */
  refreshAllSiteMeta() {
    for (const c of this.comms.values()) for (const ch of c.channels) if (ch.type === 'site') this.refreshSiteMeta(c.id, ch.id);
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
    if (isDmChannel(ch)) return this.dmBroadcast(ch, { t: 'vc', ch, members: [...room.values()] });
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
    if (u?.bio) out.bio = clampStr(u.bio, BIO_MAX);
    const profile = sanitizeProfile(u?.profile);
    if (profile) out.profile = profile;
    return out;
  }

  private onHello(s: Session, f: Extract<ClientFrame, { t: 'hello' }>) {
    if (s.userId) return;
    const id = clampStr(f.user?.id, 40);
    const secret = clampStr(f.secret, 200);
    if (!id || id === BOT_ID || secret.length < 16) return this.send(s, { t: 'err', msg: 'Geçersiz kimlik.' });
    const existing = this.data.users[id];
    if (existing && existing.secretHash && existing.secretHash !== sha(secret)) {
      this.send(s, { t: 'err', msg: 'Kimlik doğrulanamadı.' });
      return void s.ws.close(4001, 'auth');
    }
    // bot hesapları (belirteçle bağlanan bot programları) profillerini değiştiremez
    const pub = existing?.pub.bot ? existing.pub : this.sanitizeUser(f.user, id);
    const changed = !existing || JSON.stringify(existing.pub) !== JSON.stringify(pub);
    this.data.users[id] = { pub, secretHash: sha(secret), since: existing ? existing.since || 1 : Date.now() };
    if (changed || !existing?.since) this.saveHub();
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
      const sent = new Set<Session>([s]);
      for (const c of this.userComms(id)) for (const x of this.memberSessions(c, s)) if (!sent.has(x)) (sent.add(x), this.sendRaw(x, data));
      for (const p of this.contactsOf(id)) for (const x of this.userSessions.get(p) || []) if (!sent.has(x)) (sent.add(x), this.sendRaw(x, data));
    }
  }

  // ---------- topluluk oluşturma ----------
  private createCommunity(ownerId: ID, name: string, color: string, icon: string | undefined, template: 'default' | 'lobby' = 'default', bp?: Blueprint): StoredCommunity {
    const id = makeId();
    const roles: Role[] = [
      { id, name: '@herkes', color: '', perms: DEFAULT_EVERYONE, hoist: false, position: 0 },
      {
        id: makeId(),
        name: 'Moderatör',
        color: '#3ecf8e',
        perms: Perm.MANAGE_MESSAGES | Perm.KICK | Perm.MANAGE_CHANNELS | Perm.TIMEOUT | Perm.MANAGE_NICKNAMES | Perm.VIEW_AUDIT_LOG | Perm.MENTION_EVERYONE,
        hoist: true,
        mentionable: true,
        position: 2,
      },
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
    if (bp && typeof bp === 'object' && Array.isArray(bp.channels)) {
      // Discord şablonundan: @herkes, roller, kategoriler ve kanallar şablondaki gibi
      roles.length = 1;
      const ev = Number(bp.everyone) & ALL_PERMS & ~Perm.ADMIN;
      roles[0].perms = ev & Perm.VIEW_CHANNEL ? ev : DEFAULT_EVERYONE;
      const list = (Array.isArray(bp.roles) ? bp.roles : []).slice(0, BLUEPRINT_LIMITS.roles);
      list.forEach((r, i) => {
        const role: Role = {
          id: makeId(),
          name: cleanName(r?.name, 32) || 'rol',
          color: typeof r?.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '',
          perms: (Number(r?.perms) | 0) & ALL_PERMS,
          hoist: !!r?.hoist,
          position: i + 1,
        };
        if (r?.mentionable) role.mentionable = true;
        roles.push(role);
      });
      const ow = (x: BlueprintOverwrite[] | undefined): Overwrite[] | undefined => {
        const out: Overwrite[] = [];
        for (const o of Array.isArray(x) ? x.slice(0, 30) : []) {
          const rid = o?.role === -1 ? id : roles[(Number(o?.role) | 0) + 1]?.id;
          if (!rid || out.some((y) => y.id === rid)) continue;
          const allow = (Number(o.allow) | 0) & CHANNEL_PERMS;
          const deny = (Number(o.deny) | 0) & CHANNEL_PERMS & ~allow;
          if (allow || deny) out.push({ id: rid, type: 'role', allow, deny });
        }
        return out.length ? out : undefined;
      };
      const catIds = (Array.isArray(bp.categories) ? bp.categories : []).slice(0, BLUEPRINT_LIMITS.categories).map((k) => {
        const cid = cat(cleanName(k?.name, 40) || 'Kategori');
        const o = ow(k?.ow);
        if (o) categories[categories.length - 1].overwrites = o;
        return cid;
      });
      for (const x of bp.channels.slice(0, BLUEPRINT_LIMITS.channels)) {
        const type: ChannelType = x?.type === 'voice' || x?.type === 'announce' ? x.type : 'text';
        const catId = typeof x?.cat === 'number' ? catIds[x.cat] ?? null : null;
        const ch = chan(type === 'voice' ? cleanName(x?.name, 48) || 'Ses' : channelSlug(x?.name), type, catId, x?.topic ? clampStr(x.topic, 512) : undefined);
        if (!ch.topic) delete ch.topic;
        const sm = Math.max(0, Math.min(21600, Number(x?.slowmode) || 0));
        if (sm) ch.slowmode = sm;
        const ul = Math.max(0, Math.min(99, Number(x?.userLimit) || 0));
        if (ul && type === 'voice') ch.userLimit = ul;
        const o = ow(x?.ow);
        if (o) ch.overwrites = o;
      }
      if (!channels.some((x) => !isVoiceLike(x.type))) chan('genel', 'text', null);
    } else if (template === 'lobby') {
      roles.push({ id: makeId(), name: 'Bot', color: '#f5a524', perms: 0, hoist: true, position: 3 });
      const info = cat('Bilgi');
      welcome = chan('hoş-geldin', 'announce', info, 'Xanaphian\'a hoş geldin! Buradan başla.');
      chan('duyurular', 'announce', info, 'Önemli duyurular');
      const talk = cat('Sohbet');
      chan('genel', 'text', talk, 'Her şeyden konuşulur');
      chan('medya', 'text', talk, 'Görsel, video ve dosya paylaşımı');
      chan('kod', 'text', talk, '```kod blokları``` burada güzel görünür');
      const voice = cat('Ses Kanalları');
      chan('Lobi', 'voice', voice);
      chan('Oyun', 'voice', voice);
      const space = cat('3D Odalar');
      chan('Meydan', 'space', space, 'Avatarınla dolaş, yakındakilerle sesli konuş');
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
      inviteCode: this.newInviteCode(),
      pv: 2,
      joinMessages: true,
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
      '# Xanaphian\'a hoş geldin! 👋\nBurası senin topluluğun. Topluluklar oluştur, kanallar aç, arkadaşlarını davet et ve gerçek zamanlı sohbet et.',
      '## Hızlı başlangıç\n- **Arkadaş davet et:** sol üstteki topluluk adına tıkla → *Davet et*. Kodu gönder, karşı taraf *Davetle katıl* ile girer.\n- **Kanal aç:** kategori başlığındaki **+** düğmesi.\n- **Hızlı geçiş:** `Ctrl+K` ile kanallar ve topluluklar arasında atla.\n- **Yanıtla / düzenle / tepki:** mesajın üzerine gel, sağda araç çubuğu çıkar. Kendi son mesajını düzenlemek için boş kutuda `↑` tuşu.',
      '## Biçimlendirme\n**kalın**, *italik*, __altı çizili__, ~~üstü çizili~~, `satır içi kod`, ||spoiler|| ve\n```js\nconst xanaphian = "hızlı ve hafif";\n```\n> Alıntı da yapabilirsin.',
      '## Güncellemeler\nYeni sürüm çıktığında üst çubukta **Güncelle** düğmesi belirir. Tek tıkla indirip yeniden başlatır, tekrar kurulum dosyası indirmen gerekmez. Ayarlar → *Güncellemeler* bölümünden elle de denetleyebilirsin.',
    ];
    const base = Date.now();
    const log = this.log(ch);
    texts.forEach((content, i) => log.add({ id: makeId(base + i), channelId: ch, authorId: BOT_ID, content, ts: base + i }));
  }

  // ---------- botların kullandığı arayüz (bots.ts) ----------
  private botHost(): BotHost {
    const hub = this;
    const msgs = (ch: ID) => this.log(ch);
    // gizli kanallar sızmasın: yalnızca kanalı görebilen üyelere gönder
    const toChan = (c: StoredCommunity, ch: ID, f: ServerFrame) => {
      const channel = c.channels.find((x) => x.id === ch);
      if (channel) this.broadcastChan(c, channel, f);
    };
    return {
      get dir() {
        return hub.dir;
      },
      get crypt() {
        return hub.crypt;
      },
      comm: (cid) => this.comms.get(cid),
      commOfChan: (ch) => {
        const cid = this.chanToComm.get(ch);
        return cid ? this.comms.get(cid) : undefined;
      },
      user: (uid) => this.data.users[uid],
      setUser: (uid, pub, secretHash) => {
        this.data.users[uid] = { pub, secretHash };
        this.saveHub();
        const data = JSON.stringify({ t: 'user', u: pub } satisfies ServerFrame);
        const sent = new Set<Session>();
        for (const c of this.userComms(uid)) for (const x of this.memberSessions(c)) if (!sent.has(x)) (sent.add(x), this.sendRaw(x, data));
      },
      deleteUser: (uid) => {
        delete this.data.users[uid];
        for (const x of this.userSessions.get(uid) || []) x.ws.close(4001, 'auth');
        this.saveHub();
      },
      history: (ch) => msgs(ch).list,
      post: (c, ch, authorId, content, replyTo) => {
        const m: Message = { id: makeId(), channelId: ch, authorId, content: clampStr(content, MAX_CONTENT), ts: Date.now() };
        if (replyTo && msgs(ch).byId.has(replyTo)) m.replyTo = replyTo;
        msgs(ch).add(m);
        toChan(c, ch, { t: 'msg', m });
        const channel = c.channels.find((x) => x.id === ch);
        if (channel) this.bots.onMessage(c, channel, m);
        return m;
      },
      edit: (c, ch, id, content) => {
        const m = msgs(ch).byId.get(id);
        if (!m || !content || !this.bots.isBot(m.authorId)) return false;
        m.content = content;
        m.editedTs = Date.now();
        msgs(ch).update(m);
        toChan(c, ch, { t: 'msg.upd', m });
        return true;
      },
      react: (c, ch, id, uid, e) => {
        const m = msgs(ch).byId.get(id);
        if (!m || !e) return false;
        m.reactions ||= {};
        const arr = m.reactions[e] || [];
        if (arr.includes(uid)) return true;
        if (!m.reactions[e] && Object.keys(m.reactions).length >= 20) return false;
        m.reactions[e] = [...arr, uid];
        msgs(ch).update(m);
        toChan(c, ch, { t: 'msg.upd', m });
        return true;
      },
      typing: (c, ch, uid) => toChan(c, ch, { t: 'typing', ch, uid }),
      status: (uid) => this.effectiveStatus(uid),
      announcePresence: (uid) => this.broadcastPresence(uid),
      pushComm: (c) => this.pushComm(c),
      isManager: (c, uid) => can(c, uid, Perm.MANAGE_COMMUNITY),
      can: (c, uid, perm) => can(c, uid, perm),
      sendToManagers: (c, f) => {
        const data = JSON.stringify(f);
        for (const s of this.memberSessions(c)) if (s.userId && can(c, s.userId, Perm.MANAGE_COMMUNITY)) this.sendRaw(s, data);
      },
      voice: (ch) => [...(this.voiceRooms.get(ch)?.values() || [])],
    };
  }

  // ---------- merkezi sunucuya taşıma ----------
  /** Yerel kovan: topluluğun taşınma paketi ve mesajlarını (NDJSON satırları) hazırlar */
  exportCommunity(cid: ID, ownerId: ID): { head: CommunityExport; lines: () => Generator<string>; filePath: (id: string) => string } | null {
    const c = this.comms.get(cid);
    if (!c || c.ownerId !== ownerId) return null;
    const users: UserPublic[] = [];
    for (const m of c.members) {
      const u = this.data.users[m.userId];
      if (u && !u.pub.bot && m.userId !== BOT_ID) users.push(u.pub);
    }
    const files = new Map<string, { id: string; mime: string; size: number }>();
    for (const ch of c.channels) {
      if (isVoiceLike(ch.type)) continue;
      for (const m of this.log(ch.id).list)
        for (const a of m.attachments || []) {
          const id = a.url.split('/')[2] || '';
          if (/^[a-z0-9]+$/.test(id) && !files.has(id)) files.set(id, { id, mime: a.mime || 'application/octet-stream', size: a.size || 0 });
        }
    }
    const self = this;
    return {
      head: { comm: c, users, files: [...files.values()] },
      *lines() {
        for (const ch of c.channels) {
          if (isVoiceLike(ch.type)) continue;
          for (const m of self.log(ch.id).list) yield JSON.stringify({ ch: ch.id, m });
        }
      },
      filePath: (id: string) => path.join(this.dir, 'files', id),
    };
  }

  /** Yerel kovan: topluluk sunucuya taşındı; üyelere haber ver ve listeden kaldır (dosyalar yedek olarak kalır) */
  markMoved(cid: ID, host: string) {
    const c = this.comms.get(cid);
    if (!c) return;
    for (const s of this.memberSessions(c)) {
      if (s.voice && c.channels.some((ch) => ch.id === s.voice!.ch)) this.leaveVoice(s);
      this.send(s, { t: 'comm.moved', cid, host });
    }
    this.comms.delete(cid);
    for (const ch of c.channels) this.chanToComm.delete(ch.id);
    this.data.communities = this.data.communities.filter((x) => x !== cid);
    (this.data.moved ||= {})[cid] = host;
    this.saveHub();
  }

  /** Sunucu: kimliği doğrular */
  checkUser(uid: string, secret: string): boolean {
    const u = this.data.users[uid];
    return !!u && !!u.secretHash && u.secretHash === sha(secret);
  }

  /** Sunucu: taşınan topluluğu içeri alır. Hata metni ya da null döner. */
  importCommunity(uid: ID, head: CommunityExport, lines: string[]): string | null {
    if (!this.serverMode) return 'Bu kovan taşıma kabul etmiyor.';
    const c = head?.comm;
    if (!c || typeof c.id !== 'string' || !/^[a-z0-9]{6,40}$/i.test(c.id)) return 'Paket bozuk.';
    if (c.ownerId !== uid) return 'Yalnızca topluluğun sahibi taşıyabilir.';
    if (this.comms.has(c.id)) return 'Bu topluluk zaten sunucuda.';
    if (!Array.isArray(c.channels) || !Array.isArray(c.members) || !Array.isArray(c.roles)) return 'Paket bozuk.';
    if (c.channels.some((ch) => this.chanToComm.has(ch.id))) return 'Kanal kimlikleri çakışıyor.';
    const owned = [...this.comms.values()].filter((x) => x.ownerId === uid).length;
    if (owned >= this.maxOwned) return `En fazla ${this.maxOwned} topluluk kurabilirsin.`;
    // kullanıcılar: sunucuda olmayanlar sahipsiz eklenir; ilk bağlandıklarında kendi gizli anahtarlarıyla sahiplenirler
    const known = new Set<ID>();
    for (const u of Array.isArray(head.users) ? head.users : []) {
      if (!u || typeof u.id !== 'string' || u.id === BOT_ID || u.bot) continue;
      known.add(u.id);
      if (!this.data.users[u.id]) this.data.users[u.id] = { pub: this.sanitizeUser(u, u.id), secretHash: '' };
    }
    c.members = c.members.filter((m) => m && (m.userId === BOT_ID || known.has(m.userId) || this.data.users[m.userId]));
    if (!c.members.some((m) => m.userId === uid)) c.members.push({ userId: uid, roles: [], joinedAt: Date.now() });
    if (!c.inviteCode || [...this.comms.values()].some((x) => x.inviteCode === c.inviteCode)) c.inviteCode = this.newInviteCode();
    // mesajlar: kanal başına tek seferde yazılır
    const chans = new Set(c.channels.map((ch) => ch.id));
    const per = new Map<ID, string[]>();
    for (const line of lines) {
      if (!line) continue;
      try {
        const { ch, m } = JSON.parse(line);
        if (!chans.has(ch) || !m || typeof m.id !== 'string' || m.channelId !== ch) continue;
        let a = per.get(ch);
        if (!a) per.set(ch, (a = []));
        a.push(JSON.stringify({ o: 'm', m }));
      } catch {
        /* bozuk satır */
      }
    }
    for (const [ch, list] of per) fs.writeFileSync(path.join(this.dir, 'messages', ch + '.ndjson'), list.join('\n') + '\n');
    for (const ch of c.channels) this.logs.delete(ch.id);
    this.comms.set(c.id, c);
    for (const ch of c.channels) this.chanToComm.set(ch.id, c.id);
    this.data.communities.push(c.id);
    this.migrate(c);
    this.saveHub();
    this.pushComm(c);
    for (const m of c.members) if (this.userSessions.has(m.userId)) this.broadcastPresence(m.userId);
    for (const ch of c.channels) if (ch.type === 'site') this.refreshSiteMeta(c.id, ch.id);
    return null;
  }

  hasCommunities() {
    return this.data.communities.length > 0;
  }
  get hubId() {
    return this.data.hubId;
  }
}
