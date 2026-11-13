// Topluluk istatistikleri (v1.28): mesaj hareketi, saatlere göre yoğunluk, üye artışı, en hareketli kanal ve üyeler.
// Sunucu yalnız senin görebildiğin kanallardaki mesajlardan hesaplar.
import React, { useEffect, useRef, useState } from 'react';
import { X, ChartColumn, Hash } from 'lucide-react';
import { useStore, openModal, request } from '../lib/store';
import { Modal } from './Modals';
import { Avatar, CommunityIcon } from './Common';
import { cx, displayName } from '../lib/util';
import { isToolChannel, type CommunityStats, type ID } from '../../shared/protocol';
import { ToolIcon } from './Tools';
import { MONTH_NAMES } from '../lib/tools';
import '../styles/araclar.css';

const close = () => openModal(null);
const nf = new Intl.NumberFormat('tr-TR');

export function StatsModal({ cid }: { cid: ID }) {
  const c = useStore((s) => s.communities[cid]);
  const users = useStore((s) => s.users);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<CommunityStats | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true, got = false;
    setErr('');
    request<{ data: CommunityStats }>(cid, { t: 'stats', cid, days, rid: '' })
      .then((r) => ((got = true), live && setData(r.data)))
      .catch(() => live && setErr('İstatistikler alınamadı. Sunucu bu sürümü henüz desteklemiyor olabilir.'));
    const t = setTimeout(() => live && !got && setErr((e) => e || 'Sunucudan cevap gelmedi. Sunucu bu sürümü henüz desteklemiyor olabilir.'), 6000);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [cid, days]);
  if (!c) return null;
  const d = data && data.days === days ? data : null;
  const prevHalf = d ? d.perDay.slice(0, Math.floor(d.days / 2)).reduce((a, b) => a + b, 0) : 0;
  const lastHalf = d ? d.perDay.slice(Math.floor(d.days / 2)).reduce((a, b) => a + b, 0) : 0;
  const trend = prevHalf ? Math.round(((lastHalf - prevHalf) / prevHalf) * 100) : null;
  const peakHour = d ? d.perHour.indexOf(Math.max(...d.perHour)) : 0;
  return (
    <Modal onClose={close} className="st-modal" wide>
      <div className="modal-head st-head">
        <CommunityIcon c={c} size={36} />
        <div className="st-title">
          <h2>Topluluk istatistikleri</h2>
          <p>{c.name} · son {days} gün</p>
        </div>
        <div className="tl-seg st-range">
          {[7, 30, 90].map((n) => (
            <button key={n} className={cx(days === n && 'on')} onClick={() => setDays(n)}>
              {n} gün
            </button>
          ))}
        </div>
        <button className="modal-x icon-btn" onClick={close} aria-label="Kapat">
          <X size={20} />
        </button>
      </div>
      <div className="modal-body st-body scroll-thin">
        {!d ? (
          err ? <div className="tl-none">{err}</div> : <div className="tl-spin" />
        ) : (
          <>
            <div className="st-tiles">
              <Tile label="Mesaj" value={nf.format(d.messages)} sub={trend === null ? 'önceki yarıya göre: —' : `${trend >= 0 ? '▲' : '▼'} %${Math.abs(trend)} dönemin ikinci yarısında`} />
              <Tile label="Yazan üye" value={nf.format(d.activeMembers)} sub={`${c.members.length} üyenin %${c.members.length ? Math.round((d.activeMembers / c.members.length) * 100) : 0}'i`} />
              <Tile label="Yeni üye" value={nf.format(d.joined)} sub={`toplam ${nf.format(d.memberCurve[d.memberCurve.length - 1] || 0)} üye`} />
              <Tile label="En yoğun saat" value={`${String(peakHour).padStart(2, '0')}:00`} sub={`günde ortalama ${nf.format(Math.round(d.messages / d.days))} mesaj`} />
            </div>
            <section className="st-card">
              <h3>Günlük mesaj</h3>
              <Bars values={d.perDay} label={(i) => dayLabel(d.days, i)} tip={(v, i) => `${dayLabel(d.days, i)}: ${nf.format(v)} mesaj`} ticks={dayTicks(d.days)} />
            </section>
            <div className="st-row">
              <section className="st-card">
                <h3>Saatlere göre</h3>
                <Bars values={d.perHour} label={(i) => `${String(i).padStart(2, '0')}:00`} tip={(v, i) => `${String(i).padStart(2, '0')}:00–${String((i + 1) % 24).padStart(2, '0')}:00: ${nf.format(v)} mesaj`} ticks={[0, 6, 12, 18, 23]} small />
              </section>
              <section className="st-card">
                <h3>Üye sayısı</h3>
                <Line values={d.memberCurve} tip={(v, i) => `${dayLabel(d.days, i)}: ${nf.format(v)} üye`} ticks={dayTicks(d.days)} label={(i) => dayLabel(d.days, i)} />
              </section>
            </div>
            <div className="st-row">
              <section className="st-card">
                <h3>En hareketli kanallar</h3>
                <Ranks
                  rows={d.topChannels.map((x) => {
                    const ch = c.channels.find((y) => y.id === x.id);
                    return { id: x.id, n: x.n, name: ch?.name || 'silinmiş kanal', icon: ch && isToolChannel(ch.type) ? <ToolIcon type={ch.type} size={15} /> : <Hash size={15} /> };
                  })}
                />
              </section>
              <section className="st-card">
                <h3>En çok yazanlar</h3>
                <Ranks rows={d.topMembers.map((x) => ({ id: x.id, n: x.n, name: displayName(c, x.id, users), icon: <Avatar user={users[x.id] || c.users[x.id]} size={20} /> }))} />
              </section>
            </div>
            <p className="st-note">Sesli odalar sayılmaz; yalnız senin görebildiğin kanallar hesaba katılır. Saatler Türkiye saatidir.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="st-tile">
      <span>{label}</span>
      <b>{value}</b>
      <small>{sub}</small>
    </div>
  );
}

function dayLabel(days: number, i: number) {
  const d = new Date(Date.now() - (days - 1 - i) * 86400000);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}
function dayTicks(days: number) {
  const step = days <= 7 ? 1 : days <= 30 ? 7 : 15;
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 2 ? 2 : m <= 4 ? 4 : m <= 5 ? 5 : 10) * p;
};

