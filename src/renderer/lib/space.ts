// 3D odalar: avatar durumu ve sunucu ile konuşma.
// Yüksek frekanslı hareket verisi React durumuna girmez; sahne doğrudan `live` üzerinden okur.
import { create } from 'zustand';
import type { AvatarLook, Booth, ID, ServerFrame, SpaceAvatar } from '../../shared/protocol';
import { useStore, spaceHooks, cmd, toast } from './store';
import { useVoice, joinVoice, leaveVoice, setSpatialMode } from './voice';
import { playSound } from './sound';

export interface RosterEntry {
  sid: ID;
  userId: ID;
  look: AvatarLook;
}

export interface SayLine {
  id: number;
  sid: ID;
  uid: ID;
  text: string;
  ts: number;
}

interface SpaceState {
  ch: ID | null;
  cid: ID | null;
  status: 'idle' | 'joining' | 'in';
  you: ID | null;
  roster: Record<ID, RosterEntry>;
  booths: Booth[];
  log: SayLine[];
}

export const useSpace = create<SpaceState>(() => ({ ch: null, cid: null, status: 'idle', you: null, roster: {}, booths: [], log: [] }));
const SP = () => useSpace.getState();
const setSP = useSpace.setState;

export type SpaceEvent =
  | { k: 'snap' }
  | { k: 'add'; sid: ID }
  | { k: 'del'; sid: ID }
  | { k: 'say'; sid: ID; text: string }
  | { k: 'emote'; sid: ID; e: string }
  | { k: 'look'; sid: ID }
  | { k: 'booths' };

/** Sahnenin her karede okuduğu canlı avatar verisi */
export const live = {
  avatars: new Map<ID, SpaceAvatar & { at: number }>(),
  listeners: new Set<(e: SpaceEvent) => void>(),
  emit(e: SpaceEvent) {
    for (const l of this.listeners) l(e);
  },
};

let host: string | null = null;
let lineId = 0;

export function myLook(): AvatarLook {
  const st = useStore.getState();
  return { color: st.settings.avatarColor || st.me.color || '#f5a524', hat: st.settings.avatarHat || 'antenna' };
}

spaceHooks.onFrame = (h, f: ServerFrame) => {
  if (h !== host || SP().status === 'idle') return;
  switch (f.t) {
    case 'sp.snap': {
      if (f.ch !== SP().ch) return;
      live.avatars.clear();
      const roster: Record<ID, RosterEntry> = {};
      const now = performance.now();
      for (const a of f.avatars) {
        live.avatars.set(a.sid, { ...a, at: now });
        roster[a.sid] = { sid: a.sid, userId: a.userId, look: a.look };
      }
      setSP({ status: 'in', you: f.you, roster, booths: f.booths });
      live.emit({ k: 'snap' });
      return;
    }
    case 'sp.add':
      live.avatars.set(f.av.sid, { ...f.av, at: performance.now() });
      setSP((s) => ({ roster: { ...s.roster, [f.av.sid]: { sid: f.av.sid, userId: f.av.userId, look: f.av.look } } }));
      live.emit({ k: 'add', sid: f.av.sid });
      if (useStore.getState().settings.sounds) playSound('join', 0.05);
      return;
    case 'sp.del': {
      live.avatars.delete(f.sid);
      setSP((s) => {
        const roster = { ...s.roster };
        delete roster[f.sid];
        return { roster };
      });
      live.emit({ k: 'del', sid: f.sid });
      return;
    }
    case 'sp.mv': {
      const a = live.avatars.get(f.sid);
      if (!a) return;
      a.x = f.x;
      a.z = f.z;
      a.ry = f.ry;
      a.a = f.a;
      a.at = performance.now();
      return;
    }
    case 'sp.say': {
      const r = SP().roster[f.sid];
      const line: SayLine = { id: ++lineId, sid: f.sid, uid: r?.userId || '', text: f.text, ts: Date.now() };
      setSP((s) => ({ log: [...s.log.slice(-49), line] }));
      live.emit({ k: 'say', sid: f.sid, text: f.text });
      return;
    }
    case 'sp.emote':
      live.emit({ k: 'emote', sid: f.sid, e: f.e });
      return;
    case 'sp.booths':
      setSP({ booths: f.booths });
      live.emit({ k: 'booths' });
      return;
    case 'sp.look': {
      const a = live.avatars.get(f.sid);
      if (a) a.look = f.look;
      setSP((s) => (s.roster[f.sid] ? { roster: { ...s.roster, [f.sid]: { ...s.roster[f.sid], look: f.look } } } : {}));
      live.emit({ k: 'look', sid: f.sid });
      return;
    }
  }
};

