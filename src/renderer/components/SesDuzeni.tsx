// Ses odası ana görünümü düzenleri (v1.45): Baloncuklar, Akordeon; Klasik eski ızgaradır (Media.tsx).
// Sağ alttaki seçiciden değişir, ayarlara kaydedilir. "Örnek kişiler" yalnız bu bilgisayarda görünen deneme kişileri ekler.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MicOff, HeadphoneOff, LayoutGrid, Check, Users, Circle, Columns3, Grid2x2 } from 'lucide-react';
import { useStore, openMenu, updateSettings } from '../lib/store';
import { useVoice } from '../lib/voice';
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
const DEMO: { id: string; name: string; color: string; b: string; muted?: boolean; deaf?: boolean; talks?: boolean }[] = [
  { id: 'deniz', name: 'Deniz (örnek)', color: '#e0607e', b: '#4a1f45', talks: true },
  { id: 'ozan', name: 'Ozan (örnek)', color: '#2fb3b8', b: '#0d2d3d', muted: true },
  { id: 'elif', name: 'Elif (örnek)', color: '#d9a441', b: '#3a2410', muted: true, deaf: true },
  { id: 'mert', name: 'Mert (örnek)', color: '#7c83e6', b: '#1b1640', talks: true },
];

/** Örnek kişilerden sırayla biri "konuşur", düzenler canlı görünsün */
function useDemoPeople(on: boolean): P[] {
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
    return DEMO.map((d) => {
      const banner: ProfileBanner = { kind: 'gradient', a: d.color, b: d.b, angle: 160 };
      const prof = { banner } as ProfileExtra;
      const uid = 'demo:' + d.id;
      return {
        key: uid,
        uid,
        me: false,
        m: { sessionId: uid, userId: uid, muted: !!d.muted, deaf: !!d.deaf } as VoiceMember,
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
  }, [on, tick]);
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

// ---------------------------------------------------------------- Akordeon
function Akordeon({ c, ps }: { c: Community; ps: P[] }) {
  const dense = ps.length > 7;
  return (
    <div className={cx('sd sd-akordeon', dense && 'dense')}>
      {ps.map((p) => (
        <div key={p.key} className={cx('sd-fold', p.talk && 'talk open', p.demo && 'demo')} {...handlers(c, p)}>
          <Back p={p} />
          <span className="sd-shade" />
          <div className="sd-fold-foot">
            <Avatar user={p.user} size={p.talk ? (dense ? 72 : 96) : dense ? 40 : 56} speaking={p.talk} />
            <b>{p.name}</b>
            <span className="sd-sub">
              {p.talk && <Bars />}
              {p.m.deaf ? <HeadphoneOff size={13} /> : p.m.muted ? <MicOff size={13} /> : null}
              {stateText(p)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Baloncuklar
// Sıra katılma sırasıdır, kimse yer değiştirmez; konuşanın balonu yerinde büyür.
// Balonlar ortalanmış, kayan bir dizide; dikey kaydırma ile dağınık durur, sığmazsa alt satıra geçer.
const BUB_Y = [0, -70, 46, -34, 64, -58, 26, -16];
function Baloncuk({ c, ps }: { c: Community; ps: P[] }) {
  const n = ps.length;
  const k = n > 10 ? 0.62 : n > 6 ? 0.78 : 1;
  return (
    <div className={cx('sd sd-bubbles', n > 6 && 'many')}>
      {ps.map((p, i) => {
        const size = Math.round((p.talk ? 236 : p.m.muted || p.m.deaf ? 128 : 166) * k);
        return (
          <div
            key={p.key}
            className={cx('sd-bub', p.talk && 'talk', p.demo && 'demo')}
            style={{ ['--s' as any]: `${size}px`, ['--y' as any]: `${Math.round(BUB_Y[i % BUB_Y.length] * k)}px`, animationDelay: `${-((i * 1.7) % 7)}s` }}
            {...handlers(c, p)}
          >
            <span className="sd-bub-ball">
              <Back p={p} />
              <span className="sd-shade" />
              <Avatar user={p.user} size={Math.round(size * 0.42)} speaking={p.talk} />
              <Flags p={p} />
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
  if (!ps.length) return null;
  if (layout === 'akordeon') return <Akordeon c={c} ps={ps} />;
  return <Baloncuk c={c} ps={ps} />;
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
