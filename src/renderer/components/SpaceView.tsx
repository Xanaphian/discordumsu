// 3D görünüm (v1.31): ayrı bir kanal değil, ses odasının avatarlı görünümü.
// Sese katılınca ses panelindeki 3D tuşuyla açılır, aynı tuşla normal görünüme dönülür.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Moon, Sun, Shirt, Keyboard, MessageSquare, Users, Store, X, Check, Volume2,
  Video, VideoOff, MonitorUp, MonitorX, Hand, Music2, Sparkles, Heart, Laugh, RotateCw, ArrowUpFromLine, Pointer, HandHeart, Footprints, Eye, Settings2, ChevronDown, ChevronUp, SendHorizontal, Tv,
} from 'lucide-react';
import { useStore, updateSettings, openModal, cmd } from '../lib/store';
import { useVoice, toggleMute, toggleDeaf, toggleCamera, stopScreen } from '../lib/voice';
import { useSpace, exitSpace, say, setBooth, pushLook, worldOf, WORLDS } from '../lib/space';
import { Avatar, Tooltip } from './Common';
import { cx, COLORS, displayName } from '../lib/util';
import { canIn, Perm, type AvatarLook, type Channel, type Community, type ID, type Room3d } from '../../shared/protocol';
import type { SpaceEngine, Prompt } from '../space/engine';

const HATS: { id: AvatarLook['hat']; label: string }[] = [
  { id: 'antenna', label: 'Anten' },
  { id: 'crown', label: 'Taç' },
  { id: 'cap', label: 'Şapka' },
  { id: 'wizard', label: 'Büyücü' },
  { id: 'halo', label: 'Hale' },
  { id: 'headphones', label: 'Kulaklık' },
  { id: 'none', label: 'Yok' },
];

/** Avatarın 2B önizlemesi (giriş ekranı ve görünüm paneli) */
function AvatarPreview({ look, size = 120 }: { look: AvatarLook; size?: number }) {
  const c = look.color;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 100 115" className="sv-preview">
      <ellipse cx="50" cy="108" rx="26" ry="5" fill="rgba(0,0,0,.25)" />
      <rect x="27" y="52" width="46" height="54" rx="23" fill={c} />
      <ellipse cx="50" cy="80" rx="16" ry="19" fill="#fff3dc" />
      <rect x="18" y="58" width="11" height="28" rx="5.5" fill={c} transform="rotate(12 23 60)" />
      <rect x="71" y="58" width="11" height="28" rx="5.5" fill={c} transform="rotate(-12 77 60)" />
      <circle cx="50" cy="38" r="21" fill="#ffe7c2" />
      <ellipse cx="43" cy="39" rx="2.6" ry="3.6" fill="#1b1410" />
      <ellipse cx="57" cy="39" rx="2.6" ry="3.6" fill="#1b1410" />
      <circle cx="37" cy="45" r="3" fill="#ff8fa3" opacity=".7" />
      <circle cx="63" cy="45" r="3" fill="#ff8fa3" opacity=".7" />
      {look.hat === 'antenna' && (
        <g stroke="#1b1410" strokeWidth="1.6">
          <line x1="44" y1="19" x2="38" y2="6" />
          <line x1="56" y1="19" x2="62" y2="6" />
          <circle cx="38" cy="6" r="4" fill="#f5a524" stroke="none" />
          <circle cx="62" cy="6" r="4" fill="#f5a524" stroke="none" />
        </g>
      )}
      {look.hat === 'crown' && <path d="M35 22 L35 9 L42 16 L50 6 L58 16 L65 9 L65 22 Z" fill="#f6c343" stroke="#c99a1e" strokeWidth="1" />}
      {look.hat === 'cap' && (
        <g>
          <path d="M30 28 A20 18 0 0 1 70 28 Z" fill={c} filter="brightness(.8)" />
          <rect x="45" y="25" width="30" height="5" rx="2.5" fill={c} />
        </g>
      )}
      {look.hat === 'wizard' && (
        <g>
          <path d="M33 22 L53 -6 L67 22 Z" fill="#5a3fb5" />
          <ellipse cx="50" cy="22" rx="24" ry="4" fill="#4a3196" />
          <circle cx="54" cy="10" r="2.6" fill="#ffd84d" />
        </g>
      )}
      {look.hat === 'halo' && <ellipse cx="50" cy="10" rx="15" ry="4" fill="none" stroke="#ffe680" strokeWidth="3" />}
      {look.hat === 'headphones' && (
        <g>
          <path d="M28 40 A22 24 0 0 1 72 40" fill="none" stroke="#2b2b33" strokeWidth="4" />
          <rect x="24" y="34" width="8" height="14" rx="3" fill="#2b2b33" />
          <rect x="68" y="34" width="8" height="14" rx="3" fill="#2b2b33" />
        </g>
      )}
    </svg>
  );
}

