// Kovan merkezi sunucusu: masaüstü uygulamasındaki hub'ı Electron olmadan, sunucu kipinde çalıştırır.
// Ortam değişkenleri (sunucudaki .env dosyasından gelir):
//   KOVAN_PORT     dinlenecek port (varsayılan 47900)
//   KOVAN_HOST     dinlenecek adres (varsayılan 127.0.0.1; önünde nginx durur)
//   KOVAN_DATA     veri klasörü (varsayılan ./data)
//   KOVAN_SECRET   bot API anahtarlarını diskte şifrelemek için uzun rastgele bir dize (isteğe bağlı)
//   KOVAN_MAX_OWNED kişi başı kurulabilecek topluluk sayısı (varsayılan 20)
import crypto from 'node:crypto';
import path from 'node:path';
import { Hub } from '../src/main/hub';

const env = process.env;
const port = Number(env.KOVAN_PORT) || 47900;
const host = env.KOVAN_HOST || '127.0.0.1';
const dataDir = path.resolve(env.KOVAN_DATA || './data');

const hub = new Hub(dataDir, { server: true, maxOwned: Number(env.KOVAN_MAX_OWNED) || 20 });

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

// Site odaları için başlık + simge (Electron yok; düz fetch)
async function fetchLimited(url: string, accept: string, max: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { accept, 'user-agent': 'Mozilla/5.0 KovanSunucu' }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) return null;
    const len = Number(r.headers.get('content-length') || 0);
    if (len > max) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) return null;
    return { buf, type: r.headers.get('content-type') || '', url: r.url };
  } finally {
    clearTimeout(t);
  }
}
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

const bye = () => {
  console.log('Kapanıyor, kayıtlar yazılıyor…');
  hub.stop();
  process.exit(0);
};
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
