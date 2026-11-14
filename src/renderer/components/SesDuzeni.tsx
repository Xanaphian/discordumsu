// Ses odası ana görünümü düzenleri (v1.45): Baloncuklar, Akordeon; Klasik eski ızgaradır (Media.tsx).
// Sağ alttaki seçiciden değişir, ayarlara kaydedilir. "Örnek kişiler" yalnız bu bilgisayarda görünen deneme kişileri ekler.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MicOff, HeadphoneOff, LayoutGrid, Check, Users, Circle, Columns3, Grid2x2, Eye, Minimize2, Maximize2, MonitorX, Expand, LoaderCircle, X } from 'lucide-react';
import { create } from 'zustand';
import { useStore, openMenu, updateSettings } from '../lib/store';
import { useVoice, setScreenGate } from '../lib/voice';
import { Avatar, Tooltip } from './Common';
import { cx, displayName } from '../lib/util';
import { memberMenu } from './Moderation';
import { insertMention } from './Members';
import { bannerBackground } from './profile/look';
import type { ProfileBanner, ProfileExtra } from '../../shared/profile';
import type { Community, ID, VoiceMember } from '../../shared/protocol';

export type VoiceLayout = 'baloncuk' | 'akordeon' | 'klasik';
const LAYOUTS: { id: VoiceLayout; label: string; icon: React.ReactNode }[] = [
  { id: 'baloncuk', label: 'Baloncuklar', icon: <Circle size={16} /> },
  { id: 'akordeon', label: 'Akordeon', icon: <Columns3 size={16} /> },
  { id: 'klasik', label: 'Klasik', icon: <Grid2x2 size={16} /> },
];

export interface Person {
  key: string;
  uid: ID;
  me: boolean;
  m: VoiceMember;
  stream?: MediaStream;
  /** kişi ekran paylaşıyorsa yayını (v1.47) */
  scr?: { key: string; stream?: MediaStream };
}

interface P extends Person {
  name: string;
  user: any;
  prof?: ProfileExtra;
  color: string;
  img?: string;
  fx: number;
  fy: number;
  talk: boolean;
  demo?: boolean;
}

// ---------------------------------------------------------------- örnek kişiler
const DEMO: { id: string; name: string; color: string; b: string; muted?: boolean; deaf?: boolean; talks?: boolean; live?: boolean }[] = [
  { id: 'deniz', name: 'Deniz (örnek)', color: '#e0607e', b: '#4a1f45', talks: true, live: true },
  { id: 'ozan', name: 'Ozan (örnek)', color: '#2fb3b8', b: '#0d2d3d', muted: true },
  { id: 'elif', name: 'Elif (örnek)', color: '#d9a441', b: '#3a2410', muted: true, deaf: true },
  { id: 'mert', name: 'Mert (örnek)', color: '#7c83e6', b: '#1b1640', talks: true, live: true },
];

