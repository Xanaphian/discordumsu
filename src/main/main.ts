import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, shell, session, screen, desktopCapturer, powerSaveBlocker, safeStorage, net, powerMonitor } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Hub } from './hub';
import { hasGame, launchGame } from './oyunAc';
import { initActivity, configureActivity, getActivity, runningApps, stopActivity, type ActivityConfig } from './activity';
import { spotifyConnect, spotifyDisconnect, spotifyStatus, spotifyPlay } from './spotify';
import { Updater } from './updater';
import { acilisAc, acilisAcik, acilisDurum, acilisKapat } from './acilis';
import { lolState, lolInvite, lolAccept, steamJoin } from './gamejoin';
import { initEkstralar, blockNotify, isPopout } from './ekstralar';
import { initOverlay, destroyOverlay } from './overlay';
import { initTemplateFetch } from './sablon';
import { DEFAULT_PORT, makeId } from '../shared/protocol';
import { OFFICIAL_SERVER, isLoopbackHost, normHost } from '../shared/guvenlik';

const isDev = !app.isPackaged;
app.setAppUserModelId('com.xanaphian.kovan');
// v1.71.3: görünen ad Naphian oldu (package.json productName). Electron veri klasörünü bu addan türetir; herkesin
// ayarları, oturumu ve mesajları eski %APPDATA%/Kovan klasöründe kaldığı için klasör sabit tutulur. Bu satır, veri
// klasörünü okuyan her şeyden önce çalışmalı. --user-data-dir verilmişse (sınamalar) ona dokunulmaz.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'Kovan'));

// WebRTC: donanım hızlandırmalı kodlama/çözme ve ekran yakalama iyileştirmeleri
app.commandLine.appendSwitch('enable-features', 'AllowWgcScreenCapturer,AllowWgcWindowCapturer,WebRtcUseMinMaxVEADimensions');
// Pil dostu mod (v1.50): açıksa güçlü ekran kartı zorlanmaz; dizüstünde tümleşik kartla çalışıp daha az pil harcar.
// Ayar dosyası pencere açılmadan önce okunur, çünkü bu seçenek yalnız başlangıçta verilebilir.
const powerSaver = (() => {
  try {
    return !!JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'kovan-config.json'), 'utf8'))?.settings?.powerSaver;
  } catch {
    return false;
  }
})();
if (!powerSaver) app.commandLine.appendSwitch('force_high_performance_gpu');

