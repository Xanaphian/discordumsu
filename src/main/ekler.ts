// v1.50 sunucu ekleri (hub.ts'i şişirmemek için ayrı): hata bildirimleri, yükleme kotası, TURN kimliği.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { makeId, type ClientFrame, type ID, type ServerFrame } from '../shared/protocol';
import { ERR_MAX_ITEMS, ERR_MSG_MAX, ERR_STACK_MAX, FEAT_ADMIN, FEAT_DM_QUIET, FEAT_ICE, FEAT_REPORT, type ErrReport, type IceInfo } from '../shared/ekler';

export interface EkOptions {
  /** hata bildirimlerini görebilen kullanıcılar (KOVAN_ADMINS) */
  admins?: ID[];
  /** ses için aktarma sunucusu (KOVAN_TURN_URLS + KOVAN_TURN_SECRET) */
  turn?: { urls: string[]; secret: string; ttl?: number };
  /** kişi başı yükleme sınırı; verilmezse varsayılanlar */
  upload?: { mbPerHour?: number; perTenMin?: number; minFreeMb?: number };
}

const MAX_REPORTS = 300;
const HOUR = 3600_000;
const clamp = (v: unknown, n: number) => (typeof v === 'string' ? v : '').slice(0, n);

type EkFrame = Extract<ClientFrame, { t: 'err.report' | 'err.list' | 'err.clear' | 'ice' }>;

export class Ekler {
  private reports: ErrReport[] = [];
  private file: string;
  private timer: NodeJS.Timeout | null = null;
  private admins: Set<ID>;
  /** hata bildirimi hız sınırı: kullanıcı -> son 10 dakikadaki bildirim anları */
  private reportRate = new Map<ID, number[]>();
  /** yükleme kotası: kullanıcı -> son bir saatteki yüklemeler */
  private uploads = new Map<ID, { at: number; bytes: number }[]>();

