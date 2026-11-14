// Ayarlar > Etkinlik: neyin paylaşılacağı, oyun listesi, son etkinlik
import React, { useState } from 'react';
import { Gamepad2, Plus, Trash2, Eye, EyeOff, RefreshCw, LoaderCircle, Link2, Copy, Check } from 'lucide-react';
import { useStore, updateSettings, openModal } from '../lib/store';
import { useActs, useActsOf, runningApps, clearRecent, type SpotifyStatus } from '../lib/activity';
import { focusProfileSection } from './profile/ProfileEditor';
import { LiveActivityCard, RecentList, ServiceIcon, SERVICES, BrandLogo } from './profile/Activity';
import { Toggle, STATUS_LABEL } from './Common';
import { Row } from './Settings';
import { cx } from '../lib/util';

type AppRow = { exe: string; title: string; path?: string; icon?: string; game?: string };

export function ActivityTab() {
  const s = useStore((x) => x.settings);
  const me = useStore((x) => x.me);
  const detected = useActs((x) => x.detected);
  const mine = useActsOf(me.id);
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<{ exe: string; name: string } | null>(null);
  const streamAccs = (me.extra?.accounts || []).filter((a) => SERVICES[a.svc].live);
  const game = detected?.game;
  const loadApps = async () => {
    setLoading(true);
    try {
      setApps(await runningApps());
    } finally {
      setLoading(false);
    }
  };
  const addGame = () => {
    if (!pick || !pick.name.trim()) return;
    const list = s.customGames.filter((g) => g.exe !== pick.exe);
    updateSettings({ customGames: [...list, { exe: pick.exe, name: pick.name.trim().slice(0, 64) }] });
    setPick(null);
    setApps(null);
  };
  const toggleHidden = (name: string) =>
    updateSettings({ hiddenGames: s.hiddenGames.includes(name) ? s.hiddenGames.filter((g) => g !== name) : [...s.hiddenGames, name] });
  const goAccounts = () => (focusProfileSection('accounts'), openModal({ type: 'settings', tab: 'profile' }));

  return (
    <div className="act-set">
      <h1>Etkinlik</h1>
      <p className="lead">
        Ne oynadığın, ne dinlediğin ve yayında olduğun profilinde, üye listesinde ve özel mesajlarda görünür. Hiçbir hesap bağlaman gerekmez; istediğini buradan
        gizleyebilirsin.
      </p>

      <div className="act-now">
        <div className="act-now-head">
          <b>Şu an herkese görünen</b>
          {me.status === 'invisible' && <span className="pill">Görünmezsin: kimse görmüyor</span>}
        </div>
        {mine.length && me.status !== 'invisible' ? (
          <div className="act-list">
            {mine.map((a, i) => (
              <LiveActivityCard key={i} a={a} />
            ))}
          </div>
        ) : (
          <div className="act-empty">
            <Gamepad2 size={22} />
            <span>
              {!s.actShare
                ? 'Etkinlik paylaşımı kapalı.'
                : detected && !detected.supported
                  ? 'Otomatik algılama yalnızca Windows\'ta çalışır.'
                  : game && s.hiddenGames.includes(game.name)
                    ? `${game.name} açık ama gizlediğin için görünmüyor.`
                    : 'Şu an algılanan bir oyun, müzik ya da yayın yok.'}
            </span>
          </div>
        )}
      </div>

      <MusicDiag />

      <SpotifyAccount />

      <Row title="Etkinliğimi paylaş" sub="Kapatırsan hiçbir etkinliğin görünmez ve bilgisayarındaki algılama durur.">
        <Toggle value={s.actShare} onChange={(v) => updateSettings({ actShare: v })} />
      </Row>
      <div className={cx('act-sub', !s.actShare && 'off')}>
        <Row title="Oynadığım oyunu göster" sub="Açık oyunlar kendiliğinden tanınır. League of Legends'ta maçtayken şampiyon ve oyun kipi de görünür.">
          <Toggle value={s.actGames} onChange={(v) => updateSettings({ actGames: v })} />
        </Row>
        <Row title="Dinlediğim müziği göster" sub="Spotify ve diğer müzik çalarlarda çalan şarkı, sanatçı ve kapak. Spotify hesabı bağlaman gerekmez.">
          <Toggle value={s.actMusic} onChange={(v) => updateSettings({ actMusic: v })} />
        </Row>
        <Row title="Tarayıcıda çalanları da göster" sub="YouTube gibi sitelerde çalan müzik ve videolar. Varsayılan olarak kapalı.">
          <Toggle value={s.actBrowser} onChange={(v) => updateSettings({ actBrowser: v })} />
        </Row>
        <Row
          title="Yayındayken göster"
          sub={
            streamAccs.length ? (
              <>Bağlı kanalların: {streamAccs.map((a) => `${SERVICES[a.svc].label} (${a.name})`).join(', ')}. Yayın açınca profilinde "Şu anda yayında" çıkar.</>
            ) : (
              <>
                Kick ya da Twitch kanalını profiline bağla, yayın açtığında herkes görsün.{' '}
                <button className="link-btn" onClick={goAccounts}>
                  Hesap bağla
                </button>
              </>
            )
          }
        >
          <Toggle value={s.actStream} onChange={(v) => updateSettings({ actStream: v })} />
        </Row>
        <Row title="Son etkinliğimi profilimde göster" sub="Profilindeki Etkinlik sekmesinde son 30 günde oynadıkların ve dinlediklerin listelenir.">
          <Toggle value={s.actRecent} onChange={(v) => updateSettings({ actRecent: v })} />
        </Row>
      </div>

      <h3>Oyunlar</h3>
      {game && (
        <div className="game-row now">
          {game.icon ? <img src={game.icon} alt="" /> : <span className="game-ic"><Gamepad2 size={18} /></span>}
          <div>
            <b>{game.name}</b>
            <span>Şu an açık{s.hiddenGames.includes(game.name) ? ' · gizli' : ''}</span>
          </div>
          <button className="btn ghost sm" onClick={() => toggleHidden(game.name)}>
            {s.hiddenGames.includes(game.name) ? (
              <>
                <Eye size={14} /> Göster
              </>
            ) : (
              <>
                <EyeOff size={14} /> Bu oyunu gizle
              </>
            )}
          </button>
        </div>
      )}
      {s.customGames.map((g) => (
        <div key={g.exe} className="game-row">
          <span className="game-ic">
            <Gamepad2 size={18} />
          </span>
          <div>
            <b>{g.name}</b>
            <span>Elle eklendi · {g.exe}.exe</span>
          </div>
          <button className="icon-btn sm" title="Kaldır" aria-label="Kaldır" onClick={() => updateSettings({ customGames: s.customGames.filter((x) => x.exe !== g.exe) })}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {s.hiddenGames
        .filter((n) => n !== game?.name)
        .map((n) => (
          <div key={n} className="game-row muted">
            <span className="game-ic">
              <EyeOff size={16} />
            </span>
            <div>
              <b>{n}</b>
              <span>Gizli: oynarken görünmez</span>
            </div>
            <button className="btn ghost sm" onClick={() => toggleHidden(n)}>
              <Eye size={14} /> Göster
            </button>
          </div>
        ))}

      {pick ? (
        <div className="game-add">
          <span>Görünecek ad</span>
          <input autoFocus value={pick.name} maxLength={64} onChange={(e) => setPick({ ...pick, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addGame()} />
          <button className="btn primary sm" onClick={addGame}>
            Ekle
          </button>
          <button className="btn ghost sm" onClick={() => setPick(null)}>
            Vazgeç
          </button>
        </div>
      ) : apps ? (
        <div className="app-pick">
          <div className="app-pick-head">
            <b>Hangi uygulama?</b>
            <button className="icon-btn sm" title="Yenile" onClick={loadApps}>
              <RefreshCw size={15} />
            </button>
          </div>
          {apps.length === 0 && <p className="note">Açık bir uygulama bulunamadı. Oyunu açıp yenile.</p>}
          {apps.map((a) => (
            <button key={a.exe} className="app-row" onClick={() => setPick({ exe: a.exe, name: a.game || a.title || a.exe })}>
              {a.icon ? <img src={a.icon} alt="" /> : <span className="game-ic"><Gamepad2 size={16} /></span>}
              <span className="app-t">
                <b>{a.title || a.exe}</b>
                <em>{a.exe}.exe{a.game ? ' · zaten tanınıyor' : ''}</em>
              </span>
              <Plus size={15} />
            </button>
          ))}
        </div>
      ) : (
        <button className="btn ghost sm" onClick={loadApps} disabled={loading}>
          {loading ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />} Listede olmayan bir oyun ekle
        </button>
      )}

      <h3>Son etkinlik</h3>
      <RecentList profile={me.extra} empty={<p className="note">Henüz kaydedilmiş bir etkinlik yok. Bir oyun oynadığında ya da müzik dinlediğinde burada görünür.</p>} />
      {!!me.extra?.recent?.length && (
        <button className="btn ghost sm danger-text" onClick={clearRecent}>
          <Trash2 size={14} /> Son etkinliği temizle
        </button>
      )}

      <h3>Bağlı hesaplar</h3>
      <div className="acc-mini">
        {(me.extra?.accounts || []).map((a) => (
          <span key={a.svc + a.name} className="acc-chip">
            <ServiceIcon svc={a.svc} size={20} /> {a.name}
          </span>
        ))}
        <button className="btn ghost sm" onClick={goAccounts}>
          <Link2 size={14} /> Hesapları düzenle
        </button>
      </div>
      <p className="note">
        "{STATUS_LABEL.invisible}" durumundayken etkinliğin kimseye görünmez. Algılama tamamen bu bilgisayarda yapılır; pencere başlıkların ya da başka bilgiler
        gönderilmez.
      </p>
    </div>
  );
}

/** Müzik algılamanın durumu: neden görünmediğini anlatır */
function MusicDiag() {
  const s = useStore((x) => x.settings);
  const d = useActs((x) => x.detected);
  if (!d || !d.supported || !s.actShare) return null;
  const m = d.media;
  let text: string;
  let warn = false;
  if (!s.actMusic) (text = 'Müzik paylaşımı kapalı.'), (warn = true);
  else if (m && m.src === 'browser' && !s.actBrowser)
    (text = `Tarayıcıda (${m.appName}) çalan bir şey var: "${m.title}". Spotify'ı tarayıcıdan dinliyorsan aşağıdan "Tarayıcıda çalanları da göster"i aç ya da Spotify masaüstü uygulamasını kullan.`), (warn = true);
  else if (m && !m.playing) text = `${m.appName} açık ama şu an duraklatılmış.`;
  else if (m) text = `Algılanan müzik: ${m.appName} · ${m.title}${m.artist ? ' — ' + m.artist : ''}`;
  else if (d.mediaOk === false)
    (text = "Windows'un medya denetimlerine ulaşılamadı. Spotify masaüstü uygulaması yine de pencere başlığından tanınır; başka çalarlar görünmeyebilir."), (warn = true);
  else text = 'Şu an çalan bir müzik algılanmadı. Spotify masaüstü uygulamasında şarkı çalınca burada görünür.';
  return <p className={cx('act-diag', warn && 'warn')}>{text}</p>;
}

/** Spotify hesabından okuma: hangi oynatıcıdan dinlenirse dinlensin (Retrofy, telefon, web) şarkı görünür */
function SpotifyAccount() {
  const live = useActs((x) => x.detected?.spotify);
  const from = useActs((x) => x.detected?.mediaFrom);
  const [st, setSt] = useState<SpotifyStatus | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  React.useEffect(() => {
    window.kovan.spotify.status().then(setSt);
  }, []);
  const cur = live || st;
  if (!cur) return null;
  const needId = !cur.defaultClientId;
  const idVal = id ?? cur.clientId;
  const connect = async () => {
    setBusy(true);
    try {
      setSt(await window.kovan.spotify.connect(needId ? idVal : undefined));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => setSt(await window.kovan.spotify.disconnect());
  const copy = () => (navigator.clipboard.writeText(cur.redirect), setCopied(true), setTimeout(() => setCopied(false), 1500));
  return (
    <div className="spotify-acc">
      <div className="spotify-acc-head">
        <BrandLogo k="spotify" size={22} />
        <div>
          <b>Spotify hesabından oku</b>
          <span>
            {cur.connected
              ? `Bağlı${cur.user ? ': ' + cur.user : ''}. Hangi uygulamadan dinlersen dinle (Retrofy, telefon, web) çalan şarkı kapağıyla görünür.${from === 'account' ? ' Şu anki şarkı hesaptan okunuyor.' : ''}`
              : 'Spotify uygulaması dışında (Retrofy, telefon, web çalar) dinlediklerin de görünsün diye çalan şarkıyı doğrudan hesabından okur.'}
          </span>
        </div>
        {cur.connected ? (
          <button className="btn sm ghost" onClick={disconnect}>
            Bağlantıyı kes
          </button>
        ) : (
          <button className="btn sm primary" disabled={busy || (needId && !/^[0-9a-f]{32}$/i.test(idVal.trim()))} onClick={connect}>
            {busy ? <LoaderCircle size={14} className="spin" /> : null} {busy ? 'Tarayıcıda izin bekleniyor' : 'Spotify ile bağlan'}
          </button>
        )}
      </div>
      {!cur.connected && needId && (
        <div className="spotify-acc-id">
          <label>
            Client ID
            <input value={idVal} onChange={(e) => setId(e.target.value.trim())} placeholder="Spotify geliştirici panelindeki 32 karakterlik Client ID" spellCheck={false} />
          </label>
          <p>
            Spotify geliştirici panelinde uygulamanın Redirect URI kısmına şunu ekle:{' '}
            <code>{cur.redirect}</code>{' '}
            <button className="icon-btn" onClick={copy} title="Kopyala">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            . Gizli anahtar (Client secret) gerekmez, hiçbir yere yazma.
          </p>
        </div>
      )}
      {cur.error && <p className="act-diag warn">{cur.error}</p>}
    </div>
  );
}