// Ana süreçte yakalanmamış bir hata Electron'un "JavaScript error occurred in the main process" penceresini açar.
// Uygulama çalışmaya devam edebildiği için kullanıcıya pencere göstermek yerine kayda yazılır.
process.on('uncaughtException', (e) => console.error('Ana süreç hatası:', e));
process.on('unhandledRejection', (e) => console.error('Ana süreç söz hatası:', e));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let pendingCapture: { id: string; audio: boolean } | null = null;
let powerBlock: number | null = null;
/** tepsi menüsünden "Güncellemeleri denetle" seçildi (sonuç bildirimle söylenir) */
let tepsidenDenetim = false;

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
// genel sustur / sağırlaştır: "Ctrl+Shift+KeyM" biçimindeki birleşimler
type Bind = { action: 'mute' | 'deaf'; code: number; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
let binds: Bind[] = [];
const held = new Set<number>();
function parseBind(action: Bind['action'], combo: string): Bind | null {
  if (!combo) return null;
  const parts = combo.split('+');
  const t = codeToUio(parts[parts.length - 1]);
  if (!t || t.kind !== 'key') return null;
  return { action, code: t.code, ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt'), meta: parts.includes('Meta') };
}
function onHookKey(e: any, down: boolean) {
  if (pttTarget?.kind === 'key' && e.keycode === pttTarget.code) setPtt(down);
  if (!down) return void held.delete(e.keycode);
  if (held.has(e.keycode)) return; // basılı tutunca tekrar tekrar çevirmesin
  held.add(e.keycode);
  for (const b of binds)
    if (b.code === e.keycode && b.ctrl === !!e.ctrlKey && b.shift === !!e.shiftKey && b.alt === !!e.altKey && b.meta === !!e.metaKey) win?.webContents.send('keys:press', b.action);
}
function ensureHook(): boolean {
  try {
    if (!hook) {
      hook = require('uiohook-napi');
      const u = hook.uIOhook;
      u.on('keydown', (e: any) => onHookKey(e, true));
      u.on('keyup', (e: any) => onHookKey(e, false));
      u.on('mousedown', (e: any) => pttTarget?.kind === 'mouse' && e.button === pttTarget.button && setPtt(true));
      u.on('mouseup', (e: any) => pttTarget?.kind === 'mouse' && e.button === pttTarget.button && setPtt(false));
    }
    if (!hookRunning) {
      hook.uIOhook.start();
      hookRunning = true;
    }
    return true;
  } catch (e) {
    console.error('Genel klavye kancası başlatılamadı', e);
    hook = null;
    return false;
  }
}
/** kanca boşta CPU harcamasın: bas-konuş ve genel tuş yokken durdur */
function maybeStopHook() {
  if (pttTarget || binds.length || !hookRunning) return;
  try {
    hook.uIOhook.stop();
  } catch {
    /* zaten durmuş */
  }
  hookRunning = false;
  held.clear();
}
function configurePtt(cfg: { enabled: boolean; code: string }): boolean {
  if (!cfg.enabled) {
    pttTarget = null;
    setPtt(false);
    maybeStopHook();
    return true;
  }
  if (!ensureHook()) return false;
  pttTarget = codeToUio(cfg.code);
  if (!pttTarget) maybeStopHook();
  return !!pttTarget;
}
function configureKeys(cfg: { enabled: boolean; mute?: string; deaf?: string }): boolean {
  if (!cfg.enabled) {
    binds = [];
    maybeStopHook();
    return true;
  }
  if (!ensureHook()) return false;
  binds = [parseBind('mute', String(cfg.mute || '')), parseBind('deaf', String(cfg.deaf || ''))].filter((b): b is Bind => !!b);
  if (!binds.length) maybeStopHook();
  return binds.length > 0;
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
  /** 1 = gizli anahtar sunucuya göre ayrılıyor (bkz. hostSecret) */
  secretScope?: number;
  /**
   * v1.67 anahtar yenileme. `oldSecrets`: önceki asıl anahtarlar (eskiden yeniye); şimdiki anahtarın kuşağı = uzunluğu.
   * `keyGen[sunucu]`: o sunucunun bildiği anahtarın kuşağı (kayıt yoksa en eski kuşak). `keyTry[sunucu]`: yenileme isteği
   * gönderilen ama yanıtı kaydedilemeyen kuşak (bkz. keyFor, rekey:*).
   */
  oldSecrets?: string[];
  keyGen?: Record<string, number>;
  keyTry?: Record<string, number>;
  /** Bu düzenden önce bağlanılmış sunucular: eski üyelikler bozulmasın diye asıl anahtarı almaya devam eder */
  trustedHosts?: string[];
  /** v1.68 çıkış yapılan ya da başka hesaba girilince yerine geçilen hesaplar (en çok 5; kaybolmasın diye saklanır) */
  oldAccounts?: { profile: Config['profile']; oldSecrets?: string[]; keyGen?: Record<string, number>; trustedHosts?: string[]; hosts?: Config['hosts']; at: number }[];
}

const cfgFile = path.join(app.getPath('userData'), 'kovan-config.json');
const COLORS = ['#f5a524', '#3ecf8e', '#6cb6ff', '#f2555a', '#c084fc', '#22d3ee', '#fb7185', '#a3e635'];

function loadConfig(): Config {
  try {
    const c = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) as Config;
    if (c.profile?.id && c.profile.secret) {
      const cfg: Config = Object.assign({ hosts: [], settings: {}, onboarded: false }, c);
      if (cfg.secretScope !== 1) {
        // Güncellemeden önce bağlanılan sunucular asıl anahtarı zaten biliyor; oradaki üyelikler aynı anahtarla sürer.
        // Bundan sonra eklenen her sunucu yalnız kendine özel türetilmiş anahtarı görür.
        const old = [...(Array.isArray(cfg.hosts) ? cfg.hosts.map((h) => h?.url) : []), cfg.settings?.serverUrl];
        cfg.trustedHosts = [...new Set(old.map(normHost).filter(Boolean))].slice(0, 200);
        cfg.secretScope = 1;
        scopeMigrated = true;
      }
      if (!Array.isArray(cfg.trustedHosts)) cfg.trustedHosts = [];
      return cfg;
    }
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
    secretScope: 1,
    trustedHosts: [],
  };
}

/**
 * Bir sunucuya gönderilecek gizli anahtar.
 * Asıl anahtar yalnız resmî sunucuya, bu bilgisayardaki yerel sunucuya ve güncellemeden önce bağlanılmış sunuculara gider.
 * Diğer her sunucu, asıl anahtardan o adres için türetilmiş ayrı bir anahtar görür: davetle bağlanılan bir sunucu
 * bu anahtarla resmî sunucuda (ya da başka bir yerde) senin yerine oturum açamaz.
 */
function hostSecret(host: unknown): string {
  const h = normHost(typeof host === 'string' ? host.slice(0, 300) : '');
  if (!h) return '';
  return keyFor(h, hostGen(h));
}

/** Şimdiki asıl anahtarın kuşağı: anahtar her yenilendiğinde bir artar */
const curGen = () => config.oldSecrets?.length || 0;
/** Sunucunun şu an bildiği anahtarın kuşağı. Anahtar yenilendikten sonra her sunucu ilk bağlantıda yeni kuşağa taşınır. */
function hostGen(h: string): number {
  const cur = curGen();
  if (!cur) return 0;
  const g = config.keyGen?.[h];
  return typeof g === 'number' && g >= 0 && g <= cur ? g : 0;
}
/** `gen` kuşağında bu sunucuya gönderilen anahtar */
function keyFor(h: string, gen: number): string {
  const master = gen < curGen() ? config.oldSecrets![gen] : config.profile.secret;
  const env = normHost(process.env.KOVAN_SERVER);
  // "güncellemeden önce bağlanılmış" sunucular asıl anahtarı yalnız ilk kuşakta bilir; anahtar yenilenince onlar da kendine özel anahtara geçer
  if (h === normHost(OFFICIAL_SERVER) || isLoopbackHost(h) || (env && h === env) || (gen === 0 && config.trustedHosts?.includes(h))) return master;
  return crypto.createHmac('sha256', master).update('xanaphian-host:v1:' + h).digest('hex');
}

/** Arayüze verilen yapılandırma: asıl gizli anahtar ana süreçten çıkmaz */
function publicConfig(): Config {
  return { ...config, profile: { ...config.profile, secret: '' }, oldSecrets: undefined, keyGen: undefined, keyTry: undefined, oldAccounts: undefined };
}

let scopeMigrated = false;
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
// anahtar düzeni ilk kez uygulandıysa hemen diske yaz (eski sunucu listesi bir sonraki açılışta yeniden hesaplanmasın)
if (scopeMigrated) {
  try {
    saveConfig(true);
  } catch (e) {
    console.error('Yapılandırma yazılamadı', e);
  }
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

/** v1.63.0: arayüz ilk çizimini bitirince çağrılır (açılış ekranı kapanır, ana pencere görünür) */
let anaHazir: (() => void) | null = null;
ipcMain.on('acilis:hazir', (e) => {
  if (win && e.sender === win.webContents) anaHazir?.();
});

function createWindow() {
  const theme = (config.settings.theme as string) || 'dark';
  win = new BrowserWindow({
    ...restoreBounds(),
    minWidth: 940,
    minHeight: 560,
    show: false,
    title: 'Naphian',
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
  // v1.63.0: pencere, arayüz ilk kez çizilip açılış ekranı kapanınca gösterilir.
  // maximize() gizli pencereyi de gösterdiği için büyütme gösterme anına bırakıldı.
  const buyuk = !!config.bounds?.maximized;
  const gizli = process.argv.includes('--hidden');
  const w = win;
  let gosterildi = false;
  const goster = () => {
    if (gosterildi || w.isDestroyed()) return;
    gosterildi = true;
    acilisKapat(() => {
      if (w.isDestroyed()) return;
      if (buyuk) w.maximize();
      w.show();
    });
  };
  if (gizli) {
    if (buyuk) w.once('show', () => w.maximize());
  } else {
    anaHazir = goster;
    acilisDurum('Arayüz yükleniyor');
    w.once('ready-to-show', () => {
      acilisDurum('Hazırlanıyor');
      // arayüz "hazırım" demezse (ör. bir hata) yine de en geç 5 sn sonra açılsın
      setTimeout(goster, acilisAcik() ? 5000 : 0);
    });
  }
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
  win.on('resize', () => scheduleOverlayMatch(500));
  win.on('show', () => scheduleOverlayMatch(300));
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
  // v1.59.1: görüşmede arka plan kısıtlaması kapalıyken Chromium küçültülmüş pencereyi de çizer; arayüz gerçek durumu bilsin
  const sendVisible = () => {
    if (win && !win.isDestroyed()) win.webContents.send('win:gorunur', win.isVisible() && !win.isMinimized());
  };
  for (const ev of ['minimize', 'restore', 'hide', 'show'] as const) win.on(ev as 'show', sendVisible);
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
  return { color: THEME_BAR[t], symbolColor: THEME_SYM[t], height: 44 };
}

// v1.71: pencere düğmeleri bölgesinin rengi sayfadaki üst çubuğun gerçek renginden ölçülür.
// Üst çubuk temaya göre degrade/parıltı taşıdığı için sabit renk tabloları her temada uymuyordu.
let overlayTheme = 'destan';
let overlayTimer: ReturnType<typeof setTimeout> | null = null;
function hex2(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}
async function matchOverlay() {
  const w = win;
  if (!w || w.isDestroyed() || !w.isVisible() || w.isMinimized()) return;
  const [cw] = w.getContentSize();
  // düğmelerin hemen solundaki ince şerit ölçülür: göz düğmeyi oradaki renkle karşılaştırır
  const seam = await w.webContents
    .executeJavaScript('(()=>{const o=navigator.windowControlsOverlay;if(!o||!o.visible)return 0;const r=o.getTitlebarAreaRect();return r.x+r.width})()')
    .catch(() => 0);
  const edge = typeof seam === 'number' && seam > 40 && seam <= cw ? seam : cw - 140;
  const rect = { x: Math.max(0, Math.round(edge) - 10), y: 4, width: 8, height: 36 };
  const img = await w.webContents.capturePage(rect);
  if (img.isEmpty()) return;
  const { width, height } = img.getSize();
  const px = img.toBitmap(); // BGRA
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      b += px[i];
      g += px[i + 1];
      r += px[i + 2];
      n++;
    }
  if (!n) return;
  r /= n;
  g /= n;
  b /= n;
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
  const sym = THEME_SYM[overlayTheme] || (light ? '#2a2a30' : '#e4e6ee');
  if (w.isDestroyed()) return;
  w.setTitleBarOverlay({ color: '#' + hex2(r) + hex2(g) + hex2(b), symbolColor: sym, height: 44 });
}
function scheduleOverlayMatch(ms = 400) {
  if (overlayTimer) clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => {
    overlayTimer = null;
    matchOverlay().catch(() => {
      /* desteklenmiyor */
    });
  }, ms);
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  acilisKapat();
  win.show();
  win.focus();
}

function createTray() {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Naphian');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Naphian\'ı aç', click: showWindow },
      { type: 'separator' },
      {
        label: 'Güncellemeleri denetle',
        click: () => {
          tepsidenDenetim = true;
          updater?.check(true);
        },
      },
      { label: 'Çıkış', click: () => ((quitting = true), app.quit()) },
    ]),
  );
  tray.on('click', showWindow);
}

