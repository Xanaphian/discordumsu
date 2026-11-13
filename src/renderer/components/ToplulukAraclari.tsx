// v1.27: katılma koruması, keşfet sayfası ve Discord şablonundan topluluk kurma
import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, Search, Users, Compass, Hash, Volume2, Megaphone, ChevronLeft, LoaderCircle, Link2, FolderClosed, Check, ArrowRight, RefreshCw,
} from 'lucide-react';
import { useStore, cmd, toast, homeRequest, selectCommunity, createCommunity, openModal } from '../lib/store';
import { CommunityIcon, Toggle } from './Common';
import { Row } from './Settings';
import { Banner } from './profile/ProfileCard';
import { cx } from '../lib/util';
import { Perm, type Community } from '../../shared/protocol';
import {
  DEFAULT_GUARD, EXPLORE_CATS, catLabel, fmtHours, templateCode, blueprintFromDiscord,
  type JoinGuard, type ExploreItem, type ExploreCat, type TemplateSummary,
} from '../../shared/topluluk';
import '../styles/topluluk-araclari.css';

// ---------------------------------------------------------------------------
// (7) Katılma koruması: Topluluk ayarları → Katılma Koruması
function useNow(ms = 15_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const cap = (t: string) => t.charAt(0).toLocaleUpperCase('tr') + t.slice(1);

export function JoinGuardTab({ c }: { c: Community }) {
  const g = c.joinGuard || DEFAULT_GUARD;
  const now = useNow();
  const locked = !!c.raidUntil && c.raidUntil > now;
  const save = (patch: Partial<JoinGuard>) => cmd(c.id, { t: 'comm.guard', cid: c.id, guard: { ...g, ...patch } });
  const active = !!(g.minAgeH || g.perMin);
  return (
    <>
      <h1>Katılma Koruması</h1>
      <p className="note">
        Toplu saldırılara (baskın) ve yeni açılmış sahte hesaplara karşı. Kurallar topluluğun sunucusunda uygulanır, davet kodu elden ele geçse de
        aşılamaz.
      </p>
      {locked ? (
        <div className="jg-banner danger">
          <ShieldAlert size={20} />
          <div>
            <b>Baskın algılandı</b>
            <span>
              Kısa sürede çok fazla kişi katılmaya çalıştı. Yeni üyeler {Math.max(1, Math.ceil((c.raidUntil! - now) / 60_000))} dakika daha
              alınmıyor.
            </span>
          </div>
          <button className="btn ghost sm" onClick={() => cmd(c.id, { t: 'comm.guard', cid: c.id, unlock: true })}>
            Kilidi kaldır
          </button>
        </div>
      ) : (
        <div className={cx('jg-banner', active && 'ok')}>
          {active ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
          <div>
            <b>{active ? 'Koruma açık' : 'Koruma kapalı'}</b>
            <span>
              {active
                ? cap([g.minAgeH ? `en az ${fmtHours(g.minAgeH)} önce açılmış hesaplar katılabilir` : '', g.perMin ? `dakikada en çok ${g.perMin} katılım` : '']
                    .filter(Boolean)
                    .join(', ') + '.')
                : 'Davet kodunu bilen herkes hemen katılabilir.'}
            </span>
          </div>
        </div>
      )}

      <h3>Hesap yaşı</h3>
      <Row title="En az hesap yaşı" sub="Hesabı Xanaphian'da bu süreden yeni olanlar katılamaz; ne zaman tekrar deneyebileceği kendisine söylenir.">
        <select className="mini-select" value={g.minAgeH} onChange={(e) => save({ minAgeH: Number(e.target.value) })}>
          <option value={0}>Kural yok</option>
          <option value={1}>1 saat</option>
          <option value={24}>1 gün</option>
          <option value={72}>3 gün</option>
          <option value={168}>7 gün</option>
          <option value={720}>30 gün</option>
        </select>
      </Row>

      <h3>Baskın koruması</h3>
      <Row title="Katılım hızı sınırı" sub="Bir dakikada bundan fazla kişi katılmaya çalışırsa topluluk kendiliğinden yeni üye almayı durdurur.">
        <select className="mini-select" value={g.perMin} onChange={(e) => save({ perMin: Number(e.target.value) })}>
          <option value={0}>Sınırsız</option>
          {[3, 5, 10, 20, 50].map((n) => (
            <option key={n} value={n}>
              Dakikada {n}
            </option>
          ))}
        </select>
      </Row>
      <Row title="Durdurma süresi" sub="Baskın algılanınca yeni katılımlar bu kadar kapalı kalır. İstersen yukarıdan elle de açarsın.">
        <select className="mini-select" value={g.lockMin} disabled={!g.perMin} onChange={(e) => save({ lockMin: Number(e.target.value) })}>
          {[5, 10, 30, 60, 360].map((n) => (
            <option key={n} value={n}>
              {n < 60 ? `${n} dakika` : `${n / 60} saat`}
            </option>
          ))}
        </select>
      </Row>

      <h3>Birlikte işe yarayanlar</h3>
      <div className="jg-links">
        <button className="jg-link" onClick={() => openModal({ type: 'commSettings', cid: c.id, tab: 'moderation' })}>
          <b>Yeni üye bekleme süresi</b>
          <span>Katılan biri belirli bir süre mesaj yazamaz. Moderasyon sekmesinde.</span>
          <ArrowRight size={15} />
        </button>
        <button className="jg-link" onClick={() => openModal({ type: 'commSettings', cid: c.id, tab: 'invites' })}>
          <b>Davetleri durdur</b>
          <span>Tümüyle kapatmak için. Davetler sekmesinde.</span>
          <ArrowRight size={15} />
        </button>
      </div>
      <p className="note">Hesap yaşı, kişinin bu sunucuya ilk bağlandığı andan sayılır. Bu sürümden önce gelmiş hesaplar eski kabul edilir.</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// (9) Keşfet
function ExploreCard({ it, onJoin, busy, preview }: { it: ExploreItem; onJoin?: () => void; busy?: boolean; preview?: boolean }) {
  return (
    <article className={cx('ex-card', preview && 'preview')}>
      <Banner user={{ color: it.color }} profile={{ banner: it.banner }} className="ex-banner" />
      <span className="ex-icon">
        <CommunityIcon c={it} size={52} />
      </span>
      <div className="ex-body">
        <div className="ex-cat">{catLabel(it.cat)}</div>
        <div className="ex-name">{it.name}</div>
        <p className="ex-desc">{it.tagline || it.description || 'Henüz bir tanıtım yazılmamış.'}</p>
        {!!it.tags?.length && (
          <div className="ex-tags">
            {it.tags.slice(0, 4).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
        <div className="ex-foot">
          <span className="ex-stat">
            <i className="dot online" /> {it.online} çevrimiçi
          </span>
          <span className="ex-stat">
            <Users size={12} /> {it.members} üye
          </span>
          {onJoin && (
            <button className={cx('btn sm', it.joined ? 'ghost' : 'primary')} disabled={busy} onClick={onJoin}>
              {busy ? <LoaderCircle size={14} className="spin" /> : it.joined ? 'Aç' : 'Katıl'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function ExploreView() {
  const [items, setItems] = useState<ExploreItem[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ExploreCat | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => {
    setErr('');
    homeRequest<{ data: ExploreItem[] }>({ t: 'explore', rid: '' })
      .then((r) => setItems(Array.isArray(r.data) ? r.data : []))
      .catch((e) => (setItems([]), setErr(e?.message === 'Zaman aşımı' || !e?.message ? 'Sunucu yanıt vermedi.' : e.message)));
  };
  useEffect(load, []);
  const shown = useMemo(() => {
    const n = q.trim().toLocaleLowerCase('tr');
    return (items || []).filter(
      (x) =>
        (cat === 'all' || x.cat === cat) &&
        (!n || [x.name, x.tagline, x.description, ...(x.tags || [])].some((s) => s?.toLocaleLowerCase('tr').includes(n))),
    );
  }, [items, q, cat]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of items || []) m[x.cat] = (m[x.cat] || 0) + 1;
    return m;
  }, [items]);
  const join = async (it: ExploreItem) => {
    if (it.joined) return selectCommunity(it.id);
    setBusy(it.id);
    try {
      const r = await homeRequest<{ data: string }>({ t: 'join', cid: it.id, rid: '' });
      selectCommunity(r.data);
      toast(`${it.name} topluluğuna katıldın!`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
    setBusy(null);
  };
  return (
    <section className="explore scroll-thin">
      <header className="ex-hero">
        <div className="ex-hero-text">
          <h1>
            <Compass size={24} /> Toplulukları keşfet
          </h1>
          <p>Herkese açık topluluklar. Davet kodu gerekmez, beğendiğine tek tıkla katıl.</p>
        </div>
        <label className="ex-search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Topluluk, oyun ya da konu ara" />
        </label>
      </header>
      <nav className="ex-cats">
        <button className={cx('ex-chip', cat === 'all' && 'on')} onClick={() => setCat('all')}>
          Hepsi <span>{items?.length || 0}</span>
        </button>
        {EXPLORE_CATS.filter((x) => counts[x.id]).map((x) => (
          <button key={x.id} className={cx('ex-chip', cat === x.id && 'on')} onClick={() => setCat(x.id)}>
            {x.label} <span>{counts[x.id]}</span>
          </button>
        ))}
        <button className="ex-chip ex-refresh" onClick={load} title="Yenile" aria-label="Yenile">
          <RefreshCw size={13} />
        </button>
      </nav>
      {items === null ? (
        <div className="ex-empty">
          <LoaderCircle size={22} className="spin" />
        </div>
      ) : shown.length ? (
        <div className="ex-grid">
          {shown.map((it) => (
            <ExploreCard key={it.id} it={it} busy={busy === it.id} onJoin={() => join(it)} />
          ))}
        </div>
      ) : (
        <div className="ex-empty">
          <Compass size={34} />
          <b>{err || (q || cat !== 'all' ? 'Aramana uyan topluluk yok' : 'Henüz listelenen topluluk yok')}</b>
          <span>Kendi topluluğunu listelemek için: Topluluk ayarları → Keşfet.</span>
        </div>
      )}
    </section>
  );
}

/** Topluluk ayarları → Keşfet: listeleme anahtarı ve kartın önizlemesi */
export function ListingTab({ c }: { c: Community }) {
  const online = useStore((s) => c.members.filter((m) => m.userId === s.me.id || (s.presence[m.userId] && s.presence[m.userId] !== 'offline')).length);
  const on = !!c.listing;
  const cat = c.listing?.cat || 'sohbet';
  const set = (listing: { cat: ExploreCat; at: number } | null) => cmd(c.id, { t: 'comm.listing', cid: c.id, listing });
  const p = c.profile || {};
  const it: ExploreItem = {
    id: c.id, name: c.name, icon: c.icon, color: c.color, description: c.description, banner: p.banner, tagline: p.tagline, tags: p.tags, cat,
    members: c.members.length, online, createdAt: c.createdAt,
  };
  return (
    <>
      <h1>Keşfet</h1>
      <p className="note">Listelenen topluluklar herkesin görebildiği Keşfet sayfasında çıkar ve davet kodu olmadan katılınabilir. Katılma koruması yine geçerlidir.</p>
      <Row title="Keşfette listele" sub={on ? 'Topluluğun şu an Keşfet sayfasında görünüyor.' : 'Kapalıyken yalnız davet koduyla katılınır.'}>
        <Toggle value={on} onChange={(v) => set(v ? { cat, at: Date.now() } : null)} />
      </Row>
      <Row title="Kategori" sub="Keşfet'te hangi başlık altında görünsün.">
        <select className="mini-select" value={cat} disabled={!on} onChange={(e) => set({ cat: e.target.value as ExploreCat, at: Date.now() })}>
          {EXPLORE_CATS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </Row>
      <h3>Kartın böyle görünecek</h3>
      <div className="ex-preview-wrap">
        <ExploreCard it={it} preview />
        <div className="ex-tips">
          <p>Kart, sunucu profilindeki afişi, kısa tanıtımı ve etiketleri kullanır.</p>
          {!p.tagline && !c.description && <p className="warn">Kısa tanıtım ya da açıklama yok; insanlar ne topluluğu olduğunu anlamayabilir.</p>}
          <button className="btn ghost sm" onClick={() => openModal({ type: 'commSettings', cid: c.id, tab: 'profile' })}>
            Sunucu profilini düzenle
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// (8) Discord şablonundan kurulum
const isPrivate = (ow?: { role: number; deny: number }[]) => !!ow?.some((o) => o.role === -1 && o.deny & Perm.VIEW_CHANNEL);
const CH_ICON = { text: Hash, announce: Megaphone, voice: Volume2 } as Record<string, typeof Hash>;

export function TemplateImport({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [link, setLink] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState<TemplateSummary | null>(null);
  const [name, setName] = useState('');
  const fetchIt = async () => {
    const code = templateCode(link);
    if (!code) return setErr('Bu bir Discord şablon bağlantısına benzemiyor. Örnek: https://discord.new/AbCdEf123');
    setErr('');
    setBusy(true);
    try {
      const r = await window.kovan.discordTemplate(code);
      if (!r.ok) throw new Error(r.error || 'Şablon alınamadı.');
      const t = blueprintFromDiscord(r.data);
      setTpl(t);
      setName(t.guildName || t.name);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const create = async () => {
    if (!tpl) return;
    setBusy(true);
    try {
      const cid = await createCommunity(name.trim() || tpl.name, '#c8aa6e', undefined, tpl.blueprint);
      const c = useStore.getState().communities[cid];
      if (c && tpl.blueprint.channels.length > 2 && c.channels.length <= 3)
        toast('Topluluk kuruldu ama sunucu şablonu tanımadı; sunucunun güncellenmesi gerekiyor.', 'err');
      else toast('Şablondan kuruldu. Kanallar ve roller hazır!', 'ok');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
    setBusy(false);
  };
  const bp = tpl?.blueprint;
  const groups = useMemo(() => {
    if (!bp) return [];
    const out: { name: string | null; list: typeof bp.channels }[] = [];
    const loose = bp.channels.filter((x) => x.cat === null);
    if (loose.length) out.push({ name: null, list: loose });
    bp.categories.forEach((k, i) => out.push({ name: k.name, list: bp.channels.filter((x) => x.cat === i) }));
    return out;
  }, [bp]);
  return (
    <>
      <div className="modal-head">
        <button className="tp-back icon-btn" onClick={tpl ? () => setTpl(null) : onBack} aria-label="Geri">
          <ChevronLeft size={18} />
        </button>
        <h2>Discord şablonundan kur</h2>
        <p>{tpl ? 'Kanallar, kategoriler ve roller aynen kurulacak.' : "Discord'daki sunucu şablonu bağlantısını yapıştır; kanalları, kategorileri ve rolleri buraya taşıyalım."}</p>
      </div>
      {!tpl ? (
        <div className="modal-body">
          <label className="field">
            <span>Şablon bağlantısı</span>
            <div className="tp-input">
              <Link2 size={16} />
              <input autoFocus value={link} placeholder="https://discord.new/AbCdEf123" onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchIt()} />
            </div>
          </label>
          {err && <div className="field-err">{err}</div>}
          <div className="hint-card">
            Discord'da: Sunucu Ayarları → <b>Sunucu Şablonu</b> → bağlantıyı kopyala. Herkesin paylaştığı hazır şablonlar da olur. Mesajlar, emojiler ve
            botlar şablonda yer almaz, taşınmaz.
          </div>
        </div>
      ) : (
        <div className="modal-body tp-body">
          <div className="tp-head">
            <div>
              <b>{tpl.name}</b>
              {tpl.description && <span>{tpl.description}</span>}
            </div>
            <div className="tp-counts">
              <span>{bp!.categories.length} kategori</span>
              <span>{bp!.channels.length} kanal</span>
              <span>{bp!.roles.length} rol</span>
            </div>
          </div>
          <label className="field">
            <span>Topluluk adı</span>
            <input value={name} maxLength={48} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="tp-cols">
            <div className="tp-tree scroll-thin">
              {groups.map((g, gi) => (
                <div key={gi} className="tp-group">
                  {g.name && (
                    <div className="tp-cat">
                      <FolderClosed size={12} /> {g.name}
                    </div>
                  )}
                  {g.list.map((ch, i) => {
                    const I = CH_ICON[ch.type] || Hash;
                    return (
                      <div key={i} className="tp-ch">
                        <I size={14} /> <span>{ch.type === 'voice' ? ch.name : ch.name.toLocaleLowerCase('tr').replace(/\s+/g, '-')}</span>
                        {isPrivate(ch.ow) || (ch.cat !== null && isPrivate(bp!.categories[ch.cat]?.ow)) ? <em>özel</em> : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="tp-roles scroll-thin">
              <div className="tp-cat">Roller</div>
              {[...bp!.roles].reverse().map((r, i) => (
                <div key={i} className="tp-role">
                  <i style={{ background: r.color || 'var(--text-3, #8a93a6)' }} />
                  <span style={{ color: r.color || undefined }}>{r.name}</span>
                </div>
              ))}
              <div className="tp-role muted">
                <i />
                <span>@herkes</span>
              </div>
            </div>
          </div>
          <p className="note">
            <Check size={12} /> Kanal izinleri ve yavaş mod da taşınır. Forum ve sahne kanalları metin ve ses kanalı olarak kurulur.
          </p>
        </div>
      )}
      <div className="modal-foot">
        <button className="btn ghost" onClick={tpl ? () => setTpl(null) : onBack}>
          Geri
        </button>
        {!tpl ? (
          <button className="btn primary" disabled={busy || !link.trim()} onClick={fetchIt}>
            {busy ? <LoaderCircle size={16} className="spin" /> : 'Şablonu getir'}
          </button>
        ) : (
          <button className="btn primary" disabled={busy} onClick={create}>
            {busy ? <LoaderCircle size={16} className="spin" /> : 'Topluluğu kur'}
          </button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
/** Baskın algılanınca topluluğu yönetenlere bir kez haber ver */
let watching = false;
export function startCommunityWatch() {
  if (watching) return;
  watching = true;
  const seen = new Map<string, number>();
  useStore.subscribe((s, prev) => {
    if (s.communities === prev.communities) return;
    for (const c of Object.values(s.communities)) {
      const until = c.raidUntil || 0;
      if (until <= Date.now() || seen.get(c.id) === until) continue;
      seen.set(c.id, until);
      if (!c.inviteKey) continue; // yalnız yönetebilenlere davet anahtarı gelir
      toast(`${c.name}: baskın algılandı, yeni üyeler ${Math.ceil((until - Date.now()) / 60_000)} dakika alınmayacak.`, 'err');
    }
  });
}
