// Yetki tanımları ve kanal / kategori izin düzenleyicisi
import React, { useMemo, useState } from 'react';
import { Check, X, Slash, Plus, Search, Lock, Shield, Users } from 'lucide-react';
import { useStore } from '../lib/store';
import { Avatar, Toggle } from './Common';
import { cx, displayName } from '../lib/util';
import { CHANNEL_PERMS, Perm, isVoiceLike, type Community, type Overwrite, type ChannelType } from '../../shared/protocol';

export interface PermDef {
  bit: number;
  label: string;
  sub: string;
  scope?: 'text' | 'voice'; // kanal izinlerinde sadece bu türde göster
}

export const PERM_GROUPS: { title: string; perms: PermDef[] }[] = [
  {
    title: 'Genel',
    perms: [
      { bit: Perm.VIEW_CHANNEL, label: 'Kanalları görüntüle', sub: 'Kanalları görür, mesajları okur. Kapatınca kanal listeden tamamen gizlenir.' },
      { bit: Perm.MANAGE_CHANNELS, label: 'Kanalları yönet', sub: 'Kanal ve kategori oluşturur, düzenler, siler; duyuru kanallarına yazar.' },
      { bit: Perm.MANAGE_ROLES, label: 'Rolleri yönet', sub: 'Kendi en yüksek rolünün altındaki rolleri oluşturur, düzenler ve üyelere verir. Kanal izinlerini değiştirir.' },
      { bit: Perm.MANAGE_COMMUNITY, label: 'Topluluğu yönet', sub: 'Ad, simge, açıklama, otomatik moderasyon ve davet ayarlarını değiştirir.' },
      { bit: Perm.VIEW_AUDIT_LOG, label: 'Denetim kaydını görüntüle', sub: 'Toplulukta kimin hangi yönetim işlemini yaptığını görür.' },
      { bit: Perm.CREATE_INVITE, label: 'Davet oluştur', sub: 'Davet kodunu görür ve paylaşır.' },
    ],
  },
  {
    title: 'Üyelik',
    perms: [
      { bit: Perm.CHANGE_NICKNAME, label: 'Takma ad değiştir', sub: 'Bu topluluktaki kendi takma adını değiştirir.' },
      { bit: Perm.MANAGE_NICKNAMES, label: 'Takma adları yönet', sub: 'Kendinden düşük roldeki üyelerin takma adını değiştirir.' },
      { bit: Perm.KICK, label: 'Üyeleri at', sub: 'Kendinden düşük roldeki üyeleri topluluktan çıkarır. Davetle geri dönebilirler.' },
      { bit: Perm.BAN, label: 'Üyeleri yasakla', sub: 'Üyeleri kalıcı olarak çıkarır; yasak kaldırılana kadar geri katılamazlar.' },
      { bit: Perm.TIMEOUT, label: 'Zaman aşımı uygula', sub: 'Üyeyi belirli bir süre susturur: yazamaz, tepki ekleyemez, sesli kanala giremez.' },
    ],
  },
  {
    title: 'Metin kanalları',
    perms: [
      { bit: Perm.SEND_MESSAGES, label: 'Mesaj gönder', sub: 'Metin kanallarına yazar.', scope: 'text' },
      { bit: Perm.ATTACH_FILES, label: 'Dosya ekle', sub: 'Görsel ve dosya yükler.', scope: 'text' },
      { bit: Perm.ADD_REACTIONS, label: 'Tepki ekle', sub: 'Mesajlara emoji tepkisi bırakır.', scope: 'text' },
      { bit: Perm.MENTION_EVERYONE, label: '@everyone, @here ve tüm rollerden bahset', sub: 'Herkese bildirim gönderir; bahsedilemez rolleri de etiketler.', scope: 'text' },
      { bit: Perm.MANAGE_MESSAGES, label: 'Mesajları yönet', sub: 'Başkalarının mesajlarını siler, sabitler. Yavaş mod ve otomatik moderasyondan etkilenmez.', scope: 'text' },
    ],
  },
  {
    title: 'Ses kanalları ve 3D odalar',
    perms: [
      { bit: Perm.CONNECT, label: 'Bağlan', sub: 'Sesli kanallara ve 3D odalara girer.', scope: 'voice' },
      { bit: Perm.SPEAK, label: 'Konuş', sub: 'Sesli kanalda mikrofonunu açabilir. Kapalıyken susturulmuş katılır.', scope: 'voice' },
    ],
  },
  {
    title: 'Gelişmiş',
    perms: [{ bit: Perm.ADMIN, label: 'Yönetici', sub: 'Tüm yetkiler ve tüm kanallara erişim. Kanal izinleri bu rolü etkilemez. Çok dikkatli ver.' }],
  },
];

