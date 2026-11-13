import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Trash2, Plus } from 'lucide-react';
import { useStore, cmd, toast, confirmDialog, deleteCommunity, makeInvite } from '../lib/store';
import { Avatar, CommunityIcon, Toggle } from './Common';
import { cx, COLORS, resizeImage, copyText, fmtDay, displayName } from '../lib/util';
import { can, Perm, type Role } from '../../shared/protocol';
import { Shell, Row, close } from './Settings';

const PERMS: { bit: number; label: string; sub: string }[] = [
  { bit: Perm.ADMIN, label: 'Yönetici', sub: 'Tüm yetkiler. Dikkatli ver.' },
  { bit: Perm.MANAGE_COMMUNITY, label: 'Topluluğu yönet', sub: 'Ad, simge ve davet kodunu değiştirebilir.' },
  { bit: Perm.MANAGE_CHANNELS, label: 'Kanalları yönet', sub: 'Kanal ve kategori oluşturur, düzenler, siler; duyuru kanallarına yazar.' },
  { bit: Perm.MANAGE_ROLES, label: 'Rolleri yönet', sub: 'Rol oluşturur ve üyelere rol verir.' },
  { bit: Perm.MANAGE_MESSAGES, label: 'Mesajları yönet', sub: 'Başkalarının mesajlarını siler, sabitler; yavaş moddan etkilenmez.' },
  { bit: Perm.KICK, label: 'Üyeleri at', sub: 'Üyeleri topluluktan çıkarabilir.' },
  { bit: Perm.MENTION_EVERYONE, label: '@everyone kullan', sub: 'Herkese bildirim gönderebilir.' },
];

function RoleEditor({ cid, role }: { cid: string; role: Role }) {
  const isEveryone = role.id === cid;
  const [name, setName] = useState(role.name);
  useEffect(() => setName(role.name), [role.id, role.name]);
  const upd = (patch: Partial<Role>) => cmd(cid, { t: 'role.update', cid, id: role.id, ...patch });
  return (
    <div className="role-editor">
      {!isEveryone && (
        <>
          <label className="field">
            <span>Rol adı</span>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== role.name && upd({ name })} />
          </label>
          <div className="field">
            <span>Rol rengi</span>
            <div className="swatches">
              <button className={cx('swatch none', !role.color && 'on')} onClick={() => upd({ color: '' })} aria-label="Renksiz" />
              {COLORS.map((c) => (
                <button key={c} className={cx('swatch', role.color === c && 'on')} style={{ background: c }} onClick={() => upd({ color: c })} aria-label={c} />
              ))}
            </div>
          </div>
          <Row title="Üye listesinde ayrı göster" sub="Bu roldeki çevrimiçi üyeler kendi başlığı altında listelenir.">
            <Toggle value={role.hoist} onChange={(v) => upd({ hoist: v })} />
          </Row>
        </>
      )}
      <h3>Yetkiler</h3>
      {PERMS.map((p) => (
        <Row key={p.bit} title={p.label} sub={p.sub}>
          <Toggle value={(role.perms & p.bit) === p.bit} onChange={(v) => upd({ perms: v ? role.perms | p.bit : role.perms & ~p.bit })} />
        </Row>
      ))}
      {!isEveryone && (
        <button className="btn danger sm" onClick={() => confirmDialog(`"${role.name}" rolü silinsin mi?`, 'Bu role sahip üyelerden rol kaldırılır.', () => cmd(cid, { t: 'role.delete', cid, id: role.id }), 'Sil')}>
          <Trash2 size={14} /> Rolü sil
        </button>
      )}
    </div>
  );
}

