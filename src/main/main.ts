import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, shell, session, screen, desktopCapturer, powerSaveBlocker, safeStorage, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Hub } from './hub';
import { initActivity, configureActivity, getActivity, runningApps, stopActivity, type ActivityConfig } from './activity';
import { Updater } from './updater';
import { DEFAULT_PORT, makeId } from '../shared/protocol';

const isDev = !app.isPackaged;
app.setAppUserModelId('com.xanaphian.kovan');

// WebRTC: donanım hızlandırmalı kodlama/çözme ve ekran yakalama iyileştirmeleri
app.commandLine.appendSwitch('enable-features', 'AllowWgcScreenCapturer,AllowWgcWindowCapturer,WebRtcUseMinMaxVEADimensions');
app.commandLine.appendSwitch('force_high_performance_gpu');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let pendingCapture: { id: string; audio: boolean } | null = null;
let powerBlock: number | null = null;

// ---------- genel bas-konuş (oyun içindeyken bile çalışır) ----------
let hook: any = null;
let pttTarget: { kind: 'key'; code: number } | { kind: 'mouse'; button: number } | null = null;
let pttDown = false;
let hookRunning = false;
function codeToUio(code: string): { kind: 'key'; code: number } | { kind: 'mouse'; button: number } | null {
  const m = /^Mouse(\d)$/.exec(code);
  if (m) return { kind: 'mouse', button: +m[1] };
  const K = hook?.UiohookKey as Record<string, number> | undefined;
  if (!K) return null;
  const map: Record<string, string> = {
    ControlLeft: 'Ctrl', ControlRight: 'CtrlRight', ShiftLeft: 'Shift', ShiftRight: 'ShiftRight', AltLeft: 'Alt', AltRight: 'AltRight',
    MetaLeft: 'Meta', MetaRight: 'MetaRight', IntlBackslash: 'Backslash',
  };
  const name = map[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');
  return K[name] !== undefined ? { kind: 'key', code: K[name] } : null;
}
function setPtt(on: boolean) {
  if (pttDown === on) return;
  pttDown = on;
  win?.webContents.send('ptt', on);
}
function configurePtt(cfg: { enabled: boolean; code: string }): boolean {
  try {
    if (!cfg.enabled) {
      pttTarget = null;
      setPtt(false);
      // kanca boşta CPU harcamasın: görüşme/bas-konuş yokken durdur
      if (hookRunning) {
        hook.uIOhook.stop();
        hookRunning = false;
      }
      return true;
    }
    if (!hook) {
      hook = require('uiohook-napi');
      const u = hook.uIOhook;
      u.on('keydown', (e: any) => pttTarget?.kind === 'key' && e.keycode === pttTarget.code && setPtt(true));
      u.on('keyup', (e: any) => pttTarget?.kind === 'key' && e.keycode === pttTarget.code && setPtt(false));
      u.on('mousedown', (e: any) => pttTarget?.kind === 'mouse' && e.button === pttTarget.button && setPtt(true));
      u.on('mouseup', (e: any) => pttTarget?.kind === 'mouse' && e.button === pttTarget.button && setPtt(false));
    }
    if (!hookRunning) {
      hook.uIOhook.start();
      hookRunning = true;
    }
    pttTarget = codeToUio(cfg.code);
    return !!pttTarget;
  } catch (e) {
    console.error('Genel bas-konuş başlatılamadı', e);
    hook = null;
    return false;
  }
}
app.on('will-quit', () => {
  try {
    hook?.uIOhook.stop();
  } catch {
    /* zaten durmuş */
  }
});

// ---------- yapılandırma ----------
interface Config {
  profile: { id: string; secret: string; name: string; color: string; avatar?: string; bio?: string; status: string };
  hosts: { url: string; label?: string }[];
  settings: Record<string, unknown>;
  onboarded: boolean;
  bounds?: { x?: number; y?: number; width: number; height: number; maximized?: boolean };
}

const cfgFile = path.join(app.getPath('userData'), 'kovan-config.json');
const COLORS = ['#f5a524', '#3ecf8e', '#6cb6ff', '#f2555a', '#c084fc', '#22d3ee', '#fb7185', '#a3e635'];

function loadConfig(): Config {
  try {
    const c = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) as Config;
    if (c.profile?.id && c.profile.secret) return Object.assign({ hosts: [], settings: {}, onboarded: false }, c);
  } catch {
    /* ilk açılış */
  }
  return {
    profile: {
      id: makeId(),
      secret: crypto.randomBytes(32).toString('hex'),
      name: '',
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      status: 'online',
    },
    hosts: [],
    settings: {},
    onboarded: false,
  };
}

