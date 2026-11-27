// v1.68 giriş ekranı: solda e-posta / kullanıcı adı + şifre (ve "Şifremi unuttum"), sağda telefonla okutulacak QR kodu.
// Ayarlar > Gizlilik ve Güvenlik'teki "Giriş bilgileri" bölümü de burada (e-posta, kullanıcı adı, şifre belirleme; çıkış).
import React, { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { ArrowLeft, Eye, EyeOff, RefreshCw, Smartphone } from 'lucide-react';
import { useStore, homeHost, homeData, girisSupported, toast, confirmDialog, finishOnboarding } from '../lib/store';
import { Avatar, Logo } from './Common';
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
            Telefondaki Xanaphian'da <b>QR ile giriş</b>'e dokun ve bu kodu okut. Şifre yazmana gerek kalmaz.
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

/** İlk açılışta (ya da çıkış yapınca) görünen giriş ekranı */
export function GirisEkrani({ onYeniHesap }: { onYeniHesap: () => void }) {
  const [unuttum, setUnuttum] = useState(false);
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
            <span>Xanaphian</span>
          </div>
          {unuttum ? <UnuttumFormu onGeri={() => setUnuttum(false)} /> : <GirisFormu onUnuttum={() => setUnuttum(true)} />}
          <div className="gr-kayit">
            Hesabın yok mu?{' '}
            <button className="gr-link" onClick={onYeniHesap}>
              Yeni hesap oluştur
            </button>
          </div>
          <button className="btn ghost gr-misafir" onClick={misafir}>
            Misafir olarak devam et
          </button>
          <p className="gr-not">Misafir hesabı yalnız bu bilgisayarda açılır. Sonra Ayarlar'dan e-posta ve şifre belirleyip kalıcı hesaba çevirebilirsin.</p>
        </div>
        <div className="gr-ayrac" aria-hidden>
          <span>ya da</span>
        </div>
        <QrPaneli />
      </div>
    </div>
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
    setAcik(true);
  };
  const kaydet = async () => {
    const e = epostaHatasi(epostaDuzelt(email)) || kullaniciAdiHatasi(kullaniciAdiDuzelt(ad)) || (sifre || !me?.hasPassword ? sifreHatasi(sifre) : '');
    if (e) return setHata(e);
    if (me?.hasPassword && !simdiki) return setHata('Değişikliği onaylamak için şu anki şifreni yaz.');
    setMesgul(true);
    setHata('');
    try {
      const r = await homeData<HesapGirisi>({ t: 'auth.set', email: epostaDuzelt(email), username: kullaniciAdiDuzelt(ad), ...(sifre ? { password: sifre } : {}), ...(me?.hasPassword ? { current: simdiki } : {}) });
      setMe(r);
      setAcik(false);
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
                <b>{me.username}</b>
                <span>{me.email}</span>
              </>
            ) : (
              <>
                <b>Şifre belirlenmedi</b>
                <span>Bu hesap şimdilik yalnız bu bilgisayarda açık.</span>
              </>
            )}
          </div>
          <button className="btn primary sm" onClick={ac}>
            {me?.hasPassword ? 'Değiştir' : 'E-posta ve şifre belirle'}
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
          </label>
          <label className="field">
            <span>Kullanıcı adı (girişte kullanılır)</span>
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
            <button className="btn primary sm" disabled={mesgul}>
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