export function CommunitySettings({ cid, tab: initial }: { cid: string; tab?: string }) {
  const c = useStore((s) => s.communities[cid]);
  const me = useStore((s) => s.me.id);
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const [tab, setTab] = useState(initial || 'overview');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [name, setName] = useState(c?.name || '');
  const [desc, setDesc] = useState(c?.description || '');
  const [filter, setFilter] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!c) close();
  }, [c]);
  if (!c) return null;
  const manage = can(c, me, Perm.MANAGE_COMMUNITY);
  const nav = [
    ...(manage ? [{ id: 'overview', label: 'Genel Bakış', group: c.name }] : []),
    ...(can(c, me, Perm.MANAGE_ROLES) ? [{ id: 'roles', label: 'Roller', group: c.name }] : []),
    { id: 'members', label: 'Üyeler', group: 'Kullanıcı Yönetimi' },
    { id: 'invites', label: 'Davetler', group: 'Kullanıcı Yönetimi' },
    ...(c.ownerId === me ? [{ id: 'delete', label: 'Topluluğu sil', danger: true }] : []),
  ];
  const cur = nav.some((n) => n.id === tab) ? tab : nav[0].id;
  const roles = [...c.roles].sort((a, b) => b.position - a.position);
  const role = c.roles.find((r) => r.id === roleId) || null;
  return (
    <Shell nav={nav} tab={cur} setTab={setTab}>
      {cur === 'overview' && (
        <>
          <h1>Topluluk Genel Bakışı</h1>
          <div className="overview">
            <button className="icon-upload hex" onClick={() => file.current?.click()}>
              <CommunityIcon c={c} size={96} />
              <span className="iu-hover">Değiştir</span>
            </button>
            <input
              ref={file}
              hidden
              type="file"
              accept="image/*"
              onChange={async (e) => e.target.files?.[0] && cmd(cid, { t: 'comm.update', cid, icon: await resizeImage(e.target.files[0], 160) })}
            />
            <div className="overview-form">
              <label className="field">
                <span>Topluluk adı</span>
                <input value={name} maxLength={48} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== c.name && cmd(cid, { t: 'comm.update', cid, name })} />
              </label>
              {c.icon && (
                <button className="btn ghost sm" onClick={() => cmd(cid, { t: 'comm.update', cid, icon: null })}>
                  Simgeyi kaldır
                </button>
              )}
            </div>
          </div>
          <label className="field">
            <span>Açıklama</span>
            <textarea rows={3} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (c.description || '') && cmd(cid, { t: 'comm.update', cid, description: desc })} />
          </label>
          <div className="field">
            <span>Renk</span>
            <div className="swatches">
              {COLORS.map((x) => (
                <button key={x} className={cx('swatch', c.color === x && 'on')} style={{ background: x }} onClick={() => cmd(cid, { t: 'comm.update', cid, color: x })} aria-label={x} />
              ))}
            </div>
          </div>
          <div className="info-card">
            <div className="ic-row">
              <span>Oluşturulma</span>
              <b>{fmtDay(c.createdAt)}</b>
            </div>
            <div className="ic-row">
              <span>Üye sayısı</span>
              <b>{c.members.length}</b>
            </div>
            <div className="ic-row">
              <span>Kanal sayısı</span>
              <b>{c.channels.length}</b>
            </div>
          </div>
        </>
      )}
      {cur === 'roles' && (
        <>
          <h1>Roller</h1>
          <p className="note">Roller üyelere renk ve yetki verir. @herkes rolü tüm üyeler için geçerlidir.</p>
          <div className="roles-layout">
            <div className="role-list">
              <button className="btn primary sm" onClick={() => cmd(cid, { t: 'role.create', cid, name: 'yeni rol', color: '', perms: 0, hoist: false })}>
                <Plus size={14} /> Rol oluştur
              </button>
              {roles.map((r) => (
                <button key={r.id} className={cx('role-item', roleId === r.id && 'on')} onClick={() => setRoleId(r.id)}>
                  <i style={{ background: r.color || 'var(--text-3)' }} />
                  <span>{r.name}</span>
                  <small>{r.id === cid ? c.members.length : c.members.filter((m) => m.roles.includes(r.id)).length}</small>
                </button>
              ))}
            </div>
            <div className="role-detail">{role ? <RoleEditor key={role.id} cid={cid} role={role} /> : <div className="empty-note">Düzenlemek için soldan bir rol seç.</div>}</div>
          </div>
        </>
      )}
      {cur === 'members' && (
        <>
          <h1>Üyeler ({c.members.length})</h1>
          <input className="filter-input" placeholder="Üye ara" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="list-card">
            {c.members
              .filter((m) => displayName(c, m.userId, users).toLocaleLowerCase('tr').includes(filter.toLocaleLowerCase('tr')))
              .map((m) => (
                <div key={m.userId} className="lc-row">
                  <Avatar user={users[m.userId] || c.users[m.userId]} size={32} status={m.userId === me ? 'online' : presence[m.userId] || 'offline'} />
                  <div className="lc-text">
                    <b>
                      {displayName(c, m.userId, users)} {c.ownerId === m.userId && <span className="owner-crown">♛</span>}
                    </b>
                    <span>Katıldı: {fmtDay(m.joinedAt)}</span>
                  </div>
                  <div className="role-chips">
                    {c.roles
                      .filter((r) => m.roles.includes(r.id))
                      .map((r) => (
                        <span key={r.id} className="role-chip">
                          <i style={{ background: r.color || 'var(--text-3)' }} />
                          {r.name}
                          {can(c, me, Perm.MANAGE_ROLES) && (
                            <button onClick={() => cmd(cid, { t: 'member.update', cid, userId: m.userId, roles: m.roles.filter((x) => x !== r.id) })} aria-label="Rolü kaldır">
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      ))}
                    {can(c, me, Perm.MANAGE_ROLES) && (
                      <select
                        className="role-add"
                        value=""
                        onChange={(e) => e.target.value && cmd(cid, { t: 'member.update', cid, userId: m.userId, roles: [...m.roles, e.target.value] })}
                      >
                        <option value="">+ Rol</option>
                        {c.roles
                          .filter((r) => r.id !== cid && !m.roles.includes(r.id))
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                  {can(c, me, Perm.KICK) && m.userId !== me && m.userId !== c.ownerId && (
                    <button
                      className="btn ghost sm danger-text"
                      onClick={() => confirmDialog(`${displayName(c, m.userId, users)} atılsın mı?`, 'Davetle tekrar katılabilir.', () => cmd(cid, { t: 'member.kick', cid, userId: m.userId }), 'At')}
                    >
                      At
                    </button>
                  )}
                </div>
              ))}
          </div>
        </>
      )}
      {cur === 'invites' && (
        <>
          <h1>Davetler</h1>
          <div className="copy-row">
            <input readOnly value={makeInvite(cid)} onFocus={(e) => e.target.select()} />
            <button className="btn primary" onClick={() => (copyText(makeInvite(cid)), toast('Davet kodu kopyalandı', 'ok'))}>
              Kopyala
            </button>
          </div>
          {manage && (
            <button className="btn ghost sm" onClick={() => (cmd(cid, { t: 'comm.invite.reset', cid }), toast('Davet kodu yenilendi; eski kodlar artık çalışmaz.', 'ok'))}>
              <RefreshCw size={14} /> Kodu yenile
            </button>
          )}
        </>
      )}
      {cur === 'delete' && (
        <>
          <h1>Topluluğu sil</h1>
          <p className="note">"{c.name}" topluluğu, tüm kanalları ve mesajlarıyla birlikte kalıcı olarak silinir. Üyeler de topluluğa erişimini kaybeder.</p>
          <button className="btn danger" onClick={() => confirmDialog(`"${c.name}" silinsin mi?`, 'Bu işlem geri alınamaz.', () => (close(), deleteCommunity(cid)), 'Kalıcı olarak sil')}>
            Topluluğu sil
          </button>
        </>
      )}
    </Shell>
  );
}

