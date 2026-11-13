import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

function on<T>(channel: string, cb: (v: T) => void) {
  const h = (_e: IpcRendererEvent, v: T) => cb(v);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}

const api = {
  info: () => ipcRenderer.invoke('app:info'),
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (patch: unknown) => ipcRenderer.invoke('cfg:set', patch),
  pendingInvite: () => ipcRenderer.invoke('app:pending-invite') as Promise<string | null>,
  /** Bilgisayardaki topluluğu merkezi sunucuya taşır */
  migrate: (cid: string, server: string) => ipcRenderer.invoke('hub:migrate', cid, server) as Promise<{ ok: boolean; error?: string; files?: number; failed?: number }>,
  setTheme: (theme: string) => ipcRenderer.send('win:overlay', theme),
  notify: (n: { title: string; body: string; tag: string; silent?: boolean }) => ipcRenderer.send('notify', n),
  badge: (count: number) => ipcRenderer.send('badge', count),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  quit: () => ipcRenderer.send('app:quit'),
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
  ptt: {
    configure: (cfg: { enabled: boolean; code: string }) => ipcRenderer.invoke('ptt:config', cfg) as Promise<boolean>,
    onChange: (cb: (down: boolean) => void) => on('ptt', cb),
  },
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
