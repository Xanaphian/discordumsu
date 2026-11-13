import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, RotateCcw, Upload, Trash2, Plus, X, Smile, ImagePlus, Link as LinkIcon } from 'lucide-react';
import { useStore, updateProfile, toast, meAsUser } from '../../lib/store';
import { Avatar, Toggle } from '../Common';
import { EmojiPicker } from '../Overlays';
import { cx, COLORS, resizeImage } from '../../lib/util';
import {
  ACTIVITY_KINDS, BANNER_H, BANNER_MAX, BG_MAX, BIO_MAX, EFFECTS, FRAMES, NAME_FONTS, NAME_FX, PATTERNS, SHAPES, sanitizeProfile,
  type ActivityKind, type ProfileBanner, type ProfileExtra, type ProfileLink,
} from '../../../shared/profile';
import {
  ACTIVITY_VERB, EFFECT_LABEL, FRAME_LABEL, NAME_FONT_LABEL, NAME_FX_LABEL, PATTERN_LABEL, PRESETS, SHAPE_LABEL, bannerBackground, imgFrameStyle, linkBrand,
} from './look';
import { NameText, ProfileCard } from './ProfileCard';

interface Draft {
  name: string;
  bio: string;
  color: string;
  avatar?: string;
  extra: ProfileExtra;
}

const UNTIL: [string, number | null][] = [
  ['Süresiz', null],
  ['30 dakika', 30 * 60e3],
  ['1 saat', 60 * 60e3],
  ['4 saat', 4 * 60 * 60e3],
  ['Bugün', -1],
  ['1 hafta', 7 * 24 * 60 * 60e3],
];

function untilFrom(v: number | null): number | undefined {
  if (v === null) return undefined;
  if (v === -1) {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  return Date.now() + v;
}

/** Görseli verilen en-boy oranına kırpıp küçültür (afiş için). */
function resizeCover(file: File, w: number, h: number, max = BANNER_MAX, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const r = w / h;
      let sw = img.width, sh = img.width / r;
      if (sh > img.height) {
        sh = img.height;
        sw = img.height * r;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let q = quality;
      let out = canvas.toDataURL('image/webp', q);
      while (out.length > max && q > 0.3) out = canvas.toDataURL('image/webp', (q -= 0.15));
      resolve(out);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Hareketli GIF sığıyorsa olduğu gibi kalır (animasyon korunur), yoksa kırpılıp küçültülür. */
function readImage(file: File, w: number, h: number, max: number): Promise<string> {
  if (file.type === 'image/gif' && Math.ceil(file.size / 3) * 4 + 30 <= max) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  if (file.type === 'image/gif') toast('GIF çok büyük olduğu için hareketsiz resme çevrildi.', 'info');
  return resizeFit(file, w, h, max);
}

/** Resmi kırpmadan verilen kutuya sığdırıp küçültür; hangi kısmın görüneceği sonra seçilir. */
function resizeFit(file: File, w: number, h: number, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let scale = Math.min(1, w / img.width, h / img.height);
      const draw = () => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const g = c.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, c.width, c.height);
        let q = 0.85;
        let out = c.toDataURL('image/webp', q);
        while (out.length > max && q > 0.4) out = c.toDataURL('image/webp', (q -= 0.12));
        return out;
      };
      let out = draw();
      while (out.length > max && scale > 0.2) {
        scale *= 0.8;
        out = draw();
      }
      resolve(out);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

type Framing = { x?: number; y?: number; zoom?: number };

/** Resmi sürükleyerek konumlandırma, tekerlek ya da kaydırıcıyla yakınlaştırma */
function ImageFramer({ src, value, onChange, aspect, tall }: { src: string; value: Framing; onChange: (f: Framing) => void; aspect: number; tall?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  // resmin tamamının sığdığı yakınlık (cover'a göre)
  const fitZoom = nat ? Math.max(20, Math.floor((Math.min(aspect / (nat.w / nat.h), (nat.w / nat.h) / aspect)) * 100)) : 100;
  const minZoom = Math.min(100, fitZoom);
  const x = value.x ?? 50, y = value.y ?? 50, zoom = value.zoom ?? 100;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x, y };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = box.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const k = 100 / (zoom / 100);
    onChange({ ...value, x: Math.round(clamp(d.x - ((e.clientX - d.px) / r.width) * k * 1.4, 0, 100)), y: Math.round(clamp(d.y - ((e.clientY - d.py) / r.height) * k * 1.4, 0, 100)) });
  };
  const onUp = () => (drag.current = null);
  return (
    <div className="pe-framer">
      <div
        ref={box}
        className={cx('pe-frame', tall && 'tall')}
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => onChange({ ...value, zoom: clamp(Math.round(zoom - e.deltaY * 0.15), minZoom, 300) })}
      >
        <img src={src} alt="" draggable={false} style={imgFrameStyle(value)} onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        <span className="pe-frame-hint">Sürükleyerek konumla</span>
      </div>
      <div className="pe-frame-opts">
        <label className="pe-slider">
          <em>Yakınlaştır %{zoom}</em>
          <input type="range" min={minZoom} max={300} value={zoom} onChange={(e) => onChange({ ...value, zoom: Number(e.target.value) })} />
        </label>
        <div className="pe-nudge">
          {(
            [
              ['Sol', { x: 0 }],
              ['Orta', { x: 50, y: 50 }],
              ['Sağ', { x: 100 }],
              ['Üst', { y: 0 }],
              ['Alt', { y: 100 }],
            ] as [string, Framing][]
          ).map(([l, f]) => (
            <button key={l} className="btn ghost sm" onClick={() => onChange({ ...value, ...f })}>
              {l}
            </button>
          ))}
          <button className="btn ghost sm" onClick={() => onChange({ ...value, x: 50, y: 50, zoom: fitZoom })} title="Resmin tamamını göster">
            Tamamı
          </button>
          <button className="btn ghost sm" onClick={() => onChange({ ...value, x: 50, y: 50, zoom: 100 })} title="Alanı doldur">
            Doldur
          </button>
        </div>
      </div>
    </div>
  );
}

