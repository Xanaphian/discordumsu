// Ayarlar → Ses ve Görüntü
import React, { useEffect, useRef, useState } from 'react';
import { Mic, Video, RotateCcw } from 'lucide-react';
import { useStore, updateSettings, toast } from '../lib/store';
import { Toggle } from './Common';
import { cx } from '../lib/util';
import { StreamVideo } from './Media';
import type { Settings } from '../lib/store';

function Row({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-title">{title}</div>
        {sub && <div className="set-row-sub">{sub}</div>}
      </div>
      <div className="set-row-ctl">{children}</div>
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} className={cx(value === o.v && 'on')} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, min, max, step = 1, onChange, fmt }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div className="slider-row">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <span className="slider-val">{fmt ? fmt(value) : value}</span>
    </div>
  );
}

/** RMS düzeyini 0..1 göstergeye çevir (logaritmik) */
const meterPos = (rms: number) => Math.max(0, Math.min(1, (Math.log10(Math.max(rms, 1e-5)) + 3) / 2.5));
const thresholdOf = (t: number) => 0.0015 * Math.pow(120, t / 100);

export function keyLabel(code: string) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace('Backquote', '"')
    .replace('ShiftLeft', 'Sol Shift')
    .replace('ShiftRight', 'Sağ Shift')
    .replace('ControlLeft', 'Sol Ctrl')
    .replace('ControlRight', 'Sağ Ctrl')
    .replace('AltLeft', 'Sol Alt')
    .replace('AltRight', 'Sağ Alt')
    .replace('CapsLock', 'Caps Lock')
    .replace('Space', 'Boşluk')
    .replace('Mouse4', 'Fare geri tuşu')
    .replace('Mouse5', 'Fare ileri tuşu');
}

function MicTest() {
  const s = useStore((x) => x.settings);
  const [testing, setTesting] = useState(false);
  const [hear, setHear] = useState(false);
  const [lvl, setLvl] = useState(0);
  const hearRef = useRef<GainNode | null>(null);
  useEffect(() => {
    if (hearRef.current) hearRef.current.gain.value = hear ? 1 : 0;
  }, [hear]);
  useEffect(() => {
    if (!testing) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let alive = true;
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: s.micId !== 'default' ? { exact: s.micId } : undefined,
          noiseSuppression: s.noiseSuppression,
          echoCancellation: s.echoCancellation,
          autoGainControl: s.autoGainControl,
          channelCount: 1,
        },
      })
      .then((st) => {
        if (!alive) return st.getTracks().forEach((t) => t.stop());
        stream = st;
        ctx = new AudioContext({ latencyHint: 'interactive' });
        if (s.speakerId !== 'default' && 'setSinkId' in ctx) (ctx as any).setSinkId(s.speakerId).catch(() => {});
        const src = ctx.createMediaStreamSource(st);
        const g = ctx.createGain();
        g.gain.value = useStore.getState().settings.inputVolume / 100;
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        const out = ctx.createGain();
        out.gain.value = 0;
        hearRef.current = out;
        src.connect(g);
        g.connect(an);
        g.connect(out).connect(ctx.destination);
        const buf = new Float32Array(1024);
        const loop = () => {
          g.gain.value = useStore.getState().settings.inputVolume / 100;
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          setLvl(Math.sqrt(sum / buf.length));
          raf = requestAnimationFrame(loop);
        };
        loop();
      })
      .catch(() => {
        toast('Mikrofona erişilemedi.', 'err');
        setTesting(false);
      });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
      hearRef.current = null;
    };
  }, [testing, s.micId, s.noiseSuppression, s.echoCancellation, s.autoGainControl, s.speakerId]);
  const open = s.inputMode === 'vad' && lvl > (s.vadThreshold > 0 ? thresholdOf(s.vadThreshold) : 0.012);
  return (
    <>
      <div className="mic-test">
        <button className={cx('btn sm', testing ? 'danger' : 'primary')} onClick={() => setTesting((t) => !t)}>
          <Mic size={14} /> {testing ? 'Durdur' : 'Test et'}
        </button>
        <div className="meter-wrap">
          <div className="meter">
            <div style={{ width: `${meterPos(lvl) * 100}%`, background: s.inputMode === 'vad' && !open ? 'var(--yellow)' : undefined }} />
          </div>
          {s.inputMode === 'vad' && s.vadThreshold > 0 && <span className="thresh" style={{ left: `${meterPos(thresholdOf(s.vadThreshold)) * 100}%` }} />}
        </div>
      </div>
      {testing && (
        <label className="check-line">
          <input type="checkbox" checked={hear} onChange={(e) => setHear(e.target.checked)} /> Kendimi duymak istiyorum (kulaklık tak, yoksa yankı olur)
        </label>
      )}
    </>
  );
}

