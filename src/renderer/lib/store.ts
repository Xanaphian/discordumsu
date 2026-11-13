import { create } from 'zustand';
import {
  type AvatarLook,
  Attachment, ChannelType, ClientFrame, Community, ID, Message, ServerFrame, Status, UserPublic, VoiceMember,
  decodeInvite, encodeInvite, makeId, isVoiceLike, encodeHostToken, parseShortInvite, Perm,
  type AuditEntry, type Ban, type DmInfo, type FriendInfo, type DmPrivacy,
} from '../../shared/protocol';
import { IS_POPOUT } from './popout';
import { sanitizeProfile, type ProfileExtra } from '../../shared/profile';
import { HostConn, probeHost, ConnStatus, httpBase } from './net';
import { debounce } from './util';
import { playSound } from './sound';
import { mediaLabel } from './medya';
import { cardSummary } from './cards';
import { toolSummary } from './tools';
import type { Blueprint } from '../../shared/topluluk';

export interface Profile {
  id: ID;
  name: string;
  color: string;
  avatar?: string;
  bio?: string;
  extra?: ProfileExtra;
  status: Status;
}

export interface Settings {
  /** xanaphian.com temaları: destan = Gece */
  theme: 'destan' | 'kagit' | 'tozpembe' | 'siyah' | 'bej' | 'bordo' | 'koyuyesil';
  accent: string;
  fontSize: number;
  compact: boolean;
  notify: 'all' | 'mentions' | 'none';
  sounds: boolean;
  closeToTray: boolean;
  openAtLogin: boolean;
  publicAddress: string;
  inviteHost: string; // kısa davette kullanılacak adres ("" = otomatik)
  serverUrl: string; // merkezi sunucu ("" = varsayılan)
  railOrder: ID[];
  collapsed: ID[];
  membersOpen: boolean;
  reduceMotion: boolean;
  micId: string;
  speakerId: string;
  noiseSuppression: boolean;
  enterToSend: boolean;
  showLinkPreviews: boolean;
  avatarHat: AvatarLook['hat'];
  avatarColor: string;
  spaceNight: boolean;
  spaceQuality: 'low' | 'high';
  // ses
  echoCancellation: boolean;
  autoGainControl: boolean;
  voiceBitrate: number; // kbps
  inputVolume: number; // %
  outputVolume: number; // %
  inputMode: 'vad' | 'ptt';
  vadThreshold: number; // 0-100, 0 = otomatik
  pttKey: string; // KeyboardEvent.code
  pttRelease: number; // ms
  userVolumes: Record<ID, number>; // %
  joinMuted: boolean;
  // kamera
  camId: string;
  camRes: 360 | 720 | 1080;
  camFps: 15 | 30 | 60;
  camMirror: boolean;
  // ekran paylaşımı
  screenRes: 720 | 1080 | 1440 | 2160 | 0; // 0 = kaynak
  screenFps: 15 | 30 | 60;
  screenHint: 'motion' | 'detail';
  screenAudio: boolean;
  videoCodec: 'auto' | 'h264' | 'vp9' | 'vp8' | 'av1';
  // sohbet, gizlilik, bildirim istisnaları (v1.3)
  notifyOverrides: Record<ID, NotifyLevel>; // topluluk ya da kanal kimliği -> seviye
  mutedIds: ID[]; // sessize alınan topluluk / kanallar
  suppressEveryone: ID[]; // @everyone/@here bildirimi bastırılan topluluklar
  notifyPreview: boolean; // bildirimde mesaj içeriğini göster
  sendTyping: boolean;
  blocked: ID[];
  devMode: boolean;
  confirmLinks: boolean;
  spoilers: 'click' | 'always';
  emojiConvert: boolean;
  showJoinMessages: boolean;
  inlineMedia: boolean;
  showRoleIcons: boolean;
  msgStyle: 'petek' | 'balon' | 'duz';
  layout: 'float' | 'flush';
  backdrop: boolean;
  // etkinlik (v1.18)
  /** anlık etkinliğimi paylaş (ana anahtar) */
  actShare: boolean;
  actGames: boolean;
  actMusic: boolean;
  /** tarayıcıda çalan müzik/videolar */
  actBrowser: boolean;
  /** Kick / Twitch'te yayındayken göster */
  actStream: boolean;
  /** profilde son 30 günün etkinliği */
  actRecent: boolean;
  /** elle eklenen oyunlar: süreç adı -> görünen ad */
  customGames: { exe: string; name: string }[];
  /** gösterilmeyecek oyunlar (görünen ad) */
  hiddenGames: string[];
  // v1.26: yayıncı modu, özel mesaj gizliliği ve sabitleme
  /** off = kapalı, auto = OBS açılınca, on = hep açık */
  streamerMode: 'off' | 'auto' | 'on';
  streamerHideNotifs: boolean;
  streamerHideInvites: boolean;
  streamerHidePersonal: boolean;
  streamerMuteSounds: boolean;
  /** kimler yeni özel mesaj yazabilir */
  dmPrivacy: DmPrivacy;
  /** listenin üstüne sabitlenen özel mesajlar (sanal topluluk kimliği) */
  pinnedDms: ID[];
  /** görünüm göçü: 2 = Destan teması varsayılan oldu (v1.7), 3 = site altını (v1.14), 4 = site temaları (v1.16) */
  lookRev: number;
}

export type NotifyLevel = 'all' | 'mentions' | 'none';

/** xanaphian.com altını */
export const DESTAN_GOLD = '#c8aa6e';
/** sitedeki her temanın vurgu rengi (--gold) */
export const SITE_GOLD: Record<string, string> = {
  destan: '#c8aa6e',
  kagit: '#6f5318',
  tozpembe: '#b0446a',
  siyah: '#c9ccd6',
  bej: '#7a5a1e',
  bordo: '#d6a86e',
  koyuyesil: '#c8b06a',
};
/** 1.16 öncesi temalar → en yakın site teması */
const THEME_MOVE: Record<string, string> = { kor: 'bordo', buzul: 'siyah', zumrut: 'koyuyesil', alaca: 'bordo', dark: 'destan', midnight: 'siyah', ocean: 'destan', forest: 'koyuyesil', rose: 'tozpembe', light: 'kagit' };

export const DEFAULT_SETTINGS: Settings = {
  theme: 'destan',
  accent: DESTAN_GOLD,
  fontSize: 15,
  compact: false,
  notify: 'all',
  sounds: true,
  closeToTray: true,
  openAtLogin: false,
  publicAddress: '',
  inviteHost: '',
  serverUrl: '',
  railOrder: [],
  collapsed: [],
  membersOpen: true,
  reduceMotion: false,
  micId: 'default',
  speakerId: 'default',
  noiseSuppression: true,
  enterToSend: true,
  showLinkPreviews: true,
  avatarHat: 'antenna',
  avatarColor: '',
  spaceNight: false,
  spaceQuality: 'high',
  echoCancellation: true,
  autoGainControl: true,
  voiceBitrate: 96,
  inputVolume: 100,
  outputVolume: 100,
  inputMode: 'vad',
  vadThreshold: 0,
  pttKey: 'KeyV',
  pttRelease: 200,
  userVolumes: {},
  joinMuted: false,
  camId: 'default',
  camRes: 720,
  camFps: 30,
  camMirror: true,
  screenRes: 1080,
  screenFps: 30,
  screenHint: 'motion',
  screenAudio: false,
  videoCodec: 'auto',
  notifyOverrides: {},
  mutedIds: [],
  suppressEveryone: [],
  notifyPreview: true,
  sendTyping: true,
  blocked: [],
  devMode: false,
  confirmLinks: false,
  spoilers: 'click',
  emojiConvert: true,
  showJoinMessages: true,
  inlineMedia: true,
  showRoleIcons: true,
  msgStyle: 'petek',
  layout: 'float',
  backdrop: true,
  actShare: true,
  actGames: true,
  actMusic: true,
  actBrowser: false,
  actStream: true,
  actRecent: true,
  customGames: [],
  hiddenGames: [],
  streamerMode: 'auto',
  streamerHideNotifs: true,
  streamerHideInvites: true,
  streamerHidePersonal: true,
  streamerMuteSounds: false,
  dmPrivacy: 'all',
  pinnedDms: [],
  lookRev: 4,
};

export type CMessage = Message & { pending?: boolean; failed?: boolean; nonce?: string };

export interface ChanState {
  items: CMessage[];
  more: boolean;
  loaded: boolean;
  loading: boolean;
  prepended: number;
  epoch?: number;
  detached?: boolean; // en yeni mesajlar yüklü değil (eski bir mesaja atlandı)
}

