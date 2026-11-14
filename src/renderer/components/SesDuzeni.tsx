// Ses odası ana görünümü için deneme düzenleri (seçim turu): 1 Sahne, 2 Lobi dizilişi, 3 Yuvarlak masa, 4 Kadro listesi, 5 Mozaik.
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

export const DESIGNS = ['', 'Sahne', 'Lobi dizilişi', 'Yuvarlak masa', 'Kadro listesi', 'Mozaik', 'Podyum', 'Vitrin', 'Ekolayzır', 'Pano', 'Yörünge', 'Akordeon', 'Baloncuklar', 'Madalyon kemeri', 'Konuşma akışı', 'Yalın'] as const;

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
  if (n === 5) return <Mozaik c={c} ps={ps} />;
  if (n === 6) return <Podyum c={c} ps={ps} />;
  if (n === 7) return <Vitrin c={c} ps={ps} />;
  if (n === 8) return <Ekolayzir c={c} ps={ps} />;
  if (n === 9) return <Pano c={c} ps={ps} />;
  if (n === 10) return <Yorunge c={c} ps={ps} />;
  if (n === 11) return <Akordeon c={c} ps={ps} />;
  if (n === 12) return <Baloncuk c={c} ps={ps} />;
  if (n === 13) return <Madalyon c={c} ps={ps} />;
  if (n === 14) return <Akis c={c} ps={ps} />;
  return <Yalin c={c} ps={ps} />;
}

/** Son konuşan (yoksa ilk kişi): Sahne, Vitrin, Yörünge, Yalın kullanır */
function useHero(ps: P[]) {
  const last = useRef<ID | null>(null);
  const talker = ps.find((p) => p.talk);
  if (talker) last.current = talker.uid;
  return ps.find((p) => p.uid === last.current) || ps[0];
}

