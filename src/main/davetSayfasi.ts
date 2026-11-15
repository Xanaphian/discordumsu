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
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' ${new URL(INVITE_LINK_BASE).origin} ${new URL(OFFICIAL_SERVER).origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
}

/** Sayfa arka planı (CSS): topluluk profilindeki afiş; yoksa topluluk renginden bir geçiş */
function pageBackground(info: InviteInfo, code: string): { css: string; image: boolean } {
  const bg = info.bg;
  const fallback = safeColor(info.color);
  if (bg?.k === 'image' && code) {
    const pos = `${Math.min(100, Math.max(0, bg.x ?? 50))}% ${Math.min(100, Math.max(0, bg.y ?? 50))}%`;
    return { css: `url("${OFFICIAL_SERVER}/davet/${code}/arkaplan") ${pos} / cover no-repeat, ${fallback}`, image: true };
  }
  if (bg?.k === 'gradient') return { css: `linear-gradient(${Math.round(bg.ang ?? 135)}deg, ${safeColor(bg.a)}, ${safeColor(bg.b || bg.a)})`, image: false };
  if (bg?.k === 'solid') return { css: safeColor(bg.a), image: false };
  return { css: `linear-gradient(135deg, ${fallback}, color-mix(in srgb, ${fallback} 30%, #07080b))`, image: false };
}

