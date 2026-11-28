// v1.68 giriş ekranı: solda e-posta / kullanıcı adı + şifre (ve "Şifremi unuttum"), sağda telefonla okutulacak QR kodu.
// Ayarlar > Gizlilik ve Güvenlik'teki "Giriş bilgileri" bölümü de burada (e-posta, kullanıcı adı, şifre belirleme; çıkış).
import React, { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { ArrowLeft, Eye, EyeOff, RefreshCw, Smartphone } from 'lucide-react';
import { useStore, homeHost, homeData, homeRequest, girisSupported, toast, confirmDialog, finishOnboarding } from '../lib/store';
import { Avatar, Logo } from './Common';
import { IS_MOBILE } from '../lib/mobil';
import { QR_ONEK, epostaHatasi, kullaniciAdiHatasi, sifreHatasi, kullaniciAdiDuzelt, epostaDuzelt, type HesapGirisi } from '../../shared/giris';

const yenidenYukle = () => window.location.reload();

/** QR kodu: modüller tek bir SVG yolu olarak çizilir (temaya uyan renkler, keskin kenarlar) */
function QrResmi({ text, size = 184 }: { text: string; size?: number }) {
  const { d, n } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  const m = 2; // sessiz kenar
  return (
    <svg className="gr-qr-svg" data-qr={text} width={size} height={size} viewBox={`${-m} ${-m} ${n + 2 * m} ${n + 2 * m}`} shapeRendering="crispEdges" role="img" aria-label="Giriş için QR kodu">
      <rect x={-m} y={-m} width={n + 2 * m} height={n + 2 * m} fill="#fff" />
      <path d={d} fill="#0b1325" />
    </svg>
  );
}

type QrDurum = { s: 'yukleniyor' } | { s: 'hata'; msg: string } | { s: 'hazir'; k: string; bitis: number } | { s: 'okundu'; k: string; user?: { name: string; color: string; avatar?: string } } | { s: 'red' } | { s: 'giriyor' };

function QrPaneli() {
  const [d, setD] = useState<QrDurum>({ s: 'yukleniyor' });
  const [tur, setTur] = useState(0);
  useEffect(() => {
    let bitti = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      setD({ s: 'yukleniyor' });
      const r = await window.kovan.giris.qrNew(homeHost());
      if (bitti) return;
      if (!r.ok || !r.k) return setD({ s: 'hata', msg: r.error || 'QR kodu alınamadı.' });
      const k = r.k;
      const bitis = Date.now() + (r.ms || 120_000);
      setD({ s: 'hazir', k, bitis });
      const yokla = async () => {
        if (bitti) return;
        const p = await window.kovan.giris.qrPoll(k).catch(() => ({ state: 'bekliyor' as const, user: undefined }));
        if (bitti) return;
        if (p.state === 'ok') {
          setD({ s: 'giriyor' });
          return yenidenYukle();
        }
        if (p.state === 'red') return setD({ s: 'red' });
        // süresi dolan kod kendiliğinden yenilenir
        if (p.state === 'bitti' || p.state === 'yok' || Date.now() > bitis + 3000) return setTur((t) => t + 1);
        setD(p.state === 'okundu' ? { s: 'okundu', k, user: p.user } : { s: 'hazir', k, bitis });
        timer = setTimeout(yokla, 1500);
      };
      timer = setTimeout(yokla, 1500);
    })();
    return () => {
      bitti = true;
      clearTimeout(timer);
    };
  }, [tur]);

  return (
    <div className="gr-qr">
      <div className={'gr-qr-kutu' + (d.s === 'okundu' || d.s === 'giriyor' ? ' okundu' : '')}>
        {d.s === 'hazir' || d.s === 'okundu' ? <QrResmi text={QR_ONEK + d.k} /> : null}
        {d.s === 'okundu' && (
          <div className="gr-qr-ust">
            <Avatar user={{ name: d.user?.name || '?', color: d.user?.color || '#6cb6ff', avatar: d.user?.avatar }} size={56} />
          </div>
        )}
        {d.s === 'yukleniyor' && <div className="gr-qr-bos">Kod hazırlanıyor…</div>}
        {d.s === 'giriyor' && <div className="gr-qr-bos">Giriş yapılıyor…</div>}
        {(d.s === 'hata' || d.s === 'red') && (
          <div className="gr-qr-bos">
            <button className="btn ghost sm" onClick={() => setTur((t) => t + 1)}>
              <RefreshCw size={14} /> Yeni kod
            </button>
          </div>
        )}
      </div>
      {d.s === 'okundu' ? (
        <>
          <h2>{d.user?.name ? `${d.user.name}, telefonundan onayla` : 'Telefonundan onayla'}</h2>
          <p>Kod okundu. Girişi tamamlamak için telefondaki onay düğmesine dokun.</p>
          <button className="gr-link" onClick={() => setTur((t) => t + 1)}>
            Ben değilim, kodu yenile
          </button>
        </>
      ) : d.s === 'red' ? (
        <>
          <h2>Giriş iptal edildi</h2>
          <p>Telefonda vazgeçildi. Yeniden denemek için yeni bir kod al.</p>
        </>
      ) : d.s === 'hata' ? (
        <>
          <h2>Telefonla gir</h2>
          <p className="gr-hata-yazi">{d.msg}</p>
        </>
      ) : (
        <>
          <h2>Telefonla gir</h2>
          <p>
            Telefondaki Naphian'da <b>QR ile giriş</b>'e dokun ve bu kodu okut. Şifre yazmana gerek kalmaz.
          </p>
        </>
      )}
    </div>
  );
}

