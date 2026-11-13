// Profil: anlık etkinlik kartları, son etkinlik listesi, bağlı hesaplar ve kişiye özel not.
import React, { memo, useEffect, useState } from 'react';
import {
  Gamepad2, Headphones, Radio, Tv, Swords, Joystick, Trophy, Code, AtSign, Camera, Music2, Clapperboard, MessageSquareText, Shield,
  ExternalLink, Flame, Zap, Copy, NotebookPen, Users, X, MonitorUp, Volume2,
} from 'lucide-react';
import type { AccountService, LinkedAccount, LiveActivity, ProfileExtra, RecentActivity } from '../../../shared/profile';
import { useActsOf, useActs, riotUrl, openInSpotify, startAlong, stopAlong } from '../../lib/activity';
import { useStore } from '../../lib/store';
import { BRANDS, GAME_TILE, SERVICE_BRAND, activityBrand, brandBg } from '../../lib/brands';
import { cx, copyText } from '../../lib/util';
import { toast } from '../../lib/store';

// ---------------------------------------------------------------------------
// Bağlı hesaplar: hizmet bilgileri (marka logosu kullanılmaz; renk + genel simge)
export interface ServiceMeta {
  label: string;
  color: string;
  icon: React.ComponentType<{ size?: number }>;
  placeholder: string;
  hint?: string;
  url?: (a: LinkedAccount) => string | undefined;
  /** canlı yayın denetlenebilir */
  live?: boolean;
}

