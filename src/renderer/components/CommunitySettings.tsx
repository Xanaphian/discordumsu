import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, RefreshCw, Trash2, Plus, ChevronUp, ChevronDown, Lock, Copy, Search, MoreHorizontal, Clock, Shield, LoaderCircle } from 'lucide-react';
import { useStore, cmd, toast, confirmDialog, deleteCommunity, makeInvite, openMenu, request, loadModData, type ModData } from '../lib/store';
import { Avatar, CommunityIcon, Toggle } from './Common';
import { cx, COLORS, resizeImage, copyText, fmtDay, fmtTime, displayName } from '../lib/util';
import { can, canEditRole, isTimedOut, isVoiceLike, memberPerms, ALL_PERMS, Perm, type Community, type Role, type AutoMod } from '../../shared/protocol';
import { Shell, Row, close } from './Settings';
import { PERM_GROUPS, countBits } from './Permissions';
import { memberMenu } from './Moderation';
import { BotsTab } from './Bots';
import { CommunityProfileEditor } from './CommunityProfile';

const ROLE_ICONS = ['⭐', '🛡️', '🔨', '👑', '🐝', '💎', '🔥', '🎮', '🎨', '🎵', '🌙', '🤖', '🌱', '⚡', '🍯', '❤️'];

// ---------------------------------------------------------------------------
// Roller
function RoleEditor({ c, role, me, onSelect }: { c: Community; role: Role; me: string; onSelect: (id: string | null) => void }) {
  const cid = c.id;
  const isEveryone = role.id === cid;
  const editable = canEditRole(c, me, role);
  const myPerms = memberPerms(c, me);
  const users = useStore((s) => s.users);
  const [sub, setSub] = useState<'display' | 'perms' | 'members'>(isEveryone ? 'perms' : 'display');
  const [name, setName] = useState(role.name);
  const [icon, setIcon] = useState(role.icon || '');
  const [q, setQ] = useState('');
  const [mq, setMq] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => setName(role.name), [role.id, role.name]);
  useEffect(() => setIcon(role.icon || ''), [role.id, role.icon]);
  const upd = (patch: Partial<Role>) => cmd(cid, { t: 'role.update', cid, id: role.id, ...patch });
  const holders = c.members.filter((m) => m.roles.includes(role.id));
  const duplicate = async () => {
    try {
      const r = await request<{ data: string }>(cid, {
        t: 'role.create',
        cid,
        name: `${role.name} (kopya)`.slice(0, 32),
        color: role.color,
        perms: role.perms & myPerms,
        hoist: role.hoist,
        mentionable: role.mentionable,
        icon: role.icon,
        rid: '',
      });
      if (r?.data) onSelect(r.data);
      toast('Rol kopyalandı', 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };
  const ql = q.toLocaleLowerCase('tr');
  return (
    <div className="role-editor">
      <div className="re-head">
        <div className="re-title">
          <span className="re-dot" style={{ background: role.color || 'var(--text-3)' }} />
          {role.icon && <span className="role-icon">{role.icon}</span>}
          <b>{isEveryone ? '@herkes' : role.name}</b>
          {!editable && (
            <span className="re-lock" title="Bu rol senin en yüksek rolünle aynı seviyede ya da üstünde">
              <Lock size={13} /> Sadece görüntüleme
            </span>
          )}
        </div>
        {!isEveryone && editable && (
          <div className="btn-row">
            <button className="btn ghost sm" onClick={duplicate} title="Aynı ayarlarla yeni rol oluştur">
              <Copy size={14} /> Kopyala
            </button>
            <button
              className="btn ghost sm danger-text"
              onClick={() =>
                confirmDialog(`"${role.name}" rolü silinsin mi?`, `Bu role sahip ${holders.length} üyeden rol kaldırılır. Kanal izinlerindeki ayarları da silinir.`, () => {
                  cmd(cid, { t: 'role.delete', cid, id: role.id });
                  onSelect(null);
                }, 'Sil')
              }
            >
              <Trash2 size={14} /> Sil
            </button>
          </div>
        )}
      </div>
      <div className="subtabs">
        {!isEveryone && (
          <button className={cx(sub === 'display' && 'on')} onClick={() => setSub('display')}>
            Görünüm
          </button>
        )}
        <button className={cx(sub === 'perms' && 'on')} onClick={() => setSub('perms')}>
          Yetkiler <small>{countBits(role.perms & ~Perm.ADMIN) + (role.perms & Perm.ADMIN ? 1 : 0)}</small>
        </button>
        {!isEveryone && (
          <button className={cx(sub === 'members' && 'on')} onClick={() => setSub('members')}>
            Üyeler <small>{holders.length}</small>
          </button>
        )}
      </div>

      {sub === 'display' && !isEveryone && (
        <>
          <label className="field">
            <span>Rol adı</span>
            <input value={name} maxLength={32} disabled={!editable} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== role.name && upd({ name })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          </label>
          <div className="field">
            <span>Rol rengi</span>
            <div className="swatches">
              <button className={cx('swatch none', !role.color && 'on')} disabled={!editable} onClick={() => upd({ color: '' })} aria-label="Renksiz" title="Renksiz" />
              {COLORS.map((x) => (
                <button key={x} className={cx('swatch', role.color === x && 'on')} disabled={!editable} style={{ background: x }} onClick={() => upd({ color: x })} aria-label={x} />
              ))}
              <input type="color" className="color-input" disabled={!editable} value={role.color || '#999999'} onChange={(e) => upd({ color: e.target.value })} title="Özel renk" />
            </div>
          </div>
          <div className="field">
            <span>Rol rozeti (adın yanında görünen emoji)</span>
            <div className="icon-pick">
              <input className="icon-input" value={icon} maxLength={8} disabled={!editable} placeholder="—" onChange={(e) => setIcon(e.target.value)} onBlur={() => icon !== (role.icon || '') && upd({ icon })} />
              {ROLE_ICONS.map((e) => (
                <button key={e} className={cx('icon-opt', role.icon === e && 'on')} disabled={!editable} onClick={() => upd({ icon: e })}>
                  {e}
                </button>
              ))}
              {role.icon && (
                <button className="btn ghost sm" disabled={!editable} onClick={() => upd({ icon: '' })}>
                  Kaldır
                </button>
              )}
            </div>
          </div>
          <div className="role-preview">
            <span className="rp-label">Önizleme</span>
            <span className="rp-name" style={{ color: role.color || undefined }}>
              {useStore.getState().me.name || 'Arı'}
            </span>
            {role.icon && <span className="role-icon">{role.icon}</span>}
            <span className="role-chip">
              <i style={{ background: role.color || 'var(--text-3)' }} />
              {role.name}
            </span>
          </div>
          <Row title="Üye listesinde ayrı göster" sub="Bu roldeki çevrimiçi üyeler kendi başlığı altında listelenir.">
            <Toggle value={role.hoist} disabled={!editable} onChange={(v) => upd({ hoist: v })} />
          </Row>
          <Row title="Herkes bu rolden bahsedebilsin" sub={`Üyeler @${role.name} yazarak bu roldeki herkese bildirim gönderebilir. Kapalıyken sadece "@everyone" yetkisi olanlar bahsedebilir.`}>
            <Toggle value={!!role.mentionable} disabled={!editable} onChange={(v) => upd({ mentionable: v })} />
          </Row>
        </>
      )}

      {sub === 'perms' && (
        <>
          <div className="perm-tools">
            <div className="input-icon grow">
              <Search size={15} />
              <input placeholder="Yetki ara" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {editable && role.perms !== 0 && (
              <button className="btn ghost sm" onClick={() => upd({ perms: role.perms & ~myPerms })}>
                Yetkileri temizle
              </button>
            )}
          </div>
          {isEveryone && <p className="note">@herkes rolünün yetkileri topluluktaki tüm üyeler için geçerlidir. Bir şeyi herkesten almak için buradan kapat, sadece belli rollere aç.</p>}
          {PERM_GROUPS.map((g) => {
            const list = g.perms.filter((p) => !ql || p.label.toLocaleLowerCase('tr').includes(ql) || p.sub.toLocaleLowerCase('tr').includes(ql));
            if (!list.length) return null;
            return (
              <div key={g.title}>
                <h3>{g.title}</h3>
                {list.map((p) => {
                  const mine = (myPerms & p.bit) === p.bit;
                  return (
                    <Row key={p.bit} title={p.label} sub={p.sub}>
                      <Toggle value={(role.perms & p.bit) === p.bit} disabled={!editable || !mine} onChange={(v) => upd({ perms: v ? role.perms | p.bit : role.perms & ~p.bit })} />
                    </Row>
                  );
                })}
              </div>
            );
          })}
          {myPerms !== ALL_PERMS && <p className="note">Kendinde olmayan bir yetkiyi başkasına veremezsin; o satırlar kilitli görünür.</p>}
        </>
      )}

      {sub === 'members' && !isEveryone && (
        <>
          <div className="perm-tools">
            <div className="input-icon grow">
              <Search size={15} />
              <input placeholder="Üye ara" value={mq} onChange={(e) => setMq(e.target.value)} />
            </div>
            {editable && (
              <button className="btn primary sm" onClick={() => setAdding((x) => !x)}>
                <Plus size={14} /> Üye ekle
              </button>
            )}
          </div>
          {adding && (
            <div className="list-card add-members scroll-thin">
              {c.members
                .filter((m) => !m.roles.includes(role.id) && displayName(c, m.userId, users).toLocaleLowerCase('tr').includes(mq.toLocaleLowerCase('tr')))
                .slice(0, 40)
                .map((m) => (
                  <button key={m.userId} className="lc-row clickable" onClick={() => cmd(cid, { t: 'member.update', cid, userId: m.userId, roles: [...m.roles, role.id] })}>
                    <Avatar user={users[m.userId] || c.users[m.userId]} size={26} />
                    <div className="lc-text">
                      <b>{displayName(c, m.userId, users)}</b>
                    </div>
                    <Plus size={16} />
                  </button>
                ))}
            </div>
          )}
          <div className="list-card">
            {holders
              .filter((m) => displayName(c, m.userId, users).toLocaleLowerCase('tr').includes(mq.toLocaleLowerCase('tr')))
              .map((m) => (
                <div key={m.userId} className="lc-row">
                  <Avatar user={users[m.userId] || c.users[m.userId]} size={28} />
                  <div className="lc-text">
                    <b>{displayName(c, m.userId, users)}</b>
                    <span>{users[m.userId]?.name}</span>
                  </div>
                  {editable && (
                    <button className="icon-btn sm" onClick={() => cmd(cid, { t: 'member.update', cid, userId: m.userId, roles: m.roles.filter((x) => x !== role.id) })} aria-label="Rolü al" title="Rolü al">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            {!holders.length && <div className="empty-note">Bu rolde henüz kimse yok.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function RolesTab({ c, me, initial }: { c: Community; me: string; initial?: string }) {
  const cid = c.id;
  const [roleId, setRoleId] = useState<string | null>(initial || null);
  const roles = [...c.roles].sort((a, b) => b.position - a.position);
  const role = c.roles.find((r) => r.id === roleId) || null;
  const create = async () => {
    try {
      const r = await request<{ data: string }>(cid, { t: 'role.create', cid, name: 'yeni rol', color: COLORS[Math.floor(Math.random() * COLORS.length)], perms: 0, hoist: false, rid: '' });
      if (r?.data) setRoleId(r.data);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };
  return (
    <>
      <h1>Roller</h1>
      <p className="note">
        Roller üyelere renk, rozet ve yetki verir. Üstteki roller daha güçlüdür: bir rolü sadece kendi en yüksek rolünün altındaysa düzenleyebilir ya da verebilirsin.
        Sıralamak için okları kullan. Üyelere rol vermek için rolün <b>Üyeler</b> sekmesini, üye listesinde sağ tık menüsünü ya da profil kartındaki <b>+</b> düğmesini kullanabilirsin.
      </p>
      <div className="roles-layout">
        <div className="role-list">
          <button className="btn primary sm" onClick={create}>
            <Plus size={14} /> Rol oluştur
          </button>
          {roles.map((r, i) => {
            const editable = r.id !== cid && canEditRole(c, me, r);
            const count = r.id === cid ? c.members.length : c.members.filter((m) => m.roles.includes(r.id)).length;
            return (
              <div key={r.id} className={cx('role-item', roleId === r.id && 'on')} onClick={() => setRoleId(r.id)} role="button">
                <i style={{ background: r.color || 'var(--text-3)' }} />
                <span>
                  {r.icon && <span className="role-icon">{r.icon}</span>}
                  {r.name}
                </span>
                {!canEditRole(c, me, r) && <Lock size={12} className="ri-lock" />}
                {editable && (
                  <span className="ri-move">
                    <button disabled={i === 0 || !canEditRole(c, me, roles[i - 1]) || roles[i - 1].id === cid} onClick={(e) => (e.stopPropagation(), cmd(cid, { t: 'role.move', cid, id: r.id, dir: 1 }))} aria-label="Yukarı taşı">
                      <ChevronUp size={14} />
                    </button>
                    <button disabled={roles[i + 1]?.id === cid} onClick={(e) => (e.stopPropagation(), cmd(cid, { t: 'role.move', cid, id: r.id, dir: -1 }))} aria-label="Aşağı taşı">
                      <ChevronDown size={14} />
                    </button>
                  </span>
                )}
                <small>{count}</small>
              </div>
            );
          })}
        </div>
        <div className="role-detail">
          {role ? (
            <RoleEditor key={role.id} c={c} role={role} me={me} onSelect={setRoleId} />
          ) : (
            <div className="role-empty">
              <Shield size={40} />
              <b>Bir rol seç</b>
              <span>Soldaki listeden düzenlemek istediğin rolü seç ya da yeni bir rol oluştur.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Üyeler
function MembersTab({ c, me }: { c: Community; me: string }) {
  const cid = c.id;
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sort, setSort] = useState<'name' | 'joined' | 'role'>('name');
  const manageRoles = can(c, me, Perm.MANAGE_ROLES);
  const list = useMemo(() => {
    const fl = filter.toLocaleLowerCase('tr');
    const top = (uid: string) => Math.max(0, ...c.roles.filter((r) => c.members.find((m) => m.userId === uid)?.roles.includes(r.id)).map((r) => r.position));
    return c.members
      .filter((m) => (!roleFilter || m.roles.includes(roleFilter)) && (displayName(c, m.userId, users).toLocaleLowerCase('tr').includes(fl) || (users[m.userId]?.name || '').toLocaleLowerCase('tr').includes(fl)))
      .sort((a, b) =>
        sort === 'joined' ? b.joinedAt - a.joinedAt : sort === 'role' ? top(b.userId) - top(a.userId) : displayName(c, a.userId, users).localeCompare(displayName(c, b.userId, users), 'tr'),
      );
  }, [c, users, filter, roleFilter, sort]);
  return (
    <>
      <h1>Üyeler ({c.members.length})</h1>
      <div className="perm-tools">
        <div className="input-icon grow">
          <Search size={15} />
          <input placeholder="Üye ara" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <select className="mini-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">Tüm roller</option>
          {[...c.roles]
            .filter((r) => r.id !== cid)
            .sort((a, b) => b.position - a.position)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
        <select className="mini-select" value={sort} onChange={(e) => setSort(e.target.value as any)}>
          <option value="name">Ada göre</option>
          <option value="joined">Katılma tarihine göre</option>
          <option value="role">Role göre</option>
        </select>
      </div>
      <div className="list-card">
        {list.map((m) => (
          <div key={m.userId} className="lc-row member-row">
            <Avatar user={users[m.userId] || c.users[m.userId]} size={34} status={m.userId === me ? 'online' : presence[m.userId] || 'offline'} />
            <div className="lc-text">
              <b>
                {displayName(c, m.userId, users)} {c.ownerId === m.userId && <span className="owner-crown" title="Topluluk sahibi">♛</span>}
                {isTimedOut(m) && (
                  <span className="timeout-badge" title={`Zaman aşımı bitişi: ${fmtTime(m.timeoutUntil!)}`}>
                    <Clock size={11} /> zaman aşımı
                  </span>
                )}
              </b>
              <span>
                {users[m.userId]?.name}
                {m.nick ? ' · takma ad' : ''} · Katıldı: {fmtDay(m.joinedAt)}
              </span>
            </div>
            <div className="role-chips">
              {c.roles
                .filter((r) => m.roles.includes(r.id))
                .sort((a, b) => b.position - a.position)
                .map((r) => (
                  <span key={r.id} className="role-chip">
                    <i style={{ background: r.color || 'var(--text-3)' }} />
                    {r.icon && <span className="role-icon">{r.icon}</span>}
                    {r.name}
                    {manageRoles && canEditRole(c, me, r) && (
                      <button onClick={() => cmd(cid, { t: 'member.update', cid, userId: m.userId, roles: m.roles.filter((x) => x !== r.id) })} aria-label="Rolü kaldır">
                        <X size={10} />
                      </button>
                    )}
                  </span>
                ))}
              {manageRoles && (
                <select className="role-add" value="" onChange={(e) => e.target.value && cmd(cid, { t: 'member.update', cid, userId: m.userId, roles: [...m.roles, e.target.value] })}>
                  <option value="">+ Rol</option>
                  {c.roles
                    .filter((r) => r.id !== cid && !m.roles.includes(r.id) && canEditRole(c, me, r))
                    .sort((a, b) => b.position - a.position)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
            <button className="icon-btn sm" onClick={(e) => openMenu(e, memberMenu(c, me, m.userId, { noProfile: false }))} aria-label="Diğer">
              <MoreHorizontal size={18} />
            </button>
          </div>
        ))}
        {!list.length && <div className="empty-note">Eşleşen üye yok.</div>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Yasaklar ve denetim kaydı
function useModData(cid: string, deps: unknown[]) {
  const [data, setData] = useState<ModData | null>(null);
  const [err, setErr] = useState('');
  const load = () =>
    loadModData(cid)
      .then((d) => (setData(d), setErr('')))
      .catch((e) => setErr((e as Error).message));
  useEffect(() => {
    load();
  }, deps); // eslint-disable-line
  return { data, err, reload: load };
}

function BansTab({ c }: { c: Community }) {
  const { data, err, reload } = useModData(c.id, [c.members.length]);
  const [q, setQ] = useState('');
  const bans = (data?.bans || []).filter((b) => b.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
  return (
    <>
      <h1>Yasaklar</h1>
      <p className="note">Yasaklanan kişiler davet koduyla bile geri katılamaz. Yasağı kaldırınca tekrar davetle katılabilirler.</p>
      <div className="input-icon">
        <Search size={15} />
        <input placeholder="Yasaklı kişi ara" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <div className="field-err">{err}</div>}
      <div className="list-card">
        {!data && <LoaderCircle className="spin" size={20} />}
        {bans.map((b) => (
          <div key={b.userId} className="lc-row">
            <div className="lc-text">
              <b>{b.name}</b>
              <span>
                {fmtTime(b.ts)}
                {b.reason ? ` · Sebep: ${b.reason}` : ''}
              </span>
            </div>
            <button
              className="btn ghost sm"
              onClick={() =>
                confirmDialog(`${b.name} kişisinin yasağı kaldırılsın mı?`, 'Davet koduyla tekrar katılabilir.', () => {
                  cmd(c.id, { t: 'member.unban', cid: c.id, userId: b.userId });
                  setTimeout(reload, 300);
                }, 'Yasağı kaldır', false)
              }
            >
              Yasağı kaldır
            </button>
          </div>
        ))}
        {data && !bans.length && <div className="empty-note">Yasaklı kimse yok.</div>}
      </div>
    </>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  'comm.update': 'topluluğu güncelledi',
  'invite.reset': 'davet kodunu yeniledi',
  'chan.create': 'kanal oluşturdu',
  'chan.update': 'kanalı düzenledi',
  'chan.delete': 'kanalı sildi',
  'cat.create': 'kategori oluşturdu',
  'cat.update': 'kategoriyi düzenledi',
  'cat.delete': 'kategoriyi sildi',
  'role.create': 'rol oluşturdu',
  'role.update': 'rolü düzenledi',
  'role.move': 'rolü taşıdı',
  'role.delete': 'rolü sildi',
  'member.roles': 'üyenin rollerini değiştirdi',
  'member.nick': 'takma ad değiştirdi',
  'member.kick': 'üyeyi attı',
  'member.ban': 'üyeyi yasakladı',
  'member.unban': 'yasağı kaldırdı',
  'member.timeout': 'zaman aşımı uyguladı',
  'msg.delete': 'bir mesajı sildi',
};

function AuditTab({ c }: { c: Community }) {
  const users = useStore((s) => s.users);
  const { data, err, reload } = useModData(c.id, [c]);
  const [action, setAction] = useState('');
  const [by, setBy] = useState('');
  const list = (data?.audit || []).filter((e) => (!action || e.a.startsWith(action)) && (!by || e.by === by));
  const actors = [...new Set((data?.audit || []).map((e) => e.by))];
  return (
    <>
      <h1>Denetim Kaydı</h1>
      <div className="perm-tools">
        <select className="mini-select" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Tüm işlemler</option>
          <option value="member.">Üye işlemleri</option>
          <option value="role.">Rol işlemleri</option>
          <option value="chan.">Kanal işlemleri</option>
          <option value="cat.">Kategori işlemleri</option>
          <option value="comm.">Topluluk ayarları</option>
          <option value="msg.">Mesaj silme</option>
        </select>
        <select className="mini-select" value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="">Herkes</option>
          {actors.map((id) => (
            <option key={id} value={id}>
              {displayName(c, id, users)}
            </option>
          ))}
        </select>
        <button className="btn ghost sm" onClick={reload}>
          <RefreshCw size={14} /> Yenile
        </button>
      </div>
      {err && <div className="field-err">{err}</div>}
      <div className="list-card audit">
        {!data && <LoaderCircle className="spin" size={20} />}
        {list.map((e) => (
          <div key={e.id} className="lc-row">
            <Avatar user={users[e.by] || c.users[e.by]} size={30} />
            <div className="lc-text">
              <div className="audit-line">
                <b>{displayName(c, e.by, users)}</b> {AUDIT_LABEL[e.a] || e.a}
                {e.t && (
                  <>
                    {': '}
                    <b>{e.t}</b>
                  </>
                )}
              </div>
              <span>
                {fmtTime(e.ts)}
                {e.d ? ` · ${e.d}` : ''}
              </span>
            </div>
          </div>
        ))}
        {data && !list.length && <div className="empty-note">Kayıt yok. Yönetim işlemleri burada listelenir.</div>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Otomatik moderasyon
const DEFAULT_AUTOMOD: AutoMod = { words: [], blockLinks: false, maxMentions: 0, newMemberWait: 0 };

function ModerationTab({ c }: { c: Community }) {
  const am = c.automod || DEFAULT_AUTOMOD;
  const [words, setWords] = useState(am.words.join(', '));
  useEffect(() => setWords((c.automod || DEFAULT_AUTOMOD).words.join(', ')), [c.automod]);
  const save = (patch: Partial<AutoMod>) => cmd(c.id, { t: 'comm.update', cid: c.id, automod: { ...am, ...patch } });
  const parsed = words
    .split(/[,\n]/)
    .map((w) => w.trim().toLocaleLowerCase('tr'))
    .filter(Boolean);
  const dirty = parsed.join(',') !== am.words.join(',');
  return (
    <>
      <h1>Moderasyon</h1>
      <p className="note">Bu kurallar "Mesajları yönet" yetkisi olmayan herkes için topluluğun sunucusunda uygulanır. Yöneticiler ve moderatörler etkilenmez.</p>
      <h3>Doğrulama</h3>
      <Row title="Yeni üye bekleme süresi" sub="Topluluğa yeni katılanlar bu süre dolmadan mesaj yazamaz. Hızlı gelip spam yapan hesaplara karşı.">
        <select className="mini-select" value={am.newMemberWait} onChange={(e) => save({ newMemberWait: Number(e.target.value) })}>
          <option value={0}>Yok</option>
          <option value={5}>5 dakika</option>
          <option value={10}>10 dakika</option>
          <option value={30}>30 dakika</option>
          <option value={60}>1 saat</option>
          <option value={1440}>1 gün</option>
        </select>
      </Row>
      <h3>Otomatik moderasyon</h3>
      <Row title="Bağlantıları engelle" sub="Yöneticiler dışında kimse http/https/www bağlantısı paylaşamaz.">
        <Toggle value={am.blockLinks} onChange={(v) => save({ blockLinks: v })} />
      </Row>
      <Row title="Bahsetme sınırı" sub="Bir mesajda en fazla kaç kişi, rol ya da @everyone etiketlenebilir.">
        <select className="mini-select" value={am.maxMentions} onChange={(e) => save({ maxMentions: Number(e.target.value) })}>
          <option value={0}>Sınırsız</option>
          {[3, 5, 10, 20].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Row>
      <label className="field">
        <span>Yasaklı kelimeler (virgülle ayır)</span>
        <textarea rows={3} value={words} onChange={(e) => setWords(e.target.value)} placeholder="ör. reklam, kumar, spam-link" />
        <small className="note">Bu kelimelerden birini içeren mesaj gönderilmez, gönderen kişiye uyarı gösterilir. Büyük/küçük harf fark etmez.</small>
      </label>
      {dirty && (
        <div className="save-bar">
          <span>Kelime listesinde kaydedilmemiş değişiklik var.</span>
          <button className="btn ghost sm" onClick={() => setWords(am.words.join(', '))}>
            Sıfırla
          </button>
          <button className="btn success sm" onClick={() => (save({ words: parsed }), toast('Kelime filtresi kaydedildi', 'ok'))}>
            Kaydet
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function OverviewTab({ c }: { c: Community }) {
  const cid = c.id;
  const [name, setName] = useState(c.name);
  const [desc, setDesc] = useState(c.description || '');
  const file = useRef<HTMLInputElement>(null);
  const textChans = c.channels.filter((x) => !isVoiceLike(x.type));
  return (
    <>
      <h1>Topluluk Genel Bakışı</h1>
      <div className="overview">
        <button className="icon-upload hex" onClick={() => file.current?.click()}>
          <CommunityIcon c={c} size={96} />
          <span className="iu-hover">Değiştir</span>
        </button>
        <input ref={file} hidden type="file" accept="image/*" onChange={async (e) => e.target.files?.[0] && cmd(cid, { t: 'comm.update', cid, icon: await resizeImage(e.target.files[0], 160) })} />
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
          <input type="color" className="color-input" value={c.color} onChange={(e) => cmd(cid, { t: 'comm.update', cid, color: e.target.value })} title="Özel renk" />
        </div>
      </div>
      <h3>Sistem mesajları</h3>
      <Row title="Katılma mesajları" sub="Biri topluluğa katılınca bir karşılama satırı gönderilir.">
        <Toggle value={c.joinMessages !== false} onChange={(v) => cmd(cid, { t: 'comm.update', cid, joinMessages: v })} />
      </Row>
      <Row title="Sistem mesajı kanalı" sub="Katılma mesajlarının gönderileceği kanal.">
        <select className="mini-select" value={c.systemChannelId || ''} onChange={(e) => cmd(cid, { t: 'comm.update', cid, systemChannelId: e.target.value || null })}>
          <option value="">İlk metin kanalı</option>
          {textChans.map((x) => (
            <option key={x.id} value={x.id}>
              #{x.name}
            </option>
          ))}
        </select>
      </Row>
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
        <div className="ic-row">
          <span>Rol sayısı</span>
          <b>{c.roles.length}</b>
        </div>
      </div>
    </>
  );
}

function InvitesTab({ c, manage }: { c: Community; manage: boolean }) {
  const cid = c.id;
  const code = makeInvite(cid);
  return (
    <>
      <h1>Davetler</h1>
      {code ? (
        <div className="copy-row">
          <input readOnly value={code} onFocus={(e) => e.target.select()} />
          <button className="btn primary" onClick={() => (copyText(code), toast('Davet kodu kopyalandı', 'ok'))}>
            Kopyala
          </button>
        </div>
      ) : (
        <p className="note">{c.invitesPaused ? 'Davetler şu an durduruldu.' : 'Davet oluşturma yetkin yok.'}</p>
      )}
      {manage && (
        <>
          <Row title="Davetleri durdur" sub="Açıkken kimse davet koduyla katılamaz; mevcut üyeler etkilenmez. Baskın ya da spam anında işe yarar.">
            <Toggle value={!!c.invitesPaused} onChange={(v) => cmd(cid, { t: 'comm.update', cid, invitesPaused: v })} />
          </Row>
          <button className="btn ghost sm" onClick={() => (cmd(cid, { t: 'comm.invite.reset', cid }), toast('Davet kodu yenilendi; eski kodlar artık çalışmaz.', 'ok'))}>
            <RefreshCw size={14} /> Kodu yenile
          </button>
        </>
      )}
    </>
  );
}

export function CommunitySettings({ cid, tab: initial }: { cid: string; tab?: string }) {
  const c = useStore((s) => s.communities[cid]);
  const me = useStore((s) => s.me.id);
  const [tab, setTab] = useState(initial?.split(':')[0] || 'overview');
  useEffect(() => {
    if (!c) close();
  }, [c]);
  if (!c) return null;
  const manage = can(c, me, Perm.MANAGE_COMMUNITY);
  const nav = [
    ...(manage ? [{ id: 'overview', label: 'Genel Bakış', group: c.name }] : []),
    ...(manage ? [{ id: 'profile', label: 'Sunucu Profili', group: c.name }] : []),
    ...(can(c, me, Perm.MANAGE_ROLES) ? [{ id: 'roles', label: 'Roller', group: c.name }] : []),
    ...(manage ? [{ id: 'moderation', label: 'Moderasyon', group: 'Moderasyon' }] : []),
    ...(can(c, me, Perm.VIEW_AUDIT_LOG) ? [{ id: 'audit', label: 'Denetim Kaydı', group: 'Moderasyon' }] : []),
    { id: 'members', label: 'Üyeler', group: 'Kullanıcı Yönetimi' },
    ...(can(c, me, Perm.BAN) ? [{ id: 'bans', label: 'Yasaklar', group: 'Kullanıcı Yönetimi' }] : []),
    { id: 'invites', label: 'Davetler', group: 'Kullanıcı Yönetimi' },
    ...(manage ? [{ id: 'bots', label: 'Botlar ve Yapay Zekâ', group: 'Entegrasyonlar' }] : []),
    ...(c.ownerId === me ? [{ id: 'delete', label: 'Topluluğu sil', danger: true }] : []),
  ];
  const cur = nav.some((n) => n.id === tab) ? tab : nav[0].id;
  return (
    <Shell nav={nav} tab={cur} setTab={setTab}>
      {cur === 'overview' && <OverviewTab c={c} />}
      {cur === 'profile' && <CommunityProfileEditor c={c} />}
      {cur === 'roles' && <RolesTab c={c} me={me} initial={initial?.startsWith('roles:') ? initial.slice(6) : undefined} />}
      {cur === 'moderation' && <ModerationTab c={c} />}
      {cur === 'audit' && <AuditTab c={c} />}
      {cur === 'members' && <MembersTab c={c} me={me} />}
      {cur === 'bans' && <BansTab c={c} />}
      {cur === 'invites' && <InvitesTab c={c} manage={manage} />}
      {cur === 'bots' && <BotsTab cid={cid} />}
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
