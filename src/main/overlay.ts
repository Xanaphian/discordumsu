// v1.27 oyun içi kaplama: oyunun üstünde, köşede duran, tıklamaları geçiren saydam pencere.
// Ana pencere (renderer) durumu 'ovl:state' ile yollar; burada kaplama penceresine iletilir.
// Not: Windows'ta "kenarlıksız tam ekran" ve pencereli oyunların üstünde görünür. Özel (exclusive) tam ekran
// kipindeki oyunlar her şeyin üstünü kapladığı için orada görünmez; oyunun görüntü ayarından kenarlıksız seçilmeli.
import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'node:path';

export interface OverlayState {
  /** kaplama gösterilsin mi (ayar + oyun açık mı renderer'da hesaplanır) */
  show: boolean;
  corner: 'tl' | 'tr' | 'bl' | 'br';
  opacity: number; // 30-100
  scale: number; // 80-130
  [k: string]: unknown;
}

const W = 340;
const H = 520;
let ovl: BrowserWindow | null = null;
let last: OverlayState | null = null;
let ready = false;
let userHidden = false;
let shortcut = '';

function place() {
  if (!ovl || !last) return;
  const d = screen.getPrimaryDisplay().bounds; // oyun görev çubuğunu da kapladığı için workArea değil
  const k = (last.scale || 100) / 100;
  const w = Math.round(W * k), h = Math.round(H * k);
  const m = 16;
  const x = last.corner.endsWith('l') ? d.x + m : d.x + d.width - w - m;
  const y = last.corner.startsWith('t') ? d.y + m : d.y + d.height - h - m;
  ovl.setBounds({ x, y, width: w, height: h });
  ovl.webContents.setZoomFactor(k);
}

function ensure(isDev: boolean) {
  if (ovl && !ovl.isDestroyed()) return ovl;
  ready = false;
  ovl = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    alwaysOnTop: true,
    title: 'Xanaphian kaplama',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  ovl.setAlwaysOnTop(true, 'screen-saver');
  ovl.setIgnoreMouseEvents(true);
  ovl.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ovl.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ovl.webContents.on('will-navigate', (e) => e.preventDefault());
  ovl.webContents.once('did-finish-load', () => {
    ready = true;
    if (last) ovl?.webContents.send('ovl:state', last);
  });
  ovl.on('closed', () => (ovl = null));
  if (isDev && process.env.KOVAN_DEV_URL) ovl.loadURL(new URL('overlay.html', process.env.KOVAN_DEV_URL).toString());
  else ovl.loadFile(path.join(__dirname, '../renderer/overlay.html'));
  return ovl;
}

function apply(isDev: boolean) {
  const want = !!last?.show && !userHidden;
  if (!want) {
    if (ovl && !ovl.isDestroyed() && ovl.isVisible()) ovl.hide();
    return;
  }
  const w = ensure(isDev);
  place();
  w.setOpacity(Math.max(0.3, Math.min(1, (last!.opacity || 100) / 100)));
  if (ready) w.webContents.send('ovl:state', last);
  if (!w.isVisible()) w.showInactive();
  w.setAlwaysOnTop(true, 'screen-saver');
}

export function initOverlay(getMain: () => BrowserWindow | null, isDev: boolean) {
  ipcMain.on('ovl:state', (_e, st: OverlayState) => {
    last = st;
    apply(isDev);
  });
  ipcMain.on('ovl:msg', (_e, m: unknown) => {
    if (ovl && !ovl.isDestroyed() && ovl.isVisible() && ready) ovl.webContents.send('ovl:msg', m);
  });
  ipcMain.on('ovl:shortcut', (_e, acc: string) => {
    if (shortcut) globalShortcut.unregister(shortcut);
    shortcut = '';
    if (!acc) return;
    try {
      if (
        globalShortcut.register(acc, () => {
          userHidden = !userHidden;
          apply(isDev);
          getMain()?.webContents.send('ovl:hidden', userHidden);
        })
      )
        shortcut = acc;
    } catch {
      /* geçersiz kısayol */
    }
  });
  screen.on('display-metrics-changed', () => place());
}

export function destroyOverlay() {
  if (shortcut) globalShortcut.unregister(shortcut);
  if (ovl && !ovl.isDestroyed()) ovl.destroy();
  ovl = null;
}
