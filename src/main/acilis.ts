// v1.63.0: açılış ekranı. Uygulama açılırken küçük, çerçevesiz bir pencere gösterilir; ana pencere hazır olunca kapanır.
// Ana pencereyle aynı anda yüklenir, açılışı bekletmez. Animasyonlar yalnız transform/opacity kullanır (ekran kartı çizer, işlemciyi yormaz).
import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// ---- Marka: adı, vurgu rengini ve logoyu değiştirmek için yalnız burası ve build/acilis-logo.* ----
/** Açılış ekranında yazan uygulama adı */
export const UYGULAMA_ADI = 'Xanaphian';
/** Tek vurgu rengi (ses halkaları, dalga çizgisi) */
const VURGU = '#0ac8b9';
/** Zemin (koyu lacivert) */
const ZEMIN = '#0a1226';
/** Logo dosyası: build/acilis-logo.png, .webp ya da .svg (ilk bulunan kullanılır; derlemede dist/main'e kopyalanır) */
const LOGO_DOSYALARI: [string, string][] = [
  ['acilis-logo.png', 'image/png'],
  ['acilis-logo.webp', 'image/webp'],
  ['acilis-logo.svg', 'image/svg+xml'],
];

let pencere: BrowserWindow | null = null;
let acildi = 0;

function logoAdresi(): string {
  for (const [ad, tur] of LOGO_DOSYALARI) {
    try {
      const veri = fs.readFileSync(path.join(__dirname, ad));
      return `data:${tur};base64,${veri.toString('base64')}`;
    } catch {
      /* sıradaki */
    }
  }
  return '';
}

const kacis = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Açılış ekranının sayfası (tek parça, dış dosya ya da yazı tipi yüklemez) */
export function acilisSayfasi(surum: string, logo = logoAdresi()): string {
  const cubuklar = Array.from({ length: 34 }, (_, i) => `<i style="--g:${((i * 37) % 23) / 10}s;--y:${0.35 + ((i * 53) % 61) / 100}"></i>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${kacis(UYGULAMA_ADI)}</title><style>
:root{--v:${VURGU};--z:${ZEMIN}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:var(--z);color:#e8eef8;font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;-webkit-user-select:none;user-select:none;cursor:default}
body{-webkit-app-region:drag;position:relative;background:radial-gradient(120% 140% at 0% 50%,color-mix(in srgb,var(--v) 13%,var(--z)) 0%,var(--z) 55%) ,var(--z)}
.sahne{position:absolute;left:44px;top:50%;width:112px;height:112px;margin-top:-72px}
.halka{position:absolute;inset:0;border-radius:50%;border:1.5px solid var(--v);opacity:0;will-change:transform,opacity;animation:yay 2.7s cubic-bezier(.2,.6,.3,1) infinite}
.halka:nth-child(2){animation-delay:.9s}.halka:nth-child(3){animation-delay:1.8s}
@keyframes yay{0%{transform:scale(.62);opacity:.0}12%{opacity:.75}100%{transform:scale(2.7);opacity:0}}
.logo{position:absolute;inset:14px;width:84px;height:84px;object-fit:contain;animation:gel .7s cubic-bezier(.2,.8,.2,1) both}
.isik{position:absolute;inset:10px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--v) 30%,transparent),transparent 70%);animation:nabiz 2.7s ease-in-out infinite}
@keyframes nabiz{0%,100%{opacity:.5;transform:scale(.9)}50%{opacity:1;transform:scale(1.05)}}
@keyframes gel{from{opacity:0;transform:scale(.8) rotate(-8deg)}to{opacity:1;transform:none}}
.yazi{position:absolute;left:200px;right:28px;top:50%;margin-top:-48px}
.ad{font-size:27px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:kay .6s .15s cubic-bezier(.2,.8,.2,1) both}
.cizgi{width:38px;height:2px;background:var(--v);margin:12px 0 14px;border-radius:2px;transform-origin:left;animation:uza .6s .3s cubic-bezier(.2,.8,.2,1) both}
@keyframes uza{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes kay{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
.durum{font-size:13.5px;color:#9fb0c9;letter-spacing:.01em;min-height:20px;animation:kay .6s .35s cubic-bezier(.2,.8,.2,1) both}
.durum b{font-weight:400;display:inline-block;animation:nokta 1.4s infinite;opacity:.2}
.durum b:nth-child(2){animation-delay:.2s}.durum b:nth-child(3){animation-delay:.4s}
@keyframes nokta{0%,100%{opacity:.2}40%{opacity:1}}
.dalga{position:absolute;left:0;right:0;bottom:0;height:26px;display:flex;align-items:flex-end;gap:4px;padding:0 6px;opacity:.55}
.dalga i{flex:1;height:100%;background:linear-gradient(to top,var(--v),transparent);border-radius:2px 2px 0 0;transform-origin:bottom;transform:scaleY(var(--y));will-change:transform;animation:ses 1.6s var(--g) ease-in-out infinite alternate}
@keyframes ses{0%{transform:scaleY(.08)}100%{transform:scaleY(var(--y))}}
.surum{position:absolute;right:16px;top:12px;font-size:11px;color:#5d6d88;letter-spacing:.06em}
@media (prefers-reduced-motion:reduce){*{animation-duration:0s!important;animation-iteration-count:1!important}.halka{opacity:.2}}
</style></head><body>
<div class="sahne"><span class="halka"></span><span class="halka"></span><span class="halka"></span><span class="isik"></span>${logo ? `<img class="logo" src="${logo}" alt="">` : ''}</div>
<div class="yazi"><div class="ad">${kacis(UYGULAMA_ADI)}</div><div class="cizgi"></div><div class="durum"><span id="d">Başlatılıyor</span><b>.</b><b>.</b><b>.</b></div></div>
<div class="dalga">${cubuklar}</div>
<div class="surum">v${kacis(surum)}</div>
<script>window.durum=function(t){document.getElementById('d').textContent=t}</script>
</body></html>`;
}

/** Açılış ekranını açar (ana pencereden önce çağrılır) */
export function acilisAc(surum: string, simge?: string) {
  if (pencere) return;
  acildi = Date.now();
  pencere = new BrowserWindow({
    width: 460,
    height: 250,
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
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false },
  });
  pencere.once('ready-to-show', () => pencere?.show());
  pencere.on('closed', () => (pencere = null));
  pencere.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pencere.webContents.on('will-navigate', (e) => e.preventDefault());
  pencere.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(acilisSayfasi(surum)));
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
