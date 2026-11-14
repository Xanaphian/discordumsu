// Ana Sayfa > Son eklenenler: sürüm sürüm ne geldiği, ekran görüntüleriyle.
// Veri lib/yenilikler.ts'ten (release-notes/*.md + release-notes/gorseller/<sürüm>/).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Search, Images, ChevronDown, ChevronLeft, ChevronRight, X, CalendarDays, Wrench } from 'lucide-react';
import { useStore } from '../lib/store';
import { kayitlar, gruplar, cmpVersion, sonGorulen, gorulduIsaretle, type Kayit, type Blok, type Gorsel, type Grup } from '../lib/yenilikler';
import { cx } from '../lib/util';
import { kucukResim, kucukGenislik } from '../lib/kucukResim';
import '../styles/son-eklenenler.css';

function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] ? <b key={m.index}>{m[1]}</b> : <code key={m.index}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function Govde({ blocks, limit }: { blocks: Blok[]; limit?: number }) {
  // limit: kaç madde/paragraf gösterilecek (kapalıyken)
  let left = limit ?? Infinity;
  const out: React.ReactNode[] = [];
  blocks.forEach((b, i) => {
    if (left <= 0) return;
    if (b.t === 'h') out.push(<h4 key={i}>{inline(b.text)}</h4>);
    else if (b.t === 'p') {
      out.push(<p key={i}>{inline(b.text)}</p>);
      left--;
    } else {
      const items = b.items.slice(0, left);
      left -= items.length;
      out.push(
        <ul key={i}>
          {items.map((it, j) => (
            <li key={j}>
              {inline(it.text)}
              {it.sub.length > 0 && (
                <ul>
                  {it.sub.map((s, k) => (
                    <li key={k}>{inline(s)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>,
      );
    }
  });
  return <div className="se-body">{out}</div>;
}
const sayi = (blocks: Blok[]) => blocks.reduce((n, b) => n + (b.t === 'ul' ? b.items.length : b.t === 'p' ? 1 : 0), 0);

// Görsel yalnız ekrana yakınken yüklenir ve gösterildiği boyuta inmiş kopyası kullanılır (lib/kucukResim);
// uzaklaşınca bırakılır. 140'ı aşkın ekran görüntüsünün hepsi tam boyda çözülüp bellekte kalınca arayüz
// ~400 MB şişiyordu. Kutunun boyutu CSS'teki en-boy oranından geldiği için yerleşim kaymaz.
function Resim({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    let want = false;
    const io = new IntersectionObserver(
      ([e]) => {
        want = e.isIntersecting;
        if (!want) return setUrl(undefined);
        kucukResim(src, kucukGenislik(el.clientWidth)).then((u) => live && want && setUrl(u));
      },
      // büyük görsel penceresi (sabit konumlu) kaydırıcının içinde sayılmaz; orada pencerenin kendisine bakılır
      { root: el.closest('.se-lb') ? null : el.closest('.se'), rootMargin: '900px 0px' },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [src]);
  return <img ref={ref} src={url} alt={url ? alt : ''} decoding="async" draggable={false} />;
}

function Galeri({ images, onOpen, small }: { images: Gorsel[]; onOpen: (i: number) => void; small?: boolean }) {
  if (!images.length) return null;
  const shown = images.slice(0, small ? 4 : 3);
  const more = images.length - shown.length;
  return (
    <div className={cx('se-gal', small ? 'small' : `n${shown.length}`)}>
      {shown.map((g, i) => (
        <button key={g.src} className="se-shot" onClick={() => onOpen(i)} title={g.caption}>
          <Resim src={g.src} alt={g.caption} />
          {!small && <span className="se-cap">{g.caption}</span>}
          {more > 0 && i === shown.length - 1 && <span className="se-more">+{more}</span>}
        </button>
      ))}
    </div>
  );
}

function Isik({ k, start, onClose }: { k: Kayit; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const n = k.images.length;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((x) => (x + 1) % n);
      else if (e.key === 'ArrowLeft') setI((x) => (x - 1 + n) % n);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [n, onClose]);
  const g = k.images[i];
  return (
    <div className="se-lb" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="se-lb-top">
        <span className="se-ver">v{k.version}</span>
        <b>{k.title}</b>
        <span className="se-lb-n">
          {i + 1} / {n}
        </span>
        <button className="se-lb-x" onClick={onClose} aria-label="Kapat">
          <X size={20} />
        </button>
      </div>
      <div className="se-lb-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {n > 1 && (
          <button className="se-lb-nav l" onClick={() => setI((i - 1 + n) % n)} aria-label="Önceki">
            <ChevronLeft size={26} />
          </button>
        )}
        <img key={g.src} src={g.src} alt={g.caption} draggable={false} />
        {n > 1 && (
          <button className="se-lb-nav r" onClick={() => setI((i + 1) % n)} aria-label="Sonraki">
            <ChevronRight size={26} />
          </button>
        )}
      </div>
      <div className="se-lb-cap">{g.caption}</div>
      {n > 1 && (
        <div className="se-lb-thumbs">
          {k.images.map((x, j) => (
            <button key={x.src} className={cx(j === i && 'on')} onClick={() => setI(j)} aria-label={x.caption}>
              <Resim src={x.src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LIMIT = 5;

function Yama({ k, open, onImg, isNew, current }: { k: Kayit; open: boolean; onImg: (k: Kayit, i: number) => void; isNew: boolean; current: boolean }) {
  const [o, setO] = useState(open);
  useEffect(() => setO(open), [open]);
  return (
    <div className={cx('se-patch', o && 'open')}>
      <button className="se-patch-h" onClick={() => setO(!o)} aria-expanded={o}>
        <span className="se-ver sm">v{k.version}</span>
        <span className="se-patch-t">{k.title}</span>
        {isNew && <span className="se-new">Yeni</span>}
        {current && <span className="se-cur">Kullandığın</span>}
        {k.images.length > 0 && (
          <span className="se-patch-img">
            <Images size={13} /> {k.images.length}
          </span>
        )}
        <ChevronDown size={16} className="se-chev" />
      </button>
      {o && (
        <div className="se-patch-b">
          <Govde blocks={k.blocks} />
          <Galeri images={k.images} small onOpen={(i) => onImg(k, i)} />
        </div>
      )}
    </div>
  );
}

function Kart({ g, onImg, seen, current, q }: { g: Grup; onImg: (k: Kayit, i: number) => void; seen: string; current?: string; q: boolean }) {
  const k = g.main;
  const [all, setAll] = useState(false);
  const isNew = (v: string) => !!seen && cmpVersion(v, seen) > 0;
  const long = sayi(k.blocks) > LIMIT + 1;
  return (
    <article className={cx('se-card', isNew(k.version) && 'fresh')} id={`se-${g.key}`}>
      <span className="se-dot" aria-hidden />
      <header className="se-card-h">
        <span className="se-ver">v{k.version}</span>
        {isNew(k.version) && <span className="se-new">Yeni</span>}
        {current === k.version && <span className="se-cur">Kullandığın sürüm</span>}
        {g.patches.length > 0 && (
          <span className="se-meta">
            <Wrench size={13} /> {g.patches.length} düzeltme sürümü
          </span>
        )}
      </header>
      <h2>{k.title}</h2>
      <Galeri images={k.images} onOpen={(i) => onImg(k, i)} />
      <Govde blocks={k.blocks} limit={long && !all && !q ? LIMIT : undefined} />
      {long && !q && (
        <button className="se-toggle" onClick={() => setAll(!all)}>
          {all ? 'Daha az göster' : `Tümünü göster (${sayi(k.blocks) - LIMIT} madde daha)`}
          <ChevronDown size={15} className={cx(all && 'up')} />
        </button>
      )}
      {g.patches.length > 0 && (
        <div className="se-patches">
          {g.patches.map((p) => (
            <Yama key={p.version} k={p} open={q} onImg={onImg} isNew={isNew(p.version)} current={current === p.version} />
          ))}
        </div>
      )}
    </article>
  );
}

const gunFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
const gunAdi = (d: string) => (d ? gunFmt.format(new Date(d + 'T12:00:00')) : 'Tarihsiz');

export function SonEklenenler() {
  const current = useStore((s) => s.info?.version);
  const all = kayitlar();
  const [seen] = useState(sonGorulen); // açılıştaki hâl: "Yeni" etiketleri buna göre
  const [q, setQ] = useState('');
  const [onlyImg, setOnlyImg] = useState(false);
  const [lb, setLb] = useState<{ k: Kayit; i: number } | null>(null);
  const [active, setActive] = useState('');
  const feed = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement>(null);

  useEffect(() => {
    if (all[0]) gorulduIsaretle(all[0].version);
  }, [all]);

  const n = q.trim().toLocaleLowerCase('tr');
  const groups = useMemo(() => {
    const list = all.filter((k) => (!n || k.text.includes(n)) && (!onlyImg || k.images.length));
    return gruplar(list);
  }, [all, n, onlyImg]);
  const days = useMemo(() => {
    const m: { day: string; groups: Grup[] }[] = [];
    for (const g of groups) {
      const d = g.main.date;
      if (m[m.length - 1]?.day === d) m[m.length - 1].groups.push(g);
      else m.push({ day: d, groups: [g] });
    }
    return m;
  }, [groups]);
  const shots = useMemo(() => all.reduce((s, k) => s + k.images.length, 0), [all]);

  // sağdaki dizinde ekranda olan sürüm vurgulansın
  useEffect(() => {
    const root = scroller.current;
    if (!root || !feed.current) return;
    const io = new IntersectionObserver(
      (es) => {
        const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id.slice(3));
      },
      { root, rootMargin: '-20% 0px -60% 0px' },
    );
    feed.current.querySelectorAll('.se-card').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [groups]);

  const go = (key: string) => {
    const el = document.getElementById(`se-${key}`);
    const root = scroller.current;
    if (el && root) root.scrollTo({ top: el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 16, behavior: 'smooth' });
  };

  return (
    <section className="ah se scroll-thin" ref={scroller}>
      <div className="ah-in se-in">
        <header className="se-hero">
          <div className="se-hero-t">
            <span className="se-kicker">
              <Sparkles size={14} /> Sürüm notları
            </span>
            <h1>Son eklenenler</h1>
            <p>Xanaphian'a sürüm sürüm neler geldi, ekran görüntüleriyle.</p>
          </div>
          <div className="se-stats">
            <div>
              <b>{all.length}</b>
              <span>sürüm</span>
            </div>
            <div>
              <b>{shots}</b>
              <span>ekran görüntüsü</span>
            </div>
            {current && (
              <div>
                <b>v{current}</b>
                <span>kullandığın</span>
              </div>
            )}
          </div>
          <div className="se-tools">
            <label className="ex-search se-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Özellik ara: afiş, ses, profil…" />
              {q && (
                <button onClick={() => setQ('')} aria-label="Temizle">
                  <X size={14} />
                </button>
              )}
            </label>
            <button className={cx('ex-chip', !onlyImg && 'on')} onClick={() => setOnlyImg(false)}>
              Hepsi
            </button>
            <button className={cx('ex-chip', onlyImg && 'on')} onClick={() => setOnlyImg(true)}>
              <Images size={14} /> Görselli olanlar
            </button>
          </div>
        </header>

        <div className="se-layout">
          <div className="se-feed" ref={feed}>
            {days.map((d) => (
              <div key={d.day} className="se-daygrp">
                <div className="se-day">
                  <CalendarDays size={14} />
                  <span>{gunAdi(d.day)}</span>
                  <i>{d.groups.reduce((s, g) => s + 1 + g.patches.length, 0)} sürüm</i>
                </div>
                {d.groups.map((g) => (
                  <Kart key={g.key} g={g} seen={seen} current={current} q={!!n} onImg={(k, i) => setLb({ k, i })} />
                ))}
              </div>
            ))}
            {!groups.length && (
              <div className="tp-empty se-empty">
                <Search size={24} />
                <b>Aramana uyan sürüm yok</b>
                <span>Başka bir kelime dene ya da aramayı temizle.</span>
              </div>
            )}
          </div>
          <nav className="se-index scroll-thin" aria-label="Sürümler">
            <div className="se-index-h">Sürümler</div>
            {groups.map((g) => (
              <button key={g.key} className={cx('se-ix', active === g.key && 'on')} onClick={() => go(g.key)}>
                <span className="se-ix-v">{g.key}</span>
                <span className="se-ix-t">{g.main.title}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
      {lb && <Isik k={lb.k} start={lb.i} onClose={() => setLb(null)} />}
    </section>
  );
}
