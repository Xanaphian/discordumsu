import React, { useEffect, useRef, useState } from 'react';
import { Box, Mic, MicOff, Headphones, HeadphoneOff, LogOut, Moon, Sun, Shirt, HelpCircle, MessageSquare, Users, Store, X, Check } from 'lucide-react';
import { useStore, updateSettings } from '../lib/store';
import { useVoice, toggleMute, toggleDeaf } from '../lib/voice';
import { useSpace, enterSpace, exitSpace, say, setBooth, pushLook } from '../lib/space';
import { Avatar, Tooltip } from './Common';
import { cx, COLORS, displayName } from '../lib/util';
import type { AvatarLook, Channel, Community, ID } from '../../shared/protocol';
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

const EMOTE_BAR = [
  { e: 'wave', key: '1', icon: '👋', label: 'El salla' },
  { e: 'dance', key: '2', icon: '💃', label: 'Dans' },
  { e: 'clap', key: '3', icon: '👏', label: 'Alkış' },
  { e: 'heart', key: '4', icon: '💖', label: 'Kalp' },
  { e: 'laugh', key: '5', icon: '😂', label: 'Gül' },
  { e: 'spin', key: '6', icon: '🌀', label: 'Dön' },
  { e: 'jump', key: '7', icon: '⤴️', label: 'Zıpla' },
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

function Lobby({ c, ch }: { c: Community; ch: Channel }) {
  const members = useStore((s) => s.voice[ch.id]) || [];
  const users = useStore((s) => s.users);
  const joining = useSpace((s) => s.status === 'joining' && s.ch === ch.id);
  return (
    <div className="sv-lobby">
      <div className="sv-card">
        <div className="sv-hero">
          <div className="sv-hero-hex">
            <Box size={34} />
          </div>
          <div>
            <h2>{ch.name}</h2>
            <p>{ch.topic || 'Avatarınla dolaş, yakındakilerle sesli konuş.'}</p>
          </div>
        </div>
        <div className="sv-who">
          {members.length ? (
            <>
              <div className="sv-faces">
                {members.slice(0, 8).map((m) => (
                  <Avatar key={m.sessionId} user={users[m.userId]} size={28} />
                ))}
              </div>
              <span>
                {members.length} kişi içeride: {members.slice(0, 3).map((m) => displayName(c, m.userId, users)).join(', ')}
                {members.length > 3 ? '…' : ''}
              </span>
            </>
          ) : (
            <span>Şu an kimse yok. Meydanı ilk sen aç!</span>
          )}
        </div>
        <LookPicker />
        <div className="sv-features">
          <div>
            <b>🔊 Yakınlık sesi</b>
            <span>Yaklaştıkça duyarsın, sesin yönü de gelir.</span>
          </div>
          <div>
            <b>🎤 Sahne</b>
            <span>Sahneye çık, herkes seni duysun.</span>
          </div>
          <div>
            <b>🏪 Standlar</b>
            <span>Bir stand kirala, tabelana ne istersen yaz.</span>
          </div>
          <div>
            <b>🔥 Kamp ateşi</b>
            <span>Banklara otur, sohbet et, emote yap.</span>
          </div>
        </div>
        <button className="btn primary lg sv-enter" disabled={joining} onClick={() => enterSpace(c.id, ch.id)}>
          {joining ? 'Giriliyor…' : 'Odaya gir'}
        </button>
        <div className="sv-keys">
          <kbd>W A S D</kbd> yürü · <kbd>Shift</kbd> koş · <kbd>Boşluk</kbd> zıpla · <kbd>E</kbd> etkileşim · <kbd>Enter</kbd> sohbet · <kbd>1-7</kbd> emote · fareyle sürükle: kamera
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
      const S = cv.width, k = S / 2 / 37;
      const P = (x: number, z: number): [number, number] => [S / 2 + x * k, S / 2 + z * k];
      g.clearRect(0, 0, S, S);
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

function ChatLog({ c }: { c: Community }) {
  const log = useSpace((s) => s.log);
  const users = useStore((s) => s.users);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 2000);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();
  const recent = log.filter((l) => now - l.ts < 60_000).slice(-6);
  if (!recent.length) return null;
  return (
    <div className="sv-log">
      {recent.map((l) => (
        <div key={l.id} className={cx('sv-log-line', now - l.ts > 45_000 && 'old')}>
          <b style={{ color: users[l.uid]?.color }}>{displayName(c, l.uid, users)}</b> {l.text}
        </div>
      ))}
    </div>
  );
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

function People({ c }: { c: Community }) {
  const roster = useSpace((s) => s.roster);
  const users = useStore((s) => s.users);
  const speaking = useVoice((s) => s.speaking);
  const list = Object.values(roster);
  return (
    <div className="sv-panel sv-people">
      <div className="sv-panel-head">
        <Users size={18} />
        <b>Odadakiler · {list.length}</b>
      </div>
      <div className="sv-people-list">
        {list.map((r) => (
          <div key={r.sid} className={cx('sv-person', speaking[r.userId] && 'speaking')}>
            <Avatar user={users[r.userId]} size={24} />
            <span>{displayName(c, r.userId, users)}</span>
            <i style={{ background: r.look.color }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Room({ c, ch }: { c: Community; ch: Channel }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<SpaceEngine | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [booth, setBoothOpen] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState('');
  const [panel, setPanel] = useState<'look' | 'help' | 'people' | null>(null);
  const [onStage, setOnStage] = useState(false);
  const night = useStore((s) => s.settings.spaceNight);
  const quality = useStore((s) => s.settings.spaceQuality);
  const me = useStore((s) => s.me.id);
  const users = useStore((s) => s.users);
  const status = useSpace((s) => s.status);
  const count = useSpace((s) => Object.keys(s.roster).length);
  const v = useVoice();
  const chatRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<SpaceEngine | null>(null);
  const cRef = useRef(c);
  cRef.current = c;

  // motoru tembel yükle
  useEffect(() => {
    let alive = true;
    let eng: SpaceEngine | null = null;
    import('../space/engine')
      .then(({ SpaceEngine }) => {
        if (!alive || !hostRef.current) return;
        try {
          eng = new SpaceEngine(hostRef.current, {
            quality: useStore.getState().settings.spaceQuality,
            night: useStore.getState().settings.spaceNight,
            myUid: useStore.getState().me.id,
            nameOf: (uid: ID) => displayName(cRef.current, uid, useStore.getState().users),
            onPrompt: setPrompt,
            onBooth: (i) => setBoothOpen(i),
            onStage: setOnStage,
          });
          engineRef.current = eng;
          setEngine(eng);
        } catch (e) {
          setFailed('3D görüntü başlatılamadı. Ekran kartı sürücülerini güncellemeyi dene.');
          console.error(e);
        }
      })
      .catch(() => setFailed('3D modülü yüklenemedi.'));
    return () => {
      alive = false;
      eng?.dispose();
      engineRef.current = null;
    };
  }, [quality]);

  useEffect(() => engine?.setNight(night), [engine, night]);
  useEffect(() => engine?.refreshNames(), [engine, users, c.members]);
  useEffect(() => {
    if (engine) engine.typing = chatOpen || booth !== null;
  }, [engine, chatOpen, booth]);

  // Enter: sohbet, Esc: panelleri kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.querySelector('.modal-backdrop')) return;
      if (e.key === 'Enter' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setChatOpen(true);
        setTimeout(() => chatRef.current?.focus(), 0);
      } else if (e.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sendChat = () => {
    if (chat.trim()) say(chat);
    setChat('');
    setChatOpen(false);
    chatRef.current?.blur();
  };

  return (
    <div className="sv-room">
      <div className="sv-canvas-host" ref={hostRef} />
      {(!engine || status !== 'in') && !failed && (
        <div className="sv-loading">
          <div className="sv-hero-hex spin">
            <Box size={30} />
          </div>
          <span>{status !== 'in' ? 'Odaya bağlanılıyor…' : 'Meydan hazırlanıyor…'}</span>
        </div>
      )}
      {failed && (
        <div className="sv-loading">
          <span>{failed}</span>
          <button className="btn" onClick={() => exitSpace()}>
            Çık
          </button>
        </div>
      )}

      <div className="sv-top">
        <div className="sv-pill">
          <Box size={16} />
          <b>{ch.name}</b>
          <span className="sv-dot" />
          <button className="sv-link" onClick={() => setPanel(panel === 'people' ? null : 'people')}>
            {count} kişi
          </button>
        </div>
        <div className="sv-pill sv-tools">
          <Tooltip text={night ? 'Gündüz yap' : 'Gece yap'}>
            <button className="sv-icon" onClick={() => updateSettings({ spaceNight: !night })} aria-label="Gece/gündüz">
              {night ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </Tooltip>
          <Tooltip text="Görünüm">
            <button className={cx('sv-icon', panel === 'look' && 'on')} onClick={() => setPanel(panel === 'look' ? null : 'look')} aria-label="Görünüm">
              <Shirt size={17} />
            </button>
          </Tooltip>
          <Tooltip text="Kontroller">
            <button className={cx('sv-icon', panel === 'help' && 'on')} onClick={() => setPanel(panel === 'help' ? null : 'help')} aria-label="Yardım">
              <HelpCircle size={17} />
            </button>
          </Tooltip>
        </div>
      </div>
      <Minimap engine={engine} />

      {panel === 'look' && (
        <div className="sv-panel sv-look-panel">
          <div className="sv-panel-head">
            <Shirt size={18} />
            <b>Görünüm</b>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
          <LookPicker />
          <div className="sv-quality">
            <span>Grafik kalitesi</span>
            <button className={cx('sv-chip', quality === 'high' && 'on')} onClick={() => updateSettings({ spaceQuality: 'high' })}>
              Yüksek
            </button>
            <button className={cx('sv-chip', quality === 'low' && 'on')} onClick={() => updateSettings({ spaceQuality: 'low' })}>
              Performans
            </button>
          </div>
        </div>
      )}
      {panel === 'help' && (
        <div className="sv-panel sv-help">
          <div className="sv-panel-head">
            <HelpCircle size={18} />
            <b>Kontroller</b>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
          <dl>
            <dt>W A S D / oklar</dt>
            <dd>Yürü</dd>
            <dt>Shift</dt>
            <dd>Koş</dd>
            <dt>Boşluk</dt>
            <dd>Zıpla</dd>
            <dt>Fare sürükle · tekerlek</dt>
            <dd>Kamerayı çevir · yakınlaştır</dd>
            <dt>E</dt>
            <dd>Otur / kalk, stand kirala</dd>
            <dt>Enter</dt>
            <dd>Başının üstünde balonla yaz</dd>
            <dt>1 – 7</dt>
            <dd>Emote</dd>
            <dt>Ctrl+Shift+M</dt>
            <dd>Mikrofonu kapat/aç</dd>
          </dl>
          <p>Ses yakınlığa göre ayarlanır: yaklaştıkça yükselir, ~24 metrede kaybolur. Sahnedeki kişiyi herkes duyar.</p>
        </div>
      )}
      {panel === 'people' && <People c={c} />}

      {onStage && <div className="sv-stage-badge">🎤 Sahnedesin, herkes seni duyuyor</div>}
      <ChatLog c={c} />
      {prompt && booth === null && !chatOpen && (
        <div className="sv-prompt">
          <kbd>E</kbd> {prompt.label}
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

      <div className="sv-bottom">
        {chatOpen ? (
          <div className="sv-chat">
            <MessageSquare size={16} />
            <input
              ref={chatRef}
              maxLength={200}
              placeholder="Yakındakilere bir şey söyle… (Enter gönder, Esc kapat)"
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              onBlur={() => !chat && setChatOpen(false)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') sendChat();
                if (e.key === 'Escape') {
                  setChat('');
                  setChatOpen(false);
                  chatRef.current?.blur();
                }
              }}
            />
          </div>
        ) : (
          <div className="sv-emotes">
            {EMOTE_BAR.map((x) => (
              <Tooltip key={x.e} text={`${x.label} (${x.key})`} side="top">
                <button className="sv-emote" onClick={() => engine?.doEmote(x.e)}>
                  <span>{x.icon}</span>
                  <kbd>{x.key}</kbd>
                </button>
              </Tooltip>
            ))}
            <Tooltip text="Sohbet (Enter)" side="top">
              <button
                className="sv-emote"
                onClick={() => {
                  setChatOpen(true);
                  setTimeout(() => chatRef.current?.focus(), 0);
                }}
              >
                <MessageSquare size={18} />
              </button>
            </Tooltip>
          </div>
        )}
        <div className="sv-voice">
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
          <Tooltip text="Odadan çık" side="top">
            <button className="sv-vbtn leave" onClick={() => exitSpace()} aria-label="Odadan çık">
              <LogOut size={19} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export function SpaceView({ c, ch }: { c: Community; ch: Channel }) {
  const inHere = useSpace((s) => s.ch === ch.id && s.status !== 'idle');
  const status = useSpace((s) => s.status);
  return (
    <section className="space-view">
      {inHere && status === 'in' ? <Room key={ch.id} c={c} ch={ch} /> : <Lobby c={c} ch={ch} />}
    </section>
  );
}
