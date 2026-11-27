// Kovan merkezi sunucusu: masaüstü uygulamasındaki hub'ı Electron olmadan, sunucu kipinde çalıştırır.
// Ortam değişkenleri (sunucudaki .env dosyasından gelir):
//   KOVAN_PORT     dinlenecek port (varsayılan 47900)
//   KOVAN_HOST     dinlenecek adres (varsayılan 127.0.0.1; önünde nginx durur)
//   KOVAN_DATA     veri klasörü (varsayılan ./data)
//   KOVAN_SECRET   bot API anahtarlarını diskte şifrelemek için uzun rastgele bir dize (isteğe bağlı)
//   KOVAN_MAX_OWNED kişi başı kurulabilecek topluluk sayısı (varsayılan 20)
//   KOVAN_ADMINS   hata bildirimlerini görebilen kullanıcı kimlikleri, virgülle ayrılır (isteğe bağlı)
//   KOVAN_TURN_URLS / KOVAN_TURN_SECRET  ses için aktarma (TURN) sunucusu; turn-kur.sh yazar (isteğe bağlı)
//   KOVAN_UPLOAD_MB_HOUR kişi başı saatlik yükleme sınırı, MB (varsayılan 1024)
//   KOVAN_UPLOAD_PER_10MIN kişi başı 10 dakikada en çok dosya (varsayılan 60)
//   KOVAN_MIN_FREE_MB diskte bu kadar boş yer kalmazsa yükleme durur (varsayılan 1024)
//   KOVAN_IMPORT_MB topluluk taşıma paketinin en büyük boyutu, MB (varsayılan 64)
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Hub } from '../src/main/hub';
import { fetchPublic } from './guvenli-getir';
import { parseLinkMeta } from '../src/shared/onizleme';
import { smtpGonderici } from './eposta';

const env = process.env;
const port = Number(env.KOVAN_PORT) || 47900;
const host = env.KOVAN_HOST || '127.0.0.1';
const dataDir = path.resolve(env.KOVAN_DATA || './data');

const list = (v?: string) => (v || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
const num = (v?: string) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
const turnUrls = list(env.KOVAN_TURN_URLS);
const hub = new Hub(dataDir, {
  server: true,
  maxOwned: Number(env.KOVAN_MAX_OWNED) || 20,
  importMaxMb: Number(env.KOVAN_IMPORT_MB) > 0 ? Number(env.KOVAN_IMPORT_MB) : undefined,
  ek: {
    admins: list(env.KOVAN_ADMINS),
    turn: turnUrls.length && env.KOVAN_TURN_SECRET ? { urls: turnUrls, secret: env.KOVAN_TURN_SECRET } : undefined,
    upload: { mbPerHour: num(env.KOVAN_UPLOAD_MB_HOUR), perTenMin: num(env.KOVAN_UPLOAD_PER_10MIN), minFreeMb: num(env.KOVAN_MIN_FREE_MB) },
  },
  // v1.68 şifre sıfırlama e-postası: SMTP ayarı .env'de yoksa "Şifremi unuttum" kapalı kalır
  giris: {
    // sınamalarda misafir kısıtı kapatılabilir (sahte kişiler e-posta doğrulayamaz)
    misafir: env.KOVAN_MISAFIR !== 'kapali',
    mail:
      env.KOVAN_SMTP_HOST && env.KOVAN_SMTP_USER && env.KOVAN_SMTP_PASS
        ? smtpGonderici({ host: env.KOVAN_SMTP_HOST, port: Number(env.KOVAN_SMTP_PORT) || 465, user: env.KOVAN_SMTP_USER, pass: env.KOVAN_SMTP_PASS, from: env.KOVAN_SMTP_FROM || env.KOVAN_SMTP_USER })
        : env.KOVAN_EPOSTA_DOSYA
          ? // yalnız sınamalar için: e-posta gönderilmez, dosyaya satır olarak yazılır
            async (to: string, subject: string, text: string) => void fs.appendFileSync(env.KOVAN_EPOSTA_DOSYA!, JSON.stringify({ to, subject, text }) + '\n')
          : undefined,
  },
});

if (env.KOVAN_SECRET && env.KOVAN_SECRET.length >= 16) {
  const key = crypto.createHash('sha256').update(env.KOVAN_SECRET).digest();
  hub.crypt = {
    enc(s: string) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const out = Buffer.concat([c.update(s, 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), out]).toString('base64');
    },
    dec(s: string) {
      const b = Buffer.from(s, 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    },
  };
}

// Site odaları için başlık + simge. Adres kullanıcıdan geldiği için yalnız genel internet adreslerine istek atılır (guvenli-getir.ts).
const fetchLimited = fetchPublic;
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

hub.siteMeta = async (pageUrl: string) => {
  const page = await fetchLimited(pageUrl, 'text/html', 2_000_000).catch(() => null);
  let title = '';
  const cands: string[] = [];
  const base = page?.url || pageUrl;
  if (page && /html/.test(page.type || 'text/html')) {
    const head = page.buf.toString('utf8').slice(0, 400_000).split(/<\/head>/i)[0];
    title = decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
      const rel = (attr(tag, 'rel') || '').toLowerCase();
      const href = attr(tag, 'href');
      if (href && /\bicon\b/.test(rel) && !/mask-icon/.test(rel)) cands.push(href);
    }
  }
  cands.push('/favicon.ico');
  let icon: string | undefined;
  for (const href of cands.slice(0, 4)) {
    let abs: string;
    try {
      abs = new URL(href, base).toString();
    } catch {
      continue;
    }
    if (abs.startsWith('data:image/')) {
      if (abs.length <= 60_000) icon = abs;
      if (icon) break;
      continue;
    }
    if (!/^https?:/i.test(abs)) continue;
    const r = await fetchLimited(abs, 'image/*', 200_000).catch(() => null);
    if (!r || !r.buf.length) continue;
    const mime = /^image\//.test(r.type) ? r.type.split(';')[0] : 'image/x-icon';
    icon = `data:${mime};base64,${r.buf.toString('base64')}`;
    if (icon.length <= 60_000) break;
    icon = undefined;
  }
  return title || icon ? { title: title || undefined, icon } : null;
};

