import React, { useEffect, useRef, useState } from 'react';
import { X, LoaderCircle, Download, RotateCw, RefreshCw, Trash2, Plus, CircleCheck, Mic } from 'lucide-react';
import {
  useStore, openModal, moveToServer, updateSettings, updateProfile, toast, cmd, forgetHost, confirmDialog, deleteCommunity, makeInvite, Settings as SettingsT,
} from '../lib/store';
import { VoiceTab } from './VoiceSettings';
import { Avatar, CommunityIcon, Toggle, Logo, STATUS_LABEL } from './Common';
import { ProfileEditor } from './profile/ProfileEditor';
import { AppearanceTab } from './Appearance';
import { ActivityTab } from './ActivitySettings';
import { cx, COLORS, resizeImage, copyText, fmtSize, fmtDay, displayName, modKey } from '../lib/util';
import { playSound } from '../lib/sound';
import { can, Perm, type Role, type Community } from '../../shared/protocol';

export const close = () => openModal(null);
// Sohbet / Gizlilik / Gelişmiş sekmeleri ayrı dosyada (MoreSettings.tsx)
import { ChatTab, PrivacyTab, AdvancedTab, NotifyExtras } from './MoreSettings';
import { OverlayTab } from './Kaplama';

export function Shell({ nav, tab, setTab, children, footer }: { nav: { id: string; label: string; group?: string; danger?: boolean }[]; tab: string; setTab: (t: string) => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-backdrop .confirm') && close();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  let lastGroup = '';
  return (
    <div className="settings">
      <nav className="settings-nav scroll-thin">
        <div className="settings-nav-inner">
          {nav.map((n) => {
            const head = n.group && n.group !== lastGroup ? ((lastGroup = n.group), <div key={'g' + n.group} className="sn-group">{n.group}</div>) : null;
            return (
              <React.Fragment key={n.id}>
                {head}
                <button className={cx('sn-item', tab === n.id && 'on', n.danger && 'danger')} onClick={() => setTab(n.id)}>
                  {n.label}
                </button>
              </React.Fragment>
            );
          })}
          {footer}
        </div>
      </nav>
      <main className="settings-main scroll-thin">
        <div className="settings-content">{children}</div>
        <button className="settings-close" onClick={close} aria-label="Kapat">
          <X size={20} />
          <span>ESC</span>
        </button>
      </main>
    </div>
  );
}

export function Row({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-title">{title}</div>
        {sub && <div className="set-row-sub">{sub}</div>}
      </div>
      <div className="set-row-ctl">{children}</div>
    </div>
  );
}

// Profil ve görünüm sekmeleri ayrı dosyalarda (profile/ProfileEditor.tsx, Appearance.tsx)
const ProfileTab = ProfileEditor;

function NotificationsTab() {
  const s = useStore((x) => x.settings);
  return (
    <>
      <h1>Bildirimler</h1>
      <h3>Masaüstü bildirimleri</h3>
      <div className="radio-list">
        {(
          [
            ['all', 'Tüm mesajlar', 'Pencere arka plandayken her yeni mesajda bildir.'],
            ['mentions', 'Sadece bahsetmeler', '@adın, @everyone ve sana verilen yanıtlar.'],
            ['none', 'Hiçbiri', 'Bildirim gösterme.'],
          ] as const
        ).map(([id, t, sub]) => (
          <button key={id} className={cx('radio-opt', s.notify === id && 'on')} onClick={() => updateSettings({ notify: id })}>
            <span className="radio" />
            <div>
              <b>{t}</b>
              <span>{sub}</span>
            </div>
          </button>
        ))}
      </div>
      <Row title="Arayüz sesleri" sub="Mesaj, bahsetme ve ses kanalı giriş/çıkış sesleri.">
        <Toggle value={s.sounds} onChange={(v) => updateSettings({ sounds: v })} />
      </Row>
      <div className="btn-row">
        <button className="btn ghost sm" onClick={() => playSound('message')}>
          Mesaj sesini dene
        </button>
        <button className="btn ghost sm" onClick={() => playSound('mention')}>
          Bahsetme sesini dene
        </button>
      </div>
      <p className="note">"Rahatsız Etmeyin" durumundayken bildirimler ve sesler susturulur.</p>
      <NotifyExtras />
    </>
  );
}

function ConnectionTab() {
  const info = useStore((x) => x.info);
  const s = useStore((x) => x.settings);
  const conns = useStore((x) => x.conns);
  const commHost = useStore((x) => x.commHost);
  const communities = useStore((x) => x.communities);
  const [pub, setPub] = useState(s.publicAddress);
  const home = Object.values(conns).find((c) => c.home);
  const local = Object.values(conns).find((c) => c.local);
  const localComms = local ? Object.values(communities).filter((c) => !c.dm && commHost[c.id] === local.host) : [];
  const others = Object.values(conns).filter((c) => !c.local && !c.home);
  const stText = (st?: string) => (st === 'online' ? 'Bağlı' : st === 'connecting' ? 'Bağlanıyor…' : 'Bağlantı yok');
  return (
    <>
      <h1>Bağlantı</h1>
      <div className="info-card">
        <div className="ic-row">
          <span>Sunucu</span>
          <b className={home?.status === 'online' ? 'ok' : ''}>
            {home?.status === 'online' && <CircleCheck size={14} />} {stText(home?.status)}
          </b>
        </div>
        <div className="ic-row">
          <span>Adres</span>
          <b>{home?.host.replace(/^https?:\/\//, '') || '—'}</b>
        </div>
      </div>
      <p className="note">
        Toplulukların, mesajların ve dosyaların sunucuda durur; bilgisayarın kapalıyken de arkadaşların sohbet etmeye devam eder. Sesli sohbet ve ekran paylaşımı kişiler arasında doğrudan akar.
      </p>
      {localComms.length > 0 && <LocalCommunities comms={localComms} />}
      {localComms.length > 0 && (
        <label className="field" style={{ marginTop: 18 }}>
          <span>Bilgisayarındaki topluluklar için dış adres (isteğe bağlı)</span>
          <div className="copy-row">
            <input placeholder="ör. 85.100.20.30 veya alanadi.com:47820" value={pub} onChange={(e) => setPub(e.target.value)} />
            <button
              className="btn primary"
              onClick={() => {
                updateSettings({ publicAddress: pub.trim() });
                toast('Kaydedildi.', 'ok');
              }}
            >
              Kaydet
            </button>
          </div>
          <small className="note">Yalnızca sunucuya taşımadığın, bilgisayarında duran topluluklar için. Port: {info?.hubPort}.</small>
        </label>
      )}
      {others.length > 0 && (
        <>
          <h3>Bağlı olduğun diğer sunucular</h3>
          <div className="list-card">
            {others.map((c) => (
              <div key={c.host} className="lc-row">
                <span className={cx('dot', c.status)} />
                <div className="lc-text">
                  <b>{c.hubName ? `${c.hubName} sunucusu` : c.host}</b>
                  <span>
                    {c.host} · {c.status === 'online' ? 'bağlı' : c.status === 'connecting' ? 'bağlanıyor' : 'çevrimdışı'}
                  </span>
                </div>
                <button
                  className="btn ghost sm"
                  onClick={() => confirmDialog('Bu sunucuyu unut?', 'Bu sunucudaki topluluklar listenden kalkar. Tekrar katılmak için davet gerekir.', () => forgetHost(c.host), 'Unut')}
                >
                  Unut
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function LocalCommunities({ comms }: { comms: Community[] }) {
  const me = useStore((x) => x.me.id);
  const [busy, setBusy] = useState('');
  const move = (c: Community) =>
    confirmDialog(
      `"${c.name}" sunucuya taşınsın mı?`,
      'Kanallar, roller, üyeler, mesajlar ve dosyalar sunucuya kopyalanır. Üyeler topluluğu sunucuda görmeye devam eder; bilgisayarın kapalıyken de sohbet sürer. Bilgisayarındaki kopya yedek olarak kalır.',
      async () => {
        setBusy(c.id);
        try {
          const r = await moveToServer(c.id);
          toast(r.failed ? `"${c.name}" taşındı, ${r.failed} dosya aktarılamadı.` : `"${c.name}" sunucuya taşındı.`, 'ok');
        } catch (e) {
          toast((e as Error).message, 'err');
        }
        setBusy('');
      },
      'Taşı',
      false,
    );
  return (
    <>
      <h3>Bilgisayarında duran topluluklar</h3>
      <div className="list-card">
        {comms.map((c) => (
          <div key={c.id} className="lc-row">
            <span className="dot online" />
            <div className="lc-text">
              <b>{c.name}</b>
              <span>{c.members.length} üye · bilgisayarın kapanınca ulaşılamaz</span>
            </div>
            {c.ownerId === me && (
              <button className="btn primary sm" disabled={!!busy} onClick={() => move(c)}>
                {busy === c.id ? 'Taşınıyor…' : 'Sunucuya taşı'}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function AppTab() {
  const s = useStore((x) => x.settings);
  return (
    <>
      <h1>Uygulama</h1>
      <Row title="Kapatınca tepside çalış" sub="Pencereyi kapatınca Xanaphian arka planda çalışmaya devam eder; topluluğuna gelenler sohbet edebilir.">
        <Toggle value={s.closeToTray} onChange={(v) => updateSettings({ closeToTray: v })} />
      </Row>
      <Row title="Bilgisayar açılınca başlat" sub="Windows oturumu açıldığında Xanaphian tepside başlar.">
        <Toggle value={s.openAtLogin} onChange={(v) => updateSettings({ openAtLogin: v })} />
      </Row>
      <Row title="Enter ile gönder" sub="Kapalıyken Ctrl+Enter ile gönderilir, Enter yeni satır açar.">
        <Toggle value={s.enterToSend} onChange={(v) => updateSettings({ enterToSend: v })} />
      </Row>
      <h3>Klavye kısayolları</h3>
      <div className="shortcuts">
        {[
          [`${modKey}+K`, 'Hızlı geçiş'],
          ['Alt+↑ / Alt+↓', 'Önceki / sonraki kanal'],
          ['Alt+Shift+↑ / ↓', 'Okunmamış kanala atla'],
          [`${modKey}+Shift+M`, 'Mikrofonu aç/kapat'],
          [`${modKey}+Shift+D`, 'Sağırlaştır'],
          [`${modKey}+,`, 'Ayarlar'],
          ['↑ (boş kutuda)', 'Son mesajını düzenle'],
          ['Esc', 'Yanıtı / düzenlemeyi iptal et'],
          ['Shift+Enter', 'Yeni satır'],
        ].map(([k, d]) => (
          <div key={k} className="sc-row">
            <span>{d}</span>
            <kbd>{k}</kbd>
          </div>
        ))}
      </div>
    </>
  );
}

function UpdatesTab() {
  const info = useStore((x) => x.info);
  const u = useStore((x) => x.update);
  return (
    <>
      <h1>Güncellemeler</h1>
      <div className="update-card">
        <Logo size={56} />
        <div className="uc-text">
          <div className="uc-title">Xanaphian v{info?.version}</div>
          <div className="uc-sub">
            {u.state === 'checking' && 'Güncellemeler denetleniyor…'}
            {u.state === 'none' && 'Xanaphian güncel.'}
            {u.state === 'available' && `Yeni sürüm hazır: v${u.version}${u.size ? ` (${fmtSize(u.size)})` : ''}`}
            {u.state === 'downloading' && `v${u.version} indiriliyor… %${Math.floor(u.percent)} · ${fmtSize(u.bps)}/sn`}
            {u.state === 'ready' && `v${u.version} indirildi. Yeniden başlatınca yüklenecek.`}
            {u.state === 'error' && `Hata: ${u.message}`}
            {u.state === 'dev' && 'Geliştirme modunda güncelleme kapalı.'}
            {u.state === 'idle' && 'Güncellemeler otomatik denetlenir (30 dakikada bir).'}
          </div>
          {u.state === 'downloading' && (
            <div className="meter">
              <div style={{ width: `${u.percent}%` }} />
            </div>
          )}
        </div>
        <div>
          {u.state === 'available' ? (
            <button className="btn success" onClick={() => window.kovan.update.download()}>
              <Download size={16} /> Güncelle
            </button>
          ) : u.state === 'ready' ? (
            <button className="btn success" onClick={() => window.kovan.update.install()}>
              <RotateCw size={16} /> Yeniden başlat
            </button>
          ) : (
            <button className="btn primary" disabled={u.state === 'checking' || u.state === 'downloading'} onClick={() => window.kovan.update.check()}>
              {u.state === 'checking' ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} Denetle
            </button>
          )}
        </div>
      </div>
      {(u.state === 'available' || u.state === 'ready') && u.notes && (
        <>
          <h3>Bu sürümde neler var?</h3>
          <pre className="notes">{u.notes}</pre>
        </>
      )}
      <p className="note">
        Güncellemeler GitHub üzerinden yayınlanır. Yeni sürüm çıktığında üst çubukta yeşil <b>Güncelle</b> düğmesi belirir; bir kez tıklayınca indirilir, ikinci tıklamada uygulama yeniden başlayıp kendini günceller. Verilerin ve toplulukların korunur.
      </p>
      <div className="info-card">
        <div className="ic-row">
          <span>Electron</span>
          <b>{info?.electron}</b>
        </div>
        <div className="ic-row">
          <span>Chromium</span>
          <b>{info?.chrome}</b>
        </div>
      </div>
    </>
  );
}

export function UserSettings({ tab: initial }: { tab?: string }) {
  const [tab, setTab] = useState(initial || 'profile');
  const nav = [
    { id: 'profile', label: 'Profilim', group: 'Kullanıcı Ayarları' },
    { id: 'activity', label: 'Etkinlik', group: 'Kullanıcı Ayarları' },
    { id: 'connection', label: 'Bağlantı', group: 'Kullanıcı Ayarları' },
    { id: 'privacy', label: 'Gizlilik ve Güvenlik', group: 'Kullanıcı Ayarları' },
    { id: 'appearance', label: 'Görünüm', group: 'Uygulama Ayarları' },
    { id: 'notifications', label: 'Bildirimler', group: 'Uygulama Ayarları' },
    { id: 'voice', label: 'Ses ve Görüntü', group: 'Uygulama Ayarları' },
    { id: 'overlay', label: 'Oyun İçi Kaplama', group: 'Uygulama Ayarları' },
    { id: 'chat', label: 'Sohbet', group: 'Uygulama Ayarları' },
    { id: 'advanced', label: 'Gelişmiş', group: 'Uygulama Ayarları' },
    { id: 'app', label: 'Uygulama ve Kısayollar', group: 'Uygulama Ayarları' },
    { id: 'updates', label: 'Güncellemeler', group: 'Xanaphian' },
  ];
  const version = useStore((x) => x.info?.version);
  return (
    <Shell
      nav={nav}
      tab={tab}
      setTab={setTab}
      footer={
        <>
          <div className="sn-sep" />
          <button className="sn-item danger" onClick={() => confirmDialog('Xanaphian kapatılsın mı?', 'Uygulama tamamen kapanır; yeniden açana kadar mesaj bildirimi almazsın.', () => window.kovan.quit(), 'Kapat')}>
            Uygulamadan çık
          </button>
          <div className="sn-version">Xanaphian v{version}</div>
        </>
      }
    >
      {tab === 'profile' && <ProfileTab />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'voice' && <VoiceTab />}
      {tab === 'overlay' && <OverlayTab />}
      {tab === 'connection' && <ConnectionTab />}
      {tab === 'app' && <AppTab />}
      {tab === 'updates' && <UpdatesTab />}
      {tab === 'chat' && <ChatTab />}
      {tab === 'privacy' && <PrivacyTab />}
      {tab === 'advanced' && <AdvancedTab />}
    </Shell>
  );
}

export type { SettingsT };
