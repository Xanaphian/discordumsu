import type { ClientFrame, ServerFrame } from '../../shared/protocol';

export type ConnStatus = 'connecting' | 'online' | 'offline';

/** "ip:port" (eski kovanlar) ya da "https://alan/yol" (merkezi sunucu) → HTTP tabanı */
export const httpBase = (host: string) => (/^https?:\/\//i.test(host) ? host.replace(/\/+$/, '') : `http://${host}`);
/** Aynı adresin WebSocket ucu */
export const wsUrl = (host: string) => httpBase(host).replace(/^http/i, 'ws') + '/ws';

/** Tek bir kovan sunucusuna kalıcı WebSocket bağlantısı (yeniden bağlanma + istek/yanıt). */
export class HostConn {
  ws: WebSocket | null = null;
  status: ConnStatus = 'connecting';
  private backoff = 800;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** ping gönderildi, yanıt bekleniyor: süre dolarsa bağlantı ölü sayılır */
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reqs = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private seq = 0;

  constructor(
    public host: string, // "ip:port" ya da "https://alan/yol"
    private hello: (host: string) => ClientFrame,
    private onFrame: (host: string, f: ServerFrame) => void,
    private onStatus: (host: string, s: ConnStatus, err?: string) => void,
  ) {
    this.connect();
  }

  get http() {
    return httpBase(this.host);
  }

  private connect() {
    if (this.closed) return;
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(this.host));
    } catch (e) {
      return this.scheduleRetry();
    }
    this.ws = ws;
    // bağlantı hiç açılmadan asılı kalırsa (yanıt vermeyen ağ) bekleme: bırak, yeniden dene
    const openTimer = setTimeout(() => {
      if (this.ws !== ws || ws.readyState !== WebSocket.CONNECTING) return;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* zaten kapalı */
      }
      this.lost();
    }, 15000);
    ws.onopen = () => {
      clearTimeout(openTimer);
      if (this.ws !== ws) return;
      this.backoff = 800;
      ws.send(JSON.stringify(this.hello(this.host)));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.check(), 25000);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      // sunucudan herhangi bir şey geldi: bağlantı canlı
      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
      let f: ServerFrame;
      try {
        f = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (f.t === 'ready') this.setStatus('online');
      if ((f.t === 'ok' || f.t === 'hist' || f.t === 'pins' || f.t === 'search') && f.rid && this.reqs.has(f.rid)) {
        const r = this.reqs.get(f.rid)!;
        this.reqs.delete(f.rid);
        clearTimeout(r.timer);
        r.resolve(f);
        if (f.t === 'ok') return;
      }
      if (f.t === 'err' && f.rid && this.reqs.has(f.rid)) {
        const r = this.reqs.get(f.rid)!;
        this.reqs.delete(f.rid);
        clearTimeout(r.timer);
        r.reject(new Error(f.msg));
        return;
      }
      if (f.t === 'pong') return;
      this.onFrame(this.host, f);
    };
    ws.onclose = (ev) => {
      // eski (bırakılmış) bağlantının geç gelen kapanışı yeni bağlantıyı bozmasın
      clearTimeout(openTimer);
      if (this.ws !== ws) return;
      this.lost(ev.code);
    };
    ws.onerror = () => {
      /* onclose takip eder */
    };
  }

  /** Bağlantı kapandı ya da ölü bulundu: bekleyen istekleri sonlandır, yeniden bağlanmayı kur */
  private lost(code?: number) {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = this.pongTimer = null;
    this.ws = null;
    for (const [, r] of this.reqs) {
      clearTimeout(r.timer);
      r.reject(new Error('Bağlantı koptu'));
    }
    this.reqs.clear();
    if (code === 4001) {
      this.setStatus('offline', 'Kimlik doğrulanamadı');
      return;
    }
    this.scheduleRetry();
  }

  /**
   * Bağlantı gerçekten canlı mı? Ping yollar; süresinde hiçbir şey gelmezse bağlantıyı bırakıp yeniden bağlanır.
   * İnternet sessizce kesildiğinde (Wi-Fi değişimi, uykudan uyanma, modem takılması) tarayıcı bağlantıyı dakikalarca
   * "açık" sanabiliyor; uygulama o sırada bağlı görünüp mesajları göndermiyordu.
   */
  check(wait = 12000) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.pongTimer) return;
    try {
      ws.send('{"t":"ping"}');
    } catch {
      /* aşağıdaki süre dolunca bırakılır */
    }
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      if (this.ws !== ws) return;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* zaten kapalı */
      }
      this.backoff = 800;
      this.lost();
    }, wait);
  }

  private scheduleRetry() {
    if (this.closed) return;
    this.setStatus('offline');
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 1.7, 20000);
  }

  /** Ağ geri gelince / bilgisayar uyanınca: kopuksa hemen dene, bağlı görünüyorsa gerçekten canlı mı diye yokla */
  nudge() {
    if (this.closed) return;
    if (this.status === 'offline') {
      this.backoff = 800;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.connect();
    } else if (this.status === 'online') this.check(6000);
  }

  private setStatus(s: ConnStatus, err?: string) {
    this.status = s;
    this.onStatus(this.host, s, err);
  }

  send(f: ClientFrame): boolean {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'online') {
      this.ws.send(JSON.stringify(f));
      return true;
    }
    if (this.ws?.readyState === WebSocket.OPEN && (f.t === 'hello' || f.t === 'ping')) {
      this.ws.send(JSON.stringify(f));
      return true;
    }
    return false;
  }

  request<T = any>(f: ClientFrame & { rid?: string }, timeout = 10000): Promise<T> {
    const rid = `r${++this.seq}`;
    (f as any).rid = rid;
    return new Promise<T>((resolve, reject) => {
      if (!this.send(f)) return reject(new Error('Sunucuya bağlı değil'));
      const timer = setTimeout(() => {
        this.reqs.delete(rid);
        reject(new Error('Zaman aşımı'));
      }, timeout);
      this.reqs.set(rid, { resolve, reject, timer });
    });
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.ws?.close();
  }
}

/** Bir adresin kovan sunucusu olup olmadığını hızlıca dener. */
export async function probeHost(host: string, timeout = 2500): Promise<{ hubId: string } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${httpBase(host)}/info`, { signal: ctl.signal });
    const j = await r.json();
    return j?.app === 'kovan' ? { hubId: j.hubId } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