// Bağlantı önizlemesi (v1.67): sayfayı ve görselini sunucu getirir; üyenin adresi karşı siteye gitmez.
// Görsel küçültülmeden (en çok 3 MB) gönderilir, uygulama gösterirken küçültür.
const PREVIEW_UA = 'Mozilla/5.0 (compatible; XanaphianBot/1.0; +https://xanaphian.com)';
const dataUrl = (r: { buf: Buffer; type: string }) => `data:${r.type.split(';')[0].trim().toLowerCase()};base64,${r.buf.toString('base64')}`;
const isImage = (type: string) => /^image\/(png|jpe?g|gif|webp|avif|bmp)\b/i.test(type.trim());
/** Yalnız otomatik sınama için: verilirse sayfalar bu adresten alınır (?u=<adres>); gerçek sunucuda ayarlanmaz */
const LINK_MIRROR = env.KOVAN_LINK_MIRROR || '';
async function getPreview(url: string, accept: string, max: number, cut = false) {
  if (!LINK_MIRROR) return fetchPublic(url, accept, max, 0, { cut, ua: PREVIEW_UA });
  const r = await fetch(`${LINK_MIRROR}/?u=${encodeURIComponent(url)}`, { headers: { accept }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > max && !cut) return null;
  return { buf: buf.subarray(0, max), type: r.headers.get('content-type') || '', url };
}
hub.linkMeta = async (raw: string) => {
  const page = await getPreview(raw, 'text/html,application/xhtml+xml,image/*;q=0.8', 700_000, true).catch(() => null);
  if (!page) return null;
  if (isImage(page.type)) {
    // adres doğrudan bir görsel: kesik gelmiş olabilir, bütününü al
    const img = page.buf.length < 700_000 ? page : await getPreview(page.url, 'image/*', 3_000_000).catch(() => null);
    return img && isImage(img.type) && img.buf.length ? { url: raw, image: dataUrl(img), direct: true } : null;
  }
  if (page.type && !/html|xml/i.test(page.type)) return null;
  const { meta, imageUrl } = parseLinkMeta(page.buf.toString('utf8'), page.url, raw);
  if (imageUrl) {
    const img = await getPreview(imageUrl, 'image/*', 3_000_000).catch(() => null);
    if (img && isImage(img.type) && img.buf.length) meta.image = dataUrl(img);
  }
  return meta.title || meta.desc || meta.image ? meta : null;
};

hub
  .start(port, host)
  .then((p) => {
    if (p !== port) {
      console.error(`Port ${port} dolu, ${p} açıldı. KOVAN_PORT'u değiştir.`);
      hub.stop();
      process.exit(1);
    }
    console.log(`Kovan sunucusu çalışıyor: http://${host}:${p} (veri: ${dataDir})`);
    setTimeout(() => hub.refreshAllSiteMeta(), 4000);
  })
  .catch((e) => {
    console.error('Sunucu başlatılamadı', e);
    process.exit(1);
  });

// Tek bir isteğin beklenmedik hatası bütün sunucuyu (ve bağlı herkesi) düşürmesin: kaydet, çalışmaya devam et.
process.on('uncaughtException', (e) => console.error('Beklenmeyen hata (sunucu çalışmaya devam ediyor):', e));
process.on('unhandledRejection', (e) => console.error('Yakalanmamış söz hatası:', e));

const bye = () => {
  console.log('Kapanıyor, kayıtlar yazılıyor…');
  hub.stop();
  process.exit(0);
};
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
