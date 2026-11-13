// Sesli kanallar: WebRTC eşler arası (mesh) ses; sinyalleşme kovan sunucusu üzerinden.
import { create } from 'zustand';
import type { ID, VoiceMember } from '../../shared/protocol';
import { useStore, voiceHooks, cmd, toast } from './store';
import { playSound } from './sound';

interface VoiceState {
  ch: ID | null;
  cid: ID | null;
  state: 'idle' | 'connecting' | 'connected';
  muted: boolean;
  deaf: boolean;
  speaking: Record<ID, boolean>;
  noMic: boolean;
  ping: number | null;
}

export const useVoice = create<VoiceState>(() => ({ ch: null, cid: null, state: 'idle', muted: false, deaf: false, speaking: {}, noMic: false, ping: null }));
const V = () => useVoice.getState();
const setV = useVoice.setState;

interface Peer {
  pc: RTCPeerConnection;
  uid: ID;
  audio: HTMLAudioElement;
  queue: RTCIceCandidateInit[];
  analyser?: AnalyserNode;
}

const ICE: RTCConfiguration = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
let local: MediaStream | null = null;
let localAnalyser: AnalyserNode | null = null;
let mySid: ID | null = null;
let host: string | null = null;
let actx: AudioContext | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;
const peers = new Map<ID, Peer>();
let lastMembers = new Set<ID>();

function audioCtx() {
  actx ||= new AudioContext();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function analyse(stream: MediaStream): AnalyserNode | undefined {
  try {
    const ctx = audioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    return an;
  } catch {
    return undefined;
  }
}

const buf = new Uint8Array(512);
function level(an: AnalyserNode) {
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < an.fftSize; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / an.fftSize);
}

function startMeter() {
  if (meterTimer) return;
  meterTimer = setInterval(() => {
    const me = useStore.getState().me.id;
    const next: Record<ID, boolean> = {};
    const v = V();
    if (localAnalyser && !v.muted && !v.deaf) next[me] = level(localAnalyser) > 0.02;
    for (const p of peers.values()) if (p.analyser) next[p.uid] = level(p.analyser) > 0.02;
    const cur = v.speaking;
    const keys = new Set([...Object.keys(cur), ...Object.keys(next)]);
    for (const k of keys)
      if (!!cur[k] !== !!next[k]) {
        setV({ speaking: next });
        break;
      }
  }, 120);
}

function signal(to: ID, data: unknown) {
  const ch = V().ch;
  if (ch) cmd(ch, { t: 'vc.signal', to, data });
}

function applyTracks() {
  const { muted, deaf } = V();
  local?.getAudioTracks().forEach((t) => (t.enabled = !muted && !deaf));
  for (const p of peers.values()) p.audio.muted = deaf;
}

async function createPeer(sid: ID, uid: ID, initiator: boolean): Promise<Peer> {
  const pc = new RTCPeerConnection(ICE);
  const audio = new Audio();
  audio.autoplay = true;
  const speaker = useStore.getState().settings.speakerId;
  if (speaker && speaker !== 'default' && 'setSinkId' in audio) (audio as any).setSinkId(speaker).catch(() => {});
  const peer: Peer = { pc, uid, audio, queue: [] };
  peers.set(sid, peer);
  if (local) for (const t of local.getAudioTracks()) pc.addTrack(t, local);
  else pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.onicecandidate = (e) => e.candidate && signal(sid, { ice: e.candidate.toJSON() });
  pc.ontrack = (e) => {
    const stream = e.streams[0] || new MediaStream([e.track]);
    audio.srcObject = stream;
    audio.muted = V().deaf;
    audio.play().catch(() => {});
    peer.analyser = analyse(stream);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      // yeniden müzakere dene
      if (initiator) pc.restartIce();
    }
  };
  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal(sid, { sdp: pc.localDescription });
  }
  return peer;
}

function closePeer(sid: ID) {
  const p = peers.get(sid);
  if (!p) return;
  p.pc.close();
  p.audio.srcObject = null;
  peers.delete(sid);
}

voiceHooks.onYou = (h, sid) => {
  if (h !== host) return;
  mySid = sid;
  setV({ state: 'connected' });
  const ch = V().ch;
  const members = ch ? useStore.getState().voice[ch] || [] : [];
  syncRoom(members);
};

