// Mikrofon gürültü engelleme modları (v1.35).
// Kapalı: işlem yok. Standart: tarayıcının (WebRTC) gürültü bastırması + 80 Hz altı uğultu kesilir.
// Güçlü: + spektral kapı (fan, klima, hışırtı gibi sürekli sesleri ~20 dB kısar).
// Maksimum (v1.55): DeepFilterNet3 sinir ağı (klavye tıkırtısı, fan, müzik, uzaktaki konuşmalar). Tarayıcının kendi
//   bastırması bu modda kapalıdır (DeepFilterNet tek başına daha temiz çalışır).
//   DeepFilterNet yüklenemezse ya da bilgisayar yetişemezse eski yol: RNNoise + hafif spektral kapı;
//   o da olmazsa sert spektral kapı + 7,5 kHz süzgeç.
// DeepFilterNet3: Hendrik Schröter (MIT/Apache-2.0); WASM derlemesi ve AudioWorklet: @workadventure/noise-suppression (MIT).
import workletUrl from './gurultu.worklet.js?url';
import rnnoiseB64 from './rnnoise-wasm';
import dfWorkletUrl from 'dfn3/deepfilternet-worklet-processor.js?url';
import dfWasmUrl from 'dfn3/deepfilternet/df_bg.wasm?url';
import dfModelUrl from 'dfn3/deepfilternet/DeepFilterNet3_onnx.tar.gz?url';

export type NoiseMode = 'kapali' | 'standart' | 'guclu' | 'maksimum';

export const NOISE_MODES: { id: NoiseMode; label: string; sub: string }[] = [
  { id: 'kapali', label: 'Kapalı', sub: 'Sesin olduğu gibi gider. Stüdyo mikrofonu ya da müzik için.' },
  { id: 'standart', label: 'Standart', sub: 'Hafif arka plan seslerini ve uğultuyu azaltır.' },
  { id: 'guclu', label: 'Güçlü', sub: 'Fan, klima, bilgisayar sesi gibi sürekli gürültüyü belirgin kısar.' },
  { id: 'maksimum', label: 'Maksimum', sub: 'Yapay zekâ ile en güçlü bastırma: klavye tıkırtısı, fan ve müzik neredeyse duyulmaz.' },
];

/** Eski ayar (yalnız açık/kapalı) olanlar için */
export const noiseModeOf = (s: { noiseMode?: NoiseMode; noiseSuppression?: boolean }): NoiseMode =>
  s.noiseMode || (s.noiseSuppression === false ? 'kapali' : 'standart');

/** Tarayıcının kendi gürültü bastırması bu modda açık mı (Maksimum'da DeepFilterNet tek başına çalışır) */
export const browserNS = (m: NoiseMode) => m === 'standart' || m === 'guclu';

type Params = { hp: number; lp: number; over: number; floor: number; rnn?: boolean; dfn?: boolean };
const PARAMS: Record<NoiseMode, Params | null> = {
  kapali: null,
  standart: { hp: 80, lp: 0, over: 0, floor: 1 },
  guclu: { hp: 90, lp: 0, over: 1.2, floor: 0.1 },
  maksimum: { hp: 80, lp: 0, over: 0, floor: 1, dfn: true },
};
/** DeepFilterNet açılamazsa ya da yetişemezse Maksimum'un yerine geçen yol (v1.47.3'teki Maksimum) */
const MAX_RNN = { hp: 100, lp: 0, over: 1.2, floor: 0.1, rnn: true };
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

