import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { Minus, Plus, RotateCw, X, Move } from 'lucide-react';
import { toast } from '../lib/store';
import { BANNER_H, BANNER_MAX, BG_MAX } from '../../shared/profile';

/**
 * Resim yerleştirme (kırpma) penceresi.
 * Bir resim seçilince, gideceği yerin gerçek oranında bir çerçeve gösterir; kullanıcı
 * sürükleyerek, yakınlaştırarak ve döndürerek hangi kısmın görüneceğini seçer.
 * Durağan resimler seçilen kısım olarak kırpılıp küçültülür; hareketli GIF kabul eden
 * yerlerde GIF bozulmasın diye resmin kendisi + konum (x, y, zoom) döner.
 */

export type CropOpts = {
  /** Pencerenin başlığı, ör. "Profil afişi" */
  title: string;
  /** Hedefin en/boy oranı (genişlik / yükseklik) */
  aspect: number;
  /** Çıkış genişliği (px). Yükseklik orandan gelir. */
  outW: number;
  /** data URL için en fazla uzunluk */
  max: number;
  /** Profil resmi gibi yuvarlak görünen yerler */
  round?: boolean;
  /** Hareketli GIF sığıyorsa olduğu gibi kalsın (konum bilgisiyle) */
  keepGif?: boolean;
  /** Önizlemede gösterilecek kısa not */
  hint?: string;
};

export type Framing = { x?: number; y?: number; zoom?: number };
export type CropResult = { image: string } & Framing;

type Job = {
  opts: CropOpts;
  src: string; // data/obj URL
  gif: boolean; // hareketli kalacak
  gifData?: string;
  init?: Framing;
  done: (r: CropResult | null) => void;
};

const useCrop = create<{ job: Job | null }>(() => ({ job: null }));

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Seçilen dosya için pencereyi açar; vazgeçilirse null döner. */
export async function cropImage(file: File, opts: CropOpts): Promise<CropResult | null> {
  if (!file.type.startsWith('image/')) {
    toast('Bir resim dosyası seç.', 'err');
    return null;
  }
  let gif = false;
  let gifData: string | undefined;
  if (file.type === 'image/gif' && opts.keepGif) {
    if (Math.ceil(file.size / 3) * 4 + 30 <= opts.max) {
      gif = true;
      gifData = await readDataUrl(file);
    } else toast('GIF çok büyük; kırpınca hareketsiz resim olarak kaydedilecek.', 'info');
  }
  const src = gifData || URL.createObjectURL(file);
  return openJob({ opts, src, gif, gifData });
}

/** Zaten yüklenmiş bir resmi yeniden yerleştirmek için (ör. "Düzenle"). */
export function recropImage(image: string, opts: CropOpts, init?: Framing): Promise<CropResult | null> {
  const gif = !!opts.keepGif && /^data:image\/gif/.test(image);
  return openJob({ opts, src: image, gif, gifData: gif ? image : undefined, init });
}

function openJob(j: Omit<Job, 'done'>): Promise<CropResult | null> {
  return new Promise((resolve) => {
    const prev = useCrop.getState().job;
    prev?.done(null);
    useCrop.setState({
      job: {
        ...j,
        done: (r) => {
          if (j.src.startsWith('blob:')) URL.revokeObjectURL(j.src);
          useCrop.setState({ job: null });
          resolve(r);
        },
      },
    });
  });
}

export function CropHost() {
  const job = useCrop((s) => s.job);
  if (!job) return null;
  return <CropDialog key={job.src} job={job} />;
}

/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ZMAX = 4;

/** Görünen kısmın resme oranı (zoom 1'de): resim çerçeveyi tam kaplar */
function coverRatio(iw: number, ih: number, aspect: number) {
  const ia = iw / ih;
  return ia > aspect ? { rx: aspect / ia, ry: 1 } : { rx: 1, ry: ia / aspect };
}

