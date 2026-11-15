// Davet bağlantıları (sunucu tarafı): süreli / sınırlı davetlerin kuralları ve tarayıcıda açılan davet sayfası.
// hub.ts'i şişirmemek için ayrı durur; durum (topluluklar) hub'dadır, burada yalnız saf işlevler var.
import { DOWNLOAD_URL, INVITE_APP_SCHEME, INVITE_LINK_BASE, type Invite, type InviteInfo } from '../shared/davetBaglanti';
import { OFFICIAL_SERVER } from '../shared/guvenlik';

/** Süresi dolmamış ve kullanım sınırı dolmamış davet mi */
export const inviteAlive = (i: Invite, now = Date.now()) => (!i.exp || i.exp > now) && (!i.max || i.uses < i.max);

/** İstemciden gelen süre (saniye): 0 = süresiz, en çok 30 gün */
export function cleanAge(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 60), 30 * 86400) : 0;
}

/** İstemciden gelen kullanım sınırı: 0 = sınırsız, en çok 1000 */
export function cleanMax(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 0;
}

/** data:image/...;base64 simgeyi resim dosyası olarak sunmak için çözer (yalnız güvenli resim türleri) */
export function iconBytes(icon: string | undefined): { mime: string; buf: Buffer } | null {
  const m = /^data:(image\/(?:png|jpeg|gif|webp|avif));base64,([A-Za-z0-9+/=]+)$/.exec(icon || '');
  if (!m) return null;
  try {
    const buf = Buffer.from(m[2], 'base64');
    return buf.length ? { mime: m[1], buf } : null;
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safeColor = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : '#5b8def');
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] || '')
    .join('')
    .toUpperCase() || '?';

/** Davet sayfasının güvenlik başlıkları: yalnız kendi satır içi stili, tek (nonce'lu) betik, kendi resimleri */
export function invitePageHeaders(nonce: string): Record<string, string> {
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex',
    // xanaphian.com'daki aktarıcı bu başlığa bakarak yanıtın gerçekten davet sayfası olduğunu anlar (server/site/)
    'x-xanaphian-davet': '1',
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' ${new URL(INVITE_LINK_BASE).origin} ${new URL(OFFICIAL_SERVER).origin}; media-src 'self' ${new URL(OFFICIAL_SERVER).origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
}

/** Sayfa arka planı: sahibinin seçtiği resim/GIF/video; yoksa topluluk afişi; o da yoksa topluluk renginden bir geçiş */
function pageBackground(info: InviteInfo, code: string): { css: string; video?: string } {
  const bg = info.bg;
  const fallback = safeColor(info.color);
  const url = `${OFFICIAL_SERVER}/davet/${code}/arkaplan`;
  if (bg?.k === 'video' && code) return { css: `linear-gradient(135deg, ${fallback}, #07080b)`, video: url };
  if (bg?.k === 'image' && code) {
    const pos = `${Math.min(100, Math.max(0, bg.x ?? 50))}% ${Math.min(100, Math.max(0, bg.y ?? 50))}%`;
    return { css: `url("${url}") ${pos} / cover no-repeat, ${fallback}` };
  }
  if (bg?.k === 'gradient') return { css: `linear-gradient(${Math.round(bg.ang ?? 135)}deg, ${safeColor(bg.a)}, ${safeColor(bg.b || bg.a)})` };
  if (bg?.k === 'solid') return { css: safeColor(bg.a) };
  return { css: `linear-gradient(135deg, ${fallback}, color-mix(in srgb, ${fallback} 30%, #07080b))` };
}

const DL_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

