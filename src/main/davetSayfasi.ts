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
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' ${new URL(INVITE_LINK_BASE).origin} ${new URL(OFFICIAL_SERVER).origin}; media-src 'self' ${new URL(OFFICIAL_SERVER).origin}; font-src ${new URL(OFFICIAL_SERVER).origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
}

/** Tarayıcıda açılan davet sayfası. info yoksa "davet geçersiz" sayfası döner. */
export function invitePage(info: InviteInfo | null, code: string, nonce: string): string {
  const appLink = `${INVITE_APP_SCHEME}://davet/${code}`;
  const link = `${INVITE_LINK_BASE}/${code}`;
  const title = info ? `${info.name} topluluğuna katıl` : 'Davet geçersiz';
  const desc = info
    ? `${info.about ? info.about + ' · ' : ''}${info.online} çevrimiçi, ${info.members} üye. Naphian'da sohbete katıl.`
    : 'Bu davet bağlantısı geçersiz ya da süresi dolmuş.';
  const hasIcon = !!info?.icon;
  const iconUrl = `${link}/simge`;
  const color = info ? safeColor(info.color) : '#5b8def';
  const bgUrl = info?.bg && code ? `${OFFICIAL_SERVER}/davet/${code}/arkaplan` : '';
  const bgLayer = !bgUrl ? '' : info!.bg!.k === 'video' ? `<video class="pbg" src="${esc(bgUrl)}" autoplay muted loop playsinline preload="auto"></video><div class="pbs"></div>` : `<div class="pbg" style="background:url('${esc(bgUrl)}') center/cover no-repeat"></div><div class="pbs"></div>`;
  const icon = info
    ? hasIcon
      ? // göreli adres: sayfa hem xanaphian.com/davet/<kod> hem de sunucunun kendi adresinden açılınca çalışır
        `<img class="ic" src="${esc(code)}/simge" alt="" width="96" height="96">`
      : `<div class="ic tx">${esc(initials(info.name))}</div>`
    : `<div class="ic tx bad">!</div>`;
  const body = info
    ? `<p class="k">Bir topluluğa davet edildin</p>
      <h1>${esc(info.name)}</h1>
      ${info.about ? `<p class="ab">${esc(info.about)}</p>` : ''}
      <p class="st"><span class="pl"><i class="on"></i>${info.online} çevrimiçi</span><span class="pl"><i></i>${info.members} üye</span></p>
      <a class="b" id="ac" href="${esc(appLink)}">Naphian'da aç</a>
      <p class="n" id="not">Uygulama kuruluysa düğmeye basınca açılır.</p>
      <div class="sep"><span>uygulaman yok mu?</span></div>
      <a class="b ik" href="${esc(DOWNLOAD_URL)}" rel="noopener">Naphian'ı indir</a>
      <p class="n kc">Uygulamada <b>Bir topluluğa katıl</b> kutusuna bu bağlantıyı da yapıştırabilirsin<code>${esc(link.replace(/^https?:\/\//, ''))}</code></p>`
    : `<h1>Davet geçersiz</h1>
      <p class="ab">Bu davet bağlantısı geçersiz ya da süresi dolmuş. Seni davet eden kişiden yeni bir bağlantı iste.</p>
      <a class="b ik" href="${esc(DOWNLOAD_URL)}" rel="noopener">Naphian'ı indir</a>`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0d0f14">
<title>${esc(title)} · Naphian</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="Naphian">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(link)}">
${hasIcon ? `<meta property="og:image" content="${esc(iconUrl)}">\n<meta name="twitter:card" content="summary">` : ''}
<style>
@font-face{font-family:'Rubik';font-style:normal;font-weight:300 900;font-display:swap;src:url(${OFFICIAL_SERVER}/davet-yazi/ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Rubik';font-style:normal;font-weight:300 900;font-display:swap;src:url(${OFFICIAL_SERVER}/davet-yazi/latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
*{box-sizing:border-box}
html,body{min-height:100%;margin:0}
body{--c:${color};background:#0d0f14;color:#e9ebf1;font:16px/1.55 Rubik,"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 16px;position:relative;overflow-x:hidden;-webkit-font-smoothing:antialiased}
body:before{content:"";position:fixed;inset:-20% -10% auto -10%;height:70vh;background:radial-gradient(60% 60% at 50% 0,color-mix(in srgb,var(--c) 38%,transparent),transparent 70%);opacity:.55;pointer-events:none}
body:after{content:"";position:fixed;inset:auto -10% -25% -10%;height:50vh;background:radial-gradient(50% 60% at 50% 100%,rgba(91,141,239,.16),transparent 70%);pointer-events:none}
.brand{position:relative;z-index:1;display:flex;align-items:center;gap:9px;margin-bottom:22px;font-weight:600;font-size:15px;letter-spacing:.2px;color:#cdd2de}
.brand b{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#5b8def,#7a5cf0);color:#fff;font-size:14px}
main{position:relative;z-index:1;width:100%;max-width:430px;background:linear-gradient(180deg,#1b1e26,#171a21);border:1px solid #2a2e39;border-radius:22px;padding:0 30px 26px;text-align:center;box-shadow:0 24px 60px -20px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.02) inset;overflow:hidden}
.bn{height:92px;margin:0 -30px;background:linear-gradient(135deg,var(--c),color-mix(in srgb,var(--c) 35%,#101216));position:relative}
.bn:after{content:"";position:absolute;inset:0;background:radial-gradient(120% 140% at 80% 0,rgba(255,255,255,.22),transparent 55%)}
.ic{width:96px;height:96px;border-radius:26%;display:block;margin:-48px auto 16px;object-fit:cover;border:5px solid #1b1e26;background:#1b1e26;position:relative;box-shadow:0 8px 24px -8px rgba(0,0,0,.6)}
.tx{display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;color:#fff;background:linear-gradient(135deg,var(--c),color-mix(in srgb,var(--c) 55%,#000))}
.bad{background:#3a2a2e;color:#f0a2ac}
.k{margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#8f97a8}
h1{margin:0;font-size:26px;line-height:1.22;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
.ab{margin:10px 0 0;color:#b4bac7;font-size:14.5px;overflow-wrap:anywhere}
.st{margin:18px 0 26px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;font-size:13.5px;color:#c3c8d4}
.pl{display:inline-flex;align-items:center;padding:5px 12px;border-radius:999px;background:#12151b;border:1px solid #262a35}
.st i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#6c7383;margin-right:7px}
.st i.on{background:#3fb97c;box-shadow:0 0 0 3px rgba(63,185,124,.18)}
.b{display:block;width:100%;padding:14px 16px;border-radius:12px;background:linear-gradient(180deg,#6a98f3,#4f80e6);color:#fff;font-weight:600;font-size:15.5px;text-decoration:none;box-shadow:0 8px 20px -8px rgba(79,128,230,.7);transition:transform .12s,filter .12s}
.b:hover{filter:brightness(1.08);transform:translateY(-1px)}
.b:focus-visible{outline:2px solid #fff;outline-offset:2px}
.b.ik{background:transparent;border:1px solid #343947;color:#e9ebf1;box-shadow:none}
.b.ik:hover{background:#21252e;filter:none}
main>h1+.ab,main>h1{margin-bottom:0}
main>h1+.ab+.b,main>.ic+h1+.ab+.b{margin-top:24px}
.n{margin:14px 0 0;font-size:13px;color:#8d94a3}
.sep{display:flex;align-items:center;gap:12px;margin:20px 0 14px;color:#6f7686;font-size:12px}
.sep:before,.sep:after{content:"";flex:1;height:1px;background:#262a35}
.kc{margin-top:20px;padding-top:18px;border-top:1px solid #262a35;line-height:1.7}
.kc b{color:#c3c8d4;font-weight:500}
code{display:block;margin:8px auto 0;width:fit-content;max-width:100%;padding:5px 11px;border-radius:8px;background:#0f1218;border:1px solid #232733;color:#cfd4de;font:12.5px ui-monospace,Consolas,monospace;user-select:all;overflow-wrap:anywhere}
.ft{position:relative;z-index:1;margin-top:20px;font-size:12px;color:#6f7686}
@media(max-width:420px){main{padding:0 20px 22px}.bn{margin:0 -20px}h1{font-size:23px}}
.pbg{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.pbs{position:fixed;inset:0;z-index:0;background:rgba(8,9,13,.45)}
</style>
</head>
<body>
${bgLayer}
<div class="brand"><b>N</b>Naphian</div>
<main>
      <div class="bn"></div>
      ${icon}
      ${body}
</main>
<p class="ft">Naphian · Arkadaşlarınla sohbet et, oyna, birlikte vakit geçir</p>
${info ? `<script nonce="${nonce}">
(function(){
  // uygulama kendiliğinden açılmaz (tarayıcı üstte izin penceresi çıkarıp sayfayı örtüyordu); yalnız "Naphian'da aç"a basınca açılır
  var ac=document.getElementById('ac'), not=document.getElementById('not'), t;
  if(!ac||!not) return;
  var first=not.textContent;
  window.addEventListener('blur',function(){ clearTimeout(t); not.textContent="Naphian açılıyor. Katılma penceresi uygulamada seni bekliyor."; });
  ac.addEventListener('click',function(){
    clearTimeout(t);
    t=setTimeout(function(){ not.textContent="Naphian açılmadı mı? Yüklü değilse aşağıdan indir, sonra bu sayfaya dön."; },2500);
  });
  window.addEventListener('focus',function(){ clearTimeout(t); not.textContent=first; });
})();
</script>` : ''}
</body>
</html>
`;
}
