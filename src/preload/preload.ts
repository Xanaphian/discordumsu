import { contextBridge, ipcRenderer, IpcRendererEvent, webFrame } from 'electron';
type SpotifyStatusT = { clientId: string; defaultClientId: boolean; connected: boolean; user?: string; error?: string; redirect: string };
import type { LinkMeta as LinkMetaT } from '../main/ekstralar';

function on<T>(channel: string, cb: (v: T) => void) {
  const h = (_e: IpcRendererEvent, v: T) => cb(v);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}

const api = {
  info: () => ipcRenderer.invoke('app:info'),
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (patch: unknown) => ipcRenderer.invoke('cfg:set', patch),
  /** Bu sunucuya gönderilecek gizli anahtar (asıl anahtar yalnız resmî sunucuya gider; diğerleri kendine özel türetilmiş anahtar alır) */
  hostSecret: (host: string) => ipcRenderer.sendSync('cfg:host-secret', host) as string,
  pendingInvite: () => ipcRenderer.invoke('app:pending-invite') as Promise<string | null>,
  /** Bilgisayardaki topluluğu merkezi sunucuya taşır */
  migrate: (cid: string, server: string) => ipcRenderer.invoke('hub:migrate', cid, server) as Promise<{ ok: boolean; error?: string; files?: number; failed?: number }>,
  setTheme: (theme: string) => ipcRenderer.send('win:overlay', theme),
  notify: (n: { title: string; body: string; tag: string; silent?: boolean }) => ipcRenderer.send('notify', n),
  badge: (count: number) => ipcRenderer.send('badge', count),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  quit: () => ipcRenderer.send('app:quit'),
  relaunch: () => ipcRenderer.send('app:relaunch'),
  installClaudeDesktop: (a: { name: string; url: string; token: string }) =>
    ipcRenderer.invoke('mcp:claude-desktop', a) as Promise<{ ok: boolean; files: string[]; error?: string }>,
  onInvite: (cb: (code: string) => void) => on('invite', cb),
  onNotifyClick: (cb: (tag: string) => void) => on('notify:click', cb),
  capture: {
    sources: () =>
      ipcRenderer.invoke('cap:sources') as Promise<{ id: string; name: string; kind: 'screen' | 'window'; thumb: string; icon: string; size: { w: number; h: number } | null }[]>,
    select: (sel: { id: string; audio: boolean } | null) => ipcRenderer.invoke('cap:select', sel),
  },
  inCall: (on: boolean) => ipcRenderer.send('win:in-call', on),
  /** pencere gerçekten görünüyor mu (küçültülmüş ya da tepsideyse false) */
  onVisible: (cb: (visible: boolean) => void) => ipcRenderer.on('win:gorunur', (_e, v: boolean) => cb(v)),
  ptt: {
    configure: (cfg: { enabled: boolean; code: string }) => ipcRenderer.invoke('ptt:config', cfg) as Promise<boolean>,
    onChange: (cb: (down: boolean) => void) => on('ptt', cb),
  },
  /** genel sustur / sağırlaştır tuşları (oyun öndeyken de çalışır) */
  keys: {
    configure: (cfg: { enabled: boolean; mute: string; deaf: string }) => ipcRenderer.invoke('keys:config', cfg) as Promise<boolean>,
    onPress: (cb: (action: 'mute' | 'deaf') => void) => on('keys:press', cb),
  },
  /** arayüz yakınlaştırması (uygulama menüsü olmadığından Ctrl+/- burada) */
  zoom: {
    set: (factor: number) => webFrame.setZoomFactor(Math.max(0.5, Math.min(2.5, factor || 1))),
    get: () => webFrame.getZoomFactor(),
  },
  activity: {
    configure: (c: unknown) => ipcRenderer.invoke('act:config', c),
    apps: () => ipcRenderer.invoke('act:apps'),
    onUpdate: (cb: (s: any) => void) => on('act:update', cb),
  },
  /** Spotify hesabından şu an çalanı okuma (PKCE, yalnız Client ID) */
  spotify: {
    status: () => ipcRenderer.invoke('spotify:status') as Promise<SpotifyStatusT>,
    connect: (clientId?: string) => ipcRenderer.invoke('spotify:connect', clientId) as Promise<SpotifyStatusT>,
    disconnect: () => ipcRenderer.invoke('spotify:disconnect') as Promise<SpotifyStatusT>,
  },
  game: {
    lolState: () => ipcRenderer.invoke('game:lol-state') as Promise<{ running: boolean; me?: string; lobby: boolean; lobbyId?: string; phase?: string; info?: { queueId?: number; mode: string; size: number; roles: boolean; members: { n: string; r?: string; r2?: string; lead?: boolean }[] } }>,
    lolInvite: (riotId: string) => ipcRenderer.invoke('game:lol-invite', riotId) as Promise<{ ok: boolean; error?: string }>,
    lolAccept: (from: string) => ipcRenderer.invoke('game:lol-accept', from) as Promise<{ ok: boolean; error?: string }>,
    steamJoin: (id: string) => ipcRenderer.invoke('game:steam-join', id) as Promise<boolean>,
    /** oyuna davet: bu bilgisayarda görülmüş oyun mu, aç */
    has: (name: string) => ipcRenderer.invoke('game:has', name) as Promise<boolean>,
    launch: (name: string) => ipcRenderer.invoke('game:launch', name) as Promise<{ ok: boolean; error?: string }>,
  },
  /** v1.26: bağlantı önizlemesi, yayıncı modu, ayrı pencereler */
  linkMeta: (url: string) => ipcRenderer.invoke('link:meta', url) as Promise<LinkMetaT | null>,
  streamer: {
    watch: (on: boolean) => ipcRenderer.invoke('yayinci:izle', on) as Promise<boolean>,
    state: (s: { active: boolean; hideNotifs: boolean }) => ipcRenderer.send('yayinci:durum', s),
    onObs: (cb: (on: boolean) => void) => on('yayinci:obs', cb),
  },
  popout: {
    open: (a: { cid: string; ch: string; title: string }) => ipcRenderer.send('pencere:ayir', a),
    toMain: (a: { cid: string; ch: string }) => ipcRenderer.send('pencere:ana', a),
    onGo: (cb: (a: { cid: string; ch: string }) => void) => on('pencere:git', cb),
    theme: (t: string) => ipcRenderer.send('pencere:tema', t),
  },
  /** v1.27 oyun içi kaplama */
  overlay: {
    state: (st: unknown) => ipcRenderer.send('ovl:state', st),
    message: (m: unknown) => ipcRenderer.send('ovl:msg', m),
    shortcut: (acc: string) => ipcRenderer.send('ovl:shortcut', acc),
    onState: (cb: (st: any) => void) => on('ovl:state', cb),
    onMessage: (cb: (m: any) => void) => on('ovl:msg', cb),
    onHidden: (cb: (hidden: boolean) => void) => on('ovl:hidden', cb),
  },
  /** v1.27 Discord şablonu */
  discordTemplate: (code: string) => ipcRenderer.invoke('tpl:discord', code) as Promise<{ ok: boolean; data?: unknown; error?: string }>,
  platform: process.platform,
  update: {
    check: () => ipcRenderer.invoke('upd:check'),
    download: () => ipcRenderer.invoke('upd:download'),
    install: () => ipcRenderer.invoke('upd:install'),
    state: () => ipcRenderer.invoke('upd:state'),
    onStatus: (cb: (s: unknown) => void) => on('upd:status', cb),
  },
};

contextBridge.exposeInMainWorld('kovan', api);
export type KovanApi = typeof api;