/** Grafiğin gerçek genişliği: yazılar esnemesin diye viewBox piksele eşit tutulur */
function useWidth(def = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(def);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.clientWidth && setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth || def);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function useHover() {
  const [h, setH] = useState<{ i: number; x: number; y: number } | null>(null);
  return [h, setH] as const;
}

function Bars({ values, tip, ticks, label, small }: { values: number[]; tip: (v: number, i: number) => string; ticks: number[]; label: (i: number) => string; small?: boolean }) {
  const [h, setH] = useHover();
  const [ref, Wd] = useWidth();
  const Ht = small ? 150 : 180, pl = 34, pb = 22, pt = 8;
  const max = niceMax(Math.max(1, ...values));
  const bw = (Wd - pl) / values.length;
  const y = (v: number) => pt + (Ht - pt - pb) * (1 - v / max);
  return (
    <div className="st-chart" ref={ref} onMouseLeave={() => setH(null)}>
      <svg viewBox={`0 0 ${Wd} ${Ht}`} style={{ height: Ht }} role="img" aria-label="Çubuk grafik">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pl} x2={Wd} y1={y(max * f)} y2={y(max * f)} className="st-grid" />
            <text x={pl - 6} y={y(max * f) + 4} className="st-axis" textAnchor="end">
              {nf.format(max * f)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = pl + i * bw + Math.min(2, bw * 0.15);
          const w = Math.max(1, bw - Math.min(4, bw * 0.3));
          const top = y(v);
          const hgt = Math.max(0, Ht - pb - top);
          const r = Math.min(4, w / 2, hgt);
          return (
            <g key={i}>
              {v > 0 && <path d={`M${x} ${Ht - pb}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + w - r}Q${x + w} ${top} ${x + w} ${top + r}V${Ht - pb}Z`} className={cx('st-bar', h?.i === i && 'on')} />}
              <rect x={pl + i * bw} y={pt} width={bw} height={Ht - pt - pb} fill="transparent" onMouseEnter={(e) => setH({ i, x: (pl + i * bw + bw / 2) / Wd, y: top / Ht })} />
            </g>
          );
        })}
        <line x1={pl} x2={Wd} y1={Ht - pb} y2={Ht - pb} className="st-base" />
        {ticks.map((i) => (
          <text key={i} x={pl + i * bw + bw / 2} y={Ht - 6} className="st-axis" textAnchor="middle">
            {label(i)}
          </text>
        ))}
      </svg>
      {h && (
        <div className="st-tip" style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}>
          {tip(values[h.i], h.i)}
        </div>
      )}
    </div>
  );
}