function SifreAlani({ value, onChange, auto, onEnter, placeholder }: { value: string; onChange: (v: string) => void; auto?: string; onEnter?: () => void; placeholder?: string }) {
  const [gor, setGor] = useState(false);
  return (
    <div className="gr-sifre">
      <input type={gor ? 'text' : 'password'} value={value} autoComplete={auto} placeholder={placeholder} maxLength={128} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter?.()} />
      <button type="button" className="gr-goz" onClick={() => setGor(!gor)} aria-label={gor ? 'Şifreyi gizle' : 'Şifreyi göster'} title={gor ? 'Şifreyi gizle' : 'Şifreyi göster'}>
        {gor ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function GirisFormu({ onUnuttum }: { onUnuttum: () => void }) {
  const [login, setLogin] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const gir = async () => {
    if (!login.trim() || !sifre) return setHata('E-posta / kullanıcı adı ve şifreni yaz.');
    setMesgul(true);
    setHata('');
    const r = await window.kovan.giris.login(homeHost(), login.trim(), sifre).catch(() => ({ ok: false, error: 'Giriş yapılamadı.' }));
    if (r.ok) return yenidenYukle();
    setMesgul(false);
    setHata(r.error || 'Giriş yapılamadı.');
  };
  return (
    <form
      className="gr-form"
      onSubmit={(e) => {
        e.preventDefault();
        void gir();
      }}
    >
      <h1>Hesabına gir</h1>
      <p className="gr-alt">Tekrar görüşmek güzel. Kaldığın yerden devam et.</p>
      <label className="field">
        <span>E-posta ya da kullanıcı adı</span>
        <input autoFocus value={login} maxLength={254} autoComplete="username" onChange={(e) => setLogin(e.target.value)} />
      </label>
      <label className="field">
        <span>Şifre</span>
        <SifreAlani value={sifre} onChange={setSifre} auto="current-password" onEnter={gir} />
      </label>
      <button type="button" className="gr-link gr-unuttum" onClick={onUnuttum}>
        Şifremi unuttum
      </button>
      {hata && <div className="gr-hata">{hata}</div>}
      <button className="btn primary lg gr-gir" disabled={mesgul}>
        {mesgul ? 'Giriliyor…' : 'Giriş yap'}
      </button>
    </form>
  );
}

function UnuttumFormu({ onGeri }: { onGeri: () => void }) {
  const [adim, setAdim] = useState<0 | 1>(0);
  const [email, setEmail] = useState('');
  const [kod, setKod] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const gonder = async () => {
    const e = epostaHatasi(epostaDuzelt(email));
    if (e) return setHata(e);
    setMesgul(true);
    setHata('');
    const r = await window.kovan.giris.forgot(homeHost(), epostaDuzelt(email)).catch(() => ({ ok: false, error: 'İstek gönderilemedi.' }));
    setMesgul(false);
    if (!r.ok) return setHata(r.error || 'İstek gönderilemedi.');
    setAdim(1);
  };
  const sifirla = async () => {
    const e = sifreHatasi(sifre);
    if (!/^\d{6}$/.test(kod.replace(/\s/g, ''))) return setHata('E-postadaki 6 haneli kodu yaz.');
    if (e) return setHata(e);
    setMesgul(true);
    setHata('');
    const r = await window.kovan.giris.reset(homeHost(), epostaDuzelt(email), kod.replace(/\s/g, ''), sifre).catch(() => ({ ok: false, error: 'Şifre sıfırlanamadı.' }));
    if (r.ok) return yenidenYukle();
    setMesgul(false);
    setHata(r.error || 'Şifre sıfırlanamadı.');
  };
  return (
    <form
      className="gr-form"
      onSubmit={(e) => {
        e.preventDefault();
        void (adim === 0 ? gonder() : sifirla());
      }}
    >
      <button type="button" className="gr-link gr-geri" onClick={onGeri}>
        <ArrowLeft size={14} /> Girişe dön
      </button>
      <h1>Şifreni sıfırla</h1>
      {adim === 0 ? (
        <>
          <p className="gr-alt">Hesabına bağlı e-posta adresini yaz, sana 6 haneli bir kod gönderelim.</p>
          <label className="field">
            <span>E-posta</span>
            <input autoFocus type="email" value={email} maxLength={254} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
          </label>
          {hata && <div className="gr-hata">{hata}</div>}
          <button className="btn primary lg gr-gir" disabled={mesgul}>
            {mesgul ? 'Gönderiliyor…' : 'Kod gönder'}
          </button>
          <p className="gr-not">E-postana erişemiyorsan, hesabın açık olduğu telefondan QR ile de girebilirsin.</p>
        </>
      ) : (
        <>
          <p className="gr-alt">
            <b>{epostaDuzelt(email)}</b> kayıtlıysa bir kod gönderildi (gelen kutunu ve gereksiz klasörünü kontrol et). Kod 15 dakika geçerli.
          </p>
          <label className="field">
            <span>Kod</span>
            <input autoFocus inputMode="numeric" value={kod} maxLength={7} placeholder="123456" onChange={(e) => setKod(e.target.value)} />
          </label>
          <label className="field">
            <span>Yeni şifre</span>
            <SifreAlani value={sifre} onChange={setSifre} auto="new-password" onEnter={sifirla} />
          </label>
          {hata && <div className="gr-hata">{hata}</div>}
          <button className="btn primary lg gr-gir" disabled={mesgul}>
            {mesgul ? 'Kaydediliyor…' : 'Şifreyi değiştir ve gir'}
          </button>
          <button type="button" className="gr-link" onClick={() => (setAdim(0), setHata(''))}>
            Kod gelmedi, yeniden gönder
          </button>
        </>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// v1.70 yeni hesap: e-posta → (Onayla) e-postaya kod → kodu gir → şifre → şifre tekrar → profil (ad, resim)

export type KayitBilgisi = { email: string; bilet: string; password: string };
let bekleyenKayit: KayitBilgisi | null = null;

/** Profil ekranı bitince: hesap sunucuda açılır, e-posta ve şifre (doğrulama biletiyle) bağlanır */
export async function kayitTamamla() {
  const k = bekleyenKayit;
  if (!k) return;
  bekleyenKayit = null;
  for (let i = 0; i < 3; i++) {
    try {
      await homeRequest({ t: 'auth.set', email: k.email, password: k.password, bilet: k.bilet, rid: '' });
      useStore.setState((s) => ({ me: { ...s.me, misafir: false } }));
      toast('Hesabın hazır. Artık e-postan ve şifrenle her yerden girebilirsin.', 'ok');
      return;
    } catch (e) {
      const msg = (e as Error).message || '';
      // bağlantı sorunu değilse yeniden denemenin anlamı yok
      if (!/bağlı değil|Zaman aşımı|koptu/i.test(msg) || i === 2) {
        toast('E-posta ve şifre hesaba bağlanamadı: ' + msg + " Ayarlar → Gizlilik ve Güvenlik'ten yeniden deneyebilirsin.", 'err');
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** E-postaya kod gönderip doğrular; doğrulanınca bilet verir (kayıt ve Ayarlar'daki e-posta bağlama kullanır) */
function useEpostaDogrulama() {
  const [gonderildi, setGonderildi] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const gonder = async (email: string): Promise<string> => {
    const e = epostaHatasi(email);
    if (e) return e;
    setMesgul(true);
    const r = await window.kovan.giris.kod(homeHost(), email).catch(() => ({ ok: false, error: 'Kod gönderilemedi.' }));
    setMesgul(false);
    if (!r.ok) return r.error || 'Kod gönderilemedi.';
    setGonderildi(email);
    return '';
  };
  const dogrula = async (email: string, kod: string): Promise<{ bilet?: string; hata?: string }> => {
    const k = kod.replace(/\s/g, '');
    if (!/^\d{6}$/.test(k)) return { hata: 'E-postadaki 6 haneli kodu yaz.' };
    setMesgul(true);
    const r = await window.kovan.giris.kodDogrula(homeHost(), email, k).catch(() => ({ ok: false, error: 'Kod doğrulanamadı.', bilet: undefined }));
    setMesgul(false);
    return r.ok && r.bilet ? { bilet: r.bilet } : { hata: r.error || 'Kod doğrulanamadı.' };
  };
  return { gonderildi, setGonderildi, mesgul, gonder, dogrula };
}

const ADIMLAR = ['E-posta', 'Kod', 'Şifre', 'Tekrar'];

function KayitFormu({ onGeri, onTamam }: { onGeri: () => void; onTamam: (k: KayitBilgisi) => void }) {
  const [adim, setAdim] = useState(0);
  const [email, setEmail] = useState('');
  const [kod, setKod] = useState('');
  const [bilet, setBilet] = useState('');
  const [sifre, setSifre] = useState('');
  const [tekrar, setTekrar] = useState('');
  const [hata, setHata] = useState('');
  const d = useEpostaDogrulama();
  const ileri = async () => {
    setHata('');
    if (adim === 0) {
      const e = await d.gonder(epostaDuzelt(email));
      if (e) return setHata(e);
      setKod('');
      return setAdim(1);
    }
    if (adim === 1) {
      const r = await d.dogrula(epostaDuzelt(email), kod);
      if (!r.bilet) return setHata(r.hata || 'Kod doğrulanamadı.');
      setBilet(r.bilet);
      return setAdim(2);
    }
    if (adim === 2) {
      const e = sifreHatasi(sifre);
      if (e) return setHata(e);
      return setAdim(3);
    }
    if (tekrar !== sifre) return setHata('Şifreler aynı değil.');
    bekleyenKayit = { email: epostaDuzelt(email), bilet, password: sifre };
    onTamam(bekleyenKayit);
  };
  const tusYazi = d.mesgul ? 'Bekle…' : adim === 0 ? 'Onayla' : adim === 1 ? 'Doğrula' : adim === 2 ? 'Devam' : 'Devam et';
  return (
    <form
      className="gr-form"
      onSubmit={(e) => {
        e.preventDefault();
        void ileri();
      }}
    >
      <button type="button" className="gr-link gr-geri" onClick={() => (adim > 0 && adim !== 2 ? (setAdim(adim - 1), setHata('')) : onGeri())}>
        <ArrowLeft size={14} /> {adim > 0 && adim !== 2 ? 'Geri' : 'Girişe dön'}
      </button>
      <h1>Hesap oluştur</h1>
      <ol className="gr-adimlar" aria-label="Adımlar">
        {ADIMLAR.map((a, i) => (
          <li key={a} className={i < adim ? 'bitti' : i === adim ? 'simdi' : ''}>
            {a}
          </li>
        ))}
      </ol>
      {adim === 0 && (
        <>
          <p className="gr-alt">E-posta adresini yaz. Onayla'ya basınca sana 6 haneli bir kod göndereceğiz.</p>
          <label className="field">
            <span>E-posta</span>
            <input autoFocus type="email" value={email} maxLength={254} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
          </label>
        </>
      )}
      {adim === 1 && (
        <>
          <p className="gr-alt">
            <b>{epostaDuzelt(email)}</b> adresine gelen kodu yaz. Göremiyorsan gereksiz (spam) klasörüne bak.
          </p>
          <label className="field">
            <span>Kod</span>
            <input key="kod" autoFocus inputMode="numeric" value={kod} maxLength={7} placeholder="123456" className="gr-kod" onChange={(e) => setKod(e.target.value)} />
          </label>
          <button
            type="button"
            className="gr-link"
            disabled={d.mesgul}
            onClick={async () => {
              setHata('');
              const e = await d.gonder(epostaDuzelt(email));
              setHata(e);
              if (!e) toast('Yeni kod gönderildi.', 'ok');
            }}
          >
            Kodu yeniden gönder
          </button>
        </>
      )}
      {adim === 2 && (
        <>
          <p className="gr-alt">E-postan doğrulandı. Şimdi bir şifre belirle (en az 8 karakter).</p>
          <label className="field">
            <span>Şifre</span>
            <SifreAlani value={sifre} onChange={setSifre} auto="new-password" />
          </label>
        </>
      )}
      {adim === 3 && (
        <>
          <p className="gr-alt">Yanlış yazmadığından emin olmak için şifreni bir kez daha yaz.</p>
          <label className="field">
            <span>Şifre (tekrar)</span>
            <SifreAlani value={tekrar} onChange={setTekrar} auto="new-password" onEnter={ileri} />
          </label>
        </>
      )}
      {hata && <div className="gr-hata">{hata}</div>}
      <button className="btn primary lg gr-gir" disabled={d.mesgul}>
        {tusYazi}
      </button>
    </form>
  );
}

/** İlk açılışta (ya da çıkış yapınca) görünen giriş ekranı */
export function GirisEkrani({ onYeniHesap }: { onYeniHesap: () => void }) {
  const [unuttum, setUnuttum] = useState(false);
  const [kayit, setKayit] = useState(false);
  // v1.68 misafir girişi: ad sormadan "Misafir1234" adıyla hemen başlar
  const misafir = () => {
    const me = useStore.getState().me;
    void finishOnboarding({ name: 'Misafir' + String(Math.floor(1000 + Math.random() * 9000)), color: me.color });
  };
  return (
    <div className="onboarding gr-ekran">
      <div className="gr-kart">
        <div className="gr-sol">
          <div className="gr-marka">
            <Logo size={34} />
            <span>Naphian</span>
          </div>
          {kayit ? (
            <KayitFormu onGeri={() => setKayit(false)} onTamam={onYeniHesap} />
          ) : unuttum ? (
            <UnuttumFormu onGeri={() => setUnuttum(false)} />
          ) : (
            <GirisFormu onUnuttum={() => setUnuttum(true)} />
          )}
          {!kayit && (
            <>
              <div className="gr-kayit">
                Hesabın yok mu?{' '}
                <button className="gr-link" onClick={() => (setKayit(true), setUnuttum(false))}>
                  Yeni hesap oluştur
                </button>
              </div>
              <button className="btn ghost gr-misafir" onClick={misafir}>
                Misafir olarak devam et
              </button>
              <p className="gr-not">
                Misafir hesabı yalnız bu {IS_MOBILE ? 'telefonda' : 'bilgisayarda'} açılır; topluluk kuramaz, arkadaş ekleyemez ve dosya gönderemez. Sonra Ayarlar'dan e-postanı doğrulayıp kalıcı hesaba çevirebilirsin.
              </p>
            </>
          )}
        </div>
        {/* telefonda QR gösterilmez: telefon QR'ı okutan taraftır */}
        {!IS_MOBILE && (
          <>
            <div className="gr-ayrac" aria-hidden>
              <span>ya da</span>
            </div>
            <QrPaneli />
          </>
        )}
      </div>
    </div>
  );
}

/** v1.70.1 hesaptan çıkış (Ayarlar'ın en altındaki "Çıkış yap"). Şifresi olmayan (misafir) hesapta geri dönülemeyeceği uyarılır. */
export async function cikisYap() {
  const misafirMi = !!useStore.getState().me.misafir;
  const bilgi = girisSupported() ? await homeData<HesapGirisi>({ t: 'auth.me' }).catch(() => null) : null;
  const sifreli = !!bilgi?.hasPassword;
  const cik = async () => {
    await window.kovan.giris.logout();
    yenidenYukle();
  };
  if (sifreli)
    return confirmDialog('Çıkış yapılsın mı?', 'Giriş ekranına dönersin. Yeniden girmek için e-postan ve şifren ya da telefonundaki QR kodu yeterli.', cik, 'Çıkış yap', true);
  confirmDialog(
    misafirMi ? 'Misafir hesaptan çıkılsın mı?' : 'Bu hesaba geri dönemeyebilirsin',
    (misafirMi ? 'Bu bir misafir hesap; ' : 'Bu hesabın e-postası ve şifresi yok; ') +
      "çıkış yaparsan bir daha bu hesaba giremezsin (adın, arkadaşların ve toplulukların bu hesapla kalır). Kalıcı yapmak için önce Ayarlar → Gizlilik ve Güvenlik → Giriş bilgileri'nden e-postanı doğrula.",
    cik,
    'Yine de çık',
    true,
  );
}

// ---------------------------------------------------------------------------
// Ayarlar > Gizlilik ve Güvenlik > Giriş bilgileri

export function GirisBilgileri() {
  const online = useStore((x) => (x.conns, girisSupported()));
  const [me, setMe] = useState<HesapGirisi | null>(null);
  const [acik, setAcik] = useState(false);
  const [email, setEmail] = useState('');
  const [ad, setAd] = useState('');
  const [sifre, setSifre] = useState('');
  const [simdiki, setSimdiki] = useState('');
  const [hata, setHata] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const misafirMi = useStore((x) => !!x.me.misafir);
  // v1.70: yeni ya da değişen e-posta, adrese gelen kodla doğrulanmadan kaydedilmez
  const d = useEpostaDogrulama();
  const [kod, setKod] = useState('');
  const [bilet, setBilet] = useState<{ email: string; b: string } | null>(null);
  useEffect(() => {
    if (!online) return;
    homeData<HesapGirisi>({ t: 'auth.me' }).then(setMe, () => setMe(null));
  }, [online]);
  const ac = () => {
    setEmail(me?.email || '');
    setAd(me?.username || '');
    setSifre('');
    setSimdiki('');
    setHata('');
    setKod('');
    setBilet(null);
    d.setGonderildi('');
    setAcik(true);
  };
  const yeniEposta = epostaDuzelt(email) !== (me?.email || '');
  const dogrulandi = !yeniEposta || bilet?.email === epostaDuzelt(email);
  const kaydet = async () => {
    const e = epostaHatasi(epostaDuzelt(email)) || (ad ? kullaniciAdiHatasi(kullaniciAdiDuzelt(ad)) : '') || (sifre || !me?.hasPassword ? sifreHatasi(sifre) : '');
    if (e) return setHata(e);
    if (!dogrulandi) return setHata('Önce e-postana gelen kodla adresini doğrula.');
    if (me?.hasPassword && !simdiki) return setHata('Değişikliği onaylamak için şu anki şifreni yaz.');
    setMesgul(true);
    setHata('');
    try {
      const r = await homeData<HesapGirisi>({ t: 'auth.set', email: epostaDuzelt(email), username: kullaniciAdiDuzelt(ad), ...(yeniEposta && bilet ? { bilet: bilet.b } : {}), ...(sifre ? { password: sifre } : {}), ...(me?.hasPassword ? { current: simdiki } : {}) });
      setMe(r);
      setAcik(false);
      if (yeniEposta) useStore.setState((x) => ({ me: { ...x.me, misafir: false } }));
      toast(me?.hasPassword ? 'Giriş bilgilerin güncellendi.' : 'Artık e-posta ya da kullanıcı adınla giriş yapabilirsin.', 'ok');
    } catch (err) {
      setHata((err as Error).message || 'Kaydedilemedi.');
    }
    setMesgul(false);
  };
  const cikis = () =>
    confirmDialog(
      'Çıkış yapılsın mı?',
      'Bu bilgisayardan çıkarsın. Yeniden girmek için e-posta / kullanıcı adın ve şifren ya da telefonundaki QR kodu yeterli.',
      async () => {
        await window.kovan.giris.logout();
        yenidenYukle();
      },
      'Çıkış yap',
      true,
    );
  return (
    <>
      <h3>Giriş bilgileri</h3>
      <p className="note">
        E-posta ve şifre belirlersen hesabına başka bir bilgisayardan da girebilirsin. Telefondaki uygulamadan QR kodu okutarak şifresiz de girilebilir.
      </p>
      {!online ? (
        <p className="note">Sunucuya bağlıyken kullanılabilir.</p>
      ) : !acik ? (
        <div className="gr-ayar-ozet">
          <div>
            {me?.hasPassword ? (
              <>
                <b>{me.username || me.email}</b>
                <span>{me.username ? me.email : 'E-postanla giriş yapabilirsin.'}</span>
              </>
            ) : (
              <>
                <b>{misafirMi ? 'Misafir hesap' : 'Şifre belirlenmedi'}</b>
                <span>
                  {misafirMi
                    ? 'Topluluk kuramaz, arkadaş ekleyemez, dosya gönderemez. E-postanı doğrulayınca kısıtlar kalkar.'
                    : 'Bu hesap şimdilik yalnız bu bilgisayarda açık.'}
                </span>
              </>
            )}
          </div>
          <button className="btn primary sm" onClick={ac}>
            {me?.hasPassword ? 'Değiştir' : misafirMi ? 'Hesabını kalıcı yap' : 'E-posta ve şifre belirle'}
          </button>
        </div>
      ) : (
        <form
          className="gr-ayar-form"
          onSubmit={(e) => {
            e.preventDefault();
            void kaydet();
          }}
        >
          <label className="field">
            <span>E-posta</span>
            <input type="email" value={email} maxLength={254} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
            {yeniEposta && !dogrulandi && d.gonderildi !== epostaDuzelt(email) && (
              <button
                type="button"
                className="btn ghost sm gr-kod-gonder"
                disabled={d.mesgul}
                onClick={async () => {
                  setHata('');
                  setKod('');
                  const err = await d.gonder(epostaDuzelt(email));
                  if (err) setHata(err);
                }}
              >
                {d.mesgul ? 'Gönderiliyor…' : 'Doğrulama kodu gönder'}
              </button>
            )}
            {yeniEposta && dogrulandi && <small className="gr-dogru">E-posta doğrulandı.</small>}
          </label>
          {yeniEposta && !dogrulandi && d.gonderildi === epostaDuzelt(email) && (
            <label className="field">
              <span>E-postana gelen kod</span>
              <div className="gr-kod-satir">
                <input inputMode="numeric" value={kod} maxLength={7} placeholder="123456" onChange={(e) => setKod(e.target.value)} />
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={d.mesgul}
                  onClick={async () => {
                    setHata('');
                    const r = await d.dogrula(epostaDuzelt(email), kod);
                    if (r.bilet) setBilet({ email: epostaDuzelt(email), b: r.bilet });
                    else setHata(r.hata || 'Kod doğrulanamadı.');
                  }}
                >
                  Doğrula
                </button>
              </div>
            </label>
          )}
          <label className="field">
            <span>Kullanıcı adı (isteğe bağlı, girişte kullanılabilir)</span>
            <input value={ad} maxLength={32} placeholder="ör. enes.58" autoComplete="username" onChange={(e) => setAd(e.target.value.toLowerCase())} />
            <small>Küçük harf, rakam, nokta ve alt çizgi. Görünen adın ve etiketin değişmez.</small>
          </label>
          <label className="field">
            <span>{me?.hasPassword ? 'Yeni şifre (değiştirmeyeceksen boş bırak)' : 'Şifre'}</span>
            <SifreAlani value={sifre} onChange={setSifre} auto="new-password" />
            <small>En az 8 karakter.</small>
          </label>
          {me?.hasPassword && (
            <label className="field">
              <span>Şu anki şifren</span>
              <SifreAlani value={simdiki} onChange={setSimdiki} auto="current-password" onEnter={kaydet} />
            </label>
          )}
          {hata && <div className="gr-hata">{hata}</div>}
          <div className="gr-ayar-tuslar">
            <button type="button" className="btn ghost sm" onClick={() => setAcik(false)}>
              Vazgeç
            </button>
            <button className="btn primary sm" disabled={mesgul || !dogrulandi}>
              {mesgul ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      )}
      {online && !!me?.devices && (
        <div className="gr-ayar-ozet">
          <div>
            <b>
              <Smartphone size={14} /> Şifreyle ya da QR ile girilen cihazlar: {me.devices}
            </b>
            <span>Tanımadığın bir giriş varsa şifreni değiştir ya da buradan çıkış yap.</span>
          </div>
          <button
            className="btn ghost sm"
            onClick={() =>
              confirmDialog('Diğer cihazlardan çıkılsın mı?', 'Şifreyle ya da QR ile giriş yapılmış diğer cihazlardaki oturumlar kapanır. Bu bilgisayar açık kalır.', async () => {
                try {
                  setMe(await homeData<HesapGirisi>({ t: 'auth.out' }));
                  toast('Diğer cihazlardan çıkıldı.', 'ok');
                } catch (err) {
                  toast((err as Error).message, 'err');
                }
              }, 'Çıkış yap')
            }
          >
            Diğer cihazlardan çık
          </button>
        </div>
      )}
      <div className="gr-ayar-ozet">
        <div>
          <b>Bu bilgisayardan çık</b>
          <span>{me?.hasPassword ? 'Giriş ekranına dönülür.' : 'Önce e-posta ve şifre belirle; yoksa bu hesaba geri giremezsin.'}</span>
        </div>
        <button className="btn danger sm" disabled={!me?.hasPassword} onClick={cikis}>
          Çıkış yap
        </button>
      </div>
    </>
  );
}
