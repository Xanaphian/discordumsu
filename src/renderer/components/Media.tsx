// Ses odası: kamera ve ekran paylaşımı görüntüleri, yayın seçici.
import { toggle3d } from '../lib/space';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Volume2, Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Video, VideoOff, MonitorUp, MonitorX, Maximize2, Minimize2, Expand, Settings2,
  RefreshCw, Monitor, AppWindow, LoaderCircle, Volume1, VolumeX, Phone,
} from 'lucide-react';
import { useStore, openModal, openMenu, updateSettings, dismissCall, selectCommunity } from '../lib/store';
import { memberMenu } from './Moderation';
import { insertMention } from './Members';
import { useVoice, joinVoice, leaveVoice, toggleMute, toggleDeaf, toggleCamera, startScreen, stopScreen, setUserVolume, screenLabelOf } from '../lib/voice';
import { Avatar, Tooltip, Toggle } from './Common';
import { Modal } from './Modals';
import { cx, displayName } from '../lib/util';
import type { Channel, Community, ID, VoiceMember } from '../../shared/protocol';

/** Akışı bir <video> öğesine bağlar; akış değişmedikçe yeniden bağlamaz */
export const StreamVideo = memo(function StreamVideo({ stream, mirror, fit = 'cover', muted = true }: { stream: MediaStream; mirror?: boolean; fit?: 'cover' | 'contain'; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} className={cx('vt-video', mirror && 'mirror')} style={{ objectFit: fit }} autoPlay playsInline muted={muted} />;
});

interface Tile {
  key: string;
  kind: 'user' | 'screen';
  sid: ID;
  uid: ID;
  me: boolean;
  member: VoiceMember;
  stream?: MediaStream;
}

function useTiles(chId: ID, inHere: boolean) {
  const members = useStore((s) => s.voice[chId]) || [];
  const me = useStore((s) => s.me.id);
  const v = useVoice();
  return useMemo(() => {
    const out: Tile[] = [];
    for (const m of members) {
      const isMe = m.userId === me && inHere && (!v.ch || v.ch === chId);
      const media = v.media[m.sessionId];
      if (m.screen) {
        const stream = isMe ? v.screen || undefined : media?.screen;
        out.push({ key: m.sessionId + ':screen', kind: 'screen', sid: m.sessionId, uid: m.userId, me: isMe, member: m, stream });
      }
      out.push({ key: m.sessionId + ':user', kind: 'user', sid: m.sessionId, uid: m.userId, me: isMe, member: m, stream: m.cam ? (isMe ? v.cam || undefined : media?.cam) : undefined });
    }
    return out;
  }, [members, me, v.media, v.cam, v.screen, v.ch, inHere, chId]);
}

function VolumeSlider({ uid }: { uid: ID }) {
  const vol = useStore((s) => s.settings.userVolumes[uid] ?? 100);
  return (
    <label className="vt-vol" onClick={(e) => e.stopPropagation()}>
      {vol === 0 ? <VolumeX size={14} /> : <Volume1 size={14} />}
      <input type="range" min={0} max={200} step={5} value={vol} onChange={(e) => setUserVolume(uid, +e.target.value)} />
      <span>{vol}%</span>
    </label>
  );
}