export const ALL_PERM_DEFS = PERM_GROUPS.flatMap((g) => g.perms);

export function permLabels(bits: number): string[] {
  return ALL_PERM_DEFS.filter((p) => (bits & p.bit) === p.bit).map((p) => p.label);
}

/** Üç durumlu seçici: reddet / devral / izin ver */
export function TriState({ value, onChange, disabled }: { value: -1 | 0 | 1; onChange: (v: -1 | 0 | 1) => void; disabled?: boolean }) {
  return (
    <div className={cx('tri', disabled && 'disabled')} role="radiogroup">
      <button className={cx('tri-btn deny', value === -1 && 'on')} onClick={() => onChange(-1)} disabled={disabled} aria-label="Reddet" title="Reddet">
        <X size={14} />
      </button>
      <button className={cx('tri-btn', value === 0 && 'on')} onClick={() => onChange(0)} disabled={disabled} aria-label="Devral" title="Varsayılan (rolden devral)">
        <Slash size={12} />
      </button>
      <button className={cx('tri-btn allow', value === 1 && 'on')} onClick={() => onChange(1)} disabled={disabled} aria-label="İzin ver" title="İzin ver">
        <Check size={14} />
      </button>
    </div>
  );
}

type Scope = ChannelType | 'category';

function scopedGroups(scope: Scope) {
  const voice = scope !== 'category' && isVoiceLike(scope as ChannelType);
  const text = scope !== 'category' && !voice;
  return PERM_GROUPS.map((g) => ({
    title: g.title,
    perms: g.perms.filter((p) => (p.bit & CHANNEL_PERMS) === p.bit && (scope === 'category' || !p.scope || (p.scope === 'voice' ? voice : text))),
  })).filter((g) => g.perms.length);
}

/**
 * Kanal ya da kategori için izin üzerine yazmaları.
 * Liste dışarıda tutulur; değişince onChange tüm listeyle çağrılır.
 */
