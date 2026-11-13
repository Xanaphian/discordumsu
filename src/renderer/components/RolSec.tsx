// v1.26 Rollerini seç: yöneticinin "üyeler kendisi alabilir" dediği rolleri üye kendi açıp kapatır.
import React, { useState } from 'react';
import { X, Check, LoaderCircle } from 'lucide-react';
import { useStore, openModal, request, toast } from '../lib/store';
import { Modal } from './Modals';
import { cx } from '../lib/util';
import type { Role } from '../../shared/protocol';

const close = () => openModal(null);

export function SelfRolesModal({ cid }: { cid: string }) {
  const c = useStore((s) => s.communities[cid]);
  const me = useStore((s) => s.me.id);
  const [busy, setBusy] = useState<string | null>(null);
  if (!c) return null;
  const mine = c.members.find((m) => m.userId === me)?.roles || [];
  const roles = c.roles.filter((r) => r.selfAssign && r.id !== c.id).sort((a, b) => b.position - a.position);
  const toggle = async (r: Role) => {
    const on = !mine.includes(r.id);
    setBusy(r.id);
    try {
      await request(cid, { t: 'role.self', cid, id: r.id, on, rid: '' });
      toast(on ? `"${r.name}" rolünü aldın` : `"${r.name}" rolünü bıraktın`, 'ok');
    } catch (e) {
      const msg = (e as Error).message;
      toast(msg === 'Zaman aşımı' ? 'Sunucu bu özelliği henüz desteklemiyor; sunucunun güncellenmesi gerekiyor.' : msg, 'err');
    }
    setBusy(null);
  };
  return (
    <Modal onClose={close} className="selfroles-modal">
      <div className="modal-head">
        <h2>Rollerini seç</h2>
        <p>{c.name} topluluğunda kendine uygun rolleri aç. İstediğin zaman bırakabilirsin.</p>
        <button className="modal-x icon-btn" onClick={close} aria-label="Kapat">
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">
        <div className="sr-list">
          {roles.map((r) => {
            const on = mine.includes(r.id);
            return (
              <button key={r.id} className={cx('sr-role', on && 'on')} style={{ ['--rc' as any]: r.color || 'var(--text-3)' }} disabled={busy === r.id} onClick={() => toggle(r)}>
                <span className="sr-dot" />
                {r.icon && <span className="role-icon">{r.icon}</span>}
                <span className="sr-name">{r.name}</span>
                <span className="sr-check">{busy === r.id ? <LoaderCircle size={14} className="spin" /> : on ? <Check size={14} /> : null}</span>
              </button>
            );
          })}
          {!roles.length && <div className="empty-note">Bu toplulukta kendine verebileceğin bir rol yok.</div>}
        </div>
      </div>
    </Modal>
  );
}
