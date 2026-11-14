// Mikrofon gürültü engelleme modları (v1.35).
// Kapalı: işlem yok. Standart: tarayıcının (WebRTC) gürültü bastırması + 80 Hz altı uğultu kesilir.
// Güçlü: + spektral kapı (fan, klima, hışırtı gibi sürekli sesleri ~10 dB kısar).
// Maksimum: + daha sert spektral kapı ve konuşma bandı süzgeci (100 Hz – 7,5 kHz); ses biraz incelir ama oda neredeyse susar.
import workletUrl from './gurultu.worklet.js?url';

export type NoiseMode = 'kapali' | 'standart' | 'guclu' | 'maksimum';

export const NOISE_MODES: { id: NoiseMode; label: string; sub: string }[] = [
  { id: 'kapali', label: 'Kapalı', sub: 'Sesin olduğu gibi gider. Stüdyo mikrofonu ya da müzik için.' },
  { id: 'standart', label: 'Standart', sub: 'Hafif arka plan seslerini ve uğultuyu azaltır.' },
  { id: 'guclu', label: 'Güçlü', sub: 'Fan, klima, bilgisayar sesi gibi sürekli gürültüyü belirgin kısar.' },
  { id: 'maksimum', label: 'Maksimum', sub: 'Yalnız sesin kalsın: kalabalık, gürültülü ortamlar için. Ses biraz incelebilir.' },
];

/** Eski ayar (yalnız açık/kapalı) olanlar için */
export const noiseModeOf = (s: { noiseMode?: NoiseMode; noiseSuppression?: boolean }): NoiseMode =>
  s.noiseMode || (s.noiseSuppression === false ? 'kapali' : 'standart');

/** Tarayıcının kendi gürültü bastırması bu modda açık mı */
export const browserNS = (m: NoiseMode) => m !== 'kapali';

const PARAMS: Record<NoiseMode, { hp: number; lp: number; over: number; floor: number } | null> = {
  kapali: null,
  standart: { hp: 80, lp: 0, over: 0, floor: 1 },
  guclu: { hp: 90, lp: 0, over: 1.7, floor: 0.1 },
  maksimum: { hp: 110, lp: 7500, over: 2.8, floor: 0.035 },
};

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
export async function buildNoiseChain(ctx: AudioContext, mode: NoiseMode): Promise<NoiseChain> {
  const input = ctx.createGain();
  const p = PARAMS[mode];
  if (!p) return { input, output: input, dispose: () => input.disconnect() };
  const nodes: AudioNode[] = [input];
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = p.hp;
  hp.Q.value = 0.7;
  nodes.push(hp);
  if (p.over > 0 && (await loadWorklet(ctx))) {
    const w = new AudioWorkletNode(ctx, 'xn-gurultu', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
    w.port.postMessage({ over: p.over, floor: p.floor });
    nodes.push(w);
  }
  if (p.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.lp;
    lp.Q.value = 0.7;
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
        if (n instanceof AudioWorkletNode) n.port.close();
      }
    },
  };
}
