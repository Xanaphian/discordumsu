// Profil düzenleyicide "Tam profil" sekmesi: düğmelerin sırası, görünürlüğü, açılış düğmesi, düğme görünümü ve vitrin.
import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Eye, EyeOff, Star, X, Plus, Activity, Users, Home, UserRound } from 'lucide-react';
import { FULL_TABS, fullTabs, type FullLayout, type FullTab, type ProfileExtra } from '../../../shared/profile';
import { gameBrand } from '../../lib/brands';
import { BrandLogo } from './Activity';
import { cx } from '../../lib/util';

const TAB_INFO: Record<FullTab, [string, string, React.ReactNode]> = {
  activity: ['Etkinlik', 'Şu an ne yaptığın, vitrin ve son 30 gün', <Activity size={16} key="a" />],
  friends: ['Ortak arkadaşlar', 'Profiline bakanla ortak arkadaşlarınız', <Users size={16} key="f" />],
  comms: ['Ortak topluluklar', 'Birlikte bulunduğunuz topluluklar', <Home size={16} key="c" />],
  about: ['Hakkında', 'Biyografi, ilgi alanları, bağlantılar, roller', <UserRound size={16} key="b" />],
};

const POPULAR = [
  'League of Legends', 'Valorant', 'Counter-Strike 2', 'Fortnite', 'Minecraft', 'Dota 2', 'Apex Legends', 'Overwatch 2', 'Rocket League',
  'Grand Theft Auto V', 'Rainbow Six Siege', 'PUBG', 'Roblox', 'The Finals', 'Marvel Rivals', 'Euro Truck Simulator 2', 'osu!', 'Teamfight Tactics',
];

export function FullLayoutEditor({ extra, onChange }: { extra: ProfileExtra; onChange: (full: FullLayout | undefined) => void }) {
  const l: FullLayout = extra.full || {};
  const [game, setGame] = useState('');
  const set = (patch: Partial<FullLayout>) => {
    const next = { ...l, ...patch };
    for (const k of Object.keys(next) as (keyof FullLayout)[]) if (next[k] === undefined || (Array.isArray(next[k]) && !(next[k] as unknown[]).length)) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const order: FullTab[] = [...(l.order || []).filter((t) => FULL_TABS.includes(t)), ...FULL_TABS].filter((t, i, a) => a.indexOf(t) === i);
  const hidden = new Set(l.hide || []);
  const visible = fullTabs(l);
  const open = l.open && visible.includes(l.open) ? l.open : undefined;
  const move = (i: number, d: number) => {
    const o = [...order];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    set({ order: o });
  };
  const toggle = (t: FullTab) => {
    const h = new Set(hidden);
    if (h.has(t)) h.delete(t);
    else if (visible.length > 1) h.add(t);
    set({ hide: [...h], open: open === t && h.has(t) ? undefined : l.open });
  };
  const fav = l.fav || [];
  const recentGames = (extra.recent || []).filter((r) => r.kind === 'playing').map((r) => r.name);
  const suggest = [...new Set([...recentGames, ...POPULAR])].filter((g) => !fav.some((f) => f.toLowerCase() === g.toLowerCase()));
  const addGame = (g: string) => {
    const t = g.trim().slice(0, 40);
    if (!t || fav.length >= 4 || fav.some((f) => f.toLowerCase() === t.toLowerCase())) return setGame('');
    set({ fav: [...fav, t] });
    setGame('');
  };

  return (
    <div className="tpa">
      <div className="field">
        <span>Düğmeler</span>
        <small className="tpa-help">Tam profilinde görünen düğmeler. Sırasını değiştir, istemediğini gizle, yıldızla açılışta seçili olanı belirle.</small>
        <div className="tpa-list">
          {order.map((t, i) => {
            const [title, sub, icon] = TAB_INFO[t];
            const off = hidden.has(t);
            const isOpen = (open || visible[0]) === t && !off;
            return (
              <div key={t} className={cx('tpa-row', off && 'off')}>
                <span className="tpa-ic">{icon}</span>
                <div className="tpa-t">
                  <b>{title}</b>
                  <small>{off ? 'Gizli' : sub}</small>
                </div>
                <button className={cx('icon-btn sm tpa-star', isOpen && 'on')} title="Açılışta bu seçili olsun" aria-label="Açılışta seçili" disabled={off} onClick={() => set({ open: t })}>
                  <Star size={15} />
                </button>
                <button className="icon-btn sm" title={off ? 'Göster' : 'Gizle'} aria-label={off ? 'Göster' : 'Gizle'} disabled={!off && visible.length <= 1} onClick={() => toggle(t)}>
                  {off ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button className="icon-btn sm" title="Yukarı" aria-label="Yukarı" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={15} />
                </button>
                <button className="icon-btn sm" title="Aşağı" aria-label="Aşağı" disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="field">
        <span>Düğme görünümü</span>
        <div className="tpa-styles">
          {(
            [
              ['tiles', 'Büyük kartlar', 'Simge, başlık ve kısa bilgi'],
              ['pills', 'Sade sekmeler', 'Tek satır, daha az yer'],
            ] as const
          ).map(([v, t, sub]) => (
            <button key={v} className={cx('tpa-style', (l.btn || 'tiles') === v && 'on')} onClick={() => set({ btn: v === 'tiles' ? undefined : v })}>
              <span className={cx('tpa-style-art', v)}>
                <i />
                <i />
                <i />
              </span>
              <b>{t}</b>
              <small>{sub}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Vitrin ({fav.length}/4)</span>
        <small className="tpa-help">Etkinlik bölümünün üstünde öne çıkan oyunların.</small>
        <div className="tpa-favs">
          {fav.map((g) => {
            const b = gameBrand(g);
            return (
              <span key={g} className="tpa-fav">
                {b ? <BrandLogo k={b} size={22} /> : <span className="tpa-fav-i">{g.slice(0, 2).toLocaleUpperCase('tr')}</span>}
                {g}
                <button className="icon-btn sm" aria-label="Kaldır" onClick={() => set({ fav: fav.filter((x) => x !== g) })}>
                  <X size={13} />
                </button>
              </span>
            );
          })}
        </div>
        {fav.length < 4 && (
          <>
            <div className="tpa-add">
              <input
                value={game}
                maxLength={40}
                list="tpa-games"
                placeholder="Oyun adı yaz ya da seç"
                onChange={(e) => setGame(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addGame(game)}
              />
              <button className="btn sm ghost" onClick={() => addGame(game)} disabled={!game.trim()}>
                <Plus size={14} /> Ekle
              </button>
              <datalist id="tpa-games">
                {suggest.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <div className="tpa-suggest">
              {suggest.slice(0, 8).map((g) => (
                <button key={g} onClick={() => addGame(g)}>
                  {g}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
