import type { BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

export type UpdateState =
  | { state: 'idle' }
  | { state: 'dev' }
  | { state: 'checking'; manual: boolean }
  | { state: 'none'; manual: boolean; checkedAt: number }
  | { state: 'available'; version: string; notes?: string; size?: number }
  | { state: 'downloading'; version: string; percent: number; bps: number; transferred: number; total: number }
  | { state: 'ready'; version: string; notes?: string }
  | { state: 'error'; message: string; manual: boolean };

/**
 * GitHub Releases üzerinden güncelleme. Otomatik indirme kapalı:
 * kullanıcı arayüzdeki "Güncelle" düğmesine basınca iner ve yüklenir.
 */
export class Updater {
  state: UpdateState = { state: 'idle' };
  private manual = false;
  private timer: NodeJS.Timeout | null = null;
  private version = '';
  private notes?: string;

  constructor(private getWin: () => BrowserWindow | null, private dev: boolean) {}

  private set(s: UpdateState) {
    this.state = s;
    this.getWin()?.webContents.send('upd:status', s);
  }

  start() {
    if (this.dev) {
      this.set({ state: 'dev' });
      return;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking', manual: this.manual }));
    autoUpdater.on('update-available', (info) => {
      this.version = info.version;
      this.notes = typeof info.releaseNotes === 'string' ? stripHtml(info.releaseNotes) : undefined;
      const size = info.files?.reduce((a, f) => a + (f.size || 0), 0);
      this.set({ state: 'available', version: info.version, notes: this.notes, size });
    });
    autoUpdater.on('update-not-available', () => this.set({ state: 'none', manual: this.manual, checkedAt: Date.now() }));
    autoUpdater.on('download-progress', (p) =>
      this.set({ state: 'downloading', version: this.version, percent: p.percent, bps: p.bytesPerSecond, transferred: p.transferred, total: p.total }),
    );
    autoUpdater.on('update-downloaded', (info) => this.set({ state: 'ready', version: info.version, notes: this.notes }));
    autoUpdater.on('error', (err) => {
      // indirme/denetim hatası: arayüz tekrar denemeyi önerir
      this.set({ state: 'error', message: friendly(err?.message || String(err)), manual: this.manual });
    });
    setTimeout(() => this.check(false), 4000);
    this.timer = setInterval(() => this.check(false), 30 * 60 * 1000);
  }

  async check(manual: boolean) {
    if (this.dev) return this.set({ state: 'dev' });
    if (this.state.state === 'downloading' || this.state.state === 'ready') return;
    this.manual = manual;
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      this.set({ state: 'error', message: friendly((e as Error).message), manual });
    }
  }

  async download() {
    if (this.dev || this.state.state !== 'available') return;
    this.set({ state: 'downloading', version: this.version, percent: 0, bps: 0, transferred: 0, total: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch (e) {
      this.set({ state: 'error', message: friendly((e as Error).message), manual: true });
    }
  }

  install() {
    if (this.state.state !== 'ready') return;
    if (this.timer) clearInterval(this.timer);
    // sessiz kurulum + kurulumdan sonra uygulamayı yeniden aç
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }
}

function stripHtml(s: string) {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<li>/gi, '• ').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function friendly(msg: string) {
  if (/net::|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(msg)) return 'İnternet bağlantısı yok ya da güncelleme sunucusuna ulaşılamadı.';
  if (/404|Cannot find latest|No published versions/i.test(msg)) return 'Henüz yayınlanmış bir sürüm bulunamadı.';
  if (/sha512|checksum/i.test(msg)) return 'İndirilen dosya doğrulanamadı, tekrar dene.';
  return msg.split('\n')[0].slice(0, 200);
}
