// Küçük, dosyasız arayüz sesleri (WebAudio ile sentezlenir).
let ctx: AudioContext | null = null;

type Kind = 'message' | 'mention' | 'join' | 'leave' | 'mute' | 'unmute' | 'ring';

const TONES: Record<Kind, [number, number, number][]> = {
  // [frekans, başlangıç(sn), süre(sn)]
  message: [[880, 0, 0.09], [1320, 0.07, 0.12]],
  mention: [[784, 0, 0.1], [1046, 0.09, 0.1], [1318, 0.18, 0.16]],
  join: [[523, 0, 0.1], [784, 0.08, 0.16]],
  leave: [[784, 0, 0.1], [523, 0.08, 0.16]],
  mute: [[440, 0, 0.08]],
  unmute: [[660, 0, 0.08]],
  // gelen arama: iki kısa çift ton
  ring: [[659, 0, 0.16], [784, 0.17, 0.16], [659, 0.5, 0.16], [784, 0.67, 0.16]],
};

export function playSound(kind: Kind, volume = 0.12) {
  try {
    ctx ||= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    for (const [f, start, dur] of TONES[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + start);
      g.gain.linearRampToValueAtTime(volume, now + start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(now + start);
      o.stop(now + start + dur + 0.02);
    }
  } catch {
    /* ses yok */
  }
}
