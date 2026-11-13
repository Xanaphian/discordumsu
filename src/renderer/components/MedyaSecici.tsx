// Emoji seçicisinin GIF ve Çıkartmalar sekmeleri
import React, { useMemo, useState } from 'react';
import { Plus, Star } from 'lucide-react';
import { useStore, openModal, hostHttp } from '../lib/store';
import { can, Perm } from '../../shared/protocol';
import { GIFS, STICKERS, searchMedia, gifToken, stickerToken, customStickerToken, mediaPrefs, rememberMedia, toggleFavGif, type MediaItem } from '../lib/medya';
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

export function GifPanel({ onSend, inputRef }: { onSend: (token: string) => void; inputRef?: React.Ref<HTMLInputElement> }) {
  const [q, setQ] = useState('');
  const [prefs, setPrefs] = useState(mediaPrefs);
  const list = useMemo(() => searchMedia(GIFS, q), [q]);
  const fav = prefs.favGif.map((id) => GIFS.find((g) => g.id === id)).filter(Boolean) as MediaItem[];
  const send = (g: MediaItem) => {
    rememberMedia('gif', g.id);
    onSend(gifToken(g.id));
  };
  const Tile = ({ g }: { g: MediaItem }) => (
    <div className="gif-tile" title={g.name}>
      <button className="gif-img" onClick={() => send(g)} aria-label={g.name + ' gönder'}>
        <img src={g.url} alt={g.name} loading="lazy" draggable={false} />
        <span className="gif-name">{g.name}</span>
      </button>
      <button
        className={cx('gif-fav', prefs.favGif.includes(g.id) && 'on')}
        title={prefs.favGif.includes(g.id) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
        onClick={() => setPrefs({ ...prefs, favGif: toggleFavGif(g.id) })}
      >
        <Star size={14} />
      </button>
    </div>
  );
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="GIF ara (ör. haha, tebrik, gece)" inputRef={inputRef} />
      <div className="ep-body scroll-thin media-body">
        {!q && fav.length > 0 && (
          <>
            <div className="ep-cat-title">Favoriler</div>
            <div className="gif-grid">
              {fav.map((g) => (
                <Tile key={'f' + g.id} g={g} />
              ))}
            </div>
          </>
        )}
        {!q && <div className="ep-cat-title">Xanaphian GIF'leri</div>}
        <div className="gif-grid">
          {list.map((g) => (
            <Tile key={g.id} g={g} />
          ))}
        </div>
        {!list.length && <div className="empty-note">"{q}" için GIF bulunamadı.</div>}
      </div>
    </>
  );
}

type StItem = { key: string; name: string; url: string; token: string; tag?: string; tags?: string[] };

export function StickerPanel({ cid, onSend, onClose, inputRef }: { cid?: string; onSend: (token: string) => void; onClose: () => void; inputRef?: React.Ref<HTMLInputElement> }) {
  const [q, setQ] = useState('');
  const c = useStore((s) => (cid ? s.communities[cid] : undefined));
  const me = useStore((s) => s.me.id);
  const real = c && !c.dm ? c : undefined;
  const base = cid ? hostHttp(cid) : '';
  const own: StItem[] = (real?.stickers || []).map((s) => ({ key: 'c:' + s.url, name: s.name, url: base + s.url, token: customStickerToken(s), tag: s.tag }));
  const builtIn: StItem[] = STICKERS.map((s) => ({ key: 'b:' + s.id, name: s.name, url: s.url, token: stickerToken(s.id), tags: s.tags }));
  const all = [...own, ...builtIn];
  const recent = useMemo(() => mediaPrefs().recentSt.map((k) => all.find((x) => x.key === k)).filter(Boolean) as StItem[], [real?.stickers]); // eslint-disable-line react-hooks/exhaustive-deps
  const manage = !!real && can(real, me, Perm.MANAGE_COMMUNITY);
  const send = (s: StItem) => {
    rememberMedia('st', s.key);
    onSend(s.token);
  };
  const grid = (list: StItem[]) => (
    <div className="st-grid">
      {list.map((s) => (
        <button key={s.key} className="st-tile" title={s.name} onClick={() => send(s)}>
          <img src={s.url} alt={s.name} loading="lazy" draggable={false} />
        </button>
      ))}
    </div>
  );
  const found = q ? searchMedia(all, q) : null;
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Çıkartma ara" inputRef={inputRef} />
      <div className="ep-body scroll-thin media-body">
        {found ? (
          found.length ? grid(found) : <div className="empty-note">"{q}" için çıkartma bulunamadı.</div>
        ) : (
          <>
            {recent.length > 0 && (
              <>
                <div className="ep-cat-title">Son kullanılanlar</div>
                {grid(recent)}
              </>
            )}
            {real && (
              <>
                <div className="ep-cat-title st-head">
                  <span>{real.name}</span>
                  {manage && (
                    <button
                      className="st-add-link"
                      onClick={() => {
                        onClose();
                        openModal({ type: 'commSettings', cid: real.id, tab: 'stickers' });
                      }}
                    >
                      <Plus size={13} /> Çıkartma oluştur
                    </button>
                  )}
                </div>
                {own.length ? (
                  grid(own)
                ) : (
                  <div className="st-empty">
                    Bu toplulukta henüz çıkartma yok.
                    {manage ? ' Kendi çıkartmanızı yükleyip herkesin kullanmasını sağlayabilirsin.' : ' Topluluğu yönetenler ekleyebilir.'}
                  </div>
                )}
              </>
            )}
            <div className="ep-cat-title">Xanaphian</div>
            {grid(builtIn)}
          </>
        )}
      </div>
    </>
  );
}