function CamPreview() {
  const s = useStore((x) => x.settings);
  const [on, setOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    if (!on) return;
    let st: MediaStream | null = null;
    let alive = true;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          deviceId: s.camId !== 'default' ? { exact: s.camId } : undefined,
          width: { ideal: s.camRes === 1080 ? 1920 : s.camRes === 720 ? 1280 : 640 },
          height: { ideal: s.camRes },
          frameRate: { ideal: s.camFps },
        },
      })
      .then((x) => {
        if (!alive) return x.getTracks().forEach((t) => t.stop());
        st = x;
        setStream(x);
      })
      .catch(() => {
        toast('Kameraya erişilemedi.', 'err');
        setOn(false);
      });
    return () => {
      alive = false;
      st?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [on, s.camId, s.camRes, s.camFps]);
  const track = stream?.getVideoTracks()[0];
  const real = track?.getSettings();
  return (
    <>
      <div className="cam-preview">{stream ? <StreamVideo stream={stream} mirror={s.camMirror} /> : <Video size={34} />}</div>
      <div className="btn-row">
        <button className={cx('btn sm', on ? 'danger' : 'primary')} onClick={() => setOn((x) => !x)}>
          <Video size={14} /> {on ? 'Önizlemeyi kapat' : 'Kamerayı dene'}
        </button>
        {real?.width && (
          <span className="note inline">
            Kamera şu an {real.width}×{real.height}, {Math.round(real.frameRate || 0)} FPS veriyor
          </span>
        )}
      </div>
    </>
  );
}

