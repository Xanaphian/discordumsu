import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Trash2, ImagePlus, Link as LinkIcon, UserPlus, Pencil, CalendarDays, Users, ScrollText, Crown } from 'lucide-react';
import { useStore, cmd, openModal, toast } from '../lib/store';
import { Avatar, CommunityIcon } from './Common';
import { cx, fmtDay, displayName, countOnline } from '../lib/util';
import { can, Perm, type Community } from '../../shared/protocol';
import {
  BANNER_H, BANNER_MAX, COMM_RULES_MAX, COMM_TAGLINE_MAX, PATTERNS, sanitizeCommunityProfile,
  type CommunityProfile, type ProfileBanner, type ProfileLink,
} from '../../shared/profile';
import { PATTERN_LABEL, bannerBackground, linkBrand } from './profile/look';
import { Banner, LinkList } from './profile/ProfileCard';
import { ColorPick, ImageFramer, Section, Seg, readImage } from './profile/ProfileEditor';

const close = () => openModal(null);

/** Kurallar metnini maddelere böler: her dolu satır bir madde, baştaki "1." ya da "-" atılır. */
export function ruleLines(rules?: string) {
  return (rules || '')
    .split('\n')
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
}

function useOnline(c: Community) {
  return useStore((s) => countOnline(c.members, s.presence, s.me.id));
}

