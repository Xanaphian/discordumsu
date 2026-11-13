import React, { useEffect, useRef, useState } from 'react';
import { X, LoaderCircle, Download, RotateCw, RefreshCw, Trash2, Plus, CircleCheck, Mic } from 'lucide-react';
import {
  useStore, openModal, updateSettings, updateProfile, toast, cmd, forgetHost, confirmDialog, deleteCommunity, makeInvite, Settings as SettingsT,
} from '../lib/store';
import { Avatar, CommunityIcon, Toggle, Logo, STATUS_LABEL } from './Common';
import { cx, COLORS, resizeImage, copyText, fmtSize, fmtDay, displayName, modKey } from '../lib/util';
import { playSound } from '../lib/sound';
import { can, Perm, type Role } from '../../shared/protocol';

const close = () => openModal(null);

function Shell({ nav, tab, setTab, children, footer }: { nav: { id: string; label: string; group?: string; danger?: boolean }[]; tab: string; setTab: (t: string) => void; children: React.ReactNode; footer?: React.ReactNode }) {
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

function Row({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
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

// ---------------------------------------------------------------------------
function ProfileTab() {
  const me = useStore((s) => s.me);
  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio || '');
  const [color, setColor] = useState(me.color);
  const [avatar, setAvatar] = useState(me.avatar);
  const file = useRef<HTMLInputElement>(null);
  const dirty = name !== me.name || bio !== (me.bio || '') || color !== me.color || avatar !== me.avatar;
  const save = async () => {
    if (!name.trim()) return toast('Kullanıcı adı boş olamaz.', 'err');
    await updateProfile({ name: name.trim(), bio: bio.trim(), color, avatar });
    toast('Profil kaydedildi', 'ok');
  };
  return (
    <>
      <h1>Profilim</h1>
      <div className="profile-edit">
        <div className="profile-form">
          <label className="field">
            <span>Görünen ad</span>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span>Profil resmi</span>
            <div className="btn-row">
              <button className="btn primary sm" onClick={() => file.current?.click()}>
                Resim yükle
              </button>
              {avatar && (
                <button className="btn ghost sm" onClick={() => setAvatar(undefined)}>
                  Kaldır
                </button>
              )}
            </div>
            <input ref={file} hidden type="file" accept="image/*" onChange={async (e) => e.target.files?.[0] && setAvatar(await resizeImage(e.target.files[0], 128))} />
          </div>
          <div className="field">
            <span>Profil rengi</span>
            <div className="swatches">
              {COLORS.map((c) => (
                <button key={c} className={cx('swatch', c === color && 'on')} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-input" />
            </div>
          </div>
          <label className="field">
            <span>Hakkımda</span>
            <textarea rows={3} maxLength={190} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Kendinden biraz bahset" />
            <small className="counter">{190 - bio.length}</small>
          </label>
        </div>
        <div className="profile-preview">
          <div className="popout static">
            <div className="popout-banner" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 40%, #000))` }} />
            <div className="popout-avatar">
              <Avatar user={{ name: name || '?', color, avatar }} size={80} status={me.status === 'invisible' ? 'offline' : me.status} />
            </div>
            <div className="popout-body">
              <div className="popout-name">{name || 'İsimsiz'}</div>
              <div className="popout-user">{STATUS_LABEL[me.status]}</div>
              {bio && (
                <div className="popout-section">
                  <div className="popout-label">Hakkında</div>
                  <div className="popout-bio">{bio}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {dirty && (
        <div className="save-bar">
          <span>Dikkat, kaydedilmemiş değişikliklerin var!</span>
          <button
            className="btn ghost sm"
            onClick={() => {
              setName(me.name);
              setBio(me.bio || '');
              setColor(me.color);
              setAvatar(me.avatar);
            }}
          >
            Sıfırla
          </button>
          <button className="btn success sm" onClick={save}>
            Değişiklikleri kaydet
          </button>
        </div>
      )}
    </>
  );
}

const ACCENTS = ['#f5a524', '#3ecf8e', '#6cb6ff', '#c084fc', '#fb7185', '#22d3ee'];

function AppearanceTab() {
  const s = useStore((x) => x.settings);
  return (
    <>
      <h1>Görünüm</h1>
      <h3>Tema</h3>
      <div className="theme-cards">
        {(
          [
            ['dark', 'Koyu', '#1e1d23', '#111014'],
            ['midnight', 'Gece', '#000000', '#0a0a0c'],
            ['light', 'Açık', '#ffffff', '#e9e6e0'],
          ] as const
        ).map(([id, label, a, b]) => (
          <button key={id} className={cx('theme-card', s.theme === id && 'on')} onClick={() => updateSettings({ theme: id })}>
            <span className="tc-preview" style={{ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` }} />
            {label}
          </button>
        ))}
      </div>
      <h3>Vurgu rengi</h3>
      <div className="swatches big">
        {ACCENTS.map((c) => (
          <button key={c} className={cx('swatch', s.accent === c && 'on')} style={{ background: c }} onClick={() => updateSettings({ accent: c })} aria-label={c} />
        ))}
      </div>
      <h3>Yazı boyutu: {s.fontSize}px</h3>
      <input type="range" min={12} max={20} step={1} value={s.fontSize} onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })} />
      <div className="divider" />
      <Row title="Sıkışık mod" sub="Mesajlar arasında daha az boşluk, avatarlar gizli.">
        <Toggle value={s.compact} onChange={(v) => updateSettings({ compact: v })} />
      </Row>
      <Row title="Hareketi azalt" sub="Animasyonları ve geçişleri en aza indirir.">
        <Toggle value={s.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
      </Row>
    </>
  );
}

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
    </>
  );
}

function VoiceTab() {
  const s = useStore((x) => x.settings);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [lvl, setLvl] = useState(0);
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => {});
  }, [testing]);
  useEffect(() => {
    if (!testing) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: s.micId !== 'default' ? { ideal: s.micId } : undefined, noiseSuppression: s.noiseSuppression, echoCancellation: true } })
      .then((st) => {
        stream = st;
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(st).connect(an);
        const buf = new Uint8Array(512);
        const loop = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          setLvl(Math.min(1, Math.sqrt(sum / buf.length) * 5));
          raf = requestAnimationFrame(loop);
        };
        loop();
      })
      .catch(() => {
        toast('Mikrofona erişilemedi.', 'err');
        setTesting(false);
      });
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, [testing, s.micId, s.noiseSuppression]);
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const outputs = devices.filter((d) => d.kind === 'audiooutput');
  return (
    <>
      <h1>Ses</h1>
      <div className="two-col">
        <label className="field">
          <span>Giriş aygıtı</span>
          <select value={s.micId} onChange={(e) => updateSettings({ micId: e.target.value })}>
            <option value="default">Varsayılan</option>
            {inputs.filter((d) => d.deviceId !== 'default').map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Mikrofon'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Çıkış aygıtı</span>
          <select value={s.speakerId} onChange={(e) => updateSettings({ speakerId: e.target.value })}>
            <option value="default">Varsayılan</option>
            {outputs.filter((d) => d.deviceId !== 'default').map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Hoparlör'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <h3>Mikrofon testi</h3>
      <div className="mic-test">
        <button className={cx('btn sm', testing ? 'danger' : 'primary')} onClick={() => setTesting((t) => !t)}>
          <Mic size={14} /> {testing ? 'Durdur' : 'Test et'}
        </button>
        <div className="meter">
          <div style={{ width: `${lvl * 100}%` }} />
        </div>
      </div>
      <Row title="Gürültü bastırma" sub="Klavye, fan gibi arka plan seslerini azaltır.">
        <Toggle value={s.noiseSuppression} onChange={(v) => updateSettings({ noiseSuppression: v })} />
      </Row>
      <p className="note">Sesli kanallar doğrudan eşler arası (WebRTC) bağlantı kurar; ses kovan sunucusundan geçmez.</p>
    </>
  );
}

function ConnectionTab() {
  const info = useStore((x) => x.info);
  const s = useStore((x) => x.settings);
  const conns = useStore((x) => x.conns);
  const [pub, setPub] = useState(s.publicAddress);
  return (
    <>
      <h1>Bağlantı</h1>
      <div className="info-card">
        <div className="ic-row">
          <span>Kendi kovanın</span>
          <b className="ok">
            <CircleCheck size={14} /> Çalışıyor · port {info?.hubPort}
          </b>
        </div>
        <div className="ic-row">
          <span>Yerel ağ adreslerin</span>
          <b>{info?.lan.length ? info.lan.map((x) => `${x}:${info.hubPort}`).join(', ') : 'Ağ bulunamadı'}</b>
        </div>
      </div>
      <label className="field">
        <span>Dış adres (isteğe bağlı)</span>
        <div className="copy-row">
          <input placeholder="ör. 85.100.20.30 veya alanadi.com:47820" value={pub} onChange={(e) => setPub(e.target.value)} />
          <button
            className="btn primary"
            onClick={() => {
              updateSettings({ publicAddress: pub.trim() });
              toast('Kaydedildi. Yeni davet kodları bu adresi de içerecek.', 'ok');
            }}
          >
            Kaydet
          </button>
        </div>
        <small className="note">
          Farklı ağlardaki arkadaşların için: modeminde TCP {info?.hubPort} portunu bu bilgisayara yönlendir ve dış IP'ni buraya yaz. Aynı ağdaysanız gerek yok.
        </small>
      </label>
      <h3>Bağlı olduğun kovanlar</h3>
      <div className="list-card">
        {Object.values(conns)
          .filter((c) => !c.local)
          .map((c) => (
            <div key={c.host} className="lc-row">
              <span className={cx('dot', c.status)} />
              <div className="lc-text">
                <b>{c.hubName ? `${c.hubName} kovanı` : c.host}</b>
                <span>
                  {c.host} · {c.status === 'online' ? 'bağlı' : c.status === 'connecting' ? 'bağlanıyor' : 'çevrimdışı'}
                </span>
              </div>
              <button
                className="btn ghost sm"
                onClick={() => confirmDialog('Bu kovanı unut?', 'Bu kovandaki topluluklar listenden kalkar. Tekrar katılmak için davet gerekir.', () => forgetHost(c.host), 'Unut')}
              >
                Unut
              </button>
            </div>
          ))}
        {!Object.values(conns).some((c) => !c.local) && <div className="empty-note">Henüz başka bir kovana bağlanmadın.</div>}
      </div>
    </>
  );
}

function AppTab() {
  const s = useStore((x) => x.settings);
  return (
    <>
      <h1>Uygulama</h1>
      <Row title="Kapatınca tepside çalış" sub="Pencereyi kapatınca Kovan arka planda çalışmaya devam eder; topluluğuna gelenler sohbet edebilir.">
        <Toggle value={s.closeToTray} onChange={(v) => updateSettings({ closeToTray: v })} />
      </Row>
      <Row title="Bilgisayar açılınca başlat" sub="Windows oturumu açıldığında Kovan tepside başlar.">
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
          <div className="uc-title">Kovan v{info?.version}</div>
          <div className="uc-sub">
            {u.state === 'checking' && 'Güncellemeler denetleniyor…'}
            {u.state === 'none' && 'Kovan güncel.'}
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
    { id: 'connection', label: 'Bağlantı', group: 'Kullanıcı Ayarları' },
    { id: 'appearance', label: 'Görünüm', group: 'Uygulama Ayarları' },
    { id: 'notifications', label: 'Bildirimler', group: 'Uygulama Ayarları' },
    { id: 'voice', label: 'Ses', group: 'Uygulama Ayarları' },
    { id: 'app', label: 'Uygulama ve Kısayollar', group: 'Uygulama Ayarları' },
    { id: 'updates', label: 'Güncellemeler', group: 'Kovan' },
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
          <button className="sn-item danger" onClick={() => confirmDialog('Kovan kapatılsın mı?', 'Uygulama tamamen kapanır; senin barındırdığın topluluklara kimse bağlanamaz.', () => window.kovan.quit(), 'Kapat')}>
            Uygulamadan çık
          </button>
          <div className="sn-version">Kovan v{version}</div>
        </>
      }
    >
      {tab === 'profile' && <ProfileTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'voice' && <VoiceTab />}
      {tab === 'connection' && <ConnectionTab />}
      {tab === 'app' && <AppTab />}
      {tab === 'updates' && <UpdatesTab />}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
const PERMS: { bit: number; label: string; sub: string }[] = [
  { bit: Perm.ADMIN, label: 'Yönetici', sub: 'Tüm yetkiler. Dikkatli ver.' },
  { bit: Perm.MANAGE_COMMUNITY, label: 'Topluluğu yönet', sub: 'Ad, simge ve davet kodunu değiştirebilir.' },
  { bit: Perm.MANAGE_CHANNELS, label: 'Kanalları yönet', sub: 'Kanal ve kategori oluşturur, düzenler, siler; duyuru kanallarına yazar.' },
  { bit: Perm.MANAGE_ROLES, label: 'Rolleri yönet', sub: 'Rol oluşturur ve üyelere rol verir.' },
  { bit: Perm.MANAGE_MESSAGES, label: 'Mesajları yönet', sub: 'Başkalarının mesajlarını siler, sabitler; yavaş moddan etkilenmez.' },
  { bit: Perm.KICK, label: 'Üyeleri at', sub: 'Üyeleri topluluktan çıkarabilir.' },
  { bit: Perm.MENTION_EVERYONE, label: '@everyone kullan', sub: 'Herkese bildirim gönderebilir.' },
];

function RoleEditor({ cid, role }: { cid: string; role: Role }) {
  const isEveryone = role.id === cid;
  const [name, setName] = useState(role.name);
  useEffect(() => setName(role.name), [role.id, role.name]);
  const upd = (patch: Partial<Role>) => cmd(cid, { t: 'role.update', cid, id: role.id, ...patch });
  return (
    <div className="role-editor">
      {!isEveryone && (
        <>
          <label className="field">
            <span>Rol adı</span>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== role.name && upd({ name })} />
          </label>
          <div className="field">
            <span>Rol rengi</span>
            <div className="swatches">
              <button className={cx('swatch none', !role.color && 'on')} onClick={() => upd({ color: '' })} aria-label="Renksiz" />
              {COLORS.map((c) => (
                <button key={c} className={cx('swatch', role.color === c && 'on')} style={{ background: c }} onClick={() => upd({ color: c })} aria-label={c} />
              ))}
            </div>
          </div>
          <Row title="Üye listesinde ayrı göster" sub="Bu roldeki çevrimiçi üyeler kendi başlığı altında listelenir.">
            <Toggle value={role.hoist} onChange={(v) => upd({ hoist: v })} />
          </Row>
        </>
      )}
      <h3>Yetkiler</h3>
      {PERMS.map((p) => (
        <Row key={p.bit} title={p.label} sub={p.sub}>
          <Toggle value={(role.perms & p.bit) === p.bit} onChange={(v) => upd({ perms: v ? role.perms | p.bit : role.perms & ~p.bit })} />
        </Row>
      ))}
      {!isEveryone && (
        <button className="btn danger sm" onClick={() => confirmDialog(`"${role.name}" rolü silinsin mi?`, 'Bu role sahip üyelerden rol kaldırılır.', () => cmd(cid, { t: 'role.delete', cid, id: role.id }), 'Sil')}>
          <Trash2 size={14} /> Rolü sil
        </button>
      )}
    </div>
  );
}

export function CommunitySettings({ cid, tab: initial }: { cid: string; tab?: string }) {
  const c = useStore((s) => s.communities[cid]);
  const me = useStore((s) => s.me.id);
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const [tab, setTab] = useState(initial || 'overview');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [name, setName] = useState(c?.name || '');
  const [desc, setDesc] = useState(c?.description || '');
  const [filter, setFilter] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!c) close();
  }, [c]);
  if (!c) return null;
  const manage = can(c, me, Perm.MANAGE_COMMUNITY);
  const nav = [
    ...(manage ? [{ id: 'overview', label: 'Genel Bakış', group: c.name }] : []),
    ...(can(c, me, Perm.MANAGE_ROLES) ? [{ id: 'roles', label: 'Roller', group: c.name }] : []),
    { id: 'members', label: 'Üyeler', group: 'Kullanıcı Yönetimi' },
    { id: 'invites', label: 'Davetler', group: 'Kullanıcı Yönetimi' },
    ...(c.ownerId === me ? [{ id: 'delete', label: 'Topluluğu sil', danger: true }] : []),
  ];
  const cur = nav.some((n) => n.id === tab) ? tab : nav[0].id;
  const roles = [...c.roles].sort((a, b) => b.position - a.position);
  const role = c.roles.find((r) => r.id === roleId) || null;
  return (
    <Shell nav={nav} tab={cur} setTab={setTab}>
      {cur === 'overview' && (
        <>
          <h1>Topluluk Genel Bakışı</h1>
          <div className="overview">
            <button className="icon-upload hex" onClick={() => file.current?.click()}>
              <CommunityIcon c={c} size={96} />
              <span className="iu-hover">Değiştir</span>
            </button>
            <input
              ref={file}
              hidden
              type="file"
              accept="image/*"
              onChange={async (e) => e.target.files?.[0] && cmd(cid, { t: 'comm.update', cid, icon: await resizeImage(e.target.files[0], 160) })}
            />
            <div className="overview-form">
              <label className="field">
                <span>Topluluk adı</span>
                <input value={name} maxLength={48} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== c.name && cmd(cid, { t: 'comm.update', cid, name })} />
              </label>
              {c.icon && (
                <button className="btn ghost sm" onClick={() => cmd(cid, { t: 'comm.update', cid, icon: null })}>
                  Simgeyi kaldır
                </button>
              )}
            </div>
          </div>
          <label className="field">
            <span>Açıklama</span>
            <textarea rows={3} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (c.description || '') && cmd(cid, { t: 'comm.update', cid, description: desc })} />
          </label>
          <div className="field">
            <span>Renk</span>
            <div className="swatches">
              {COLORS.map((x) => (
                <button key={x} className={cx('swatch', c.color === x && 'on')} style={{ background: x }} onClick={() => cmd(cid, { t: 'comm.update', cid, color: x })} aria-label={x} />
              ))}
            </div>
          </div>
          <div className="info-card">
            <div className="ic-row">
              <span>Oluşturulma</span>
              <b>{fmtDay(c.createdAt)}</b>
            </div>
            <div className="ic-row">
              <span>Üye sayısı</span>
              <b>{c.members.length}</b>
            </div>
            <div className="ic-row">
              <span>Kanal sayısı</span>
              <b>{c.channels.length}</b>
            </div>
          </div>
        </>
      )}
      {cur === 'roles' && (
        <>
          <h1>Roller</h1>
          <p className="note">Roller üyelere renk ve yetki verir. @herkes rolü tüm üyeler için geçerlidir.</p>
          <div className="roles-layout">
            <div className="role-list">
              <button className="btn primary sm" onClick={() => cmd(cid, { t: 'role.create', cid, name: 'yeni rol', color: '', perms: 0, hoist: false })}>
                <Plus size={14} /> Rol oluştur
              </button>
              {roles.map((r) => (
                <button key={r.id} className={cx('role-item', roleId === r.id && 'on')} onClick={() => setRoleId(r.id)}>
                  <i style={{ background: r.color || 'var(--text-3)' }} />
                  <span>{r.name}</span>
                  <small>{r.id === cid ? c.members.length : c.members.filter((m) => m.roles.includes(r.id)).length}</small>
                </button>
              ))}
            </div>
            <div className="role-detail">{role ? <RoleEditor key={role.id} cid={cid} role={role} /> : <div className="empty-note">Düzenlemek için soldan bir rol seç.</div>}</div>
          </div>
        </>
      )}
      {cur === 'members' && (
        <>
          <h1>Üyeler ({c.members.length})</h1>
          <input className="filter-input" placeholder="Üye ara" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="list-card">
            {c.members
              .filter((m) => displayName(c, m.userId, users).toLocaleLowerCase('tr').includes(filter.toLocaleLowerCase('tr')))
              .map((m) => (
                <div key={m.userId} className="lc-row">
                  <Avatar user={users[m.userId] || c.users[m.userId]} size={32} status={m.userId === me ? 'online' : presence[m.userId] || 'offline'} />
                  <div className="lc-text">
                    <b>
                      {displayName(c, m.userId, users)} {c.ownerId === m.userId && <span className="owner-crown">♛</span>}
                    </b>
                    <span>Katıldı: {fmtDay(m.joinedAt)}</span>
                  </div>
                  <div className="role-chips">
                    {c.roles
                      .filter((r) => m.roles.includes(r.id))
                      .map((r) => (
                        <span key={r.id} className="role-chip">
                          <i style={{ background: r.color || 'var(--text-3)' }} />
                          {r.name}
                          {can(c, me, Perm.MANAGE_ROLES) && (
                            <button onClick={() => cmd(cid, { t: 'member.update', cid, userId: m.userId, roles: m.roles.filter((x) => x !== r.id) })} aria-label="Rolü kaldır">
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      ))}
                    {can(c, me, Perm.MANAGE_ROLES) && (
                      <select
                        className="role-add"
                        value=""
                        onChange={(e) => e.target.value && cmd(cid, { t: 'member.update', cid, userId: m.userId, roles: [...m.roles, e.target.value] })}
                      >
                        <option value="">+ Rol</option>
                        {c.roles
                          .filter((r) => r.id !== cid && !m.roles.includes(r.id))
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                  {can(c, me, Perm.KICK) && m.userId !== me && m.userId !== c.ownerId && (
                    <button
                      className="btn ghost sm danger-text"
                      onClick={() => confirmDialog(`${displayName(c, m.userId, users)} atılsın mı?`, 'Davetle tekrar katılabilir.', () => cmd(cid, { t: 'member.kick', cid, userId: m.userId }), 'At')}
                    >
                      At
                    </button>
                  )}
                </div>
              ))}
          </div>
        </>
      )}
      {cur === 'invites' && (
        <>
          <h1>Davetler</h1>
          <div className="copy-row">
            <input readOnly value={makeInvite(cid)} onFocus={(e) => e.target.select()} />
            <button className="btn primary" onClick={() => (copyText(makeInvite(cid)), toast('Davet kodu kopyalandı', 'ok'))}>
              Kopyala
            </button>
          </div>
          {manage && (
            <button className="btn ghost sm" onClick={() => (cmd(cid, { t: 'comm.invite.reset', cid }), toast('Davet kodu yenilendi; eski kodlar artık çalışmaz.', 'ok'))}>
              <RefreshCw size={14} /> Kodu yenile
            </button>
          )}
        </>
      )}
      {cur === 'delete' && (
        <>
          <h1>Topluluğu sil</h1>
          <p className="note">"{c.name}" topluluğu, tüm kanalları ve mesajlarıyla birlikte kalıcı olarak silinir. Üyeler de topluluğa erişimini kaybeder.</p>
          <button className="btn danger" onClick={() => confirmDialog(`"${c.name}" silinsin mi?`, 'Bu işlem geri alınamaz.', () => (close(), deleteCommunity(cid)), 'Kalıcı olarak sil')}>
            Topluluğu sil
          </button>
        </>
      )}
    </Shell>
  );
}

export type { SettingsT };