function handleArgv(argv: string[]) {
  // xanaphian://davet/s3gas25 (davet sayfasındaki düğme) ya da eski kovan://invite/...
  const link = argv.find((a) => /^(kovan|xanaphian):\/\//i.test(a));
  if (!link) return;
  const m = link.match(/^(?:kovan|xanaphian):\/\/(?:invite|davet)\/(.+?)\/?$/i);
  if (!m) return;
  let code: string;
  try {
    code = decodeURIComponent(m[1]).slice(0, 400);
  } catch {
    return;
  }
  if (win && !win.webContents.isLoading()) win.webContents.send('invite', code);
  else pendingInvite = code;
}

app.on('second-instance', (_e, argv) => {
  showWindow();
  handleArgv(argv);
});

for (const scheme of ['kovan', 'xanaphian']) {
  if (process.defaultApp) {
    if (process.argv.length >= 2) app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])]);
  } else app.setAsDefaultProtocolClient(scheme);
}

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
  // v1.63.0: açılış ekranı her şeyden önce görünsün (gizli başlatmada gösterilmez)
  if (!process.argv.includes('--hidden')) acilisAc(app.getVersion(), iconPath());
  // v1.64: "Bilgisayar açılınca başlat" anahtarı Windows'taki gerçek durumu göstersin
  // (ör. Görev Yöneticisi > Başlangıç'tan kapatıldıysa ayarlarda hâlâ açık görünmesin)
  if (!isDev && process.platform === 'win32' && config.settings.openAtLogin !== undefined) {
    try {
      const li = app.getLoginItemSettings({ args: ['--hidden'] });
      const gercek = li.executableWillLaunchAtLogin ?? li.openAtLogin;
      if (!!config.settings.openAtLogin !== gercek) {
        config.settings = { ...config.settings, openAtLogin: gercek };
        saveConfig();
      }
    } catch {
      /* okunamadı: kayıtlı ayar kalsın */
    }
  }
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
  // v1.48: bilgisayardaki yerel sunucu artık yalnız gerektiğinde açılır (bu bilgisayarda taşınmamış eski bir topluluk varsa
  // ya da sunucu adresi bu bilgisayarı gösteriyorsa). Herkes merkezi sunucuya bağlandığı için çoğu kişide gereksizdi:
  // ağa açık bir kapı, Windows güvenlik duvarı sorusu ve boşa çalışan bir sunucu demekti.
  const prefPort = (config.settings.hubPort as number) || DEFAULT_PORT;
  const srvIsMe = (() => {
    // "sunucu adresi" bu bilgisayardaki yerel sunucuyu mu gösteriyor? (ör. 127.0.0.1:47820 ya da kendi ağ adresi)
    const m = String(config.settings.serverUrl || process.env.KOVAN_SERVER || '').trim().match(/^(?:https?:\/\/)?(\[[^\]]+\]|[^:/]+)(?::(\d+))?/i);
    if (!m) return false;
    const h = m[1].toLowerCase();
    const port = Number(m[2] || 0);
    const mine = h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || Hub.lanAddresses().includes(h);
    return mine && port >= prefPort && port < prefPort + 20;
  })();
  const localWanted = hub.hasStoredCommunities() || srvIsMe || process.env.KOVAN_LOCAL_HUB === '1';
  hub.ownerName = config.profile.name || 'Naphian';
  hub.siteMeta = fetchSiteMeta;
  if (localWanted) {
    try {
      await hub.start(prefPort);
      setTimeout(() => hub.refreshAllSiteMeta(), 4000);
      setInterval(() => hub.refreshAllSiteMeta(), 6 * 3600_000);
    } catch (e) {
      console.error('Hub başlatılamadı', e);
    }
  }
  registerIpc();
  initEkstralar({
    preload: path.join(__dirname, 'preload.js'),
    indexFile: path.join(__dirname, '../renderer/index.html'),
    devUrl: isDev ? process.env.KOVAN_DEV_URL : undefined,
    icon: iconPath(),
    mainWin: () => win,
    look: () => {
      const t = (config.settings.theme as string) || 'destan';
      return { bg: themeBg(t), overlay: overlayFor(t) };
    },
  });
  initActivity((st) => win?.webContents.send('act:update', st));
  createWindow();
  initOverlay(() => win, isDev);
  initTemplateFetch();
  createTray();
  updater = new Updater(() => win, isDev);
  updater.dinle = (u) => {
    if (u.state === 'checking') acilisDurum('Güncellemeler denetleniyor');
    else if (u.state === 'none') acilisDurum('Her şey güncel');
    else if (u.state === 'available') acilisDurum(`Yeni sürüm var: v${u.version}`);
    // v1.64: tepsi menüsünden denetlenince pencere kapalıysa sonuç bildirimle söylenir (eskiden hiçbir şey görünmüyordu)
    if (tepsidenDenetim && (u.state === 'none' || u.state === 'available' || u.state === 'error')) {
      tepsidenDenetim = false;
      if (win?.isVisible() || !Notification.isSupported()) return;
      const body =
        u.state === 'none' ? 'En son sürümü kullanıyorsun.' : u.state === 'available' ? `Yeni sürüm hazır: v${u.version}. Yüklemek için tıkla.` : `Denetlenemedi: ${u.message}`;
      const n = new Notification({ title: 'Naphian güncellemesi', body, icon: iconPath() });
      n.on('click', () => showWindow());
      n.show();
    }
  };
  updater.start();
  handleArgv(process.argv);
});

