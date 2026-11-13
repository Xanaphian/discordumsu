// v1.26 (Root'tan esinlenen küçük özellikler): bağlantı önizlemesi, yayıncı modu (OBS algılama) ve ayrı pencereler.
// main.ts'e yalnızca initEkstralar() çağrısı ve bildirim/rozet için iki denetim satırı eklenir; geri kalan her şey burada.
import { BrowserWindow, ipcMain, nativeImage, net, shell, type WebContents } from 'electron';
import { execFile } from 'node:child_process';

interface Opts {
  preload: string;
  indexFile: string;
  devUrl?: string;
  icon: string;
  mainWin: () => BrowserWindow | null;
  /** tema → pencere zemini ve başlık çubuğu düğmeleri */
  look: () => { bg: string; overlay: { color: string; symbolColor: string; height: number } };
}

let opts: Opts;

// ---------------------------------------------------------------------------
// Bağlantı önizlemesi: sayfanın Open Graph bilgileri (başlık, açıklama, görsel)
export interface LinkMeta {
  url: string;
  site?: string;
  title?: string;
  desc?: string;
  image?: string; // küçültülmüş data URL
  imageW?: number;
  imageH?: number;
  color?: string;
  icon?: string;
  /** adres doğrudan bir görsel */
  direct?: boolean;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x !== undefined);
const clean = (s: string | undefined, max: number) => (s ? decode(s).replace(/\s+/g, ' ').trim().slice(0, max) : undefined) || undefined;

/** Deneme için: KOVAN_LINK_MIRROR verilirse sayfalar oradan alınır (?u=<adres>) */
const MIRROR = process.env.KOVAN_LINK_MIRROR || '';

/** Yerel ağ adreslerine istek atılmaz (modem arayüzü vb. sızmasın) */
function publicUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.internal')) return null;
    const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
    if (m) {
      const [a, b] = [+m[1], +m[2]];
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
    }
    if (h.includes(':')) return null; // IPv6 adresleri
    return u;
  } catch {
    return null;
  }
}

async function fetchCapped(url: string, accept: string, max: number) {
  const res = await net.fetch(MIRROR ? `${MIRROR}/?u=${encodeURIComponent(url)}` : url, {
    headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; XanaphianBot/1.0; +https://xanaphian.com)', 'accept-language': 'tr,en;q=0.8' },
    signal: AbortSignal.timeout(9000),
  } as any);
  if (!res.ok || !res.body) return null;
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (Number(res.headers.get('content-length') || 0) > max * 4) return null;
  // yalnız ilk "max" baytı oku (dev sayfaların tamamını indirme)
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  while (n < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    parts.push(value);
    n += value.length;
  }
  reader.cancel().catch(() => {});
  return { buf: Buffer.concat(parts).subarray(0, max), type, url: MIRROR ? url : res.url || url };
}

async function thumb(url: string, maxW: number): Promise<{ src: string; w: number; h: number } | null> {
  if (!publicUrl(url)) return null;
  const r = await fetchCapped(url, 'image/*', 6_000_000).catch(() => null);
  if (!r || !r.buf.length || (r.type && !r.type.startsWith('image/'))) return null;
  if (r.type === 'image/gif' && r.buf.length < 1_500_000) {
    const img = nativeImage.createFromBuffer(r.buf);
    const s = img.getSize();
    return { src: `data:image/gif;base64,${r.buf.toString('base64')}`, w: s.width || maxW, h: s.height || maxW };
  }
  let img = nativeImage.createFromBuffer(r.buf);
  if (img.isEmpty()) return null;
  const s = img.getSize();
  if (s.width > maxW) img = img.resize({ width: maxW, quality: 'good' });
  const z = img.getSize();
  return { src: `data:image/jpeg;base64,${img.toJPEG(82).toString('base64')}`, w: z.width, h: z.height };
}

const metaCache = new Map<string, { at: number; p: Promise<LinkMeta | null> }>();

