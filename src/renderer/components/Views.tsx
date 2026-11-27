import { nameError } from '../../shared/etiket';
import React, { useState } from 'react';
import { Volume2, Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Plus, LogIn, Users, Zap, Globe, Keyboard, ArrowRight } from 'lucide-react';
import { useStore, openModal, selectCommunity, finishOnboarding, realCommunities, setHomeTab } from '../lib/store';
import { FriendsView } from './Friends';
import { useVoice, joinVoice, leaveVoice, toggleMute, toggleDeaf } from '../lib/voice';
import { Avatar, CommunityIcon, Logo, Tooltip } from './Common';
import { cx, COLORS, displayName, resizeImage, modKey } from '../lib/util';
import type { Channel, Community } from '../../shared/protocol';
import { useUnread } from './ServerRail';
import { HomeStart } from './AnaSayfa';
import { CommunitiesView } from './ToplulukOneri';
import { SonEklenenler } from './SonEklenenler';
import { cropImage, AVATAR_CROP } from './Kirpma';

export function HomeView() {
  const tab = useStore((s) => s.homeTab);
  return tab === 'home' ? <HomeStart /> : tab === 'communities' ? <CommunitiesView /> : tab === 'news' ? <SonEklenenler /> : <FriendsView />;
}

/** v1.68 telefonda: bilgisayardaki uygulamanın verdiği kodla aynı hesapla açıl */
function PairStep({ back }: { back: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const r = await window.kovan.mobile!.claimPair(code);
    setBusy(false);
    if (r.ok) location.reload();
    else setErr(r.error || 'Olmadı, yeniden dene.');
  };
  return (
    <>
      <h1>Bilgisayardaki hesabın</h1>
      <p>
        Bilgisayardaki Xanaphian'da <b>Ayarlar › Telefonu bağla</b>'ya bas. Ekranda çıkan 8 harfli kodu buraya yaz. Adın, arkadaşların ve toplulukların telefona gelir.
      </p>
      <label className="field">
        <span>Kod</span>
        <input
          className="ob-pair-code"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          value={code}
          placeholder="ör. K7QM-2XPA"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && !busy && go()}
        />
        {err && <small className="ob-pair-err">{err}</small>}
      </label>
      <button className="btn primary lg" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 8} onClick={go}>
        {busy ? 'Bağlanıyor…' : 'Hesabımı getir'}
      </button>
      <button className="btn ghost lg" onClick={back}>
        Geri
      </button>
    </>
  );
}

/** v1.68 telefonda: kullanıcı adı / e-posta ve şifreyle giriş */
function LoginStep({ back }: { back: () => void }) {
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const r = await window.kovan.mobile!.login(login, pass);
    setBusy(false);
    if (r.ok) location.reload();
    else setErr(r.error || 'Olmadı, yeniden dene.');
  };
  return (
    <>
      <h1>Giriş yap</h1>
      <p>Bilgisayardaki Xanaphian'da belirlediğin kullanıcı adı (ya da e-posta) ve şifreyle gir.</p>
      <label className="field">
        <span>E-posta ya da kullanıcı adı</span>
        <input autoFocus autoCapitalize="none" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
      </label>
      <label className="field">
        <span>Şifre</span>
        <input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && go()} />
        {err && <small className="ob-pair-err">{err}</small>}
      </label>
      <button className="btn primary lg" disabled={busy || !login.trim() || !pass} onClick={go}>
        {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
      </button>
      <button className="btn ghost lg" onClick={back}>
        Geri
      </button>
    </>
  );
}

export function Onboarding() {
  const me = useStore((s) => s.me);
  const [name, setName] = useState('');
  const [color, setColor] = useState(me.color);
  const [avatar, setAvatar] = useState<string | undefined>();
  const [step, setStep] = useState(0);
  const file = React.useRef<HTMLInputElement>(null);
  const done = () => !nameError(name) && finishOnboarding({ name: name.trim(), color, avatar });
  return (
    <div className="onboarding">
      <div className="ob-bg" aria-hidden>
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={`ob-hex o${i}`} />
        ))}
      </div>
      <div className="ob-card">
        {step === 0 ? (
          <>
            <Logo size={64} />
            <h1>Xanaphian'a hoş geldin</h1>
            <p>Arkadaşlarınla topluluklar kur, kanallarda yazış, sesli sohbet et. Hızlı ve hafif; bilgisayarın kapalıyken de toplulukların açık kalır.</p>
            <ul className="ob-list">
              <li>Topluluklar, kategoriler, metin / ses / duyuru kanalları</li>
              <li>Yanıtlar, tepkiler, bahsetmeler, dosya paylaşımı, markdown</li>
              <li>Roller ve yetkiler, üye listesi, durum göstergeleri</li>
              <li>Tek tuşla uygulama içi güncelleme</li>
            </ul>
            <button className="btn primary lg" onClick={() => setStep(1)}>
              Başlayalım <ArrowRight size={18} />
            </button>
            {window.kovan.mobile && (
              <>
                <button className="btn ghost lg ob-pair-btn" onClick={() => setStep(3)}>
                  Hesabıma giriş yap
                </button>
                <button className="btn ghost lg" onClick={() => setStep(2)}>
                  Bilgisayardan kodla bağla
                </button>
              </>
            )}
          </>
        ) : step === 2 ? (
          <PairStep back={() => setStep(0)} />
        ) : step === 3 ? (
          <LoginStep back={() => setStep(0)} />
        ) : (
          <>
            <h1>Seni nasıl çağıralım?</h1>
            <p>Bu ad ve görünüm, katıldığın tüm topluluklarda görünür. Sonradan Ayarlar'dan değiştirebilirsin.</p>
            <button className="ob-avatar" onClick={() => file.current?.click()} title="Profil resmi seç">
              <Avatar user={{ name: name || '?', color, avatar }} size={96} />
              <span className="ob-avatar-edit">Resim seç</span>
            </button>
            <input ref={file} hidden type="file" accept="image/*" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              const r = f && (await cropImage(f, AVATAR_CROP));
              if (r) setAvatar(r.image);
            }} />
            <label className="field">
              <span>Kullanıcı adı</span>
              <input autoFocus maxLength={32} value={name} placeholder="ör. Enes" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && done()} />
              <small className="name-tag-hint">{name.trim() && nameError(name) ? nameError(name) : 'Sonuna bir kod eklenir ve etiketin olur, ör. ' + (name.trim() || 'Enes') + '#4821. Kodu sonra Ayarlar\'dan değiştirebilirsin.'}</small>
            </label>
            <div className="field">
              <span>Renk</span>
              <div className="swatches">
                {COLORS.map((c) => (
                  <button key={c} className={cx('swatch', c === color && 'on')} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
                ))}
              </div>
            </div>
            <button className="btn primary lg" disabled={!!nameError(name)} onClick={done}>
              Xanaphian'a gir
            </button>
          </>
        )}
      </div>
    </div>
  );
}