export type Modal =
  | { type: 'createCommunity' }
  | { type: 'join'; code?: string }
  | { type: 'invite'; cid: ID }
  | { type: 'settings'; tab?: string }
  | { type: 'commSettings'; cid: ID; tab?: string }
  | { type: 'commProfile'; cid: ID }
  | { type: 'stats'; cid: ID }
  | { type: 'createChannel'; cid: ID; categoryId: ID | null; kind?: ChannelType }
  | { type: 'editChannel'; cid: ID; chId: ID; tab?: string }
  | { type: 'editCategory'; cid: ID; catId: ID; tab?: string }
  | { type: 'notify'; cid: ID; chId?: ID }
  | { type: 'moderate'; cid: ID; uid: ID; action: 'kick' | 'ban' | 'timeout' | 'nick' }
  | { type: 'createCategory'; cid: ID; catId?: ID }
  | { type: 'confirm'; title: string; body: string; confirmText?: string; danger?: boolean; onConfirm: () => void }
  | { type: 'image'; src: string; name: string }
  | { type: 'quick' }
  | { type: 'screenShare' }
  | { type: 'search'; cid: ID; q?: string }
  | { type: 'profile'; uid: ID; cid?: ID }
  | { type: 'customStatus' }
  | { type: 'selfRoles'; cid: ID };

export interface MenuItem {
  label?: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  checked?: boolean;
  onClick?: () => void;
  sep?: boolean;
  emojis?: string[];
  onEmoji?: (e: string) => void;
  /** üzerine gelince sağda açılan alt menü */
  sub?: MenuItem[];
}

export interface Toast {
  id: number;
  text: string;
  kind?: 'ok' | 'err' | 'info';
}

export type UpdateState =
  | { state: 'idle' }
  | { state: 'dev' }
  | { state: 'checking'; manual: boolean }
  | { state: 'none'; manual: boolean; checkedAt: number }
  | { state: 'available'; version: string; notes?: string; size?: number }
  | { state: 'downloading'; version: string; percent: number; bps: number; transferred: number; total: number }
  | { state: 'ready'; version: string; notes?: string }
  | { state: 'error'; message: string; manual: boolean };

export interface AppInfo {
  version: string;
  platform: string;
  hubPort: number;
  hubId: string;
  lan: string[];
  electron: string;
  chrome: string;
  dev: boolean;
  exePath?: string;
  mcpBridge?: string;
  /** KOVAN_SERVER ortam değişkeniyle verilen sunucu (deneme için) */
  server?: string;
}

interface Conn {
  host: string;
  status: ConnStatus;
  error?: string;
  hubId?: string;
  hubName?: string;
  local: boolean;
  /** merkezi sunucu */
  home?: boolean;
}

export interface State {
  booted: boolean;
  info: AppInfo | null;
  secret: string;
  me: Profile;
  onboarded: boolean;
  settings: Settings;
  conns: Record<string, Conn>;
  communities: Record<ID, Community>;
  commHost: Record<ID, string>;
  chanComm: Record<ID, ID>;
  users: Record<ID, UserPublic>;
  presence: Record<ID, Status>;
  chans: Record<ID, ChanState>;
  lastIds: Record<ID, ID>;
  read: Record<ID, ID>;
  mentions: Record<ID, number>;
  typing: Record<ID, Record<ID, number>>;
  voice: Record<ID, VoiceMember[]>;
  current: ID | 'home';
  chanByComm: Record<ID, ID>;
  modal: Modal | null;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  popout: { uid: ID; cid?: ID; x: number; y: number } | null;
  replyTo: Record<ID, ID | undefined>;
  editing: ID | null;
  toasts: Toast[];
  update: UpdateState;
  focused: boolean;
  jumpTo: { ch: ID; id: ID; at: number } | null;
  /** arkadaşlar: tüm kovanlardan birleşik liste */
  friends: Record<ID, FriendInfo & { host: string }>;
  /** Ana Sayfa'da açık sekme */
  homeTab: 'home' | 'online' | 'all' | 'pending' | 'add';
  /** gelen özel arama */
  ringing: { cid: ID; ch: ID; from: ID } | null;
}

const conns = new Map<string, HostConn>();
let readSaver: () => void = () => {};

const loadRead = (): Record<ID, ID> => {
  try {
    return JSON.parse(localStorage.getItem('kovan.read') || '{}');
  } catch {
    return {};
  }
};

export const useStore = create<State>(() => ({
  booted: false,
  info: null,
  secret: '',
  me: { id: '', name: '', color: '#f5a524', status: 'online' },
  onboarded: false,
  settings: DEFAULT_SETTINGS,
  conns: {},
  communities: {},
  commHost: {},
  chanComm: {},
  users: {},
  presence: {},
  chans: {},
  lastIds: {},
  read: loadRead(),
  mentions: {},
  typing: {},
  voice: {},
  current: 'home',
  chanByComm: {},
  modal: null,
  menu: null,
  popout: null,
  replyTo: {},
  editing: null,
  toasts: [],
  update: { state: 'idle' },
  focused: document.hasFocus(),
  jumpTo: null,
  friends: {},
  homeTab: 'home',
  ringing: null,
}));

const S = () => useStore.getState();
const set = useStore.setState;

// ---------------------------------------------------------------------------
// yardımcılar
export function connFor(cidOrCh: ID): HostConn | undefined {
  const st = S();
  const cid = st.communities[cidOrCh] ? cidOrCh : st.chanComm[cidOrCh];
  const host = cid && st.commHost[cid];
  return host ? conns.get(host) : undefined;
}

export function hostHttp(cid: ID): string {
  const h = S().commHost[cid];
  return h ? httpBase(h) : '';
}

/** Herkesin bağlandığı merkezi sunucu */
export const DEFAULT_SERVER = 'https://45-87-173-18.sslip.io/kovan';
/** Davet ve arkadaş kodlarının ön eki: "xanaphian/s3gas25" */
export const INVITE_PREFIX = 'xanaphian';
const HOME_PREFIXES = new Set([INVITE_PREFIX, 'kovan']);

export function homeHost() {
  const s = S();
  return (s.settings.serverUrl || s.info?.server || DEFAULT_SERVER).trim().replace(/\/+$/, '');
}

export function localHost() {
  const info = S().info;
  return info ? `127.0.0.1:${info.hubPort}` : '';
}

let toastSeq = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++toastSeq;
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'err' ? 6000 : 3500);
}

const persistSettings = debounce((settings: Settings) => window.kovan.setConfig({ settings }), 400);

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...S().settings, ...patch };
  set({ settings });
  persistSettings(settings);
  if (patch.theme) window.kovan.setTheme(patch.theme);
}

function hello(): ClientFrame {
  const { me, secret } = S();
  return { t: 'hello', user: { id: me.id, name: me.name || 'Arı', color: me.color, avatar: me.avatar, bio: me.bio, profile: me.extra }, secret, status: me.status, v: 1 };
}

function ensureConn(host: string, local = false): HostConn {
  let c = conns.get(host);
  if (c) return c;
  const home = host === homeHost();
  c = new HostConn(host, hello, onFrame, (h, status, error) => {
    set((s) => ({ conns: { ...s.conns, [h]: { ...(s.conns[h] || { host: h, local, home }), status, error } } }));
  });
  conns.set(host, c);
  set((s) => ({ conns: { ...s.conns, [host]: { host, status: 'connecting', local, home } } }));
  return c;
}

function saveHosts() {
  const local = localHost();
  const home = homeHost();
  const hosts = [...conns.keys()].filter((h) => h !== local && h !== home).map((url) => ({ url }));
  window.kovan.setConfig({ hosts });
}

