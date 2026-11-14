// Davet bağlantıları (sunucu tarafı): süreli / sınırlı davetlerin kuralları ve tarayıcıda açılan davet sayfası.
// hub.ts'i şişirmemek için ayrı durur; durum (topluluklar) hub'dadır, burada yalnız saf işlevler var.
import { DOWNLOAD_URL, INVITE_APP_SCHEME, INVITE_LINK_BASE, type Invite, type InviteInfo } from '../shared/davetBaglanti';

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
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' ${new URL(INVITE_LINK_BASE).origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
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
  const icon = info
    ? hasIcon
      ? // göreli adres: sayfa hem xanaphian.com/davet/<kod> hem de sunucunun kendi adresinden açılınca çalışır
        `<img class="ic" src="${esc(code)}/simge" alt="" width="88" height="88">`
      : `<div class="ic tx" style="background:${safeColor(info.color)}">${esc(initials(info.name))}</div>`
    : `<div class="ic tx bad">!</div>`;
  const body = info
    ? `<p class="k">Bir topluluğa davet edildin</p>
      <h1>${esc(info.name)}</h1>
      ${info.about ? `<p class="ab">${esc(info.about)}</p>` : ''}
      <p class="st"><span><i class="on"></i>${info.online} çevrimiçi</span><span><i></i>${info.members} üye</span></p>
      <a class="b" id="ac" href="${esc(appLink)}">Xanaphian'da aç</a>
      <p class="n" id="not">Xanaphian açılmadıysa yüklü olmayabilir.</p>
      <a class="b ik" href="${esc(DOWNLOAD_URL)}" rel="noopener">Xanaphian'ı indir</a>
      <p class="n kc">Uygulamada "Bir topluluğa katıl" kutusuna bu bağlantıyı da yapıştırabilirsin:<br><code>${esc(link.replace(/^https?:\/\//, ''))}</code></p>`
    : `<h1>Davet geçersiz</h1>
      <p class="ab">Bu davet bağlantısı geçersiz ya da süresi dolmuş. Seni davet eden kişiden yeni bir bağlantı iste.</p>
      <a class="b ik" href="${esc(DOWNLOAD_URL)}" rel="noopener">Xanaphian'ı indir</a>`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
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
html,body{height:100%;margin:0}
body{background:#101216;color:#e7e9ee;font:16px/1.5 Rubik,"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px 16px}
main{width:100%;max-width:420px;background:#191c22;border:1px solid #262a33;border-radius:18px;padding:36px 30px 28px;text-align:center}
.ic{width:88px;height:88px;border-radius:26%;display:block;margin:0 auto 18px;object-fit:cover}
.tx{display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:600;color:#fff}
.bad{background:#3a2a2e;color:#f0a2ac}
.k{margin:0 0 4px;font-size:13px;color:#99a0ae}
h1{margin:0;font-size:24px;line-height:1.25;font-weight:600;overflow-wrap:anywhere}
.ab{margin:10px 0 0;color:#b5bac6;font-size:14.5px;overflow-wrap:anywhere}
.st{margin:14px 0 24px;display:flex;gap:18px;justify-content:center;flex-wrap:wrap;font-size:14px;color:#b5bac6}
.st i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#6c7383;margin-right:7px}
.st i.on{background:#3fb97c}
.b{display:block;width:100%;padding:13px 16px;border-radius:11px;background:#5b8def;color:#fff;font-weight:600;font-size:15.5px;text-decoration:none}
.b:hover{background:#6c99f2}
.b:focus-visible{outline:2px solid #fff;outline-offset:2px}
.b.ik{background:transparent;border:1px solid #333845;color:#e7e9ee;margin-top:8px}
.b.ik:hover{background:#20242c}
main>h1+.ab+.b{margin-top:24px}
.n{margin:16px 0 0;font-size:13px;color:#8d94a3}
.kc{margin-top:22px;padding-top:18px;border-top:1px solid #262a33}
code{display:inline-block;margin-top:6px;padding:4px 9px;border-radius:7px;background:#101216;color:#cfd4de;font:13px ui-monospace,Consolas,monospace;user-select:all;overflow-wrap:anywhere}
</style>
</head>
<body>
<main>
      ${icon}
      ${body}
</main>
${info ? `<script nonce="${nonce}">
(function(){
  var not=document.getElementById('not');
  // sayfa açılır açılmaz uygulamayı dene; kurulu değilse tarayıcı hiçbir şey yapmaz ve indirme düğmesi yerinde durur
  var t;
  window.addEventListener('blur',function(){ clearTimeout(t); not.textContent="Xanaphian açılıyor. Katılma penceresi uygulamada seni bekliyor."; });
  function ac(){
    t=setTimeout(function(){ not.textContent="Xanaphian açılmadı mı? Yüklü değilse aşağıdan indir, sonra bu sayfaya dön."; },2500);
    try{ location.href=${JSON.stringify(appLink)}; }catch(e){}
  }
  if(document.readyState==='complete') setTimeout(ac,100); else window.addEventListener('load',function(){ setTimeout(ac,100); });
})();
</script>` : ''}
</body>
</html>
`;
}