let config = loadConfig();
let saveTimer: NodeJS.Timeout | null = null;
function saveConfig(now = false) {
  if (saveTimer) clearTimeout(saveTimer);
  const write = () => {
    const tmp = cfgFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(config, null, 1));
    fs.renameSync(tmp, cfgFile);
  };
  if (now) write();
  else saveTimer = setTimeout(write, 300);
}

// ---------- pencere ----------
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
const hub = new Hub(app.getPath('userData'));
let updater: Updater | null = null;
let pendingInvite: string | null = null;

function iconPath() {
  return path.join(__dirname, 'icon.png');
}

function restoreBounds() {
  const b = config.bounds;
  const base = { width: 1280, height: 800 };
  if (!b) return base;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x !== undefined && b.y !== undefined && b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + 40 > a.y;
  });
  return visible ? { x: b.x, y: b.y, width: b.width, height: b.height } : { width: b.width, height: b.height };
}

function createWindow() {
  const theme = (config.settings.theme as string) || 'dark';
  win = new BrowserWindow({
    ...restoreBounds(),
    minWidth: 940,
    minHeight: 560,
    show: false,
    title: 'Xanaphian',
    icon: iconPath(),
    backgroundColor: themeBg(theme),
    titleBarStyle: 'hidden',
    titleBarOverlay: overlayFor(theme),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      v8CacheOptions: 'bypassHeatCheck',
      backgroundThrottling: true,
      webviewTag: true, // site odaları
    },
  });
  if (config.bounds?.maximized) win.maximize();
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win?.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost:5173')) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  const persist = () => {
    if (!win || win.isMinimized()) return;
    const maximized = win.isMaximized();
    const nb = win.getNormalBounds();
    config.bounds = { ...nb, maximized };
    saveConfig();
  };
  win.on('resize', persist);
  win.on('move', persist);
  // çökme koruması: görüntü işlemi çökerse sayfayı yeniden yükle (döngüye girmesin)
  let crashes: number[] = [];
  win.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return;
    const now = Date.now();
    crashes = crashes.filter((t) => now - t < 60_000);
    crashes.push(now);
    console.error('Arayüz çöktü:', d.reason);
    if (crashes.length <= 3) setTimeout(() => win?.webContents.reload(), 500);
  });
  win.webContents.on('unresponsive', () => console.warn('Arayüz yanıt vermiyor'));
  win.on('close', (e) => {
    if (!quitting && config.settings.closeToTray !== false) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on('focus', () => win?.flashFrame(false));
  if (isDev && process.env.KOVAN_DEV_URL) win.loadURL(process.env.KOVAN_DEV_URL);
  else win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

// tema -> pencere zemini (başlık çubuğu ve pencere düğmeleri aynı renkte görünsün)
// xanaphian.com temaları: pencere zemini ve üst çubuk (pencere düğmeleri) renkleri
const THEME_BG: Record<string, string> = { destan: '#0a1226', kagit: '#f4efe4', tozpembe: '#faf0f1', siyah: '#000000', bej: '#f2ebdb', bordo: '#1a0508', koyuyesil: '#04120c' };
const THEME_BAR: Record<string, string> = { destan: '#16223d', kagit: '#f6f1e6', tozpembe: '#fbf1f3', siyah: '#0d0d0f', bej: '#f5efe1', bordo: '#2f0f14', koyuyesil: '#0b2218' };
const THEME_SYM: Record<string, string> = { destan: '#dac59b', kagit: '#4a3f2c', tozpembe: '#5f1f36', siyah: '#c9ccd6', bej: '#2e2415', bordo: '#e2c08f', koyuyesil: '#d6c48e' };
const themeBg = (theme: string) => THEME_BG[theme] || THEME_BG.destan;

function overlayFor(theme: string) {
  const t = theme in THEME_BAR ? theme : 'destan';
  return { color: THEME_BAR[t], symbolColor: THEME_SYM[t], height: 46 };
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Xanaphian');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Xanaphian\'ı aç', click: showWindow },
      { type: 'separator' },
      { label: 'Güncellemeleri denetle', click: () => updater?.check(true) },
      { label: 'Çıkış', click: () => ((quitting = true), app.quit()) },
    ]),
  );
  tray.on('click', showWindow);
}

