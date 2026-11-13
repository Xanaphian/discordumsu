// Üye yönetimi menüsü, moderasyon pencereleri ve bildirim ayarları
import React, { useState } from 'react';
import { X, BellOff, Bell, AtSign } from 'lucide-react';
import { useStore, cmd, openModal, toast, updateSettings, setNotifyOverride, toggleMuted, type MenuItem, type NotifyLevel } from '../lib/store';
import { Modal } from './Modals';
import { Avatar, Toggle } from './Common';
import { cx, copyText, displayName, fmtTime } from '../lib/util';
import { can, canEditRole, isTimedOut, isVoiceLike, outranks, Perm, type Community } from '../../shared/protocol';

const close = () => openModal(null);

/** Bir üye için sağ tık menüsü (üye listesi, ayarlar, profil kartı) */
export function memberMenu(c: Community, me: string, uid: string, opts: { noProfile?: boolean; at?: { x: number; y: number } } = {}): MenuItem[] {
  const st = useStore.getState();
  const m = c.members.find((x) => x.userId === uid);
  const name = displayName(c, uid, st.users);
  const items: MenuItem[] = [];
  if (!opts.noProfile) items.push({ label: 'Profil', onClick: () => useStore.setState({ popout: { uid, cid: c.id, x: opts.at?.x ?? 400, y: opts.at?.y ?? 200 } }) });
  const self = uid === me;
  if ((self && (can(c, me, Perm.CHANGE_NICKNAME) || can(c, me, Perm.MANAGE_NICKNAMES))) || (!self && (can(c, me, Perm.MANAGE_NICKNAMES) || can(c, me, Perm.MANAGE_ROLES)) && outranks(c, me, uid)))
    items.push({ label: self ? 'Takma adını değiştir' : 'Takma adı değiştir', onClick: () => openModal({ type: 'moderate', cid: c.id, uid, action: 'nick' }) });
  if (can(c, me, Perm.MANAGE_ROLES) && m) {
    const roles = c.roles.filter((r) => r.id !== c.id && canEditRole(c, me, r)).sort((a, b) => b.position - a.position);
    if (roles.length) {
      items.push({ sep: true });
      for (const r of roles.slice(0, 15)) {
        const has = m.roles.includes(r.id);
        items.push({
          label: (r.icon ? r.icon + ' ' : '') + r.name,
          checked: has,
          onClick: () => cmd(c.id, { t: 'member.update', cid: c.id, userId: uid, roles: has ? m.roles.filter((x) => x !== r.id) : [...m.roles, r.id] }),
        });
      }
    }
    items.push({ label: 'Rolleri yönet…', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'roles' }) });
  }
  const mod: MenuItem[] = [];
  if (!self && m && outranks(c, me, uid)) {
    if (can(c, me, Perm.TIMEOUT))
      mod.push(
        isTimedOut(m)
          ? { label: 'Zaman aşımını kaldır', onClick: () => (cmd(c.id, { t: 'member.timeout', cid: c.id, userId: uid, minutes: 0 }), toast(`${name} için zaman aşımı kaldırıldı`, 'ok')) }
          : { label: `${name} için zaman aşımı`, danger: true, onClick: () => openModal({ type: 'moderate', cid: c.id, uid, action: 'timeout' }) },
      );
    if (can(c, me, Perm.KICK)) mod.push({ label: `${name} kişisini at`, danger: true, onClick: () => openModal({ type: 'moderate', cid: c.id, uid, action: 'kick' }) });
    if (can(c, me, Perm.BAN)) mod.push({ label: `${name} kişisini yasakla`, danger: true, onClick: () => openModal({ type: 'moderate', cid: c.id, uid, action: 'ban' }) });
  }
  if (mod.length) items.push({ sep: true }, ...mod);
  if (!self && uid !== 'kovan-asistan') {
    const blocked = st.settings.blocked.includes(uid);
    items.push({ sep: true }, { label: blocked ? 'Engeli kaldır' : 'Engelle', onClick: () => toggleBlock(uid, name) });
  }
  items.push({ label: 'Kullanıcı kimliğini kopyala', onClick: () => copyText(uid) });
  return items;
}

