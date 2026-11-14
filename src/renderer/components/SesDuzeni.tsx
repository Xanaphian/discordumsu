// Ses odası ana görünümü için deneme düzenleri (seçim turu): 1 Sahne, 2 Lobi dizilişi, 3 Yuvarlak masa, 4 Kadro listesi, 5 Mozaik.
import React, { useMemo, useRef } from 'react';
import { create } from 'zustand';
import { MicOff, HeadphoneOff, Volume1, VolumeX } from 'lucide-react';
import { useStore, openMenu } from '../lib/store';
import { useVoice, setUserVolume } from '../lib/voice';
import { Avatar } from './Common';
import { cx, displayName } from '../lib/util';
import { memberMenu } from './Moderation';
import { insertMention } from './Members';
import { bannerBackground } from './profile/look';
import type { ProfileExtra } from '../../shared/profile';
import type { Channel, Community, ID, VoiceMember } from '../../shared/protocol';

export const DESIGNS = ['', 'Sahne', 'Lobi dizilişi', 'Yuvarlak masa', 'Kadro listesi', 'Mozaik'] as const;

const read = () => {
  try {
    return Number(localStorage.getItem('vvDesign')) || 0;
  } catch {
    return 0;
  }
};
export const useVvDesign = create<{ n: number }>(() => ({ n: read() }));
export function setVvDesign(n: number) {
  try {
    localStorage.setItem('vvDesign', String(n));
  } catch {
    /* yok say */
  }
  useVvDesign.setState({ n });
}
(window as any).__vvDesign = setVvDesign;
/** Ekran görüntüsü için konuşma durumunu elle ayarlama (yalnız deneme) */
const useFakeSpeak = create<{ m: Record<string, boolean> | null }>(() => ({ m: null }));
(window as any).__fakeSpeak = (m: Record<string, boolean> | null) => useFakeSpeak.setState({ m });

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
}

function usePeople(c: Community, people: Person[]): P[] {
  const users = useStore((s) => s.users);
  const meExtra = useStore((s) => (s.me as { extra?: ProfileExtra }).extra);
  const real = useVoice((s) => s.speaking);
  const fake = useFakeSpeak((s) => s.m);
  const speaking = fake ? { ...real, ...fake } : real;
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
    [people, users, meExtra, real, fake, c],
  );
}