function LookPicker() {
  const hat = useStore((s) => s.settings.avatarHat);
  const color = useStore((s) => s.settings.avatarColor);
  const meColor = useStore((s) => s.me.color);
  const set = (p: { avatarHat?: AvatarLook['hat']; avatarColor?: string }) => {
    updateSettings(p);
    setTimeout(pushLook, 0);
  };
  const cur = color || meColor || '#f5a524';
  return (
    <div className="sv-look">
      <AvatarPreview look={{ color: cur, hat }} />
      <div className="sv-look-opts">
        <div className="sv-label">Şapka</div>
        <div className="sv-hats">
          {HATS.map((h) => (
            <button key={h.id} className={cx('sv-chip', hat === h.id && 'on')} onClick={() => set({ avatarHat: h.id })}>
              {h.label}
            </button>
          ))}
        </div>
        <div className="sv-label">Renk</div>
        <div className="sv-colors">
          {COLORS.map((c) => (
            <button key={c} className={cx('sv-swatch', cur.toLowerCase() === c.toLowerCase() && 'on')} style={{ background: c }} onClick={() => set({ avatarColor: c })} aria-label={c} />
          ))}
        </div>
      </div>
    </div>
  );
}


function Minimap({ engine }: { engine: SpaceEngine | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!engine) return;
    const id = setInterval(() => {
      const cv = ref.current;
      if (!cv) return;
      const g = cv.getContext('2d')!;
      const md = engine.mapDraw;
      const S = cv.width, k = S / 2 / (md ? md.scale : 37);
      const P = (x: number, z: number): [number, number] => [S / 2 + x * k, S / 2 + z * k];
      g.clearRect(0, 0, S, S);
      if (md) md.draw(g, P, k);
      else {
      g.fillStyle = 'rgba(30,60,30,.85)';
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(240,190,90,.55)';
      g.beginPath();
      g.arc(S / 2, S / 2, 18.5 * k, 0, Math.PI * 2);
      g.fill();
      // sahne, çeşme, gölet, ateş, standlar
      g.fillStyle = '#6b4a2b';
      g.beginPath();
      g.arc(...P(0, -14), 5.2 * k, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4fb3e8';
      g.beginPath();
      g.arc(...P(0, 2), 2.4 * k, 0, Math.PI * 2);
      g.arc(...P(-10, 12.5), 3.4 * k, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff9a2e';
      g.beginPath();
      g.arc(...P(9.5, 11), 1.2 * k, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.5)';
      for (const [x, z] of [[-15, -5], [-15.5, 1.5], [-15, 8], [15, -5], [15.5, 1.5], [15, 8]]) {
        const [px, pz] = P(x, z);
        g.fillRect(px - 3, pz - 3, 6, 6);
      }
      }
      const s = engine.snapshot();
      for (const o of s.others) {
        g.fillStyle = o.color;
        g.beginPath();
        g.arc(...P(o.x, o.z), 3.4, 0, Math.PI * 2);
        g.fill();
        if (o.speaking) {
          g.strokeStyle = '#3ddc84';
          g.lineWidth = 2;
          g.stroke();
        }
      }
      // ben: yön oku
      const [mx, mz] = P(s.me.x, s.me.z);
      g.save();
      g.translate(mx, mz);
      g.rotate(-s.me.ry + Math.PI);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(4.5, 5);
      g.lineTo(-4.5, 5);
      g.closePath();
      g.fill();
      g.restore();
    }, 150);
    return () => clearInterval(id);
  }, [engine]);
  return <canvas ref={ref} width={150} height={150} className="sv-minimap" />;
}

