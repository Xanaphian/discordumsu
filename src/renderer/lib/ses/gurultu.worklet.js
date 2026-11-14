// Xanaphian gürültü engelleme (v1.35): spektral kapı.
// 512 örnek pencere, %50 örtüşme, kök-Hann pencereler (tam yeniden kurulum). Gecikme ~11 ms.
// Her frekans bandı için arka plan gürültüsü sürekli öğrenilir (fan, klima, uğultu, hışırtı),
// konuşmadan zayıf kalan bantlar kısılır. Kazançlar zamanda ve frekansta yumuşatılır ki "su sesi" olmasın.
const N = 512;
const H = N / 2;
const K = N / 2 + 1;

function makeFFT(n) {
  const levels = Math.log2(n) | 0;
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) (cos[i] = Math.cos((2 * Math.PI * i) / n)), (sin[i] = Math.sin((2 * Math.PI * i) / n));
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i, r = 0;
    for (let j = 0; j < levels; j++) (r = (r << 1) | (x & 1)), (x >>= 1);
    rev[i] = r;
  }
  return (re, im, inv) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size)
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const c = cos[k], s = inv ? -sin[k] : sin[k];
          const l = j + half;
          const tre = re[l] * c + im[l] * s;
          const tim = -re[l] * s + im[l] * c;
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre; im[j] += tim;
        }
    }
  };
}

class Gurultu extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fft = makeFFT(N);
    this.win = new Float32Array(N);
    for (let i = 0; i < N; i++) this.win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    this.inBuf = new Float32Array(N);
    this.outBuf = new Float32Array(N + H);
    this.fill = 0;
    this.outPos = 0;
    this.re = new Float32Array(N);
    this.im = new Float32Array(N);
    this.pow = new Float32Array(K);
    this.noise = new Float32Array(K);
    this.gain = new Float32Array(K).fill(1);
    this.tmp = new Float32Array(K);
    this.frames = 0;
    this.over = 1.6;
    this.floor = 0.12;
    this.on = true;
    // çıktı kuyruğu: bir pencere (N örnek) gecikmeli okunur
    this.q = new Float32Array(N * 4);
    this.qr = 0;
    this.qw = N;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.over === 'number') this.over = d.over;
      if (typeof d.floor === 'number') this.floor = d.floor;
      if (typeof d.on === 'boolean') this.on = d.on;
    };
  }

  frame() {
    const { re, im, win, pow, noise, gain, tmp } = this;
    for (let i = 0; i < N; i++) (re[i] = this.inBuf[i] * win[i]), (im[i] = 0);
    this.fft(re, im, false);
    const warm = this.frames < 30;
    for (let k = 0; k < K; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      pow[k] = this.frames ? pow[k] * 0.7 + p * 0.3 : p;
      // gürültü tabanı: düşerken hızlı izle, yükselirken çok yavaş (konuşma gürültü sanılmasın)
      if (!this.frames) noise[k] = pow[k];
      else if (warm) noise[k] = Math.min(noise[k] * 1.02, pow[k]);
      else if (pow[k] < noise[k]) noise[k] = noise[k] * 0.9 + pow[k] * 0.1;
      else noise[k] = noise[k] * 1.004 + 1e-12;
      const g = 1 - (this.over * noise[k]) / (p + 1e-12);
      tmp[k] = g < this.floor ? this.floor : g > 1 ? 1 : g;
    }
    this.frames++;
    for (let k = 0; k < K; k++) {
      // frekansta komşularla yumuşat, zamanda: açılış hızlı, kapanış yavaş
      const a = tmp[k > 0 ? k - 1 : k], b = tmp[k], c = tmp[k < K - 1 ? k + 1 : k];
      const g = (a + 2 * b + c) * 0.25;
      gain[k] = g > gain[k] ? g * 0.8 + gain[k] * 0.2 : g * 0.35 + gain[k] * 0.65;
      re[k] *= gain[k];
      im[k] *= gain[k];
      if (k > 0 && k < N / 2) (re[N - k] = re[k]), (im[N - k] = -im[k]);
    }
    this.fft(re, im, true);
    // örtüşerek ekle
    for (let i = 0; i < N; i++) this.outBuf[i] += (re[i] / N) * win[i];
    for (let i = 0; i < H; i++) {
      this.q[this.qw] = this.outBuf[i];
      this.qw = (this.qw + 1) % this.q.length;
    }
    this.outBuf.copyWithin(0, H, N + H);
    this.outBuf.fill(0, N);
    this.inBuf.copyWithin(0, H);
    this.fill = H;
  }

  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    const out = outputs[0][0];
    if (!out) return true;
    if (!inp) {
      out.fill(0);
      return true;
    }
    if (!this.on) {
      out.set(inp);
      return true;
    }
    for (let i = 0; i < inp.length; i++) {
      this.inBuf[this.fill++] = inp[i];
      if (this.fill === N) this.frame();
      out[i] = this.q[this.qr];
      this.qr = (this.qr + 1) % this.q.length;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

registerProcessor('xn-gurultu', Gurultu);
