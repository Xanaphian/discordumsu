// Emoji seçicisinin GIF ve Çıkartmalar sekmeleri
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Star } from 'lucide-react';
import { useStore, openModal, hostHttp } from '../lib/store';
import { can, Perm } from '../../shared/protocol';
import { GIFS, STICKERS, searchMedia, gifToken, stickerToken, customStickerToken, mediaPrefs, rememberMedia, toggleFavGif, toggleFavSt, giphyFetch, giphyThumb, giphyToken, type GiphyItem } from '../lib/medya';
import { cx } from '../lib/util';

export type PickerTab = 'gif' | 'sticker' | 'emoji';

export function PickerTabs({ tab, setTab }: { tab: PickerTab; setTab: (t: PickerTab) => void }) {
  const tabs: [PickerTab, string][] = [
    ['gif', 'GIF'],
    ['sticker', 'Çıkartmalar'],
    ['emoji', 'Emoji'],
  ];
  return (
    <div className="ep-tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={tab === id} className={cx('ep-tab', tab === id && 'on')} onClick={() => setTab(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder, inputRef }: { value: string; onChange: (v: string) => void; placeholder: string; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <div className="ep-search">
      <input ref={inputRef} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

type GifCat = 'fav' | 'recent' | 'trend' | 'xn';
type GTile = { key: string; name: string; thumb: string; token: string };

function Chips<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="mp-chips">
      {items.map(([id, label]) => (
        <button key={id} className={cx('mp-chip', value === id && 'on')} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function GifPanel({ onSend, inputRef }: { onSend: (token: string) => void; inputRef?: React.Ref<HTMLInputElement> }) {
  const [q, setQ] = useState('');
  const [prefs, setPrefs] = useState(mediaPrefs);
  const [cat, setCat] = useState<GifCat>(() => (mediaPrefs().recentGif.length ? 'recent' : 'trend'));
  const [web, setWeb] = useState<GiphyItem[] | null>(null);
  const [err, setErr] = useState(false);
  // Giphy: arama yazıldıkça (kısa bekleyişle) ya da "Trend" sekmesinde yüklenir
  useEffect(() => {
    if (!q.trim() && cat !== 'trend') return;
    setErr(false);
    const ac = new AbortController();
    const t = setTimeout(() => giphyFetch(q, ac.signal).then(setWeb).catch((e) => e?.name !== 'AbortError' && (setWeb([]), setErr(true))), q.trim() ? 350 : 0);
    return () => (clearTimeout(t), ac.abort());
  }, [q, cat]);
  const own: GTile[] = useMemo(() => GIFS.map((g) => ({ key: g.id, name: g.name, thumb: g.url, token: gifToken(g.id) })), []);
  const fromKey = (k: string): GTile | undefined => {
    if (k.startsWith('g:')) {
      const [id, ...n] = k.slice(2).split('|');
      const g = { id, name: n.join('|') || 'GIF' };
      return { key: k, name: g.name, thumb: giphyThumb(id), token: giphyToken(g) };
    }
    return own.find((x) => x.key === k);
  };
  const webTile = (g: GiphyItem): GTile => ({ key: `g:${g.id}|${g.name}`, name: g.name, thumb: g.thumb, token: giphyToken(g) });
  let list: GTile[];
  if (q.trim()) list = [...searchMedia(own, q), ...(web || []).map(webTile)];
  else if (cat === 'fav') list = prefs.favGif.map(fromKey).filter(Boolean) as GTile[];
  else if (cat === 'recent') list = prefs.recentGif.map(fromKey).filter(Boolean) as GTile[];
  else if (cat === 'xn') list = own;
  else list = (web || []).map(webTile);
  const send = (g: GTile) => {
    rememberMedia('gif', g.key);
    onSend(g.token);
  };
  const Tile = ({ g }: { g: GTile }) => (
    <div className="gif-tile" title={g.name}>
      <button className="gif-img" onClick={() => send(g)} aria-label={g.name + ' gönder'}>
        <img src={g.thumb} alt={g.name} loading="lazy" draggable={false} />
        <span className="gif-name">{g.name}</span>
      </button>
      <button
        className={cx('gif-fav', prefs.favGif.includes(g.key) && 'on')}
        title={prefs.favGif.includes(g.key) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
        onClick={() => setPrefs({ ...prefs, favGif: toggleFavGif(g.key) })}
      >
        <Star size={14} />
      </button>
    </div>
  );
  const loading = (q.trim() || cat === 'trend') && web === null;
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="GIF ara (Giphy)" inputRef={inputRef} />
      {!q && (
        <Chips<GifCat>
          value={cat}
          onChange={setCat}
          items={[['fav', '★ Favoriler'], ['recent', 'Son kullanılan'], ['trend', 'Trend'], ['xn', 'Naphian']]}
        />
      )}
      <div className="ep-body scroll-thin media-body">
        <div className="gif-grid">
          {list.map((g) => (
            <Tile key={g.key} g={g} />
          ))}
        </div>
        {loading && <div className="empty-note">Yükleniyor…</div>}
        {!loading && !list.length && (
          <div className="empty-note">
            {err ? 'GIF kütüphanesine ulaşılamadı.' : q ? `"${q}" için GIF bulunamadı.` : cat === 'fav' ? 'Henüz favori GIF yok. Bir GIF üzerindeki yıldıza bas.' : 'Burada henüz bir şey yok.'}
          </div>
        )}
        {(q || cat === 'trend') && <div className="mp-credit">Powered by GIPHY</div>}
      </div>
    </>
  );
}

type StItem = { key: string; name: string; url: string; token: string; tag?: string; tags?: string[] };

type StCat = 'fav' | 'recent' | 'comm' | 'xn';

export function StickerPanel({ cid, onSend, onClose, inputRef }: { cid?: string; onSend: (token: string) => void; onClose: () => void; inputRef?: React.Ref<HTMLInputElement> }) {
  const [q, setQ] = useState('');
  const [prefs, setPrefs] = useState(mediaPrefs);
  const c = useStore((s) => (cid ? s.communities[cid] : undefined));
  const me = useStore((s) => s.me.id);
  const real = c && !c.dm ? c : undefined;
  const base = cid ? hostHttp(cid) : '';
  const own: StItem[] = (real?.stickers || []).map((s) => ({ key: 'c:' + s.url, name: s.name, url: base + s.url, token: customStickerToken(s), tag: s.tag }));
  const builtIn: StItem[] = STICKERS.map((s) => ({ key: 'b:' + s.id, name: s.name, url: s.url, token: stickerToken(s.id), tags: s.tags }));
  const all = [...own, ...builtIn];
  const [cat, setCat] = useState<StCat>(() => (mediaPrefs().recentSt.length ? 'recent' : real ? 'comm' : 'xn'));
  const pick = (keys: string[]) => keys.map((k) => all.find((x) => x.key === k)).filter(Boolean) as StItem[];
  const manage = !!real && can(real, me, Perm.MANAGE_COMMUNITY);
  const send = (s: StItem) => {
    rememberMedia('st', s.key);
    onSend(s.token);
  };
  const grid = (list: StItem[]) => (
    <div className="st-grid">
      {list.map((s) => (
        <div key={s.key} className="st-cell">
          <button className="st-tile" title={s.name} onClick={() => send(s)}>
            <img src={s.url} alt={s.name} loading="lazy" draggable={false} />
          </button>
          <button
            className={cx('gif-fav', prefs.favSt.includes(s.key) && 'on')}
            title={prefs.favSt.includes(s.key) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            onClick={() => setPrefs({ ...prefs, favSt: toggleFavSt(s.key) })}
          >
            <Star size={12} />
          </button>
        </div>
      ))}
    </div>
  );
  const found = q ? searchMedia(all, q) : null;
  const shown = cat === 'fav' ? pick(prefs.favSt) : cat === 'recent' ? pick(prefs.recentSt) : cat === 'comm' ? own : builtIn;
  const chips: [StCat, string][] = [['fav', '★ Favoriler'], ['recent', 'Son kullanılan'], ...(real ? ([['comm', real.name.length > 14 ? real.name.slice(0, 13) + '…' : real.name]] as [StCat, string][]) : []), ['xn', 'Naphian']];
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Çıkartma ara" inputRef={inputRef} />
      {!q && <Chips<StCat> value={cat} onChange={setCat} items={chips} />}
      <div className="ep-body scroll-thin media-body">
        {found ? (
          found.length ? grid(found) : <div className="empty-note">"{q}" için çıkartma bulunamadı.</div>
        ) : (
          <>
            {cat === 'comm' && real && manage && (
              <button
                className="st-add-link mp-add"
                onClick={() => {
                  onClose();
                  openModal({ type: 'commSettings', cid: real.id, tab: 'stickers' });
                }}
              >
                <Plus size={13} /> Çıkartma oluştur
              </button>
            )}
            {shown.length ? (
              grid(shown)
            ) : (
              <div className="st-empty">
                {cat === 'fav'
                  ? 'Henüz favori çıkartma yok. Bir çıkartmanın köşesindeki yıldıza bas.'
                  : cat === 'recent'
                    ? 'Henüz çıkartma kullanmadın.'
                    : `Bu toplulukta henüz çıkartma yok.${manage ? ' Kendi çıkartmanı yükleyebilirsin.' : ' Topluluğu yönetenler ekleyebilir.'}`}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