function Line({ values, tip, ticks, label }: { values: number[]; tip: (v: number, i: number) => string; ticks: number[]; label: (i: number) => string }) {
  const [h, setH] = useHover();
  const [ref, Wd] = useWidth();
  const Ht = 150, pl = 34, pb = 22, pt = 8;
  const lo = Math.max(0, Math.min(...values) - 1);
  const max = Math.max(lo + 4, niceMax(Math.max(...values)));
  const x = (i: number) => pl + (values.length < 2 ? 0 : (i / (values.length - 1)) * (Wd - pl - 6));
  const y = (v: number) => pt + (Ht - pt - pb) * (1 - (v - lo) / (max - lo));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join('');
  return (
    <div className="st-chart" ref={ref} onMouseLeave={() => setH(null)}>
      <svg
        viewBox={`0 0 ${Wd} ${Ht}`}
        style={{ height: Ht }}
        role="img"
        aria-label="Çizgi grafik"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGElement).getBoundingClientRect();
          const fx = ((e.clientX - r.left) / r.width) * Wd;
          const i = Math.max(0, Math.min(values.length - 1, Math.round(((fx - pl) / (Wd - pl - 6)) * (values.length - 1))));
          setH({ i, x: x(i) / Wd, y: y(values[i]) / Ht });
        }}
      >
        {[lo, (lo + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1={pl} x2={Wd} y1={y(v)} y2={y(v)} className="st-grid" />
            <text x={pl - 6} y={y(v) + 4} className="st-axis" textAnchor="end">
              {nf.format(Math.round(v))}
            </text>
          </g>
        ))}
        <path d={`${d}L${x(values.length - 1)} ${Ht - pb}L${x(0)} ${Ht - pb}Z`} className="st-area" />
        <path d={d} className="st-line" vectorEffect="non-scaling-stroke" />
        {h && <line x1={x(h.i)} x2={x(h.i)} y1={pt} y2={Ht - pb} className="st-cross" vectorEffect="non-scaling-stroke" />}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={Ht - 6} className="st-axis" textAnchor="middle">
            {label(i)}
          </text>
        ))}
      </svg>
      {h && (
        <>
          <i className="st-dot" style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }} />
          <div className="st-tip" style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}>
            {tip(values[h.i], h.i)}
          </div>
        </>
      )}
    </div>
  );
}

function Ranks({ rows }: { rows: { id: ID; n: number; name: string; icon: React.ReactNode }[] }) {
  if (!rows.length) return <div className="tl-none sm">Bu dönemde hiç mesaj yok.</div>;
  const max = rows[0].n || 1;
  return (
    <div className="st-ranks">
      {rows.map((r) => (
        <div key={r.id} className="st-rank">
          <span className="st-rank-name">
            {r.icon}
            <span>{r.name}</span>
          </span>
          <span className="st-rank-bar">
            <i style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <b>{nf.format(r.n)}</b>
        </div>
      ))}
    </div>
  );
}

export const StatsIcon = ChartColumn;
