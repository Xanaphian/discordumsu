// v1.68 telefon uygulaması: masaüstündeki `window.kovan` köprüsünün (preload.ts) telefondaki karşılığı.
// Masaüstünde bu işleri Electron'un ana süreci yapıyor; telefonda yerel sunucu, oyun etkinliği, kaplama, ekran paylaşımı yok.
// Bu dosya uygulamanın geri kalanından ÖNCE yüklenir (bkz. mobil/giris.tsx).
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import type { KovanApi } from '../../preload/preload';
import { makeId } from '../../shared/protocol';
import { OFFICIAL_SERVER, isLoopbackHost, normHost } from '../../shared/guvenlik';
import { hmacSha256Hex } from './sha256';

declare const __APP_VERSION__: string;

const CFG_KEY = 'xan.mobil.config';
const COLORS = ['#f5a524', '#3ecf8e', '#6cb6ff', '#f2555a', '#c084fc', '#22d3ee', '#fb7185', '#a3e635'];
const REPO = 'Xanaphian/discordumsu';

interface Config {
  profile: { id: string; secret: string; name: string; color: string; avatar?: string; bio?: string; status: string; extra?: unknown };
  hosts: { url: string; label?: string }[];
  settings: Record<string, unknown>;
  onboarded: boolean;
  secretScope?: number;
  oldSecrets?: string[];
  keyGen?: Record<string, number>;
  keyTry?: Record<string, number>;
  trustedHosts?: string[];
}

const randHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => x.toString(16).padStart(2, '0')).join('');

function fresh(): Config {
  return {
    profile: { id: makeId(), secret: randHex(32), name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], status: 'online' },
    hosts: [],
    // telefonda üye listesi ve yan paneller kapalı başlar (dar ekran)
    settings: { membersOpen: false },
    onboarded: false,
    secretScope: 1,
    trustedHosts: [],
  };
}

function load(): Config {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || '') as Config;
    if (c?.profile?.id && c.profile.secret) return Object.assign({ hosts: [], settings: {}, onboarded: false, trustedHosts: [] }, c);
  } catch {
    /* ilk açılış */
  }
  return fresh();
}

let config = load();
const save = () => {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(config));
  } catch {
    /* depolama dolu: bir sonraki değişiklikte yeniden denenir */
  }
};
save();

const publicConfig = () => ({ ...config, profile: { ...config.profile, secret: '' }, oldSecrets: undefined, keyGen: undefined, keyTry: undefined });

// ---- sunucuya göre anahtar (main.ts hostSecret ile birebir aynı kurallar) ----
const curGen = () => config.oldSecrets?.length || 0;
function hostGen(h: string) {
  const cur = curGen();
  if (!cur) return 0;
  const g = config.keyGen?.[h];
  return typeof g === 'number' && g >= 0 && g <= cur ? g : 0;
}
function keyFor(h: string, gen: number) {
  const master = gen < curGen() ? config.oldSecrets![gen] : config.profile.secret;
  if (h === normHost(OFFICIAL_SERVER) || isLoopbackHost(h) || (gen === 0 && config.trustedHosts?.includes(h))) return master;
  return hmacSha256Hex(master, 'xanaphian-host:v1:' + h);
}
const norm = (host: unknown) => normHost(typeof host === 'string' ? host.slice(0, 300) : '');

// ---- güncelleme: GitHub Releases'taki en yeni APK ----
type Upd = Parameters<Parameters<KovanApi['update']['onStatus']>[0]>[0];
let upd: any = { state: 'idle' };
let apkUrl = '';
const updListeners = new Set<(s: Upd) => void>();
const setUpd = (s: any) => {
  upd = s;
  updListeners.forEach((f) => f(s));
};
const newer = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
async function checkUpdate(manual = true) {
  // iPhone'da güncelleme App Store / TestFlight üzerinden gelir
  if (Capacitor.getPlatform() !== 'android') return setUpd({ state: 'none', manual, checkedAt: Date.now() });
  setUpd({ state: 'checking', manual });
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`GitHub yanıt vermedi (${r.status})`);
    const j = await r.json();
    const v = String(j.tag_name || '').replace(/^v/, '');
    const apk = (j.assets || []).find((a: any) => /\.apk$/i.test(a.name));
    if (v && apk && newer(v, __APP_VERSION__)) {
      apkUrl = apk.browser_download_url;
      setUpd({ state: 'available', version: v, notes: j.body || undefined, size: apk.size });
    } else setUpd({ state: 'none', manual, checkedAt: Date.now() });
  } catch (e) {
    setUpd({ state: 'error', message: 'Güncelleme denetlenemedi: ' + (e as Error).message, manual });
  }
}

