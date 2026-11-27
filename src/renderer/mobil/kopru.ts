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

api.mobile = { platform: Capacitor.getPlatform(), onBack: onBackButton };
(window as any).kovan = api;
document.documentElement.classList.add('mobil', 'mobil-' + Capacitor.getPlatform());
// açılıştan biraz sonra sessizce güncelleme denetimi
setTimeout(() => void checkUpdate(false).then(() => upd.state === 'none' && setUpd({ state: 'idle' })), 8000);

// ---- v1.68 giriş: masaüstündeki main.ts giris:* ile aynı uç noktalar (POST /auth/login, /auth/qr, /auth/unuttum, /auth/sifirla) ----
// Sunucu bu cihaza özel bir anahtar verir; anahtar ve profil yapılandırmaya yazılır, arayüz yeniden yüklenir.
const cihazAdi = () => (Capacitor.getPlatform() === 'ios' ? 'iPhone' : Capacitor.getPlatform() === 'android' ? 'Android telefon' : 'Telefon');
const girisAdresi = (server: unknown) => {
  const u = typeof server === 'string' ? server.trim().replace(/\/+$/, '').slice(0, 300) : '';
  if (!/^https?:\/\/[^\s/]+/i.test(u)) throw new Error('Sunucu adresi geçersiz.');
  return u;
};
async function girisIstek(server: unknown, p: string, body: Record<string, unknown>): Promise<{ code: number; body: Record<string, any> }> {
  let r: Response;
  try {
    r = await fetch(girisAdresi(server) + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  } catch {
    return { code: 0, body: { msg: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.' } };
  }
  const j = ((await r.json().catch(() => ({}))) || {}) as Record<string, any>;
  if (r.status === 404 && !j.msg && !j.state) j.msg = 'Sunucu bu giriş yöntemini henüz desteklemiyor.';
  return { code: r.status, body: j };
}
function girisUygula(j: Record<string, any>): boolean {
  const id = typeof j.id === 'string' ? j.id.slice(0, 40) : '';
  const secret = typeof j.secret === 'string' ? j.secret : '';
  if (!id || !/^[0-9a-f]{64}$/.test(secret)) return false;
  const u = (j.user || {}) as Record<string, any>;
  config = {
    // sunucudaki profil olduğu gibi alınır: ilk hello'da boş adla sunucudakini ezmesin
    profile: {
      id,
      secret,
      name: typeof u.name === 'string' ? u.name.slice(0, 32) : '',
      color: typeof u.color === 'string' && /^#[0-9a-f]{6}$/i.test(u.color) ? u.color : config.profile.color,
      avatar: typeof u.avatar === 'string' ? u.avatar : undefined,
      bio: typeof u.bio === 'string' ? u.bio : undefined,
      ...(u.profile && typeof u.profile === 'object' ? { extra: u.profile } : {}),
      status: 'online',
    },
    hosts: [],
    settings: { ...config.settings, membersOpen: false },
    onboarded: typeof u.name === 'string' && !!u.name,
    secretScope: 1,
    trustedHosts: [],
  };
  save();
  try {
    localStorage.removeItem('kovan.read');
  } catch {
    /* yok */
  }
  return true;
}
const qrSorular = new Map<string, { server: string; p: string }>();
const giris = {
  login: async (server: string, login: string, password: string) => {
    const r = await girisIstek(server, '/auth/login', { login: String(login || '').slice(0, 300), password: String(password || '').slice(0, 200), device: cihazAdi() });
    if (r.code === 200 && girisUygula(r.body)) return { ok: true };
    return { ok: false, error: String(r.body.msg || `Giriş yapılamadı (${r.code}).`) };
  },
  qrNew: async (server: string) => {
    const r = await girisIstek(server, '/auth/qr', { device: cihazAdi() });
    if (r.code !== 200 || typeof r.body.k !== 'string' || typeof r.body.p !== 'string') return { ok: false, error: String(r.body.msg || 'QR kodu alınamadı.') };
    qrSorular.clear();
    qrSorular.set(r.body.k, { server: girisAdresi(server), p: r.body.p });
    return { ok: true, k: r.body.k as string, ms: Number(r.body.ms) || 120_000 };
  },
  qrPoll: async (k: string) => {
    const q = qrSorular.get(k);
    if (!q) return { state: 'yok' };
    const r = await girisIstek(q.server, '/auth/qr/durum', { k, p: q.p });
    if (r.code === 200 && r.body.id) {
      qrSorular.delete(k);
      return girisUygula(r.body) ? { state: 'ok' } : { state: 'yok' };
    }
    if (r.code === 0) return { state: 'bekliyor' };
    const u = r.body.user as Record<string, any> | undefined;
    return { state: String(r.body.state || 'yok'), user: u ? { name: String(u.name || ''), color: String(u.color || ''), avatar: typeof u.avatar === 'string' ? u.avatar : undefined } : undefined };
  },
  forgot: async (server: string, email: string) => {
    const r = await girisIstek(server, '/auth/unuttum', { email: String(email || '').slice(0, 300) });
    return r.code === 200 ? { ok: true } : { ok: false, error: String(r.body.msg || `İstek gönderilemedi (${r.code}).`) };
  },
  reset: async (server: string, email: string, code: string, password: string) => {
    const r = await girisIstek(server, '/auth/sifirla', { email: String(email || '').slice(0, 300), code: String(code || '').slice(0, 12), password: String(password || '').slice(0, 200), device: cihazAdi() });
    if (r.code === 200 && girisUygula(r.body)) return { ok: true };
    return { ok: false, error: String(r.body.msg || `Şifre sıfırlanamadı (${r.code}).`) };
  },
  // Çıkış: telefondaki hesap silinir, yerine boş bir hesap açılır ve giriş ekranı görünür
  logout: async () => {
    const color = config.profile.color;
    config = fresh();
    config.profile.color = color;
    save();
    return true;
  },
  // v1.70 e-posta doğrulama (masaüstündeki giris:kod / giris:kod-dogrula ile aynı)
  kod: async (server: string, email: string) => {
    const r = await girisIstek(server, '/auth/kod', { email: String(email || '').slice(0, 300) });
    return r.code === 200 ? { ok: true } : { ok: false, error: String(r.body.msg || `Kod gönderilemedi (${r.code}).`) };
  },
  kodDogrula: async (server: string, email: string, code: string) => {
    const r = await girisIstek(server, '/auth/kod/dogrula', { email: String(email || '').slice(0, 300), code: String(code || '').slice(0, 12) });
    return r.code === 200 && typeof r.body.bilet === 'string' ? { ok: true, bilet: r.body.bilet as string } : { ok: false, error: String(r.body.msg || `Kod doğrulanamadı (${r.code}).`) };
  },
};
api.giris = giris;

/** Android geri tuşu: önce açık pencere/menü, sonra kanal listesine dön, en sonda uygulamayı arka plana al */
function onBackButton(cb: () => boolean) {
  if (!Capacitor.isNativePlatform()) return;
  CapApp.addListener('backButton', () => {
    if (!cb()) CapApp.minimizeApp().catch(noop);
  }).catch(noop);
}
