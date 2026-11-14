// v1.48 Ana Sayfa > Topluluklar: üye olduğun topluluklar + sana önerilen topluluklar.
// Öneriler Keşfet listesinden gelir; yeni sunucu her öneriye o toplulukta olan arkadaşlarını ekler,
// arkadaşlarının olduğu topluluklar en üstte durur.
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, LogIn, Compass, Search, Hash, Users, Sparkles, LoaderCircle, RefreshCw, ChevronRight } from 'lucide-react';
import { useStore, openModal, selectCommunity, realCommunities, homeRequest, toast } from '../lib/store';
import { ExploreCard } from './ToplulukAraclari';
import { CommCard, Section } from './AnaSayfa';
import { EXPLORE_CATS, type ExploreCat, type ExploreItem } from '../../shared/topluluk';
import { cx } from '../lib/util';

export function CommunitiesView() {
  const communities = useStore((s) => s.communities);
  const homeOnline = useStore((s) => Object.values(s.conns).some((x) => x.home && x.status === 'online'));
  const mine = useMemo(() => realCommunities(communities), [communities]);
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
  useEffect(() => {
    if (homeOnline) load();
  }, [homeOnline]);

  const n = q.trim().toLocaleLowerCase('tr');
  const match = (x: { name: string; tagline?: string; description?: string; tags?: string[] }) =>
    !n || [x.name, x.tagline, x.description, ...(x.tags || [])].some((s) => s?.toLocaleLowerCase('tr').includes(n));
  const suggest = useMemo(
    () =>
      (items || [])
        .filter((x) => !x.joined && !communities[x.id])
        .sort((a, b) => (b.friendCount || 0) - (a.friendCount || 0) || b.online - a.online || b.members - a.members),
    [items, communities],
  );
  const withFriends = suggest.filter((x) => x.friendCount && match(x));
  const rest = suggest.filter((x) => !x.friendCount && (cat === 'all' || x.cat === cat) && match(x));
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of suggest) if (!x.friendCount) m[x.cat] = (m[x.cat] || 0) + 1;
    return m;
  }, [suggest]);
  const myShown = mine.filter((c) => match({ name: c.name, tagline: c.profile?.tagline, description: c.description }));

  const join = async (it: ExploreItem) => {
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
    <section className="ah tp scroll-thin">
      <div className="ah-in">
        <header className="tp-hero">
          <div className="tp-hero-t">
            <h1>Topluluklar</h1>
            <p>Arkadaşlarının takıldığı yerler, sana uygun topluluklar ve üye olduklarının hepsi.</p>
          </div>
          <label className="ex-search tp-search">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Topluluk, oyun ya da konu ara" />
          </label>
          <div className="tp-acts">
            <button className="ah-act primary" onClick={() => openModal({ type: 'createCommunity' })}>
              <Plus size={17} /> <span>Topluluk oluştur</span>
            </button>
            <button className="ah-act" onClick={() => openModal({ type: 'join' })}>
              <LogIn size={16} /> <span>Davetle katıl</span>
            </button>
            <button className="ah-act" onClick={() => selectCommunity('explore')}>
              <Compass size={16} /> <span>Keşfet</span>
            </button>
          </div>
        </header>

        {withFriends.length > 0 && (
          <Section icon={<Users size={16} />} title="Arkadaşlarının olduğu topluluklar" count={withFriends.length}>
            <div className="ex-grid tp-grid">
              {withFriends.map((it) => (
                <ExploreCard key={it.id} it={it} busy={busy === it.id} onJoin={() => join(it)} />
              ))}
            </div>
          </Section>
        )}

        <Section
          icon={<Sparkles size={16} />}
          title="Sana önerilenler"
          count={rest.length || undefined}
          extra={
            <button className="ah-link" onClick={load} aria-label="Yenile" title="Yenile">
              <RefreshCw size={14} />
            </button>
          }
        >
          {Object.keys(counts).length > 1 && (
            <nav className="ex-cats tp-cats">
              <button className={cx('ex-chip', cat === 'all' && 'on')} onClick={() => setCat('all')}>
                Hepsi
              </button>
              {EXPLORE_CATS.filter((x) => counts[x.id]).map((x) => (
                <button key={x.id} className={cx('ex-chip', cat === x.id && 'on')} onClick={() => setCat(x.id)}>
                  {x.label} <span>{counts[x.id]}</span>
                </button>
              ))}
            </nav>
          )}
          {items === null ? (
            <div className="ah-loading">
              <LoaderCircle size={20} className="spin" />
            </div>
          ) : rest.length ? (
            <div className="ex-grid tp-grid">
              {rest.slice(0, 24).map((it) => (
                <ExploreCard key={it.id} it={it} busy={busy === it.id} onJoin={() => join(it)} />
              ))}
            </div>
          ) : (
            <div className="tp-empty">
              <Compass size={26} />
              <b>{err ? 'Öneriler yüklenemedi' : n ? 'Aramana uyan topluluk yok' : 'Şimdilik önerecek yeni bir topluluk yok'}</b>
              <span>
                {err ||
                  'Topluluk sahipleri Topluluk ayarları > Keşfet bölümünden topluluklarını listeleyince burada görünür. Kendi topluluğunu da listeleyebilirsin.'}
              </span>
            </div>
          )}
          {suggest.length > 24 && (
            <button className="ah-link tp-all" onClick={() => selectCommunity('explore')}>
              Hepsini Keşfet'te gör <ChevronRight size={14} />
            </button>
          )}
        </Section>

        <Section icon={<Hash size={16} />} title="Toplulukların" count={mine.length || undefined}>
          <div className="ah-comms">
            {myShown.map((c) => (
              <CommCard key={c.id} c={c} />
            ))}
            {!n && (
              <button className="ah-comm add" onClick={() => openModal({ type: 'createCommunity' })}>
                <span className="ah-add-ic">
                  <Plus size={22} />
                </span>
                <b>Topluluk oluştur</b>
                <span>ya da bir davetle katıl</span>
              </button>
            )}
          </div>
        </Section>
      </div>
    </section>
  );
}
