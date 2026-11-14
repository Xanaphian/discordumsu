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

export function HomeView() {
  const tab = useStore((s) => s.homeTab);
  return tab === 'home' ? <HomeStart /> : <FriendsView />;
}

export function Onboarding() {
  const me = useStore((s) => s.me);
  const [name, setName] = useState('');
  const [color, setColor] = useState(me.color);
  const [avatar, setAvatar] = useState<string | undefined>();
  const [step, setStep] = useState(0);
  const file = React.useRef<HTMLInputElement>(null);
  const done = () => name.trim() && finishOnboarding({ name: name.trim(), color, avatar });
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
          </>
        ) : (
          <>
            <h1>Seni nasıl çağıralım?</h1>
            <p>Bu ad ve görünüm, katıldığın tüm topluluklarda görünür. Sonradan Ayarlar'dan değiştirebilirsin.</p>
            <button className="ob-avatar" onClick={() => file.current?.click()} title="Profil resmi seç">
              <Avatar user={{ name: name || '?', color, avatar }} size={96} />
              <span className="ob-avatar-edit">Resim seç</span>
            </button>
            <input ref={file} hidden type="file" accept="image/*" onChange={async (e) => e.target.files?.[0] && setAvatar(await resizeImage(e.target.files[0], 128))} />
            <label className="field">
              <span>Görünen ad</span>
              <input autoFocus maxLength={32} value={name} placeholder="ör. Enes" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && done()} />
            </label>
            <div className="field">
              <span>Renk</span>
              <div className="swatches">
                {COLORS.map((c) => (
                  <button key={c} className={cx('swatch', c === color && 'on')} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
                ))}
              </div>
            </div>
            <button className="btn primary lg" disabled={!name.trim()} onClick={done}>
              Xanaphian'a gir
            </button>
          </>
        )}
      </div>
    </div>
  );
}