function handleArgv(argv: string[]) {
  const link = argv.find((a) => a.startsWith('kovan://'));
  if (!link) return;
  const m = link.match(/^kovan:\/\/invite\/(.+?)\/?$/i);
  if (!m) return;
  const code = decodeURIComponent(m[1]);
  if (win && !win.webContents.isLoading()) win.webContents.send('invite', code);
  else pendingInvite = code;
}

app.on('second-instance', (_e, argv) => {
  showWindow();
  handleArgv(argv);
});

if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient('kovan', process.execPath, [path.resolve(process.argv[1])]);
} else app.setAsDefaultProtocolClient('kovan');

Menu.setApplicationMenu(null);

// ---------- site odaları (<webview>) ----------
const SITE_PARTITION = 'persist:kovan-site';
const baseHost = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};
/** hedef, şu an açık sitenin (ya da alt alan adının) içinde mi */
const inSite = (target: string, current: string) => {
  const a = baseHost(target), b = baseHost(current);
  if (!a || !/^https?:/i.test(target)) return false;
  if (!b) return true;
  const root = (h: string) => h.split('.').slice(-2).join('.');
  return a === b || root(a) === root(b);
};
const openOutside = (url: string) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
};

// ---------- site odası başlığı ve simgesi ----------
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', middot: '·', bull: '•',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', vert: '|', verbar: '|',
};
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m,
  );
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x !== undefined);

async function fetchLimited(url: string, accept: string, max: number): Promise<{ buf: Buffer; type: string; url: string } | null> {
  const res = await net.fetch(url, { headers: { accept }, signal: AbortSignal.timeout(12_000) } as any);
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len > max) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) return null;
  return { buf, type: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), url: res.url || url };
}