type TabId = 'basic' | 'media' | 'style' | 'more';
const TABS: [TabId, string, string][] = [
  ['basic', 'Temel', 'Ad, fotoğraf, durum, hakkımda'],
  ['media', 'Afiş ve arka plan', 'Resimler, konum ve yükseklik'],
  ['style', 'Süsler', 'Hazır görünümler, çerçeve, isim stili'],
  ['more', 'Bağlantılar', 'Bağlantılar, saat, doğum günü'],
];
const TAB_OF: Record<string, TabId> = {
  identity: 'basic',
  status: 'basic',
  about: 'basic',
  banner: 'media',
  bg: 'media',
  presets: 'style',
  avatar: 'style',
  name: 'style',
  card: 'style',
  links: 'more',
  extra: 'more',
};
const TabCtx = createContext<TabId>('basic');

/** Başka bir yerden profil düzenleyicinin belli bir bölümünü açmak için */
export function focusProfileSection(id: string) {
  try {
    sessionStorage.setItem('kovan.peFocus', id);
  } catch {}
}


function Section({ id, title, sub, children, right }: { id?: string; title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  const tab = useContext(TabCtx);
  if (id && TAB_OF[id] && TAB_OF[id] !== tab) return null;
  return (
    <section className="pe-sec" id={id ? 'pe-' + id : undefined}>
      <header>
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function ColorPick({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="pe-color" title={label}>
      <span style={{ background: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      {label && <em>{label}</em>}
    </label>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="pe-seg">
      {options.map(([v, l]) => (
        <button key={v} className={cx(value === v && 'on')} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

const rnd = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const rndColor = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

export function ProfileEditor() {
  const me = useStore((s) => s.me);
  const initial = useMemo<Draft>(() => ({ name: me.name, bio: me.bio || '', color: me.color, avatar: me.avatar, extra: me.extra || {} }), [me]);
  const [d, setD] = useState<Draft>(initial);
  const [emojiAt, setEmojiAt] = useState<{ x: number; y: number } | null>(null);
  const [tagInput, setTagInput] = useState('');
  const avatarFile = useRef<HTMLInputElement>(null);
  const bannerFile = useRef<HTMLInputElement>(null);
  const bgFile = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>('basic');
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem('kovan.peFocus');
      sessionStorage.removeItem('kovan.peFocus');
    } catch {}
    if (id && TAB_OF[id]) setTab(TAB_OF[id]);
  }, []);
  const x = d.extra;
  const setX = (patch: Partial<ProfileExtra>) => setD((o) => ({ ...o, extra: { ...o.extra, ...patch } }));
  const banner: ProfileBanner = x.banner || { kind: 'gradient', a: d.color, b: '#1a1306', angle: 135, pattern: 'honeycomb' };
  const setBanner = (patch: Partial<ProfileBanner>) => setX({ banner: { ...banner, ...patch } });

  const clean = (dr: Draft) => JSON.stringify({ ...dr, name: dr.name.trim(), bio: dr.bio.trim(), extra: sanitizeProfile(dr.extra) || {} });
  const dirty = clean(d) !== clean(initial);
  const save = async () => {
    if (!d.name.trim()) return toast('Görünen ad boş olamaz.', 'err');
    await updateProfile({ name: d.name.trim(), bio: d.bio.trim(), color: d.color, avatar: d.avatar, extra: d.extra });
    toast('Profil kaydedildi', 'ok');
  };

  const previewUser = { ...meAsUser(me), name: d.name || 'İsimsiz', color: d.color, avatar: d.avatar, bio: d.bio.trim() || undefined, profile: sanitizeProfile(d.extra) };
  const status = me.status === 'invisible' ? 'offline' : me.status;

  const randomize = () => {
    const a = rndColor(), b = rndColor();
    setX({
      banner: x.banner?.kind === 'image' ? x.banner : { kind: 'gradient', a, b, angle: Math.floor(Math.random() * 360), pattern: rnd(PATTERNS) },
      theme: Math.random() < 0.6 ? { a: '#' + Math.floor(Math.random() * 0x303030).toString(16).padStart(6, '0'), b: '#0c0b0a' } : undefined,
      shape: rnd(SHAPES),
      frame: rnd(FRAMES),
      frameColor: a,
      nameFx: rnd(NAME_FX),
      nameB: b,
      nameFont: rnd(NAME_FONTS),
      effect: rnd(EFFECTS),
    });
  };

  const links = x.links || [];
  const setLinks = (l: ProfileLink[]) => setX({ links: l });
  const tags = x.tags || [];
  const addTag = () => {
    const t = tagInput.trim().slice(0, 20);
    if (!t || tags.length >= 8 || tags.some((y) => y.toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr'))) return setTagInput('');
    setX({ tags: [...tags, t] });
    setTagInput('');
  };
  const bday = x.birthday ? { m: Number(x.birthday.slice(0, 2)), d: Number(x.birthday.slice(3)) } : null;

  return (
    <div className="pe">
      <div className="pe-top">
        <div>
          <h1>Profilim</h1>
          <p className="pe-lead">Kartını, ismini ve avatarını istediğin gibi tasarla. Değişiklikler kaydettiğinde tüm topluluklarında görünür.</p>
        </div>
      </div>
      <nav className="pe-tabs">
        {TABS.map(([id, l, sub]) => (
          <button key={id} className={cx(tab === id && 'on')} onClick={() => setTab(id)}>
            <b>{l}</b>
            <small>{sub}</small>
          </button>
        ))}
      </nav>
      <TabCtx.Provider value={tab}>
      <div className="pe-grid">
        <div className="pe-form">
          <Section
            id="presets"
            title="Hazır görünümler"
            sub="Tek tıkla afiş, kart teması, çerçeve ve isim efekti uygula; sonra istediğin gibi değiştir."
            right={
              <div className="btn-row">
                <button className="btn ghost sm" onClick={randomize} title="Rastgele görünüm">
                  <Dices size={15} /> Rastgele
                </button>
                <button
                  className="btn ghost sm"
                  title="Görünümü sıfırla"
                  onClick={() =>
                    setX({ banner: undefined, bg: undefined, theme: undefined, frame: undefined, frameColor: undefined, nameFx: undefined, nameB: undefined, nameFont: undefined, effect: undefined, shape: undefined })
                  }
                >
                  <RotateCcw size={14} /> Sade
                </button>
              </div>
            }
          >
            <div className="pe-presets">
              {PRESETS.map((p) => (
                <button key={p.id} className="pe-preset" onClick={() => setX({ ...p.extra })}>
                  <span className={cx('pe-preset-art', p.extra.banner?.pattern && 'pat-' + p.extra.banner.pattern)} style={{ background: bannerBackground(p.extra.banner, d.color) }} />
                  <span className="pe-preset-card" style={{ background: p.extra.theme ? `linear-gradient(${p.extra.theme.a}, ${p.extra.theme.b})` : undefined }} />
                  <b>{p.name}</b>
                </button>
              ))}
            </div>
          </Section>

          <Section id="banner" title="Afiş" sub="Kartının üst kısmı. Renk, degrade, desen ya da kendi resmin (hareketli GIF de olur).">
            <Seg
              value={banner.kind}
              options={[
                ['solid', 'Düz renk'],
                ['gradient', 'Degrade'],
                ['image', 'Resim'],
              ]}
              onChange={(k) => (k === 'image' && !banner.image ? bannerFile.current?.click() : setBanner({ kind: k }))}
            />
            <label className="pe-slider pe-height">
              <em>Afiş yüksekliği {banner.h || BANNER_H.def} px</em>
              <input type="range" min={BANNER_H.min} max={BANNER_H.max} value={banner.h || BANNER_H.def} onChange={(e) => setBanner({ h: Number(e.target.value) })} />
            </label>
            <input
              ref={bannerFile}
              hidden
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  setBanner({ kind: 'image', image: await readImage(f, 1100, 700, BANNER_MAX), x: undefined, y: undefined, zoom: undefined });
                } catch {
                  toast('Resim okunamadı.', 'err');
                }
              }}
            />
            {banner.kind === 'image' && banner.image ? (
              <>
                <ImageFramer src={banner.image} value={banner} onChange={(f) => setBanner(f)} aspect={330 / (banner.h || BANNER_H.def)} />
                <div className="pe-inline">
                  <button className="btn ghost sm" onClick={() => bannerFile.current?.click()}>
                    <ImagePlus size={14} /> Başka resim seç
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="pe-inline">
                  <ColorPick value={banner.a} onChange={(a) => setBanner({ a })} label={banner.kind === 'gradient' ? 'Başlangıç' : 'Renk'} />
                  {banner.kind === 'gradient' && (
                    <>
                      <ColorPick value={banner.b || banner.a} onChange={(b) => setBanner({ b })} label="Bitiş" />
                      <label className="pe-slider">
                        <em>Açı {banner.angle ?? 135}°</em>
                        <input type="range" min={0} max={359} value={banner.angle ?? 135} onChange={(e) => setBanner({ angle: Number(e.target.value) })} />
                      </label>
                    </>
                  )}
                </div>
                <div className="pe-tiles">
                  {PATTERNS.map((p) => (
                    <button key={p} className={cx('pe-tile', (banner.pattern || 'none') === p && 'on')} onClick={() => setBanner({ pattern: p })}>
                      <span className={cx('pe-tile-art pat-' + p)} style={{ background: bannerBackground({ ...banner, pattern: p, kind: banner.kind }, d.color) }} />
                      {PATTERN_LABEL[p]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Section>

          <Section
            id="bg"
            title="Profil arka planı"
            sub="Tüm profil kartının arkasına kendi resmini koy. Afişin üstte kalır, yazılar okunsun diye resmi karartabilirsin."
          >
            <input
              ref={bgFile}
              hidden
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  setX({ bg: { dim: 45, blur: 0, ...x.bg, image: await readImage(f, 900, 1100, BG_MAX), x: undefined, y: undefined, zoom: undefined } });
                } catch {
                  toast('Resim okunamadı.', 'err');
                }
              }}
            />
            {x.bg ? (
              <div className="pe-bg">
                <ImageFramer src={x.bg.image} value={x.bg} onChange={(f) => setX({ bg: { ...x.bg!, ...f } })} aspect={330 / 470} tall />
                <div className="pe-bg-opts">
                  <label className="pe-slider">
                    <em>Karartma %{x.bg.dim ?? 45}</em>
                    <input type="range" min={0} max={85} value={x.bg.dim ?? 45} onChange={(e) => setX({ bg: { ...x.bg!, dim: Number(e.target.value) } })} />
                  </label>
                  <label className="pe-slider">
                    <em>Bulanıklık {x.bg.blur ?? 0} px</em>
                    <input type="range" min={0} max={16} value={x.bg.blur ?? 0} onChange={(e) => setX({ bg: { ...x.bg!, blur: Number(e.target.value) } })} />
                  </label>
                  <div className="btn-row">
                    <button className="btn ghost sm" onClick={() => bgFile.current?.click()}>
                      <ImagePlus size={14} /> Değiştir
                    </button>
                    <button className="btn ghost sm" onClick={() => setX({ bg: undefined })}>
                      <Trash2 size={14} /> Kaldır
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pe-bg">
                <button className="pe-bg-pick" onClick={() => bgFile.current?.click()}>
                  <ImagePlus size={22} />
                  <span>Resim seç</span>
                </button>
                <div className="pe-bg-opts">
                  <span className="note">Herhangi bir resim seç; sonra sürükleyerek hangi kısmının görüneceğini, kaydırıcıyla yakınlığını ayarlarsın. Hareketli GIF de olur (en fazla ~160 KB).</span>
                </div>
              </div>
            )}
          </Section>

          <Section id="identity" title="Kimlik">
            <div className="pe-row2">
              <label className="field">
                <span>Görünen ad</span>
                <input value={d.name} maxLength={32} onChange={(e) => setD({ ...d, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Zamirler</span>
                <input value={x.pronouns || ''} maxLength={24} placeholder="ör. o/onu" onChange={(e) => setX({ pronouns: e.target.value })} />
              </label>
            </div>
            <div className="field">
              <span>Profil resmi</span>
              <div className="pe-avatar-row">
                <Avatar user={previewUser} size={56} plain />
                <button className="btn primary sm" onClick={() => avatarFile.current?.click()}>
                  <Upload size={14} /> Resim yükle
                </button>
                {d.avatar && (
                  <button className="btn ghost sm" onClick={() => setD({ ...d, avatar: undefined })}>
                    Kaldır
                  </button>
                )}
              </div>
              <input
                ref={avatarFile}
                hidden
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  const av = await resizeImage(f, 160);
                  setD((o) => ({ ...o, avatar: av }));
                }}
              />
            </div>
            <div className="field">
              <span>Profil rengi</span>
              <div className="swatches">
                {COLORS.map((c) => (
                  <button key={c} className={cx('swatch', c === d.color && 'on')} style={{ background: c }} onClick={() => setD({ ...d, color: c })} aria-label={c} />
                ))}
                <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="color-input" />
              </div>
            </div>
          </Section>

          <Section id="status" title="Durum ve etkinlik" sub="İsminin altında ve profil kartında konuşma balonu olarak görünür.">
            <div className="field">
              <span>Özel durum</span>
              <div className="pe-status">
                <button className="pe-emoji-btn" onClick={(e) => setEmojiAt({ x: e.clientX, y: e.clientY })} title="Emoji seç">
                  {x.custom?.emoji || <Smile size={18} />}
                </button>
                <input
                  value={x.custom?.text || ''}
                  maxLength={80}
                  placeholder="Ne yapıyorsun?"
                  onChange={(e) => setX({ custom: { ...x.custom, text: e.target.value } })}
                />
                <select
                  value=""
                  onChange={(e) => {
                    const v = UNTIL[Number(e.target.value)];
                    if (v) setX({ custom: { ...x.custom, until: untilFrom(v[1]) } });
                  }}
                >
                  <option value="" disabled>
                    {x.custom?.until ? 'Bitiş: ' + new Date(x.custom.until).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'Süresiz'}
                  </option>
                  {UNTIL.map(([l], i) => (
                    <option key={l} value={i}>
                      {l}
                    </option>
                  ))}
                </select>
                {(x.custom?.emoji || x.custom?.text) && (
                  <button className="icon-btn sm" onClick={() => setX({ custom: undefined })} title="Temizle">
                    <X size={15} />
                  </button>
                )}
              </div>
              {emojiAt && (
                <EmojiPicker
                  x={emojiAt.x}
                  y={emojiAt.y + 420}
                  onPick={(e) => {
                    setX({ custom: { ...x.custom, emoji: e } });
                    setEmojiAt(null);
                  }}
                  onClose={() => setEmojiAt(null)}
                />
              )}
            </div>
            <div className="field">
              <span>Etkinlik</span>
              <div className="pe-status">
                <select value={x.activity?.kind || 'playing'} onChange={(e) => setX({ activity: { kind: e.target.value as ActivityKind, text: x.activity?.text || '' } })}>
                  {ACTIVITY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ACTIVITY_VERB[k]}
                    </option>
                  ))}
                </select>
                <input
                  value={x.activity?.text || ''}
                  maxLength={60}
                  placeholder="ör. Minecraft, Lo-fi listesi, bir kitap…"
                  onChange={(e) => setX({ activity: { kind: x.activity?.kind || 'playing', text: e.target.value } })}
                />
                {x.activity?.text && (
                  <button className="icon-btn sm" onClick={() => setX({ activity: undefined })} title="Temizle">
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          </Section>

          <Section id="avatar" title="Avatar">
            <div className="field">
              <span>Şekil</span>
              <div className="pe-tiles">
                <button className={cx('pe-tile', !x.shape && 'on')} onClick={() => setX({ shape: undefined })}>
                  <Avatar user={{ ...previewUser, profile: { ...previewUser.profile, shape: undefined } }} size={44} plain />
                  Temaya göre
                </button>
                {SHAPES.map((s) => (
                  <button key={s} className={cx('pe-tile', x.shape === s && 'on')} onClick={() => setX({ shape: s })}>
                    <Avatar user={previewUser} size={44} shape={s} plain />
                    {SHAPE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Çerçeve</span>
              <div className="pe-tiles">
                {FRAMES.map((f) => (
                  <button key={f} className={cx('pe-tile', (x.frame || 'none') === f && 'on')} onClick={() => setX({ frame: f })}>
                    <Avatar user={{ ...previewUser, profile: { ...previewUser.profile, frame: f } }} size={44} />
                    {FRAME_LABEL[f]}
                  </button>
                ))}
              </div>
              <div className="pe-inline">
                <ColorPick value={x.frameColor || d.color} onChange={(c) => setX({ frameColor: c })} label="Çerçeve rengi" />
                {x.frameColor && (
                  <button className="btn ghost sm" onClick={() => setX({ frameColor: undefined })}>
                    Profil rengini kullan
                  </button>
                )}
              </div>
            </div>
          </Section>

          <Section id="name" title="İsim stili" sub="Sohbette, üye listesinde ve kartında ismin böyle görünür.">
            <div className="field">
              <span>Yazı tipi</span>
              <div className="pe-tiles names">
                {NAME_FONTS.map((f) => (
                  <button key={f} className={cx('pe-tile', (x.nameFont || 'default') === f && 'on')} onClick={() => setX({ nameFont: f })}>
                    <NameText profile={{ ...x, nameFont: f, nameFx: undefined }} className="pe-name-sample">
                      {d.name || 'İsim'}
                    </NameText>
                    {NAME_FONT_LABEL[f]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Efekt</span>
              <div className="pe-tiles names">
                {NAME_FX.map((f) => (
                  <button key={f} className={cx('pe-tile', (x.nameFx || 'none') === f && 'on')} onClick={() => setX({ nameFx: f })}>
                    <NameText profile={{ ...x, nameFx: f, nameB: x.nameB || '#ffffff' }} color={d.color} className="pe-name-sample">
                      {d.name || 'İsim'}
                    </NameText>
                    {NAME_FX_LABEL[f]}
                  </button>
                ))}
              </div>
              {x.nameFx && x.nameFx !== 'none' && (
                <div className="pe-inline">
                  <ColorPick value={x.nameB || '#ffffff'} onChange={(c) => setX({ nameB: c })} label="İkinci renk" />
                  <span className="note">İlk renk rolünün ya da profilinin rengidir.</span>
                </div>
              )}
            </div>
          </Section>

          <Section
            id="card"
            title="Kart teması"
            sub="Profil kartının arka planı. Kapalıyken uygulamanın temasını kullanır."
            right={<Toggle value={!!x.theme} onChange={(v) => setX({ theme: v ? { a: '#2b1d07', b: '#120d06' } : undefined })} />}
          >
            {x.theme && (
              <div className="pe-inline">
                <ColorPick value={x.theme.a} onChange={(a) => setX({ theme: { ...x.theme!, a } })} label="Üst" />
                <ColorPick value={x.theme.b} onChange={(b) => setX({ theme: { ...x.theme!, b } })} label="Alt" />
              </div>
            )}
            <div className="field">
              <span>Kart efekti</span>
              <div className="pe-tiles">
                {EFFECTS.map((f) => (
                  <button key={f} className={cx('pe-tile', (x.effect || 'none') === f && 'on')} onClick={() => setX({ effect: f })}>
                    <span className="pe-fx-ic">{{ none: '—', sparkle: '✦', bees: '🐝', snow: '❄', aurora: '🌌', hearts: '♥' }[f]}</span>
                    {EFFECT_LABEL[f]}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section id="about" title="Hakkımda">
            <label className="field">
              <textarea rows={4} maxLength={BIO_MAX} value={d.bio} onChange={(e) => setD({ ...d, bio: e.target.value })} placeholder="Kendinden biraz bahset" />
              <small className="counter">{BIO_MAX - d.bio.length}</small>
            </label>
            <div className="field">
              <span>İlgi alanları ({tags.length}/8)</span>
              <div className="pe-tags">
                {tags.map((t) => (
                  <span key={t} className="pc-tag">
                    {t}
                    <button onClick={() => setX({ tags: tags.filter((y) => y !== t) })} aria-label="Kaldır">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {tags.length < 8 && (
                  <input
                    value={tagInput}
                    maxLength={20}
                    placeholder="Ekle ve Enter'a bas"
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag();
                      } else if (e.key === 'Backspace' && !tagInput && tags.length) setX({ tags: tags.slice(0, -1) });
                    }}
                    onBlur={addTag}
                  />
                )}
              </div>
            </div>
          </Section>

          <Section id="links" title="Bağlantılar" sub="En fazla 5 bağlantı. GitHub, Instagram, YouTube, Twitch, Spotify, Steam gibi siteler tanınır.">
            <div className="pe-links">
              {links.map((l, i) => {
                const brand = linkBrand(l.url.includes('://') ? l.url : 'https://' + l.url);
                return (
                  <div key={i} className="pe-link">
                    <span className="pc-link-ic" style={brand ? { background: brand.bg } : undefined}>
                      {brand ? brand.tag : <LinkIcon size={13} />}
                    </span>
                    <input value={l.label} maxLength={24} placeholder={brand?.name || 'Başlık'} onChange={(e) => setLinks(links.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                    <input className="grow" value={l.url} maxLength={200} placeholder="https://…" onChange={(e) => setLinks(links.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)))} />
                    <button className="icon-btn sm" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Sil">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              {links.length < 5 && (
                <button className="btn ghost sm" onClick={() => setLinks([...links, { label: '', url: '' }])}>
                  <Plus size={14} /> Bağlantı ekle
                </button>
              )}
            </div>
          </Section>

          <Section id="extra" title="Ek bilgiler">
            <div className="pe-switch-row">
              <div>
                <b>Yerel saatimi göster</b>
                <span>Profiline bakanlar senin saatini ve aranızdaki farkı görür.</span>
              </div>
              <Toggle value={x.tz !== undefined} onChange={(v) => setX({ tz: v ? -new Date().getTimezoneOffset() : undefined })} />
            </div>
            <div className="pe-switch-row">
              <div>
                <b>Doğum günü</b>
                <span>O gün profilinde pasta rozeti çıkar. Yıl istenmez.</span>
              </div>
              <div className="pe-bday">
                <select
                  value={bday?.d || ''}
                  onChange={(e) => {
                    const dd = Number(e.target.value);
                    setX({ birthday: dd ? `${String(bday?.m || 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}` : undefined });
                  }}
                >
                  <option value="">Gün</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <select
                  value={bday?.m || ''}
                  onChange={(e) => {
                    const mm = Number(e.target.value);
                    setX({ birthday: mm ? `${String(mm).padStart(2, '0')}-${String(bday?.d || 1).padStart(2, '0')}` : undefined });
                  }}
                >
                  <option value="">Ay</option>
                  {['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Section>
        </div>

        <aside className="pe-preview">
          <div className="pe-preview-inner">
            <div className="pe-preview-label">Önizleme</div>
            <ProfileCard uid={me.id} user={previewUser} status={status} variant="preview" isMe />
            <div className="pe-preview-label">Sohbette</div>
            <div className="pe-chat">
              <Avatar user={previewUser} size={38} />
              <div>
                <div className="pe-chat-head">
                  <NameText profile={previewUser.profile} color={d.color}>
                    {d.name || 'İsimsiz'}
                  </NameText>
                  <span>Bugün 14:32</span>
                </div>
                <div className="pe-chat-bubble">Yeni profilime bakın! 🐝</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
      </TabCtx.Provider>
      {dirty && (
        <div className="save-bar">
          <span>Kaydedilmemiş değişikliklerin var</span>
          <button className="btn ghost sm" onClick={() => setD(initial)}>
            Geri al
          </button>
          <button className="btn success sm" onClick={save}>
            Kaydet
          </button>
        </div>
      )}
    </div>
  );
}
