// v1.27 Discord şablonundan topluluk kurma: şablonu Discord'dan ana süreçte çeker (tarayıcı CORS'u yok).
import { ipcMain, net } from 'electron';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Discord şablonu: herkese açık /guilds/templates/<kod> ucu (anahtar gerekmez)
export function initTemplateFetch() {
  ipcMain.handle('tpl:discord', async (_e, code: string) => {
    if (!/^[A-Za-z0-9]{6,32}$/.test(code)) return { ok: false, error: 'Şablon kodu geçersiz.' };
    const fake = process.env.KOVAN_FAKE_TEMPLATE;
    if (fake) {
      return { ok: true, data: JSON.parse(fs.readFileSync(fake, 'utf8')) };
    }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12_000);
    try {
      const r = await net.fetch(`https://discord.com/api/v10/guilds/templates/${code}`, { signal: ctl.signal, headers: { accept: 'application/json' } });
      if (r.status === 404) return { ok: false, error: 'Bu şablon bulunamadı. Bağlantı silinmiş ya da yanlış kopyalanmış olabilir.' };
      if (!r.ok) return { ok: false, error: `Discord şablonu vermedi (hata ${r.status}). Biraz sonra tekrar dene.` };
      return { ok: true, data: await r.json() };
    } catch {
      return { ok: false, error: "Discord'a ulaşılamadı. Discord bu ağda engelliyse şablonu açamayız; DNS ya da VPN ile erişebiliyorsan tekrar dene." };
    } finally {
      clearTimeout(t);
    }
  });
}
