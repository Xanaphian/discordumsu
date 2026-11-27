// v1.68 hesap girişi (yalnız merkezi sunucu kipinde): e-posta / kullanıcı adı + şifre, cihaz anahtarları, QR ile giriş, şifre sıfırlama.
//
// Hesabın asıl gizli anahtarı (hub.json secretHash) değişmez. Şifreyle ya da QR ile giriş yapan her cihaz kendine özel,
// rastgele bir anahtar alır; sunucu yalnız onun özetini (sha256) saklar. Bu bilgiler hub.json'dan ayrı, giris.json'da durur.
// Şifreler scrypt ile (Node'un kendi kütüphanesi, ek paket yok) tuzlanıp özetlenir; düz şifre hiçbir yere yazılmaz.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';
import type { ClientFrame, ID, ServerFrame, UserPublic } from '../shared/protocol';
import {
  QR_SURE,
  epostaDuzelt,
  epostaHatasi,
  kullaniciAdiDuzelt,
  kullaniciAdiHatasi,
  sifreHatasi,
  SIFRE_MAX,
  type HesapGirisi,
} from '../shared/giris';

export interface GirisOptions {
  /** şifre sıfırlama e-postası gönderici (sunucudaki .env'de SMTP ayarı varsa) */
  mail?: (to: string, subject: string, text: string) => Promise<void>;
}

export interface GirisBaglantisi {
  /** kişi hesabı var mı (bot değil) */
  gercek(uid: ID): boolean;
  pub(uid: ID): UserPublic | undefined;
  /** bu cihaz anahtarıyla açılmış oturumları kapat */
  cihazKapat(uid: ID, h: string): void;
}

interface Cihaz {
  /** anahtarın sha256 özeti */
  h: string;
  at: number;
  ad: string;
}
interface Hesap {
  email: string;
  user: string;
  pw: string;
  pwAt: number;
  dev: Cihaz[];
}
interface Bekleyen {
  /** masaüstünün soru anahtarının özeti (QR'ı gören biri sonucu alamasın) */
  p: string;
  exp: number;
  ad: string;
  ip: string;
  uid?: ID;
  sonuc?: { id: ID; secret: string };
  red?: boolean;
}
interface Sifirlama {
  uid: ID;
  h: string;
  exp: number;
  deneme: number;
}

type GirisCercevesi = Extract<ClientFrame, { t: 'auth.me' | 'auth.set' | 'auth.out' | 'qr.scan' | 'qr.ok' | 'qr.no' }>;

const MIN = 60_000;
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
const cihazAdi = (v: unknown) => str(v, 60).replace(/[\u0000-\u001f]/g, '').trim() || 'Bilinmeyen cihaz';
const MAX_CIHAZ = 20;

// scrypt: N=2^14, r=8 → her özet ~16 MB bellek ve ~50 ms. Aynı anda en çok 4 özet hesaplanır, sıra 64'ü geçerse istek reddedilir.
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function scrypt(pw: string, salt: Buffer): Promise<Buffer> {
  return new Promise((ok, no) => crypto.scrypt(pw.normalize('NFKC'), salt, 64, SCRYPT, (e, k) => (e ? no(e) : ok(k))));
}
let calisan = 0;
const sira: (() => void)[] = [];
async function sirayla<T>(fn: () => Promise<T>): Promise<T> {
  if (calisan >= 4) {
    if (sira.length >= 64) throw new Error('mesgul');
    await new Promise<void>((r) => sira.push(r));
  }
  calisan++;
  try {
    return await fn();
  } finally {
    calisan--;
    sira.shift()?.();
  }
}
async function sifreOzeti(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const k = await sirayla(() => scrypt(pw, salt));
  return `s1$${salt.toString('base64')}$${k.toString('base64')}`;
}
const SAHTE = 's1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');
async function sifreDogru(pw: string, ozet: string): Promise<boolean> {
  const [v, s, h] = ozet.split('$');
  if (v !== 's1' || !s || !h) return false;
  const k = await sirayla(() => scrypt(pw, Buffer.from(s, 'base64')));
  const want = Buffer.from(h, 'base64');
  return want.length === k.length && crypto.timingSafeEqual(want, k);
}