app.on('before-quit', () => {
  quitting = true;
});
app.on('will-quit', () => {
  if (saveTimer) saveConfig(true);
  destroyOverlay();
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
      const auth = { 'x-kovan-user': config.profile.id, 'x-kovan-secret': hostSecret(server) };
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
    powerSaver,
  }));
  ipcMain.handle('mcp:claude-desktop', (_e, a: { name: string; url: string; token: string }) => installClaudeDesktop(a));
  ipcMain.handle('cfg:get', () => publicConfig());
  ipcMain.handle('sys:idle', () => {
    // Yalnız Windows ve macOS: Linux'ta bu çağrı D-Bus üzerinden ekran koruyucuya sorup ana süreci saniyelerce
    // kilitleyebiliyor (otomatik sınamada uygulama donuyordu). -1 = bilinmiyor, arayüz yalnız pencere hareketine bakar.
    if (process.platform !== 'win32' && process.platform !== 'darwin') return -1;
    try {
      return powerMonitor.getSystemIdleTime();
    } catch {
      return -1;
    }
  });
  // eşzamanlı: bağlantı açılırken kimlik çerçevesi hemen gönderilir
  ipcMain.on('cfg:host-secret', (e, host: unknown) => {
    e.returnValue = hostSecret(host);
  });
  // ---- v1.68 giriş ekranı: e-posta / kullanıcı adı + şifre, QR ile giriş, şifre sıfırlama ----
  // Sunucu girişte bu cihaza özel bir anahtar verir; o anahtar ve hesabın profili yapılandırmaya yazılır, arayüz yeniden yüklenir.
  // Önceki hesap silinmez: `oldAccounts` içinde saklanır (yanlışlıkla çıkış yapan biri kaybetmesin).
  const girisAdresi = (server: unknown) => {
    const u = typeof server === 'string' ? server.trim().replace(/\/+$/, '').slice(0, 300) : '';
    if (!/^https?:\/\/[^\s/]+/i.test(u)) throw new Error('Sunucu adresi geçersiz.');
    return u;
  };
  const girisIstek = async (server: unknown, p: string, body: Record<string, unknown>) => {
    const base = girisAdresi(server);
    let r: Response;
    try {
      r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    } catch {
      return { code: 0, body: { msg: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.' } as Record<string, any> };
    }
    const j = ((await r.json().catch(() => ({}))) || {}) as Record<string, any>;
    if (r.status === 404 && !j.msg && !j.state) j.msg = 'Sunucu bu giriş yöntemini henüz desteklemiyor.';
    return { code: r.status, body: j };
  };
  const cihazAdi = () => (process.platform === 'win32' ? 'Windows bilgisayar' : process.platform === 'darwin' ? 'Mac bilgisayar' : 'Bilgisayar');
  const girisUygula = (j: Record<string, any>): boolean => {
    const id = typeof j.id === 'string' ? j.id.slice(0, 40) : '';
    const secret = typeof j.secret === 'string' ? j.secret : '';
    if (!id || !/^[0-9a-f]{64}$/.test(secret)) return false;
    const u = (j.user || {}) as Record<string, any>;
    if (config.profile.name && config.profile.id !== id) {
      const eski = { profile: config.profile, oldSecrets: config.oldSecrets, keyGen: config.keyGen, trustedHosts: config.trustedHosts, hosts: config.hosts, at: Date.now() };
      config.oldAccounts = [...(config.oldAccounts || []).filter((x) => x.profile?.id !== config.profile.id), eski].slice(-5);
    }
    config.profile = {
      id,
      secret,
      name: typeof u.name === 'string' ? u.name.slice(0, 32) : '',
      color: typeof u.color === 'string' && /^#[0-9a-f]{6}$/i.test(u.color) ? u.color : config.profile.color,
      avatar: typeof u.avatar === 'string' ? u.avatar : undefined,
      bio: typeof u.bio === 'string' ? u.bio : undefined,
      ...(u.profile && typeof u.profile === 'object' ? { extra: u.profile } : {}),
      status: 'online',
    } as Config['profile'];
    config.oldSecrets = undefined;
    config.keyGen = undefined;
    config.keyTry = undefined;
    config.trustedHosts = [];
    // başka bir hesaba geçildiyse önceki hesabın bağlandığı sunucu listesi taşınmaz
    if (config.oldAccounts?.some((x) => x.profile?.id && x.profile.id !== id)) config.hosts = [];
    config.onboarded = !!config.profile.name;
    saveConfig(true);
    return true;
  };
  ipcMain.handle('giris:login', async (_e, server: unknown, login: unknown, password: unknown) => {
    const r = await girisIstek(server, '/auth/login', { login: String(login || '').slice(0, 300), password: String(password || '').slice(0, 200), device: cihazAdi() });
    if (r.code === 200 && girisUygula(r.body)) return { ok: true };
    return { ok: false, error: String(r.body.msg || `Giriş yapılamadı (${r.code}).`) };
  });
  // QR: soru anahtarı (p) ana süreçte kalır; arayüz yalnız QR'da gösterilecek kodu görür
  const qrSorular = new Map<string, { server: string; p: string }>();
  ipcMain.handle('giris:qr-new', async (_e, server: unknown) => {
    const r = await girisIstek(server, '/auth/qr', { device: cihazAdi() });
    if (r.code !== 200 || typeof r.body.k !== 'string' || typeof r.body.p !== 'string') return { ok: false, error: String(r.body.msg || 'QR kodu alınamadı.') };
    qrSorular.clear();
    qrSorular.set(r.body.k, { server: girisAdresi(server), p: r.body.p });
    return { ok: true, k: r.body.k as string, ms: Number(r.body.ms) || 120_000 };
  });
  ipcMain.handle('giris:qr-poll', async (_e, k: unknown) => {
    const q = typeof k === 'string' ? qrSorular.get(k) : undefined;
    if (!q) return { state: 'yok' };
    const r = await girisIstek(q.server, '/auth/qr/durum', { k, p: q.p });
    if (r.code === 200 && r.body.id) {
      qrSorular.delete(k as string);
      return girisUygula(r.body) ? { state: 'ok' } : { state: 'yok' };
    }
    if (r.code === 0) return { state: 'bekliyor' }; // anlık kopukluk: bir sonraki yoklamada yeniden denenir
    const u = r.body.user as Record<string, any> | undefined;
    return { state: String(r.body.state || 'yok'), user: u ? { name: String(u.name || ''), color: String(u.color || ''), avatar: typeof u.avatar === 'string' ? u.avatar : undefined } : undefined };
  });
  ipcMain.handle('giris:forgot', async (_e, server: unknown, email: unknown) => {
    const r = await girisIstek(server, '/auth/unuttum', { email: String(email || '').slice(0, 300) });
    return r.code === 200 ? { ok: true } : { ok: false, error: String(r.body.msg || `İstek gönderilemedi (${r.code}).`) };
  });
  ipcMain.handle('giris:reset', async (_e, server: unknown, email: unknown, code: unknown, password: unknown) => {
    const r = await girisIstek(server, '/auth/sifirla', { email: String(email || '').slice(0, 300), code: String(code || '').slice(0, 12), password: String(password || '').slice(0, 200), device: cihazAdi() });
    if (r.code === 200 && girisUygula(r.body)) return { ok: true };
    return { ok: false, error: String(r.body.msg || `Şifre sıfırlanamadı (${r.code}).`) };
  });
  // v1.70 e-posta doğrulama: kod gönder, kodu doğrula (bilet döner; kayıt ve e-posta bağlama bunu ister)
  ipcMain.handle('giris:kod', async (_e, server: unknown, email: unknown) => {
    const r = await girisIstek(server, '/auth/kod', { email: String(email || '').slice(0, 300) });
    return r.code === 200 ? { ok: true } : { ok: false, error: String(r.body.msg || `Kod gönderilemedi (${r.code}).`) };
  });
  ipcMain.handle('giris:kod-dogrula', async (_e, server: unknown, email: unknown, code: unknown) => {
    const r = await girisIstek(server, '/auth/kod/dogrula', { email: String(email || '').slice(0, 300), code: String(code || '').slice(0, 12) });
    return r.code === 200 && typeof r.body.bilet === 'string' ? { ok: true, bilet: r.body.bilet as string } : { ok: false, error: String(r.body.msg || `Kod doğrulanamadı (${r.code}).`) };
  });
  // Çıkış: bu bilgisayardaki hesap saklanır, yerine boş (yeni) bir hesap açılır ve giriş ekranı görünür
  ipcMain.handle('giris:logout', () => {
    if (config.profile.name) {
      const eski = { profile: config.profile, oldSecrets: config.oldSecrets, keyGen: config.keyGen, trustedHosts: config.trustedHosts, hosts: config.hosts, at: Date.now() };
      config.oldAccounts = [...(config.oldAccounts || []).filter((x) => x.profile?.id !== config.profile.id), eski].slice(-5);
    }
    config.profile = { id: makeId(), secret: crypto.randomBytes(32).toString('hex'), name: '', color: config.profile.color, status: 'online' };
    config.oldSecrets = undefined;
    config.keyGen = undefined;
    config.keyTry = undefined;
    config.trustedHosts = [];
    config.hosts = [];
    config.onboarded = false;
    saveConfig(true);
    return true;
  });

  // ---- hesap anahtarını yenileme (v1.67) ----
  // Yeni asıl anahtar üretilir; her sunucu, eski anahtarla bağlandıktan hemen sonra `rekey` ile yeni anahtara taşınır.
  ipcMain.handle('rekey:start', () => {
    // eski anahtarlar saklanır: uzun süredir bağlanılmayan bir sunucu hâlâ eski kuşaktaki anahtarı biliyor olabilir
    config.oldSecrets = [...(config.oldSecrets || []), config.profile.secret];
    config.profile = { ...config.profile, secret: crypto.randomBytes(32).toString('hex') };
    config.keyTry = {};
    saveConfig();
    return true;
  });
  /** Bu sunucu eski anahtarda mı? Öyleyse gönderilecek yeni anahtarı verir ve isteğin gönderildiğini kaydeder. */
  ipcMain.on('rekey:target', (e, host: unknown) => {
    const h = normHost(typeof host === 'string' ? host.slice(0, 300) : '');
    if (!h || hostGen(h) >= curGen()) return void (e.returnValue = '');
    config.keyTry = { ...(config.keyTry || {}), [h]: curGen() };
    saveConfig();
    e.returnValue = keyFor(h, curGen());
  });
  /** Sunucu yeni anahtarı kabul etti */
  ipcMain.on('rekey:done', (e, host: unknown) => {
    const h = normHost(typeof host === 'string' ? host.slice(0, 300) : '');
    if (h && curGen()) {
      config.keyGen = { ...(config.keyGen || {}), [h]: curGen() };
      if (config.keyTry) delete config.keyTry[h];
      saveConfig();
    }
    e.returnValue = true;
  });
  /**
   * Kimlik doğrulanamadı: yenileme isteği gönderilmiş ama yanıtı kaydedilememişse (uygulama tam o anda kapandıysa)
   * sunucu aslında yeni anahtara geçmiştir. O durumda yeni anahtarı geçerli say; true dönerse bağlantı yeniden denenir.
   */
  ipcMain.on('rekey:assume', (e, host: unknown) => {
    const h = normHost(typeof host === 'string' ? host.slice(0, 300) : '');
    const t = h ? config.keyTry?.[h] : undefined;
    if (!h || typeof t !== 'number' || t !== curGen() || hostGen(h) >= t) return void (e.returnValue = false);
    config.keyGen = { ...(config.keyGen || {}), [h]: t };
    delete config.keyTry![h];
    saveConfig();
    e.returnValue = true;
  });
  ipcMain.handle('act:config', (_e, c: ActivityConfig) => (configureActivity(c), getActivity()));
  ipcMain.handle('act:apps', () => runningApps());
  ipcMain.handle('game:has', (_e, name: string) => hasGame(String(name).slice(0, 80)));
  ipcMain.handle('game:launch', (_e, name: string) => launchGame(String(name).slice(0, 80)));
  ipcMain.handle('spotify:status', () => spotifyStatus());
  ipcMain.handle('spotify:connect', (_e, id?: string) => spotifyConnect(typeof id === 'string' ? id.slice(0, 64) : undefined));
  ipcMain.handle('spotify:disconnect', () => spotifyDisconnect());
  ipcMain.handle('spotify:play', (_e, q: { url?: string; title?: string; artist?: string; pos?: number }) =>
    spotifyPlay({ url: typeof q?.url === 'string' ? q.url.slice(0, 200) : undefined, title: String(q?.title || '').slice(0, 200), artist: typeof q?.artist === 'string' ? q.artist.slice(0, 200) : undefined, pos: Number(q?.pos) || 0 }),
  );
  ipcMain.handle('game:lol-state', () => lolState());
  ipcMain.handle('game:lol-invite', (_e, riotId: string) => lolInvite(String(riotId).slice(0, 48)));
  ipcMain.handle('game:lol-accept', (_e, from: string) => lolAccept(String(from).slice(0, 48)));
  ipcMain.handle('game:steam-join', (_e, id: string) => steamJoin(String(id).slice(0, 120)));
  ipcMain.handle('cfg:set', (_e, patch: Partial<Config>) => {
    config = {
      ...config,
      ...patch,
      profile: { ...config.profile, ...(patch.profile || {}), id: config.profile.id, secret: config.profile.secret },
      settings: { ...config.settings, ...(patch.settings || {}) },
      // arayüz bu alanları değiştiremez
      secretScope: config.secretScope,
      trustedHosts: config.trustedHosts,
      oldSecrets: config.oldSecrets,
      keyGen: config.keyGen,
      keyTry: config.keyTry,
      oldAccounts: config.oldAccounts,
    };
    if (patch.profile?.name) hub.ownerName = config.profile.name;
    saveConfig();
    if (patch.settings?.openAtLogin !== undefined && !isDev) {
      app.setLoginItemSettings({ openAtLogin: !!patch.settings.openAtLogin, args: ['--hidden'] });
    }
    return publicConfig();
  });
  ipcMain.handle('app:pending-invite', () => {
    const p = pendingInvite;
    pendingInvite = null;
    return p;
  });
  ipcMain.on('win:overlay', (_e, theme: string) => {
    try {
      overlayTheme = theme;
      win?.setTitleBarOverlay(overlayFor(theme));
      win?.setBackgroundColor(themeBg(theme));
      scheduleOverlayMatch();
    } catch {
      /* desteklenmiyor */
    }
  });
  const liveNotifs = new Set<Notification>();
  ipcMain.on('notify', (_e, n: { title: string; body: string; tag: string; silent?: boolean; icon?: string }) => {
    if (!Notification.isSupported() || blockNotify(_e.sender)) return;
    if (win?.isFocused()) return;
    const notif = new Notification({ title: n.title.slice(0, 100), body: String(n.body || '').slice(0, 300), silent: !!n.silent, icon: iconPath() });
    // Bildirim nesnesi bir yerde tutulmazsa bellek temizliğinde silinebilir; o zaman bildirime tıklamak hiçbir şey yapmaz.
    liveNotifs.add(notif);
    if (liveNotifs.size > 40) liveNotifs.delete(liveNotifs.values().next().value!);
    const forget = () => liveNotifs.delete(notif);
    notif.on('click', () => {
      forget();
      showWindow();
      win?.webContents.send('notify:click', n.tag);
    });
    notif.on('close', forget);
    notif.on('failed', forget);
    notif.show();
    win?.flashFrame(true);
  });
  // ---- ekran paylaşımı ----
  ipcMain.handle('cap:sources', async () => {
    const srcs = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true });
    const displays = screen.getAllDisplays();
    return srcs
      .filter((s) => (s.name !== 'Kovan' && s.name !== 'Naphian') || s.id.startsWith('screen'))
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
  ipcMain.handle('keys:config', (_e, cfg: { enabled: boolean; mute?: string; deaf?: string }) => configureKeys(cfg));
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
    if (isPopout(_e.sender)) return;
    if (process.platform === 'win32') {
      if (count > 0 && !win?.isFocused()) win?.flashFrame(true);
    } else app.setBadgeCount(count);
    tray?.setToolTip(count > 0 ? `Naphian (${count} bahsetme)` : 'Naphian');
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
  // Uygulamayı kapatıp yeniden açar (pil dostu mod gibi yalnız başlangıçta okunan ayarlar için)
  ipcMain.on('app:relaunch', () => {
    saveConfig(true);
    quitting = true;
    app.relaunch();
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
  // merkezi sunucudaki botların adresi https ile başlar
  if (!/^kvb\./.test(a.token) || !/^https?:\/\/[^\s]+\/mcp$/.test(a.url)) return { ok: false, files: [], error: 'Geçersiz bilgi' };
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