// ---------------------------------------------------------------------------
// açılış
export async function boot() {
  const [cfg, info, upd] = await Promise.all([window.kovan.getConfig(), window.kovan.info(), window.kovan.update.state()]);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(cfg.settings || {}) };
  if (cfg.settings && !((cfg.settings as Partial<Settings>).lookRev! >= 2)) {
    // v1.7: yeni Destan görünümü bir kez varsayılan olur; Ayarlar > Görünüm'den eskisine dönülebilir.
    settings.theme = 'destan';
    if (!cfg.settings.accent || cfg.settings.accent === '#f5a524') settings.accent = DESTAN_GOLD;
    settings.lookRev = 2;
    window.kovan.setConfig({ settings });
  }
  if (settings.lookRev < 4) {
    // v1.16: temalar xanaphian.com'dakilerle aynı; eski temalar en yakın site temasına geçer
    const old = settings.theme as string;
    const theme = (THEME_MOVE[old] || (old in SITE_GOLD ? old : 'destan')) as Settings['theme'];
    settings.theme = theme;
    settings.accent = SITE_GOLD[theme];
    settings.lookRev = 4;
    window.kovan.setConfig({ settings });
  }
  set({
    info,
    secret: cfg.profile.secret,
    me: { id: cfg.profile.id, name: cfg.profile.name, color: cfg.profile.color, avatar: cfg.profile.avatar, bio: cfg.profile.bio, extra: sanitizeProfile(cfg.profile.extra), status: (cfg.profile.status as Status) || 'online' },
    onboarded: !!cfg.onboarded && !!cfg.profile.name,
    settings,
    update: upd || { state: 'idle' },
    booted: true,
  });
  window.kovan.setTheme(settings.theme);
  readSaver = debounce(() => localStorage.setItem('kovan.read', JSON.stringify(S().read)), 1000);
  window.kovan.update.onStatus((u) => set({ update: u as UpdateState }));
  window.kovan.onInvite((code) => set({ modal: { type: 'join', code } }));
  window.kovan.onNotifyClick((tag) => {
    if (tag === 'friends') return setHomeTab('pending');
    const cid = S().chanComm[tag];
    if (cid) selectChannel(cid, tag);
  });
  window.addEventListener('focus', () => {
    set({ focused: true });
    const st = S();
    if (st.current !== 'home') {
      const ch = st.chanByComm[st.current];
      if (ch) markRead(ch);
    }
  });
  window.addEventListener('blur', () => set({ focused: false }));
  window.addEventListener('online', () => conns.forEach((c) => c.nudge()));
  // boşta durumu: 10 dk hareketsizlikte "boşta"
  let idleTimer: ReturnType<typeof setTimeout>;
  let autoIdle = false;
  const activity = () => {
    clearTimeout(idleTimer);
    if (autoIdle) {
      autoIdle = false;
      setStatus('online', true);
    }
    idleTimer = setTimeout(() => {
      if (S().me.status === 'online') {
        autoIdle = true;
        setStatus('idle', true);
      }
    }, 10 * 60 * 1000);
  };
  // ayrı pencere boşta durumunu yönetmez (ana pencere yönetir)
  if (!IS_POPOUT) {
    for (const ev of ['mousemove', 'keydown', 'mousedown']) window.addEventListener(ev, debounce(activity, 1000), { passive: true });
    activity();
  }

  if (S().onboarded) connectAll(cfg.hosts || []);
  const pending = await window.kovan.pendingInvite();
  if (pending) set({ modal: { type: 'join', code: pending } });
}

function connectAll(hosts: { url: string }[]) {
  ensureConn(homeHost());
  const local = localHost();
  // kendi bilgisayarındaki eski kovan: yalnızca içinde topluluk varsa görünür (taşıma için)
  if (local) ensureConn(local, true);
  for (const h of hosts) if (h.url !== local && h.url !== homeHost()) ensureConn(h.url);
}

export async function finishOnboarding(p: { name: string; color: string; avatar?: string }) {
  const me = { ...S().me, ...p };
  set({ me, onboarded: true });
  const cfg = await window.kovan.setConfig({ profile: { name: me.name, color: me.color, avatar: me.avatar }, onboarded: true });
  connectAll(cfg.hosts || []);
}

// ---------------------------------------------------------------------------
// sunucu çerçeveleri
function upsertCommunity(host: string, c: Community, lastIds?: Record<ID, ID>) {
  set((s) => {
    const chanComm = { ...s.chanComm };
    for (const [ch, cid] of Object.entries(chanComm)) if (cid === c.id) delete chanComm[ch];
    for (const ch of c.channels) chanComm[ch.id] = c.id;
    const users = { ...s.users, ...c.users };
    const settings = s.settings.railOrder.includes(c.id) ? s.settings : { ...s.settings, railOrder: [...s.settings.railOrder, c.id] };
    if (settings !== s.settings) persistSettings(settings);
    let chanByComm = s.chanByComm;
    const curCh = chanByComm[c.id];
    if (!curCh || !c.channels.some((x) => x.id === curCh && !isVoiceLike(x.type))) {
      const first = sortedChannels(c).find((x) => !isVoiceLike(x.type));
      chanByComm = { ...chanByComm, [c.id]: first?.id || '' };
    }
    return {
      communities: { ...s.communities, [c.id]: c },
      commHost: { ...s.commHost, [c.id]: host },
      chanComm,
      users,
      settings,
      chanByComm,
      lastIds: lastIds ? { ...s.lastIds, ...lastIds } : s.lastIds,
    };
  });
}

function removeCommunity(cid: ID) {
  set((s) => {
    const communities = { ...s.communities };
    const c = communities[cid];
    delete communities[cid];
    const commHost = { ...s.commHost };
    delete commHost[cid];
    const chanComm = { ...s.chanComm };
    if (c) for (const ch of c.channels) delete chanComm[ch.id];
    return {
      communities,
      commHost,
      chanComm,
      current: s.current === cid ? 'home' : s.current,
      settings: { ...s.settings, railOrder: s.settings.railOrder.filter((x) => x !== cid) },
    };
  });
}

// ---------------------------------------------------------------------------
// özel mesajlar: her DM, tek kanallı sanal bir topluluk olarak tutulur; böylece
// sohbet ekranı, okunmamış sayacı ve bildirimler olduğu gibi çalışır.
export const dmCid = (peer: ID) => 'dm_' + peer;
const DM_PERMS = Perm.VIEW_CHANNEL | Perm.SEND_MESSAGES | Perm.ATTACH_FILES | Perm.ADD_REACTIONS;

function dmCommunity(d: DmInfo): Community {
  const st = S();
  const meId = st.me.id;
  const meUser: UserPublic = st.users[meId] || { id: meId, name: st.me.name, color: st.me.color, avatar: st.me.avatar };
  const cid = dmCid(d.peer.id);
  return {
    id: cid,
    name: d.peer.name,
    color: d.peer.color,
    icon: d.peer.avatar,
    ownerId: '',
    createdAt: 0,
    roles: [{ id: cid, name: '@herkes', color: '', perms: DM_PERMS, hoist: false, position: 0 }],
    categories: [],
    channels: [{ id: d.ch, name: d.peer.name, type: 'text', categoryId: null, position: 0 }],
    members: [
      { userId: meId, roles: [], joinedAt: 0 },
      { userId: d.peer.id, roles: [], joinedAt: 0 },
    ],
    users: { [meId]: meUser, [d.peer.id]: d.peer },
    pv: 2,
    dm: d.peer.id,
    dmLast: d.lastId || st.communities[cid]?.dmLast || '',
  };
}

function upsertDm(host: string, d: DmInfo) {
  const cid = dmCid(d.peer.id);
  const prev = S().communities[cid];
  // aynı kişiyle iki farklı kovanda DM varsa en son konuşulanı göster
  if (prev && S().commHost[cid] !== host && (prev.dmLast || '') > (d.lastId || '')) return;
  const c = dmCommunity(d);
  set((s) => ({
    communities: { ...s.communities, [cid]: c },
    commHost: { ...s.commHost, [cid]: host },
    chanComm: { ...s.chanComm, [d.ch]: cid },
    chanByComm: { ...s.chanByComm, [cid]: d.ch },
    users: { ...s.users, [d.peer.id]: s.users[d.peer.id] || d.peer },
    lastIds: d.lastId ? { ...s.lastIds, [d.ch]: d.lastId } : s.lastIds,
  }));
}

// ---------------------------------------------------------------------------
// arkadaşlar
const STATE_RANK = { ok: 2, in: 1, out: 0 } as const;
/** Aynı kişiyle birden çok kovanda kayıt varsa en güçlüsü (arkadaş > gelen > giden) kalır */
function mergeFriend(friends: State['friends'], host: string, fi: FriendInfo) {
  const cur = friends[fi.user.id];
  if (cur && cur.host !== host && STATE_RANK[cur.state] > STATE_RANK[fi.state]) return;
  friends[fi.user.id] = { ...fi, host };
}

export const pendingIn = (friends: State['friends']) => Object.values(friends).filter((x) => x.state === 'in').length;

/** Bu kişiyle ortak topluluğu olan, şu an bağlı bir kovan (en küçük kimlikli olan, iki taraf da aynısını seçsin) */
function sharedHost(uid: ID): string | null {
  const st = S();
  const hosts = new Map<string, string>();
  for (const c of realCommunities(st.communities)) {
    if (!c.members.some((m) => m.userId === uid)) continue;
    const h = st.commHost[c.id];
    const conn = h && st.conns[h];
    if (conn && conn.status === 'online') hosts.set(h, conn.hubId || h);
  }
  if (!hosts.size) return null;
  const home = homeHost();
  if (hosts.has(home)) return home;
  return [...hosts.entries()].sort((a, b) => (a[1] < b[1] ? -1 : 1))[0][0];
}

/** Eski sürüm kovanlar yeni çerçevelere hiç cevap vermez: zaman aşımını anlaşılır bir mesaja çevir */
const oldHubMsg = (e: any) =>
  e?.message === 'Zaman aşımı' ? "Ortak topluluğunuzu barındıran kişinin Xanaphian'ı eski sürümde. Özel mesaj ve arkadaşlık için onun da 1.10'a güncellemesi gerekiyor." : '';