/** Sitenin <title>'ını ve simgesini (favicon) getirir; simge 64 px PNG data URL'e küçültülür */
async function fetchSiteMeta(pageUrl: string): Promise<{ title?: string; icon?: string } | null> {
  const page = await fetchLimited(pageUrl, 'text/html,application/xhtml+xml', 2_000_000).catch(() => null);
  let title = '';
  const cands: { href: string; score: number }[] = [];
  const base = page?.url || pageUrl;
  if (page && /html/.test(page.type || 'text/html')) {
    const html = page.buf.toString('utf8').slice(0, 400_000);
    const head = html.split(/<\/head>/i)[0];
    title = decodeEntities(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    if (!title) title = decodeEntities(attr(head.match(/<meta[^>]+property=["']og:site_name["'][^>]*>/i)?.[0] || '', 'content') || '').trim();
    for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
      const rel = (attr(tag, 'rel') || '').toLowerCase();
      if (!/\bicon\b/.test(rel) || /mask-icon/.test(rel)) continue;
      const href = attr(tag, 'href');
      if (!href) continue;
      const size = Number((attr(tag, 'sizes') || '').match(/(\d+)/)?.[1] || 0);
      const type = (attr(tag, 'type') || '').toLowerCase();
      let score = size ? Math.abs(size - 64) : 40;
      if (/png|svg/.test(type) || /\.(png|svg)(\?|$)/i.test(href)) score -= 8;
      if (/apple-touch/.test(rel)) score += 20;
      cands.push({ href, score });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  cands.push({ href: '/favicon.ico', score: 999 });
  let icon: string | undefined;
  for (const cnd of cands.slice(0, 5)) {
    let abs: string;
    try {
      abs = new URL(cnd.href, base).toString();
    } catch {
      continue;
    }
    if (abs.startsWith('data:image/')) {
      if (abs.length <= 60_000) icon = abs;
      if (icon) break;
      continue;
    }
    if (!/^https?:/i.test(abs)) continue;
    const r = await fetchLimited(abs, 'image/*', 1_000_000).catch(() => null);
    if (!r || !r.buf.length) continue;
    const img = nativeImage.createFromBuffer(r.buf);
    if (!img.isEmpty()) {
      const sz = img.getSize();
      icon = (sz.width > 64 ? img.resize({ width: 64, quality: 'best' }) : img).toDataURL();
    } else if ((r.type.startsWith('image/') || /\.ico(\?|$)/i.test(abs)) && r.buf.length <= 60_000) {
      const mime = r.type.startsWith('image/') ? r.type : 'image/x-icon';
      icon = `data:${mime};base64,${r.buf.toString('base64')}`;
    }
    if (icon) break;
  }
  if (!title && !icon) return null;
  return { title: title || undefined, icon };
}

app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() === 'window') {
    // yalnızca güvenli, önyüklemesiz site görünümleri eklenebilir
    wc.on('will-attach-webview', (ev, prefs, params) => {
      if (!/^https?:\/\//i.test(params.src || '') || params.partition !== SITE_PARTITION) {
        ev.preventDefault();
        return;
      }
      delete (prefs as any).preload;
      prefs.nodeIntegration = false;
      prefs.nodeIntegrationInSubFrames = false;
      prefs.contextIsolation = true;
      prefs.sandbox = true;
      prefs.webSecurity = true;
      prefs.allowRunningInsecureContent = false;
    });
    return;
  }
  if (wc.getType() !== 'webview') return;
  // site dışına çıkan bağlantılar varsayılan tarayıcıda açılır
  wc.on('will-navigate', (ev, url) => {
    if (!inSite(url, wc.getURL())) {
      ev.preventDefault();
      openOutside(url);
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (inSite(url, wc.getURL())) wc.loadURL(url);
    else openOutside(url);
    return { action: 'deny' };
  });
});

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const sel = pendingCapture;
    pendingCapture = null;
    if (!sel) return cb({});
    try {
      const srcs = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
      const src = srcs.find((s) => s.id === sel.id);
      if (!src) return cb({});
      cb(sel.audio && process.platform === 'win32' ? { video: src, audio: 'loopback' } : { video: src });
    } catch {
      cb({});
    }
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ['media', 'notifications', 'clipboard-sanitized-write'].includes(permission));
  // site odası oturumu: kamera, mikrofon, konum vb. hiçbir izin verilmez
  const siteSession = session.fromPartition(SITE_PARTITION);
  siteSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['fullscreen', 'clipboard-sanitized-write'].includes(permission)));
  siteSession.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write');

  if (safeStorage.isEncryptionAvailable())
    hub.crypt = {
      enc: (s: string) => safeStorage.encryptString(s).toString('base64'),
      dec: (s: string) => safeStorage.decryptString(Buffer.from(s, 'base64')),
    };
  try {
    await hub.start((config.settings.hubPort as number) || DEFAULT_PORT);
  } catch (e) {
    console.error('Hub başlatılamadı', e);
  }
  hub.ownerName = config.profile.name || 'Xanaphian';
  hub.siteMeta = fetchSiteMeta;
  setTimeout(() => hub.refreshAllSiteMeta(), 4000);
  setInterval(() => hub.refreshAllSiteMeta(), 6 * 3600_000);
  registerIpc();
  initActivity((st) => win?.webContents.send('act:update', st));
  createWindow();
  createTray();
  updater = new Updater(() => win, isDev);
  updater.start();
  handleArgv(process.argv);
});

