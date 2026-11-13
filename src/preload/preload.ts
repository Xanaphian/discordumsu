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
  setTheme: (theme: string) => ipcRenderer.send('win:overlay', theme),
  notify: (n: { title: string; body: string; tag: string; silent?: boolean }) => ipcRenderer.send('notify', n),
  badge: (count: number) => ipcRenderer.send('badge', count),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  quit: () => ipcRenderer.send('app:quit'),
  onInvite: (cb: (code: string) => void) => on('invite', cb),
  onNotifyClick: (cb: (tag: string) => void) => on('notify:click', cb),
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
