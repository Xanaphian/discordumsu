// Kendi tam profilini açınca: solda küçük düzenleme şeridi, sağda profilin canlı önizlemesi.
// Her değişiklik önce taslakta kalır; "Kaydet" ile herkese gider.
import React, { useMemo, useRef, useState } from 'react';
import { Upload, Trash2, ImagePlus, Check, RotateCcw, Settings2, Smile, Sparkles, Palette, Type, Image as ImageIcon, CircleUser, Wand2, Frame, Crop } from 'lucide-react';
import type { Status } from '../../../shared/protocol';
import {
  BANNER_MAX, EFFECTS, FRAMES, NAME_FONTS, NAME_FX, PATTERNS, SHAPES, sanitizeProfile,
  type ProfileBanner, type ProfileExtra,
} from '../../../shared/profile';
import { useStore, updateProfile, toast, meAsUser, openModal } from '../../lib/store';
import { Avatar } from '../Common';
import { EmojiPicker } from '../Overlays';
import { cx, resizeImage } from '../../lib/util';
import { EFFECT_LABEL, FRAME_LABEL, NAME_FONT_LABEL, NAME_FX_LABEL, PATTERN_LABEL, PRESETS, SHAPE_LABEL, bannerBackground } from './look';
import { TONE_PRESETS } from './Tones';
import { NameText } from './ProfileCard';
import { focusProfileSection } from './ProfileEditor';
import { cropImage, recropImage, AVATAR_CROP, bannerCropOpts, BannerPic } from '../Kirpma';
import { ProfileFull } from './ProfileFull';

interface Draft {
  name: string;
  bio: string;
  color: string;
  avatar?: string;
  extra: ProfileExtra;
}