export function OverwriteEditor({ c, list, onChange, scope, canEdit }: { c: Community; list: Overwrite[]; onChange: (l: Overwrite[]) => void; scope: Scope; canEdit: boolean }) {
  const users = useStore((s) => s.users);
  const [sel, setSel] = useState<string>(c.id);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const everyone = list.find((o) => o.id === c.id);
  const isPrivate = !!everyone && (everyone.deny & Perm.VIEW_CHANNEL) !== 0;
  const groups = useMemo(() => scopedGroups(scope), [scope]);

  const targets = useMemo(() => {
    const rows: { id: string; type: 'role' | 'member'; name: string; color?: string; user?: any }[] = [{ id: c.id, type: 'role', name: '@herkes' }];
    const roles = [...c.roles].sort((a, b) => b.position - a.position);
    for (const r of roles) if (r.id !== c.id && list.some((o) => o.id === r.id)) rows.push({ id: r.id, type: 'role', name: r.name, color: r.color });
    for (const o of list)
      if (o.type === 'member') rows.push({ id: o.id, type: 'member', name: displayName(c, o.id, users), user: users[o.id] || c.users[o.id] });
    return rows;
  }, [c, list, users]);

  const cur = list.find((o) => o.id === sel) || { id: sel, type: (c.roles.some((r) => r.id === sel) ? 'role' : 'member') as Overwrite['type'], allow: 0, deny: 0 };

  const write = (o: Overwrite) => {
    const rest = list.filter((x) => x.id !== o.id);
    onChange(o.allow || o.deny || o.id === c.id ? [...rest, o] : rest);
  };
  const setBit = (bit: number, v: -1 | 0 | 1) => {
    const o = { ...cur, allow: cur.allow & ~bit, deny: cur.deny & ~bit };
    if (v === 1) o.allow |= bit;
    if (v === -1) o.deny |= bit;
    write(o);
  };
  const setPrivate = (on: boolean) => {
    const ev = everyone || { id: c.id, type: 'role' as const, allow: 0, deny: 0 };
    write({ ...ev, allow: ev.allow & ~Perm.VIEW_CHANNEL, deny: on ? ev.deny | Perm.VIEW_CHANNEL : ev.deny & ~Perm.VIEW_CHANNEL });
  };
  const add = (id: string, type: Overwrite['type']) => {
    if (!list.some((o) => o.id === id)) onChange([...list, { id, type, allow: isPrivate ? Perm.VIEW_CHANNEL : 0, deny: 0 }]);
    setSel(id);
    setAdding(false);
    setQ('');
  };
  const remove = (id: string) => {
    onChange(list.filter((o) => o.id !== id));
    setSel(c.id);
  };

  const ql = q.toLocaleLowerCase('tr');
  const addRoles = c.roles.filter((r) => r.id !== c.id && !list.some((o) => o.id === r.id) && r.name.toLocaleLowerCase('tr').includes(ql));
  const addMembers = c.members
    .filter((m) => !list.some((o) => o.id === m.userId) && displayName(c, m.userId, users).toLocaleLowerCase('tr').includes(ql))
    .slice(0, 30);

  return (
    <div className="ow">
      <div className="ow-private">
        <Lock size={20} />
        <div>
          <b>{scope === 'category' ? 'Özel kategori' : 'Özel kanal'}</b>
          <span>Açıkken sadece aşağıda izin verdiğin roller ve üyeler {scope === 'category' ? 'bu kategorideki kanalları' : 'bu kanalı'} görür.</span>
        </div>
        <Toggle value={isPrivate} onChange={setPrivate} disabled={!canEdit} />
      </div>
      <div className="ow-layout">
        <div className="ow-targets">
          <div className="ow-targets-head">
            <span>Roller / Üyeler</span>
            {canEdit && (
              <button className="icon-btn sm" onClick={() => setAdding((x) => !x)} aria-label="Rol ya da üye ekle" title="Rol ya da üye ekle">
                <Plus size={16} />
              </button>
            )}
          </div>
          {adding && (
            <div className="ow-add">
              <div className="input-icon">
                <Search size={14} />
                <input autoFocus placeholder="Rol ya da üye ara" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="ow-add-list scroll-thin">
                {addRoles.length > 0 && <div className="ow-add-title">Roller</div>}
                {addRoles.map((r) => (
                  <button key={r.id} onClick={() => add(r.id, 'role')}>
                    <Shield size={14} style={{ color: r.color || undefined }} /> {r.name}
                  </button>
                ))}
                {addMembers.length > 0 && <div className="ow-add-title">Üyeler</div>}
                {addMembers.map((m) => (
                  <button key={m.userId} onClick={() => add(m.userId, 'member')}>
                    <Avatar user={users[m.userId] || c.users[m.userId]} size={18} /> {displayName(c, m.userId, users)}
                  </button>
                ))}
                {!addRoles.length && !addMembers.length && <div className="empty-note">Eklenecek kimse yok.</div>}
              </div>
            </div>
          )}
          {targets.map((t) => (
            <button key={t.id} className={cx('ow-target', sel === t.id && 'on')} onClick={() => setSel(t.id)}>
              {t.type === 'member' ? <Avatar user={t.user} size={20} /> : t.id === c.id ? <Users size={16} /> : <Shield size={16} style={{ color: t.color || undefined }} />}
              <span>{t.name}</span>
              {(() => {
                const o = list.find((x) => x.id === t.id);
                const n = o ? countBits(o.allow | o.deny) : 0;
                return n ? <small>{n}</small> : null;
              })()}
            </button>
          ))}
        </div>
        <div className="ow-perms">
          <div className="ow-perms-head">
            <b>{targets.find((t) => t.id === sel)?.name || '@herkes'}</b>
            {sel !== c.id && canEdit && (
              <button className="btn ghost sm danger-text" onClick={() => remove(sel)}>
                Kaldır
              </button>
            )}
          </div>
          {sel === c.id && <p className="note">@herkes için yapılan ayarlar topluluktaki tüm üyeleri etkiler. Rol ve üye ayarları bunun üstüne yazar.</p>}
          {groups.map((g) => (
            <div key={g.title} className="ow-group">
              <h3>{g.title}</h3>
              {g.perms.map((p) => {
                const v: -1 | 0 | 1 = cur.allow & p.bit ? 1 : cur.deny & p.bit ? -1 : 0;
                return (
                  <div key={p.bit} className="set-row">
                    <div className="set-row-text">
                      <div className="set-row-title">{p.label}</div>
                      <div className="set-row-sub">{p.sub}</div>
                    </div>
                    <TriState value={v} onChange={(x) => setBit(p.bit, x)} disabled={!canEdit} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function countBits(n: number) {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
}