/** Örnek kişinin "yayını": tuvalde dönen renkli bir sahne (sunucuya gitmez) */
const demoStreams: ({ s: MediaStream; stop: () => void } | null)[] = [null, null];
let demoUsers = 0;
function demoScreen(n: number): MediaStream {
  const have = demoStreams[n];
  if (have) return have.s;
  const cv = document.createElement('canvas');
  cv.width = 1280;
  cv.height = 720;
  const g = cv.getContext('2d')!;
  let t = 0;
  const draw = () => {
    t += 1 / 30;
    const gr = g.createLinearGradient(0, 0, 1280, 720);
    const h = n * 150;
    gr.addColorStop(0, `hsl(${(h + t * 20) % 360} 60% 30%)`);
    gr.addColorStop(1, `hsl(${(h + t * 20 + 140) % 360} 60% 18%)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `hsla(${(i * 60 + t * 40) % 360} 70% 60% / 0.55)`;
      g.beginPath();
      g.arc(640 + Math.cos(t * (n ? -0.8 : 1) + i) * (180 + i * 40), 360 + Math.sin(t * 1.3 + i) * 160, 40 + i * 8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.font = '700 64px Rubik, sans-serif';
    g.textAlign = 'center';
    g.fillText(n ? 'Örnek yayın 2' : 'Örnek yayın', 640, 340);
    g.font = '400 30px Rubik, sans-serif';
    g.fillText(new Date().toLocaleTimeString('tr-TR'), 640, 400);
  };
  draw();
  const iv = setInterval(draw, 1000 / 30);
  const s = (cv as any).captureStream(30) as MediaStream;
  demoStreams[n] = { s, stop: () => (clearInterval(iv), s.getTracks().forEach((x) => x.stop())) };
  return s;
}
function useDemoScreens(on: boolean) {
  const [s, setS] = useState<MediaStream[]>([]);
  useEffect(() => {
    if (!on) return;
    demoUsers++;
    setS([demoScreen(0), demoScreen(1)]);
    return () => {
      if (--demoUsers === 0)
        demoStreams.forEach((d, i) => {
          d?.stop();
          demoStreams[i] = null;
        });
    };
  }, [on]);
  return on ? s : [];
}

/** Örnek kişilerden sırayla biri "konuşur", düzenler canlı görünsün */
function useDemoPeople(on: boolean): P[] {
  const scrs = useDemoScreens(on);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setTick((x) => x + 1), 2600);
    return () => clearInterval(t);
  }, [on]);
  return useMemo(() => {
    if (!on) return [];
    const talkers = DEMO.filter((d) => d.talks);
    const cur = talkers[tick % talkers.length].id;
    let liveN = 0;
    return DEMO.map((d) => {
      const scrStream = d.live ? scrs[liveN++] : undefined;
      const banner: ProfileBanner = { kind: 'gradient', a: d.color, b: d.b, angle: 160 };
      const prof = { banner } as ProfileExtra;
      const uid = 'demo:' + d.id;
      return {
        key: uid,
        uid,
        me: false,
        m: { sessionId: uid, userId: uid, muted: !!d.muted, deaf: !!d.deaf, screen: d.live ? 'Örnek yayın' : null } as VoiceMember,
        scr: d.live ? { key: uid + ':screen', stream: scrStream } : undefined,
        name: d.name,
        user: { id: uid, name: d.name.split(' ')[0], color: d.color, profile: prof },
        prof,
        color: d.color,
        fx: 50,
        fy: 50,
        talk: d.id === cur,
        demo: true,
      };
    });
  }, [on, tick, scrs]);
}

function usePeople(c: Community, people: Person[]): P[] {
  const users = useStore((s) => s.users);
  const meExtra = useStore((s) => (s.me as { extra?: ProfileExtra }).extra);
  const speaking = useVoice((s) => s.speaking);
  return useMemo(
    () =>
      people.map((p) => {
        const u = users[p.uid];
        const prof: ProfileExtra | undefined = u?.profile ?? (p.me ? meExtra : undefined);
        const b = prof?.banner;
        return {
          ...p,
          name: displayName(c, p.uid, users),
          user: u ? { ...u, profile: prof } : undefined,
          prof,
          color: u?.color || '#c8aa6e',
          img: b?.kind === 'image' && b.image ? b.image : undefined,
          fx: (b as any)?.x ?? 50,
          fy: (b as any)?.y ?? 50,
          talk: !!speaking[p.uid] && !p.m.muted,
        };
      }),
    [people, users, meExtra, speaking, c],
  );
}

function handlers(c: Community, p: P) {
  if (p.demo) return {};
  return {
    onClick: (e: React.MouseEvent) => useStore.setState({ popout: { uid: p.uid, cid: c.id, x: e.clientX, y: e.clientY } }),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const st = useStore.getState();
      openMenu(e, memberMenu(c, st.me.id, p.uid, { at: { x: e.clientX, y: e.clientY }, onMention: () => insertMention(p.name) }));
    },
  };
}

/** Kartın arkası: kamera açıksa görüntü, yoksa afiş (resim ya da renk) */
function Back({ p }: { p: P }) {
  if (p.stream) {
    return (
      <video
        className="sd-back"
        autoPlay
        playsInline
        muted
        ref={(v) => {
          if (v && v.srcObject !== p.stream) {
            v.srcObject = p.stream!;
            v.play().catch(() => {});
          }
        }}
      />
    );
  }
  if (p.img) return <img className="sd-back" src={p.img} alt="" draggable={false} style={{ objectPosition: `${p.fx}% ${p.fy}%` }} />;
  return <span className="sd-back" style={{ background: bannerBackground(p.prof?.banner, p.color) }} />;
}

function Flags({ p }: { p: P }) {
  if (p.m.deaf) return <span className="sd-flag" title="Sağırlaştırılmış"><HeadphoneOff size={14} /></span>;
  if (p.m.muted) return <span className="sd-flag" title="Susturulmuş"><MicOff size={14} /></span>;
  return null;
}

function stateText(p: P) {
  if (p.m.deaf) return 'Sağırlaştırılmış';
  if (p.m.muted) return 'Susturulmuş';
  if (p.talk) return 'Konuşuyor';
  return 'Dinliyor';
}

function Bars() {
  return (
    <span className="sd-bars on" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

// ---------------------------------------------------------------- yayın izleme (v1.47)
// Yayın açan kişinin balonunda/şeridinde yayın bulanık görünür; "Yayını izle" ile büyür.
// Sol üstteki "Odaya dön" büyük görünümü kapatır, yayın kişinin balonunda net oynamaya devam eder.
// Alttaki "Yayından çık" izlemeyi bırakır. Birden çok yayın aynı anda izlenebilir.
export const useWatch = create<{ on: string[]; big: string | null }>(() => ({ on: [], big: null }));
export function watchStream(key: string) {
  useWatch.setState((s) => ({ on: s.on.includes(key) ? s.on : [...s.on, key], big: key }));
}
function shrinkStream() {
  useWatch.setState({ big: null });
}
function leaveStream(key: string) {
  useWatch.setState((s) => ({ on: s.on.filter((k) => k !== key), big: s.big === key ? null : s.big }));
}

function Vid({ stream, className, fit = 'cover' }: { stream: MediaStream; className?: string; fit?: 'cover' | 'contain' }) {
  return (
    <video
      className={className}
      style={{ objectFit: fit }}
      autoPlay
      playsInline
      muted
      ref={(v) => {
        if (v && v.srcObject !== stream) {
          v.srcObject = stream;
          v.play().catch(() => {});
        }
      }}
    />
  );
}

/** Balonun ya da şeridin içindeki yayın: izlenmiyorsa bulanık + "Yayını izle", izleniyorsa net */
function StreamFace({ p, watched }: { p: P; watched: boolean }) {
  const s = p.scr!;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <>
      {s.stream ? <Vid stream={s.stream} className={cx('sd-back sd-live-vid', !watched && 'blur')} /> : <span className="sd-back sd-live-wait"><LoaderCircle size={22} className="spin" /></span>}
      {!watched && <span className="sd-live-veil" />}
      <span className="sd-live-tag">CANLI</span>
      {!watched ? (
        <button className="sd-watch" onClick={(e) => (stop(e), watchStream(s.key))} onContextMenu={stop}>
          <Eye size={16} /> {p.me ? 'Yayınını aç' : 'Yayını izle'}
        </button>
      ) : (
        <span className="sd-live-tools" onClick={stop}>
          <Tooltip text="Büyüt" side="top">
            <button onClick={() => watchStream(s.key)} aria-label="Büyüt">
              <Maximize2 size={15} />
            </button>
          </Tooltip>
          {!p.me && (
            <Tooltip text="Yayından çık" side="top">
              <button onClick={() => leaveStream(s.key)} aria-label="Yayından çık">
                <X size={15} />
              </button>
            </Tooltip>
          )}
        </span>
      )}
    </>
  );
}

/** Büyük yayın görünümü: sahnenin üstünü kaplar */
function Theater({ p }: { p: P }) {
  const s = p.scr!;
  const ref = useRef<HTMLDivElement>(null);
  const full = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else ref.current?.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.fullscreenElement && shrinkStream();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="sd-theater" ref={ref} onDoubleClick={full}>
      {s.stream ? <Vid stream={s.stream} className="sd-theater-vid" fit="contain" /> : <div className="sd-theater-wait"><LoaderCircle size={28} className="spin" /> Yayın yükleniyor…</div>}
      <button className="sd-th-back" onClick={shrinkStream}>
        <Minimize2 size={16} /> Odaya dön
      </button>
      <div className="sd-th-who">
        <Avatar user={p.user} size={30} speaking={p.talk} />
        <b>{p.me ? 'Yayının' : p.name}</b>
        <span className="sd-live-tag static">CANLI</span>
        {p.m.screen && <i>{p.m.screen}</i>}
      </div>
      <Tooltip text="Tam ekran" side="left">
        <button className="sd-th-full" onClick={full} aria-label="Tam ekran">
          <Expand size={16} />
        </button>
      </Tooltip>
      {!p.me && (
        <button className="sd-th-leave" onClick={() => leaveStream(s.key)}>
          <MonitorX size={17} /> Yayından çık
        </button>
      )}
      {p.me && (
        <button className="sd-th-leave soft" onClick={shrinkStream}>
          <X size={17} /> Önizlemeyi kapat
        </button>
      )}
    </div>
  );
}

/** Balon/şerit köşesindeki küçük profil resmi (yayın varken ortayı kapatmasın) */
function CornerAvatar({ p, size }: { p: P; size: number }) {
  return (
    <span className="sd-corner-av">
      <Avatar user={p.user} size={size} speaking={p.talk} />
    </span>
  );
}

// ---------------------------------------------------------------- Akordeon
function Akordeon({ c, ps, on }: { c: Community; ps: P[]; on: string[] }) {
  const dense = ps.length > 7;
  return (
    <div className={cx('sd sd-akordeon', dense && 'dense')}>
      {ps.map((p) => {
        const w = !!p.scr && on.includes(p.scr.key);
        return (
        <div key={p.key} className={cx('sd-fold', p.talk && 'talk open', p.demo && 'demo', p.scr && 'live', w && 'watching')} {...handlers(c, p)}>
          {p.scr ? <StreamFace p={p} watched={w} /> : <Back p={p} />}
          <span className="sd-shade" />
          <div className="sd-fold-foot">
            {p.scr ? <CornerAvatar p={p} size={dense ? 34 : 44} /> : <Avatar user={p.user} size={p.talk ? (dense ? 72 : 96) : dense ? 40 : 56} speaking={p.talk} />}
            <b>{p.name}</b>
            <span className="sd-sub">
              {p.talk && <Bars />}
              {p.m.deaf ? <HeadphoneOff size={13} /> : p.m.muted ? <MicOff size={13} /> : null}
              {stateText(p)}
            </span>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Baloncuklar
// Sıra katılma sırasıdır, kimse yer değiştirmez; konuşanın balonu yerinde büyür.
// Balonlar ortalanmış, kayan bir dizide; dikey kaydırma ile dağınık durur, sığmazsa alt satıra geçer.
const BUB_Y = [0, -70, 46, -34, 64, -58, 26, -16];
/** Kutunun boyunu izler (balonlar sığsın diye) */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 1100, h: 700 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}
function Baloncuk({ c, ps, on }: { c: Community; ps: P[]; on: string[] }) {
  const n = ps.length;
  const [ref, box] = useBox<HTMLDivElement>();
  const base = ps.map((p) => {
    const w = !!p.scr && on.includes(p.scr.key);
    return w ? 330 : p.scr ? 250 : p.talk ? 236 : p.m.muted || p.m.deaf ? 128 : 166;
  });
  // tek sırada sığacak kadar küçült; çok kalabalıkta en az 0.5'e kadar, sonra alt satıra geçer
  const gap = n > 6 ? 24 : 34;
  const rowW = base.reduce((a, b) => a + b, 0) + gap * (n - 1) + 20;
  const k = Math.max(0.42, Math.min(1, (box.w * 0.9) / rowW, (box.h - 150) / Math.max(...base)));
  return (
    <div ref={ref} className={cx('sd sd-bubbles', n > 6 && 'many')}>
      {ps.map((p, i) => {
        const w = !!p.scr && on.includes(p.scr.key);
        const size = Math.round(base[i] * k);
        return (
          <div
            key={p.key}
            className={cx('sd-bub', p.talk && 'talk', p.demo && 'demo', p.scr && 'live', w && 'watching')}
            style={{ ['--s' as any]: `${size}px`, ['--y' as any]: `${Math.round(BUB_Y[i % BUB_Y.length] * k * Math.min(1, Math.max(0, (box.h - 120 - Math.max(...base) * k) / 140)))}px`, animationDelay: `${-((i * 1.7) % 7)}s` }}
            {...handlers(c, p)}
          >
            <span className="sd-bub-box">
              <span className="sd-bub-ball">
                {p.scr ? (
                  <StreamFace p={p} watched={w} />
                ) : (
                  <>
                    <Back p={p} />
                    <span className="sd-shade" />
                    <Avatar user={p.user} size={Math.round(size * 0.42)} speaking={p.talk} />
                  </>
                )}
                {!p.scr && <Flags p={p} />}
              </span>
              {p.scr && <CornerAvatar p={p} size={Math.round(58 * Math.max(k, 0.7))} />}
            </span>
            <span className="sd-bub-name">{p.name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DesignStage({ c, layout, people }: { c: Community; layout: VoiceLayout; people: Person[] }) {
  const demoOn = useStore((s) => s.settings.voiceDemo);
  const real = usePeople(c, people);
  const demo = useDemoPeople(demoOn);
  const ps = useMemo(() => [...real, ...demo], [real, demo]);
  const { on: rawOn, big } = useWatch();
  // kendi yayınım hep net; biten yayınlar listeden düşer
  const keys = useMemo(() => new Map(ps.filter((p) => p.scr).map((p) => [p.scr!.key, p])), [ps]);
  const on = useMemo(() => [...rawOn.filter((k) => keys.has(k)), ...[...keys.values()].filter((p) => p.me).map((p) => p.scr!.key)], [rawOn, keys]);
  useEffect(() => {
    if (rawOn.some((k) => !keys.has(k)) || (big && !keys.has(big))) useWatch.setState({ on: rawOn.filter((k) => keys.has(k)), big: big && keys.has(big) ? big : null });
  }, [rawOn, big, keys]);
  // yayın sesi yalnız izlenen yayınlardan gelir
  useEffect(() => {
    setScreenGate(new Set(on.map((k) => keys.get(k)!.uid)));
  }, [on, keys]);
  useEffect(() => () => setScreenGate(null), []);
  if (!ps.length) return null;
  const bigP = big ? keys.get(big) : undefined;
  return (
    <>
      {layout === 'akordeon' ? <Akordeon c={c} ps={ps} on={on} /> : <Baloncuk c={c} ps={ps} on={on} />}
      {bigP && <Theater p={bigP} />}
    </>
  );
}

/** Sağ alttaki düzen seçici */
export function LayoutPicker() {
  const layout = useStore((s) => s.settings.voiceLayout);
  const demo = useStore((s) => s.settings.voiceDemo);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', off);
    return () => window.removeEventListener('mousedown', off);
  }, [open]);
  const cur = LAYOUTS.find((l) => l.id === layout) || LAYOUTS[0];
  return (
    <div className="sd-picker" ref={ref}>
      {open && (
        <div className="sd-picker-pop" role="menu">
          <div className="sd-picker-title">Görünüm</div>
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              role="menuitemradio"
              aria-checked={l.id === layout}
              className={cx('sd-picker-item', l.id === layout && 'on')}
              onClick={() => {
                updateSettings({ voiceLayout: l.id });
                setOpen(false);
              }}
            >
              {l.icon}
              <span>{l.label}</span>
              {l.id === layout && <Check size={15} className="sd-picker-check" />}
            </button>
          ))}
          <div className="sd-picker-sep" />
          <button role="menuitemcheckbox" aria-checked={demo} className={cx('sd-picker-item', demo && 'on')} onClick={() => updateSettings({ voiceDemo: !demo })}>
            <Users size={16} />
            <span>Örnek kişileri göster</span>
            {demo && <Check size={15} className="sd-picker-check" />}
          </button>
          <p className="sd-picker-note">Örnek kişiler yalnız sende görünür, düzenleri denemek içindir.</p>
        </div>
      )}
      <Tooltip text="Görünümü değiştir" side="top">
        <button className={cx('sd-picker-btn', open && 'on')} onClick={() => setOpen(!open)} aria-label="Görünümü değiştir">
          <LayoutGrid size={17} />
          <span>{cur.label}</span>
        </button>
      </Tooltip>
    </div>
  );
}
