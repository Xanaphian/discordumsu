// Sunucunun dışarıya attığı istekler (site odası başlığı ve simgesi) için güvenli getirici.
// Adresi kullanıcı verdiği için sunucu yalnız genel internet adreslerine bağlanır:
// bu makineye, iç ağa ya da özel aralıklara giden istekler (yönlendirmeyle gelenler dâhil) reddedilir.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';

/** Bu makinenin kendi adresleri (genel IP'si dâhil): sunucu kendi üstündeki diğer servislere istek atmasın */
function ownAddresses(): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) out.add(a.address.toLowerCase().split('%')[0]);
  return out;
}

/** Genel internette olmayan adres mi? (bu makine, özel ağlar, bağlantı-yerel, çok noktaya yayın…) */
export function blockedIp(ip: string): boolean {
  const v = ip.toLowerCase().split('%')[0];
  if (ownAddresses().has(v)) return true;
  if (net.isIPv4(v)) {
    const [a, b, c] = v.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (!net.isIPv6(v)) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return blockedIp(mapped[1]);
  // yalnız genel tek noktaya yayın aralığı (2000::/3) serbest; tünel ve belge aralıkları hariç
  if (!/^[23]/.test(v)) return true;
  return v.startsWith('2002:') || v.startsWith('2001:db8:') || /^2001:(0{1,4})?:/.test(v);
}

/** DNS yanıtındaki her adres genel olmalı (bağlanılan adres de bu listeden seçilir; sonradan değiştirilemez) */
const safeLookup: net.LookupFunction = (hostname, options, cb) => {
  dns.lookup(hostname, { ...(options as dns.LookupAllOptions), all: true }, (err, addrs) => {
    if (err) return cb(err, '', 0);
    const list = addrs as unknown as dns.LookupAddress[];
    if (!list.length || list.some((a) => blockedIp(a.address))) return cb(Object.assign(new Error('adres engellendi'), { code: 'EBLOCKED' }) as NodeJS.ErrnoException, '', 0);
    if ((options as dns.LookupAllOptions).all) (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    else cb(null, list[0].address, list[0].family);
  });
};

export interface Fetched {
  buf: Buffer;
  type: string;
  url: string;
}

export interface FetchOpts {
  /** yanıt `max` bayttan büyükse reddetme, ilk `max` baytı döndür (sayfa başlığı okumak için) */
  cut?: boolean;
  ua?: string;
}

/** En çok `max` baytlık bir yanıtı getirir; yönlendirmeleri (en çok 3) her adımda yeniden denetleyerek izler. */
export function fetchPublic(url: string, accept: string, max: number, hops = 0, opt: FetchOpts = {}): Promise<Fetched | null> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return resolve(null);
    }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return resolve(null);
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return resolve(null);
    if (net.isIP(host) && blockedIp(host)) return resolve(null);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { method: 'GET', headers: { accept, 'user-agent': opt.ua || 'Mozilla/5.0 KovanSunucu', 'accept-language': 'tr,en;q=0.8' }, lookup: safeLookup, agent: false }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        req.destroy();
        if (hops >= 3) return resolve(null);
        let next: string;
        try {
          next = new URL(res.headers.location, u).toString();
        } catch {
          return resolve(null);
        }
        return resolve(fetchPublic(next, accept, max, hops + 1, opt));
      }
      if (code < 200 || code >= 300 || (!opt.cut && Number(res.headers['content-length'] || 0) > max)) {
        req.destroy();
        return resolve(null);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (d: Buffer) => {
        size += d.length;
        if (size > max) {
          if (opt.cut) {
            chunks.push(d);
            resolve({ buf: Buffer.concat(chunks).subarray(0, max), type: String(res.headers['content-type'] || ''), url: u.toString() });
          } else resolve(null);
          req.destroy();
        } else chunks.push(d);
      });
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), type: String(res.headers['content-type'] || ''), url: u.toString() }));
      res.on('error', () => resolve(null));
    });
    const timer = setTimeout(() => req.destroy(), 8000);
    req.on('close', () => {
      clearTimeout(timer);
      resolve(null); // daha önce sonuçlandıysa etkisizdir
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}