  constructor(
    private dir: string,
    private opts: EkOptions = {},
  ) {
    this.admins = new Set(opts.admins || []);
    this.file = path.join(dir, 'reports.json');
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(j?.reports)) this.reports = j.reports;
    } catch {
      /* henüz bildirim yok */
    }
  }

  isAdmin(uid: ID) {
    return this.admins.has(uid);
  }

  /** ready.feats'e eklenecek özellikler */
  feats(uid: ID): string[] {
    return [FEAT_REPORT, FEAT_DM_QUIET, ...(this.isAdmin(uid) ? [FEAT_ADMIN] : []), ...(this.opts.turn ? [FEAT_ICE] : [])];
  }

  handle(uid: ID, f: ClientFrame, send: (x: ServerFrame) => void): boolean {
    if (f.t !== 'err.report' && f.t !== 'err.list' && f.t !== 'err.clear' && f.t !== 'ice') return false;
    const x = f as EkFrame;
    switch (x.t) {
      case 'err.report': {
        const now = Date.now();
        const recent = (this.reportRate.get(uid) || []).filter((t) => now - t < 600_000);
        if (recent.length >= 6) return send({ t: 'err', msg: 'Kısa sürede çok bildirim gönderdin, biraz sonra yeniden dene.', rid: x.rid }), true;
        recent.push(now);
        this.reportRate.set(uid, recent);
        const ver = clamp(x.ver, 20);
        const os = clamp(x.os, 80);
        for (const it of (Array.isArray(x.items) ? x.items : []).slice(0, ERR_MAX_ITEMS)) {
          const where = clamp(it?.where, 40);
          const msg = clamp(it?.msg, ERR_MSG_MAX);
          const stack = clamp(it?.stack, ERR_STACK_MAX);
          if (!msg && !stack) continue;
          // aynı sürümde aynı yerde aynı hata: tek kayıt, sayaç artar (kim gönderdi saklanmaz)
          const old = this.reports.find((r) => r.ver === ver && r.where === where && r.msg === msg && r.stack.slice(0, 200) === stack.slice(0, 200));
          if (old) {
            old.n++;
            old.last = now;
            if (os && !old.os.includes(os) && old.os.length < 200) old.os += ' · ' + os;
          } else this.reports.push({ id: makeId(), first: now, last: now, n: 1, ver, os, where, msg, stack });
        }
        if (this.reports.length > MAX_REPORTS) this.reports = this.reports.sort((a, b) => a.last - b.last).slice(-MAX_REPORTS);
        this.save();
        send({ t: 'ok', rid: x.rid });
        return true;
      }
      case 'err.list':
        if (!this.isAdmin(uid)) return send({ t: 'err', msg: 'Bunu yalnız sunucu yöneticisi görebilir.', rid: x.rid }), true;
        send({ t: 'ok', rid: x.rid, data: [...this.reports].sort((a, b) => b.last - a.last) });
        return true;
      case 'err.clear':
        if (!this.isAdmin(uid)) return send({ t: 'err', msg: 'Bunu yalnız sunucu yöneticisi yapabilir.', rid: x.rid }), true;
        this.reports = x.id ? this.reports.filter((r) => r.id !== x.id) : [];
        this.save();
        send({ t: 'ok', rid: x.rid });
        return true;
      case 'ice':
        send({ t: 'ok', rid: x.rid, data: this.ice(uid) });
        return true;
    }
    return true;
  }

  // ---------- TURN: süreli kimlik (coturn "use-auth-secret" / TURN REST API) ----------
  /** Kullanıcıya özel, süresi dolan TURN kimliği. Gizli anahtar sunucudan çıkmaz. */
  ice(uid: ID): IceInfo | null {
    const t = this.opts.turn;
    if (!t || !t.urls.length || !t.secret) return null;
    const ttl = t.ttl || 6 * 3600;
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${uid}`;
    const credential = crypto.createHmac('sha1', t.secret).update(username).digest('base64');
    return { iceServers: [{ urls: t.urls, username, credential }], ttl };
  }

  // ---------- yükleme kotası ----------
  /** Yüklemeye izin var mı? İzin yoksa kullanıcıya gösterilecek açıklama döner. */
  uploadBlocked(uid: ID, bytes: number): string | null {
    const o = this.opts.upload || {};
    const perHour = (o.mbPerHour ?? 1024) * 1024 * 1024;
    const perTen = o.perTenMin ?? 60;
    const now = Date.now();
    const list = (this.uploads.get(uid) || []).filter((u) => now - u.at < HOUR);
    this.uploads.set(uid, list);
    if (list.filter((u) => now - u.at < 600_000).length >= perTen) return 'Kısa sürede çok fazla dosya yükledin. Birkaç dakika sonra yeniden dene.';
    const used = list.reduce((s, u) => s + u.bytes, 0);
    if (used + bytes > perHour) {
      const wait = Math.max(1, Math.ceil((list[0].at + HOUR - now) / 60_000));
      return `Saatlik yükleme sınırına ulaştın (${Math.round(perHour / 1048576)} MB). Yaklaşık ${wait} dakika sonra yeniden dene.`;
    }
    // disk dolmak üzereyse kimse yükleyemez: sunucu ve diğer servisler çalışmaya devam etsin
    try {
      const st = fs.statfsSync(this.dir);
      const freeMb = (st.bavail * st.bsize) / 1048576;
      if (freeMb - bytes / 1048576 < (o.minFreeMb ?? 1024)) return 'Sunucuda yer kalmadı, şu an dosya yüklenemiyor.';
    } catch {
      /* statfs yoksa denetlenmez */
    }
    return null;
  }

  /** Yükleme başlarken sayılır (yarıda kesilen de sayılır; aksi halde sınır atlatılabilir) */
  uploadCount(uid: ID, bytes: number) {
    const list = this.uploads.get(uid) || [];
    list.push({ at: Date.now(), bytes });
    this.uploads.set(uid, list);
    if (this.uploads.size > 5000) for (const [k, v] of this.uploads) if (!v.some((u) => Date.now() - u.at < HOUR)) this.uploads.delete(k);
  }

  private dirty = false;
  private save() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 800);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.writeFileSync(this.file + '.tmp', JSON.stringify({ reports: this.reports }));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch {
      /* yazılamadıysa bir sonraki bildirimde yeniden denenir */
    }
  }
}