function BoothEditor({ i, onClose }: { i: number; onClose: () => void }) {
  const booth = useSpace((s) => s.booths[i]);
  const me = useStore((s) => s.me.id);
  const mine = booth?.owner === me;
  const [text, setText] = useState(mine ? booth.text : '');
  const save = () => {
    setBooth(i, text.trim() || 'Standım');
    onClose();
  };
  return (
    <div className="sv-panel sv-booth" onKeyDown={(e) => e.stopPropagation()}>
      <div className="sv-panel-head">
        <Store size={18} />
        <b>{mine ? 'Standını düzenle' : `Stand ${i + 1}'i kirala`}</b>
        <button className="icon-btn" onClick={onClose} aria-label="Kapat">
          <X size={16} />
        </button>
      </div>
      <p>Tabelanda herkesin göreceği bir yazı olsun: ne satıyorsun, ne konuşuyorsun, kimi arıyorsun?</p>
      <div className="field">
      <input
        autoFocus
        maxLength={60}
        placeholder="ör. Bedava sarılma 🤗"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onClose();
        }}
      />
      </div>
      <div className="sv-panel-actions">
        {mine && (
          <button
            className="btn danger"
            onClick={() => {
              setBooth(i, null);
              onClose();
            }}
          >
            Standı bırak
          </button>
        )}
        <span className="grow" />
        <button className="btn primary" onClick={save}>
          <Check size={16} /> {mine ? 'Kaydet' : 'Kirala'}
        </button>
      </div>
      <small>Her kişi aynı anda bir stand tutabilir. Odadan çıkınca stand boşalır.</small>
    </div>
  );
}