app.on('before-quit', () => {
  quitting = true;
});
app.on('will-quit', () => {
  if (saveTimer) saveConfig(true);
  stopActivity();
  hub.stop();
});
app.on('window-all-closed', () => {
  /* tepside çalışmaya devam */
});

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('hub:migrate', async (_e, cid: string, server: string) => {
    try {
      if (!/^https?:\/\//i.test(server)) throw new Error('Sunucu adresi geçersiz.');
      const ex = hub.exportCommunity(cid, config.profile.id);
      if (!ex) throw new Error('Bu topluluğu yalnızca sahibi taşıyabilir.');
      const base = server.replace(/\/+$/, '');
      const auth = { 'x-kovan-user': config.profile.id, 'x-kovan-secret': config.profile.secret };
      const body = [JSON.stringify(ex.head), ...ex.lines()].join('\n');
      const r = await fetch(base + '/import', { method: 'POST', headers: { ...auth, 'content-type': 'application/x-ndjson' }, body });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error || (r.status === 401 ? 'Sunucu seni tanımadı; önce sunucuya bağlan.' : r.status === 413 ? 'Topluluk çok büyük.' : `Sunucu hatası (${r.status}).`));
      let failed = 0;
      for (const f of ex.head.files) {
        try {
          const buf = await fs.promises.readFile(ex.filePath(f.id));
          const fr = await fetch(`${base}/import/file?cid=${encodeURIComponent(cid)}&id=${encodeURIComponent(f.id)}`, { method: 'POST', headers: { ...auth, 'content-type': f.mime }, body: buf });
          if (!fr.ok) failed++;
        } catch {
          failed++;
        }
      }
      hub.markMoved(cid, base);
      return { ok: true, files: ex.head.files.length, failed };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    hubPort: hub.port,
    hubId: hub.hubId,
    lan: Hub.lanAddresses(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    dev: isDev,
    exePath: process.execPath,
    mcpBridge: mcpBridgePath(),
    server: process.env.KOVAN_SERVER || undefined,
  }));
  ipcMain.handle('mcp:claude-desktop', (_e, a: { name: string; url: string; token: string }) => installClaudeDesktop(a));
  ipcMain.handle('cfg:get', () => config);
  ipcMain.handle('act:config', (_e, c: ActivityConfig) => (configureActivity(c), getActivity()));
  ipcMain.handle('act:apps', () => runningApps());
  ipcMain.handle('cfg:set', (_e, patch: Partial<Config>) => {
    config = {
      ...config,
      ...patch,
      profile: { ...config.profile, ...(patch.profile || {}), id: config.profile.id, secret: config.profile.secret },
      settings: { ...config.settings, ...(patch.settings || {}) },
    };
    if (patch.profile?.name) hub.ownerName = config.profile.name;
    saveConfig();
    if (patch.settings?.openAtLogin !== undefined && !isDev) {
      app.setLoginItemSettings({ openAtLogin: !!patch.settings.openAtLogin, args: ['--hidden'] });
    }
    return config;
  });
  ipcMain.handle('app:pending-invite', () => {
    const p = pendingInvite;
    pendingInvite = null;
    return p;
  });
  ipcMain.on('win:overlay', (_e, theme: string) => {
    try {
      win?.setTitleBarOverlay(overlayFor(theme));
      win?.setBackgroundColor(themeBg(theme));
    } catch {
      /* desteklenmiyor */
    }
  });
  ipcMain.on('notify', (_e, n: { title: string; body: string; tag: string; silent?: boolean; icon?: string }) => {
    if (!Notification.isSupported()) return;
    if (win?.isFocused()) return;
    const notif = new Notification({ title: n.title.slice(0, 100), body: n.body.slice(0, 300), silent: !!n.silent, icon: iconPath() });
    notif.on('click', () => {
      showWindow();
      win?.webContents.send('notify:click', n.tag);
    });
    notif.show();
    win?.flashFrame(true);
  });
  // ---- ekran paylaşımı ----
  ipcMain.handle('cap:sources', async () => {
    const srcs = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true });
    const displays = screen.getAllDisplays();
    return srcs
      .filter((s) => (s.name !== 'Kovan' && s.name !== 'Xanaphian') || s.id.startsWith('screen'))
      .map((s) => {
        const d = displays.find((x) => String(x.id) === s.display_id);
        return {
          id: s.id,
          name: s.name,
          kind: s.id.startsWith('screen') ? 'screen' : 'window',
          thumb: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL(),
          icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '',
          size: d ? { w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor) } : null,
        };
      });
  });
  ipcMain.handle('cap:select', (_e, sel: { id: string; audio: boolean } | null) => {
    pendingCapture = sel;
  });
  ipcMain.handle('ptt:config', (_e, cfg: { enabled: boolean; code: string }) => configurePtt(cfg));
  ipcMain.on('win:in-call', (_e, on: boolean) => {
    // görüşmedeyken pencere arka planda/küçültülmüşken bile ses ve görüntü takılmasın
    win?.webContents.setBackgroundThrottling(!on);
    if (on) powerBlock ??= powerSaveBlocker.start('prevent-app-suspension');
    else if (powerBlock !== null) {
      powerSaveBlocker.stop(powerBlock);
      powerBlock = null;
    }
  });

  ipcMain.on('badge', (_e, count: number) => {
    if (process.platform === 'win32') {
      if (count > 0 && !win?.isFocused()) win?.flashFrame(true);
    } else app.setBadgeCount(count);
    tray?.setToolTip(count > 0 ? `Xanaphian (${count} bahsetme)` : 'Xanaphian');
  });
  ipcMain.on('open-external', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    // Spotify'da şarkıyı aç (yalnız arama adresi)
    else if (/^spotify:search:[^\s]{1,300}$/i.test(url)) shell.openExternal(url).catch(() => shell.openExternal('https://open.spotify.com/search/' + url.slice(15)));
  });
  ipcMain.on('app:quit', () => {
    quitting = true;
    app.quit();
  });
  ipcMain.handle('upd:check', () => updater?.check(true));
  ipcMain.handle('upd:download', () => updater?.download());
  ipcMain.handle('upd:install', () => {
    quitting = true;
    updater?.install();
  });
  ipcMain.handle('upd:state', () => updater?.state);
}