/** Sunucu profili kartı: üyeler görür, yönetenler ayrıca düzenleme tuşunu görür. */
export function CommunityProfileCard({
  c,
  profile,
  description,
  preview,
}: {
  c: Community;
  /** önizlemede kaydedilmemiş taslak */
  profile?: CommunityProfile;
  description?: string;
  preview?: boolean;
}) {
  const me = useStore((s) => s.me.id);
  const online = useOnline(c);
  const p = profile ?? c.profile ?? {};
  const desc = (description ?? c.description ?? '').trim();
  const rules = ruleLines(p.rules);
  const users = useStore((s) => s.users);
  const owner = c.users[c.ownerId] || users[c.ownerId];
  const manage = can(c, me, Perm.MANAGE_COMMUNITY);
  const empty = !desc && !rules.length && !p.links?.length && !p.tags?.length;
  return (
    <div className={cx('cp-card', preview && 'cp-preview')}>
      <Banner user={{ color: c.color }} profile={{ banner: p.banner }} className="cp-banner" />
      <div className="cp-head">
        <span className="cp-icon">
          <CommunityIcon c={c} size={preview ? 72 : 88} />
        </span>
        {!preview && (
          <div className="cp-actions">
            {c.inviteKey && (
              <button className="btn primary sm" onClick={() => openModal({ type: 'invite', cid: c.id })}>
                <UserPlus size={14} /> Davet et
              </button>
            )}
            {manage && (
              <button className="btn ghost sm" onClick={() => openModal({ type: 'commSettings', cid: c.id, tab: 'profile' })}>
                <Pencil size={14} /> Profili düzenle
              </button>
            )}
          </div>
        )}
      </div>
      <div className="cp-body">
        <h2 className="cp-name">{c.name}</h2>
        {p.tagline && <p className="cp-tagline">{p.tagline}</p>}
        <div className="cp-stats">
          <span>
            <i className="dot online" /> {online} çevrimiçi
          </span>
          <span>
            <Users size={13} /> {c.members.length} üye
          </span>
          <span>
            <CalendarDays size={13} /> {fmtDay(c.createdAt)}
          </span>
        </div>
        {!!p.tags?.length && (
          <div className="pc-tags cp-tags">
            {p.tags.map((t) => (
              <span key={t} className="pc-tag">
                {t}
              </span>
            ))}
          </div>
        )}
        {desc && (
          <section className="cp-sec">
            <h4>Hakkında</h4>
            <p className="cp-desc">{desc}</p>
          </section>
        )}
        {!!rules.length && (
          <section className="cp-sec">
            <h4>
              <ScrollText size={13} /> Kurallar
            </h4>
            <ol className="cp-rules">
              {rules.map((r, i) => (
                <li key={i}>
                  <b>{i + 1}</b>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {!!p.links?.length && (
          <section className="cp-sec">
            <h4>Bağlantılar</h4>
            <LinkList profile={{ links: p.links }} />
          </section>
        )}
        {empty && <p className="cp-empty">{manage ? 'Profil henüz boş. Afiş, tanıtım ve kurallar ekleyerek üyelerine topluluğu anlat.' : 'Bu topluluk henüz profilini doldurmadı.'}</p>}
        {owner && (
          <section className="cp-sec cp-owner-sec">
            <h4>
              <Crown size={13} /> Kurucu
            </h4>
            <button className="cp-owner" disabled={preview} onClick={() => openModal({ type: 'profile', uid: c.ownerId, cid: c.id })}>
              <Avatar user={owner} size={30} />
              <b>{displayName(c, c.ownerId, users)}</b>
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function Backdrop({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal cp-modal" role="dialog" aria-modal>
        {children}
      </div>
    </div>
  );
}

export function CommunityProfileModal({ cid }: { cid: string }) {
  const c = useStore((s) => s.communities[cid]);
  useEffect(() => {
    if (!c) close();
  }, [c]);
  if (!c) return null;
  return (
    <Backdrop>
      <button className="pc-modal-x icon-btn" onClick={close} aria-label="Kapat">
        <X size={20} />
      </button>
      <CommunityProfileCard c={c} />
    </Backdrop>
  );
}

// ---------------------------------------------------------------------------
// Düzenleyici (topluluk ayarları > Sunucu Profili)

interface Draft {
  description: string;
  tagline: string;
  tags: string[];
  links: ProfileLink[];
  rules: string;
  banner?: ProfileBanner;
}

const fromCommunity = (c: Community): Draft => ({
  description: c.description || '',
  tagline: c.profile?.tagline || '',
  tags: c.profile?.tags || [],
  links: c.profile?.links || [],
  rules: c.profile?.rules || '',
  banner: c.profile?.banner,
});

const toProfile = (d: Draft): CommunityProfile | undefined => sanitizeCommunityProfile({ banner: d.banner, tagline: d.tagline, tags: d.tags, links: d.links, rules: d.rules });

export function CommunityProfileEditor({ c }: { c: Community }) {
  const initial = useMemo(() => fromCommunity(c), [c.description, c.profile]);
  const [d, setD] = useState<Draft>(initial);
  const [tagInput, setTagInput] = useState('');
  const bannerFile = useRef<HTMLInputElement>(null);
  useEffect(() => setD(initial), [initial]);

  const banner: ProfileBanner = d.banner || { kind: 'gradient', a: c.color, b: '#0a1226', angle: 135 };
  const setBanner = (patch: Partial<ProfileBanner>) => setD({ ...d, banner: { ...banner, ...patch } });
  const draftProfile = toProfile(d);
  const dirty = JSON.stringify(draftProfile || null) !== JSON.stringify(toProfile(initial) || null) || d.description.trim() !== initial.description.trim();

  const addTag = () => {
    const t = tagInput.trim().slice(0, 20);
    setTagInput('');
    if (!t || d.tags.length >= 8 || d.tags.some((y) => y.toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr'))) return;
    setD({ ...d, tags: [...d.tags, t] });
  };
  const setLinks = (links: ProfileLink[]) => setD({ ...d, links });

  const save = () => {
    if (d.links.filter((l) => l.url.trim()).length > (draftProfile?.links?.length || 0)) toast('Geçersiz bağlantılar kaydedilmedi.', 'err');
    const f: any = { t: 'comm.update', cid: c.id, profile: draftProfile ?? null };
    if (d.description.trim() !== initial.description.trim()) f.description = d.description.trim();
    cmd(c.id, f);
    toast('Sunucu profili kaydedildi', 'ok');
  };

  return (
    <div className="pe cp-editor">
      <h1>Sunucu Profili</h1>
      <p className="pe-lead">Üyelerin ve davet edilenlerin gördüğü tanıtım sayfası. Afiş, kısa tanıtım, etiketler, kurallar ve bağlantılar burada.</p>
      <div className="pe-grid">
        <div className="pe-form">
          <Section title="Afiş" sub="Profilin üstünde ve topluluk başlığının arkasında görünür. Hareketli GIF de olur.">
            <Seg
              value={d.banner ? banner.kind : ('none' as any)}
              options={[
                ['none' as any, 'Topluluk rengi'],
                ['solid', 'Düz renk'],
                ['gradient', 'Degrade'],
                ['image', 'Resim'],
              ]}
              onChange={(k: any) => (k === 'none' ? setD({ ...d, banner: undefined }) : k === 'image' && !banner.image ? bannerFile.current?.click() : setBanner({ kind: k }))}
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
                  setBanner({ kind: 'image', image: await readImage(f, 1100, 700, BANNER_MAX), x: undefined, y: undefined, zoom: undefined });
                } catch {
                  toast('Resim okunamadı.', 'err');
                }
              }}
            />
            {d.banner && (
              <label className="pe-slider pe-height">
                <em>Afiş yüksekliği {banner.h || BANNER_H.def} px</em>
                <input type="range" min={BANNER_H.min} max={BANNER_H.max} value={banner.h || BANNER_H.def} onChange={(e) => setBanner({ h: Number(e.target.value) })} />
              </label>
            )}
            {d.banner && banner.kind === 'image' && banner.image ? (
              <>
                <ImageFramer src={banner.image} value={banner} onChange={(f) => setBanner(f)} aspect={560 / (banner.h || BANNER_H.def)} />
                <div className="pe-inline">
                  <button className="btn ghost sm" onClick={() => bannerFile.current?.click()}>
                    <ImagePlus size={14} /> Başka resim seç
                  </button>
                </div>
              </>
            ) : d.banner ? (
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
                      <span className={cx('pe-tile-art pat-' + p)} style={{ background: bannerBackground({ ...banner, pattern: p }, c.color) }} />
                      {PATTERN_LABEL[p]}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </Section>

          <Section title="Tanıtım" sub="Adın altındaki tek satır ve topluluğun ne olduğunu anlatan açıklama.">
            <label className="field">
              <span>Kısa tanıtım</span>
              <input value={d.tagline} maxLength={COMM_TAGLINE_MAX} placeholder="Örn. Akşamları dereceli, hafta sonu turnuva" onChange={(e) => setD({ ...d, tagline: e.target.value })} />
            </label>
            <label className="field">
              <span>Hakkında</span>
              <textarea rows={4} maxLength={300} value={d.description} placeholder="Topluluğunu birkaç cümleyle anlat" onChange={(e) => setD({ ...d, description: e.target.value })} />
              <small className="counter">{300 - d.description.length}</small>
            </label>
            <div className="field">
              <span>Etiketler ({d.tags.length}/8)</span>
              <div className="pe-tags">
                {d.tags.map((t) => (
                  <span key={t} className="pc-tag">
                    {t}
                    <button onClick={() => setD({ ...d, tags: d.tags.filter((y) => y !== t) })} aria-label="Kaldır">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {d.tags.length < 8 && (
                  <input
                    value={tagInput}
                    maxLength={20}
                    placeholder="Ekle ve Enter'a bas"
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag();
                      } else if (e.key === 'Backspace' && !tagInput && d.tags.length) setD({ ...d, tags: d.tags.slice(0, -1) });
                    }}
                    onBlur={addTag}
                  />
                )}
              </div>
            </div>
          </Section>

          <Section title="Kurallar" sub="Her satır bir kural olur ve numaralanır.">
            <label className="field">
              <textarea rows={6} maxLength={COMM_RULES_MAX} value={d.rules} placeholder={'Herkese saygılı ol.\nReklam ve spam yok.\nSpoiler için etiket kullan.'} onChange={(e) => setD({ ...d, rules: e.target.value })} />
              <small className="counter">{COMM_RULES_MAX - d.rules.length}</small>
            </label>
          </Section>

          <Section title="Bağlantılar" sub="En fazla 5 bağlantı: web sitesi, YouTube, Twitch, Instagram gibi.">
            <div className="pe-links">
              {d.links.map((l, i) => {
                const brand = linkBrand(l.url.includes('://') ? l.url : 'https://' + l.url);
                return (
                  <div key={i} className="pe-link">
                    <span className="pc-link-ic" style={brand ? { background: brand.bg } : undefined}>
                      {brand ? brand.tag : <LinkIcon size={13} />}
                    </span>
                    <input value={l.label} maxLength={24} placeholder={brand?.name || 'Başlık'} onChange={(e) => setLinks(d.links.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                    <input className="grow" value={l.url} maxLength={200} placeholder="https://…" onChange={(e) => setLinks(d.links.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)))} />
                    <button className="icon-btn sm" onClick={() => setLinks(d.links.filter((_, j) => j !== i))} aria-label="Sil">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              {d.links.length < 5 && (
                <button className="btn ghost sm" onClick={() => setLinks([...d.links, { label: '', url: '' }])}>
                  <Plus size={14} /> Bağlantı ekle
                </button>
              )}
            </div>
          </Section>
        </div>

        <aside className="pe-preview">
          <div className="pe-preview-inner">
            <div className="pe-preview-label">Önizleme</div>
            <CommunityProfileCard c={c} profile={draftProfile || {}} description={d.description} preview />
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
