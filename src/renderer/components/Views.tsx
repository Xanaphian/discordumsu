import React, { useState } from 'react';
import { Volume2, Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Plus, LogIn, Users, Zap, Shield, Keyboard, ArrowRight } from 'lucide-react';
import { useStore, openModal, selectCommunity, finishOnboarding, realCommunities, setHomeTab } from '../lib/store';
import { FriendsView } from './Friends';
import { useVoice, joinVoice, leaveVoice, toggleMute, toggleDeaf } from '../lib/voice';
import { Avatar, CommunityIcon, Logo, Tooltip } from './Common';
import { cx, COLORS, displayName, resizeImage, modKey } from '../lib/util';
import type { Channel, Community } from '../../shared/protocol';
import { useUnread } from './ServerRail';

export function HomeView() {
  const tab = useStore((s) => s.homeTab);
  return tab === 'home' ? <HomeStart /> : <FriendsView />;
}

function HomeStart() {
  const me = useStore((s) => s.me);
  const communities = useStore((s) => s.communities);
  const presence = useStore((s) => s.presence);
  const { comm } = useUnread();
  const list = realCommunities(communities);
  return (
    <section className="home scroll-thin">
      <div className="home-inner">
        <div className="home-hero">
          <div className="hh-text">
            <h1>Merhaba, {me.name} 👋</h1>
            <p>Kovan'da toplulukların, kanalların ve arkadaşların bir arada. Kendi topluluğunu kur ya da bir davetle katıl.</p>
            <div className="btn-row">
              <button className="btn primary lg" onClick={() => openModal({ type: 'createCommunity' })}>
                <Plus size={18} /> Topluluk oluştur
              </button>
              <button className="btn ghost lg" onClick={() => openModal({ type: 'join' })}>
                <LogIn size={18} /> Davetle katıl
              </button>
              <button className="btn ghost lg" onClick={() => setHomeTab('add')}>
                <Users size={18} /> Arkadaş ekle
              </button>
            </div>
          </div>
          <div className="hh-art" aria-hidden>
            {Array.from({ length: 7 }).map((_, i) => (
              <span key={i} className={`hex h${i}`} />
            ))}
          </div>
        </div>
        <h3 className="home-h">Toplulukların</h3>
        <div className="comm-cards">
          {list.map((c) => {
            const online = c.members.filter((m) => presence[m.userId] && presence[m.userId] !== 'offline').length;
            return (
              <button key={c.id} className="comm-card" onClick={() => selectCommunity(c.id)}>
                <div className="cc-banner" style={{ background: `linear-gradient(135deg, ${c.color}, color-mix(in srgb, ${c.color} 30%, #000))` }} />
                <div className="cc-icon hex">
                  <CommunityIcon c={c} size={52} />
                </div>
                <div className="cc-body">
                  <b>{c.name}</b>
                  <span className="cc-meta">
                    <i className="dot online" /> {online} çevrimiçi · {c.members.length} üye
                  </span>
                  {comm[c.id]?.mentions ? <span className="badge">{comm[c.id].mentions} bahsetme</span> : comm[c.id]?.unread ? <span className="cc-unread">Yeni mesajlar</span> : null}
                </div>
              </button>
            );
          })}
          {!list.length && <div className="empty-note">Henüz bir topluluğun yok.</div>}
        </div>
        <h3 className="home-h">İpuçları</h3>
        <div className="tips">
          <div className="tip-card">
            <Keyboard size={20} />
            <b>{modKey}+K</b>
            <span>Hızlı geçiş ile her kanala iki tuşla git.</span>
          </div>
          <div className="tip-card">
            <Users size={20} />
            <b>Davet kodu</b>
            <span>Topluluk adına tıkla → Davet et. Kodu arkadaşına gönder.</span>
          </div>
          <div className="tip-card">
            <Zap size={20} />
            <b>Tek tuşla güncelleme</b>
            <span>Yeni sürüm çıkınca üst çubukta yeşil Güncelle düğmesi belirir.</span>
          </div>
          <div className="tip-card">
            <Shield size={20} />
            <b>Veriler sende</b>
            <span>Toplulukların ve mesajların barındıran bilgisayarda saklanır, araya bulut girmez.</span>
          </div>
        </div>
      </div>
    </section>
  );
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
            <h1>Kovan'a hoş geldin</h1>
            <p>Arkadaşlarınla topluluklar kur, kanallarda yazış, sesli sohbet et. Hızlı, hafif ve verilerin kendi bilgisayarında.</p>
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
              Kovan'a gir
            </button>
          </>
        )}
      </div>
    </div>
  );
}