export function VoiceTab() {
  const s = useStore((x) => x.settings);
  const users = useStore((x) => x.users);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [binding, setBinding] = useState(false);
  const set = (p: Partial<Settings>) => updateSettings(p);
  useEffect(() => {
    const load = () => navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => {});
    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, []);
  useEffect(() => {
    if (!binding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') set({ pttKey: e.code });
      setBinding(false);
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button < 3) return;
      e.preventDefault();
      set({ pttKey: 'Mouse' + (e.button + 1) });
      setBinding(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
    };
  }, [binding]);
  const inputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const cams = devices.filter((d) => d.kind === 'videoinput');
  const vols = Object.entries(s.userVolumes).filter(([, v]) => v !== 100);
  return (
    <>
      <h1>Ses ve Görüntü</h1>
      <div className="two-col">
        <label className="field">
          <span>Giriş aygıtı</span>
          <select value={s.micId} onChange={(e) => set({ micId: e.target.value })}>
            <option value="default">Varsayılan</option>
            {inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Mikrofon'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Çıkış aygıtı</span>
          <select value={s.speakerId} onChange={(e) => set({ speakerId: e.target.value })}>
            <option value="default">Varsayılan</option>
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Hoparlör'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="two-col">
        <label className="field">
          <span>Giriş seviyesi</span>
          <Slider value={s.inputVolume} min={0} max={200} step={5} onChange={(v) => set({ inputVolume: v })} fmt={(v) => v + '%'} />
        </label>
        <label className="field">
          <span>Çıkış seviyesi</span>
          <Slider value={s.outputVolume} min={0} max={200} step={5} onChange={(v) => set({ outputVolume: v })} fmt={(v) => v + '%'} />
        </label>
      </div>
      <h3>Mikrofon testi</h3>
      <MicTest />

      <h3>Giriş modu</h3>
      <Row title="Nasıl konuşacaksın?" sub={s.inputMode === 'vad' ? 'Konuşmaya başlayınca mikrofon kendiliğinden açılır.' : 'Mikrofon yalnızca tuşa basılıyken açık.'}>
        <Seg value={s.inputMode} options={[{ v: 'vad', label: 'Ses etkinliği' }, { v: 'ptt', label: 'Bas-konuş' }]} onChange={(v) => set({ inputMode: v })} />
      </Row>
      {s.inputMode === 'vad' ? (
        <>
          <Row title="Hassasiyeti otomatik ayarla" sub="Ortam gürültüsünü ölçüp eşiği kendisi belirler.">
            <Toggle value={s.vadThreshold === 0} onChange={(v) => set({ vadThreshold: v ? 0 : 35 })} />
          </Row>
          {s.vadThreshold > 0 && (
            <Row title="Hassasiyet eşiği" sub="Test sırasında çubuk yeşilse sesin gidiyor, sarıysa kapı kapalı. Çizgiyi konuşmanın biraz altına koy.">
              <Slider value={s.vadThreshold} min={1} max={100} onChange={(v) => set({ vadThreshold: v })} />
            </Row>
          )}
        </>
      ) : (
        <>
          <Row title="Bas-konuş tuşu" sub="Oyundayken, Kovan arka plandayken bile çalışır. Klavye tuşu ya da farenin yan tuşları olabilir.">
            <button className={cx('btn sm kbd-bind', binding && 'primary')} onClick={() => setBinding(true)}>
              {binding ? 'Bir tuşa ya da fare yan tuşuna bas… (Esc: vazgeç)' : keyLabel(s.pttKey)}
            </button>
          </Row>
          <Row title="Bırakma gecikmesi" sub="Tuşu bıraktıktan sonra sesin kesilmesi için beklenecek süre.">
            <Slider value={s.pttRelease} min={0} max={1000} step={20} onChange={(v) => set({ pttRelease: v })} fmt={(v) => v + ' ms'} />
          </Row>
        </>
      )}

      <h3>Ses işleme</h3>
      <Row title="Gürültü bastırma" sub="Klavye, fan, trafik gibi arka plan seslerini azaltır.">
        <Toggle value={s.noiseSuppression} onChange={(v) => set({ noiseSuppression: v })} />
      </Row>
      <Row title="Yankı engelleme" sub="Hoparlörden çıkan sesin mikrofona geri dönmesini önler. Kulaklıkla kapatabilirsin.">
        <Toggle value={s.echoCancellation} onChange={(v) => set({ echoCancellation: v })} />
      </Row>
      <Row title="Otomatik kazanç" sub="Sesini sabit bir seviyede tutar. Profesyonel mikrofonla kapatman daha iyi olabilir.">
        <Toggle value={s.autoGainControl} onChange={(v) => set({ autoGainControl: v })} />
      </Row>
      <Row title="Ses kalitesi" sub="Diğerlerinin sana gönderdiği sesin bit hızı. 96 kbps önerilir; müzik için 128 ve üstü.">
        <Seg
          value={s.voiceBitrate}
          options={[32, 64, 96, 128, 192, 256].map((v) => ({ v, label: v + ' kbps' }))}
          onChange={(v) => set({ voiceBitrate: v })}
        />
      </Row>
      <Row title="Sese katılınca mikrofonum kapalı başlasın">
        <Toggle value={s.joinMuted} onChange={(v) => set({ joinMuted: v })} />
      </Row>

      <h3>Kamera</h3>
      <div className="two-col">
        <label className="field">
          <span>Kamera</span>
          <select value={s.camId} onChange={(e) => set({ camId: e.target.value })}>
            <option value="default">Varsayılan</option>
            {cams.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Kamera'}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Çözünürlük ve kare hızı</span>
          <div className="btn-row">
            <Seg value={s.camRes} options={[{ v: 360, label: '360p' }, { v: 720, label: '720p' }, { v: 1080, label: '1080p' }]} onChange={(v) => set({ camRes: v })} />
            <Seg value={s.camFps} options={[{ v: 15, label: '15' }, { v: 30, label: '30' }, { v: 60, label: '60' }]} onChange={(v) => set({ camFps: v })} />
          </div>
        </div>
      </div>
      <Row title="Görüntümü aynala" sub="Yalnızca sende ayna gibi görünür; diğerleri düz görür.">
        <Toggle value={s.camMirror} onChange={(v) => set({ camMirror: v })} />
      </Row>
      <CamPreview />

      <h3>Ekran paylaşımı</h3>
      <Row title="Varsayılan çözünürlük">
        <Seg
          value={s.screenRes}
          options={[
            { v: 720, label: '720p' },
            { v: 1080, label: '1080p' },
            { v: 1440, label: '1440p' },
            { v: 2160, label: '4K' },
            { v: 0, label: 'Kaynak' },
          ]}
          onChange={(v) => set({ screenRes: v })}
        />
      </Row>
      <Row title="Varsayılan kare hızı">
        <Seg value={s.screenFps} options={[{ v: 15, label: '15 FPS' }, { v: 30, label: '30 FPS' }, { v: 60, label: '60 FPS' }]} onChange={(v) => set({ screenFps: v })} />
      </Row>
      <Row title="Öncelik" sub="Akıcılık oyun ve video için kare hızını korur; netlik yazı ve kod için çözünürlüğü korur.">
        <Seg value={s.screenHint} options={[{ v: 'motion', label: 'Akıcılık' }, { v: 'detail', label: 'Netlik' }]} onChange={(v) => set({ screenHint: v })} />
      </Row>
      {window.kovan.platform === 'win32' && (
        <Row title="Bilgisayar sesini de paylaş" sub="Oyun, video veya müzik sesi yayına eklenir.">
          <Toggle value={s.screenAudio} onChange={(v) => set({ screenAudio: v })} />
        </Row>
      )}
      <Row title="Görüntü kodeği" sub="Otomatik, ekran kartının donanım kodlayıcısını (H.264) önceler; en az kasma bununla olur.">
        <Seg
          value={s.videoCodec}
          options={[
            { v: 'auto', label: 'Otomatik' },
            { v: 'h264', label: 'H.264' },
            { v: 'vp9', label: 'VP9' },
            { v: 'vp8', label: 'VP8' },
            { v: 'av1', label: 'AV1' },
          ]}
          onChange={(v) => set({ videoCodec: v })}
        />
      </Row>

      {vols.length > 0 && (
        <>
          <h3>Kişi ses seviyeleri</h3>
          {vols.map(([uid, v]) => (
            <Row key={uid} title={users[uid]?.name || 'Kullanıcı'} sub={`%${v}`}>
              <button className="btn ghost sm" onClick={() => set({ userVolumes: { ...s.userVolumes, [uid]: 100 } })}>
                <RotateCcw size={14} /> Sıfırla
              </button>
            </Row>
          ))}
        </>
      )}
      <p className="note">Ses ve görüntü doğrudan eşler arası (WebRTC) gider; kovan sunucusundan geçmez. Bir kişinin sesini, ses odasında kutusunun üzerine gelip ayarlayabilirsin.</p>
    </>
  );
}