/** Basit kayan pencere sayacı */
class Sayac {
  private m = new Map<string, number[]>();
  constructor(
    private pencere: number,
    private sinir: number,
  ) {}
  dolu(k: string) {
    const now = Date.now();
    const l = (this.m.get(k) || []).filter((t) => now - t < this.pencere);
    if (l.length) this.m.set(k, l);
    else this.m.delete(k);
    return l.length >= this.sinir;
  }
  ekle(k: string) {
    const now = Date.now();
    const l = (this.m.get(k) || []).filter((t) => now - t < this.pencere);
    l.push(now);
    this.m.set(k, l);
    if (this.m.size > 50_000) for (const [x, v] of this.m) if (now - v[v.length - 1] > this.pencere) this.m.delete(x);
  }
  sil(k: string) {
    this.m.delete(k);
  }
}

export class Giris {
  private hesaplar: Record<ID, Hesap> = {};
  private epostalar = new Map<string, ID>();
  private adlar = new Map<string, ID>();
  private qr = new Map<string, Bekleyen>();
  private sifirlama = new Map<string, Sifirlama>();
  private file: string;
  private yaziliyor: Promise<void> = Promise.resolve();

  private girisIp = new Sayac(15 * MIN, 30);
  private girisHesap = new Sayac(15 * MIN, 8);
  private qrIp = new Sayac(10 * MIN, 40);
  private unuttumIp = new Sayac(60 * MIN, 6);
  private unuttumHesap = new Sayac(60 * MIN, 3);
  private ayarKisi = new Sayac(60 * MIN, 10);
  private taramaKisi = new Sayac(10 * MIN, 20);