export async function addFriend(uid: ID) {
  const f = S().friends[uid];
  if (f?.state === 'in') return acceptFriend(uid);
  if (f) return;
  const host = sharedHost(uid);
  if (!host) return toast('Bu kişiyle şu an açık ortak bir topluluğun yok. Onun arkadaş kodunu kullanabilirsin.', 'err');
  try {
    await conns.get(host)!.request({ t: 'friend.req', to: uid });
    toast(`${S().users[uid]?.name || 'Kişi'} adlı kişiye arkadaşlık isteği gönderildi.`, 'ok');
  } catch (e: any) {
    toast(oldHubMsg(e) || e?.message || 'İstek gönderilemedi.', 'err');
  }
}

export function acceptFriend(uid: ID) {
  const f = S().friends[uid];
  if (f) conns.get(f.host)?.send({ t: 'friend.accept', to: uid });
}

export function removeFriend(uid: ID) {
  const f = S().friends[uid];
  if (f) conns.get(f.host)?.send({ t: 'friend.remove', to: uid });
}

/** Kendi kovanındaki arkadaş kodun: "adres/kod" biçiminde */
export async function myFriendCode(reset = false): Promise<string> {
  const home = homeHost();
  const conn = conns.get(home);
  if (!conn) throw new Error('Sunucuya bağlanılmadı.');
  await waitOnline(home);
  const r = await conn.request<{ data: string }>({ t: 'friend.code', reset, rid: '' });
  return `${INVITE_PREFIX}/${r.data}`;
}

/** Gerçek topluluklar (özel mesajlar hariç) */
export const realCommunities = (communities: Record<ID, Community>) => Object.values(communities).filter((c) => !c.dm);

/** Özel mesaj sohbetleri, en son yazışılan en üstte */
export const dmList = (communities: Record<ID, Community>) =>
  Object.values(communities)
    .filter((c) => c.dm)
    .sort((a, b) => ((b.dmLast || '') > (a.dmLast || '') ? 1 : -1));

/** Biriyle özel mesajlaşmayı açar (gerekirse ortak bir topluluğun kovanında oluşturur) */
export async function openDm(uid: ID) {
  const st = S();
  if (!uid || uid === st.me.id) return;
  const cid = dmCid(uid);
  const hidden = hiddenDms();
  if (cid in hidden) {
    delete hidden[cid];
    localStorage.setItem('kovan.dmHidden', JSON.stringify(hidden));
  }
  if (st.communities[cid]) {
    set({ modal: null, popout: null, menu: null });
    return selectCommunity(cid);
  }
  // önce arkadaşlığın tutulduğu kovan, yoksa ortak topluluğun kovanı
  const fr = st.friends[uid];
  const host = fr?.state === 'ok' && st.conns[fr.host]?.status === 'online' ? fr.host : sharedHost(uid);
  if (!host) return toast('Bu kişiyle şu an açık ortak bir topluluğun yok ya da arkadaşlığınızın tutulduğu sunucu kapalı, mesaj gönderilemiyor.', 'err');
  try {
    const r = await conns.get(host)!.request<{ data: DmInfo }>({ t: 'dm.open', to: uid, rid: '' });
    if (r?.data) upsertDm(host, r.data);
    set({ modal: null, popout: null, menu: null });
    selectCommunity(cid);
  } catch (e: any) {
    toast(oldHubMsg(e) || e?.message || 'Özel mesaj açılamadı.', 'err');
  }
}

/** Özel mesajı listenin üstüne sabitler / sabitlemeyi kaldırır (v1.26) */
export function togglePinDm(cid: ID) {
  const list = S().settings.pinnedDms;
  updateSettings({ pinnedDms: list.includes(cid) ? list.filter((x) => x !== cid) : [...list, cid] });
}

export function closeDm(cid: ID) {
  if (S().settings.pinnedDms.includes(cid)) togglePinDm(cid);
  // listeden gizler; yeni mesaj gelirse yeniden görünür
  set((s) => ({ current: s.current === cid ? 'home' : s.current }));
  const ch = S().chanByComm[cid];
  if (ch) markRead(ch);
  const hidden = { ...hiddenDms(), [cid]: S().communities[cid]?.dmLast || '' };
  localStorage.setItem('kovan.dmHidden', JSON.stringify(hidden));
  set((s) => ({ communities: { ...s.communities } }));
}

export function hiddenDms(): Record<ID, string> {
  try {
    return JSON.parse(localStorage.getItem('kovan.dmHidden') || '{}');
  } catch {
    return {};
  }
}

export const isDmHidden = (c: Community, hidden = hiddenDms()) => c.id in hidden && (c.dmLast || '') <= hidden[c.id];


export function sortedChannels(c: Community) {
  const catPos = new Map(c.categories.map((x) => [x.id, x.position]));
  return [...c.channels].sort((a, b) => {
    const ca = a.categoryId ? (catPos.get(a.categoryId) ?? 999) : -1;
    const cb = b.categoryId ? (catPos.get(b.categoryId) ?? 999) : -1;
    if (ca !== cb) return ca - cb;
    const ta = isVoiceLike(a.type) ? 1 : 0, tb = isVoiceLike(b.type) ? 1 : 0;
    if (ta !== tb) return ta - tb;
    return a.position - b.position;
  });
}

function mentionsMe(m: Message, c: Community | undefined): boolean {
  const me = S().me.id;
  if (m.content.includes(`<@${me}>`)) return true;
  if (/@(everyone|here)\b/.test(m.content) && c && !S().settings.suppressEveryone.includes(c.id)) return true;
  if (c && m.content.includes('<@&')) {
    const mine = c.members.find((x) => x.userId === me)?.roles || [];
    if (mine.some((r) => m.content.includes(`<@&${r}>`))) return true;
  }
  if (m.replyTo) {
    const parent = S().chans[m.channelId]?.items.find((x) => x.id === m.replyTo);
    if (parent?.authorId === me) return true;
  }
  return false;
}

function isViewing(ch: ID) {
  const s = S();
  return s.focused && s.current !== 'home' && s.chanByComm[s.current] === ch && !document.hidden;
}

