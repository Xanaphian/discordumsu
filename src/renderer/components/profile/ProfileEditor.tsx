import React, { useMemo, useRef, useState } from 'react';
import { Dices, RotateCcw, Upload, Trash2, Plus, X, Smile, ImagePlus, Link as LinkIcon } from 'lucide-react';
import { useStore, updateProfile, toast, meAsUser } from '../../lib/store';
import { Avatar, Toggle } from '../Common';
import { EmojiPicker } from '../Overlays';
import { cx, COLORS, resizeImage } from '../../lib/util';
import {
  ACTIVITY_KINDS, BANNER_MAX, BIO_MAX, EFFECTS, FRAMES, NAME_FONTS, NAME_FX, PATTERNS, SHAPES, sanitizeProfile,
  type ActivityKind, type ProfileBanner, type ProfileExtra, type ProfileLink,
} from '../../../shared/profile';
import {
  ACTIVITY_VERB, EFFECT_LABEL, FRAME_LABEL, NAME_FONT_LABEL, NAME_FX_LABEL, PATTERN_LABEL, PRESETS, SHAPE_LABEL, bannerBackground, linkBrand,
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
function resizeCover(file: File, w: number, h: number, quality = 0.82): Promise<string> {
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
      while (out.length > BANNER_MAX && q > 0.3) out = canvas.toDataURL('image/webp', (q -= 0.15));
      resolve(out);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function Section({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="pe-sec">
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
      banner: { kind: 'gradient', a, b, angle: Math.floor(Math.random() * 360), pattern: rnd(PATTERNS) },
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
      <div className="pe-grid">
        <div className="pe-form">
          <Section
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
                    setX({ banner: undefined, theme: undefined, frame: undefined, frameColor: undefined, nameFx: undefined, nameB: undefined, nameFont: undefined, effect: undefined, shape: undefined })
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

          <Section title="Kimlik">
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

          <Section title="Durum ve etkinlik" sub="İsminin altında ve profil kartında konuşma balonu olarak görünür.">
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

          <Section title="Afiş" sub="Kartının üst kısmı. Renk, degrade, desen ya da kendi resmin.">
            <Seg
              value={banner.kind}
              options={[
                ['solid', 'Düz renk'],
                ['gradient', 'Degrade'],
                ['image', 'Resim'],
              ]}
              onChange={(k) => (k === 'image' && !banner.image ? bannerFile.current?.click() : setBanner({ kind: k }))}
            />
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
                  setBanner({ kind: 'image', image: await resizeCover(f, 680, 240) });
                } catch {
                  toast('Resim okunamadı.', 'err');
                }
              }}
            />
            {banner.kind === 'image' ? (
              <div className="pe-inline">
                <button className="btn ghost sm" onClick={() => bannerFile.current?.click()}>
                  <ImagePlus size={14} /> Başka resim seç
                </button>
                <span className="note">En iyi sonuç için yatay bir resim seç (680×240).</span>
              </div>
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

          <Section title="Avatar">
            <div className="field">
              <span>Şekil</span>
              <div className="pe-tiles">
                {SHAPES.map((s) => (
                  <button key={s} className={cx('pe-tile', (x.shape || 'hex') === s && 'on')} onClick={() => setX({ shape: s })}>
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

          <Section title="İsim stili" sub="Sohbette, üye listesinde ve kartında ismin böyle görünür.">
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

          <Section title="Hakkımda">
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

          <Section title="Bağlantılar" sub="En fazla 5 bağlantı. GitHub, Instagram, YouTube, Twitch, Spotify, Steam gibi siteler tanınır.">
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

          <Section title="Ek bilgiler">
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