/** Tarayıcıda açılan davet sayfası. info yoksa "davet geçersiz" sayfası döner. */
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
  const bg = info ? pageBackground(info, code) : { css: 'linear-gradient(135deg,#1b1f2a,#0b0d12)', image: false };
  const icon = info
    ? hasIcon
      ? // göreli adres: sayfa hem xanaphian.com/davet/<kod> hem de sunucunun kendi adresinden açılınca çalışır
        `<img class="ic" src="${esc(code)}/simge" alt="" width="104" height="104">`
      : `<div class="ic tx">${esc(initials(info.name))}</div>`
    : `<div class="ic tx bad">!</div>`;
  const body = info
    ? `<p class="k">Bir topluluğa davet edildin</p>
      <h1>${esc(info.name)}</h1>
      ${info.about ? `<p class="ab">${esc(info.about)}</p>` : ''}
      <p class="st"><span class="pl"><i class="on"></i>${info.online} çevrimiçi</span><span class="pl"><i></i>${info.members} üye</span></p>
      <a class="row" id="ac" href="${esc(appLink)}">
        <span class="ri">${hasIcon ? `<img src="${esc(code)}/simge" alt="" width="46" height="46">` : esc(initials(info.name))}</span>
        <span class="rt"><b>Xanaphian'da aç</b><em id="not">Uygulamayı aç ve topluluğa katıl</em></span>
        <svg class="rc" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
      </a>
      <a class="row" href="${esc(DOWNLOAD_URL)}" rel="noopener">
        <span class="ri dl"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg></span>
        <span class="rt"><b>Xanaphian'ı indir</b><em>Uygulaman yoksa buradan al</em></span>
        <svg class="rc" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
      </a>
      <p class="n kc">Ya da uygulamada <b>Bir topluluğa katıl</b> kutusuna yapıştır<code>${esc(link.replace(/^https?:\/\//, ''))}</code></p>`
    : `<h1>Davet geçersiz</h1>
      <p class="ab">Bu davet bağlantısı geçersiz ya da süresi dolmuş. Seni davet eden kişiden yeni bir bağlantı iste.</p>
      <a class="row" href="${esc(DOWNLOAD_URL)}" rel="noopener"><span class="ri dl"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg></span><span class="rt"><b>Xanaphian'ı indir</b><em>Uygulaman yoksa buradan al</em></span></a>`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#08090d">
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
body{--c:${color};color:#f1f3f8;font:16px/1.55 Rubik,"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:28px 16px;position:relative;overflow-x:hidden;-webkit-font-smoothing:antialiased;background:#08090d}
.bg{position:fixed;inset:-24px;background:${bg.css};${bg.image ? 'filter:blur(7px) saturate(1.1);' : ''}transform:scale(1.04);z-index:0}
.bg:after{content:"";position:absolute;inset:0;background:radial-gradient(90% 70% at 50% 40%,rgba(8,9,13,.28),rgba(8,9,13,.78)),linear-gradient(180deg,rgba(8,9,13,.35),rgba(8,9,13,.65))}
main{position:relative;z-index:1;width:100%;max-width:400px;padding:34px 28px 24px;text-align:center;border-radius:24px;background:rgba(14,16,22,.52);border:1px solid rgba(255,255,255,.12);-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);box-shadow:0 30px 80px -20px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.03) inset;animation:in .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){main{animation:none}}
.ic{width:104px;height:104px;border-radius:50%;display:block;margin:0 auto 18px;object-fit:cover;border:3px solid rgba(255,255,255,.85);background:#14161d;box-shadow:0 0 0 6px color-mix(in srgb,var(--c) 30%,transparent),0 10px 40px -4px var(--c)}
.tx{display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:600;color:#fff;background:linear-gradient(135deg,var(--c),color-mix(in srgb,var(--c) 50%,#000))}
.bad{background:#3a2a2e;color:#f0a2ac;box-shadow:none}
.k{margin:0 0 6px;font-size:11.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.62)}
h1{margin:0;font-size:27px;line-height:1.2;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere;text-shadow:0 0 24px color-mix(in srgb,var(--c) 70%,transparent),0 2px 12px rgba(0,0,0,.5)}
.ab{margin:10px 0 0;color:rgba(255,255,255,.78);font-size:14.5px;overflow-wrap:anywhere}
.st{margin:18px 0 24px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;font-size:13.5px;color:rgba(255,255,255,.85)}
.pl{display:inline-flex;align-items:center;padding:5px 13px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
.st i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#7c8394;margin-right:7px}
.st i.on{background:#3fe08f;box-shadow:0 0 10px #3fe08f}
.row{display:flex;align-items:center;gap:13px;width:100%;margin-top:10px;padding:11px 14px;border-radius:18px;text-align:left;text-decoration:none;color:#f1f3f8;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 8px 24px -12px rgba(0,0,0,.6);transition:transform .14s,background .14s,border-color .14s}
.row:hover{transform:translateY(-2px);background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.26)}
.row:focus-visible{outline:2px solid #fff;outline-offset:3px}
.st+.row{margin-top:0}
.ri{flex:none;width:46px;height:46px;border-radius:50%;overflow:hidden;display:grid;place-items:center;font-weight:600;font-size:16px;color:#fff;background:linear-gradient(135deg,var(--c),color-mix(in srgb,var(--c) 50%,#000));border:1px solid rgba(255,255,255,.28)}
.ri img{width:100%;height:100%;object-fit:cover;display:block}
.ri.dl{background:rgba(255,255,255,.12)}
.rt{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.rt b{font-size:15.5px;font-weight:600}
.rt em{font-size:12.5px;font-style:italic;color:rgba(255,255,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rc{flex:none;color:rgba(255,255,255,.5)}
.n{margin:12px 0 0;font-size:12.5px;color:rgba(255,255,255,.55)}
.kc{margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.12);line-height:1.7}
.kc b{color:rgba(255,255,255,.85);font-weight:500}
code{display:block;margin:8px auto 0;width:fit-content;max-width:100%;padding:5px 11px;border-radius:9px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.1);color:#e6e9f1;font:12.5px ui-monospace,Consolas,monospace;user-select:all;overflow-wrap:anywhere}
 .dots{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.55;background-image:radial-gradient(circle,rgba(255,255,255,.55) 1px,transparent 1.6px),radial-gradient(circle,rgba(255,255,255,.35) 1px,transparent 1.6px);background-size:120px 120px,190px 190px;background-position:0 0,60px 90px;animation:drift 60s linear infinite;-webkit-mask-image:radial-gradient(80% 70% at 50% 45%,#000,transparent);mask-image:radial-gradient(80% 70% at 50% 45%,#000,transparent)}
@keyframes drift{to{background-position:0 -240px,60px -380px}}
.views{position:fixed;top:16px;left:16px;z-index:2;display:flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;font-size:13px;font-weight:500;color:rgba(255,255,255,.88);background:rgba(14,16,22,.45);border:1px solid rgba(255,255,255,.14);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
#card{transform-style:preserve-3d;will-change:transform}
h1{background:linear-gradient(100deg,#fff 0%,#fff 38%,color-mix(in srgb,var(--c) 45%,#fff) 50%,#fff 62%,#fff 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;text-shadow:none;filter:drop-shadow(0 0 14px color-mix(in srgb,var(--c) 65%,transparent));animation:shine 5s ease-in-out infinite}
@keyframes shine{0%,20%{background-position:120% 0}80%,100%{background-position:-20% 0}}
.ab.ty:after{content:"";display:inline-block;width:2px;height:1em;margin-left:2px;vertical-align:-.12em;background:rgba(255,255,255,.8);animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
@media(prefers-reduced-motion:reduce){.dots,h1{animation:none}}
.brand{position:fixed;left:0;right:0;bottom:16px;z-index:1;text-align:center;font-size:12px;letter-spacing:.06em;color:rgba(255,255,255,.5)}
.brand b{color:rgba(255,255,255,.85);font-weight:600}
@media(max-width:420px){main{padding:30px 20px 22px}h1{font-size:24px}}
</style>
</head>
<body>
<div class="bg"></div>
<div class="dots"></div>
${info ? `<div class="views" title="Üye sayısı"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>${info.members}</div>` : ''}
<main id="card">
      ${icon}
      ${body}
</main>
<div class="brand"><b>Xanaphian</b> · arkadaşlarınla sohbet et, oyna</div>
${info ? `<script nonce="${nonce}">
(function(){
  // uygulama kendiliğinden açılmaz (tarayıcı üstte izin çubuğu çıkarıp sayfayı örtüyordu); yalnız "Xanaphian'da aç"a basınca açılır
  var ac=document.getElementById('ac'), not=document.getElementById('not'), t;
  if(!ac||!not) return;
  var first=not.textContent;
  window.addEventListener('blur',function(){ clearTimeout(t); not.textContent="Xanaphian açılıyor. Katılma penceresi uygulamada seni bekliyor."; });
  ac.addEventListener('click',function(){
    clearTimeout(t);
    t=setTimeout(function(){ not.textContent="Açılmadı mı? Yüklü değilse aşağıdan indir."; },2500);
  });
  window.addEventListener('focus',function(){ clearTimeout(t); not.textContent=first; });
})();
</script>` : ''}
${info ? `<script nonce="${nonce}">
(function(){
  var card=document.getElementById('card'); if(!card) return;
  var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(calm) return;
  // kart fareyi hafifçe takip eder (yalnız fareli cihazlarda)
  if(matchMedia('(hover: hover) and (pointer: fine)').matches){
    window.addEventListener('pointermove',function(e){
      var x=(e.clientX/innerWidth-.5), y=(e.clientY/innerHeight-.5);
      card.style.transform='perspective(900px) rotateY('+(x*9).toFixed(2)+'deg) rotateX('+(-y*9).toFixed(2)+'deg)';
    });
    document.addEventListener('pointerleave',function(){ card.style.transform=''; });
  }
  // tanıtım yazısı daktilo gibi yazılır
  var ab=card.querySelector('.ab'); if(!ab) return;
  var full=ab.textContent, i=0; ab.classList.add('ty'); ab.textContent='';
  (function step(){ ab.textContent=full.slice(0,++i); if(i<full.length) setTimeout(step,28); else setTimeout(function(){ ab.classList.remove('ty'); },1400); })();
})();
</script>` : ''}
</body>
</html>
`;
}
