// Sesli kanallar: WebRTC eşler arası (mesh) ses, kamera ve ekran paylaşımı.
// Sinyalleşme kovan sunucusu üzerinden; "perfect negotiation" ile istediğin an görüntü ekleyip çıkarılabilir.
import { create } from 'zustand';
import type { ID, VoiceMember } from '../../shared/protocol';
import { useStore, voiceHooks, cmd, toast } from './store';
import { playSound } from './sound';

export interface RemoteMedia {
  cam?: MediaStream;
  screen?: MediaStream;
}

export interface ScreenOpts {
  sourceId: string;
  name: string;
  res: 720 | 1080 | 1440 | 2160 | 0;
  fps: 15 | 30 | 60;
  hint: 'motion' | 'detail';
  audio: boolean;
}

interface VoiceState {
  ch: ID | null;
  cid: ID | null;
  state: 'idle' | 'connecting' | 'connected';
  muted: boolean;
  deaf: boolean;
  speaking: Record<ID, boolean>;
  noMic: boolean;
  ping: number | null;
  /** kendi kameram (önizleme için) */
  cam: MediaStream | null;
  /** kendi ekran yayınım */
  screen: MediaStream | null;
  screenLabel: string | null;
  /** uzak görüntüler: oturum kimliği → akışlar */
  media: Record<ID, RemoteMedia>;
  /** bas-konuş tuşu basılı mı */
  ptt: boolean;
}

export const useVoice = create<VoiceState>(() => ({
  ch: null,
  cid: null,
  state: 'idle',
  muted: false,
  deaf: false,
  speaking: {},
  noMic: false,
  ping: null,
  cam: null,
  screen: null,
  screenLabel: null,
  media: {},
  ptt: false,
}));
const V = () => useVoice.getState();
const setV = useVoice.setState;
const ST = () => useStore.getState().settings;

interface RemoteAudio {
  el: HTMLAudioElement;
  src: MediaStreamAudioSourceNode;
  gain: GainNode;
  panner?: PannerNode;
  analyser?: AnalyserNode;
  kind: 'mic' | 'screen';
}

interface Peer {
  sid: ID;
  uid: ID;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  queue: RTCIceCandidateInit[];
  streams: Map<string, MediaStream>;
  audio: Map<string, RemoteAudio>;
  senders: { mic?: RTCRtpSender; cam?: RTCRtpSender; scrV?: RTCRtpSender; scrA?: RTCRtpSender };
  failTimer?: ReturnType<typeof setTimeout>;
}

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
  bundlePolicy: 'max-bundle',
  iceCandidatePoolSize: 2,
};

let mySid: ID | null = null;
let host: string | null = null;
let actx: AudioContext | null = null;
let master: GainNode | null = null;
let loopTimer: ReturnType<typeof setInterval> | null = null;
const peers = new Map<ID, Peer>();
let lastMembers = new Set<ID>();

// ---- mikrofon hattı: ham mikrofon → giriş kazancı → kapı (VAD / bas-konuş) → gönderilen iz
let rawMic: MediaStream | null = null;
let micSrc: MediaStreamAudioSourceNode | null = null;
let inGain: GainNode | null = null;
let gate: GainNode | null = null;
let micAnalyser: AnalyserNode | null = null;
let micDest: MediaStreamAudioDestinationNode | null = null;
let local: MediaStream | null = null; // gönderilen ses akışı
let gateOpen = false;
let lastLoud = 0;
let noiseFloor = 0.004;
let pttUntil = 0;

// ---- 3D oda (konumsal ses)
let spatialMode = false;
const lastPos = new Map<ID, { x: number; z: number; stage: boolean }>();
let listenerPos = { x: 0, z: 0 };

function audioCtx() {
  if (!actx) {
    actx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    master = actx.createGain();
    master.connect(actx.destination);
    applyOutput();
  }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}

