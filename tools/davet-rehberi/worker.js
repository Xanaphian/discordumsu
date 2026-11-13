// Kovan davet rehberi: "xanaphian/s3gas25" gibi adlı davetlerdeki adı, o kişinin Kovan adreslerine çevirir.
// Cloudflare Workers + KV. Yalnızca ad → adres listesi tutar; topluluk, mesaj ya da davet kodu saklamaz.
const NAME_RE = /^[a-z][a-z0-9-]{2,23}$/;
const RESERVED = new Set(['kovan', 'admin', 'api', 'www', 'davet', 'invite', 'destek', 'support', 'root', 'sistem']);
const HOST_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9.-]{1,63}):\d{2,5}$/i;
const TTL = 60 * 24 * 3600; // 60 gün: kullanılmayan adlar kendiliğinden boşalır

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } });

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cleanHosts(list, port) {
  const out = [];
  for (const h of Array.isArray(list) ? list : []) {
    if (typeof h !== 'string') continue;
    const v = h.trim().toLowerCase();
    if (v.length <= 70 && HOST_RE.test(v) && !out.includes(v)) out.push(v);
    if (out.length >= 8) break;
  }
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/' || url.pathname === '') return json({ ok: true, service: 'kovan-davet-rehberi', v: 1 });
    const m = /^\/v1\/ad\/([^/]+)$/.exec(url.pathname);
    if (!m) return json({ error: 'Bulunamadı' }, 404);
    const name = decodeURIComponent(m[1]).toLowerCase();
    if (!NAME_RE.test(name)) return json({ error: 'Ad 3-24 karakter olmalı; küçük harf, rakam ve tire içerebilir, harfle başlamalı.' }, 400);
    const raw = await env.NAMES.get(name);
    const rec = raw ? JSON.parse(raw) : null;

    if (req.method === 'GET') {
      if (!rec) return json({ error: 'Bu ad kayıtlı değil.' }, 404);
      const hosts = [...(rec.pub ? [rec.pub] : []), ...rec.hosts.filter((h) => h !== rec.pub)];
      return json({ name, hosts, t: rec.t });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Geçersiz istek.' }, 400);
    }
    const key = typeof body?.key === 'string' ? body.key : '';
    if (key.length < 24 || key.length > 128) return json({ error: 'Geçersiz anahtar.' }, 400);
    const kh = await sha256(key);
    if (rec && rec.kh !== kh) return json({ error: 'Bu ad başkası tarafından alınmış.' }, 409);

    if (req.method === 'DELETE') {
      if (rec) await env.NAMES.delete(name);
      return json({ ok: true });
    }
    if (req.method !== 'PUT') return json({ error: 'Desteklenmiyor.' }, 405);
    if (!rec && RESERVED.has(name)) return json({ error: 'Bu ad ayrılmış, başka bir ad seç.' }, 409);
    const port = Number.isInteger(body.port) && body.port > 0 && body.port < 65536 ? body.port : 47820;
    const ip = req.headers.get('cf-connecting-ip') || '';
    const pub = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? `${ip}:${port}` : null;
    const hosts = cleanHosts(body.hosts, port);
    const next = { kh, hosts, pub, t: Date.now() };
    // ücretsiz KV'de yazma sınırlı: değişiklik yoksa günde en fazla bir kez yaz
    const same = rec && rec.pub === pub && JSON.stringify(rec.hosts) === JSON.stringify(hosts) && Date.now() - rec.t < 24 * 3600 * 1000;
    if (!same) await env.NAMES.put(name, JSON.stringify(next), { expirationTtl: TTL });
    return json({ ok: true, name, pub });
  },
};