async function loadMeta(raw: string): Promise<LinkMeta | null> {
  const u = publicUrl(raw);
  if (!u) return null;
  const page = await fetchCapped(u.toString(), 'text/html,application/xhtml+xml,image/*;q=0.8', 700_000).catch(() => null);
  if (!page) return null;
  if (page.type.startsWith('image/')) {
    const t = await thumb(page.url, 520);
    return t ? { url: raw, image: t.src, imageW: t.w, imageH: t.h, direct: true } : null;
  }
  if (!/html|xml/.test(page.type || 'text/html')) return null;
  const html = page.buf.toString('utf8');
  const head = html.split(/<\/head>/i)[0].slice(0, 300_000);
  const metas = head.match(/<meta\b[^>]*>/gi) || [];
  const get = (...keys: string[]) => {
    for (const k of keys)
      for (const tag of metas) {
        const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
        if (key === k) {
          const v = attr(tag, 'content');
          if (v) return v;
        }
      }
    return undefined;
  };
  const meta: LinkMeta = { url: raw };
  meta.site = clean(get('og:site_name', 'application-name', 'twitter:site'), 60) || new URL(page.url).hostname.replace(/^www\./, '');
  meta.title = clean(get('og:title', 'twitter:title') || head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 160);
  meta.desc = clean(get('og:description', 'twitter:description', 'description'), 300);
  const color = get('theme-color');
  if (color && /^#[0-9a-f]{3,8}$/i.test(color.trim())) meta.color = color.trim();
  const img = get('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
  if (img) {
    try {
      const t = await thumb(new URL(decode(img), page.url).toString(), 520);
      if (t) (meta.image = t.src), (meta.imageW = t.w), (meta.imageH = t.h);
    } catch {
      /* geçersiz adres */
    }
  }
  if (!meta.title && !meta.desc && !meta.image) return null;
  return meta;
}

export function linkMeta(url: string): Promise<LinkMeta | null> {
  const now = Date.now();
  const hit = metaCache.get(url);
  if (hit && now - hit.at < 30 * 60_000) return hit.p;
  const p = loadMeta(url).catch(() => null);
  metaCache.set(url, { at: now, p });
  if (metaCache.size > 400) metaCache.delete(metaCache.keys().next().value!);
  return p;
}

// ---------------------------------------------------------------------------
// Yayıncı modu: OBS ve benzeri yayın programları açık mı?
const STREAM_APPS = ['obs64', 'obs32', 'obs', 'streamlabs obs', 'streamlabs desktop', 'xsplit.core', 'xsplit.broadcaster', 'prismlivestudio', 'twitch studio', 'meld studio', 'vmix64', 'vmix'];
let obsTimer: ReturnType<typeof setInterval> | null = null;
let obsOn = false;
/** renderer'ın bildirdiği durum: yayıncı modu etkin ve bildirimler gizlensin mi */
let streamer = { active: false, hideNotifs: true };

function listProcs(): Promise<string[]> {
  return new Promise((resolve) => {
    if (process.platform === 'win32')
      execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 8000, maxBuffer: 4_000_000 }, (err, out) =>
        resolve(err ? [] : out.split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/)?.[1] || '').toLowerCase().replace(/\.exe$/, '')).filter(Boolean)),
      );
    else execFile('ps', ['-A', '-o', 'comm='], { timeout: 8000 }, (err, out) => resolve(err ? [] : out.split('\n').map((x) => x.trim().toLowerCase()).filter(Boolean)));
  });
}

async function checkObs() {
  const fake = process.env.KOVAN_FAKE_OBS;
  const on = fake !== undefined ? fake === '1' : (await listProcs()).some((p) => STREAM_APPS.includes(p));
  if (on === obsOn) return;
  obsOn = on;
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('yayinci:obs', on);
}

function watchObs(on: boolean) {
  if (on && !obsTimer) {
    checkObs();
    obsTimer = setInterval(checkObs, 7000);
  } else if (!on && obsTimer) {
    clearInterval(obsTimer);
    obsTimer = null;
    if (obsOn) {
      obsOn = false;
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('yayinci:obs', false);
    }
  }
}

// ---------------------------------------------------------------------------
// Ayrı pencereler: bir kanal ya da özel mesaj kendi penceresinde
const popouts = new Map<string, BrowserWindow>();
const popoutContents = new Set<number>();

function openPopout(cid: string, ch: string, title: string) {
  const key = `${cid}/${ch}`;
  const old = popouts.get(key);
  if (old && !old.isDestroyed()) {
    if (old.isMinimized()) old.restore();
    old.show();
    old.focus();
    return;
  }
  const main = opts.mainWin();
  const look = opts.look();
  const b = main?.getBounds();
  const w = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 380,
    minHeight: 420,
    ...(b ? { x: b.x + b.width - 560 - popouts.size * 30, y: b.y + 60 + popouts.size * 30 } : {}),
    title: title.slice(0, 80) || 'Xanaphian',
    icon: opts.icon,
    backgroundColor: look.bg,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...look.overlay, height: 38 },
    show: false,
    webPreferences: { preload: opts.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: true },
  });
  popouts.set(key, w);
  const id = w.webContents.id;
  popoutContents.add(id);
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    popouts.delete(key);
    popoutContents.delete(id);
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost:5173')) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  const query = { popout: '1', cid, ch };
  if (opts.devUrl) w.loadURL(`${opts.devUrl}?${new URLSearchParams(query)}`);
  else w.loadFile(opts.indexFile, { query });
}

/** Bildirim / rozet bu pencereden mi gelmeli? Ayrı pencereler ve yayıncı modu bildirim göstermez. */
export function blockNotify(sender: WebContents): boolean {
  return popoutContents.has(sender.id) || (streamer.active && streamer.hideNotifs);
}
export const isPopout = (sender: WebContents) => popoutContents.has(sender.id);

export function initEkstralar(o: Opts) {
  opts = o;
  ipcMain.handle('link:meta', (_e, url: string) => (typeof url === 'string' && url.length < 2000 ? linkMeta(url) : null));
  ipcMain.handle('yayinci:izle', (_e, on: boolean) => (watchObs(!!on), obsOn));
  ipcMain.on('yayinci:durum', (_e, s: { active: boolean; hideNotifs: boolean }) => {
    streamer = { active: !!s?.active, hideNotifs: s?.hideNotifs !== false };
  });
  ipcMain.on('pencere:ayir', (_e, a: { cid: string; ch: string; title: string }) => {
    if (typeof a?.cid === 'string' && typeof a?.ch === 'string') openPopout(a.cid, a.ch, String(a.title || ''));
  });
  ipcMain.on('pencere:ana', (e, a: { cid: string; ch: string }) => {
    const main = opts.mainWin();
    if (!main) return;
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
    main.webContents.send('pencere:git', a);
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.on('pencere:tema', (e, theme: string) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w || !popoutContents.has(e.sender.id)) return;
    void theme;
    const look = opts.look();
    try {
      w.setTitleBarOverlay({ ...look.overlay, height: 38 });
      w.setBackgroundColor(look.bg);
    } catch {
      /* desteklenmiyor */
    }
  });
}