/** imgFrameStyle konumu (x%, y%, zoom%) ↔ görünen kısmın merkezi */
function tFromCenter(c: number, r: number, z: number) {
  const slack = 1 - r / z;
  return slack < 1e-4 ? 50 : clamp(Math.round(((c - r / (2 * z)) / slack) * 1000) / 10, 0, 100);
}
function centerFromT(t: number, r: number, z: number) {
  return (t / 100) * (1 - r / z) + r / (2 * z);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

/** Resmi 90° adımlarla döndürülmüş bir tuvale çizer */
function rotated(img: HTMLImageElement, rot: number): HTMLCanvasElement | HTMLImageElement {
  if (!rot) return img;
  const c = document.createElement('canvas');
  const side = rot % 180 !== 0;
  c.width = side ? img.naturalHeight : img.naturalWidth;
  c.height = side ? img.naturalWidth : img.naturalHeight;
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, c.height / 2);
  g.rotate((rot * Math.PI) / 180);
  g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return c;
}

function encode(src: HTMLCanvasElement | HTMLImageElement, sw: number, sh: number, view: { x: number; y: number; w: number; h: number }, outW: number, aspect: number, max: number) {
  let W = Math.max(16, Math.round(Math.min(outW, Math.max(view.w, outW * 0.5))));
  for (let tries = 0; tries < 8; tries++) {
    const H = Math.max(16, Math.round(W / aspect));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    const q = W / view.w;
    g.drawImage(src, -view.x * q, -view.y * q, sw * q, sh * q);
    let qual = 0.9;
    let out = c.toDataURL('image/webp', qual);
    while (out.length > max && qual > 0.45) out = c.toDataURL('image/webp', (qual -= 0.12));
    if (out.length <= max) return out;
    W = Math.round(W * 0.82);
  }
  return null;
}

