import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, shell, session, screen, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Hub } from './hub';
import { Updater } from './updater';
import { DEFAULT_PORT, makeId } from '../shared/protocol';

const isDev = !app.isPackaged;
app.setAppUserModelId('com.xanaphian.kovan');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

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
    title: 'Kovan',
    icon: iconPath(),
    backgroundColor: theme === 'light' ? '#f4f2ee' : '#111014',
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

function overlayFor(theme: string) {
  return theme === 'light'
    ? { color: '#e9e6e0', symbolColor: '#4a4752', height: 34 }
    : { color: '#111014', symbolColor: '#b4b2bd', height: 34 };
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
  tray.setToolTip('Kovan');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Kovan\'ı aç', click: showWindow },
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

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ['media', 'notifications', 'clipboard-sanitized-write'].includes(permission));

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
  hub.ownerName = config.profile.name || 'Kovan';
  registerIpc();
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
  hub.stop();
});
app.on('window-all-closed', () => {
  /* tepside çalışmaya devam */
});

// ---------- IPC ----------
function registerIpc() {
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
  }));
  ipcMain.handle('mcp:claude-desktop', (_e, a: { name: string; url: string; token: string }) => installClaudeDesktop(a));
  ipcMain.handle('cfg:get', () => config);
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
      win?.setBackgroundColor(theme === 'light' ? '#f4f2ee' : '#111014');
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
  ipcMain.on('badge', (_e, count: number) => {
    if (process.platform === 'win32') {
      if (count > 0 && !win?.isFocused()) win?.flashFrame(true);
    } else app.setBadgeCount(count);
    tray?.setToolTip(count > 0 ? `Kovan (${count} bahsetme)` : 'Kovan');
  });
  ipcMain.on('open-external', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
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
