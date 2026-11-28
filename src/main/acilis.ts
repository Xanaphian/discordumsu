// Açılış ekranı (v1.63.0, v1.63.1'de Enes'in logo videosuna geçti). Uygulama açılırken küçük, çerçevesiz bir pencere
// gösterilir; ana pencere hazır olunca kapanır. Ana pencereyle aynı anda yüklenir, açılışı bekletmez.
// Sayfa ve görüntüler: src/main/acilis-ekrani/ (index.html, acilis.mp4, ilk-kare.webp). Videoyu değiştirmek için acilis.mp4'ü değiştir.
// Video ekran kartında çözülür (donanım hızlandırma), işlemciyi yormaz.
import { BrowserWindow } from 'electron';
import path from 'node:path';

/** Pencere başlığı (görev çubuğunda görünür) */
export const UYGULAMA_ADI = 'Naphian';
/** Videonun zemin rengiyle aynı; pencere açılırken beyaz kırpışma olmasın */
const ZEMIN = '#0b1325';
const GENISLIK = 640;
const YUKSEKLIK = 280;

let pencere: BrowserWindow | null = null;
let acildi = 0;

/** Kurulu uygulamada dosyalar app.asar.unpacked içinde (video asar içinden sorunsuz oynamayabiliyor) */
function klasor() {
  return path.join(__dirname.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked'), 'acilis-ekrani');
}

/** Açılış ekranını açar (ana pencereden önce çağrılır) */
export function acilisAc(surum: string, simge?: string) {
  if (pencere) return;
  acildi = Date.now();
  pencere = new BrowserWindow({
    width: GENISLIK,
    height: YUKSEKLIK,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    center: true,
    title: UYGULAMA_ADI,
    icon: simge,
    backgroundColor: ZEMIN,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  pencere.once('ready-to-show', () => pencere?.show());
  pencere.on('closed', () => (pencere = null));
  pencere.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pencere.webContents.on('will-navigate', (e) => e.preventDefault());
  pencere.loadFile(path.join(klasor(), 'index.html'), { query: { v: surum } }).catch(() => {});
}

export const acilisAcik = () => !!pencere && !pencere.isDestroyed();

/** Açılış ekranındaki durum yazısı */
export function acilisDurum(yazi: string) {
  if (!acilisAcik()) return;
  pencere!.webContents.executeJavaScript(`window.durum&&window.durum(${JSON.stringify(yazi)})`).catch(() => {});
}

/** Açılış ekranını kapatır. Çok hızlı açılışlarda göz kırpması olmasın diye en az ~0,9 sn görünür kalır (ana pencere bu sırada zaten yükleniyor). */
export function acilisKapat(sonra?: () => void) {
  if (!acilisAcik()) return sonra?.();
  const bekle = Math.max(0, 900 - (Date.now() - acildi));
  setTimeout(() => {
    sonra?.();
    // ana pencere ekrana gelsin, sonra açılış ekranı kalksın (arada boşluk görünmesin)
    setTimeout(() => {
      if (acilisAcik()) pencere!.destroy();
      pencere = null;
    }, 120);
  }, bekle);
}