// ---- DeepFilterNet3 ----
// Model ve WASM bir kez indirilir (dosyadan), AudioContext başına tek düğüm kurulur ve mod değişince yeniden kullanılır:
// WASM tarafında model durumu serbest bırakılamadığı için her seferinde yeni düğüm kurmak bellek sızdırırdı.
let dfAssets: Promise<{ wasmModule: WebAssembly.Module; modelBytes: ArrayBuffer }> | null = null;
function dfLoad() {
  if (!dfAssets) {
    const get = async (u: string) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`${u}: ${r.status}`);
      return r.arrayBuffer();
    };
    dfAssets = Promise.all([get(dfWasmUrl).then((b) => WebAssembly.compile(b)), get(dfModelUrl)]).then(([wasmModule, modelBytes]) => ({ wasmModule, modelBytes }));
    dfAssets.catch(() => (dfAssets = null));
  }
  return dfAssets;
}
/** Bilgisayar DeepFilterNet'e yetişemedi ya da açılamadı: bu oturumda Maksimum RNNoise ile sürer */
let dfOff = false;
let onDfFail: (() => void) | null = null;
/** DeepFilterNet çalışmayı bırakınca (yetişemedi) çağrılır; ses zinciri yeniden kurulmalı */
export function onNoiseFallback(cb: (() => void) | null) {
  onDfFail = cb;
}
/** Maksimum şu an hangi motorla çalışıyor (ayarlarda göstermek için) */
export const maxEngine = () => (dfOff ? 'rnnoise' : 'deepfilternet');
const dfNodes = new WeakMap<BaseAudioContext, Promise<AudioWorkletNode | null>>();
/** Bu bağlamda DeepFilterNet kuruldu mu? (WASM belleği ancak bağlam kapatılınca geri döner) */
export const dfLoaded = (ctx: BaseAudioContext) => dfNodes.has(ctx);
function dfNode(ctx: BaseAudioContext): Promise<AudioWorkletNode | null> {
  if (dfOff || ctx.sampleRate !== 48000) return Promise.resolve(null);
  let p = dfNodes.get(ctx);
  if (!p) {
    p = (async () => {
      try {
        const [{ wasmModule, modelBytes }] = await Promise.all([dfLoad(), ctx.audioWorklet.addModule(dfWorkletUrl)]);
        const n = new AudioWorkletNode(ctx, 'workadventure-deepfilternet', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 1,
          channelCountMode: 'explicit',
          processorOptions: {
            wasmModule,
            modelBytes: modelBytes.slice(0),
            // Konuşurken en çok 25 dB kısar (kelime aralarında kesik duyulmaz); sessizlikte kapı 45 dB'e indirir.
            speechAttenuationDb: 25,
            pauseGate: { extraAttenuationDb: 20, lookaheadFrames: 2, hangoverFrames: 10, releaseDbPerFrame: 0.6, speechAboveFloorDb: 10, maxSpeechAttenuationDb: 15 },
            bypassUntilReady: true,
            maxLoad: 0.6,
            loadReportAfterMs: 0,
          },
        });
        await new Promise<void>((res, rej) => {
          const t = setTimeout(() => rej(new Error('zaman aşımı')), 15000);
          n.port.onmessage = (e) => {
            const d = e.data || {};
            if (d.type === 'ready') (clearTimeout(t), res());
            else if (d.type === 'error') (clearTimeout(t), rej(new Error(d.message)));
          };
        });
        n.port.onmessage = (e) => {
          if (e.data?.type !== 'overload' && e.data?.type !== 'error') return;
          console.warn('DeepFilterNet yetişemiyor, RNNoise kullanılacak', e.data);
          dfOff = true;
          dfNodes.delete(ctx);
          n.port.postMessage({ type: 'dispose' });
          onDfFail?.();
        };
        return n;
      } catch (e) {
        console.warn('DeepFilterNet açılamadı, RNNoise kullanılacak', e);
        dfOff = true;
        dfNodes.delete(ctx);
        return null;
      }
    })();
    dfNodes.set(ctx, p);
  }
  return p;
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
  let df: AudioWorkletNode | null = null;
  if (p.dfn) {
    df = await dfNode(ctx);
    if (!df) p = MAX_RNN;
  }
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = p.hp;
  // Web Audio'da Q desibel cinsinden: -3 dB = düz (Butterworth), tepe yapmaz
  hp.Q.value = -3;
  nodes.push(hp);
  if (df) nodes.push(df);
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
        // DeepFilterNet düğümü bağlamla birlikte yaşar (yeniden kullanılır), kapatılmaz
        if (n instanceof AudioWorkletNode && n !== df) {
          n.port.close();
        }
      }
    },
  };
}
