/* functions/davet/[[yol]].js — Xanaphian (sohbet uygulaması) davet bağlantıları
 *
 * https://xanaphian.com/davet/<kod>        → davet sayfası (topluluğun adı, resmi, üye sayısı + "Xanaphian'da aç")
 * https://xanaphian.com/davet/<kod>/simge  → topluluğun resmi (sayfa ve bağlantı önizlemesi için)
 *
 * Sayfayı sohbet sunucusu üretir (VDS, /kovan/davet/<kod>); burası yalnız aktarır. Kaynağı uygulamanın
 * deposunda durur: Xanaphian/discordumsu → server/site/. Değişiklik orada yapılır, buraya kopyalanır.
 * Sunucuya ulaşılamazsa (ya da sunucu henüz davet sayfasını bilmiyorsa) sade bir yedek sayfa gösterilir:
 * uygulama kodu kendisi çözdüğü için "Xanaphian'da aç" yine çalışır.
 * Yalnız GET/HEAD; kod 7 harf-rakam; istek gövdesi, çerez ve sorgu aktarılmaz.
 */
const SUNUCU = "https://45-87-173-18.sslip.io/kovan";
const INDIR = "https://github.com/Xanaphian/discordumsu/releases/latest";
const GUVENLIK = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-robots-tag": "noindex",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};
const AKTARILAN = ["content-type", "content-security-policy", "cache-control"];

function yanit(govde, status, basliklar) {
  const h = new Headers(basliklar);
  for (const k in GUVENLIK) h.set(k, GUVENLIK[k]);
  return new Response(govde, { status, headers: h });
}

function yedekSayfa(kod, status) {
  const gecerli = !!kod;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="dark">
<title>${gecerli ? "Xanaphian daveti" : "Davet geçersiz"} · Xanaphian</title>
<style>*{box-sizing:border-box}html,body{height:100%;margin:0}body{background:#101216;color:#e7e9ee;font:16px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px 16px}main{width:100%;max-width:420px;background:#191c22;border:1px solid #262a33;border-radius:18px;padding:36px 30px 28px;text-align:center}h1{margin:0;font-size:24px;font-weight:600}p{margin:10px 0 22px;color:#b5bac6;font-size:14.5px}.b{display:block;padding:13px 16px;border-radius:11px;background:#5b8def;color:#fff;font-weight:600;text-decoration:none}.b.ik{background:transparent;border:1px solid #333845;color:#e7e9ee;margin-top:8px}</style></head>
<body><main>${
    gecerli
      ? `<h1>Bir topluluğa davet edildin</h1><p>Daveti Xanaphian uygulamasında açıp katılabilirsin.</p><a class="b" href="xanaphian://davet/${kod}">Xanaphian'da aç</a>`
      : `<h1>Davet geçersiz</h1><p>Bu davet bağlantısı geçersiz ya da süresi dolmuş. Seni davet eden kişiden yeni bir bağlantı iste.</p>`
  }<a class="b ik" href="${INDIR}" rel="noopener">Xanaphian'ı indir</a></main></body></html>`;
  return yanit(html, status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
}

export async function onRequest({ request }) {
  if (request.method !== "GET" && request.method !== "HEAD") return yanit("", 405, { allow: "GET, HEAD" });
  const u = new URL(request.url);
  const e = /^\/davet\/([A-Za-z0-9]{7})(\/simge)?\/?$/.exec(u.pathname);
  if (!e) return yedekSayfa("", 404);
  const kod = e[1].toLowerCase();
  const simge = !!e[2];
  let r;
  try {
    r = await fetch(`${SUNUCU}/davet/${kod}${simge ? "/simge" : ""}`, {
      method: "GET",
      redirect: "manual",
      headers: { accept: simge ? "image/*" : "text/html" },
      signal: AbortSignal.timeout(6000),
    });
  } catch (hata) {
    return simge ? yanit("", 502, {}) : yedekSayfa(kod, 200);
  }
  if (simge) {
    const tur = r.headers.get("content-type") || "";
    if (r.status !== 200 || !/^image\/(png|jpeg|gif|webp|avif)$/.test(tur)) return yanit("", 404, { "cache-control": "no-store" });
    return yanit(r.body, 200, { "content-type": tur, "cache-control": "public, max-age=300", "content-security-policy": "default-src 'none'; sandbox" });
  }
  /* sunucu davet sayfasını bilmiyorsa (eski sürüm) ya da beklenmedik bir yanıt verdiyse: yedek sayfa */
  if (r.headers.get("x-xanaphian-davet") !== "1" || (r.status !== 200 && r.status !== 404)) return yedekSayfa(kod, 200);
  const h = {};
  for (const k of AKTARILAN) if (r.headers.get(k)) h[k] = r.headers.get(k);
  return yanit(request.method === "HEAD" ? null : r.body, r.status, h);
}
