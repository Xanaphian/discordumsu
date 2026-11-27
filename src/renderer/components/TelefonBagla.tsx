// v1.68 Ayarlar > Telefonu bağla: hesabı telefondaki Xanaphian'a taşımak için 10 dakikalık, tek kullanımlık kod
import React, { useEffect, useState } from 'react';
import { Smartphone, RefreshCw, Copy, Download } from 'lucide-react';
import { homeHost } from '../lib/store';
import { copyText } from '../lib/util';

export const APK_URL = 'https://github.com/Xanaphian/discordumsu/releases/latest/download/Xanaphian.apk';

export function PhoneTab() {
  const [code, setCode] = useState<{ code: string; exp: number } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code]);
  const left = code ? Math.max(0, Math.round((code.exp - now) / 1000)) : 0;
  const make = async () => {
    setBusy(true);
    setErr('');
    const r = await window.kovan.pairOffer(homeHost());
    setBusy(false);
    if (r.ok && r.code) {
      setCode({ code: r.code, exp: r.exp || Date.now() + 600_000 });
      setNow(Date.now());
    } else setErr(r.error || 'Kod alınamadı.');
  };
  const shown = code && left > 0 ? code.code.slice(0, 4) + '-' + code.code.slice(4) : '';
  return (
    <>
      <h1>Telefonu bağla</h1>
      <p className="note">
        Xanaphian telefonda da var. Telefondaki uygulamada <b>Bilgisayardaki hesabımı kullan</b>'a bas ve aşağıdaki kodu yaz: adın, arkadaşların, toplulukların ve özel mesajların telefona gelir. Bilgisayarda hiçbir şey
        değişmez, ikisi aynı anda açık kalabilir.
      </p>
      <div className="phone-pair">
        <Smartphone size={40} />
        {shown ? (
          <>
            <div className="phone-code" aria-label="Eşleştirme kodu">
              {shown}
            </div>
            <div className="phone-left">
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} içinde, bir kez kullanılabilir
            </div>
            <div className="phone-btns">
              <button className="btn ghost sm" onClick={() => copyText(code!.code)}>
                <Copy size={14} /> Kopyala
              </button>
              <button className="btn ghost sm" disabled={busy} onClick={make}>
                <RefreshCw size={14} /> Yeni kod
              </button>
            </div>
          </>
        ) : (
          <button className="btn primary" disabled={busy} onClick={make}>
            {busy ? 'Kod alınıyor…' : 'Kod al'}
          </button>
        )}
        {err && <div className="phone-err">{err}</div>}
      </div>
      <p className="note">
        Kodu kimseyle paylaşma: kodu yazan kişi senin hesabınla girer. Yanlışlıkla paylaştıysan <b>Gizlilik ve Güvenlik › Anahtarı yenile</b> ile diğer cihazlardaki oturumları kapatabilirsin.
      </p>
      <h3>Telefon uygulamasını indir</h3>
      <p className="note">Android: aşağıdaki düğme kurulum dosyasını (APK) indirir. Telefonda açınca "bilinmeyen kaynaklardan yükleme" izni istenirse ver. iPhone sürümü App Store'a hazırlanıyor.</p>
      <button className="btn ghost sm" onClick={() => window.kovan.openExternal(APK_URL)}>
        <Download size={14} /> Android için indir
      </button>
    </>
  );
}
