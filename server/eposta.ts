// v1.68 şifre sıfırlama e-postası için küçük SMTP gönderici (ek paket yok).
// Ayarlar yalnız sunucudaki .env'de: KOVAN_SMTP_HOST, KOVAN_SMTP_PORT (varsayılan 465, doğrudan TLS),
// KOVAN_SMTP_USER, KOVAN_SMTP_PASS, KOVAN_SMTP_FROM (yoksa USER). Gmail için "uygulama şifresi" kullanılır.
import tls from 'node:tls';
import crypto from 'node:crypto';

export interface SmtpAyar {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const temiz = (s: string) => s.replace(/[\r\n]/g, '');
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

export function smtpGonderici(a: SmtpAyar) {
  return (to: string, subject: string, text: string, html?: string) =>
    new Promise<void>((ok, no) => {
      if (/[\r\n<>]/.test(to)) return no(new Error('geçersiz alıcı'));
      const sock = tls.connect({ host: a.host, port: a.port, servername: a.host });
      sock.setTimeout(20_000, () => sock.destroy(new Error('zaman aşımı')));
      let buf = '';
      let bekleyen: ((code: number, line: string) => void) | null = null;
      sock.on('data', (d) => {
        buf += d.toString('utf8');
        // çok satırlı yanıtın son satırı "250 ..." (tire yok)
        const lines = buf.split('\r\n');
        for (let i = 0; i < lines.length - 1; i++) {
          const m = /^(\d{3})([ -])(.*)$/.exec(lines[i]);
          if (m && m[2] === ' ') {
            buf = lines.slice(i + 1).join('\r\n');
            const f = bekleyen;
            bekleyen = null;
            f?.(Number(m[1]), lines[i]);
            return;
          }
        }
      });
      sock.on('error', no);
      const yanit = () => new Promise<[number, string]>((r) => (bekleyen = (c, l) => r([c, l])));
      const komut = async (cmd: string | null, beklenen: number) => {
        const p = yanit();
        if (cmd !== null) sock.write(cmd + '\r\n');
        const [c, l] = await p;
        if (Math.floor(c / 100) !== Math.floor(beklenen / 100)) throw new Error('SMTP: ' + l.slice(0, 200));
      };
      (async () => {
        await komut(null, 220);
        await komut('EHLO xanaphian', 250);
        await komut('AUTH LOGIN', 334);
        await komut(b64(a.user), 334);
        await komut(b64(a.pass), 235);
        await komut(`MAIL FROM:<${temiz(a.from)}>`, 250);
        await komut(`RCPT TO:<${to}>`, 250);
        await komut('DATA', 354);
        const parca = (s: string) => b64(s).replace(/.{1,76}/g, '$&\r\n');
        const sinir = 'xnp-' + crypto.randomBytes(12).toString('hex');
        const ust = [
          `From: Naphian <${temiz(a.from)}>`,
          `To: <${to}>`,
          `Subject: =?UTF-8?B?${b64(temiz(subject))}?=`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${temiz(a.from.split('@')[1] || 'xanaphian')}>`,
          'MIME-Version: 1.0',
        ];
        // HTML varsa iki parçalı gönderilir: HTML gösteremeyen program düz metni gösterir
        const msg = html
          ? [
              ...ust,
              `Content-Type: multipart/alternative; boundary="${sinir}"`,
              '',
              `--${sinir}`,
              'Content-Type: text/plain; charset=utf-8',
              'Content-Transfer-Encoding: base64',
              '',
              parca(text),
              `--${sinir}`,
              'Content-Type: text/html; charset=utf-8',
              'Content-Transfer-Encoding: base64',
              '',
              parca(html),
              `--${sinir}--`,
            ].join('\r\n')
          : [...ust, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', parca(text)].join('\r\n');
        await komut(msg + '\r\n.', 250);
        sock.write('QUIT\r\n');
        sock.end();
      })().then(ok, (e) => {
        sock.destroy();
        no(e);
      });
    });
}