function TileView({ t, c, focused, onFocus, small }: { t: Tile; c: Community; focused: boolean; onFocus: () => void; small?: boolean }) {
  const users = useStore((s) => s.users);
  const speaking = useVoice((s) => !!s.speaking[t.uid]);
  const mirror = useStore((s) => s.settings.camMirror);
  const ref = useRef<HTMLDivElement>(null);
  const u = users[t.uid];
  const name = displayName(c, t.uid, users);
  const m = t.member;
  const full = () => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  };
  return (
    <div
      ref={ref}
      className={cx('vt', t.kind === 'screen' && 'vt-screen', speaking && t.kind === 'user' && !m.muted && 'speaking', focused && 'focused', small && 'small', !!t.stream && 'has-video')}
      style={{ ['--tile' as any]: u?.color || '#f5a524' }}
      onDoubleClick={full}
      onClick={onFocus}
      onContextMenu={(e) => {
        // kişinin karosuna sağ tık: kenar çubuğundaki ses kartı ve üye listesiyle aynı kişi menüsü (v1.43.2)
        e.preventDefault();
        e.stopPropagation();
        const meId = useStore.getState().me.id;
        openMenu(e, memberMenu(c, meId, t.uid, { at: { x: e.clientX, y: e.clientY }, onMention: () => insertMention(name) }));
      }}
    >
      {t.stream ? (
        <StreamVideo stream={t.stream} mirror={t.kind === 'user' && t.me && mirror} fit={t.kind === 'screen' ? 'contain' : 'cover'} />
      ) : t.kind === 'screen' ? (
        <div className="vt-wait">
          <LoaderCircle size={22} className="spin" />
          <span>Yayın yükleniyor…</span>
        </div>
      ) : (
        <Avatar user={u} size={small ? 48 : 84} />
      )}
      {t.kind === 'screen' && (
        <span className="vt-live">
          CANLI <i>{m.screen}</i>
        </span>
      )}
      <div className="vt-name">
        {t.kind === 'screen' ? <MonitorUp size={13} /> : null}
        <span>{t.kind === 'screen' ? (t.me ? 'Yayının' : `${name} yayını`) : name}</span>
        {t.kind === 'user' && (m.deaf ? <HeadphoneOff size={13} className="red" /> : m.muted ? <MicOff size={13} className="red" /> : null)}
      </div>
      {!small && (
        <div className="vt-actions" onClick={(e) => e.stopPropagation()}>
          {!t.me && <VolumeSlider uid={t.uid} />}
          <Tooltip text={focused ? 'Küçült' : 'Odakla'} side="top">
            <button className="vt-btn" onClick={onFocus} aria-label="Odakla">
              {focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </Tooltip>
          {t.stream && (
            <Tooltip text="Tam ekran" side="top">
              <button className="vt-btn" onClick={full} aria-label="Tam ekran">
                <Expand size={15} />
              </button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

export function VoiceView({ c, ch, embedded }: { c: Community; ch: Channel; embedded?: boolean }) {
  const members = useStore((s) => s.voice[ch.id]) || [];
  const v = useVoice();
  const inHere = v.ch === ch.id;
  const tiles = useTiles(ch.id, inHere);
  const [focus, setFocus] = useState<string | null>(null);
  const prevScreens = useRef(new Set<string>());
  // biri yayına başlayınca kendiliğinden odakla (kendi yayınım hariç)
  useEffect(() => {
    const screens = tiles.filter((t) => t.kind === 'screen');
    const fresh = screens.find((t) => !prevScreens.current.has(t.key) && !t.me);
    prevScreens.current = new Set(screens.map((t) => t.key));
    if (fresh && !focus) setFocus(fresh.key);
    if (focus && !tiles.some((t) => t.key === focus)) setFocus(null);
  }, [tiles, focus]);
  const focused = focus ? tiles.find((t) => t.key === focus) : undefined;
  const others = focused ? tiles.filter((t) => t !== focused) : tiles;
  const n = tiles.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  return (
    <section className={cx('voice-view', embedded && 'embedded')}>
      {!embedded && <div className="chat-header">
        <span className="ch-head-icon">
            <Volume2 size={22} />
          </span>
        <h2>{ch.name}</h2>
        <span className="head-sep" />
        <span className="ch-topic">{members.length ? `${members.length} kişi bağlı` : 'Kimse yok'}</span>
      </div>}
      <div className={cx('vv-stage', focused && 'has-focus')}>
        {members.length === 0 && !inHere ? (
          <div className="vv-empty">
            <div className="vv-hex">
              <Volume2 size={38} />
            </div>
            <h2>{ch.name}</h2>
            <p>Şu an kimse yok. İlk katılan sen ol!</p>
            <button className="btn primary lg" onClick={() => joinVoice(c.id, ch.id)}>
              Sese katıl
            </button>
          </div>
        ) : focused ? (
          <>
            <div className="vv-focus">
              <TileView t={focused} c={c} focused onFocus={() => setFocus(null)} />
            </div>
            {others.length > 0 && (
              <div className="vv-strip">
                {others.map((t) => (
                  <TileView key={t.key} t={t} c={c} focused={false} small onFocus={() => setFocus(t.key)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="vv-grid2" style={{ ['--cols' as any]: cols }}>
            {tiles.map((t) => (
              <TileView key={t.key} t={t} c={c} focused={false} onFocus={() => setFocus(t.key)} />
            ))}
          </div>
        )}
      </div>
      <div className="vv-controls">
        {inHere ? (
          <>
            <Tooltip text={v.noMic ? 'Mikrofon yok' : v.muted ? 'Sesi aç' : 'Sustur'} side="top">
              <button className={cx('vv-btn', (v.muted || v.noMic) && 'off')} onClick={toggleMute} aria-label="Mikrofon">
                {v.muted || v.noMic ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
            </Tooltip>
            <Tooltip text={v.deaf ? 'Sağırlaştırmayı kapat' : 'Sağırlaştır'} side="top">
              <button className={cx('vv-btn', v.deaf && 'off')} onClick={toggleDeaf} aria-label="Kulaklık">
                {v.deaf ? <HeadphoneOff size={22} /> : <Headphones size={22} />}
              </button>
            </Tooltip>
            <Tooltip text={v.cam ? 'Kamerayı kapat' : 'Kamerayı aç'} side="top">
              <button className={cx('vv-btn', v.cam && 'on')} onClick={toggleCamera} aria-label="Kamera">
                {v.cam ? <Video size={22} /> : <VideoOff size={22} />}
              </button>
            </Tooltip>
            <Tooltip text={v.screen ? 'Yayını durdur' : 'Ekran paylaş'} side="top">
              <button className={cx('vv-btn', v.screen && 'live')} onClick={() => (v.screen ? stopScreen() : openModal({ type: 'screenShare' }))} aria-label="Ekran paylaş">
                {v.screen ? <MonitorX size={22} /> : <MonitorUp size={22} />}
              </button>
            </Tooltip>
            {!c.dm && (
              <Tooltip text="3D oda" side="top">
                <button className="vv-btn vv-3d" onClick={() => toggle3d()} aria-label="3D oda">
                  <Box size={21} />
                </button>
              </Tooltip>
            )}
            <Tooltip text="Ses ve görüntü ayarları" side="top">
              <button className="vv-btn" onClick={() => openModal({ type: 'settings', tab: 'voice' })} aria-label="Ayarlar">
                <Settings2 size={21} />
              </button>
            </Tooltip>
            <Tooltip text="Bağlantıyı kes" side="top">
              <button className="vv-btn leave" onClick={() => leaveVoice()} aria-label="Bağlantıyı kes">
                <PhoneOff size={22} />
              </button>
            </Tooltip>
          </>
        ) : (
          members.length > 0 && (
            <button className={cx('btn primary lg', embedded && 'call-join')} onClick={() => joinVoice(c.id, ch.id)}>
              {embedded ? <><Phone size={18} /> Aramaya katıl</> : 'Sese katıl'}
            </button>
          )
        )}
      </div>
      {v.noMic && inHere && <div className="vv-warn">Mikrofon bulunamadı; dinleyici olarak bağlısın.</div>}
    </section>
  );
}

// ---------------------------------------------------------------- ekran seçici
type Source = Awaited<ReturnType<typeof window.kovan.capture.sources>>[number];

const RES: { v: 720 | 1080 | 1440 | 2160 | 0; label: string }[] = [
  { v: 720, label: '720p' },
  { v: 1080, label: '1080p' },
  { v: 1440, label: '1440p' },
  { v: 2160, label: '4K' },
  { v: 0, label: 'Kaynak' },
];
const FPS: (15 | 30 | 60)[] = [15, 30, 60];

export function ScreenPickerModal() {
  const s = useStore((x) => x.settings);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [srcs, setSrcs] = useState<Source[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    setSrcs(null);
    window.kovan.capture
      .sources()
      .then((l) => {
        setSrcs(l);
        setSel((cur) => cur ?? l.find((x) => x.kind === 'screen')?.id ?? null);
      })
      .catch(() => setSrcs([]));
  };
  useEffect(load, []);
  const list = (srcs || []).filter((x) => x.kind === tab);
  const chosen = srcs?.find((x) => x.id === sel);
  const mbps = ((s.screenRes === 2160 || s.screenRes === 0 ? 16 : s.screenRes === 1440 ? 9 : s.screenRes === 1080 ? 5 : 2.5) * (s.screenFps === 60 ? 1.5 : s.screenFps === 15 ? 0.6 : 1)).toFixed(1);
  const close = () => openModal(null);
  const go = async () => {
    if (!chosen) return;
    setBusy(true);
    await startScreen({ sourceId: chosen.id, name: chosen.name, res: s.screenRes, fps: s.screenFps, hint: s.screenHint, audio: s.screenAudio && window.kovan.platform === 'win32' });
    setBusy(false);
    close();
  };
  return (
    <Modal onClose={close} wide className="screen-picker">
      <div className="modal-head">
        <h2>Ekran paylaş</h2>
        <p>Neyi paylaşmak istediğini seç, kaliteyi ayarla.</p>
      </div>
      <div className="modal-body">
        <div className="sp-tabs">
          <button className={cx('sp-tab', tab === 'screen' && 'on')} onClick={() => setTab('screen')}>
            <Monitor size={16} /> Ekranlar
          </button>
          <button className={cx('sp-tab', tab === 'window' && 'on')} onClick={() => setTab('window')}>
            <AppWindow size={16} /> Uygulamalar
          </button>
          <span className="grow" />
          <button className="btn ghost sm" onClick={load}>
            <RefreshCw size={14} /> Yenile
          </button>
        </div>
        <div className="sp-grid scroll-thin">
          {!srcs ? (
            <div className="sp-empty">
              <LoaderCircle className="spin" size={22} />
            </div>
          ) : !list.length ? (
            <div className="sp-empty">{tab === 'screen' ? 'Ekran bulunamadı.' : 'Paylaşılabilir pencere yok.'}</div>
          ) : (
            list.map((x) => (
              <button key={x.id} className={cx('sp-src', sel === x.id && 'on')} onClick={() => setSel(x.id)} onDoubleClick={go}>
                <div className="sp-thumb">{x.thumb ? <img src={x.thumb} alt="" /> : <Monitor size={30} />}</div>
                <div className="sp-name">
                  {x.icon && <img src={x.icon} alt="" />}
                  <span>{x.name}</span>
                  {x.size && <small>{x.size.w}×{x.size.h}</small>}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="sp-opts">
          <div className="sp-opt">
            <span>Çözünürlük</span>
            <div className="seg">
              {RES.map((r) => (
                <button key={r.v} className={cx(s.screenRes === r.v && 'on')} onClick={() => updateSettings({ screenRes: r.v })}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sp-opt">
            <span>Kare hızı</span>
            <div className="seg">
              {FPS.map((f) => (
                <button key={f} className={cx(s.screenFps === f && 'on')} onClick={() => updateSettings({ screenFps: f })}>
                  {f} FPS
                </button>
              ))}
            </div>
          </div>
          <div className="sp-opt">
            <span>Öncelik</span>
            <div className="seg">
              <button className={cx(s.screenHint === 'motion' && 'on')} onClick={() => updateSettings({ screenHint: 'motion' })}>
                Akıcılık (oyun, video)
              </button>
              <button className={cx(s.screenHint === 'detail' && 'on')} onClick={() => updateSettings({ screenHint: 'detail' })}>
                Netlik (yazı, kod)
              </button>
            </div>
          </div>
          {window.kovan.platform === 'win32' && (
            <div className="sp-opt">
              <span>Bilgisayar sesini de paylaş</span>
              <Toggle value={s.screenAudio} onChange={(v) => updateSettings({ screenAudio: v })} />
            </div>
          )}
          <p className="note">
            {screenLabelOf(s.screenRes, s.screenFps)} için izleyici başına yaklaşık <b>{mbps} Mbps</b> yükleme hızı gerekir.
            {(s.screenRes === 2160 || s.screenRes === 0) && ' 4K yayın güçlü bir bağlantı ve ekran kartı ister; takılırsa 1440p ya da 1080p dene.'}
            {s.screenRes > 0 && chosen?.size && chosen.size.h < s.screenRes && ` Bu ekran ${chosen.size.h}p, yayın en fazla bu çözünürlükte olur.`}
          </p>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={close}>
          Vazgeç
        </button>
        <button className="btn primary" disabled={!chosen || busy} onClick={go}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <MonitorUp size={16} />} Yayına başla
        </button>
      </div>
    </Modal>
  );
}

/** Özel sohbetin üstündeki arama alanı: biri aramadaysa görünür */
export function DmCall({ c, ch }: { c: Community; ch: Channel }) {
  const members = useStore((s) => s.voice[ch.id]) || [];
  const v = useVoice();
  if (!members.length && v.ch !== ch.id) return null;
  return (
    <div className="dm-call">
      <VoiceView c={c} ch={ch} embedded />
    </div>
  );
}

/** Gelen arama kartı (her ekranda) */
export function IncomingCall() {
  const r = useStore((s) => s.ringing);
  const user = useStore((s) => (r ? s.users[r.from] : undefined));
  if (!r) return null;
  const accept = () => {
    dismissCall();
    selectCommunity(r.cid);
    joinVoice(r.cid, r.ch);
  };
  return (
    <div className="call-card" role="alertdialog" aria-label="Gelen arama">
      <div className="cc-av">
        <Avatar user={user} size={64} plain />
      </div>
      <b>{user?.name || 'Biri'}</b>
      <span>seni arıyor…</span>
      <div className="cc-btns">
        <Tooltip text="Reddet" side="bottom">
          <button className="cc-btn no" onClick={dismissCall} aria-label="Reddet">
            <PhoneOff size={20} />
          </button>
        </Tooltip>
        <Tooltip text="Katıl" side="bottom">
          <button className="cc-btn ok" onClick={accept} aria-label="Katıl">
            <Phone size={20} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
