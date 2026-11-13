import React, { memo, useMemo } from 'react';
import { Clock, Shield } from 'lucide-react';
import { useStore, openMenu, openModal } from '../lib/store';
import { Avatar } from './Common';
import { NameText, ACTIVITY_ICON, ProfileCard } from './profile/ProfileCard';
import { activeCustom } from '../../shared/profile';
import { useActsOf } from '../lib/activity';
import { ActivityBadge, PresenceLine, useVoiceOf } from './profile/Activity';
import { cx, displayName, roleColor, memberRoles, memberOf } from '../lib/util';
import { can, isTimedOut, Perm, type Community, type Status, type UserPublic } from '../../shared/protocol';
import { memberMenu } from './Moderation';

const Row = memo(function Row({ c, uid, user, status, name, color, me, showIcons, blocked }: { c: Community; uid: string; user: UserPublic | undefined; status: Status; name: string; color: string; me: string; showIcons: boolean; blocked: boolean }) {
  const offline = status === 'offline';
  const menu = (e: React.MouseEvent) => {
    openMenu(e, memberMenu(c, me, uid, { at: { x: e.clientX - 300, y: e.clientY }, onMention: () => insertMention(name) }));
  };
  const mem = memberOf(c, uid);
  const icon = showIcons ? memberRoles(c, mem).find((r) => r.icon)?.icon : undefined;
  return (
    <div className={cx('member', offline && 'offline')} onClick={(e) => useStore.setState({ popout: { uid, cid: c.id, x: e.clientX - 300, y: e.clientY } })} onContextMenu={menu}>
      <Avatar user={user} size={34} status={status} />
      <div className="member-text">
        <span className="member-name" style={{ color: color || undefined }}>
          <NameText profile={user?.profile} color={color || undefined}>
            {name}
          </NameText>
          {icon && <span className="role-icon">{icon}</span>}
          {c.ownerId === uid && <span className="owner-crown" title="Topluluk sahibi">♛</span>}
          {isTimedOut(mem) && <Clock size={12} className="timeout-icon" aria-label="Zaman aşımında" />}
          {blocked && <span className="tag-blocked">ENGELLİ</span>}
          {uid === 'kovan-asistan' && <span className="tag-bot">ASİSTAN</span>}
          {user?.bot && <span className="tag-bot">BOT</span>}
        </span>
        {!offline && <MemberSub user={user} />}
      </div>
      {!offline && <ActivityBadge uid={uid} />}
    </div>
  );
});

function MemberSub({ user }: { user: UserPublic | undefined }) {
  // oyun / müzik / yayın / sesli arama, durum yazısı ve biyografiden önce gelir
  const live = useActsOf(user?.id);
  const voice = useVoiceOf(user?.id);
  const cs = activeCustom(user?.profile);
  if (live.length || voice) return <PresenceLine uid={user!.id} className="member-sub" />;
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

// localeCompare(…, 'tr') her karşılaştırmada yeni bir karşılaştırıcı kurar; tek bir Collator aynı sırayı çok daha hızlı verir
const trCollator = new Intl.Collator('tr');

export function MemberList({ c }: { c: Community }) {
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const me = useStore((s) => s.me.id);
  const myStatus = useStore((s) => s.me.status);
  // satır başına ayrı abonelik yerine tek abonelik (kalabalık listede her değişiklikte yüzlerce seçici çalışmasın)
  const showIcons = useStore((s) => s.settings.showRoleIcons);
  const blockedList = useStore((s) => s.settings.blocked);
  const blocked = useMemo(() => new Set(blockedList), [blockedList]);
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
    for (const x of g.values()) x.list.sort((a, b) => trCollator.compare(a.name, b.name));
    return [...g.values()].filter((x) => x.list.length);
  }, [c, users, presence, me, myStatus]);

  const manageRoles = can(c, me, Perm.MANAGE_ROLES);
  return (
    <aside className="members scroll-thin">
      {manageRoles && (
        <button className="members-roles-btn" onClick={() => openModal({ type: 'commSettings', cid: c.id, tab: 'roles' })}>
          <Shield size={14} /> Rolleri yönet
        </button>
      )}
      {groups.map((g) => (
        <div key={g.title} className="member-group">
          <div className="member-group-title">
            {g.title} — {g.list.length}
          </div>
          {g.list.slice(0, 300).map((x) => (
            <Row key={x.uid} c={c} uid={x.uid} user={users[x.uid] || c.users[x.uid]} status={x.status} name={x.name} color={x.color} me={me} showIcons={showIcons} blocked={blocked.has(x.uid)} />
          ))}
        </div>
      ))}
    </aside>
  );
}

/** Özel sohbette sağdaki karşı taraf profili (üye listesi yerine) */
export function DmProfile({ c }: { c: Community }) {
  const uid = c.dm!;
  const user = useStore((s) => s.users[uid] || c.users[uid]);
  const status = useStore((s) => s.presence[uid]) || 'offline';
  return (
    <aside className="members dm-profile scroll-thin">
      <ProfileCard uid={uid} user={user} status={status} c={c} variant="popout" />
    </aside>
  );
}
