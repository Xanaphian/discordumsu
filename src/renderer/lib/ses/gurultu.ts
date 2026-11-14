// Mikrofon gürültü engelleme modları (v1.35).
// Kapalı: işlem yok. Standart: tarayıcının (WebRTC) gürültü bastırması + 80 Hz altı uğultu kesilir.
// Güçlü: + spektral kapı (fan, klima, hışırtı gibi sürekli sesleri ~20 dB kısar).
// Maksimum (v1.47.3): + RNNoise sinir ağı (klavye, kalabalık, müzik dahil) ve ardından hafif spektral kapı.
//   RNNoise yüklenemezse eski yol: sert spektral kapı + 7,5 kHz süzgeç.
import workletUrl from './gurultu.worklet.js?url';
import rnnoiseB64 from './rnnoise-wasm';

export type NoiseMode = 'kapali' | 'standart' | 'guclu' | 'maksimum';

export const NOISE_MODES: { id: NoiseMode; label: string; sub: string }[] = [
  { id: 'kapali', label: 'Kapalı', sub: 'Sesin olduğu gibi gider. Stüdyo mikrofonu ya da müzik için.' },
  { id: 'standart', label: 'Standart', sub: 'Hafif arka plan seslerini ve uğultuyu azaltır.' },
  { id: 'guclu', label: 'Güçlü', sub: 'Fan, klima, bilgisayar sesi gibi sürekli gürültüyü belirgin kısar.' },
  { id: 'maksimum', label: 'Maksimum', sub: 'Yapay zekâ destekli en güçlü bastırma: fan, müzik ve uğultu en aza iner.' },
];

/** Eski ayar (yalnız açık/kapalı) olanlar için */
export const noiseModeOf = (s: { noiseMode?: NoiseMode; noiseSuppression?: boolean }): NoiseMode =>
  s.noiseMode || (s.noiseSuppression === false ? 'kapali' : 'standart');

/** Tarayıcının kendi gürültü bastırması bu modda açık mı */
export const browserNS = (m: NoiseMode) => m !== 'kapali';

const PARAMS: Record<NoiseMode, { hp: number; lp: number; over: number; floor: number; rnn?: boolean } | null> = {
  kapali: null,
  standart: { hp: 80, lp: 0, over: 0, floor: 1 },
  guclu: { hp: 90, lp: 0, over: 1.2, floor: 0.1 },
  maksimum: { hp: 100, lp: 0, over: 1.2, floor: 0.1, rnn: true },
};
/** RNNoise yüklenemezse Maksimum'un eski hâli */
const MAX_FALLBACK = { hp: 110, lp: 7500, over: 2.8, floor: 0.035 };

let wasmBytes: ArrayBuffer | null = null;
function rnnBytes() {
  if (!wasmBytes) {
    const bin = atob(rnnoiseB64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    wasmBytes = u.buffer;
  }
  return wasmBytes.slice(0);
}

/** RNNoise düğümünü kur; WASM açılamazsa null */
function rnnNode(ctx: BaseAudioContext): Promise<AudioWorkletNode | null> {
  if (ctx.sampleRate !== 48000) return Promise.resolve(null); // RNNoise yalnız 48 kHz
  return new Promise((res) => {
    let n: AudioWorkletNode;
    try {
      n = new AudioWorkletNode(ctx, 'xn-rnnoise', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: { wasm: rnnBytes() },
      });
    } catch (e) {
      console.warn('RNNoise kurulamadı', e);
      return res(null);
    }
    const t = setTimeout(() => res(n), 1500); // cevap gecikirse düğüm yine de çalışır (açılamazsa sesi olduğu gibi geçirir)
    n.port.onmessage = (e) => {
      if (!e.data || !('ready' in e.data || 'error' in e.data)) return;
      clearTimeout(t);
      if (e.data.ready) res(n);
      else {
        console.warn('RNNoise açılamadı', e.data.error);
        n.port.close();
        res(null);
      }
    };
  });
}

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();
function loadWorklet(ctx: BaseAudioContext) {
  let p = loaded.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(workletUrl).then(
      () => true,
      (e) => (console.warn('gürültü engelleme yüklenemedi', e), false),
    );
    loaded.set(ctx, p);
  }
  return p;
}

export interface NoiseChain {
  input: AudioNode;
  output: AudioNode;
  dispose(): void;
}

/** input → (uğultu süzgeci) → (spektral kapı) → (bant süzgeci) → output */
export async function buildNoiseChain(ctx: BaseAudioContext, mode: NoiseMode): Promise<NoiseChain> {
  const input = ctx.createGain();
  let p = PARAMS[mode];
  if (!p) return { input, output: input, dispose: () => input.disconnect() };
  const nodes: AudioNode[] = [input];
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = p.hp;
  // Web Audio'da Q desibel cinsinden: -3 dB = düz (Butterworth), tepe yapmaz
  hp.Q.value = -3;
  nodes.push(hp);
  const ok = p.over > 0 && (await loadWorklet(ctx));
  if (ok && p.rnn) {
    const r = await rnnNode(ctx);
    if (r) nodes.push(r);
    else p = MAX_FALLBACK;
  }
  if (ok) {
    const w = new AudioWorkletNode(ctx, 'xn-gurultu', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: { over: p.over, floor: p.floor },
    });
    nodes.push(w);
  }
  if (p.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.lp;
    lp.Q.value = -3;
    nodes.push(lp);
  }
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return {
    input,
    output: nodes[nodes.length - 1],
    dispose() {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* kopuk */
        }
        if (n instanceof AudioWorkletNode) {
          n.port.close();
        }
      }
    },
  };
}