function CropDialog({ job }: { job: Job }) {
  const { opts } = job;
  const A = opts.aspect;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rot, setRot] = useState(0);
  const [z, setZ] = useState(1);
  const [c, setC] = useState({ x: 0.5, y: 0.5 });
  const [rotUrl, setRotUrl] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 560, h: 340 });
  const drag = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // resmi yükle, varsa önceki konumdan başla
  useEffect(() => {
    let off = false;
    loadImage(job.src)
      .then((i) => {
        if (off) return;
        setImg(i);
        if (job.init) {
          const { rx, ry } = coverRatio(i.naturalWidth, i.naturalHeight, A);
          const zz = clamp((job.init.zoom ?? 100) / 100, 1, ZMAX);
          setZ(zz);
          setC({ x: centerFromT(job.init.x ?? 50, rx, zz), y: centerFromT(job.init.y ?? 50, ry, zz) });
        }
      })
      .catch(() => {
        toast('Resim açılamadı.', 'err');
        job.done(null);
      });
    return () => {
      off = true;
    };
  }, [job]);

  // döndürülmüş görüntü
  useEffect(() => {
    if (!img || !rot) return setRotUrl(null);
    const cv = rotated(img, rot) as HTMLCanvasElement;
    let url: string | null = null;
    cv.toBlob((b) => b && setRotUrl((url = URL.createObjectURL(b))));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [img, rot]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const side = rot % 180 !== 0;
  const iw = img ? (side ? img.naturalHeight : img.naturalWidth) : 1;
  const ih = img ? (side ? img.naturalWidth : img.naturalHeight) : 1;
  const { rx, ry } = coverRatio(iw, ih, A);
  const hw = rx / z / 2;
  const hh = ry / z / 2;
  const cx = clamp(c.x, hw, 1 - hw);
  const cy = clamp(c.y, hh, 1 - hh);

  // kırpma çerçevesi: sahneye sığan en büyük, oranlı kutu
  const pad = 26;
  const fw0 = Math.max(40, box.w - pad * 2);
  const fh0 = Math.max(40, box.h - pad * 2);
  const fw = Math.min(fw0, fh0 * A);
  const fh = fw / A;
  const k = fw / (rx / z) / iw; // ekran px / resim px
  const imgStyle: React.CSSProperties = {
    width: iw * k,
    height: ih * k,
    left: box.w / 2 - cx * iw * k,
    top: box.h / 2 - cy * ih * k,
  };

  const setZoom = useCallback((v: number) => setZ(clamp(v, 1, ZMAX)), []);

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, cx, cy };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setC({ x: d.cx - (e.clientX - d.px) / (iw * k), y: d.cy - (e.clientY - d.py) / (ih * k) });
  };
  const onUp = () => (drag.current = null);

  const reset = () => {
    setRot(0);
    setZ(1);
    setC({ x: 0.5, y: 0.5 });
  };

  const apply = async () => {
    if (!img || busy) return;
    setBusy(true);
    try {
      if (job.gif && job.gifData) {
        job.done({ image: job.gifData, x: tFromCenter(cx, rx, z), y: tFromCenter(cy, ry, z), zoom: Math.round(z * 100) });
        return;
      }
      const src = rotated(img, rot);
      const vw = (rx / z) * iw;
      const vh = (ry / z) * ih;
      const out = encode(src, iw, ih, { x: cx * iw - vw / 2, y: cy * ih - vh / 2, w: vw, h: vh }, opts.outW, A, opts.max);
      if (!out) {
        toast('Bu resim kullanılamadı.', 'err');
        setBusy(false);
        return;
      }
      job.done({ image: out, x: undefined, y: undefined, zoom: undefined });
    } catch {
      toast('Resim işlenemedi.', 'err');
      setBusy(false);
    }
  };

  // klavye: Esc vazgeç, Enter uygula, oklar kaydırır, +/- yakınlaştırır
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = 0.02 / z;
      let used = true;
      if (e.key === 'Escape') job.done(null);
      else if (e.key === 'Enter') applyRef.current();
      else if (e.key === 'ArrowLeft') setC((p) => ({ ...p, x: p.x - step }));
      else if (e.key === 'ArrowRight') setC((p) => ({ ...p, x: p.x + step }));
      else if (e.key === 'ArrowUp') setC((p) => ({ ...p, y: p.y - step }));
      else if (e.key === 'ArrowDown') setC((p) => ({ ...p, y: p.y + step }));
      else if (e.key === '+' || e.key === '=') setZ((v) => clamp(v + 0.1, 1, ZMAX));
      else if (e.key === '-') setZ((v) => clamp(v - 0.1, 1, ZMAX));
      else used = false;
      if (used) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [job, z]);

  // tutarlı hal: sınırlanmış merkez state'e yansısın
  useEffect(() => {
    if (cx !== c.x || cy !== c.y) setC({ x: cx, y: cy });
  }, [cx, cy]);

  const shown = rotUrl || (rot ? null : job.src);
  const pct = Math.round(((z - 1) / (ZMAX - 1)) * 100);
  const pw = A >= 1 ? 168 : 92;
  const ph = pw / A;
  const pk = pw / (rx / z) / iw;
  const prevStyle: React.CSSProperties = { width: iw * pk, height: ih * pk, left: pw / 2 - cx * iw * pk, top: ph / 2 - cy * ih * pk };

  return (
    <div className="crop-back" onMouseDown={(e) => e.target === e.currentTarget && job.done(null)}>
      <div className="crop-win" role="dialog" aria-modal aria-label="Resmi yerleştir">
        <header className="crop-head">
          <div>
            <h2>Resmi yerleştir</h2>
            <p>{opts.title}</p>
          </div>
          <button className="icon-btn" onClick={() => job.done(null)} aria-label="Kapat">
            <X size={18} />
          </button>
        </header>

        <div
          ref={stage}
          className={cx2('crop-stage', !img && 'loading')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={(e) => setZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        >
          {img && shown && <img className="crop-img" src={shown} alt="" draggable={false} style={imgStyle} />}
          <div className={cx2('crop-frame', opts.round && 'round')} style={{ width: fw, height: fh }}>
            <i className="crop-grid" aria-hidden />
          </div>
          <span className="crop-tip">
            <Move size={13} /> Sürükle
          </span>
        </div>

        <div className="crop-tools">
          <div className="crop-zoom">
            <button className="icon-btn" onClick={() => setZoom(z - 0.15)} disabled={z <= 1} aria-label="Uzaklaştır">
              <Minus size={16} />
            </button>
            <input type="range" min={0} max={100} value={pct} onChange={(e) => setZoom(1 + (Number(e.target.value) / 100) * (ZMAX - 1))} aria-label="Yakınlık" style={{ ['--p' as any]: pct + '%' }} />
            <button className="icon-btn" onClick={() => setZoom(z + 0.15)} disabled={z >= ZMAX} aria-label="Yakınlaştır">
              <Plus size={16} />
            </button>
            <span className="crop-zval">%{Math.round(z * 100)}</span>
          </div>
          {!job.gif && (
            <button className="btn ghost sm" onClick={() => setRot((r) => (r + 90) % 360)} title="90° döndür">
              <RotateCw size={15} /> Döndür
            </button>
          )}
        </div>

        <div className="crop-prev">
          <div className={cx2('crop-prev-box', opts.round && 'round')} style={{ width: pw, height: ph }}>
            {img && shown && <img src={shown} alt="" draggable={false} style={prevStyle} />}
          </div>
          <div className="crop-prev-text">
            <b>Böyle görünecek</b>
            <span>{opts.hint || 'Seçtiğin kısım, resmin göründüğü her yerde aynı çıkar.'}</span>
            {job.gif && <span>Hareketli GIF olduğu gibi kalır; döndürme kapalı.</span>}
          </div>
        </div>

        <footer className="crop-foot">
          <button className="btn ghost" onClick={reset}>
            Baştan al
          </button>
          <span className="grow" />
          <button className="btn ghost" onClick={() => job.done(null)}>
            Vazgeç
          </button>
          <button className="btn primary" onClick={apply} disabled={!img || busy}>
            Kullan
          </button>
        </footer>
      </div>
    </div>
  );
}

const cx2 = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ */

/**
 * Afişi her yerde aynı gösterir: seçilen kısım (afişin asıl oranındaki görünüm) kutuya
 * sığdırılır; kutu daha genişse ya da daha darsa kalan yer aynı resmin bulanık haliyle dolar.
 * Böylece profil kartı, tam profil ve ses odası kartı resmin aynı kısmını gösterir.
 */
export function BannerPic({
  image,
  framing,
  aspect,
  className,
  align,
  style,
}: {
  image: string;
  framing?: Framing;
  aspect: number;
  className?: string;
  align?: 'end';
  style?: React.CSSProperties;
}) {
  const fs = useMemo(() => {
    const x = framing?.x ?? 50, y = framing?.y ?? 50, zz = (framing?.zoom ?? 100) / 100;
    return { objectPosition: `${x}% ${y}%`, transformOrigin: `${x}% ${y}%`, transform: zz !== 1 ? `scale(${zz})` : undefined } as React.CSSProperties;
  }, [framing?.x, framing?.y, framing?.zoom]);
  return (
    <span className={cx2('bpic', align === 'end' && 'bpic-end', className)} style={{ ...style, ['--ba' as any]: aspect }} aria-hidden>
      <img className="bpic-fill" src={image} alt="" draggable={false} />
      <span className="bpic-frame">
        <img src={image} alt="" draggable={false} style={fs} />
      </span>
    </span>
  );
}

/** Ayar ekranlarında yüklenmiş resmin seçilen kısmını gösteren küçük kutu */
export function CropPreview({ image, framing, aspect, round, onClick }: { image: string; framing?: Framing; aspect: number; round?: boolean; onClick?: () => void }) {
  return (
    <div className={cx2('crop-preview', round && 'round', onClick && 'click')} style={{ aspectRatio: String(aspect) }} onClick={onClick}>
      <BannerPic image={image} framing={framing} aspect={aspect} />
    </div>
  );
}

/* Yükleme noktalarının hazır ayarları */
export const bannerCropOpts = (h?: number): CropOpts => ({
  title: 'Profil afişi',
  aspect: 330 / (h || BANNER_H.def),
  outW: 990,
  max: BANNER_MAX,
  keepGif: true,
  hint: 'Profil kartında, tam profilde ve ses odasında hep bu kısım görünür.',
});
export const BG_CROP: CropOpts = { title: 'Profil arka planı', aspect: 330 / 470, outW: 660, max: BG_MAX, keepGif: true, hint: 'Profil kartının arkasında bu kısım görünür.' };
export const AVATAR_CROP: CropOpts = { title: 'Profil resmi', aspect: 1, outW: 256, max: 120_000, round: true, hint: 'Yuvarlak çerçevenin içi profil resmin olur.' };
export const ICON_CROP: CropOpts = { title: 'Topluluk simgesi', aspect: 1, outW: 256, max: 120_000, hint: 'Sol şeritte ve davetlerde bu kısım görünür.' };
export const BOT_CROP: CropOpts = { title: 'Bot resmi', aspect: 1, outW: 160, max: 100_000, round: true };