export function plainText(content: string, c?: Community) {
  const card = cardSummary(content);
  if (card) return card;
  const users = S().users;
  const media = mediaLabel(content);
  if (media) return media;
  const tool = toolSummary(content);
  if (tool) return tool;
  return content
    .replace(/<@&([\w-]+)>/g, (_, id) => '@' + (c?.roles.find((r) => r.id === id)?.name || 'rol'))
    .replace(/<@([\w-]+)>/g, (_, id) => '@' + (users[id]?.name || 'biri'))
    .replace(/<#(\w+)>/g, (_, id) => '#' + (c?.channels.find((x) => x.id === id)?.name || 'kanal'))
    .replace(/```[\s\S]*?```/g, '[kod]')
    .replace(/\|\|[\s\S]*?\|\|/g, '[spoiler]')
    .replace(/[*_~`>#]/g, '');
}

function onFrame(host: string, f: ServerFrame) {
  switch (f.t) {
    case 'ready': {
      set((s) => ({
        conns: { ...s.conns, [host]: { ...(s.conns[host] || { host, local: false }), status: 'online', hubId: f.hubId, hubName: f.hubName } },
        presence: { ...s.presence, ...f.presence },
        lastIds: { ...s.lastIds, ...f.lastIds },
        voice: { ...s.voice, ...f.voice },
      }));
      siteHooks.onFrame?.(f);
      actHooks.onReady?.(host, f);
      // özel mesaj gizliliği her bağlantıda bildirilir (eski sunucular yok sayar)
      conns.get(host)?.send({ t: 'privacy', dms: S().settings.dmPrivacy });
      // bu sunucudan gelen eski toplulukları temizle
      const dms = f.dms || [];
      const ids = new Set([...f.communities.map((c) => c.id), ...dms.map((d) => dmCid(d.peer.id))]);
      for (const [cid, h] of Object.entries(S().commHost)) if (h === host && !ids.has(cid)) removeCommunity(cid);
      for (const c of f.communities) upsertCommunity(host, c);
      set((s) => {
        const friends = { ...s.friends };
        for (const [id, x] of Object.entries(friends)) if (x.host === host) delete friends[id];
        for (const fi of f.friends || []) mergeFriend(friends, host, fi);
        return { friends, users: { ...s.users, ...Object.fromEntries((f.friends || []).map((x) => [x.user.id, s.users[x.user.id] || x.user])) } };
      });
      for (const d of dms) {
        upsertDm(host, d);
        if (S().chans[d.ch]?.loaded) refreshChannel(d.ch);
        // kapalıyken gelen özel mesajlar: en az bir okunmamış say (sol listede ve rozette görünsün)
        const st = S();
        if (d.lastId && d.lastId > (st.read[d.ch] || '') && !st.mentions[d.ch] && !isViewing(d.ch)) set((s) => ({ mentions: { ...s.mentions, [d.ch]: 1 } }));
      }
      updateBadge();
      // açık kanalların eksik mesajlarını tazele
      for (const c of f.communities)
        for (const ch of c.channels) {
          const st = S().chans[ch.id];
          if (st?.loaded) refreshChannel(ch.id);
        }
      // ilk açılışta yerel kovanda hiç topluluk yoksa karşılama lobisi kur
      const conn = S().conns[host];
      // (eski sürümde yerel lobisi kurulmuş kişilere ikinci bir lobi açılmaz; onlar taşıyabilir)
      if (conn?.home && f.communities.length === 0 && !localStorage.getItem('kovan.seeded')) {
        localStorage.setItem('kovan.seeded', '1');
        conns.get(host)?.request({ t: 'comm.create', name: `${S().me.name || 'Benim'} Topluluğu`, color: '#c8aa6e', template: 'lobby' }).then((r: any) => {
          if (r?.data) selectCommunity(r.data);
        });
      }
      if (S().current === 'home') {
        const order = S().settings.railOrder.filter((x) => S().communities[x] && !S().communities[x].dm);
        if (order.length && !sessionStorage.getItem('kovan.started')) {
          sessionStorage.setItem('kovan.started', '1');
          selectCommunity(order[0]);
        }
      }
      return;
    }
    case 'comm':
      upsertCommunity(host, f.c, f.lastIds);
      return;
    case 'dm':
      upsertDm(host, f.dm);
      return;
    case 'friend': {
      const prev = S().friends[f.f.user.id];
      set((s) => {
        const friends = { ...s.friends };
        mergeFriend(friends, host, f.f);
        return { friends, users: { ...s.users, [f.f.user.id]: s.users[f.f.user.id] || f.f.user } };
      });
      const now = S().friends[f.f.user.id];
      if (now?.state === 'in' && prev?.state !== 'in') {
        if (S().settings.sounds) playSound('mention');
        window.kovan.notify({ title: 'Arkadaşlık isteği', body: `${f.f.user.name} seni arkadaş olarak eklemek istiyor.`, tag: 'friends', silent: true });
        updateBadge();
      } else if (now?.state === 'ok' && prev?.state === 'out') toast(`${f.f.user.name} arkadaşlık isteğini kabul etti.`, 'ok');
      updateBadge();
      return;
    }
    case 'friend.del':
      set((s) => (s.friends[f.uid]?.host === host ? { friends: omit(s.friends, f.uid) } : {}));
      updateBadge();
      return;
    case 'comm.moved': {
      // topluluk merkezi sunucuya taşındı: buradaki kopyayı bırak, sunucudakini kullan
      if (S().commHost[f.cid] === host) removeCommunity(f.cid);
      if (/^https:\/\//i.test(f.host) || f.host === homeHost()) {
        ensureConn(f.host);
        saveHosts();
      }
      return;
    }
    case 'comm.del': {
      const c = S().communities[f.cid];
      removeCommunity(f.cid);
      if (c) toast(`"${c.name}" topluluğundan ayrıldın.`, 'info');
      return;
    }
    case 'msg': {
      const m = f.m;
      const st = S();
      const cid = st.chanComm[m.channelId];
      const c = cid ? st.communities[cid] : undefined;
      set((s) => {
        const ch = s.chans[m.channelId];
        let chans = s.chans;
        if (ch) {
          let items = ch.items;
          const pi = f.nonce ? items.findIndex((x) => x.nonce === f.nonce) : -1;
          if (pi >= 0) {
            items = items.slice();
            items[pi] = m;
          } else if (!ch.detached && !items.some((x) => x.id === m.id)) items = [...items, m];
          chans = { ...chans, [m.channelId]: { ...ch, items } };
        }
        const typing = s.typing[m.channelId]?.[m.authorId] ? { ...s.typing, [m.channelId]: omit(s.typing[m.channelId], m.authorId) } : s.typing;
        // özel mesajda sohbeti listenin en üstüne taşımak için son mesajı işaretle
        const communities = c?.dm ? { ...s.communities, [c.id]: { ...s.communities[c.id], dmLast: m.id } } : s.communities;
        return { chans, typing, communities, lastIds: { ...s.lastIds, [m.channelId]: m.id } };
      });
      if (m.authorId === st.me.id) {
        markRead(m.channelId);
        return;
      }
      if (isViewing(m.channelId)) {
        markRead(m.channelId);
        return;
      }
      const mentioned = !!c?.dm || mentionsMe(m, c);
      if (mentioned) set((s) => ({ mentions: { ...s.mentions, [m.channelId]: (s.mentions[m.channelId] || 0) + 1 } }));
      updateBadge();
      notifyFor(m, c, mentioned);
      return;
    }
    case 'msg.upd':
      set((s) => {
        const ch = s.chans[f.m.channelId];
        if (!ch) return {};
        const i = ch.items.findIndex((x) => x.id === f.m.id);
        if (i < 0) return {};
        const items = ch.items.slice();
        items[i] = f.m;
        return { chans: { ...s.chans, [f.m.channelId]: { ...ch, items } } };
      });
      return;
    case 'msg.del':
      set((s) => {
        const ch = s.chans[f.ch];
        if (!ch) return {};
        return { chans: { ...s.chans, [f.ch]: { ...ch, items: ch.items.filter((x) => x.id !== f.id) } } };
      });
      return;
    case 'typing':
      set((s) => ({ typing: { ...s.typing, [f.ch]: { ...(s.typing[f.ch] || {}), [f.uid]: Date.now() + 8000 } } }));
      return;
    case 'presence':
      set((s) => ({ presence: { ...s.presence, [f.uid]: f.status } }));
      actHooks.onPresence?.(f);
      return;
    case 'user':
      set((s) => {
        const communities = { ...s.communities };
        for (const c of Object.values(communities)) if (c.users[f.u.id]) communities[c.id] = { ...c, users: { ...c.users, [f.u.id]: f.u } };
        return { users: { ...s.users, [f.u.id]: f.u }, communities };
      });
      return;
    case 'vc': {
      const before = S().voice[f.ch] || [];
      set((s) => ({ voice: { ...s.voice, [f.ch]: f.members } }));
      const dmC = S().communities[S().chanComm[f.ch]];
      if (dmC?.dm) callWatch(dmC, f.ch, before, f.members);
      voiceHooks.onRoom?.(host, f.ch, f.members);
      return;
    }
    case 'web':
      siteHooks.onFrame?.(f);
      return;
    case 'vc.you':
      voiceHooks.onYou?.(host, f.sessionId);
      return;
    case 'vc.signal':
      voiceHooks.onSignal?.(host, f.from, f.data);
      return;
    case 'sp.snap':
    case 'sp.add':
    case 'sp.del':
    case 'sp.mv':
    case 'sp.say':
    case 'sp.emote':
    case 'sp.booths':
    case 'sp.look':
      spaceHooks.onFrame?.(host, f);
      return;
    case 'bots':
      for (const cb of botHooks) cb(f);
      return;
    case 'err':
      if (f.nonce) {
        set((s) => {
          const chans = { ...s.chans };
          for (const [id, ch] of Object.entries(chans)) {
            const i = ch.items.findIndex((x) => x.nonce === f.nonce);
            if (i >= 0) {
              const items = ch.items.slice();
              items[i] = { ...items[i], pending: false, failed: true };
              chans[id] = { ...ch, items };
            }
          }
          return { chans };
        });
      }
      toast(f.msg, 'err');
      return;
  }
}

// ---------------------------------------------------------------------------
// özel aramalar: karşı taraf aramaya girince (ben yokken) çalar
let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringStop: ReturnType<typeof setTimeout> | null = null;

function stopRing() {
  if (ringTimer) clearInterval(ringTimer);
  if (ringStop) clearTimeout(ringStop);
  ringTimer = ringStop = null;
  if (S().ringing) set({ ringing: null });
}

export const dismissCall = stopRing;

function callWatch(c: Community, ch: ID, before: VoiceMember[], now: VoiceMember[]) {
  const me = S().me.id;
  const peer = c.dm!;
  const peerIn = now.some((m) => m.userId === peer);
  const meIn = now.some((m) => m.userId === me);
  const wasPeerIn = before.some((m) => m.userId === peer);
  const ringing = S().ringing;
  if (ringing?.ch === ch && (!peerIn || meIn)) stopRing();
  if (peerIn && !wasPeerIn && !meIn && !S().settings.blocked.includes(peer)) {
    if (S().me.status === 'dnd') return;
    stopRing();
    set({ ringing: { cid: c.id, ch, from: peer } });
    const ring = () => S().settings.sounds && playSound('ring', 0.16);
    ring();
    ringTimer = setInterval(ring, 2400);
    ringStop = setTimeout(stopRing, 45_000);
    const name = S().users[peer]?.name || c.name;
    window.kovan.notify({ title: `${name} seni arıyor`, body: 'Özel aramaya katılmak için tıkla.', tag: ch, silent: true });
  }
}

/** Botlar sekmesi canlı güncellemeleri dinler */
export const botHooks = new Set<(f: Extract<ServerFrame, { t: 'bots' }>) => void>();
export const spaceHooks: { onFrame?: (host: string, f: ServerFrame) => void } = {};
export const siteHooks: { onFrame?: (f: ServerFrame) => void } = {};
/** v1.27 oyun içi kaplama: bildirime düşen her mesaj (lib/overlay.ts) */
export const overlayHooks: { onNotify?: (m: Message, c: Community | undefined, author: string, body: string, mentioned: boolean) => void } = {};
/** anlık etkinlik (lib/activity.ts) */
export const actHooks: {
  onReady?: (host: string, f: Extract<ServerFrame, { t: 'ready' }>) => void;
  onPresence?: (f: Extract<ServerFrame, { t: 'presence' }>) => void;
} = {};
/** Tüm bağlı sunuculara çerçeve gönderir */
export const sendAll = (f: ClientFrame) => conns.forEach((c) => c.send(f));
export const sendHost = (host: string, f: ClientFrame) => conns.get(host)?.send(f);

export const voiceHooks: {
  onRoom?: (host: string, ch: ID, members: VoiceMember[]) => void;
  onYou?: (host: string, sid: ID) => void;
  onSignal?: (host: string, from: ID, data: any) => void;
} = {};

const omit = <T extends object>(o: T, k: string): T => {
  const c = { ...o } as any;
  delete c[k];
  return c;
};

/** Kanal > topluluk > genel sırasıyla bildirim seviyesi */
export function notifyLevel(cid: ID | undefined, ch: ID): NotifyLevel {
  const { settings } = S();
  if (settings.mutedIds.includes(ch) || (cid && settings.mutedIds.includes(cid))) return 'none';
  return settings.notifyOverrides[ch] || (cid && settings.notifyOverrides[cid]) || settings.notify;
}

export function isMuted(id: ID) {
  return S().settings.mutedIds.includes(id);
}

export function toggleMuted(id: ID) {
  const list = S().settings.mutedIds;
  updateSettings({ mutedIds: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
}

export function setNotifyOverride(id: ID, level: NotifyLevel | null) {
  const o = { ...S().settings.notifyOverrides };
  if (level) o[id] = level;
  else delete o[id];
  updateSettings({ notifyOverrides: o });
}

function notifyFor(m: Message, c: Community | undefined, mentioned: boolean) {
  const { settings, me } = S();
  const level = notifyLevel(c?.id, m.channelId);
  if (me.status === 'dnd' || level === 'none') return;
  if (level === 'mentions' && !mentioned) return;
  if (settings.blocked.includes(m.authorId)) return;
  const ch = c?.channels.find((x) => x.id === m.channelId);
  const author = c?.members.find((x) => x.userId === m.authorId)?.nick || S().users[m.authorId]?.name || 'Biri';
  if (m.kind === 'join') return;
  if (m.content.startsWith('xn:wall ')) return; // ortak duvara çizim/çıkartma bildirim düşürmez
  if (c?.dm && settings.blocked.includes(c.dm)) return;
  const body = !settings.notifyPreview ? 'Yeni mesaj' : plainText(m.content, c) || (m.attachments?.length ? `📎 ${m.attachments.length} dosya` : '');
  if (settings.sounds) playSound(mentioned ? 'mention' : 'message');
  const title = c?.dm ? `${author} (özel mesaj)` : `${author} (#${ch?.name || 'kanal'}, ${c?.name || ''})`;
  overlayHooks.onNotify?.(m, c, author, body, mentioned);
  window.kovan.notify({ title, body, tag: m.channelId, silent: true });
}

function updateBadge() {
  const total = Object.values(S().mentions).reduce((a, b) => a + b, 0) + pendingIn(S().friends);
  window.kovan.badge(total);
}

// ---------------------------------------------------------------------------
// gezinme
export function setHomeTab(tab: State['homeTab']) {
  set({ homeTab: tab, current: 'home' });
}

export function selectCommunity(cid: ID | 'home') {
  set({ current: cid, editing: null });
  if (cid !== 'home') {
    const ch = S().chanByComm[cid];
    if (ch) openChannel(ch);
  }
}

export function selectChannel(cid: ID, ch: ID) {
  set((s) => ({ current: cid, chanByComm: { ...s.chanByComm, [cid]: ch }, editing: null }));
  openChannel(ch);
}

/** kanal açılmadan hemen önceki okunma noktası ("YENİ" çizgisi ve "Sen yokken" özeti için) */
export const readBeforeOpen: Record<ID, ID> = {};

function openChannel(ch: ID) {
  const st = S().chans[ch];
  readBeforeOpen[ch] = S().read[ch] || '';
  if (!st?.loaded && !st?.loading) loadHistory(ch);
  markRead(ch);
}

export function markRead(ch: ID) {
  const s = S();
  const last = s.lastIds[ch];
  const changed = (last && s.read[ch] !== last) || s.mentions[ch];
  if (!changed) return;
  set((x) => ({ read: last ? { ...x.read, [ch]: last } : x.read, mentions: x.mentions[ch] ? omit(x.mentions, ch) : x.mentions }));
  readSaver();
  updateBadge();
}

export function markCommunityRead(cid: ID) {
  const c = S().communities[cid];
  if (!c) return;
  for (const ch of c.channels) markRead(ch.id);
}

export async function loadHistory(ch: ID, before?: ID) {
  const conn = connFor(ch);
  const cur = S().chans[ch];
  if (!conn || cur?.loading) return;
  set((s) => ({ chans: { ...s.chans, [ch]: Object.assign({ items: [], more: true, loaded: false, prepended: 0 }, s.chans[ch], { loading: true }) } }));
  try {
    const r = await conn.request<{ msgs: Message[]; more: boolean }>({ t: 'hist', ch, before, rid: '' });
    set((s) => {
      const prev = s.chans[ch];
      let items: CMessage[];
      let prepended = prev?.prepended || 0;
      if (before && prev) {
        const ids = new Set(prev.items.map((x) => x.id));
        const older = r.msgs.filter((x) => !ids.has(x.id));
        items = [...older, ...prev.items];
        prepended += older.length;
      } else {
        const pend = prev?.items.filter((x) => x.pending) || [];
        items = [...r.msgs, ...pend];
      }
      return { chans: { ...s.chans, [ch]: { items, more: r.more, loaded: true, loading: false, prepended } } };
    });
  } catch {
    set((s) => ({ chans: { ...s.chans, [ch]: { ...s.chans[ch], loading: false } } }));
  }
}

/** Yeniden bağlanınca kaçırılan mesajları tamamla */
async function refreshChannel(ch: ID) {
  const conn = connFor(ch);
  if (!conn) return;
  try {
    const r = await conn.request<{ msgs: Message[]; more: boolean }>({ t: 'hist', ch, rid: '' });
    set((s) => {
      const prev = s.chans[ch];
      if (!prev) return {};
      const map = new Map(prev.items.filter((x) => !x.pending).map((x) => [x.id, x]));
      const first = r.msgs[0]?.id;
      // en son sayfayla örtüşmüyorsa listeyi sıfırla
      if (first && !map.has(first) && prev.items.length && prev.items[prev.items.length - 1].id > first) {
        for (const m of r.msgs) map.set(m.id, m);
      } else if (first && !map.has(first)) {
        return { chans: { ...s.chans, [ch]: { items: r.msgs, more: r.more, loaded: true, loading: false, prepended: 0, epoch: (prev.epoch || 0) + 1 } } };
      } else for (const m of r.msgs) map.set(m.id, m);
      // sayfadaki aralıkta olup artık olmayanları sil
      if (first) for (const id of [...map.keys()]) if (id >= first && !r.msgs.some((m) => m.id === id)) map.delete(id);
      const items = [...map.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
      return { chans: { ...s.chans, [ch]: { ...prev, items } } };
    });
  } catch {
    /* sonra tekrar denenir */
  }
}

// ---------------------------------------------------------------------------
// mesaj işlemleri
export function sendMessage(ch: ID, content: string, attachments?: Attachment[]) {
  const conn = connFor(ch);
  const s = S();
  const replyTo = s.replyTo[ch];
  const nonce = makeId();
  const local: CMessage = { id: '~' + nonce, channelId: ch, authorId: s.me.id, content, ts: Date.now(), nonce, pending: true, replyTo, attachments };
  set((x) => {
    const st = x.chans[ch] || { items: [], more: false, loaded: true, loading: false, prepended: 0 };
    return { chans: { ...x.chans, [ch]: { ...st, items: [...st.items, local] } }, replyTo: { ...x.replyTo, [ch]: undefined } };
  });
  const ok = conn?.send({ t: 'send', ch, nonce, content, replyTo, attachments });
  if (!ok) {
    setTimeout(() => onFrame(conn?.host || '', { t: 'err', msg: 'Gönderilemedi: sunucuya bağlı değilsin.', nonce }), 50);
  }
  lastTyping = 0;
}

export function retryMessage(m: CMessage) {
  set((s) => {
    const ch = s.chans[m.channelId];
    return { chans: { ...s.chans, [m.channelId]: { ...ch, items: ch.items.filter((x) => x !== m) } } };
  });
  if (m.replyTo) set((s) => ({ replyTo: { ...s.replyTo, [m.channelId]: m.replyTo } }));
  sendMessage(m.channelId, m.content, m.attachments);
}

export function discardMessage(m: CMessage) {
  set((s) => {
    const ch = s.chans[m.channelId];
    return { chans: { ...s.chans, [m.channelId]: { ...ch, items: ch.items.filter((x) => x !== m) } } };
  });
}

export const editMessage = (ch: ID, id: ID, content: string) => connFor(ch)?.send({ t: 'edit', ch, id, content });
export const deleteMessage = (ch: ID, id: ID) => connFor(ch)?.send({ t: 'del', ch, id });
export const pinMessage = (ch: ID, id: ID, on: boolean) => connFor(ch)?.send({ t: 'pin', ch, id, on });

export function toggleReaction(m: Message, e: string) {
  const me = S().me.id;
  const on = !m.reactions?.[e]?.includes(me);
  // iyimser güncelleme
  set((s) => {
    const ch = s.chans[m.channelId];
    if (!ch) return {};
    const items = ch.items.map((x) => {
      if (x.id !== m.id) return x;
      const reactions = { ...(x.reactions || {}) };
      const arr = reactions[e] || [];
      if (on) reactions[e] = [...arr, me];
      else {
        const n = arr.filter((u) => u !== me);
        if (n.length) reactions[e] = n;
        else delete reactions[e];
      }
      return { ...x, reactions };
    });
    return { chans: { ...s.chans, [m.channelId]: { ...ch, items } } };
  });
  connFor(m.channelId)?.send({ t: 'react', ch: m.channelId, id: m.id, e, on });
  rememberEmoji(e);
}

export function rememberEmoji(e: string) {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem('kovan.recentEmoji') || '[]');
    localStorage.setItem('kovan.recentEmoji', JSON.stringify([e, ...arr.filter((x) => x !== e)].slice(0, 24)));
  } catch {
    /* yoksay */
  }
}
export function recentEmoji(): string[] {
  try {
    return JSON.parse(localStorage.getItem('kovan.recentEmoji') || '[]');
  } catch {
    return [];
  }
}

let lastTyping = 0;
export function sendTyping(ch: ID) {
  if (!S().settings.sendTyping) return;
  const now = Date.now();
  if (now - lastTyping < 4000) return;
  lastTyping = now;
  connFor(ch)?.send({ t: 'typing', ch });
}

export function cmd(cidOrCh: ID, f: ClientFrame) {
  const c = connFor(cidOrCh);
  if (!c?.send(f)) toast('Sunucuya bağlı değil.', 'err');
}

export function request<T = any>(cidOrCh: ID, f: ClientFrame): Promise<T> {
  const c = connFor(cidOrCh);
  if (!c) return Promise.reject(new Error('Sunucu bulunamadı'));
  return c.request<T>(f);
}

export async function uploadFile(cid: ID, file: File, w?: number, h?: number): Promise<Attachment> {
  const s = S();
  const base = hostHttp(cid);
  const headers: Record<string, string> = {
    'content-type': file.type || 'application/octet-stream',
    'x-kovan-user': s.me.id,
    'x-kovan-secret': s.secret,
    'x-kovan-name': encodeURIComponent(file.name || 'dosya'),
  };
  if (w && h) {
    headers['x-kovan-w'] = String(w);
    headers['x-kovan-h'] = String(h);
  }
  const r = await fetch(`${base}/upload`, { method: 'POST', headers, body: file });
  if (r.status === 413) throw new Error('Dosya çok büyük (en fazla 25 MB).');
  if (!r.ok) throw new Error('Yükleme başarısız (' + r.status + ')');
  return r.json();
}

// ---------------------------------------------------------------------------
// profil / durum
export function setStatus(status: Status, auto = false) {
  set((s) => ({ me: { ...s.me, status } }));
  conns.forEach((c) => c.send({ t: 'presence', status }));
  if (!auto) window.kovan.setConfig({ profile: { status } });
}

export async function updateProfile(p: Partial<Pick<Profile, 'name' | 'color' | 'avatar' | 'bio' | 'extra'>>) {
  const me = { ...S().me, ...p };
  if ('extra' in p) me.extra = sanitizeProfile(p.extra);
  set({ me });
  await window.kovan.setConfig({ profile: { name: me.name, color: me.color, avatar: me.avatar ?? '', bio: me.bio ?? '', extra: me.extra ?? null } });
  conns.forEach((c) => c.send({ t: 'profile', user: meAsUser(me) }));
}

/** Kendi profilimizi herkese görünen kullanıcı biçimine çevirir. */
export function meAsUser(me: Profile = S().me): UserPublic {
  return { id: me.id, name: me.name, color: me.color, avatar: me.avatar || undefined, bio: me.bio || undefined, profile: me.extra };
}

// ---------------------------------------------------------------------------
// topluluklar
/** Bilgisayardaki topluluğu merkezi sunucuya taşır */
export async function moveToServer(cid: ID) {
  const home = homeHost();
  ensureConn(home);
  await waitOnline(home);
  const r = await window.kovan.migrate(cid, home);
  if (!r.ok) throw new Error(r.error || 'Taşınamadı.');
  return r;
}

export async function createCommunity(name: string, color: string, icon?: string, blueprint?: Blueprint) {
  const home = homeHost();
  const conn = conns.get(home);
  if (!conn) throw new Error('Sunucuya bağlanılmadı.');
  await waitOnline(home);
  const r = await conn.request<{ data: ID }>({ t: 'comm.create', name, color, icon, ...(blueprint ? { blueprint } : {}) });
  selectCommunity(r.data);
  return r.data;
}

/** v1.27: merkezi sunucuya istek (keşfet listesi, listeden katılma) */
export async function homeRequest<T = any>(f: ClientFrame): Promise<T> {
  const home = homeHost();
  const conn = ensureConn(home, home === localHost());
  await waitOnline(home);
  return conn.request<T>(f);
}

export interface InviteHostOption {
  host: string; // "ip:port" ya da "alan.adi:port"
  label: string;
}

/** Davette kullanılabilecek adresler; ilki önerilen */
export function inviteHostOptions(cid: ID): InviteHostOption[] {
  const host = S().commHost[cid];
  return host ? hostOptions(host) : [];
}

export function hostOptions(host: string): InviteHostOption[] {
  const s = S();
  if (host !== localHost()) return [{ host, label: 'Topluluğun sunucusu' }];
  const port = s.info?.hubPort || 47820;
  const out: InviteHostOption[] = [];
  const pub = s.settings.publicAddress.trim();
  if (pub) out.push({ host: pub.includes(':') ? pub : `${pub}:${port}`, label: 'İnternet (dış adres)' });
  const kind = (ip: string) =>
    /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
      ? { rank: /^192\.168\./.test(ip) ? 0 : 1, label: 'Ev / okul ağı' }
      : /^26\./.test(ip)
        ? { rank: 2, label: 'Radmin VPN' }
        : /^25\./.test(ip)
          ? { rank: 2, label: 'Hamachi' }
          : /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)
            ? { rank: 2, label: 'Tailscale' }
            : { rank: 3, label: 'Diğer ağ' };
  const lan = [...(s.info?.lan || [])].sort((a, b) => kind(a).rank - kind(b).rank);
  for (const ip of lan) out.push({ host: `${ip}:${port}`, label: kind(ip).label });
  return out;
}

export function makeInvite(cid: ID, hostPick?: string): string {
  const s = S();
  const c = s.communities[cid];
  const host = s.commHost[cid];
  if (!host) return '';
  const opts = inviteHostOptions(cid);
  // merkezi sunucudaki topluluk: "xanaphian/s3gas25"
  if (host === homeHost()) return c?.inviteCode ? `${INVITE_PREFIX}/${c.inviteCode}` : '';
  if (c?.inviteCode && opts.length) {
    const want = hostPick || s.settings.inviteHost;
    const h = opts.find((o) => o.host === want)?.host || opts[0].host;
    return `${encodeHostToken(h)}/${c.inviteCode}`;
  }
  // eski sunucular: uzun kod
  if (!c?.inviteKey) return '';
  return encodeInvite({ h: opts.map((o) => o.host), c: cid, k: c.inviteKey });
}

async function joinShort(tokenHost: string | null, code: string, prefix?: string): Promise<ID> {
  const s = S();
  const own = (h: string) => {
    const [ip, port] = h.split(':');
    return Number(port) === s.info?.hubPort && (ip === '127.0.0.1' || (s.info?.lan || []).includes(ip)) ? localHost() : h;
  };
  // aday adresler: davet adı rehberden çözülür, ön ek bir adres de olabilir
  const cands: string[] = [];
  // "xanaphian/kod" ya da yalnızca kod: merkezi sunucu
  if (!tokenHost && (!prefix || HOME_PREFIXES.has(prefix))) cands.push(homeHost());
  if (tokenHost) cands.push(own(tokenHost));
  const uniq = [...new Set(cands)];
  let host: string | null = null;
  if (uniq.includes(localHost())) host = localHost();
  else if (uniq.length) {
    // hepsini aynı anda dene, sıradaki ilk ulaşılabilir olanı seç
    const ok = await Promise.all(uniq.map((h) => probeHost(h).then((x) => !!x).catch(() => false)));
    host = uniq.find((_, i) => ok[i]) || null;
  }
  const triedSomething = uniq.length > 0;
  const tryHost = async (h: string) => {
    const conn = ensureConn(h, h === localHost());
    saveHosts();
    await waitOnline(h);
    const r = await conn.request<{ data: ID }>({ t: 'join', code }).catch((e) => {
      if (h === homeHost() && !prefix?.includes('.')) throw new Error(e?.message === 'Zaman aşımı' ? 'Sunucu yanıt vermedi.' : 'Bu davet kodu geçersiz ya da süresi dolmuş.');
      throw e;
    });
    if (r.data.startsWith('@')) {
      // arkadaş kodu: arkadaş eklendi, sohbeti aç
      const uid = r.data.slice(1);
      toast(`${S().users[uid]?.name || 'Kişi'} artık arkadaşın.`, 'ok');
      openDm(uid);
      return r.data;
    }
    selectCommunity(r.data);
    return r.data;
  };
  if (host === homeHost()) return tryHost(host);
  if (host) return tryHost(host);
  // adres ulaşılamadıysa ya da yalnızca kod verildiyse: bağlı olduğumuz sunuculara sor
  for (const [h, c] of Object.entries(S().conns)) {
    if (c.status !== 'online' || h === host) continue;
    try {
      return await tryHost(h);
    } catch {
      /* bu sunucuda değil */
    }
  }
  throw new Error(
    triedSomething
        ? "Davetin sahibine ulaşılamadı. Aynı ağda (ya da aynı Radmin/Hamachi ağında) olduğunuzdan, internetten bağlanıyorsan onun modeminde portun yönlendirildiğinden ve Xanaphian'ının açık olduğundan emin ol."
        : 'Bu kod bağlı olduğun sunucularda bulunamadı. Kodu adresiyle birlikte (ör. 2ld8x1k/s3gas25) yapıştır.',
  );
}

export async function joinByInvite(code: string): Promise<ID> {
  const short = parseShortInvite(code);
  if (short) return joinShort(short.host, short.code, short.prefix);
  const d = decodeInvite(code);
  if (!d) throw new Error('Davet kodu okunamadı.');
  const s = S();
  if (s.communities[d.c]) {
    selectCommunity(d.c);
    return d.c;
  }
  // aynı makinedeki kendi kovanımız mı?
  const ownPort = s.info?.hubPort;
  let host: string | null = null;
  const localIps = new Set([...(s.info?.lan || [])]);
  for (const h of d.h) {
    const [ip, port] = h.split(':');
    if (localIps.has(ip) && Number(port) === ownPort) host = localHost();
  }
  if (!host) {
    const results = await Promise.all(d.h.map(async (h) => ((await probeHost(h)) ? h : null)));
    host = results.find(Boolean) || null;
  }
  if (!host) throw new Error('Davetin sahibine ulaşılamadı. Aynı ağda olduğunuzdan ve onun Xanaphian\'ının açık olduğundan emin ol.');
  const conn = ensureConn(host, host === localHost());
  saveHosts();
  await waitOnline(host);
  const r = await conn.request<{ data: ID }>({ t: 'join', cid: d.c, key: d.k });
  selectCommunity(r.data);
  return r.data;
}

function waitOnline(host: string, timeout = 8000) {
  return new Promise<void>((resolve, reject) => {
    if (S().conns[host]?.status === 'online') return resolve();
    const t = setTimeout(() => {
      unsub();
      reject(new Error('Sunucuya bağlanılamadı.'));
    }, timeout);
    const unsub = useStore.subscribe((st) => {
      if (st.conns[host]?.status === 'online') {
        clearTimeout(t);
        unsub();
        resolve();
      }
    });
  });
}

export function leaveCommunity(cid: ID) {
  cmd(cid, { t: 'comm.leave', cid });
  removeCommunity(cid);
}

export function deleteCommunity(cid: ID) {
  cmd(cid, { t: 'comm.delete', cid });
}

export interface ModData {
  bans: Ban[];
  audit: AuditEntry[];
}

export async function loadModData(cid: ID): Promise<ModData> {
  const r = await request<{ data: ModData }>(cid, { t: 'mod.list', cid, rid: '' });
  return r.data || { bans: [], audit: [] };
}

export function forgetHost(host: string) {
  const c = conns.get(host);
  c?.close();
  conns.delete(host);
  for (const [cid, h] of Object.entries(S().commHost)) if (h === host) removeCommunity(cid);
  set((s) => ({ conns: omit(s.conns, host) }));
  saveHosts();
}

// Bellek: ekrandan çıkan kanalın yalnız son mesajları tutulur; geri dönülünce eskiler kaydırdıkça yeniden yüklenir.
// (Uzun bir oturumda gezilen her kanalın tüm geçmişi bellekte birikmesin.)
const KEEP_HIDDEN = 120;
let shownCh: ID | undefined;
useStore.subscribe((s) => {
  const now = s.current !== 'home' ? s.chanByComm[s.current] : undefined;
  if (now === shownCh) return;
  const prev = shownCh;
  shownCh = now;
  const st = prev ? s.chans[prev] : undefined;
  if (!prev || !st || st.loading || st.detached || st.items.length <= KEEP_HIDDEN * 2) return;
  set((x) => {
    const cur = x.chans[prev];
    if (!cur || cur.loading || cur.detached) return {};
    return { chans: { ...x.chans, [prev]: { ...cur, items: cur.items.slice(-KEEP_HIDDEN), more: true, prepended: 0, epoch: (cur.epoch || 0) + 1 } } };
  });
});

// yazıyor göstergelerinin süresi dolanlarını temizle
setInterval(() => {
  const now = Date.now();
  const t = S().typing;
  let changed = false;
  const next: State['typing'] = {};
  for (const [ch, users] of Object.entries(t)) {
    const u: Record<ID, number> = {};
    for (const [id, exp] of Object.entries(users)) if (exp > now) u[id] = exp;
      else changed = true;
    if (Object.keys(u).length) next[ch] = u;
    else if (Object.keys(users).length) changed = true;
  }
  if (changed) set({ typing: next });
}, 2000);

export function openMenu(e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) {
  e.preventDefault?.();
  set({ menu: { x: e.clientX, y: e.clientY, items } });
}

export function openModal(m: Modal | null) {
  set({ modal: m, menu: null });
}

export function confirmDialog(title: string, body: string, onConfirm: () => void, confirmText = 'Onayla', danger = true) {
  openModal({ type: 'confirm', title, body, onConfirm, confirmText, danger });
}

export function jumpToPresent(ch: ID) {
  set((s) => ({ chans: { ...s.chans, [ch]: { items: [], more: true, loaded: false, loading: false, prepended: 0, epoch: (s.chans[ch]?.epoch || 0) + 1 } } }));
  loadHistory(ch);
}

export function jumpToMessage(cid: ID, ch: ID, id: ID) {
  selectChannel(cid, ch);
  const st = S().chans[ch];
  if (!st?.items.some((x) => x.id === id)) {
    const conn = connFor(ch);
    conn?.request<{ msgs: Message[]; more: boolean }>({ t: 'hist', ch, around: id, rid: '' }).then((r) => {
      set((s) => ({ chans: { ...s.chans, [ch]: { items: r.msgs, more: r.more, loaded: true, loading: false, prepended: 0, epoch: (s.chans[ch]?.epoch || 0) + 1, detached: true } }, jumpTo: { ch, id, at: Date.now() } }));
    });
  } else set({ jumpTo: { ch, id, at: Date.now() } });
}
