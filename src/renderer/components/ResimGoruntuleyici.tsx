// Resim görüntüleyici: yakınlaştırma (tekerlek, çift tık, +/−), sürükleyerek gezdirme,
// aynı kanaldaki resimler arasında ok tuşlarıyla geçiş, resmi kopyalama.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useStore, openModal, hostHttp, toast } from '../lib/store';
import { cx } from '../lib/util';
import '../styles/kucuk-ekler.css';

type Pic = { src: string; name: string };
const ZMAX = 6;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Açık kanalda yüklü mesajlardaki resimler (eskiden yeniye). Tıklanan resim listede yoksa tek başına gösterilir. */
function siblings(first: Pic): { list: Pic[]; at: number } {
  const s = useStore.getState();
  const cid = s.current;
  const ch = cid && cid !== 'home' ? s.chanByComm[cid] : undefined;
  const items = ch ? s.chans[ch]?.items : undefined;
  if (!items) return { list: [first], at: 0 };
  const base = hostHttp(cid);
  const list: Pic[] = [];
  for (const m of items)
    for (const a of m.attachments || [])
      if (a.mime?.startsWith('image/')) list.push({ src: a.url.startsWith('blob:') ? a.url : base + a.url, name: a.name });
  const at = list.findIndex((p) => p.src === first.src);
  return at < 0 ? { list: [first], at: 0 } : { list, at };
}

async function copyImage(src: string) {
  const blob = await (await fetch(src)).blob();
  let png = blob;
  if (blob.type !== 'image/png') {
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement('canvas');
    cv.width = bmp.width;
    cv.height = bmp.height;
    cv.getContext('2d')!.drawImage(bmp, 0, 0);
    png = await new Promise<Blob>((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('png'))), 'image/png'));
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

export function ResimGoruntuleyici({ src, name }: Pic) {
  const { list, at } = useMemo(() => siblings({ src, name }), [src, name]);
  const [i, setI] = useState(at);
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const cur = list[i] || { src, name };
  const many = list.length > 1;

  const close = useCallback(() => openModal(null), []);
  const reset = () => (setZ(1), setPos({ x: 0, y: 0 }));
  const go = useCallback(
    (d: number) => {
      if (list.length < 2) return;
      setI((x) => (x + d + list.length) % list.length);
      setZ(1);
      setPos({ x: 0, y: 0 });
    },
    [list.length],
  );
  const zoomBy = (f: number) =>
    setZ((v) => {
      const n = clamp(+(v * f).toFixed(3), 1, ZMAX);
      if (n === 1) setPos({ x: 0, y: 0 });
      return n;
    });

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === '+' || e.key === '=') zoomBy(1.25);
      else if (e.key === '-') zoomBy(0.8);
      else if (e.key === '0') reset();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [close, go]);

  const onCopy = () =>
    copyImage(cur.src).then(
      () => toast('Resim kopyalandı', 'ok'),
      () => toast('Resim kopyalanamadı.', 'err'),
    );

  return (
    <div
      className="image-viewer rg"
      onClick={close}
      onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
    >
      <div className="rg-top" onClick={(e) => e.stopPropagation()}>
        <span className="rg-name" title={cur.name}>
          {cur.name}
        </span>
        {many && (
          <span className="rg-count">
            {i + 1} / {list.length}
          </span>
        )}
        <span className="rg-space" />
        <button className="rg-btn" onClick={() => zoomBy(0.8)} disabled={z <= 1} aria-label="Uzaklaştır" title="Uzaklaştır (−)">
          <ZoomOut size={17} />
        </button>
        <button className="rg-zoom" onClick={reset} title="Sığdır (0)">
          %{Math.round(z * 100)}
        </button>
        <button className="rg-btn" onClick={() => zoomBy(1.25)} disabled={z >= ZMAX} aria-label="Yakınlaştır" title="Yakınlaştır (+)">
          <ZoomIn size={17} />
        </button>
        <i className="rg-sep" />
        <button className="rg-btn" onClick={onCopy} aria-label="Resmi kopyala" title="Resmi kopyala">
          <Copy size={16} />
        </button>
        <a className="rg-btn" href={cur.src} download={cur.name} aria-label="İndir" title="İndir">
          <Download size={16} />
        </a>
        <button className="rg-btn" onClick={() => window.kovan.openExternal(cur.src)} aria-label="Tarayıcıda aç" title="Tarayıcıda aç">
          <ExternalLink size={16} />
        </button>
        <button className="rg-btn" onClick={close} aria-label="Kapat" title="Kapat (Esc)">
          <X size={18} />
        </button>
      </div>
      {many && (
        <button className="rg-nav prev" onClick={(e) => (e.stopPropagation(), go(-1))} aria-label="Önceki resim">
          <ChevronLeft size={26} />
        </button>
      )}
      <img
        key={cur.src}
        src={cur.src}
        alt={cur.name}
        draggable={false}
        className={cx(z > 1 && 'zoomed', dragging && 'dragging')}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${z})` }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => (z > 1 ? reset() : setZ(2.5))}
        onPointerDown={(e) => {
          if (z <= 1 || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, moved: false };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setPos({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
        }}
        onPointerUp={() => ((drag.current = null), setDragging(false))}
        onPointerCancel={() => ((drag.current = null), setDragging(false))}
      />
      {many && (
        <button className="rg-nav next" onClick={(e) => (e.stopPropagation(), go(1))} aria-label="Sonraki resim">
          <ChevronRight size={26} />
        </button>
      )}
    </div>
  );
}
