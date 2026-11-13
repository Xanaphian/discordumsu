// Kovan MCP köprüsü: stdio <-> HTTP.
// Claude Desktop gibi yalnızca stdio sunucusu çalıştırabilen istemciler için.
// Çalıştırma: ELECTRON_RUN_AS_NODE=1 Kovan.exe mcp-bridge.js --url http://127.0.0.1:47820/mcp
// Belirteç KOVAN_TOKEN ortam değişkeninden (ya da --token) okunur.
import readline from 'node:readline';

const arg = (name: string) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const url = arg('url') || process.env.KOVAN_MCP_URL || 'http://127.0.0.1:47820/mcp';
const token = arg('token') || process.env.KOVAN_TOKEN || '';

const write = (obj: unknown) => process.stdout.write(JSON.stringify(obj) + '\n');
const log = (...a: unknown[]) => process.stderr.write('[kovan-mcp] ' + a.join(' ') + '\n');

if (!token) log('Uyarı: KOVAN_TOKEN tanımlı değil.');

const pending = new Set<Promise<void>>();
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  // İstekler bağımsız gönderilir (wait_for_messages uzun sürebilir; yanıtlar kimlikle eşleşir).
  const p = forward(text).finally(() => pending.delete(p));
  pending.add(p);
});
rl.on('close', () => Promise.allSettled([...pending]).finally(() => process.exit(0)));

async function forward(text: string) {
  let ids: unknown[] = [];
  try {
    const msg = JSON.parse(text);
    ids = (Array.isArray(msg) ? msg : [msg]).filter((m) => m && m.id !== undefined && m.id !== null && m.method).map((m) => m.id);
  } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + token },
      body: text,
    });
    if (r.status === 202 || r.status === 204) return;
    const body = await r.text();
    if (!body) return;
    process.stdout.write(body.trim() + '\n');
  } catch (e) {
    const message = `Kovan'a ulaşılamadı (${url}). Kovan açık mı? ${(e as Error).message}`;
    log(message);
    for (const id of ids) write({ jsonrpc: '2.0', id, error: { code: -32000, message } });
  }
}