voiceHooks.onRoom = (h, ch, members) => {
  if (h !== host || ch !== V().ch || !mySid) return;
  syncRoom(members);
};

function syncRoom(members: VoiceMember[]) {
  const ids = new Set(members.map((m) => m.sessionId));
  if (!ids.has(mySid!)) return;
  for (const m of members) {
    if (m.sessionId === mySid || peers.has(m.sessionId)) continue;
    createPeer(m.sessionId, m.userId, mySid! < m.sessionId).catch(() => {});
  }
  for (const sid of [...peers.keys()]) if (!ids.has(sid)) closePeer(sid);
  // başkası girdi/çıktı sesi
  if (useStore.getState().settings.sounds) {
    const joined = [...ids].some((x) => !lastMembers.has(x) && x !== mySid);
    const left = [...lastMembers].some((x) => !ids.has(x));
    if (lastMembers.size && joined) playSound('join', 0.08);
    else if (left) playSound('leave', 0.08);
  }
  lastMembers = ids;
}

voiceHooks.onSignal = async (h, from, data: any) => {
  if (h !== host || !V().ch) return;
  let p = peers.get(from);
  if (!p) {
    const vm = (useStore.getState().voice[V().ch!] || []).find((m) => m.sessionId === from);
    p = await createPeer(from, vm?.userId || '', false);
  }
  const pc = p.pc;
  try {
    if (data?.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        signal(from, { sdp: pc.localDescription });
      }
      for (const c of p.queue.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if (data?.ice) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.ice).catch(() => {});
      else p.queue.push(data.ice);
    }
  } catch {
    /* müzakere hatası */
  }
};

export async function joinVoice(cid: ID, ch: ID) {
  if (V().ch === ch) return;
  if (V().ch) leaveVoice(true);
  const st = useStore.getState();
  host = st.commHost[cid] || null;
  if (!host) return;
  setV({ ch, cid, state: 'connecting', speaking: {} });
  mySid = null;
  lastMembers = new Set();
  try {
    const s = st.settings;
    local = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: s.micId && s.micId !== 'default' ? { ideal: s.micId } : undefined,
        echoCancellation: true,
        noiseSuppression: s.noiseSuppression,
        autoGainControl: true,
      },
      video: false,
    });
    localAnalyser = analyse(local) || null;
    setV({ noMic: false });
  } catch {
    local = null;
    setV({ noMic: true });
    toast('Mikrofona erişilemedi; sadece dinleyici olarak bağlandın.', 'err');
  }
  applyTracks();
  startMeter();
  const { muted, deaf } = V();
  cmd(ch, { t: 'vc.join', ch, muted: muted || !local, deaf });
  if (st.settings.sounds) playSound('join');
}

export function leaveVoice(silent = false) {
  const ch = V().ch;
  if (!ch) return;
  cmd(ch, { t: 'vc.leave' });
  for (const sid of [...peers.keys()]) closePeer(sid);
  local?.getTracks().forEach((t) => t.stop());
  local = null;
  localAnalyser = null;
  mySid = null;
  host = null;
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  setV({ ch: null, cid: null, state: 'idle', speaking: {} });
  if (!silent && useStore.getState().settings.sounds) playSound('leave');
}

export function toggleMute() {
  const { muted, deaf } = V();
  if (deaf) setV({ deaf: false, muted: false });
  else setV({ muted: !muted });
  applyTracks();
  pushState();
  if (useStore.getState().settings.sounds) playSound(V().muted ? 'mute' : 'unmute');
}

export function toggleDeaf() {
  const { deaf } = V();
  setV({ deaf: !deaf, muted: !deaf ? true : false });
  applyTracks();
  pushState();
  if (useStore.getState().settings.sounds) playSound(V().deaf ? 'mute' : 'unmute');
}

function pushState() {
  const { ch, muted, deaf } = V();
  if (ch) cmd(ch, { t: 'vc.state', muted: muted || !local, deaf });
}

// bağlantı koparsa sesten düş
useStore.subscribe((s, prev) => {
  if (!host || !V().ch) return;
  if (prev.conns[host]?.status === 'online' && s.conns[host]?.status !== 'online') {
    toast('Ses bağlantısı koptu.', 'err');
    leaveVoice(true);
  }
});