function Block({ icon, title, children, right }: { icon: React.ReactNode; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="xs-block">
      <header>
        <span className="xs-block-ic">{icon}</span>
        <h3>{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}

function Chips<T extends string>({ value, options, label, onChange }: { value: T; options: readonly T[]; label: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="xs-chips">
      {options.map((o) => (
        <button key={o} className={cx('xs-chip', value === o && 'on')} onClick={() => onChange(o)}>
          {label[o]}
        </button>
      ))}
    </div>
  );
}

export function ProfilStudyo({ status, onClose, setGuard }: { status?: Status; onClose: () => void; setGuard?: (g: () => void) => void }) {
  const me = useStore((s) => s.me);
  const initial = useMemo<Draft>(() => ({ name: me.name, bio: me.bio || '', color: me.color, avatar: me.avatar, extra: me.extra || {} }), [me]);
  const [d, setD] = useState<Draft>(initial);
  const [ask, setAsk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emojiAt, setEmojiAt] = useState<{ x: number; y: number } | null>(null);
  const avatarFile = useRef<HTMLInputElement>(null);
  const bannerFile = useRef<HTMLInputElement>(null);
  const x = d.extra;
  const setX = (patch: Partial<ProfileExtra>) => setD((o) => ({ ...o, extra: { ...o.extra, ...patch } }));
  const banner: ProfileBanner = x.banner || { kind: 'gradient', a: d.color, b: '#141b33', angle: 135, pattern: 'none' };
  const setBanner = (patch: Partial<ProfileBanner>) => setX({ banner: { ...banner, ...patch } });

  const clean = (dr: Draft) => JSON.stringify({ ...dr, name: dr.name.trim(), bio: dr.bio.trim(), extra: sanitizeProfile(dr.extra) || {} });
  const dirty = clean(d) !== clean(initial);
  const preview = { ...meAsUser(me), name: d.name.trim() || 'İsimsiz', color: d.color, avatar: d.avatar, bio: d.bio.trim() || undefined, profile: sanitizeProfile(d.extra) };

  const save = async () => {
    if (!d.name.trim()) return toast('Görünen ad boş olamaz.', 'err');
    setSaving(true);
    try {
      await updateProfile({ name: d.name.trim(), bio: d.bio.trim(), color: d.color, avatar: d.avatar, extra: d.extra });
      toast('Profil kaydedildi', 'ok');
      setAsk(false);
    } finally {
      setSaving(false);
    }
  };
  const tryClose = () => (dirty ? setAsk(true) : onClose());
  setGuard?.(tryClose);
  const allSettings = (section?: string) => {
    if (section) focusProfileSection(section);
    onClose();
    openModal({ type: 'settings', tab: 'profile' });
  };
  const pickAvatar = () => avatarFile.current?.click();
  const pickBanner = () => bannerFile.current?.click();
  const tone = x.theme ? TONE_PRESETS.findIndex((t) => t.t.a === x.theme!.a && t.t.b === x.theme!.b) : -1;

  return (
    <div className="xs">
      <aside className="xs-rail">
        <div className="xs-head">
          <div>
            <h2>Profilini düzenle</h2>
            <p>Değişiklikler yandaki profilde anında görünür.</p>
          </div>
        </div>

        <div className="xs-scroll">
          <Block icon={<CircleUser size={15} />} title="Kimlik">
            <div className="xs-avatar">
              <button className="xs-av-btn" onClick={pickAvatar} title="Profil resmini değiştir">
                <Avatar user={preview} size={60} plain />
                <span>
                  <Upload size={14} />
                </span>
              </button>
              <div className="xs-av-side">
                <button className="btn sm primary" onClick={pickAvatar}>
                  <Upload size={14} /> Resim yükle
                </button>
                {d.avatar && (
                  <button className="btn sm ghost" onClick={() => setD({ ...d, avatar: undefined })}>
                    <Trash2 size={14} /> Kaldır
                  </button>
                )}
              </div>
            </div>
            <div className="xs-shapes">
              {SHAPES.map((sh) => (
                <button key={sh} className={cx('xs-shape', (x.shape || 'circle') === sh && 'on')} onClick={() => setX({ shape: sh })} title={SHAPE_LABEL[sh]}>
                  <i className={'s-' + sh} />
                </button>
              ))}
            </div>
            <label className="xs-field">
              <span>Görünen ad</span>
              <input value={d.name} maxLength={32} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </label>
            <label className="xs-field">
              <span>Durum</span>
              <div className="xs-status">
                <button className="xs-emoji" onClick={(e) => setEmojiAt({ x: e.clientX, y: e.clientY })} title="Emoji seç">
                  {x.custom?.emoji || <Smile size={16} />}
                </button>
                <input
                  value={x.custom?.text || ''}
                  maxLength={80}
                  placeholder="Ne yapıyorsun?"
                  onChange={(e) => setX({ custom: e.target.value || x.custom?.emoji ? { ...x.custom, text: e.target.value } : undefined })}
                />
              </div>
            </label>
            <label className="xs-field">
              <span>Hakkında</span>
              <textarea rows={3} maxLength={300} value={d.bio} placeholder="Kendinden biraz bahset" onChange={(e) => setD({ ...d, bio: e.target.value })} />
            </label>
          </Block>

          <Block icon={<Wand2 size={15} />} title="Hazır görünümler">
            <div className="xs-presets">
              {PRESETS.map((p) => (
                <button key={p.id} className="xs-preset" onClick={() => setX({ ...p.extra })} title={p.name}>
                  <span className={cx('xs-preset-art', p.extra.banner?.pattern && 'pat-' + p.extra.banner.pattern)} style={{ background: bannerBackground(p.extra.banner, d.color) }} />
                  <span className="xs-preset-card" style={{ background: p.extra.theme ? `linear-gradient(${p.extra.theme.a}, ${p.extra.theme.b})` : undefined }} />
                  <b>{p.name}</b>
                </button>
              ))}
            </div>
          </Block>

          <Block icon={<ImageIcon size={15} />} title="Afiş">
            <div className="xs-banners">
              <button className={cx('xs-ban', banner.kind === 'image' && 'on')} onClick={() => (banner.image ? setBanner({ kind: 'image' }) : pickBanner())}>
                {banner.image ? <BannerPic image={banner.image} framing={banner} aspect={330 / (banner.h || 108)} /> : <ImagePlus size={20} />}
                <em>{banner.image ? 'Resim' : 'Resim yükle'}</em>
              </button>
              <button
                className={cx('xs-ban', banner.kind !== 'image' && 'on')}
                style={{ background: bannerBackground({ ...banner, kind: banner.b ? 'gradient' : 'solid' }, d.color) }}
                onClick={() => setBanner({ kind: banner.b ? 'gradient' : 'solid' })}
              >
                <em>Renk</em>
              </button>
            </div>
            {banner.kind !== 'image' ? (
              <div className="xs-colors">
                <label className="xs-color" title="Birinci renk">
                  <i style={{ background: banner.a }} />
                  <input type="color" value={banner.a} onChange={(e) => setBanner({ a: e.target.value })} />
                </label>
                <label className="xs-color" title="İkinci renk">
                  <i style={{ background: banner.b || banner.a }} />
                  <input type="color" value={banner.b || banner.a} onChange={(e) => setBanner({ b: e.target.value, kind: 'gradient' })} />
                </label>
                <select value={banner.pattern || 'none'} onChange={(e) => setBanner({ pattern: e.target.value as ProfileBanner['pattern'] })}>
                  {PATTERNS.map((pt) => (
                    <option key={pt} value={pt}>
                      Desen: {PATTERN_LABEL[pt]}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="xs-row">
                <button className="btn sm ghost" onClick={pickBanner}>
                  <Upload size={14} /> Başka resim
                </button>
                <button
                  className="btn sm ghost"
                  onClick={async () => {
                    if (!banner.image) return;
                    const r = await recropImage(banner.image, bannerCropOpts(banner.h), banner);
                    if (r) setBanner({ kind: 'image', ...r });
                  }}
                >
                  <Crop size={14} /> Yerleşim
                </button>
              </div>
            )}
          </Block>

          <Block icon={<Palette size={15} />} title="Profil renkleri">
            <div className="xs-tones">
              <button className={cx('xs-tone none', !x.theme && 'on')} onClick={() => setX({ theme: undefined })} title="Uygulamanın teması">
                <span />
                <em>Tema</em>
              </button>
              {TONE_PRESETS.map((t, i) => (
                <button key={t.name} className={cx('xs-tone', tone === i && 'on')} onClick={() => setX({ theme: { ...t.t } })} title={t.name}>
                  <span style={{ background: `linear-gradient(160deg, ${t.t.a}, ${t.t.b})` }}>
                    <i style={{ background: t.t.c }} />
                  </span>
                  <em>{t.name}</em>
                </button>
              ))}
            </div>
          </Block>

          <Block icon={<Type size={15} />} title="İsim stili">
            <div className="xs-names">
              {NAME_FX.map((fx) => (
                <button key={fx} className={cx('xs-name', (x.nameFx || 'none') === fx && 'on')} onClick={() => setX({ nameFx: fx, nameB: x.nameB || '#f0e6d2' })}>
                  <NameText profile={{ ...x, nameFx: fx === 'none' ? undefined : fx, nameB: x.nameB || '#f0e6d2' }} color={d.color}>
                    {d.name.trim() || 'İsim'}
                  </NameText>
                  <small>{NAME_FX_LABEL[fx]}</small>
                </button>
              ))}
            </div>
            <Chips value={x.nameFont || 'default'} options={NAME_FONTS} label={NAME_FONT_LABEL} onChange={(v) => setX({ nameFont: v })} />
            {x.nameFx && (
              <div className="xs-colors">
                <label className="xs-color" title="İsim rengi">
                  <i style={{ background: d.color }} />
                  <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} />
                </label>
                <label className="xs-color" title="İkinci renk">
                  <i style={{ background: x.nameB || '#f0e6d2' }} />
                  <input type="color" value={x.nameB || '#f0e6d2'} onChange={(e) => setX({ nameB: e.target.value })} />
                </label>
                <small>İsim renkleri</small>
              </div>
            )}
          </Block>

          <Block icon={<Frame size={15} />} title="Çerçeve">
            <div className="xs-frames">
              {FRAMES.map((f) => (
                <button key={f} className={cx('xs-frame', (x.frame || 'none') === f && 'on')} onClick={() => setX({ frame: f })} title={FRAME_LABEL[f]}>
                  <Avatar user={{ ...preview, profile: { ...preview.profile, frame: f === 'none' ? undefined : f } }} size={36} />
                  <small>{FRAME_LABEL[f]}</small>
                </button>
              ))}
            </div>
          </Block>

          <Block icon={<Sparkles size={15} />} title="Kart efekti">
            <Chips value={x.effect || 'none'} options={EFFECTS} label={EFFECT_LABEL} onChange={(v) => setX({ effect: v })} />
          </Block>

          <button className="xs-all" onClick={() => allSettings()}>
            <Settings2 size={15} />
            <span>
              <b>Tüm profil ayarları</b>
              <small>Bağlı hesaplar, arka plan, saat, düğme düzeni</small>
            </span>
          </button>
        </div>

        <footer className={cx('xs-foot', dirty && 'dirty', ask && 'ask')}>
          {ask ? (
            <>
              <span>Kaydetmeden çık?</span>
              <button className="btn sm ghost" onClick={onClose}>
                Çık
              </button>
              <button className="btn sm primary" disabled={saving} onClick={async () => (await save(), onClose())}>
                Kaydet ve çık
              </button>
            </>
          ) : dirty ? (
            <>
              <span>Kaydedilmemiş değişiklik</span>
              <button className="btn sm ghost" onClick={() => setD(initial)} title="Geri al">
                <RotateCcw size={14} />
              </button>
              <button className="btn sm primary" disabled={saving} onClick={save}>
                <Check size={14} /> Kaydet
              </button>
            </>
          ) : (
            <span className="xs-saved">
              <Check size={14} /> Her şey kayıtlı
            </span>
          )}
        </footer>
      </aside>

      <div className="xs-stage">
        <ProfileFull uid={me.id} user={preview} status={status} isMe editing onClose={tryClose} onEditAvatar={pickAvatar} onEditBanner={pickBanner} />
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
          const r = await cropImage(f, AVATAR_CROP);
          if (r) setD((o) => ({ ...o, avatar: r.image }));
        }}
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
          const r = await cropImage(f, bannerCropOpts(banner.h));
          if (r) setBanner({ kind: 'image', ...r });
        }}
      />
      {emojiAt && (
        <EmojiPicker
          x={emojiAt.x}
          y={emojiAt.y + 420}
          onPick={(em) => {
            setX({ custom: { ...x.custom, emoji: em } });
            setEmojiAt(null);
          }}
          onClose={() => setEmojiAt(null)}
        />
      )}
    </div>
  );
}