// ---------- MCP: Claude Desktop yapılandırması ----------
function mcpBridgePath() {
  const p = path.join(__dirname, 'mcp-bridge.js');
  // paketlenmiş uygulamada köprü asar dışına çıkarılır (Kovan.exe node kipinde okuyabilsin)
  return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function claudeDesktopConfigs(): string[] {
  const out: string[] = [];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming');
    out.push(path.join(appData, 'Claude', 'claude_desktop_config.json'));
    // Microsoft Store sürümü sanallaştırılmış AppData kullanır
    const pk = path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), 'Packages');
    try {
      for (const d of fs.readdirSync(pk)) if (/^Claude_/i.test(d)) out.push(path.join(pk, d, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    } catch {
      /* yok */
    }
  } else if (process.platform === 'darwin') out.push(path.join(app.getPath('home'), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  else out.push(path.join(app.getPath('home'), '.config', 'Claude', 'claude_desktop_config.json'));
  return out;
}

function installClaudeDesktop(a: { name: string; url: string; token: string }): { ok: boolean; files: string[]; error?: string } {
  const name = String(a.name || 'kovan').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'kovan';
  if (!/^kvb\./.test(a.token) || !/^http:\/\/[^\s]+\/mcp$/.test(a.url)) return { ok: false, files: [], error: 'Geçersiz bilgi' };
  const entry = { command: process.execPath, args: [mcpBridgePath(), '--url', a.url], env: { ELECTRON_RUN_AS_NODE: '1', KOVAN_TOKEN: a.token } };
  const files: string[] = [];
  const targets = claudeDesktopConfigs();
  // en az birinin klasörü varsa yalnızca var olanlara yaz; hiçbiri yoksa standart yolu oluştur
  const existing = targets.filter((f) => fs.existsSync(path.dirname(f)));
  try {
    for (const f of existing.length ? existing : targets.slice(0, 1)) {
      let cfg: any = {};
      if (fs.existsSync(f)) {
        const raw = fs.readFileSync(f, 'utf8');
        try {
          cfg = raw.trim() ? JSON.parse(raw) : {};
        } catch {
          return { ok: false, files, error: f + ' okunamadı (geçersiz JSON). Dosyayı düzeltip tekrar dene.' };
        }
        fs.writeFileSync(f + '.kovan-yedek', raw);
      } else fs.mkdirSync(path.dirname(f), { recursive: true });
      cfg.mcpServers = { ...(cfg.mcpServers || {}), [name]: entry };
      fs.writeFileSync(f, JSON.stringify(cfg, null, 2));
      files.push(f);
    }
    return { ok: true, files };
  } catch (e) {
    return { ok: false, files, error: (e as Error).message };
  }
}
