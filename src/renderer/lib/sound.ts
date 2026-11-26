// Küçük, dosyasız arayüz sesleri (WebAudio ile sentezlenir).
let ctx: AudioContext | null = null;

type Kind = 'message' | 'mention' | 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'screenOn' | 'screenOff' | 'camOn' | 'camOff' | 'ring';

// [frekans, başlangıç(sn), süre(sn)]
type Tone = [number, number, number];
/** vol: temel ses düzeyi · rich: dolgun tını (üçgen dalga + bir oktav üstü); ses odası olayları kalabalık konuşmanın içinde de seçilsin */
const SOUNDS: Record<Kind, { tones: Tone[]; vol: number; rich?: boolean }> = {
  message: { vol: 0.12, tones: [[880, 0, 0.09], [1320, 0.07, 0.12]] },
  mention: { vol: 0.12, tones: [[784, 0, 0.1], [1046, 0.09, 0.1], [1318, 0.18, 0.16]] },
  // v1.64: ses odası sesleri daha baskın ve birbirinden ayırt edilir.
  // Katılma: yükselen üç nota · Ayrılma: aynı notalar inerek
  join: { vol: 0.3, rich: true, tones: [[523.25, 0, 0.15], [659.25, 0.1, 0.15], [783.99, 0.2, 0.3]] },
  leave: { vol: 0.3, rich: true, tones: [[783.99, 0, 0.15], [659.25, 0.1, 0.15], [523.25, 0.2, 0.32]] },
  // Sustur: kısa iniş · Aç: kısa çıkış · Sağırlaştır / aç: üç notalı, daha pes
  mute: { vol: 0.24, rich: true, tones: [[466.16, 0, 0.08], [349.23, 0.07, 0.14]] },
  unmute: { vol: 0.24, rich: true, tones: [[466.16, 0, 0.08], [622.25, 0.07, 0.14]] },
  deafen: { vol: 0.24, rich: true, tones: [[392, 0, 0.09], [293.66, 0.08, 0.09], [220, 0.16, 0.2]] },
  undeafen: { vol: 0.24, rich: true, tones: [[220, 0, 0.09], [293.66, 0.08, 0.09], [392, 0.16, 0.2]] },
  // Ekran paylaşımı: iki kısa tiz vuruş + uzun yüksek nota (katılma sesiyle karışmaz) · Bitince: iki notalı iniş
  screenOn: { vol: 0.3, rich: true, tones: [[880, 0, 0.09], [880, 0.12, 0.09], [1318.5, 0.24, 0.36]] },
  screenOff: { vol: 0.28, rich: true, tones: [[1318.5, 0, 0.12], [880, 0.13, 0.34]] },
  // Kamera: iki notalı kısa çıkış / iniş
  camOn: { vol: 0.24, rich: true, tones: [[698.46, 0, 0.1], [1046.5, 0.1, 0.24]] },
  camOff: { vol: 0.24, rich: true, tones: [[1046.5, 0, 0.1], [698.46, 0.1, 0.24]] },
  // gelen arama: iki kısa çift ton
  ring: { vol: 0.2, tones: [[659, 0, 0.16], [784, 0.17, 0.16], [659, 0.5, 0.16], [784, 0.67, 0.16]] },
};

/** yayıncı modu ya da ayrı pencere sesleri susturabilir */
export const soundGate = { muted: false };

// v1.59.1: çalışır durumda kalan bir AudioContext, hiçbir ses çalmasa da Windows'ta ses hizmetini (AudioService)
// ve arayüzün ses iş parçacığını sürekli çalıştırır (ölçüm: boştayken tek çekirdeğin %6-8'i). Bu yüzden son sesten
// kısa süre sonra bağlam askıya alınır; sıradaki ses onu yeniden başlatır.
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_MS = 2500;

/** Sesler seçili hoparlörden / kulaklıktan çalsın (boş = varsayılan cihaz) */
let sink = '';
export function setSoundSink(id: string) {
  sink = id && id !== 'default' ? id : '';
  applySink();
}
function applySink() {
  const c = ctx as (AudioContext & { sinkId?: string; setSinkId?: (id: string) => Promise<void> }) | null;
  if (c?.setSinkId && (c.sinkId || '') !== sink) c.setSinkId(sink).catch(() => {});
}

/** scale: sesin kendi düzeyine çarpan (1 = olağan; başkalarının olayları için biraz kısık çalınır) */
export function playSound(kind: Kind, scale = 1) {
  if (soundGate.muted) return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      applySink();
    }
    // her seferinde sürdür: askıya alma isteği henüz bitmemişken durum hâlâ 'running' görünebilir; sonraki istek öncekini geçersiz kılar
    ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const { tones, vol, rich } = SOUNDS[kind];
    const volume = Math.max(0, Math.min(0.5, vol * scale));
    const note = (type: OscillatorType, f: number, start: number, dur: number, v: number) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + start);
      g.gain.linearRampToValueAtTime(v, now + start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      o.connect(g).connect(ctx!.destination);
      o.start(now + start);
      o.stop(now + start + dur + 0.02);
    };
    for (const [f, start, dur] of tones) {
      if (rich) {
        note('triangle', f, start, dur, volume);
        note('sine', f * 2, start, dur * 0.8, volume * 0.3);
      } else note('sine', f, start, dur, volume);
    }
    const end = Math.max(...tones.map(([, start, dur]) => start + dur));
    if (idleTimer) clearTimeout(idleTimer);
    const c = ctx;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (c.state === 'running') c.suspend().catch(() => {});
    }, end * 1000 + IDLE_MS);
  } catch {
    /* ses yok */
  }
}
