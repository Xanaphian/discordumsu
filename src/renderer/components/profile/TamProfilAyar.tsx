// Profil düzenleyicide "Tam profil" sekmesi: düğmelerin sırası, görünürlüğü, açılış düğmesi ve düğme görünümü.
import React from 'react';
import { ArrowUp, ArrowDown, Eye, EyeOff, Star, Activity, Users, Home, UserRound } from 'lucide-react';
import { FULL_TABS, fullTabs, type FullLayout, type FullTab, type ProfileExtra } from '../../../shared/profile';
import { cx } from '../../lib/util';

const TAB_INFO: Record<FullTab, [string, string, React.ReactNode]> = {
  activity: ['Etkinlik', 'Şu an ne yaptığın ve son etkinliğin', <Activity size={16} key="a" />],
  friends: ['Ortak arkadaşlar', 'Profiline bakanla ortak arkadaşlarınız', <Users size={16} key="f" />],
  comms: ['Ortak topluluklar', 'Birlikte bulunduğunuz topluluklar', <Home size={16} key="c" />],
  about: ['Hakkında', 'Biyografi, ilgi alanları, bağlantılar, roller', <UserRound size={16} key="b" />],
};

export function FullLayoutEditor({ extra, onChange }: { extra: ProfileExtra; onChange: (full: FullLayout | undefined) => void }) {
  const l: FullLayout = extra.full || {};
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

    </div>
  );
}