  constructor(
    dir: string,
    private bag: GirisBaglantisi,
    private opts: GirisOptions = {},
  ) {
    this.file = path.join(dir, 'giris.json');
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (j && typeof j.acc === 'object') this.hesaplar = j.acc;
    } catch {
      /* ilk açılış */
    }
    for (const [uid, a] of Object.entries(this.hesaplar)) {
      if (a.email) this.epostalar.set(a.email, uid);
      if (a.user) this.adlar.set(a.user, uid);
      if (!Array.isArray(a.dev)) a.dev = [];
    }
    setInterval(() => this.temizle(), MIN).unref?.();
  }

  get postaVar() {
    return !!this.opts.mail;
  }

  private temizle() {
    const now = Date.now();
    for (const [k, b] of this.qr) if (b.exp < now - MIN) this.qr.delete(k);
    for (const [k, r] of this.sifirlama) if (r.exp < now) this.sifirlama.delete(k);
  }

  /** Hemen diske yazar; yanıt yazma bittikten sonra verilir (sunucu kapanırsa yeni cihaz anahtarı kaybolmasın) */
  private kaydet(): Promise<void> {
    const data = JSON.stringify({ v: 1, acc: this.hesaplar });
    const run = async () => {
      const tmp = this.file + '.tmp';
      await fs.promises.writeFile(tmp, data, { mode: 0o600 });
      await fs.promises.rename(tmp, this.file);
    };
    this.yaziliyor = this.yaziliyor.then(run, run);
    return this.yaziliyor;
  }

  /** Bu anahtar hesabın şifreyle/QR ile giriş yapmış cihazlarından birinin mi? Öyleyse özetini döner. */
  cihaz(uid: ID, secret: string): string {
    const a = own(this.hesaplar, uid) ? this.hesaplar[uid] : undefined;
    if (!a || !secret) return '';
    const h = sha(secret);
    const d = a.dev.find((x) => x.h.length === h.length && crypto.timingSafeEqual(Buffer.from(x.h), Buffer.from(h)));
    return d ? d.h : '';
  }

  /** Hesap anahtarı yenilendi (v1.67): şifreyle ya da QR ile açılmış tüm cihazlar da çıkar */
  hepsiniKapat(uid: ID) {
    const a = own(this.hesaplar, uid) ? this.hesaplar[uid] : undefined;
    if (!a || !a.dev.length) return;
    for (const d of a.dev) this.bag.cihazKapat(uid, d.h);
    a.dev = [];
    void this.kaydet();
  }

  private async yeniCihaz(uid: ID, ad: string): Promise<string> {
    const a = this.hesaplar[uid] || (this.hesaplar[uid] = { email: '', user: '', pw: '', pwAt: 0, dev: [] });
    const secret = crypto.randomBytes(32).toString('hex');
    a.dev.push({ h: sha(secret), at: Date.now(), ad });
    if (a.dev.length > MAX_CIHAZ) a.dev.splice(0, a.dev.length - MAX_CIHAZ);
    await this.kaydet();
    return secret;
  }

  private bul(login: string): ID | undefined {
    const x = login.trim().toLowerCase();
    const uid = x.includes('@') && !x.startsWith('@') ? this.epostalar.get(x) : this.adlar.get(kullaniciAdiDuzelt(x));
    return uid && this.bag.gercek(uid) && this.hesaplar[uid]?.pw ? uid : undefined;
  }

  me(uid: ID): HesapGirisi {
    const a = own(this.hesaplar, uid) ? this.hesaplar[uid] : undefined;
    return { hasPassword: !!a?.pw, email: a?.email || undefined, username: a?.user || undefined, devices: a?.dev.length || 0, mail: this.postaVar };
  }

  // ---------- bağlı oturumdan gelen çerçeveler ----------
  handle(uid: ID, dev: string, f: ClientFrame, send: (x: ServerFrame) => void): boolean {
    if (!['auth.me', 'auth.set', 'auth.out', 'qr.scan', 'qr.ok', 'qr.no'].includes(f.t)) return false;
    const g = f as GirisCercevesi;
    const rid = g.rid;
    const err = (msg: string) => send({ t: 'err', rid, msg });
    if (!this.bag.gercek(uid)) return err('Bu hesapla giriş ayarı yapılamaz.'), true;
    switch (g.t) {
      case 'auth.me':
        send({ t: 'ok', rid, data: this.me(uid) });
        return true;
      case 'auth.set':
        this.ayarla(uid, dev, g).then(
          (m) => (m ? err(m) : send({ t: 'ok', rid, data: this.me(uid) })),
          () => err('Şu an çok yoğun, biraz sonra yeniden dene.'),
        );
        return true;
      case 'auth.out': {
        // bu oturum dışındaki şifre/QR cihazlarından çık
        const a = this.hesaplar[uid];
        if (a) {
          const kalan = a.dev.filter((d) => d.h === dev);
          for (const d of a.dev) if (d.h !== dev) this.bag.cihazKapat(uid, d.h);
          a.dev = kalan;
          void this.kaydet();
        }
        send({ t: 'ok', rid, data: this.me(uid) });
        return true;
      }
      case 'qr.scan': {
        if (this.taramaKisi.dolu(uid)) return err('Kısa sürede çok fazla kod okuttun, biraz bekle.'), true;
        this.taramaKisi.ekle(uid);
        const b = this.qr.get(str(g.k, 64));
        if (!b || b.exp < Date.now() || b.red || b.sonuc) return err('Bu kodun süresi dolmuş. Bilgisayardaki kodu yenileyip yeniden okut.'), true;
        if (b.uid && b.uid !== uid) return err('Bu kod başka bir hesapla okutuldu.'), true;
        b.uid = uid;
        send({ t: 'ok', rid, data: { device: b.ad, at: Date.now() } });
        return true;
      }
      case 'qr.ok':
      case 'qr.no': {
        const b = this.qr.get(str(g.k, 64));
        if (!b || b.uid !== uid || b.exp < Date.now() || b.red || b.sonuc) return err('Bu kodun süresi dolmuş. Bilgisayardaki kodu yenileyip yeniden okut.'), true;
        if (g.t === 'qr.no') {
          b.red = true;
          send({ t: 'ok', rid });
          return true;
        }
        this.yeniCihaz(uid, b.ad).then(
          (secret) => {
            b.sonuc = { id: uid, secret };
            send({ t: 'ok', rid });
          },
          () => err('Giriş kaydedilemedi, yeniden dene.'),
        );
        return true;
      }
    }
    return false;
  }

  /** E-posta, kullanıcı adı, şifre belirle/değiştir. Hata metni ya da '' döner. */
  private async ayarla(uid: ID, dev: string, f: Extract<ClientFrame, { t: 'auth.set' }>): Promise<string> {
    if (this.ayarKisi.dolu(uid)) return 'Kısa sürede çok fazla değişiklik yaptın, bir saat sonra yeniden dene.';
    this.ayarKisi.ekle(uid);
    const a = own(this.hesaplar, uid) ? this.hesaplar[uid] : undefined;
    if (a?.pw) {
      if (!(await sifreDogru(str(f.current, SIFRE_MAX + 1), a.pw))) return 'Şu anki şifren yanlış.';
    }
    const email = f.email !== undefined ? epostaDuzelt(str(f.email, 300)) : a?.email || '';
    const user = f.username !== undefined ? kullaniciAdiDuzelt(str(f.username, 100)) : a?.user || '';
    const pw = typeof f.password === 'string' ? f.password : '';
    const e1 = epostaHatasi(email) || kullaniciAdiHatasi(user);
    if (e1) return e1;
    if (!a?.pw && !pw) return 'Bir şifre belirle.';
    if (pw) {
      const e2 = sifreHatasi(pw);
      if (e2) return e2;
    }
    const eSahip = this.epostalar.get(email);
    if (eSahip && eSahip !== uid) return 'Bu e-posta başka bir hesapta kullanılıyor.';
    const aSahip = this.adlar.get(user);
    if (aSahip && aSahip !== uid) return 'Bu kullanıcı adı alınmış, başka bir tane dene.';
    const ozet = pw ? await sifreOzeti(pw) : a!.pw;
    // özet hesaplanırken başka biri aynı adı almış olabilir
    if ((this.epostalar.get(email) || uid) !== uid || (this.adlar.get(user) || uid) !== uid) return 'Bu e-posta ya da kullanıcı adı az önce alındı.';
    const h = this.hesaplar[uid] || (this.hesaplar[uid] = { email: '', user: '', pw: '', pwAt: 0, dev: [] });
    if (h.email && h.email !== email) this.epostalar.delete(h.email);
    if (h.user && h.user !== user) this.adlar.delete(h.user);
    h.email = email;
    h.user = user;
    this.epostalar.set(email, uid);
    this.adlar.set(user, uid);
    if (pw) {
      const vardi = !!h.pw;
      h.pw = ozet;
      h.pwAt = Date.now();
      // şifre değişince bu oturum dışındaki şifre/QR cihazları çıkar
      if (vardi) {
        for (const d of h.dev) if (d.h !== dev) this.bag.cihazKapat(uid, d.h);
        h.dev = h.dev.filter((d) => d.h === dev);
      }
    }
    await this.kaydet();
    return '';
  }

  // ---------- kimliksiz HTTP uçları ----------
  /** /auth/... isteklerini karşılar; başka bir adresse false döner */
  handleHttp(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ip: string): boolean {
    if (!url.pathname.startsWith('/auth/')) return false;
    const json = (code: number, body: unknown) => void res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
    if (req.method !== 'POST') return json(405, { msg: 'Yöntem desteklenmiyor.' }), true;
    const ipKey = ip || 'bilinmiyor';
    let size = 0;
    const parts: Buffer[] = [];
    req.on('data', (d: Buffer) => {
      size += d.length;
      if (size > 4096) req.destroy();
      else parts.push(d);
    });
    req.on('end', () => {
      let body: Record<string, unknown> = {};
      try {
        const j = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
        if (j && typeof j === 'object') body = j;
      } catch {
        return json(400, { msg: 'Geçersiz istek.' });
      }
      this.http(url.pathname, body, ipKey).then(
        ([code, out]) => json(code, out),
        (e) => json((e as Error)?.message === 'mesgul' ? 503 : 500, { msg: 'Şu an çok yoğun, biraz sonra yeniden dene.' }),
      );
    });
    return true;
  }

  private async http(p: string, b: Record<string, unknown>, ip: string): Promise<[number, unknown]> {
    const cevap = (uid: ID, secret: string): [number, unknown] => [200, { id: uid, secret, user: this.bag.pub(uid) }];
    switch (p) {
      case '/auth/login': {
        const login = str(b.login, 300);
        const pw = str(b.password, SIFRE_MAX + 1);
        if (!login || !pw) return [400, { msg: 'E-posta / kullanıcı adı ve şifreni yaz.' }];
        const uid = this.bul(login);
        const hk = uid || 'yok:' + login.toLowerCase();
        if (this.girisIp.dolu(ip) || this.girisHesap.dolu(hk)) return [429, { msg: 'Çok fazla hatalı deneme. 15 dakika sonra yeniden dene.' }];
        // hesap yoksa da aynı süre beklensin (hangi adların kayıtlı olduğu süreden anlaşılmasın)
        const ok = await sifreDogru(pw, uid ? this.hesaplar[uid].pw : SAHTE);
        if (!uid || !ok) {
          this.girisIp.ekle(ip);
          this.girisHesap.ekle(hk);
          return [401, { msg: 'E-posta / kullanıcı adı ya da şifre yanlış.' }];
        }
        this.girisHesap.sil(hk);
        return cevap(uid, await this.yeniCihaz(uid, cihazAdi(b.device)));
      }
      case '/auth/qr': {
        if (this.qrIp.dolu(ip)) return [429, { msg: 'Kısa sürede çok fazla kod istendi, biraz bekle.' }];
        this.qrIp.ekle(ip);
        if (this.qr.size > 20_000) this.temizle();
        if (this.qr.size > 20_000) return [503, { msg: 'Şu an çok yoğun, biraz sonra yeniden dene.' }];
        const k = crypto.randomBytes(32).toString('base64url');
        const pSecret = crypto.randomBytes(32).toString('base64url');
        const exp = Date.now() + QR_SURE;
        this.qr.set(k, { p: sha(pSecret), exp, ad: cihazAdi(b.device), ip });
        return [200, { k, p: pSecret, exp, ms: QR_SURE }];
      }
      case '/auth/qr/durum': {
        const k = str(b.k, 64);
        const q = this.qr.get(k);
        if (!q || q.p !== sha(str(b.p, 64))) return [404, { state: 'yok' }];
        if (q.red) return this.qr.delete(k), [200, { state: 'red' }];
        if (q.sonuc) {
          this.qr.delete(k);
          return cevap(q.sonuc.id, q.sonuc.secret);
        }
        if (q.exp < Date.now()) return this.qr.delete(k), [200, { state: 'bitti' }];
        return [200, { state: q.uid ? 'okundu' : 'bekliyor', user: q.uid ? this.bag.pub(q.uid) : undefined }];
      }
      case '/auth/unuttum': {
        if (!this.opts.mail) return [503, { msg: 'Şifre sıfırlama e-postası bu sunucuda henüz açık değil.' }];
        const email = epostaDuzelt(str(b.email, 300));
        if (epostaHatasi(email)) return [400, { msg: epostaHatasi(email) }];
        if (this.unuttumIp.dolu(ip)) return [429, { msg: 'Kısa sürede çok fazla istek. Bir saat sonra yeniden dene.' }];
        this.unuttumIp.ekle(ip);
        const uid = this.bul(email);
        // kayıtlı olsun olmasın aynı cevap: hangi e-postaların kayıtlı olduğu öğrenilemesin
        if (uid && !this.unuttumHesap.dolu(uid)) {
          this.unuttumHesap.ekle(uid);
          const kod = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
          this.sifirlama.set(email, { uid, h: sha(email + ':' + kod), exp: Date.now() + 15 * MIN, deneme: 0 });
          const ad = this.bag.pub(uid)?.name || '';
          this.opts
            .mail(
              email,
              'Xanaphian şifre sıfırlama kodu',
              `Merhaba ${ad},\n\nXanaphian şifreni sıfırlamak için kodun: ${kod}\n\nKod 15 dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok say; şifren değişmez.\n`,
            )
            .catch((e) => console.error('sıfırlama e-postası gönderilemedi', (e as Error)?.message));
        }
        return [200, { ok: true }];
      }
      case '/auth/sifirla': {
        const email = epostaDuzelt(str(b.email, 300));
        const kod = str(b.code, 12).replace(/\s/g, '');
        const pw = str(b.password, SIFRE_MAX + 1);
        const r = this.sifirlama.get(email);
        if (!r || r.exp < Date.now() || r.deneme >= 5) return [400, { msg: 'Kodun süresi dolmuş. Yeniden kod iste.' }];
        r.deneme++;
        const h = sha(email + ':' + kod);
        if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(r.h))) return [400, { msg: 'Kod yanlış.' }];
        const e = sifreHatasi(pw);
        if (e) return (r.deneme--, [400, { msg: e }]);
        const a = this.hesaplar[r.uid];
        if (!a || !this.bag.gercek(r.uid)) return [400, { msg: 'Kodun süresi dolmuş. Yeniden kod iste.' }];
        this.sifirlama.delete(email);
        a.pw = await sifreOzeti(pw);
        a.pwAt = Date.now();
        // şifre sıfırlanınca şifre/QR ile açılmış eski cihazlar çıkar
        for (const d of a.dev) this.bag.cihazKapat(r.uid, d.h);
        a.dev = [];
        return cevap(r.uid, await this.yeniCihaz(r.uid, cihazAdi(b.device)));
      }
    }
    return [404, { msg: 'Bulunamadı.' }];
  }
}