export async function enterSpace(cid: ID, ch: ID) {
  const st = useStore.getState();
  if (SP().ch === ch && SP().status !== 'idle') return;
  if (SP().ch) exitSpace(true);
  host = st.commHost[cid] || null;
  if (!host || st.conns[host]?.status !== 'online') {
    toast('Bu topluluğun sunucusuna bağlı değilsin.', 'err');
    return;
  }
  live.avatars.clear();
  setSP({ ch, cid, status: 'joining', you: null, roster: {}, booths: [], log: [] });
  cmd(ch, { t: 'sp.join', ch, look: myLook() });
  // ses: aynı kanalın ses odasına konumsal modda katıl (mikrofon izni burada istenir)
  await joinVoice(cid, ch);
  setSpatialMode(true);
}

export function exitSpace(silent = false) {
  const ch = SP().ch;
  if (!ch) return;
  cmd(ch, { t: 'sp.leave' });
  live.avatars.clear();
  live.emit({ k: 'snap' });
  setSP({ ch: null, cid: null, status: 'idle', you: null, roster: {}, booths: [], log: [] });
  host = null;
  if (useVoice.getState().ch === ch) leaveVoice(silent);
}

let lastSent = { x: NaN, z: NaN, ry: NaN, a: -1, t: 0 };
/** Sahne kendi avatarının konumunu buradan bildirir (en fazla ~15/sn) */
export function sendMove(x: number, z: number, ry: number, a: number) {
  const s = SP();
  if (s.status !== 'in' || !s.ch) return;
  const me = s.you && live.avatars.get(s.you);
  if (me) Object.assign(me, { x, z, ry, a });
  const now = performance.now();
  const changed = Math.abs(x - lastSent.x) > 0.01 || Math.abs(z - lastSent.z) > 0.01 || Math.abs(ry - lastSent.ry) > 0.02 || a !== lastSent.a;
  if (!changed || (now - lastSent.t < 66 && a === lastSent.a)) return;
  lastSent = { x, z, ry, a, t: now };
  const r = (v: number) => Math.round(v * 100) / 100;
  cmd(s.ch, { t: 'sp.move', x: r(x), z: r(z), ry: r(ry), a });
}

export function say(text: string) {
  const s = SP();
  const t = text.trim();
  if (!t || !s.ch || s.status !== 'in') return;
  cmd(s.ch, { t: 'sp.say', text: t.slice(0, 200) });
}

export function emote(e: string) {
  const s = SP();
  if (!s.ch || s.status !== 'in') return;
  cmd(s.ch, { t: 'sp.emote', e });
}

export function setBooth(i: number, text: string | null) {
  const s = SP();
  if (!s.ch || s.status !== 'in') return;
  cmd(s.ch, { t: 'sp.booth', i, text });
}

export function pushLook() {
  const s = SP();
  if (!s.ch || s.status !== 'in') return;
  cmd(s.ch, { t: 'sp.look', look: myLook() });
}

// ses bağlantısı başka yerden kesilirse (panel, bağlantı kopması) odadan da çık
useVoice.subscribe((v, prev) => {
  const ch = SP().ch;
  if (ch && prev.ch === ch && v.ch !== ch) exitSpace(true);
});
// sunucu bağlantısı koparsa
useStore.subscribe((s, prev) => {
  if (!host || !SP().ch) return;
  if (prev.conns[host]?.status === 'online' && s.conns[host]?.status !== 'online') exitSpace(true);
});
