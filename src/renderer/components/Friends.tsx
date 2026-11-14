// Ana Sayfa > Arkadaşlar: çevrimiçi / tümü / bekleyen istekler / arkadaş ekle
import React, { useEffect, useMemo, useState } from 'react';
import { Users, MessageCircle, Check, X, MoreVertical, Search, UserPlus, LoaderCircle, CircleCheck, CircleAlert } from 'lucide-react';
import {
  useStore, setHomeTab, openDm, addFriend, acceptFriend, removeFriend, openMenu, confirmDialog, addFriendByTag, joinByInvite,
  realCommunities, pendingIn, openModal, type State,
} from '../lib/store';
import { TagText, MyTagBox } from './Etiket';
import { foldName } from '../../shared/etiket';
import { Avatar, STATUS_LABEL } from './Common';
import { activeCustom } from '../../shared/profile';
import { cx } from '../lib/util';
import type { UserPublic } from '../../shared/protocol';

type Tab = State['homeTab'];

export function FriendsView() {
  const tab = useStore((s) => s.homeTab);
  const friends = useStore((s) => s.friends);
  const requests = pendingIn(friends);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'online', label: 'Çevrimiçi' },
    { id: 'all', label: 'Tümü' },
    { id: 'pending', label: requests ? `Bekleyen (${requests})` : 'Bekleyen' },
  ];
  return (
    <section className="friends">
      <div className="chat-header fr-bar">
        <span className="ch-head-icon">
          <Users size={21} />
        </span>
        <h2>Arkadaşlar</h2>
        <span className="head-sep" />
        <div className="fr-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={cx('fr-tab', tab === t.id && 'on', t.id === 'pending' && requests > 0 && 'alert')} onClick={() => setHomeTab(t.id)}>
              {t.label}
            </button>
          ))}
          <button className={cx('fr-tab add', tab === 'add' && 'on')} onClick={() => setHomeTab('add')}>
            <UserPlus size={15} /> Arkadaş ekle
          </button>
        </div>
      </div>
      <div className="fr-body scroll-thin">{tab === 'add' ? <AddFriend /> : <FriendList tab={tab} />}</div>
    </section>
  );
}

