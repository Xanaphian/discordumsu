import React, { memo, useMemo } from 'react';
import { useStore, openMenu, cmd, confirmDialog } from '../lib/store';
import { Avatar } from './Common';
import { NameText, ACTIVITY_ICON } from './profile/ProfileCard';
import { activeCustom } from '../../shared/profile';
import { cx, displayName, roleColor, copyText, memberRoles } from '../lib/util';
import { can, Perm, type Community, type Status, type UserPublic } from '../../shared/protocol';

const Row = memo(function Row({ c, uid, user, status, name, color, me }: { c: Community; uid: string; user: UserPublic | undefined; status: Status; name: string; color: string; me: string }) {
  const offline = status === 'offline';
  const menu = (e: React.MouseEvent) => {
    const items = [
      { label: 'Profil', onClick: () => useStore.setState({ popout: { uid, cid: c.id, x: e.clientX, y: e.clientY } }) },
      { label: 'Bahset', onClick: () => insertMention(name) },
      { label: 'Kullanıcı kimliğini kopyala', onClick: () => copyText(uid) },
    ];
    if (can(c, me, Perm.MANAGE_ROLES)) {
      const m = c.members.find((x) => x.userId === uid);
      const roles = c.roles.filter((r) => r.id !== c.id).sort((a, b) => b.position - a.position);
      if (roles.length) items.push({ sep: true } as any);
      for (const r of roles) {
        const has = !!m?.roles.includes(r.id);
        items.push({
          label: r.name,
          checked: has,
          onClick: () => cmd(c.id, { t: 'member.update', cid: c.id, userId: uid, roles: has ? m!.roles.filter((x) => x !== r.id) : [...(m?.roles || []), r.id] }),
        } as any);
      }
    }
    if (can(c, me, Perm.KICK) && uid !== me && uid !== c.ownerId) {
      items.push({ sep: true } as any);
      items.push({
        label: `${name} kişisini at`,
        danger: true,
        onClick: () => confirmDialog(`${name} atılsın mı?`, 'Davetle tekrar katılabilir.', () => cmd(c.id, { t: 'member.kick', cid: c.id, userId: uid }), 'At'),
      } as any);
    }
    openMenu(e, items);
  };
  return (
    <div className={cx('member', offline && 'offline')} onClick={(e) => useStore.setState({ popout: { uid, cid: c.id, x: e.clientX - 300, y: e.clientY } })} onContextMenu={menu}>
      <Avatar user={user} size={34} status={status} />
      <div className="member-text">
        <span className="member-name" style={{ color: color || undefined }}>
          <NameText profile={user?.profile} color={color || undefined}>
            {name}
          </NameText>
          {c.ownerId === uid && <span className="owner-crown" title="Topluluk sahibi">♛</span>}
          {uid === 'kovan-asistan' && <span className="tag-bot">ASİSTAN</span>}
          {user?.bot && <span className="tag-bot">BOT</span>}
        </span>
        {!offline && <MemberSub user={user} />}
      </div>
    </div>
  );
});

function MemberSub({ user }: { user: UserPublic | undefined }) {
  const cs = activeCustom(user?.profile);
  if (cs)
    return (
      <span className="member-sub cs">
        {cs.emoji && <span className="cs-emoji">{cs.emoji}</span>}
        {cs.text}
      </span>
    );
  const a = user?.profile?.activity;
  if (a) {
    const Icon = ACTIVITY_ICON[a.kind];
    return (
      <span className="member-sub act">
        <Icon size={12} /> <b>{a.text}</b>
      </span>
    );
  }
  return user?.bio ? <span className="member-sub">{user.bio}</span> : null;
}

function insertMention(name: string) {
  const el = document.getElementById('composer-input') as HTMLTextAreaElement | null;
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  setter.call(el, (el.value ? el.value + ' ' : '') + '@' + name + ' ');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
}

export function MemberList({ c }: { c: Community }) {
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const me = useStore((s) => s.me.id);
  const myStatus = useStore((s) => s.me.status);
  const groups = useMemo(() => {
    const hoisted = c.roles.filter((r) => r.hoist && r.id !== c.id).sort((a, b) => b.position - a.position);
    const g = new Map<string, { title: string; list: { uid: string; name: string; status: Status; color: string }[] }>();
    for (const r of hoisted) g.set(r.id, { title: r.name, list: [] });
    g.set('online', { title: 'Çevrimiçi', list: [] });
    g.set('offline', { title: 'Çevrimdışı', list: [] });
    for (const m of c.members) {
      let status: Status = m.userId === me ? (myStatus === 'invisible' ? 'offline' : myStatus) : presence[m.userId] || 'offline';
      if (m.userId === 'kovan-asistan') status = 'online';
      const entry = { uid: m.userId, name: displayName(c, m.userId, users), status, color: roleColor(c, m.userId) };
      if (status === 'offline') {
        g.get('offline')!.list.push(entry);
        continue;
      }
      const top = memberRoles(c, m).find((r) => r.hoist);
      g.get(top ? top.id : 'online')!.list.push(entry);
    }
    for (const x of g.values()) x.list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return [...g.values()].filter((x) => x.list.length);
  }, [c, users, presence, me, myStatus]);

  return (
    <aside className="members scroll-thin">
      {groups.map((g) => (
        <div key={g.title} className="member-group">
          <div className="member-group-title">
            {g.title} — {g.list.length}
          </div>
          {g.list.slice(0, 300).map((x) => (
            <Row key={x.uid} c={c} uid={x.uid} user={users[x.uid] || c.users[x.uid]} status={x.status} name={x.name} color={x.color} me={me} />
          ))}
        </div>
      ))}
    </aside>
  );
}
