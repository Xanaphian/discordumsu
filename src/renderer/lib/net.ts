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
  private reqs = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private seq = 0;

  constructor(
    public host: string, // "ip:port" ya da "https://alan/yol"
    private hello: () => ClientFrame,
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
    ws.onopen = () => {
      this.backoff = 800;
      ws.send(JSON.stringify(this.hello()));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 25000);
    };
    ws.onmessage = (ev) => {
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
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.ws = null;
      for (const [, r] of this.reqs) {
        clearTimeout(r.timer);
        r.reject(new Error('Bağlantı koptu'));
      }
      this.reqs.clear();
      if (ev.code === 4001) {
        this.setStatus('offline', 'Kimlik doğrulanamadı');
        return;
      }
      this.scheduleRetry();
    };
    ws.onerror = () => {
      /* onclose takip eder */
    };
  }

  private scheduleRetry() {
    if (this.closed) return;
    this.setStatus('offline');
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 1.7, 20000);
  }

  /** Ağ geri gelince hemen dene */
  nudge() {
    if (this.status === 'offline' && !this.closed) {
      this.backoff = 800;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.connect();
    }
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