const handle = (s: string) => s.trim().replace(/^@+/, '');
export const SERVICES: Record<AccountService, ServiceMeta> = {
  riot: {
    label: 'Riot Games',
    color: '#d13639',
    icon: Swords,
    placeholder: 'Ad#TR1',
    hint: 'Riot kimliğin (Ad#Etiket). Profilinde xanaphian.com sayfana bağlanır.',
    url: (a) => (a.name.includes('#') ? riotUrl(a.name, a.region) : undefined),
  },
  steam: {
    label: 'Steam',
    color: '#2a475e',
    icon: Gamepad2,
    placeholder: 'https://steamcommunity.com/id/…',
    url: (a) => (/^\d{17}$/.test(a.name) ? 'https://steamcommunity.com/profiles/' + a.name : 'https://steamcommunity.com/id/' + encodeURIComponent(handle(a.name))),
  },
  epic: { label: 'Epic Games', color: '#3a3a3a', icon: Joystick, placeholder: 'https://store.epicgames.com/u/…', url: (a) => 'https://store.epicgames.com/u/' + encodeURIComponent(a.name) },
  battlenet: { label: 'Battle.net', color: '#148eff', icon: Shield, placeholder: 'Ad#1234', hint: "Battle.net'in herkese açık profil sayfası olmadığı için BattleTag'ini (Ad#1234) yaz." },
  xbox: { label: 'Xbox', color: '#107c10', icon: Gamepad2, placeholder: 'https://www.xbox.com/play/user/…', url: (a) => 'https://www.xbox.com/play/user/' + encodeURIComponent(a.name) },
  psn: { label: 'PlayStation', color: '#0070d1', icon: Trophy, placeholder: 'https://profile.playstation.com/…', url: (a) => 'https://profile.playstation.com/' + encodeURIComponent(a.name) },
  kick: {
    label: 'Kick',
    color: '#3bb30f',
    icon: Radio,
    placeholder: 'https://kick.com/…',
    hint: 'Yayın açtığında profilinde "Şu anda yayında" görünür.',
    url: (a) => 'https://kick.com/' + encodeURIComponent(handle(a.name).toLowerCase()),
    live: true,
  },
  twitch: {
    label: 'Twitch',
    color: '#9146ff',
    icon: Tv,
    placeholder: 'https://www.twitch.tv/…',
    hint: 'Yayın açtığında profilinde "Şu anda yayında" görünür.',
    url: (a) => 'https://www.twitch.tv/' + encodeURIComponent(handle(a.name).toLowerCase()),
    live: true,
  },
  youtube: {
    label: 'YouTube',
    color: '#e62117',
    icon: Clapperboard,
    placeholder: 'https://www.youtube.com/@…',
    url: (a) => (/^UC[\w-]{22}$/.test(a.name) ? 'https://www.youtube.com/channel/' + a.name : 'https://www.youtube.com/@' + encodeURIComponent(handle(a.name))),
  },
  spotify: {
    label: 'Spotify',
    color: '#1db954',
    icon: Music2,
    placeholder: 'https://open.spotify.com/user/…',
    hint: 'Dinlediğin şarkı Spotify bağlamadan da görünür; bu yalnızca profil bağlantısıdır.',
    url: (a) => 'https://open.spotify.com/user/' + encodeURIComponent(handle(a.name)),
  },
  github: { label: 'GitHub', color: '#24292f', icon: Code, placeholder: 'https://github.com/…', url: (a) => 'https://github.com/' + encodeURIComponent(handle(a.name)) },
  x: { label: 'X', color: '#111111', icon: AtSign, placeholder: 'https://x.com/…', url: (a) => 'https://x.com/' + encodeURIComponent(handle(a.name)) },
  instagram: { label: 'Instagram', color: '#d62976', icon: Camera, placeholder: 'https://www.instagram.com/…', url: (a) => 'https://www.instagram.com/' + encodeURIComponent(handle(a.name)) },
  tiktok: { label: 'TikTok', color: '#111111', icon: Music2, placeholder: 'https://www.tiktok.com/@…', url: (a) => 'https://www.tiktok.com/@' + encodeURIComponent(handle(a.name)) },
  reddit: { label: 'Reddit', color: '#ff4500', icon: MessageSquareText, placeholder: 'https://www.reddit.com/user/…', url: (a) => 'https://www.reddit.com/user/' + encodeURIComponent(handle(a.name).replace(/^u\//, '')) },
};

/** Hesap bağlarken istenen profil bağlantısı: adres kalıbı ve içinden çıkan kimlik. Riot ve Battle.net kimlikle bağlanır. */
const LINK_RULES: Partial<Record<AccountService, { prefix: string; host: RegExp; id: (parts: string[], u: URL) => string | null }>> = {
  steam: { prefix: 'https://steamcommunity.com/id/', host: /^steamcommunity\.com$/, id: (p) => ((p[0] === 'id' || (p[0] === 'profiles' && /^\d{17}$/.test(p[1] || ''))) && p[1] ? p[1] : null) },
  epic: { prefix: 'https://store.epicgames.com/u/', host: /^store\.epicgames\.com$/, id: (p) => { const i = p.indexOf('u'); return i >= 0 && p[i + 1] ? p[i + 1] : null; } },
  xbox: { prefix: 'https://www.xbox.com/play/user/', host: /^(www\.)?xbox\.com$/, id: (p) => { const i = p.indexOf('user'); return i > 0 && p[i - 1] === 'play' && p[i + 1] ? p[i + 1] : null; } },
  psn: { prefix: 'https://profile.playstation.com/', host: /^profile\.playstation\.com$/, id: (p) => p[p.length - 1] || null },
  kick: { prefix: 'https://kick.com/', host: /^(www\.)?kick\.com$/, id: (p) => p[0] || null },
  twitch: { prefix: 'https://www.twitch.tv/', host: /^(www\.|m\.)?twitch\.tv$/, id: (p) => p[0] || null },
  youtube: { prefix: 'https://www.youtube.com/@', host: /^(www\.|m\.)?youtube\.com$/, id: (p) => (p[0]?.startsWith('@') && p[0].length > 1 ? p[0].slice(1) : p[0] === 'channel' && /^UC[\w-]{22}$/.test(p[1] || '') ? p[1] : null) },
  spotify: { prefix: 'https://open.spotify.com/user/', host: /^open\.spotify\.com$/, id: (p) => { const i = p.indexOf('user'); return i >= 0 && i <= 1 && p[i + 1] ? p[i + 1] : null; } },
  github: { prefix: 'https://github.com/', host: /^(www\.)?github\.com$/, id: (p) => (p.length === 1 ? p[0] : null) },
  x: { prefix: 'https://x.com/', host: /^(www\.|mobile\.)?(x|twitter)\.com$/, id: (p) => p[0] || null },
  instagram: { prefix: 'https://www.instagram.com/', host: /^(www\.)?instagram\.com$/, id: (p) => p[0] || null },
  tiktok: { prefix: 'https://www.tiktok.com/@', host: /^(www\.|m\.)?tiktok\.com$/, id: (p) => (p[0]?.startsWith('@') && p[0].length > 1 ? p[0].slice(1) : null) },
  reddit: { prefix: 'https://www.reddit.com/user/', host: /^(www\.|old\.|new\.)?reddit\.com$/, id: (p) => ((p[0] === 'user' || p[0] === 'u') && p[1] ? p[1] : null) },
};

/** Bu hizmet profil bağlantısıyla mı bağlanıyor (Riot ve Battle.net hariç hepsi) */
export const needsLink = (svc: AccountService) => !!LINK_RULES[svc];
export const linkExample = (svc: AccountService) => LINK_RULES[svc]?.prefix || '';

/** Girilen değeri denetler: bağlantı isteyen hizmette adres kalıbı tutmazsa anlaşılır bir hata döner */
export function accountFromInput(svc: AccountService, raw: string): { name?: string; err?: string } {
  const s = raw.trim();
  const rule = LINK_RULES[svc];
  if (!rule) return s ? { name: s } : { err: 'Boş bırakma.' };
  const label = SERVICES[svc].label;
  const bad = { err: `${label} profil bağlantısı ${rule.prefix} ile başlamalı.` };
  if (!/^https?:\/\//i.test(s)) return bad;
  try {
    const u = new URL(s);
    if (!rule.host.test(u.hostname.toLowerCase())) return bad;
    const parts = u.pathname.split('/').filter(Boolean).map((x) => decodeURIComponent(x));
    const id = rule.id(parts, u);
    if (!id || id.length > 48 || /[/?#]/.test(id) || (svc !== 'xbox' && /\s/.test(id))) return { err: `Bağlantıda ${label} kullanıcısı bulunamadı. Örnek: ${rule.prefix}kullanıcı` };
    return { name: id };
  } catch {
    return bad;
  }
}

/** Profilde görünen ad (Spotify'ın rastgele kimlikleri yerine "Spotify profili") */
export function accountLabel(a: LinkedAccount): string {
  if (a.svc === 'spotify' && /^[a-z0-9]{22,}$/i.test(a.name) && /\d/.test(a.name)) return 'Spotify profili';
  return a.name;
}

/** Hizmet / oyun logosu (Simple Icons). plain: zeminsiz, marka renginde */
export function BrandLogo({ k, size = 30, plain, className }: { k: string; size?: number; plain?: boolean; className?: string }) {
  const b = BRANDS[k];
  if (!b) return null;
  const tile = GAME_TILE[k];
  if (tile) {
    // oyunlar her yerde uygulama simgesi gibi kutu içinde görünür
    const box = plain ? Math.max(size + 2, 14) : size;
    const g = Math.round(box * (tile.scale || 0.6));
    return (
      <span className={cx('acc-ic brand-logo game-tile', tile.round && 'round', className)} style={{ background: tile.bg, width: box, height: box }} title={b.title}>
        <svg viewBox="0 0 24 24" width={g} height={g} fill={tile.fg} aria-hidden>
          <path d={b.path} />
        </svg>
      </span>
    );
  }
  const inner = Math.round(size * (plain ? 1 : 0.56));
  const svg = (
    <svg viewBox="0 0 24 24" width={inner} height={inner} fill={plain ? (brandBg(b.hex) === b.hex ? b.hex : 'currentColor') : '#fff'} aria-hidden>
      <path d={b.path} />
    </svg>
  );
  if (plain) return <span className={cx('brand-logo plain', className)} title={b.title}>{svg}</span>;
  return (
    <span className={cx('acc-ic brand-logo', className)} style={{ background: brandBg(b.hex), width: size, height: size }} title={b.title}>
      {svg}
    </span>
  );
}

export function ServiceIcon({ svc, size = 30 }: { svc: AccountService; size?: number }) {
  const m = SERVICES[svc];
  const I = m.icon;
  if (SERVICE_BRAND[svc]) return <BrandLogo k={SERVICE_BRAND[svc]} size={size} />;
  return (
    <span className="acc-ic" style={{ background: m.color, width: size, height: size }}>
      <I size={Math.round(size * 0.55)} />
    </span>
  );
}

export function AccountList({ profile, liveSvcs, chips }: { profile?: ProfileExtra; liveSvcs?: string[]; chips?: boolean }) {
  const list = profile?.accounts;
  if (!list?.length) return null;
  if (chips)
    return (
      <div className="acc-chips">
        {list.map((a) => {
          const url = SERVICES[a.svc].url?.(a);
          return (
            <button
              key={a.svc + a.name}
              className={cx('acc-chip', liveSvcs?.includes(a.svc) && 'live')}
              title={`${SERVICES[a.svc].label}: ${accountLabel(a)}`}
              onClick={() => (url ? window.kovan.openExternal(url) : (copyText(a.name), toast('Kopyalandı', 'ok')))}
            >
              <ServiceIcon svc={a.svc} size={20} />
              <span>{accountLabel(a)}</span>
            </button>
          );
        })}
      </div>
    );
  return (
    <div className="acc-list">
      {list.map((a) => {
        const m = SERVICES[a.svc];
        const url = m.url?.(a);
        const live = liveSvcs?.includes(a.svc);
        return (
          <div key={a.svc + a.name} className="acc-row">
            <ServiceIcon svc={a.svc} />
            <div className="acc-text">
              <b>{accountLabel(a)}</b>
              <span>
                {m.label}
                {a.svc === 'riot' && a.region ? ' · ' + a.region.toUpperCase() : ''}
                {live && <em className="acc-live">YAYINDA</em>}
              </span>
            </div>
            {url ? (
              <button className="icon-btn sm" title="Profili aç" aria-label="Profili aç" onClick={() => window.kovan.openExternal(url)}>
                <ExternalLink size={15} />
              </button>
            ) : (
              <button className="icon-btn sm" title="Kopyala" aria-label="Kopyala" onClick={() => (copyText(a.name), toast('Kopyalandı', 'ok'))}>
                <Copy size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anlık etkinlik

function useNow(on: boolean, ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [on, ms]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function fmtDur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const SRC_VERB: Record<string, string> = {
  spotify: "Spotify'da dinliyor",
  kick: "Kick'te yayında",
  twitch: "Twitch'te yayında",
};
export function activityHeading(a: LiveActivity) {
  if (a.kind === 'streaming') return SRC_VERB[a.src || ''] || 'Yayında';
  if (a.kind === 'listening') return SRC_VERB[a.src || ''] || `${a.name} ile dinliyor`;
  if (a.kind === 'watching') return 'İzliyor';
  return 'Oynuyor';
}

const KIND_ICON = { playing: Gamepad2, listening: Headphones, streaming: Radio, watching: Tv } as const;

function MusicButtons({ a, uid }: { a: LiveActivity; uid?: string }) {
  const me = useStore((s) => s.me.id);
  const along = useActs((s) => s.along);
  const following = !!uid && along === uid;
  return (
    <div className="act-btns">
      <button className="btn sm ghost" onClick={() => openInSpotify(a)} title="Şarkıyı kendi Spotify'ında aç">
        <Music2 size={14} /> Spotify'da aç
      </button>
      {uid && uid !== me && (
        <button className={cx('btn sm', following ? 'ghost on' : 'primary')} onClick={() => (following ? stopAlong() : startAlong(uid))}>
          <Headphones size={14} /> {following ? 'Beraber dinlemeyi bırak' : 'Beraber dinle'}
        </button>
      )}
    </div>
  );
}

export const LiveActivityCard = memo(function LiveActivityCard({ a, compact, uid }: { a: LiveActivity; compact?: boolean; uid?: string }) {
  const timed = !!a.start;
  const now = useNow(timed);
  const Icon = KIND_ICON[a.kind];
  const hasEnd = a.kind === 'listening' && a.start && a.end && a.end > a.start;
  const pct = hasEnd ? Math.min(100, Math.max(0, ((now - a.start!) / (a.end! - a.start!)) * 100)) : 0;
  const open = a.url ? () => window.kovan.openExternal(a.url!) : undefined;
  const title = a.kind === 'listening' ? a.details || a.name : a.kind === 'streaming' ? a.details || a.name : a.name;
  const sub1 = a.kind === 'listening' ? a.state : a.kind === 'streaming' ? a.state : a.details;
  const sub2 = a.kind === 'playing' ? a.state : a.kind === 'streaming' && a.viewers !== undefined ? `${a.viewers.toLocaleString('tr-TR')} izleyici` : undefined;
  const brand = activityBrand(a);
  const big = compact ? 44 : 64;
  return (
    <div className={cx('act-card', 'act-' + a.kind, a.src && 'src-' + a.src, compact && 'compact')}>
      <div className="act-head">
        {a.kind === 'streaming' && <span className="act-live-dot" />}
        {brand && (a.kind !== 'playing') && <BrandLogo k={brand} size={14} plain />}
        {activityHeading(a)}
      </div>
      <div className="act-main">
        <div className={cx('act-art', !a.art && !a.icon && 'empty', !a.art && !a.icon && brand && 'branded')}>
          {a.art ? (
            <img src={a.art} alt="" draggable={false} />
          ) : a.icon ? (
            <img className="act-icon" src={a.icon} alt="" draggable={false} />
          ) : brand ? (
            <BrandLogo k={brand} size={big} />
          ) : (
            <Icon size={compact ? 20 : 26} />
          )}
          {a.art && (a.icon ? <img className="act-badge" src={a.icon} alt="" /> : brand && <BrandLogo k={brand} size={22} className="act-badge" />)}
        </div>
        <div className="act-text">
          <b title={title}>{title}</b>
          {sub1 && <span title={sub1}>{sub1}</span>}
          {sub2 && <span title={sub2}>{sub2}</span>}
          {!hasEnd && timed && (
            <span className="act-time">
              {a.kind === 'streaming' ? 'Yayın süresi ' : a.kind === 'playing' ? '' : ''}
              {fmtDur(now - a.start!)}
              {a.kind === 'playing' ? ' geçti' : ''}
            </span>
          )}
        </div>
      </div>
      {hasEnd && !compact && (
        <div className="act-bar">
          <span>{fmtDur(now - a.start!)}</span>
          <i>
            <u style={{ width: pct + '%' }} />
          </i>
          <span>{fmtDur(a.end! - a.start!)}</span>
        </div>
      )}
      {a.kind === 'listening' && a.details && !compact && (a.src === 'spotify' || a.src === 'music') && <MusicButtons a={a} uid={uid} />}
      {open && !compact && (
        <button className={cx('btn sm act-btn', a.kind === 'streaming' ? 'primary' : 'ghost')} onClick={open}>
          {a.kind === 'streaming' ? (
            <>
              <Tv size={14} /> Yayını izle
            </>
          ) : (
            <>
              <ExternalLink size={14} /> Profili aç
            </>
          )}
        </button>
      )}
    </div>
  );
});

export function ActivityCards({ uid, compact }: { uid: string; compact?: boolean }) {
  const acts = useActsOf(uid);
  if (!acts.length) return null;
  return (
    <div className="act-list">
      {acts.map((a, i) => (
        <LiveActivityCard key={a.kind + a.name + i} a={a} compact={compact} uid={uid} />
      ))}
    </div>
  );
}

/** Üye listesi / özel mesaj satırında kısa etkinlik satırı */
export function activityShort(a: LiveActivity): string {
  if (a.kind === 'streaming') return a.details ? `Yayında: ${a.details}` : `${a.name}'te yayında`;
  if (a.kind === 'listening') return a.details ? `${a.details}${a.state ? ' · ' + a.state : ''}` : `${a.name} dinliyor`;
  if (a.kind === 'watching') return `İzliyor: ${a.name}`;
  return a.name;
}

export const ActivityLine = memo(function ActivityLine({ uid, className }: { uid: string; className?: string }) {
  const acts = useActsOf(uid);
  const a = acts[0];
  if (!a) return null;
  const Icon = KIND_ICON[a.kind];
  const brand = activityBrand(a);
  return (
    <span className={cx('act-line', 'act-' + a.kind, className)} title={activityHeading(a) + ': ' + activityShort(a)}>
      {a.icon && a.kind === 'playing' ? <img className="act-line-ic" src={a.icon} alt="" /> : brand ? <BrandLogo k={brand} size={12} plain /> : <Icon size={12} />}
      <span>{a.kind === 'playing' ? a.name : a.kind === 'streaming' ? a.details || a.name : activityShort(a)}</span>
    </span>
  );
});

/** Kullanıcının ses durumu: '' | 'voice' (sesli aramada) | 'screen' (ekranını paylaşıyor) */
// Kim seste / ekran paylaşıyor: ses durumu her değiştiğinde bir kez hesaplanır, satırlar yalnız kendi kaydına bakar
let voiceIdxOf: unknown = null;
let voiceIdx = new Map<string, 'voice' | 'screen'>();
function voiceIndex(voice: Record<string, { userId: string; screen?: unknown }[] | undefined>) {
  if (voiceIdxOf !== voice) {
    voiceIdxOf = voice;
    voiceIdx = new Map();
    for (const list of Object.values(voice)) for (const m of list || []) if (!voiceIdx.has(m.userId)) voiceIdx.set(m.userId, m.screen ? 'screen' : 'voice');
  }
  return voiceIdx;
}

export function useVoiceOf(uid: string | undefined): '' | 'voice' | 'screen' {
  return useStore((s) => (uid && voiceIndex(s.voice).get(uid)) || '');
}

/** Satırın sağındaki küçük etkinlik simgesi (oyunun kendi simgesi ya da marka logosu) */
export const ActivityBadge = memo(function ActivityBadge({ uid }: { uid: string }) {
  const a = useActsOf(uid)[0];
  const v = useVoiceOf(uid);
  const marks = (
    <>
      {v === 'screen' && (
        <span className="member-mark screen" title="Ekranını paylaşıyor">
          <MonitorUp size={13} />
        </span>
      )}
      {v === 'voice' && a && (
        <span className="member-mark voice" title="Sesli aramada">
          <Volume2 size={13} />
        </span>
      )}
    </>
  );
  if (!a) return v === 'screen' ? <span className="member-marks">{marks}</span> : null;
  const brand = activityBrand(a);
  const title = activityHeading(a) + ': ' + (a.kind === 'playing' ? a.name : activityShort(a));
  return (
    <span className="member-marks">
      {marks}
      {a.icon && a.kind === 'playing' ? (
        <img className="member-act-ic" src={a.icon} alt="" title={title} />
      ) : brand ? (
        <BrandLogo k={brand} size={20} className="member-act-ic" />
      ) : null}
    </span>
  );
});

/** Üye listesi alt satırı: etkinlik + ses durumu birleşik ("Fortnite oynuyor · ekranı açık") */
export const PresenceLine = memo(function PresenceLine({ uid, className }: { uid: string; className?: string }) {
  const a = useActsOf(uid)[0];
  const v = useVoiceOf(uid);
  if (a && v === 'screen' && a.kind === 'playing')
    return (
      <span className={cx('act-line', 'act-screen', className)} title={`${a.name} · ekranını paylaşıyor`}>
        <MonitorUp size={12} />
        <span>{a.name}</span>
      </span>
    );
  if (a) return <ActivityLine uid={uid} className={className} />;
  if (v)
    return (
      <span className={cx('act-line', 'act-voice', className)}>
        {v === 'screen' ? <MonitorUp size={12} /> : <Volume2 size={12} />}
        <span>{v === 'screen' ? 'Ekranını paylaşıyor' : 'Sesli aramada'}</span>
      </span>
    );
  return null;
});

/** Profil kartında: hangi sesli kanalda, ekranı açık mı */
export const VoiceStatus = memo(function VoiceStatus({ uid }: { uid: string }) {
  const where = useStore((s) => {
    for (const [ch, list] of Object.entries(s.voice)) {
      const m = list?.find((x) => x.userId === uid);
      if (!m) continue;
      for (const c of Object.values(s.communities)) {
        const chan = c.channels.find((x) => x.id === ch);
        if (chan) return `${c.dm ? 'Özel arama' : chan.name}\u0000${c.dm ? '' : c.name}\u0000${m.screen || ''}`;
      }
      return `Sesli kanal\u0000\u0000${m.screen || ''}`;
    }
    return '';
  });
  if (!where) return null;
  const [ch, comm, screen] = where.split('\u0000');
  return (
    <div className="voice-status">
      <span className="voice-status-ic">{screen ? <MonitorUp size={16} /> : <Volume2 size={16} />}</span>
      <div>
        <b>{screen ? 'Ekranı açık' : 'Sesli aramada'}</b>
        <small>
          {ch}
          {comm && ` · ${comm}`}
          {screen && ` · ${screen}`}
        </small>
      </div>
    </div>
  );
});

/** Yayındaki kullanıcının avatar noktası için */
export function useIsStreaming(uid: string | undefined) {
  return useActsOf(uid).some((a) => a.kind === 'streaming');
}

// ---------------------------------------------------------------------------
// Son etkinlik (son 30 gün)
function ago(ts: number) {
  const d = Date.now() - ts;
  if (d < 5 * 60_000) return 'şimdi';
  if (d < 3600_000) return `${Math.round(d / 60_000)} dk önce`;
  if (d < 86_400_000) return `${Math.round(d / 3600_000)} saat önce`;
  const days = Math.round(d / 86_400_000);
  return days === 1 ? 'dün' : `${days} gün önce`;
}
function hours(m: number) {
  if (m < 60) return `${Math.max(1, Math.round(m))} dk`;
  const h = m / 60;
  return h < 10 ? `${h.toFixed(1).replace('.', ',')} saat` : `${Math.round(h)} saat`;
}

export function RecentList({ profile, empty }: { profile?: ProfileExtra; empty?: React.ReactNode }) {
  const list = (profile?.recent || []).filter((r) => r.ts > Date.now() - 30 * 86_400_000);
  if (!list.length) return <>{empty || null}</>;
  return (
    <div className="recent-list">
      {list.map((r: RecentActivity) => {
        const Icon = KIND_ICON[r.kind];
        return (
          <div key={r.kind + r.name} className={cx('recent-row', 'act-' + r.kind)}>
            {activityBrand(r) ? (
              <BrandLogo k={activityBrand(r)!} size={44} className="recent-brand" />
            ) : (
              <span className="recent-ic">
                <Icon size={20} />
              </span>
            )}
            <div className="recent-text">
              <b>{r.name}</b>
              <div className="recent-meta">
                <span>
                  {r.kind === 'playing' ? <Gamepad2 size={13} /> : r.kind === 'listening' ? <Headphones size={13} /> : <Radio size={13} />}
                  {ago(r.ts)}
                </span>
                {r.mins ? (
                  <span>
                    <Flame size={13} />
                    {hours(r.mins)} {r.kind === 'playing' ? 'oynadı' : r.kind === 'listening' ? 'dinledi' : 'yayın'}
                  </span>
                ) : null}
                {r.streak && r.streak > 1 ? (
                  <span>
                    <Zap size={13} />
                    {r.streak} günlük seri
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kişiye özel not: yalnız bu bilgisayarda saklanır
const NKEY = 'kovan.notes';
function loadNotes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NKEY) || '{}');
  } catch {
    return {};
  }
}
export function PrivateNote({ uid }: { uid: string }) {
  const [v, setV] = useState(() => loadNotes()[uid] || '');
  const [open, setOpen] = useState(!!v);
  const save = (text: string) => {
    const n = loadNotes();
    if (text.trim()) n[uid] = text.slice(0, 400);
    else delete n[uid];
    try {
      localStorage.setItem(NKEY, JSON.stringify(n));
    } catch {
      /* dolu */
    }
  };
  if (!open)
    return (
      <button className="pc-note-add" onClick={() => setOpen(true)}>
        <NotebookPen size={15} />
        <span>Not ekle</span>
        <em>yalnızca sana görünür</em>
      </button>
    );
  return (
    <label className="pc-note">
      <span>
        <NotebookPen size={13} /> Not <em>(yalnızca sana görünür)</em>
      </span>
      <textarea
        autoFocus={!v}
        rows={2}
        maxLength={400}
        value={v}
        placeholder="Bu kişiyle ilgili hatırlatmak istediğin bir şey"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          save(v);
          if (!v.trim()) setOpen(false);
        }}
      />
    </label>
  );
}

export const MutualIcon = Users;

/** Beraber dinlerken kenar çubuğunda görünen şerit */
export function ListenAlongBar() {
  const along = useActs((s) => s.along);
  const a = useActsOf(along || undefined).find((x) => x.kind === 'listening');
  const name = useStore((s) => (along ? s.users[along]?.name : undefined));
  if (!along || !a) return null;
  return (
    <div className="along-bar">
      {a.art ? <img src={a.art} alt="" /> : <span className="along-ic"><Headphones size={16} /></span>}
      <div className="along-t">
        <em>{name || 'Arkadaşın'} ile beraber dinliyorsun</em>
        <b title={a.details}>{a.details}</b>
      </div>
      <button className="icon-btn sm" title="Bırak" aria-label="Beraber dinlemeyi bırak" onClick={stopAlong}>
        <X size={15} />
      </button>
    </div>
  );
}