// ---- bildirimler ----
const notifyListeners = new Set<(tag: string) => void>();
let notifyId = 1;
let notifyAsked = false;
async function notify(n: { title: string; body: string; tag: string; silent?: boolean }) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (!notifyAsked) {
      notifyAsked = true;
      const p = await LocalNotifications.checkPermissions();
      if (p.display !== 'granted') await LocalNotifications.requestPermissions();
    }
    await LocalNotifications.schedule({ notifications: [{ id: notifyId++ % 2_000_000_000, title: n.title, body: n.body.slice(0, 300), extra: { tag: n.tag }, silent: n.silent }] });
  } catch {
    /* izin verilmedi */
  }
}
if (Capacitor.isNativePlatform()) {
  LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const tag = String(a.notification.extra?.tag || '');
    if (tag) notifyListeners.forEach((f) => f(tag));
  }).catch(() => {});
}

// ---- davet bağlantıları: xanaphian://davet/kod ----
const inviteListeners = new Set<(code: string) => void>();
let pendingInvite: string | null = null;
function fromUrl(url: string) {
  const m = /^(?:xanaphian|kovan):\/\/(?:davet|invite)\/([^?#]+)/i.exec(url) || /xanaphian\.com\/davet\/([^/?#]+)/i.exec(url);
  if (!m) return;
  const code = decodeURIComponent(m[1]);
  if (inviteListeners.size) inviteListeners.forEach((f) => f(code));
  else pendingInvite = code;
}
if (Capacitor.isNativePlatform()) {
  CapApp.addListener('appUrlOpen', (e) => fromUrl(e.url)).catch(() => {});
  CapApp.getLaunchUrl()
    .then((u) => u?.url && fromUrl(u.url))
    .catch(() => {});
}

// ---- görünürlük: uygulama arka plana atılınca ----
const visibleListeners = new Set<(v: boolean) => void>();
document.addEventListener('visibilitychange', () => visibleListeners.forEach((f) => f(document.visibilityState === 'visible')));

const noop = () => {};
const off = () => noop;
const no = async () => false;

// Electron'un türleri birebir tutmuyor (ipcRenderer dönüşleri); biçim preload.ts ile aynı tutulur
const api: Record<string, any> = {
  mobile: null,
  info: async () => ({
    version: __APP_VERSION__,
    platform: Capacitor.getPlatform(),
    hubPort: 0,
    hubId: '',
    lan: [],
    electron: '',
    chrome: (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || '',
    dev: false,
    exePath: '',
    mcpBridge: '',
    server: undefined,
    powerSaver: false,
    mobile: true,
  }),
  getConfig: async () => publicConfig(),
  setConfig: async (patch: any) => {
    const p = (patch || {}) as Partial<Config>;
    config = {
      ...config,
      ...p,
      profile: { ...config.profile, ...(p.profile || {}), id: config.profile.id, secret: config.profile.secret },
      settings: { ...config.settings, ...(p.settings || {}) },
      secretScope: config.secretScope,
      trustedHosts: config.trustedHosts,
      oldSecrets: config.oldSecrets,
      keyGen: config.keyGen,
      keyTry: config.keyTry,
    };
    save();
    return publicConfig();
  },
  hostSecret: (host: string) => {
    const h = norm(host);
    return h ? keyFor(h, hostGen(h)) : '';
  },
  rekey: {
    start: async () => {
      config.oldSecrets = [...(config.oldSecrets || []), config.profile.secret];
      config.profile = { ...config.profile, secret: randHex(32) };
      config.keyTry = {};
      save();
      return true;
    },
    target: (host: string) => {
      const h = norm(host);
      if (!h || hostGen(h) >= curGen()) return '';
      config.keyTry = { ...(config.keyTry || {}), [h]: curGen() };
      save();
      return keyFor(h, curGen());
    },
    done: (host: string) => {
      const h = norm(host);
      if (h && curGen()) {
        config.keyGen = { ...(config.keyGen || {}), [h]: curGen() };
        if (config.keyTry) delete config.keyTry[h];
        save();
      }
      return true;
    },
    assume: (host: string) => {
      const h = norm(host);
      const t = h ? config.keyTry?.[h] : undefined;
      if (!h || typeof t !== 'number' || t !== curGen() || hostGen(h) >= t) return false;
      config.keyGen = { ...(config.keyGen || {}), [h]: t };
      delete config.keyTry![h];
      save();
      return true;
    },
  },
  pendingInvite: async () => {
    const p = pendingInvite;
    pendingInvite = null;
    return p;
  },
  migrate: async () => ({ ok: false, error: 'Telefonda kullanılamaz.' }),
  setTheme: noop,
  notify: (n: { title: string; body: string; tag: string; silent?: boolean }) => void notify(n),
  badge: noop,
  openExternal: (url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    if (Capacitor.isNativePlatform()) Browser.open({ url }).catch(() => window.open(url, '_blank'));
    else window.open(url, '_blank', 'noopener');
  },
  quit: () => CapApp.exitApp().catch(noop),
  acilisHazir: noop,
  systemIdle: async () => -1,
  relaunch: () => location.reload(),
  installClaudeDesktop: async () => ({ ok: false, files: [], error: 'Telefonda kullanılamaz.' }),
  onInvite: (cb: (code: string) => void) => (inviteListeners.add(cb), () => inviteListeners.delete(cb)),
  onNotifyClick: (cb: (tag: string) => void) => (notifyListeners.add(cb), () => notifyListeners.delete(cb)),
  capture: { sources: async () => [], select: async () => undefined },
  inCall: noop,
  onVisible: (cb: (v: boolean) => void) => void visibleListeners.add(cb),
  ptt: { configure: no, onChange: off },
  keys: { configure: no, onPress: off },
  zoom: { set: noop as any, get: () => 1 },
  activity: { configure: async () => null, apps: async () => [], onUpdate: off },
  spotify: {
    status: async () => ({ clientId: '', defaultClientId: true, connected: false, redirect: '', error: 'Spotify hesabı şimdilik bilgisayardan bağlanır.' }),
    connect: async () => ({ clientId: '', defaultClientId: true, connected: false, redirect: '', error: 'Spotify hesabı şimdilik bilgisayardan bağlanır.' }),
    disconnect: async () => ({ clientId: '', defaultClientId: true, connected: false, redirect: '' }),
    play: async () => ({ ok: false, error: 'Telefonda Spotify uygulamasından aç.' }),
  },
  game: {
    lolState: async () => ({ running: false, lobby: false }),
    lolInvite: async () => ({ ok: false, error: 'Telefonda kullanılamaz.' }),
    lolAccept: async () => ({ ok: false, error: 'Telefonda kullanılamaz.' }),
    steamJoin: no,
    has: no,
    launch: async () => ({ ok: false, error: 'Oyun telefonda açılamaz.' }),
  },
  linkMeta: async () => null,
  streamer: { watch: no, state: noop, onObs: off },
  popout: { open: noop, toMain: noop, onGo: off, theme: noop },
  overlay: { state: noop, message: noop, shortcut: no, onState: off, onMessage: off, onHidden: off },
  discordTemplate: async () => ({ ok: false, error: 'Discord şablonu bilgisayardaki uygulamadan alınır.' }),
  platform: Capacitor.getPlatform(),
  update: {
    check: () => checkUpdate(true),
    download: async () => {
      // Android: APK tarayıcıda indirilir, açınca telefon "Güncelle" der
      if (apkUrl) api.openExternal(apkUrl);
    },
    install: async () => {
      if (apkUrl) api.openExternal(apkUrl);
    },
    state: async () => upd,
    onStatus: (cb: (s: Upd) => void) => (updListeners.add(cb as any), () => updListeners.delete(cb as any)),
  },
};

api.mobile = { platform: Capacitor.getPlatform(), login: loginWithPassword, onBack: onBackButton };
(window as any).kovan = api;
document.documentElement.classList.add('mobil', 'mobil-' + Capacitor.getPlatform());
// açılıştan biraz sonra sessizce güncelleme denetimi
setTimeout(() => void checkUpdate(false).then(() => upd.state === 'none' && setUpd({ state: 'idle' })), 8000);

/** E-posta / kullanıcı adı + şifreyle giriş: sunucu bu cihaza özel bir anahtar verir (asıl anahtar telefona gelmez) */
async function loginWithPassword(login: string, password: string, server = OFFICIAL_SERVER): Promise<{ ok: boolean; error?: string }> {
  if (!login.trim() || !password) return { ok: false, error: 'Kullanıcı adını ve şifreni yaz.' };
  try {
    const r = await fetch(server.replace(/\/+$/, '') + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: login.trim(), password }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) return { ok: false, error: 'Sunucu şifreyle girişi henüz desteklemiyor.' };
    const u = (j.user && typeof j.user === 'object' ? j.user : j) as { name?: string; color?: string; avatar?: string; bio?: string; profile?: unknown };
    if (!r.ok || !j.id || !j.secret) return { ok: false, error: j.msg || j.error || (r.status === 401 ? 'Kullanıcı adı ya da şifre yanlış.' : r.status === 429 ? 'Çok fazla deneme. Biraz bekle.' : `Sunucu hatası (${r.status}).`) };
    config = {
      // sunucudaki profil olduğu gibi alınır: ilk hello'da boş adla sunucudakini ezmesin
      profile: { id: String(j.id), secret: String(j.secret), name: String(u.name || ''), color: u.color || config.profile.color, avatar: u.avatar, bio: u.bio, extra: u.profile, status: 'online' },
      hosts: [],
      settings: { membersOpen: false },
      onboarded: !!u.name,
      secretScope: 1,
      trustedHosts: [],
    };
    save();
    try {
      localStorage.removeItem('kovan.read');
    } catch {
      /* yok */
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.' };
  }
}

/** Android geri tuşu: önce açık pencere/menü, sonra kanal listesine dön, en sonda uygulamayı arka plana al */
function onBackButton(cb: () => boolean) {
  if (!Capacitor.isNativePlatform()) return;
  CapApp.addListener('backButton', () => {
    if (!cb()) CapApp.minimizeApp().catch(noop);
  }).catch(noop);
}