function handlers(c: Community, p: P) {
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
function Back({ p, className }: { p: P; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  if (p.stream) {
    return (
      <video
        className={cx('sd-back', className)}
        autoPlay
        playsInline
        muted
        ref={(v) => {
          (ref as any).current = v;
          if (v && v.srcObject !== p.stream) {
            v.srcObject = p.stream!;
            v.play().catch(() => {});
          }
        }}
      />
    );
  }
  if (p.img) return <img className={cx('sd-back', className)} src={p.img} alt="" draggable={false} style={{ objectPosition: `${p.fx}% ${p.fy}%` }} />;
  return <span className={cx('sd-back', className)} style={{ background: bannerBackground(p.prof?.banner, p.color) }} />;
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

/** Konuşurken oynayan ince ses çubukları */
function Bars({ on }: { on: boolean }) {
  return (
    <span className={cx('sd-bars', on && 'on')} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

// ---------------------------------------------------------------- 1: Sahne
function Sahne({ c, ps }: { c: Community; ps: P[] }) {
  const last = useRef<ID | null>(null);
  const talker = ps.find((p) => p.talk);
  if (talker) last.current = talker.uid;
  const hero = ps.find((p) => p.uid === last.current) || ps[0];
  const rest = ps.filter((p) => p !== hero);
  return (
    <div className="sd sd-sahne">
      <div className={cx('sd-hero', hero.talk && 'talk')} {...handlers(c, hero)}>
        <Back p={hero} />
        <span className="sd-shade" />
        <div className="sd-hero-info">
          <Avatar user={hero.user} size={112} speaking={hero.talk} />
          <div>
            <b>{hero.name}</b>
            <span className="sd-sub">
              <Bars on={hero.talk} /> {stateText(hero)}
            </span>
          </div>
        </div>
        <span className="sd-hero-tag">SAHNEDE</span>
      </div>
      {rest.length > 0 && (
        <div className="sd-row">
          {rest.map((p) => (
            <div key={p.key} className={cx('sd-mini', p.talk && 'talk')} {...handlers(c, p)}>
              <Back p={p} />
              <span className="sd-shade" />
              <Avatar user={p.user} size={48} speaking={p.talk} />
              <span className="sd-name">{p.name}</span>
              <Flags p={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 2: Lobi dizilişi
function Lobi({ c, ps }: { c: Community; ps: P[] }) {
  return (
    <div className="sd sd-lobi" style={{ ['--n' as any]: ps.length }}>
      {ps.map((p, i) => (
        <div key={p.key} className={cx('sd-tall', p.talk && 'talk', p.me && 'me')} style={{ ['--i' as any]: i }} {...handlers(c, p)}>
          <Back p={p} />
          <span className="sd-shade" />
          <div className="sd-tall-foot">
            <Avatar user={p.user} size={84} speaking={p.talk} />
            <b>{p.name}</b>
            <span className="sd-sub">
              {p.m.deaf ? <HeadphoneOff size={13} /> : p.m.muted ? <MicOff size={13} /> : p.talk ? <Bars on /> : null}
              {stateText(p)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 3: Yuvarlak masa
function Masa({ c, ch, ps }: { c: Community; ch: Channel; ps: P[] }) {
  const n = ps.length;
  return (
    <div className="sd sd-masa">
      <div className="sd-table">
        {ch.banner && <img className="sd-table-img" src={ch.banner} alt="" />}
        <span className="sd-table-name">{ch.name}</span>
        <span className="sd-table-sub">{n} kişi masada</span>
        {ps.some((p) => p.talk) && (
          <span className="sd-table-talk">
            <Bars on /> {ps.filter((p) => p.talk).map((p) => p.name).join(', ')} konuşuyor
          </span>
        )}
      </div>
      {ps.map((p, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        return (
          <div
            key={p.key}
            className={cx('sd-seat', p.talk && 'talk')}
            style={{ left: `${50 + Math.cos(a) * 38}%`, top: `${50 + Math.sin(a) * 36}%` }}
            {...handlers(c, p)}
          >
            <span className="sd-seat-av">
              <Avatar user={p.user} size={92} speaking={p.talk} />
              <Flags p={p} />
            </span>
            <span className="sd-plate">
              <Back p={p} />
              <span className="sd-shade" />
              <b>{p.name}</b>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- 4: Kadro listesi
function RowVolume({ uid }: { uid: ID }) {
  const vol = useStore((s) => s.settings.userVolumes[uid] ?? 100);
  return (
    <label className="sd-vol" onClick={(e) => e.stopPropagation()}>
      {vol === 0 ? <VolumeX size={14} /> : <Volume1 size={14} />}
      <input type="range" min={0} max={200} step={5} value={vol} onChange={(e) => setUserVolume(uid, +e.target.value)} />
    </label>
  );
}
function Kadro({ c, ch, ps }: { c: Community; ch: Channel; ps: P[] }) {
  return (
    <div className="sd sd-kadro">
      <div className="sd-kadro-head">
        <span>{ch.name}</span>
        <i>{ps.length} kişi</i>
      </div>
      {ps.map((p) => (
        <div key={p.key} className={cx('sd-line', p.talk && 'talk')} {...handlers(c, p)}>
          <span className="sd-line-art">
            <Back p={p} />
          </span>
          <span className="sd-line-fade" />
          <Avatar user={p.user} size={60} speaking={p.talk} />
          <div className="sd-line-txt">
            <b>
              {p.name}
              {p.me && <em>sen</em>}
            </b>
            <span className="sd-sub">{stateText(p)}</span>
          </div>
          <span className="grow" />
          {!p.me && <RowVolume uid={p.uid} />}
          {p.talk && <Bars on />}
          <Flags p={p} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 5: Mozaik
function Mozaik({ c, ps }: { c: Community; ps: P[] }) {
  return (
    <div className={cx('sd sd-mozaik', 'k' + Math.min(ps.length, 6))}>
      {ps.map((p, i) => (
        <div key={p.key} className={cx('sd-tile', 'a' + i, p.talk && 'talk')} {...handlers(c, p)}>
          <Back p={p} />
          <span className="sd-shade" />
          <div className="sd-tile-foot">
            <Avatar user={p.user} size={i === 0 ? 76 : 46} speaking={p.talk} />
            <b>{p.name}</b>
            <Flags p={p} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DesignStage({ c, ch, n, people }: { c: Community; ch: Channel; n: number; people: Person[] }) {
  const ps = usePeople(c, people);
  if (!ps.length) return null;
  if (n === 1) return <Sahne c={c} ps={ps} />;
  if (n === 2) return <Lobi c={c} ps={ps} />;
  if (n === 3) return <Masa c={c} ch={ch} ps={ps} />;
  if (n === 4) return <Kadro c={c} ch={ch} ps={ps} />;
  return <Mozaik c={c} ps={ps} />;
}
