// Profil düzenleyici: hesap bağlama (Riot, Steam, Kick, Twitch, Spotify…)
import React, { useState } from 'react';
import { Trash2, Plus, X } from 'lucide-react';
import { ACCOUNT_SERVICES, RIOT_REGIONS, type AccountService, type LinkedAccount, type RiotRegion } from '../../../shared/profile';
import { SERVICES, ServiceIcon, accountFromInput, accountLabel, needsLink } from './Activity';
import { cx } from '../../lib/util';

export function AccountsEditor({ value, onChange }: { value: LinkedAccount[]; onChange: (v: LinkedAccount[]) => void }) {
  const [svc, setSvc] = useState<AccountService | null>(null);
  const [name, setName] = useState('');
  const [region, setRegion] = useState<RiotRegion>('tr');
  const [err, setErr] = useState('');
  const add = () => {
    if (!svc) return;
    const r = accountFromInput(svc, name);
    if (r.err || !r.name) return setErr(r.err || 'Boş bırakma.');
    const n = r.name.slice(0, 48);
    if (svc === 'riot' && !n.includes('#')) return setName(n + '#'), setErr('Riot kimliği Ad#Etiket biçiminde olmalı.');
    if (svc === 'battlenet' && !/#\d{3,6}$/.test(n)) return setErr('BattleTag Ad#1234 biçiminde olmalı.');
    setErr('');
    const next = value.filter((a) => !(a.svc === svc && a.name.toLowerCase() === n.toLowerCase()));
    next.push(svc === 'riot' ? { svc, name: n, region } : { svc, name: n });
    onChange(next.slice(0, 12));
    setSvc(null);
    setName('');
  };
  const meta = svc ? SERVICES[svc] : null;
  return (
    <div className="acc-ed">
      {value.length > 0 && (
        <div className="acc-list">
          {value.map((a, i) => (
            <div key={a.svc + a.name} className="acc-row">
              <ServiceIcon svc={a.svc} />
              <div className="acc-text">
                <b>{accountLabel(a)}</b>
                <span>
                  {SERVICES[a.svc].label}
                  {a.region ? ' · ' + a.region.toUpperCase() : ''}
                </span>
              </div>
              <button className="icon-btn sm" aria-label="Bağlantıyı kaldır" title="Kaldır" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {svc && meta ? (
        <div className="acc-form">
          <ServiceIcon svc={svc} size={36} />
          <div className="acc-form-main">
            <b>{meta.label} hesabını bağla</b>
            {needsLink(svc) && <span className="acc-form-sub">Profil bağlantını yapıştır.</span>}
            <div className="acc-form-row">
              <input
                autoFocus
                value={name}
                maxLength={120}
                placeholder={meta.placeholder}
                className={cx(err && 'invalid')}
                onChange={(e) => (setName(e.target.value), setErr(''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add();
                  if (e.key === 'Escape') setSvc(null);
                }}
              />
              {svc === 'riot' && (
                <select value={region} onChange={(e) => setRegion(e.target.value as RiotRegion)} aria-label="Bölge">
                  {RIOT_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r.toUpperCase()}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn primary sm" onClick={add} disabled={!name.trim()}>
                Bağla
              </button>
              <button className="icon-btn sm" aria-label="Vazgeç" onClick={() => setSvc(null)}>
                <X size={15} />
              </button>
            </div>
            {err ? <small className="acc-err">{err}</small> : meta.hint && <small>{meta.hint}</small>}
          </div>
        </div>
      ) : (
        <div className="acc-grid">
          {ACCOUNT_SERVICES.map((s) => {
            const linked = value.some((a) => a.svc === s);
            return (
              <button key={s} className={cx('acc-tile', linked && 'linked')} onClick={() => (setSvc(s), setName(''), setErr(''))} title={SERVICES[s].label + ' bağla'}>
                <ServiceIcon svc={s} size={26} />
                <span>{SERVICES[s].label}</span>
                {!linked && <Plus size={13} className="acc-plus" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