// ---------------------------------------------------------------- 6: Podyum
function Podyum({ c, ps }: { c: Community; ps: P[] }) {
  const on = ps.filter((p) => !p.m.muted && !p.m.deaf);
  const off = ps.filter((p) => p.m.muted || p.m.deaf);
  return (
    <div className="sd sd-podyum">
      <div className="sd-pod-label">
        Mikrofonu açık <i>{on.length}</i>
      </div>
      <div className="sd-pod-stage">
        {on.map((p) => (
          <div key={p.key} className={cx('sd-pod-card', p.talk && 'talk')} {...handlers(c, p)}>
            <Back p={p} />
            <span className="sd-shade" />
            <Avatar user={p.user} size={92} speaking={p.talk} />
            <b>{p.name}</b>
            <span className="sd-sub">
              {p.talk && <Bars on />} {stateText(p)}
            </span>
          </div>
        ))}
      </div>
      <div className="sd-pod-floor" />
      <div className="sd-pod-label">
        Dinleyenler <i>{off.length}</i>
      </div>
      <div className="sd-pod-crowd">
        {off.map((p) => (
          <div key={p.key} className="sd-pod-seat" {...handlers(c, p)}>
            <span className="sd-seat-av">
              <Avatar user={p.user} size={64} />
              <Flags p={p} />
            </span>
            <span>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 7: Vitrin
function Vitrin({ c, ps }: { c: Community; ps: P[] }) {
  const hero = useHero(ps);
  const rest = ps.filter((p) => p !== hero);
  // kahraman ortada, diğerleri sırayla sağa ve sola
  const order: [P, number][] = [[hero, 0]];
  rest.forEach((p, i) => order.push([p, i % 2 === 0 ? Math.floor(i / 2) + 1 : -(Math.floor(i / 2) + 1)]));
  return (
    <div className="sd sd-vitrin">
      {order.map(([p, d]) => (
        <div
          key={p.key}
          className={cx('sd-vit', d === 0 && 'front', p.talk && 'talk')}
          style={{
            transform: `translate(-50%, -50%) translateX(${d * 210}px) rotateY(${-Math.sign(d) * 32}deg) scale(${1 - Math.abs(d) * 0.13})`,
            zIndex: 10 - Math.abs(d),
            opacity: 1 - Math.abs(d) * 0.12,
          }}
          {...handlers(c, p)}
        >
          <Back p={p} />
          <span className="sd-shade" />
          <div className="sd-vit-foot">
            <Avatar user={p.user} size={d === 0 ? 96 : 64} speaking={p.talk} />
            <b>{p.name}</b>
            <span className="sd-sub">
              {p.talk && <Bars on />}
              {stateText(p)}
            </span>
          </div>
        </div>
      ))}
      <div className="sd-vit-floor" />
    </div>
  );
}

// ---------------------------------------------------------------- 8: Ekolayzır
function Ekolayzir({ c, ps }: { c: Community; ps: P[] }) {
  return (
    <div className="sd sd-eq">
      {ps.map((p) => {
        const lvl = p.talk ? 88 : p.m.deaf ? 14 : p.m.muted ? 22 : 46;
        return (
          <div key={p.key} className={cx('sd-eq-col', p.talk && 'talk')} {...handlers(c, p)}>
            <div className="sd-eq-track">
              <div className="sd-eq-bar" style={{ height: `${lvl}%` }}>
                <Back p={p} />
                <span className="sd-eq-cap" />
              </div>
            </div>
            <Avatar user={p.user} size={58} speaking={p.talk} />
            <b>{p.name}</b>
            <span className="sd-sub">
              {p.m.deaf ? <HeadphoneOff size={13} /> : p.m.muted ? <MicOff size={13} /> : null}
              {stateText(p)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- 9: Pano
const PANO = [
  { x: 22, y: 30, r: -5 },
  { x: 50, y: 26, r: 3 },
  { x: 78, y: 32, r: -2 },
  { x: 35, y: 72, r: 4 },
  { x: 65, y: 70, r: -4 },
  { x: 86, y: 74, r: 2 },
];
function Pano({ c, ps }: { c: Community; ps: P[] }) {
  return (
    <div className="sd sd-pano">
      {ps.map((p, i) => {
        const at = PANO[i % PANO.length];
        return (
          <div
            key={p.key}
            className={cx('sd-photo', p.talk && 'talk')}
            style={{ left: `${at.x}%`, top: `${at.y}%`, transform: `translate(-50%, -50%) rotate(${p.talk ? 0 : at.r}deg)`, zIndex: p.talk ? 5 : 1 }}
            {...handlers(c, p)}
          >
            <span className="sd-tape" />
            <span className="sd-photo-pic">
              <Back p={p} />
              <span className="sd-photo-av">
                <Avatar user={p.user} size={70} speaking={p.talk} />
              </span>
            </span>
            <span className="sd-photo-cap">
              <b>{p.name}</b>
              <Flags p={p} />
              {p.talk && <Bars on />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- 10: Yörünge
function Yorunge({ c, ps }: { c: Community; ps: P[] }) {
  const hero = useHero(ps);
  const rest = ps.filter((p) => p !== hero);
  return (
    <div className="sd sd-orbit">
      <span className="sd-ring r1" />
      <span className="sd-ring r2" />
      <div className={cx('sd-sun', hero.talk && 'talk')} {...handlers(c, hero)}>
        <span className="sd-disc big">
          <Back p={hero} />
          <span className="sd-shade" />
          <Avatar user={hero.user} size={118} speaking={hero.talk} />
        </span>
        <b>{hero.name}</b>
        <span className="sd-sub">
          {hero.talk && <Bars on />}
          {stateText(hero)}
        </span>
      </div>
      {rest.map((p, i) => {
        const a = -Math.PI / 2 + Math.PI / 4 + (i / rest.length) * Math.PI * 2;
        return (
          <div key={p.key} className="sd-planet" style={{ left: `calc(50% + ${Math.cos(a) * 330}px)`, top: `calc(50% + ${Math.sin(a) * 230}px)` }} {...handlers(c, p)}>
            <span className="sd-disc">
              <Back p={p} />
              <span className="sd-shade" />
              <Avatar user={p.user} size={58} />
              <Flags p={p} />
            </span>
            <span className="sd-planet-name">{p.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- 11: Akordeon
function Akordeon({ c, ps }: { c: Community; ps: P[] }) {
  return (
    <div className="sd sd-akordeon">
      {ps.map((p) => (
        <div key={p.key} className={cx('sd-fold', p.talk && 'talk open')} {...handlers(c, p)}>
          <Back p={p} />
          <span className="sd-shade" />
          <div className="sd-fold-foot">
            <Avatar user={p.user} size={p.talk ? 96 : 56} speaking={p.talk} />
            <b>{p.name}</b>
            <span className="sd-sub">
              {p.talk && <Bars on />}
              {p.m.deaf ? <HeadphoneOff size={13} /> : p.m.muted ? <MicOff size={13} /> : null}
              {stateText(p)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 12: Baloncuklar
const BUB = [
  { x: 50, y: 46 },
  { x: 24, y: 34 },
  { x: 77, y: 30 },
  { x: 30, y: 76 },
  { x: 72, y: 74 },
  { x: 88, y: 56 },
];
function Baloncuk({ c, ps }: { c: Community; ps: P[] }) {
  // konuşan ortadaki en büyük balona geçer
  const sorted = [...ps].sort((a, b) => Number(b.talk) - Number(a.talk));
  return (
    <div className="sd sd-bubbles">
      {sorted.map((p, i) => {
        const size = p.talk ? 250 : p.m.muted || p.m.deaf ? 130 : 170;
        const at = BUB[i % BUB.length];
        return (
          <div
            key={p.key}
            className={cx('sd-bub', p.talk && 'talk')}
            style={{ left: `${at.x}%`, top: `${at.y}%`, ['--s' as any]: `${size}px`, animationDelay: `${-i * 1.7}s` }}
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

// ---------------------------------------------------------------- 13: Madalyon kemeri
function Madalyon({ c, ps }: { c: Community; ps: P[] }) {
  const n = ps.length;
  return (
    <div className="sd sd-madalyon">
      {ps.map((p, i) => {
        const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
        return (
          <div key={p.key} className={cx('sd-med', p.talk && 'talk')} style={{ transform: `translateY(${(t * t * 90 - 30).toFixed(0)}px)` }} {...handlers(c, p)}>
            <span className="sd-med-disc">
              <Back p={p} />
              <span className="sd-shade" />
            </span>
            <span className="sd-med-av">
              <Avatar user={p.user} size={74} speaking={p.talk} />
            </span>
            <b>{p.name}</b>
            <span className="sd-sub">
              {p.talk && <Bars on />}
              {p.m.deaf ? <HeadphoneOff size={13} /> : p.m.muted ? <MicOff size={13} /> : null}
              {stateText(p)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- 14: Konuşma akışı
const SPAN = 90_000; // son 90 saniye
const useTalkHist = create<{ h: Record<ID, [number, number | null][]> }>(() => ({ h: {} }));
(window as any).__seedTalk = (h: Record<ID, [number, number | null][]>) => {
  const now = Date.now();
  const out: Record<ID, [number, number | null][]> = {};
  for (const k in h) out[k] = h[k].map(([a, b]) => [now - a * 1000, b == null ? null : now - b * 1000]);
  useTalkHist.setState({ h: out });
};
function Akis({ c, ps }: { c: Community; ps: P[] }) {
  const hist = useTalkHist((s) => s.h);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  // canlı kayıt: konuşma başlayınca aralık aç, bitince kapat
  useEffect(() => {
    const h = { ...useTalkHist.getState().h };
    let changed = false;
    for (const p of ps) {
      const l = [...(h[p.uid] || [])];
      const open = l.length && l[l.length - 1][1] == null;
      if (p.talk && !open) (l.push([Date.now(), null]), (changed = true));
      if (!p.talk && open) ((l[l.length - 1] = [l[l.length - 1][0], Date.now()]), (changed = true));
      h[p.uid] = l.filter(([, b]) => b == null || Date.now() - b < SPAN);
    }
    if (changed) useTalkHist.setState({ h });
  }, [ps]);
  const x = (t: number) => Math.max(0, Math.min(100, 100 - ((now - t) / SPAN) * 100));
  return (
    <div className="sd sd-akis">
      <div className="sd-akis-axis">
        <span />
        <div>
          <i>90 sn önce</i>
          <i>60 sn</i>
          <i>30 sn</i>
          <i>şimdi</i>
        </div>
      </div>
      {ps.map((p) => {
        const total = (hist[p.uid] || []).reduce((s, [a, b]) => s + Math.max(0, (b ?? now) - Math.max(a, now - SPAN)), 0);
        return (
          <div key={p.key} className={cx('sd-akis-row', p.talk && 'talk')} {...handlers(c, p)}>
            <div className="sd-akis-who">
              <Avatar user={p.user} size={46} speaking={p.talk} />
              <div>
                <b>{p.name}</b>
                <span className="sd-sub">
                  {p.m.deaf ? <HeadphoneOff size={12} /> : p.m.muted ? <MicOff size={12} /> : null}
                  {Math.round(total / 1000)} sn konuştu
                </span>
              </div>
            </div>
            <div className="sd-akis-lane">
              <span className="sd-akis-art">
                <Back p={p} />
              </span>
              {(hist[p.uid] || []).map(([a, b], i) => (
                <span key={i} className={cx('sd-seg', b == null && 'live')} style={{ left: `${x(a)}%`, width: `${Math.max(0.6, x(b ?? now) - x(a))}%` }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- 15: Yalın
function Yalin({ c, ps }: { c: Community; ps: P[] }) {
  const hero = useHero(ps);
  return (
    <div className="sd sd-yalin">
      <span className="sd-yalin-bg">
        <Back p={hero} />
      </span>
      <div className="sd-yalin-list">
        {ps.map((p) => (
          <div key={p.key} className={cx('sd-yl', p.talk && 'talk', (p.m.muted || p.m.deaf) && 'dim')} {...handlers(c, p)}>
            <Avatar user={p.user} size={44} speaking={p.talk} />
            <b>{p.name}</b>
            {p.talk && <Bars on />}
            {p.m.deaf ? <HeadphoneOff size={18} className="sd-yl-off" /> : p.m.muted ? <MicOff size={18} className="sd-yl-off" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