function FriendList({ tab }: { tab: Tab }) {
  const friends = useStore((s) => s.friends);
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const n = q.trim();
    return Object.values(friends)
      .filter((f) => (tab === 'pending' ? f.state !== 'ok' : f.state === 'ok'))
      .filter((f) => tab !== 'online' || (presence[f.user.id] && presence[f.user.id] !== 'offline'))
      .map((f) => ({ ...f, user: users[f.user.id] || f.user }))
      .filter((f) => !n || matchUser(f.user, n))
      .sort((a, b) => (tab === 'pending' ? (a.state === b.state ? b.ts - a.ts : a.state === 'in' ? -1 : 1) : a.user.name.localeCompare(b.user.name, 'tr')));
  }, [friends, users, presence, tab, q]);
  const title = tab === 'online' ? 'Çevrimiçi' : tab === 'all' ? 'Tüm arkadaşlar' : 'Bekleyen istekler';
  const hasAny = Object.values(friends).some((f) => f.state === 'ok');
  return (
    <div className="fr-list">
      <label className="fr-search">
        <input placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <Search size={16} />
      </label>
      <div className="fr-count">
        {title} — {rows.length}
      </div>
      {rows.map((f) => (
        <FriendRow key={f.user.id} user={f.user} state={f.state} />
      ))}
      {!rows.length && (
        <div className="fr-empty">
          <div className="fr-empty-art" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`hex h${i}`} />
            ))}
          </div>
          {q ? (
            <p>Bu adla eşleşen kimse yok.</p>
          ) : tab === 'pending' ? (
            <p>Bekleyen arkadaşlık isteği yok.</p>
          ) : tab === 'online' && hasAny ? (
            <p>Şu an çevrimiçi arkadaşın yok.</p>
          ) : (
            <>
              <p>Henüz arkadaşın yok. Arkadaşının etiketini (ad#kod) yazarak ya da topluluklarından birini seçerek ekleyebilirsin.</p>
              <button className="btn primary" onClick={() => setHomeTab('add')}>
                <UserPlus size={16} /> Arkadaş ekle
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FriendRow({ user, state }: { user: UserPublic; state: 'ok' | 'in' | 'out' }) {
  const status = useStore((s) => s.presence[user.id]) || 'offline';
  const custom = activeCustom(user.profile);
  const sub = state === 'in' ? 'Sana arkadaşlık isteği gönderdi' : state === 'out' ? 'İsteğin yanıt bekliyor' : custom?.text ? `${custom.emoji ? custom.emoji + ' ' : ''}${custom.text}` : STATUS_LABEL[status];
  const more = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: 'Profil', onClick: () => openModal({ type: 'profile', uid: user.id }) },
      { label: 'Mesaj gönder', onClick: () => openDm(user.id) },
      { sep: true },
      { label: 'Arkadaşlıktan çıkar', danger: true, onClick: () => confirmDialog(`${user.name} arkadaşlıktan çıkarılsın mı?`, 'Ortak topluluğunuz varsa yine yazışabilirsiniz.', () => removeFriend(user.id), 'Çıkar') },
    ]);
  return (
    <div className="fr-row" onClick={() => state === 'ok' && openDm(user.id)} role={state === 'ok' ? 'button' : undefined}>
      <Avatar user={user} size={36} status={status} />
      <div className="fr-text">
        <b>
          <TagText user={user} />
        </b>
        <span>{sub}</span>
      </div>
      <div className="fr-acts" onClick={(e) => e.stopPropagation()}>
        {state === 'ok' && (
          <>
            <button className="fr-act" onClick={() => openDm(user.id)} title="Mesaj gönder" aria-label="Mesaj gönder">
              <MessageCircle size={18} />
            </button>
            <button className="fr-act" onClick={more} title="Diğer" aria-label="Diğer">
              <MoreVertical size={18} />
            </button>
          </>
        )}
        {state === 'in' && (
          <>
            <button className="fr-act ok" onClick={() => acceptFriend(user.id)} title="Kabul et" aria-label="Kabul et">
              <Check size={18} />
            </button>
            <button className="fr-act no" onClick={() => removeFriend(user.id)} title="Reddet" aria-label="Reddet">
              <X size={18} />
            </button>
          </>
        )}
        {state === 'out' && (
          <button className="fr-act no" onClick={() => removeFriend(user.id)} title="İsteği geri çek" aria-label="İsteği geri çek">
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function AddFriend() {
  const communities = useStore((s) => s.communities);
  const friends = useStore((s) => s.friends);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me.id);
  const presence = useStore((s) => s.presence);
  const [q, setQ] = useState('');
  // topluluklarındaki herkes (kendin ve botlar hariç)
  const people = useMemo(() => {
    const seen = new Map<string, { user: UserPublic; comms: string[] }>();
    for (const c of realCommunities(communities))
      for (const m of c.members) {
        const u = users[m.userId] || c.users[m.userId];
        if (!u || u.bot || u.id === me || u.id === 'kovan-asistan') continue;
        const e = seen.get(u.id) || { user: u, comms: [] };
        e.comms.push(c.name);
        seen.set(u.id, e);
      }
    const n = q.trim();
    return [...seen.values()]
      .filter((x) => !n || matchUser(x.user, n))
      .sort((a, b) => {
        const oa = presence[a.user.id] && presence[a.user.id] !== 'offline' ? 0 : 1;
        const ob = presence[b.user.id] && presence[b.user.id] !== 'offline' ? 0 : 1;
        return oa - ob || a.user.name.localeCompare(b.user.name, 'tr');
      })
      .slice(0, 60);
  }, [communities, users, me, q, presence]);

  return (
    <div className="fr-add">
      <h3>Arkadaş ekle</h3>
      <p className="fr-lead">Arkadaşını etiketiyle ekleyebilirsin. Etiket, kişinin adı ve # sonrasındaki kodundan oluşur (ör. Yağmur#OVA); profil kartında yazar.</p>

      <TagAdd />
      <MyTagBox />

      <div className="fr-card">
        <h4>Topluluklarından ekle</h4>
        <label className="fr-search big">
          <input placeholder="İsimle ya da etiketle ara" value={q} onChange={(e) => setQ(e.target.value)} />
          <Search size={16} />
        </label>
        <div className="fr-people scroll-thin">
          {people.map(({ user, comms }) => {
            const st = friends[user.id]?.state;
            return (
              <div key={user.id} className="fr-row compact">
                <Avatar user={user} size={32} status={presence[user.id] || 'offline'} />
                <div className="fr-text">
                  <b>
                    <TagText user={user} />
                  </b>
                  <span>{comms.slice(0, 2).join(', ')}{comms.length > 2 ? ` +${comms.length - 2}` : ''}</span>
                </div>
                {st === 'ok' ? (
                  <span className="fr-tag">Arkadaşsınız</span>
                ) : st === 'out' ? (
                  <span className="fr-tag">İstek gönderildi</span>
                ) : st === 'in' ? (
                  <button className="btn sm primary" onClick={() => acceptFriend(user.id)}>
                    Kabul et
                  </button>
                ) : (
                  <button className="btn sm primary" onClick={() => addFriend(user.id)}>
                    İstek gönder
                  </button>
                )}
              </div>
            );
          })}
          {!people.length && <div className="fr-none">{q ? 'Bu adla kimse bulunamadı.' : 'Topluluklarında henüz başka kimse yok.'}</div>}
        </div>
      </div>

    </div>
  );
}

/** Ad ya da etiketle eşleşme (büyük/küçük harf ve Türkçe karakter duyarsız) */
function matchUser(u: UserPublic, q: string) {
  const n = foldName(q.replace(/^@/, ''));
  const i = n.lastIndexOf('#');
  if (i >= 0) return foldName(u.name).includes(n.slice(0, i)) && (u.tag || '').startsWith(n.slice(i + 1));
  return foldName(u.name).includes(n);
}

/** Etiketle arkadaş ekleme kutusu: sonuç (başarı / hata) kutunun altında kalır */
function TagAdd() {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    const t = v.trim();
    if (!t || busy) return;
    setBusy(true);
    setRes(null);
    try {
      // topluluk davet kodu yapıştırıldıysa onu kullan (kolaylık)
      if (!t.includes('#') && (t.includes('/') || /^KVN-/i.test(t))) {
        await joinByInvite(t);
        setV('');
        setRes({ ok: true, text: 'Bu bir topluluk davetiydi; topluluğa katıldın.' });
        return;
      }
      const r = await addFriendByTag(t);
      setV('');
      setRes({ ok: true, text: r.state === 'ok' ? `${r.name} ile artık arkadaşsınız.` : `${r.name} adlı kişiye arkadaşlık isteği gönderildi. Kabul edince arkadaş olursunuz.` });
    } catch (e: any) {
      setRes({ ok: false, text: e?.message || 'İstek gönderilemedi.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cx('fr-card tag-add', res && (res.ok ? 'is-ok' : 'is-err'))}>
      <h4>Etiketle ekle</h4>
      <div className="tag-add-row">
        <input
          className="tag-add-input"
          placeholder="ad#kod"
          value={v}
          spellCheck={false}
          autoFocus
          maxLength={60}
          aria-invalid={res ? !res.ok : undefined}
          onChange={(e) => (setV(e.target.value), res && setRes(null))}
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
        <button className="btn primary" disabled={!v.trim() || busy} onClick={go}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <UserPlus size={15} />} Arkadaşlık isteği gönder
        </button>
      </div>
      {res ? (
        <div className={cx('tag-add-msg', res.ok ? 'ok' : 'err')} role={res.ok ? 'status' : 'alert'}>
          {res.ok ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
          <span>{res.text}</span>
        </div>
      ) : (
        <div className="tag-add-hint">Büyük/küçük harf ve Türkçe karakterler önemli değil: Yağmur#OVA ile yagmur#ova aynı kişidir.</div>
      )}
    </div>
  );
}
