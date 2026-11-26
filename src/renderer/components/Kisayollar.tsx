// Klavye kısayolları: Ctrl+/ penceresi, ayarlardaki liste ve genel sustur / sağırlaştır tuşları
import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Keyboard } from 'lucide-react';
import { useStore, openModal, updateSettings } from '../lib/store';
import { kisayolGruplari, comboFromEvent, comboLabel, type KisayolGrubu } from '../lib/kisayollar';
import { cx, modKey } from '../lib/util';
import { Row } from './Settings';

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="ks-keys">
      {keys.map((k, i) => (
        <React.Fragment key={k}>
          {i > 0 && <span className="ks-or">/</span>}
          <kbd>{k}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

export function ShortcutList({ groups }: { groups: KisayolGrubu[] }) {
  return (
    <div className="ks-groups">
      {groups.map((g) => (
        <section key={g.title} className="ks-group">
          <h4>{g.title}</h4>
          <div className="shortcuts">
            {g.items.map((it) => (
              <div key={it.label + it.keys.join()} className="sc-row">
                <span>{it.label}</span>
                <Keys keys={it.keys} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Ctrl+/ ile açılan kısayol listesi */
export function ShortcutsModal() {
  const [q, setQ] = useState('');
  const close = () => openModal(null);
  const groups = useMemo(() => {
    const n = q.trim().toLocaleLowerCase('tr');
    const all = kisayolGruplari();
    if (!n) return all;
    return all
      .map((g) => (g.title.toLocaleLowerCase('tr').includes(n) ? g : { ...g, items: g.items.filter((it) => (it.label + ' ' + (it.tags || '') + ' ' + it.keys.join(' ')).toLocaleLowerCase('tr').includes(n)) }))
      .filter((g) => g.items.length);
  }, [q]);
  return (
    <div className="ks-modal">
      <div className="modal-head">
        <h2>
          <Keyboard size={20} /> Klavye kısayolları
        </h2>
        <button className="modal-x icon-btn" onClick={close} aria-label="Kapat">
          <X size={20} />
        </button>
      </div>
      <div className="ks-search input-icon">
        <Search size={16} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kısayol ara…" aria-label="Kısayol ara" />
      </div>
      <div className="ks-body scroll-thin">
        {groups.length ? <ShortcutList groups={groups} /> : <div className="empty-note">Eşleşen kısayol yok.</div>}
      </div>
      <div className="ks-foot">
        Sustur ve sağırlaştır için oyundayken de çalışan tuşları <button className="link" onClick={() => openModal({ type: 'settings', tab: 'app' })}>Ayarlar → Uygulama ve Kısayollar</button> bölümünden atayabilirsin. <span className="ks-foot-k"><kbd>{modKey}+/</kbd> aç / kapat</span>
      </div>
    </div>
  );
}

/** Tuş birleşimi kaydedici (genel sustur / sağırlaştır) */
function BindButton({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [rec, setRec] = useState(false);
  useEffect(() => {
    if (!rec) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey) return setRec(false);
      const c = comboFromEvent(e);
      if (!c) return; // yalnız Ctrl/Shift/Alt'a basıldı: asıl tuşu bekle
      onChange(c);
      setRec(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [rec]);
  return (
    <span className="ks-bind">
      <button className={cx('btn sm kbd-bind', rec && 'primary')} onClick={() => setRec(true)}>
        {rec ? 'Tuşlara bas… (Esc: vazgeç)' : comboLabel(value)}
      </button>
      {value && !rec && (
        <button className="icon-btn ks-clear" onClick={() => onChange('')} aria-label="Tuşu kaldır" title="Tuşu kaldır">
          <X size={14} />
        </button>
      )}
    </span>
  );
}

/** Ayarlar › Uygulama ve Kısayollar içindeki bölüm */
export function ShortcutSettings() {
  const s = useStore((x) => x.settings);
  const clash = s.globalMuteKey && s.globalMuteKey === s.globalDeafKey;
  return (
    <>
      <h3>Genel tuşlar</h3>
      <p className="set-note">Bir ses odasındayken oyun öndeyken bile çalışır. Ctrl, Alt ya da F tuşlarıyla bir birleşim seçmen önerilir; tek harf seçersen her yazışında tetiklenir.</p>
      <Row title="Mikrofonu aç / kapat" sub={`Uygulamadayken ${modKey}+Shift+M de çalışır.`}>
        <BindButton value={s.globalMuteKey} onChange={(v) => updateSettings({ globalMuteKey: v })} />
      </Row>
      <Row title="Sağırlaştır" sub={`Uygulamadayken ${modKey}+Shift+D de çalışır.`}>
        <BindButton value={s.globalDeafKey} onChange={(v) => updateSettings({ globalDeafKey: v })} />
      </Row>
      {clash && <p className="set-note warn">İki işe aynı tuş atandı; yalnızca mikrofon çalışır.</p>}
      <h3>Klavye kısayolları</h3>
      <p className="set-note">
        Bu listeyi her yerden <kbd>{modKey}+/</kbd> ile açabilirsin.
      </p>
      <ShortcutList groups={kisayolGruplari()} />
    </>
  );
}