/** Tarayıcıda açılan davet sayfası (Discord davet sayfası düzeninde). info yoksa "davet geçersiz" sayfası döner. */
export function invitePage(info: InviteInfo | null, code: string, nonce: string): string {
  const appLink = `${INVITE_APP_SCHEME}://davet/${code}`;
  const link = `${INVITE_LINK_BASE}/${code}`;
  const title = info ? `${info.name} topluluğuna katıl` : 'Davet geçersiz';
  const desc = info
    ? `${info.about ? info.about + ' · ' : ''}${info.online} çevrimiçi, ${info.members} üye. Xanaphian'da sohbete katıl.`
    : 'Bu davet bağlantısı geçersiz ya da süresi dolmuş.';
  const hasIcon = !!info?.icon;
  const iconUrl = `${link}/simge`;
  const color = info ? safeColor(info.color) : '#5b8def';
  const bg = info ? pageBackground(info, code) : { css: 'linear-gradient(135deg,#1b1f2a,#0b0d12)' } as { css: string; video?: string };
  const icon = info
    ? hasIcon
      ? // göreli adres: sayfa hem xanaphian.com/davet/<kod> hem de sunucunun kendi adresinden açılınca çalışır
        `<img class="ic" src="${esc(code)}/simge" alt="" width="80" height="80">`
      : `<div class="ic tx">${esc(initials(info.name))}</div>`
    : `<div class="ic tx bad">!</div>`;
  const body = info
    ? `${icon}
      <p class="k">Bir topluluğa davet edildin</p>
      <h1>${esc(info.name)}</h1>
      <p class="st"><span><i class="on"></i>${info.online} çevrimiçi</span><span><i></i>${info.members} üye</span></p>
      ${info.about ? `<p class="ab">${esc(info.about)}</p>` : ''}
      <a class="btn pri" id="ac" href="${esc(appLink)}">Uygulamayı Aç</a>
      <button class="btn sec" id="cp" type="button" data-l="${esc(link)}">Bağlantıyı Kopyala</button>
      <p class="n" id="not">Uygulama yüklüyse katılma penceresi orada açılır.</p>`
    : `${icon}
      <h1>Davet geçersiz</h1>
      <p class="ab">Bu davet bağlantısı geçersiz ya da süresi dolmuş. Seni davet eden kişiden yeni bir bağlantı iste.</p>`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#1e1f22">
<title>${esc(title)} · Xanaphian</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="Xanaphian">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(link)}">
${hasIcon ? `<meta property="og:image" content="${esc(iconUrl)}">\n<meta name="twitter:card" content="summary">` : ''}
<style>
*{box-sizing:border-box}
html,body{min-height:100%;margin:0}
body{--c:${color};color:#f2f3f5;font:16px/1.4 "gg sans",Rubik,"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:80px 16px 40px;position:relative;overflow-x:hidden;-webkit-font-smoothing:antialiased;background:#1e1f22}
.bg{position:fixed;inset:0;background:${bg.css};z-index:0}
.bgv{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;background:#0b0d12}
.bg:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.34))}
.logo{position:fixed;top:26px;left:34px;z-index:2;display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;letter-spacing:-.01em;color:#fff;text-decoration:none;text-shadow:0 2px 12px rgba(0,0,0,.45)}
.logo i{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-style:normal;font-size:19px;background:linear-gradient(135deg,var(--c),color-mix(in srgb,var(--c) 45%,#000));box-shadow:0 4px 14px -4px rgba(0,0,0,.6)}
main{position:relative;z-index:1;width:100%;max-width:480px;padding:32px;text-align:center;border-radius:8px;background:#313338;box-shadow:0 8px 30px rgba(0,0,0,.45);animation:in .45s cubic-bezier(.2,.8,.2,1) both}
@keyframes in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){main{animation:none}}
.ic{width:80px;height:80px;border-radius:50%;display:block;margin:0 auto 16px;object-fit:cover;background:#1e1f22}
.tx{display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--c),color-mix(in srgb,var(--c) 50%,#000))}
.bad{background:#3a2a2e;color:#f0a2ac}
.k{margin:0 0 6px;font-size:14px;color:#b5bac1}
h1{margin:0;font-size:24px;line-height:1.25;font-weight:700;overflow-wrap:anywhere}
.st{margin:12px 0 0;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;font-size:13.5px;color:#b5bac1}
.st span{display:inline-flex;align-items:center}
.st i{width:9px;height:9px;border-radius:50%;background:#80848e;margin-right:6px}
.st i.on{background:#23a559}
.ab{margin:14px 0 0;color:#dbdee1;font-size:14.5px;overflow-wrap:anywhere}
.btn{all:unset;box-sizing:border-box;display:block;width:100%;margin-top:10px;padding:11px 16px;border-radius:4px;text-align:center;font-size:15px;font-weight:600;cursor:pointer;color:#fff;transition:background .12s}
.btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.pri{background:#5865f2;margin-top:24px}.pri:hover{background:#4752c4}
.sec{background:#4e5058}.sec:hover{background:#6d6f78}
.n{margin:14px 0 0;font-size:12.5px;color:#949ba4}
.dl{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:6px;background:#111214;color:#fff;font-size:14px;font-weight:600;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.4);transition:background .12s}
.dl:hover{background:#26282c}
.dl:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media(max-width:520px){main{padding:26px 20px}.logo{left:18px;top:18px}}
</style>
</head>
<body>
<div class="bg"></div>
${bg.video ? `<video class="bgv" src="${esc(bg.video)}" autoplay muted loop playsinline preload="auto"></video>` : ''}
<a class="logo" href="${esc(DOWNLOAD_URL)}" rel="noopener"><i>X</i>Xanaphian</a>
<main>
      ${body}
</main>
<a class="dl" href="${esc(DOWNLOAD_URL)}" rel="noopener">${DL_ICON}Xanaphian'ı indir${CHEV}</a>
${info ? `<script nonce="${nonce}">
(function(){
  var cp=document.getElementById('cp');
  if(cp) cp.addEventListener('click',function(){
    var o=cp.textContent;
    try{ navigator.clipboard.writeText(cp.getAttribute('data-l')).then(function(){ cp.textContent='Kopyalandı'; setTimeout(function(){ cp.textContent=o; },1600); },function(){}); }catch(e){}
  });
  // uygulama kendiliğinden açılmaz (tarayıcı üstte izin çubuğu çıkarıp sayfayı örtüyordu); yalnız "Uygulamayı Aç"a basınca açılır
  var ac=document.getElementById('ac'), not=document.getElementById('not'), t;
  if(!ac||!not) return;
  var first=not.textContent;
  window.addEventListener('blur',function(){ clearTimeout(t); not.textContent="Xanaphian açılıyor. Katılma penceresi uygulamada seni bekliyor."; });
  ac.addEventListener('click',function(){
    clearTimeout(t);
    t=setTimeout(function(){ not.textContent="Açılmadı mı? Yüklü değilse aşağıdaki düğmeyle indir."; },2500);
  });
  window.addEventListener('focus',function(){ clearTimeout(t); not.textContent=first; });
})();
</script>` : ''}
</body>
</html>
`;
}