function applyOutput() {
  if (!actx || !master) return;
  const s = ST();
  master.gain.setTargetAtTime(V().deaf ? 0 : s.outputVolume / 100, actx.currentTime, 0.02);
  const speaker = s.speakerId && s.speakerId !== 'default' ? s.speakerId : '';
  if ('setSinkId' in actx && (actx as any).sinkId !== speaker) (actx as any).setSinkId(speaker).catch(() => {});
  for (const p of peers.values())
    for (const a of p.audio.values()) a.gain.gain.setTargetAtTime(userGain(p.uid, a.kind), actx.currentTime, 0.03);
}

function userGain(uid: ID, kind: 'mic' | 'screen') {
  const v = ST().userVolumes[uid];
  const g = (v ?? 100) / 100;
  return kind === 'screen' ? g * 0.9 : g;
}

const buf = new Float32Array(2048);
function level(an: AnalyserNode) {
  const n = Math.min(an.fftSize, buf.length);
  an.getFloatTimeDomainData(buf.subarray(0, n));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / n);
}

/** VAD eşiği: ayar 0 ise ortam gürültüsüne göre otomatik */
function vadThreshold() {
  const t = ST().vadThreshold;
  if (t > 0) return 0.0015 * Math.pow(120, t / 100); // 0.0015 … 0.18 (logaritmik)
  return Math.max(0.008, noiseFloor * 2.8);
}

function startLoop() {
  if (loopTimer) return;
  let tick = 0;
  loopTimer = setInterval(() => {
    const v = V();
    const s = ST();
    const now = performance.now();
    // kapı
    let open = false;
    if (micAnalyser && !v.muted && !v.deaf && local) {
      const lv = level(micAnalyser);
      if (s.inputMode === 'ptt') open = v.ptt || now < pttUntil;
      else {
        // gürültü tabanını yavaşça takip et
        if (lv < noiseFloor * 3 || lv < 0.01) noiseFloor = noiseFloor * 0.995 + lv * 0.005;
        if (lv > vadThreshold()) lastLoud = now;
        open = now - lastLoud < 280;
      }
    }
    if (open !== gateOpen && gate && actx) {
      gateOpen = open;
      gate.gain.setTargetAtTime(open ? 1 : 0, actx.currentTime, open ? 0.004 : 0.04);
    }
    if (++tick % 3) return;
    // konuşma göstergeleri (~120 ms)
    const me = useStore.getState().me.id;
    const next: Record<ID, boolean> = {};
    if (gateOpen) next[me] = true;
    for (const p of peers.values())
      for (const a of p.audio.values()) if (a.kind === 'mic' && a.analyser && level(a.analyser) > 0.012) next[p.uid] = true;
    const cur = v.speaking;
    const keys = new Set([...Object.keys(cur), ...Object.keys(next)]);
    for (const k of keys)
      if (!!cur[k] !== !!next[k]) {
        setV({ speaking: next });
        break;
      }
  }, 40);
}

function signal(to: ID, data: unknown) {
  const ch = V().ch;
  if (ch) cmd(ch, { t: 'vc.signal', to, data });
}

