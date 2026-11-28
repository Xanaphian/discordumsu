// v1.69.1 şifre sıfırlama e-postasının görünümü: sade HTML (tablo + satır içi stil, e-posta programları başka bir şeyi
// güvenilir göstermez) ve aynı içeriğin düz metin hali. Dış resim yok: çoğu e-posta programı onları varsayılan olarak engeller.

const kacir = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 'sifirla': şifre sıfırlama, 'dogrula': yeni hesap / e-posta bağlama doğrulaması */
export function kodEpostasi(ad: string, kod: string, tur: 'sifirla' | 'dogrula', dakika = 15): { subject: string; text: string; html: string } {
  const a = ad.trim();
  const sif = tur === 'sifirla';
  const baslik = sif ? 'Şifre sıfırlama kodun' : 'E-posta doğrulama kodun';
  const subject = `${kod} – Naphian ${sif ? 'şifre sıfırlama' : 'doğrulama'} kodun`;
  const amac = sif ? 'şifreni sıfırlamak için' : 'e-posta adresini doğrulamak için';
  const ekran = sif ? 'Şifreni sıfırla' : 'Kodu gir';
  const yoksay = sif ? 'Bu isteği sen yapmadıysan bu e-postayı yok say; şifren değişmez ve kimse hesabına giremez.' : 'Bu isteği sen yapmadıysan bu e-postayı yok say; adresin hiçbir hesaba bağlanmaz.';
  const text = [
    a ? `Merhaba ${a},` : 'Merhaba,',
    '',
    `Naphian'da ${amac} kodun:`,
    '',
    `    ${kod}`,
    '',
    `Bu kodu uygulamadaki "${ekran}" ekranına yaz. Kod ${dakika} dakika geçerli ve yalnız bir kez kullanılabilir.`,
    '',
    yoksay,
    '',
    '— Naphian',
  ].join('\n');
  const font = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${kacir(subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .zemin { background:#0b1325 !important; }
  .kart { background:#121c33 !important; border-color:#24304d !important; }
  .yazi { color:#e6e9f0 !important; }
  .soluk { color:#9aa3b8 !important; }
  .kod { background:#0b1325 !important; color:#ffffff !important; border-color:#24304d !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:#f2f4f8;" class="zemin">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Kodun: ${kod}. ${dakika} dakika geçerli.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="zemin" style="background:#f2f4f8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
      <tr><td style="padding:0 4px 16px;font-family:${font};font-size:16px;font-weight:700;letter-spacing:0.3px;color:#0b1325;" class="yazi">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#0ac8b9;margin-right:8px;vertical-align:middle;"></span>Naphian
      </td></tr>
      <tr><td class="kart" style="background:#ffffff;border:1px solid #e1e5ee;border-radius:12px;padding:32px 28px;font-family:${font};">
        <p class="yazi" style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0b1325;">${baslik}</p>
        <p class="soluk" style="margin:0 0 24px;font-size:14px;line-height:1.55;color:#5b6478;">${a ? `Merhaba ${kacir(a)}, ` : 'Merhaba, '}${amac} bu kodu uygulamadaki <b>${ekran}</b> ekranına yaz.</p>
        <div class="kod" style="margin:0 0 24px;padding:18px 12px;border:1px solid #e1e5ee;border-radius:10px;background:#f6f8fb;text-align:center;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#0b1325;">${kod}</div>
        <p class="soluk" style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#5b6478;">Kod <b>${dakika} dakika</b> geçerli ve yalnız bir kez kullanılabilir.</p>
        <p class="soluk" style="margin:0;font-size:13px;line-height:1.55;color:#5b6478;">${yoksay}</p>
      </td></tr>
      <tr><td class="soluk" style="padding:16px 4px 0;font-family:${font};font-size:12px;line-height:1.5;color:#8a92a6;">Bu e-posta, Naphian'da bu adres için kod istendiği için gönderildi. Bu adrese yanıt verme.</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  return { subject, text, html };
}