function People({ c, ch, following, onFollow }: { c: Community; ch: Channel; following: ID | null; onFollow: (sid: ID | null) => void }) {
  const roster = useSpace((s) => s.roster);
  const users = useStore((s) => s.users);
  const speaking = useVoice((s) => s.speaking);
  const voice = useStore((s) => s.voice[ch.id]) || [];
  const you = useSpace((s) => s.you);
  const list = Object.values(roster);
  const in3d = new Set(list.map((r) => r.userId));
  const flat = voice.filter((m) => !in3d.has(m.userId));
  return (
    <div className="sv-panel sv-people">
      <div className="sv-panel-head">
        <Users size={18} />
        <b>3D'de · {list.length}</b>
      </div>
      <div className="sv-people-list">
        {list.map((r) => (
          <div key={r.sid} className={cx('sv-person', speaking[r.userId] && 'speaking')}>
            <Avatar user={users[r.userId]} size={24} />
            <span>{displayName(c, r.userId, users)}</span>
            {r.sid !== you && (
              <button className={cx('sv-follow', following === r.sid && 'on')} onClick={() => onFollow(following === r.sid ? null : r.sid)}>
                {following === r.sid ? 'Bırak' : 'Takip et'}
              </button>
            )}
            <i style={{ background: r.look.color }} />
          </div>
        ))}
      </div>
      {flat.length > 0 && (
        <>
          <div className="sv-label">Yalnız seste · {flat.length}</div>
          <div className="sv-people-list">
            {flat.map((m) => (
              <div key={m.sessionId} className={cx('sv-person', speaking[m.userId] && 'speaking')}>
                <Avatar user={users[m.userId]} size={24} />
                <span>{displayName(c, m.userId, users)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ACTIONS: { e: string; key: string; label: string; Icon: typeof Hand }[] = [
  { e: 'wave', key: '1', label: 'El salla', Icon: Hand },
  { e: 'dance', key: '2', label: 'Dans', Icon: Music2 },
  { e: 'clap', key: '3', label: 'Alkış', Icon: Sparkles },
  { e: 'heart', key: '4', label: 'Kalp', Icon: Heart },
  { e: 'laugh', key: '5', label: 'Gül', Icon: Laugh },
  { e: 'spin', key: '6', label: 'Dön', Icon: RotateCw },
  { e: 'jump', key: '7', label: 'Zıpla', Icon: ArrowUpFromLine },
  { e: 'point', key: '8', label: 'İşaret et', Icon: Pointer },
  { e: 'bow', key: '9', label: 'Selam', Icon: HandHeart },
];
const QUICK = ['😂', '😮', '😍', '👍', '🔥', '🎉', '❤️', '👏'];

/** Sağ altta: son konuşmalar, hızlı tepkiler, yazı kutusu */
function ChatDock({ c, inputRef }: { c: Community; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const log = useSpace((s) => s.log);
  const users = useStore((s) => s.users);
  const [text, setText] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 2000);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();
  const recent = log.filter((l) => now - l.ts < 90_000).slice(-6);
  const send = () => {
    if (text.trim()) say(text);
    setText('');
    inputRef.current?.blur();
  };
  return (
    <div className="sv-dock">
      {recent.length > 0 && (
        <div className="sv-log">
          {recent.map((l) => (
            <div key={l.id} className={cx('sv-log-line', now - l.ts > 70_000 && 'old')}>
              <b style={{ color: users[l.uid]?.color }}>{displayName(c, l.uid, users)}</b> {l.text}
            </div>
          ))}
        </div>
      )}
      <div className="sv-dock-box">
        <div className="sv-quick">
          {QUICK.map((q) => (
            <button key={q} className="sv-q" onClick={() => say(q)} aria-label={`${q} gönder`}>
              {q}
            </button>
          ))}
        </div>
        <div className="sv-say">
          <input
            ref={inputRef}
            maxLength={200}
            placeholder="Bir şey yaz… (Enter)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') send();
              if (e.key === 'Escape') {
                setText('');
                inputRef.current?.blur();
              }
            }}
          />
          <button className="sv-send" onClick={send} aria-label="Gönder" disabled={!text.trim()}>
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Kamerası açık olanlar: üstte küçük şerit */
function CamStrip({ c, ch }: { c: Community; ch: Channel }) {
  const media = useVoice((s) => s.media);
  const myCam = useVoice((s) => s.cam);
  const members = useStore((s) => s.voice[ch.id]) || [];
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me.id);
  const cams: { key: string; uid: ID; stream: MediaStream }[] = [];
  if (myCam) cams.push({ key: 'me', uid: me, stream: myCam });
  for (const m of members) {
    const st = media[m.sessionId]?.cam;
    if (st) cams.push({ key: m.sessionId, uid: m.userId, stream: st });
  }
  if (!cams.length) return null;
  return (
    <div className="sv-cams">
      {cams.slice(0, 4).map((x) => (
        <div key={x.key} className="sv-cam">
          <video
            autoPlay
            muted
            playsInline
            ref={(el) => {
              if (el && el.srcObject !== x.stream) el.srcObject = x.stream;
            }}
          />
          <span>{displayName(c, x.uid, users)}</span>
        </div>
      ))}
    </div>
  );
}

/** Odadaki ilk ekran paylaşımı: duvardaki ekrana gider */
function useWallScreen(ch: Channel) {
  const media = useVoice((s) => s.media);
  const myScreen = useVoice((s) => s.screen);
  const members = useStore((s) => s.voice[ch.id]) || [];
  const me = useStore((s) => s.me.id);
  for (const m of members) {
    const st = media[m.sessionId]?.screen;
    if (st) return { stream: st, uid: m.userId };
  }
  if (myScreen) return { stream: myScreen, uid: me };
  return null;
}

function Room({ c, ch }: { c: Community; ch: Channel }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<SpaceEngine | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [booth, setBoothOpen] = useState<number | null>(null);
  const [panel, setPanel] = useState<'look' | 'help' | 'people' | 'settings' | null>(null);
  const [onStage, setOnStage] = useState(false);
  const [firstPerson, setFirstPerson] = useState(false);
  const [barOpen, setBarOpen] = useState(true);
  const [typing, setTyping] = useState(false);
  const [following, setFollowing] = useState<ID | null>(null);
  const roster = useSpace((s) => s.roster);
  const night = useStore((s) => s.settings.spaceNight);
  const quality = useStore((s) => s.settings.spaceQuality);
  const me = useStore((s) => s.me.id);
  const users = useStore((s) => s.users);
  const status = useSpace((s) => s.status);
  const count = useSpace((s) => Object.keys(s.roster).length);
  const inVoice = (useStore((s) => s.voice[ch.id]) || []).length;
  const v = useVoice();
  const world: Room3d = worldOf(ch);
  const canManage = canIn(c, me, ch, Perm.MANAGE_CHANNELS);
  const chatRef = useRef<HTMLInputElement>(null);
  const cRef = useRef(c);
  cRef.current = c;
  const wall = useWallScreen(ch);
  const videoEl = useMemo(() => {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    return el;
  }, []);

  // motoru tembel yükle (dünya ya da kalite değişince yeniden kur)
  useEffect(() => {
    let alive = true;
    let eng: SpaceEngine | null = null;
    setEngine(null);
    import('../space/engine')
      .then(({ SpaceEngine }) => {
        if (!alive || !hostRef.current) return;
        try {
          eng = new SpaceEngine(hostRef.current, {
            quality: useStore.getState().settings.spaceQuality,
            night: useStore.getState().settings.spaceNight,
            world,
            myUid: useStore.getState().me.id,
            nameOf: (uid: ID) => displayName(cRef.current, uid, useStore.getState().users),
            onPrompt: setPrompt,
            onBooth: (i) => setBoothOpen(i),
            onStage: setOnStage,
            onFollow: setFollowing,
          });
          setEngine(eng);
          setFirstPerson(false);
        } catch (e) {
          setFailed('3D görüntü başlatılamadı. Ekran kartı sürücülerini güncellemeyi dene.');
          console.error(e);
        }
      })
      .catch(() => setFailed('3D modülü yüklenemedi.'));
    return () => {
      alive = false;
      eng?.dispose();
    };
  }, [quality, world]);

  useEffect(() => engine?.setNight(night), [engine, night]);
  useEffect(() => engine?.refreshNames(), [engine, users, c.members]);
  useEffect(() => {
    if (engine) engine.typing = typing || booth !== null;
  }, [engine, typing, booth]);
  // duvardaki ekran
  useEffect(() => {
    if (!engine?.hasScreen) return;
    if (wall) {
      if (videoEl.srcObject !== wall.stream) {
        videoEl.srcObject = wall.stream;
        videoEl.play().catch(() => {});
      }
      engine.setScreen(videoEl);
    } else {
      videoEl.srcObject = null;
      engine.setScreen(null);
    }
  }, [engine, wall?.stream, videoEl]); // eslint-disable-line
  useEffect(() => () => void (videoEl.srcObject = null), [videoEl]);

  const toggleView = () => {
    if (!engine) return;
    engine.toggleView();
    setFirstPerson(engine.firstPerson);
  };

  // kısayollar: Enter yaz, Esc kapat, O kıyafet, V bakış, P kişiler, ? kısayollar, H çubuğu gizle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.querySelector('.modal-backdrop') || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      const k = e.key.toLowerCase();
      const flip = (p: NonNullable<typeof panel>) => setPanel((cur) => (cur === p ? null : p));
      if (e.key === 'Enter') {
        e.preventDefault();
        chatRef.current?.focus();
      } else if (e.key === 'Escape') setPanel(null);
      else if (k === 'o') flip('look');
      else if (k === 'p') flip('people');
      else if (e.key === '?') flip('help');
      else if (k === 'v') toggleView();
      else if (k === 'h') setBarOpen((x) => !x);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]); // eslint-disable-line

  const setWorld = (w: Room3d) => {
    if (w === world || !canManage) return;
    cmd(c.id, { t: 'chan.update', cid: c.id, id: ch.id, room3d: w });
  };

  return (
    <div className={cx('sv-room', `w-${world}`)}>
      <div className="sv-canvas-host" ref={hostRef} />
      {(!engine || status !== 'in') && !failed && (
        <div className="sv-loading">
          <div className="sv-hero-hex spin">
            <Box size={30} />
          </div>
          <span>{status !== 'in' ? '3D görünüme bağlanılıyor…' : 'Oda hazırlanıyor…'}</span>
        </div>
      )}
      {failed && (
        <div className="sv-loading">
          <span>{failed}</span>
          <button className="btn" onClick={() => exitSpace()}>
            Normal görünüme dön
          </button>
        </div>
      )}

      <div className="sv-top">
        <div className="sv-pill sv-where">
          <Volume2 size={16} />
          <b>{ch.name}</b>
          <span className="sv-dot" />
          <button className="sv-link" onClick={() => setPanel(panel === 'people' ? null : 'people')}>
            {count} kişi 3D'de{inVoice > count ? ` · ${inVoice - count} kişi yalnız seste` : ''}
          </button>
        </div>
        <span className="grow" />
        <div className="sv-theme">
          <label>Oda teması</label>
          <div className="sv-theme-row">
            <select value={world} disabled={!canManage} onChange={(e) => setWorld(e.target.value as Room3d)} title={canManage ? 'Odadaki herkes için değişir' : 'Yalnız odayı yönetenler değiştirebilir'}>
              {WORLDS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
            <Tooltip text={night ? 'Gündüz yap' : 'Gece yap'} side="bottom">
              <button className="sv-icon" onClick={() => updateSettings({ spaceNight: !night })} aria-label="Gece/gündüz">
                {night ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      <Minimap engine={engine} />
      <CamStrip c={c} ch={ch} />
      {wall && engine?.hasScreen && (
        <div className="sv-onair">
          <Tv size={14} /> {wall.uid === me ? 'Ekranın duvarda' : `${displayName(c, wall.uid, users)} ekranını paylaşıyor`}
        </div>
      )}

      {panel === 'look' && (
        <div className="sv-panel sv-look-panel">
          <div className="sv-panel-head">
            <Shirt size={18} />
            <b>Kıyafet</b>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
          <LookPicker />
        </div>
      )}
      {panel === 'settings' && (
        <div className="sv-panel sv-look-panel">
          <div className="sv-panel-head">
            <Settings2 size={18} />
            <b>3D ayarları</b>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
          <div className="sv-quality">
            <span>Grafik kalitesi</span>
            <button className={cx('sv-chip', quality === 'high' && 'on')} onClick={() => updateSettings({ spaceQuality: 'high' })}>
              Yüksek
            </button>
            <button className={cx('sv-chip', quality === 'low' && 'on')} onClick={() => updateSettings({ spaceQuality: 'low' })}>
              Performans
            </button>
          </div>
          <div className="sv-quality">
            <span>Işık</span>
            <button className={cx('sv-chip', night && 'on')} onClick={() => updateSettings({ spaceNight: true })}>
              Gece
            </button>
            <button className={cx('sv-chip', !night && 'on')} onClick={() => updateSettings({ spaceNight: false })}>
              Gündüz
            </button>
          </div>
          <button className="btn ghost sm" onClick={() => openModal({ type: 'settings', tab: 'voice' })}>
            Ses ve görüntü ayarları
          </button>
        </div>
      )}
      {panel === 'help' && (
        <div className="sv-panel sv-help">
          <div className="sv-panel-head">
            <Keyboard size={18} />
            <b>Kısayollar</b>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
          <dl>
            <dt>W A S D / oklar</dt>
            <dd>Yürü (Shift ile koş)</dd>
            <dt>Boşluk</dt>
            <dd>Zıpla</dd>
            <dt>Fare sürükle · tekerlek</dt>
            <dd>Kamerayı çevir · yakınlaştır</dd>
            <dt>E</dt>
            <dd>Otur / kalk{world === 'meydan' ? ', stand kirala' : ''}</dd>
            <dt>1 – 9</dt>
            <dd>Hareketler (8 işaret et, 9 selam)</dd>
            <dt>F</dt>
            <dd>En yakındakini takip et; Kişiler'den birini seçip de takip edebilirsin</dd>
            <dt>Oturağa tıkla</dt>
            <dd>Oraya yürüyüp oturursun</dd>
            <dt>Enter</dt>
            <dd>Yaz (başının üstünde balon çıkar)</dd>
            <dt>O · V · P</dt>
            <dd>Kıyafet · bakış · kişiler</dd>
            <dt>H</dt>
            <dd>Hareket çubuğunu gizle / göster</dd>
            <dt>Ctrl+Shift+M</dt>
            <dd>Mikrofonu kapat / aç</dd>
          </dl>
          <p>Ses yakınlığa göre ayarlanır: yaklaştıkça yükselir, ~24 metrede kaybolur. 3D'ye geçmeyenleri her zamanki gibi duyarsın.</p>
        </div>
      )}
      {panel === 'people' && <People c={c} ch={ch} following={following} onFollow={(sid) => engine?.follow(sid)} />}
      {following && roster[following] && (
        <div className="sv-prompt sv-following">
          <Footprints size={15} /> {displayName(c, roster[following].userId, users)} kişisini takip ediyorsun
          <span className="sv-prompt-sub">Bırakmak için yürü ya da F</span>
        </div>
      )}

      {onStage && <div className="sv-stage-badge">🎤 Sahnedesin, herkes seni duyuyor</div>}
      {prompt && booth === null && !following && (
        <div className="sv-prompt">
          <kbd>E</kbd> {prompt.label}
          <span className="sv-prompt-sub">{prompt.kind === 'stand' ? 'Kalkmak için yürü ya da yine E' : 'Boş oturağa tıklayarak da oturabilirsin'}</span>
        </div>
      )}
      {booth !== null && (
        <BoothEditor
          i={booth}
          onClose={() => {
            setBoothOpen(null);
            hostRef.current?.querySelector('canvas')?.focus();
          }}
        />
      )}

      <div className={cx('sv-actions', !barOpen && 'closed')}>
        {barOpen && (
          <>
            {ACTIONS.map((x) => (
              <button key={x.e} className="sv-act" onClick={() => engine?.doEmote(x.e)} title={`${x.label} (${x.key})`}>
                <kbd>{x.key}</kbd>
                <x.Icon size={18} />
                <span>{x.label}</span>
              </button>
            ))}
            <i className="sv-act-sep" />
            <button className={cx('sv-act', panel === 'look' && 'on')} onClick={() => setPanel(panel === 'look' ? null : 'look')}>
              <kbd>O</kbd>
              <Shirt size={18} />
              <span>Kıyafet</span>
            </button>
            <button className={cx('sv-act', following && 'on')} onClick={() => engine?.follow(following ? null : engine.nearestOther())} title="Takip (F): en yakındakinin peşinden yürü">
              <kbd>F</kbd>
              <Footprints size={18} />
              <span>Takip</span>
            </button>
            <button className={cx('sv-act', firstPerson && 'on')} onClick={toggleView}>
              <kbd>V</kbd>
              <Eye size={18} />
              <span>{firstPerson ? 'Göz' : 'Bakış'}</span>
            </button>
            <button className={cx('sv-act', panel === 'people' && 'on')} onClick={() => setPanel(panel === 'people' ? null : 'people')}>
              <kbd>P</kbd>
              <Users size={18} />
              <span>Kişiler</span>
            </button>
            <button className={cx('sv-act', panel === 'help' && 'on')} onClick={() => setPanel(panel === 'help' ? null : 'help')}>
              <kbd>?</kbd>
              <Keyboard size={18} />
              <span>Kısayollar</span>
            </button>
            <button className={cx('sv-act', panel === 'settings' && 'on')} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
              <Settings2 size={18} />
              <span>Ayarlar</span>
            </button>
          </>
        )}
        <button className="sv-act sv-act-fold" onClick={() => setBarOpen(!barOpen)} title={barOpen ? 'Çubuğu gizle (H)' : 'Hareketler (H)'}>
          {barOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          {!barOpen && <span>Hareketler</span>}
        </button>
      </div>

      <div onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}>
        <ChatDock c={c} inputRef={chatRef} />
      </div>

      <div className="sv-call">
        <Tooltip text={v.noMic ? 'Mikrofon yok' : v.muted ? 'Sesi aç' : 'Sustur'} side="top">
          <button className={cx('sv-vbtn', (v.muted || v.noMic) && 'off', !v.muted && v.speaking[me] && 'talk')} onClick={toggleMute} aria-label="Mikrofon">
            {v.muted || v.noMic ? <MicOff size={19} /> : <Mic size={19} />}
          </button>
        </Tooltip>
        <Tooltip text={v.deaf ? 'Sağırlaştırmayı kapat' : 'Sağırlaştır'} side="top">
          <button className={cx('sv-vbtn', v.deaf && 'off')} onClick={toggleDeaf} aria-label="Kulaklık">
            {v.deaf ? <HeadphoneOff size={19} /> : <Headphones size={19} />}
          </button>
        </Tooltip>
        <Tooltip text={v.cam ? 'Kamerayı kapat' : 'Kamerayı aç'} side="top">
          <button className={cx('sv-vbtn', v.cam && 'on')} onClick={toggleCamera} aria-label="Kamera">
            {v.cam ? <Video size={19} /> : <VideoOff size={19} />}
          </button>
        </Tooltip>
        <Tooltip text={v.screen ? 'Yayını durdur' : 'Ekran paylaş (duvardaki ekranda görünür)'} side="top">
          <button className={cx('sv-vbtn', v.screen && 'live')} onClick={() => (v.screen ? stopScreen() : openModal({ type: 'screenShare' }))} aria-label="Ekran paylaş">
            {v.screen ? <MonitorX size={19} /> : <MonitorUp size={19} />}
          </button>
        </Tooltip>
        <Tooltip text="3D görünümü kapat" side="top">
          <button className="sv-vbtn on3d" onClick={() => exitSpace()} aria-label="3D görünümü kapat" aria-pressed>
            <Box size={19} />
          </button>
        </Tooltip>
        <Tooltip text="Bağlantıyı kes" side="top">
          <button className="sv-vbtn leave" onClick={() => exitSpace(true)} aria-label="Bağlantıyı kes">
            <PhoneOff size={19} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

export function SpaceView({ c, ch }: { c: Community; ch: Channel }) {
  const inHere = useSpace((s) => s.ch === ch.id && s.status !== 'idle');
  if (!inHere) return null;
  return (
    <section className="space-view">
      <Room key={ch.id} c={c} ch={ch} />
    </section>
  );
}