export function toggleBlock(uid: string, name: string) {
  const list = useStore.getState().settings.blocked;
  const on = !list.includes(uid);
  updateSettings({ blocked: on ? [...list, uid] : list.filter((x) => x !== uid) });
  toast(on ? `${name} engellendi. Mesajları gizlenir ve bildirim gelmez.` : `${name} kişisinin engeli kaldırıldı.`, 'ok');
}

const TIMEOUTS: [number, string][] = [
  [1, '60 saniye'],
  [5, '5 dakika'],
  [10, '10 dakika'],
  [60, '1 saat'],
  [1440, '1 gün'],
  [10080, '1 hafta'],
];

export function ModerateModal({ cid, uid, action }: { cid: string; uid: string; action: 'kick' | 'ban' | 'timeout' | 'nick' }) {
  const c = useStore((s) => s.communities[cid]);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me.id);
  const m = c?.members.find((x) => x.userId === uid);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [purge, setPurge] = useState(0);
  const [nick, setNick] = useState(m?.nick || '');
  if (!c) return null;
  const name = displayName(c, uid, users);
  const u = users[uid] || c.users[uid];
  const title = { kick: `${name} topluluktan atılsın mı?`, ban: `${name} yasaklansın mı?`, timeout: `${name} için zaman aşımı`, nick: uid === me ? 'Takma adını değiştir' : `${name} için takma ad` }[action];
  const submit = () => {
    if (action === 'kick') cmd(cid, { t: 'member.kick', cid, userId: uid, reason: reason.trim() || undefined });
    if (action === 'ban') cmd(cid, { t: 'member.ban', cid, userId: uid, reason: reason.trim() || undefined, purgeHours: purge });
    if (action === 'timeout') cmd(cid, { t: 'member.timeout', cid, userId: uid, minutes, reason: reason.trim() || undefined });
    if (action === 'nick') cmd(cid, { t: 'member.update', cid, userId: uid, nick: nick.trim() || null });
    close();
    if (action !== 'nick') toast(action === 'kick' ? `${name} atıldı` : action === 'ban' ? `${name} yasaklandı` : `${name} susturuldu`, 'ok');
  };
  return (
    <Modal onClose={close}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="modal-x icon-btn" onClick={close} aria-label="Kapat">
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">
        <div className="mod-target">
          <Avatar user={u} size={40} />
          <div>
            <b>{name}</b>
            <span>{u?.name}</span>
          </div>
        </div>
        {action === 'nick' && (
          <label className="field">
            <span>Takma ad</span>
            <input autoFocus value={nick} maxLength={32} placeholder={u?.name} onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            <small className="note">Sadece bu toplulukta görünür. Boş bırakırsan kullanıcı adı kullanılır.</small>
          </label>
        )}
        {action === 'timeout' && (
          <div className="field">
            <span>Süre</span>
            <div className="chip-pick">
              {TIMEOUTS.map(([v, l]) => (
                <button key={v} className={cx('chip-opt', minutes === v && 'on')} onClick={() => setMinutes(v)}>
                  {l}
                </button>
              ))}
            </div>
            <small className="note">Zaman aşımındaki üye mesajları okuyabilir ama yazamaz, tepki ekleyemez ve sesli kanallara katılamaz.</small>
          </div>
        )}
        {action === 'ban' && (
          <div className="field">
            <span>Mesaj geçmişini sil</span>
            <select value={purge} onChange={(e) => setPurge(Number(e.target.value))}>
              <option value={0}>Hiçbirini silme</option>
              <option value={1}>Son 1 saat</option>
              <option value={24}>Son 24 saat</option>
              <option value={168}>Son 7 gün</option>
            </select>
          </div>
        )}
        {action === 'kick' && <p className="note">{name} davet koduyla tekrar katılabilir.</p>}
        {action !== 'nick' && (
          <label className="field">
            <span>Sebep (isteğe bağlı, denetim kaydında görünür)</span>
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={close}>
          Vazgeç
        </button>
        <button className={cx('btn', action === 'nick' ? 'primary' : 'danger')} onClick={submit}>
          {{ kick: 'At', ban: 'Yasakla', timeout: 'Zaman aşımı uygula', nick: 'Kaydet' }[action]}
        </button>
      </div>
    </Modal>
  );
}

const LEVELS: [NotifyLevel | '', string, string][] = [
  ['', 'Genel ayarı kullan', 'Ayarlar → Bildirimler bölümündeki seçimin geçerli olur.'],
  ['all', 'Tüm mesajlar', 'Her yeni mesajda bildirim.'],
  ['mentions', 'Sadece bahsetmeler', '@adın, rollerin ve yanıtlar.'],
  ['none', 'Hiçbiri', 'Bildirim gösterme.'],
];

/** Topluluk ve kanallarının bildirim ayarları */
export function NotifyModal({ cid, chId }: { cid: string; chId?: string }) {
  const c = useStore((s) => s.communities[cid]);
  const s = useStore((x) => x.settings);
  const [target, setTarget] = useState<string>(chId || cid);
  if (!c) return null;
  const isComm = target === cid;
  const ch = c.channels.find((x) => x.id === target);
  const level = s.notifyOverrides[target] || '';
  const muted = s.mutedIds.includes(target);
  const chans = c.channels.filter((x) => !isVoiceLike(x.type));
  const overridden = chans.filter((x) => s.notifyOverrides[x.id] || s.mutedIds.includes(x.id));
  return (
    <Modal onClose={close}>
      <div className="modal-head">
        <h2>Bildirim ayarları</h2>
        <p>{isComm ? c.name : `#${ch?.name} · ${c.name}`}</p>
        <button className="modal-x icon-btn" onClick={close} aria-label="Kapat">
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">
        <label className="field">
          <span>Ayarlanan</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value={cid}>Tüm topluluk</option>
            {chans.map((x) => (
              <option key={x.id} value={x.id}>
                #{x.name}
              </option>
            ))}
          </select>
        </label>
        <div className="set-row">
          <div className="set-row-text">
            <div className="set-row-title">
              <BellOff size={15} /> {isComm ? 'Topluluğu sessize al' : 'Kanalı sessize al'}
            </div>
            <div className="set-row-sub">Sessizdeyken bildirim gelmez, okunmamış işareti soluk görünür. Bahsetme rozetleri yine sayılır.</div>
          </div>
          <Toggle value={muted} onChange={() => toggleMuted(target)} />
        </div>
        <div className={cx('radio-list', muted && 'dim')}>
          {LEVELS.map(([id, t, sub]) => (
            <button key={id || 'def'} className={cx('radio-opt', level === id && 'on')} onClick={() => setNotifyOverride(target, (id || null) as NotifyLevel | null)}>
              <span className="radio" />
              <div>
                <b>{id === '' && !isComm ? 'Topluluk ayarını kullan' : t}</b>
                <span>{id === '' && !isComm ? 'Topluluk için seçtiğin ayar geçerli olur.' : sub}</span>
              </div>
            </button>
          ))}
        </div>
        {isComm && (
          <div className="set-row">
            <div className="set-row-text">
              <div className="set-row-title">
                <AtSign size={15} /> @everyone ve @here bildirimlerini bastır
              </div>
              <div className="set-row-sub">Bu toplulukta herkese yapılan bahsetmeler seni bildirimle rahatsız etmez.</div>
            </div>
            <Toggle
              value={s.suppressEveryone.includes(cid)}
              onChange={(v) => updateSettings({ suppressEveryone: v ? [...s.suppressEveryone, cid] : s.suppressEveryone.filter((x) => x !== cid) })}
            />
          </div>
        )}
        {isComm && overridden.length > 0 && (
          <>
            <h4 className="mini-title">Kanal istisnaları</h4>
            <div className="list-card">
              {overridden.map((x) => (
                <div key={x.id} className="lc-row">
                  <div className="lc-text">
                    <b>#{x.name}</b>
                    <span>{s.mutedIds.includes(x.id) ? 'Sessizde' : LEVELS.find((l) => l[0] === s.notifyOverrides[x.id])?.[1]}</span>
                  </div>
                  <button
                    className="btn ghost sm"
                    onClick={() => {
                      setNotifyOverride(x.id, null);
                      if (s.mutedIds.includes(x.id)) toggleMuted(x.id);
                    }}
                  >
                    <Bell size={13} /> Sıfırla
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn primary" onClick={close}>
          Tamam
        </button>
      </div>
    </Modal>
  );
}

export function timeoutLeft(until?: number) {
  return until && until > Date.now() ? fmtTime(until) : '';
}