/** Karşı tarafa giden SDP'de Opus'u yüksek kaliteye ayarla (karşı taraf bize bu kalitede gönderir) */
function mungeSdp(sdp: string) {
  const kbps = Math.max(16, Math.min(320, ST().voiceBitrate || 96));
  const pts = [...sdp.matchAll(/a=rtpmap:(\d+) opus\/48000\/2/g)].map((m) => m[1]);
  for (const pt of pts) {
    const re = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`, 'g');
    sdp = sdp.replace(re, (_m, params: string) => {
      const kv = new Map(params.split(';').filter(Boolean).map((x) => x.trim().split('=') as [string, string]));
      kv.set('minptime', '10');
      kv.set('useinbandfec', '1');
      kv.set('usedtx', '0');
      kv.set('stereo', '1');
      kv.set('sprop-stereo', '1');
      kv.set('maxplaybackrate', '48000');
      kv.set('maxaveragebitrate', String(kbps * 1000));
      return `a=fmtp:${pt} ` + [...kv].map(([k, v]) => `${k}=${v}`).join(';');
    });
  }
  return sdp;
}

const RES_W: Record<number, number> = { 360: 640, 720: 1280, 1080: 1920, 1440: 2560, 2160: 3840 };
function screenBitrate(res: number, fps: number) {
  const base = res >= 2160 || res === 0 ? 16_000_000 : res >= 1440 ? 9_000_000 : res >= 1080 ? 5_000_000 : 2_500_000;
  return Math.round(base * (fps >= 60 ? 1.5 : fps <= 15 ? 0.6 : 1));
}
function camBitrate(res: number, fps: number) {
  const base = res >= 1080 ? 3_500_000 : res >= 720 ? 1_800_000 : 600_000;
  return Math.round(base * (fps >= 60 ? 1.4 : 1));
}

function preferCodec(pc: RTCPeerConnection, sender: RTCRtpSender) {
  const tr = pc.getTransceivers().find((t) => t.sender === sender);
  const caps = RTCRtpReceiver.getCapabilities?.('video');
  if (!tr || !caps || !tr.setCodecPreferences) return;
  const pref = ST().videoCodec;
  const order = pref === 'auto' ? ['video/H264', 'video/VP9', 'video/VP8', 'video/AV1'] : ['video/' + pref.toUpperCase(), 'video/H264', 'video/VP8'];
  const rank = (c: RTCRtpCodec) => {
    const i = order.findIndex((m) => m.toLowerCase() === c.mimeType.toLowerCase());
    return i < 0 ? 99 : i;
  };
  try {
    tr.setCodecPreferences([...caps.codecs].sort((a, b) => rank(a) - rank(b)));
  } catch {
    /* desteklenmiyor */
  }
}

async function tuneSender(sender: RTCRtpSender | undefined, maxBitrate: number, maxFramerate?: number, degradation?: RTCDegradationPreference) {
  if (!sender) return;
  try {
    const p = sender.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    p.encodings[0].maxBitrate = maxBitrate;
    if (maxFramerate) p.encodings[0].maxFramerate = maxFramerate;
    if (degradation) (p as any).degradationPreference = degradation;
    (p.encodings[0] as any).networkPriority = 'high';
    (p.encodings[0] as any).priority = 'high';
    await sender.setParameters(p);
  } catch {
    /* bazı durumlarda müzakereden önce ayarlanamaz; bağlanınca tekrar denenir */
  }
}

let screenCfg: { res: number; fps: number; hint: 'motion' | 'detail' } | null = null;
function tunePeer(p: Peer) {
  const s = ST();
  tuneSender(p.senders.mic, Math.max(16, s.voiceBitrate) * 1000 + 8000);
  if (p.senders.cam) tuneSender(p.senders.cam, camBitrate(s.camRes, s.camFps), s.camFps, 'balanced');
  if (p.senders.scrV && screenCfg)
    tuneSender(p.senders.scrV, screenBitrate(screenCfg.res, screenCfg.fps), screenCfg.fps, screenCfg.hint === 'motion' ? 'maintain-framerate' : 'maintain-resolution');
  if (p.senders.scrA) tuneSender(p.senders.scrA, 160_000);
}

function addLocalVideo(p: Peer) {
  const cam = V().cam;
  if (cam && !p.senders.cam) {
    p.senders.cam = p.pc.addTrack(cam.getVideoTracks()[0], cam);
    preferCodec(p.pc, p.senders.cam);
  }
  const scr = V().screen;
  if (scr && !p.senders.scrV) {
    const vt = scr.getVideoTracks()[0];
    if (vt) {
      p.senders.scrV = p.pc.addTrack(vt, scr);
      preferCodec(p.pc, p.senders.scrV);
    }
    const at = scr.getAudioTracks()[0];
    if (at && !p.senders.scrA) p.senders.scrA = p.pc.addTrack(at, scr);
  }
  tunePeer(p);
}

function createPeer(sid: ID, uid: ID): Peer {
  const pc = new RTCPeerConnection(ICE);
  const p: Peer = { sid, uid, pc, polite: (mySid || '') > sid, makingOffer: false, ignoreOffer: false, queue: [], streams: new Map(), audio: new Map(), senders: {} };
  peers.set(sid, p);
  const mic = local?.getAudioTracks()[0];
  if (mic && local) p.senders.mic = pc.addTrack(mic, local);
  else pc.addTransceiver('audio', { direction: 'recvonly' });
  addLocalVideo(p);
  pc.onnegotiationneeded = async () => {
    try {
      p.makingOffer = true;
      await pc.setLocalDescription();
      if (pc.localDescription) signal(sid, { sdp: { type: pc.localDescription.type, sdp: mungeSdp(pc.localDescription.sdp) } });
    } catch {
      /* müzakere hatası */
    } finally {
      p.makingOffer = false;
    }
  };
  pc.onicecandidate = (e) => e.candidate && signal(sid, { ice: e.candidate.toJSON() });
  pc.ontrack = (e) => {
    const stream = e.streams[0] || new MediaStream([e.track]);
    p.streams.set(stream.id, stream);
    e.track.onunmute = () => classify(p);
    stream.onremovetrack = () => classify(p);
    classify(p);
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === 'connected') {
      clearTimeout(p.failTimer);
      tunePeer(p);
    } else if (st === 'failed') pc.restartIce();
    else if (st === 'disconnected') {
      // kısa kopmalarda bekle, uzun sürerse ICE'ı yenile
      clearTimeout(p.failTimer);
      p.failTimer = setTimeout(() => pc.connectionState === 'disconnected' && pc.restartIce(), 4000);
    }
  };
  return p;
}

function attachAudio(p: Peer, stream: MediaStream, kind: 'mic' | 'screen') {
  if (p.audio.has(stream.id) || !stream.getAudioTracks().length) return;
  const ctx = audioCtx();
  // Chromium: WebRTC akışı ancak bir medya öğesine bağlıyken WebAudio'ya akar; öğe sessizde
  const el = new Audio();
  el.muted = true;
  el.srcObject = stream;
  el.play().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain();
  gain.gain.value = userGain(p.uid, kind);
  const a: RemoteAudio = { el, src, gain, kind };
  if (kind === 'mic') {
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    a.analyser = an;
  }
  if (kind === 'mic' && spatialMode) {
    const panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'linear', refDistance: 1.6, maxDistance: 24, rolloffFactor: 1, positionY: 1.5 });
    src.connect(gain).connect(panner).connect(master!);
    a.panner = panner;
    const pos = lastPos.get(p.sid);
    if (pos) placeSource(a, pos.x, pos.z, pos.stage);
  } else src.connect(gain).connect(master!);
  p.audio.set(stream.id, a);
}

function detachAudio(a: RemoteAudio) {
  try {
    a.src.disconnect();
    a.gain.disconnect();
    a.panner?.disconnect();
  } catch {
    /* zaten kopuk */
  }
  a.el.srcObject = null;
}

/** Gelen akışları üye bilgisine göre ayır: mikrofon, kamera, ekran (+ses) */
function classify(p: Peer) {
  const ch = V().ch;
  const m = (ch && useStore.getState().voice[ch]?.find((x) => x.sessionId === p.sid)) || undefined;
  const ids = m?.streams || {};
  const media: RemoteMedia = {};
  for (const [id, s] of p.streams) {
    const live = s.getTracks().some((t) => t.readyState === 'live');
    if (!live) continue;
    const hasVideo = s.getVideoTracks().some((t) => t.readyState === 'live');
    if (id === ids.screen) {
      if (hasVideo && m?.screen) media.screen = s;
      attachAudio(p, s, 'screen');
    } else if (id === ids.cam) {
      if (hasVideo && m?.cam) media.cam = s;
    } else if (!hasVideo && (id === ids.mic || !ids.mic)) attachAudio(p, s, 'mic');
  }
  // kapanan ekran sesini temizle
  for (const [id, a] of p.audio)
    if (a.kind === 'screen' && (id !== ids.screen || !m?.screen)) {
      detachAudio(a);
      p.audio.delete(id);
    }
  const cur = V().media[p.sid];
  if (cur?.cam !== media.cam || cur?.screen !== media.screen) setV((s) => ({ media: { ...s.media, [p.sid]: media } }));
}

function closePeer(sid: ID) {
  const p = peers.get(sid);
  if (!p) return;
  clearTimeout(p.failTimer);
  p.pc.close();
  for (const a of p.audio.values()) detachAudio(a);
  peers.delete(sid);
  setV((s) => {
    if (!s.media[sid]) return {};
    const media = { ...s.media };
    delete media[sid];
    return { media };
  });
}

// ---------------------------------------------------------------- 3D oda
function placeSource(a: RemoteAudio, x: number, z: number, stage: boolean) {
  if (!a.panner || !actx) return;
  const t = actx.currentTime;
  // sahnedeki konuşmacı herkese mesafeden bağımsız, önden duyulur
  a.panner.positionX.setTargetAtTime(stage ? listenerPos.x : x, t, 0.06);
  a.panner.positionZ.setTargetAtTime(stage ? listenerPos.z - 0.5 : z, t, 0.06);
}

export function spatialListener(x: number, z: number, fx: number, fz: number) {
  if (!actx || !spatialMode) return;
  listenerPos = { x, z };
  const L = actx.listener;
  const t = actx.currentTime;
  if (L.positionX) {
    L.positionX.setTargetAtTime(x, t, 0.05);
    L.positionY.setTargetAtTime(1.5, t, 0.05);
    L.positionZ.setTargetAtTime(z, t, 0.05);
    L.forwardX.setTargetAtTime(fx, t, 0.05);
    L.forwardY.setTargetAtTime(0, t, 0.05);
    L.forwardZ.setTargetAtTime(fz, t, 0.05);
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  } else {
    (L as any).setPosition(x, 1.5, z);
    (L as any).setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

export function spatialSource(sid: ID, x: number, z: number, stage: boolean) {
  const prev = lastPos.get(sid);
  if (prev && prev.x === x && prev.z === z && prev.stage === stage && !stage) return;
  lastPos.set(sid, { x, z, stage });
  const p = peers.get(sid);
  if (p) for (const a of p.audio.values()) if (a.kind === 'mic') placeSource(a, x, z, stage);
}

export function setSpatialMode(on: boolean) {
  spatialMode = on;
  if (!on) lastPos.clear();
}

// ---------------------------------------------------------------- sinyal
voiceHooks.onYou = (h, sid) => {
  if (h !== host) return;
  mySid = sid;
  setV({ state: 'connected' });
  pushState();
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
    if (m.sessionId === mySid) continue;
    const p = peers.get(m.sessionId);
    if (p) classify(p);
    else createPeer(m.sessionId, m.userId);
  }
  for (const sid of [...peers.keys()]) if (!ids.has(sid)) closePeer(sid);
  if (ST().sounds) {
    const joined = [...ids].some((x) => !lastMembers.has(x) && x !== mySid);
    const left = [...lastMembers].some((x) => !ids.has(x));
    if (lastMembers.size && joined) playSound('join', 0.08);
    else if (left) playSound('leave', 0.08);
  }
  lastMembers = ids;
}

voiceHooks.onSignal = async (h, from, data: any) => {
  if (h !== host || !V().ch || !mySid) return;
  let p = peers.get(from);
  if (!p) {
    const vm = (useStore.getState().voice[V().ch!] || []).find((m) => m.sessionId === from);
    p = createPeer(from, vm?.userId || '');
  }
  const pc = p.pc;
  try {
    if (data?.sdp) {
      const desc = data.sdp as RTCSessionDescriptionInit;
      const collision = desc.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
      p.ignoreOffer = !p.polite && collision;
      if (p.ignoreOffer) return;
      await pc.setRemoteDescription(desc);
      if (desc.type === 'offer') {
        await pc.setLocalDescription();
        if (pc.localDescription) signal(from, { sdp: { type: pc.localDescription.type, sdp: mungeSdp(pc.localDescription.sdp) } });
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

// ---------------------------------------------------------------- mikrofon
async function openMic() {
  const s = ST();
  const ctx = audioCtx();
  const raw = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: s.micId && s.micId !== 'default' ? { exact: s.micId } : undefined,
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
      channelCount: 1,
      sampleRate: 48000,
    },
    video: false,
  });
  if (!inGain) {
    inGain = ctx.createGain();
    gate = ctx.createGain();
    gate.gain.value = 0;
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 1024;
    micDest = ctx.createMediaStreamDestination();
    micDest.channelCount = 1;
    inGain.connect(micAnalyser);
    inGain.connect(gate).connect(micDest);
    local = micDest.stream;
  }
  micSrc?.disconnect();
  rawMic?.getTracks().forEach((t) => t.stop());
  rawMic = raw;
  micSrc = ctx.createMediaStreamSource(raw);
  micSrc.connect(inGain);
  inGain.gain.value = s.inputVolume / 100;
  raw.getAudioTracks()[0].onended = () => {
    if (V().ch) toast('Mikrofon bağlantısı kesildi.', 'err');
  };
}

function closeMic() {
  micSrc?.disconnect();
  rawMic?.getTracks().forEach((t) => t.stop());
  try {
    inGain?.disconnect();
    gate?.disconnect();
  } catch {
    /* yok */
  }
  rawMic = micSrc = inGain = gate = micAnalyser = micDest = null;
  local = null;
  gateOpen = false;
}

/** Ayarlar değişince (cihaz, gürültü bastırma vb.) mikrofonu bağlantıyı koparmadan yeniden aç */
export async function restartMic() {
  if (!V().ch || !local) return;
  try {
    await openMic();
  } catch {
    toast('Mikrofon yeniden açılamadı.', 'err');
  }
}

function applyTracks() {
  const { muted, deaf } = V();
  local?.getAudioTracks().forEach((t) => (t.enabled = !muted && !deaf));
  applyOutput();
}

// ---------------------------------------------------------------- katıl / ayrıl
export async function joinVoice(cid: ID, ch: ID) {
  if (V().ch === ch) return;
  if (V().ch) leaveVoice(true);
  const st = useStore.getState();
  host = st.commHost[cid] || null;
  if (!host) return;
  const muted = st.settings.joinMuted || V().muted;
  setV({ ch, cid, state: 'connecting', speaking: {}, media: {}, muted });
  spatialMode = st.communities[cid]?.channels.find((x) => x.id === ch)?.type === 'space';
  mySid = null;
  lastMembers = new Set();
  noiseFloor = 0.004;
  try {
    await openMic();
    setV({ noMic: false });
  } catch {
    closeMic();
    setV({ noMic: true });
    toast('Mikrofona erişilemedi; sadece dinleyici olarak bağlandın.', 'err');
  }
  if (V().ch !== ch) return; // bu arada ayrıldı
  applyTracks();
  startLoop();
  window.kovan.inCall(true);
  cmd(ch, { t: 'vc.join', ch, muted: V().muted || !local, deaf: V().deaf });
  if (st.settings.sounds) playSound('join');
}

export function leaveVoice(silent = false) {
  const ch = V().ch;
  if (!ch) return;
  cmd(ch, { t: 'vc.leave' });
  for (const sid of [...peers.keys()]) closePeer(sid);
  closeMic();
  V().cam?.getTracks().forEach((t) => t.stop());
  V().screen?.getTracks().forEach((t) => t.stop());
  screenCfg = null;
  mySid = null;
  host = null;
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
  spatialMode = false;
  lastPos.clear();
  window.kovan.inCall(false);
  setV({ ch: null, cid: null, state: 'idle', speaking: {}, media: {}, cam: null, screen: null, screenLabel: null });
  if (!silent && ST().sounds) playSound('leave');
}

export function toggleMute() {
  const { muted, deaf } = V();
  if (deaf) setV({ deaf: false, muted: false });
  else setV({ muted: !muted });
  applyTracks();
  pushState();
  if (ST().sounds) playSound(V().muted ? 'mute' : 'unmute');
}

export function toggleDeaf() {
  const { deaf } = V();
  setV({ deaf: !deaf, muted: !deaf ? true : false });
  applyTracks();
  pushState();
  if (ST().sounds) playSound(V().deaf ? 'mute' : 'unmute');
}

function pushState() {
  const { ch, muted, deaf, cam, screen, screenLabel } = V();
  if (!ch) return;
  cmd(ch, {
    t: 'vc.state',
    muted: muted || !local,
    deaf,
    cam: !!cam,
    screen: screen ? screenLabel || 'Ekran' : null,
    streams: { mic: local?.id, cam: cam?.id, screen: screen?.id },
  });
}

// ---------------------------------------------------------------- kamera
export async function startCamera() {
  if (!V().ch || V().cam || spatialMode) return;
  const s = ST();
  try {
    const cam = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: s.camId && s.camId !== 'default' ? { exact: s.camId } : undefined,
        width: { ideal: RES_W[s.camRes] || 1280 },
        height: { ideal: s.camRes },
        frameRate: { ideal: s.camFps, max: s.camFps },
      },
      audio: false,
    });
    if (!V().ch) return cam.getTracks().forEach((t) => t.stop());
    const vt = cam.getVideoTracks()[0];
    vt.contentHint = 'motion';
    vt.onended = () => stopCamera();
    setV({ cam });
    pushState(); // önce akış kimliği duyurulsun
    for (const p of peers.values()) addLocalVideo(p);
    if (s.sounds) playSound('unmute', 0.06);
  } catch (e) {
    toast((e as Error)?.name === 'NotFoundError' ? 'Kamera bulunamadı.' : 'Kameraya erişilemedi.', 'err');
  }
}

export function stopCamera() {
  const cam = V().cam;
  if (!cam) return;
  for (const p of peers.values())
    if (p.senders.cam) {
      try {
        p.pc.removeTrack(p.senders.cam);
      } catch {
        /* kapalı */
      }
      p.senders.cam = undefined;
    }
  cam.getTracks().forEach((t) => t.stop());
  setV({ cam: null });
  pushState();
}

export const toggleCamera = () => (V().cam ? stopCamera() : startCamera());

// ---------------------------------------------------------------- ekran paylaşımı
export function screenLabelOf(res: number, fps: number) {
  return `${res === 0 ? 'Kaynak' : res === 2160 ? '4K' : res + 'p'} ${fps} FPS`;
}

export async function startScreen(o: ScreenOpts) {
  if (!V().ch || spatialMode) return;
  if (V().screen) stopScreen(true);
  try {
    await window.kovan.capture.select({ id: o.sourceId, audio: o.audio });
    const video: MediaTrackConstraints = { frameRate: { ideal: o.fps, max: o.fps } };
    if (o.res) {
      video.width = { max: RES_W[o.res] || 1920 };
      video.height = { max: o.res };
    }
    const audio: any = o.audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false, restrictOwnAudio: true } : false;
    const scr = await navigator.mediaDevices.getDisplayMedia({ video, audio } as any);
    if (!V().ch) return scr.getTracks().forEach((t) => t.stop());
    const vt = scr.getVideoTracks()[0];
    vt.contentHint = o.hint;
    vt.onended = () => stopScreen();
    // ekran istenen kare hızını desteklemezse sessizce düşer; çözünürlük sınırını yeniden uygula
    vt.applyConstraints(video).catch(() => {});
    screenCfg = { res: o.res, fps: o.fps, hint: o.hint };
    setV({ screen: scr, screenLabel: screenLabelOf(o.res, o.fps) });
    pushState();
    for (const p of peers.values()) addLocalVideo(p);
    if (ST().sounds) playSound('join', 0.06);
  } catch (e) {
    await window.kovan.capture.select(null);
    if ((e as Error)?.name !== 'NotAllowedError') toast('Ekran paylaşımı başlatılamadı.', 'err');
  }
}

export function stopScreen(silent = false) {
  const scr = V().screen;
  if (!scr) return;
  for (const p of peers.values()) {
    for (const k of ['scrV', 'scrA'] as const)
      if (p.senders[k]) {
        try {
          p.pc.removeTrack(p.senders[k]!);
        } catch {
          /* kapalı */
        }
        p.senders[k] = undefined;
      }
  }
  scr.getTracks().forEach((t) => t.stop());
  screenCfg = null;
  setV({ screen: null, screenLabel: null });
  pushState();
  if (!silent && ST().sounds) playSound('leave', 0.06);
}

// ---------------------------------------------------------------- ayarlar ve tuşlar
export function setUserVolume(uid: ID, pct: number) {
  const s = useStore.getState().settings;
  useStore.setState({ settings: { ...s, userVolumes: { ...s.userVolumes, [uid]: Math.round(pct) } } });
  window.kovan.setConfig({ settings: { userVolumes: { ...s.userVolumes, [uid]: Math.round(pct) } } });
  applyOutput();
}

useStore.subscribe((s, prev) => {
  if (s.settings === prev.settings) return;
  const a = s.settings, b = prev.settings;
  if (a.outputVolume !== b.outputVolume || a.speakerId !== b.speakerId || a.userVolumes !== b.userVolumes) applyOutput();
  if (a.inputVolume !== b.inputVolume && inGain && actx) inGain.gain.setTargetAtTime(a.inputVolume / 100, actx.currentTime, 0.02);
  if (a.micId !== b.micId || a.noiseSuppression !== b.noiseSuppression || a.echoCancellation !== b.echoCancellation || a.autoGainControl !== b.autoGainControl) restartMic();
  if (a.voiceBitrate !== b.voiceBitrate) for (const p of peers.values()) tunePeer(p);
});

// bas-konuş: önce genel klavye kancası (oyundayken de çalışır), olmazsa yalnızca pencere odaktayken
let globalPtt = false;
function pttSet(down: boolean) {
  if (down === V().ptt) return;
  if (!down) pttUntil = performance.now() + ST().pttRelease;
  setV({ ptt: down });
}
async function syncPtt() {
  const on = !!V().ch && ST().inputMode === 'ptt';
  try {
    globalPtt = (await window.kovan.ptt.configure({ enabled: on, code: ST().pttKey })) && on;
  } catch {
    globalPtt = false;
  }
  if (!on) pttSet(false);
}
window.kovan.ptt.onChange((down) => globalPtt && pttSet(down));
useVoice.subscribe((s, p) => s.ch !== p.ch && syncPtt());
useStore.subscribe((s, p) => (s.settings.inputMode !== p.settings.inputMode || s.settings.pttKey !== p.settings.pttKey) && syncPtt());
const pttLocal = (code: string, down: boolean, e?: KeyboardEvent) => {
  if (globalPtt || !V().ch || ST().inputMode !== 'ptt' || code !== ST().pttKey) return;
  if (down && e) {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if ((tag === 'input' || tag === 'textarea') && e.key.length === 1) return; // yazı yazarken karakter tuşu
  }
  pttSet(down);
};
window.addEventListener('keydown', (e) => !e.repeat && pttLocal(e.code, true, e));
window.addEventListener('keyup', (e) => pttLocal(e.code, false));
window.addEventListener('mousedown', (e) => e.button >= 3 && pttLocal('Mouse' + (e.button + 1), true));
window.addEventListener('mouseup', (e) => e.button >= 3 && pttLocal('Mouse' + (e.button + 1), false));
window.addEventListener('blur', () => !globalPtt && V().ptt && pttSet(false));

// bağlantı koparsa sesten düş
useStore.subscribe((s, prev) => {
  if (!host || !V().ch) return;
  if (prev.conns[host]?.status === 'online' && s.conns[host]?.status !== 'online') {
    toast('Ses bağlantısı koptu.', 'err');
    leaveVoice(true);
  }
});
