// Üye yönetimi menüsü, moderasyon pencereleri ve bildirim ayarları
import React, { useState } from 'react';
import { X, BellOff, Bell, AtSign } from 'lucide-react';
import { useStore, cmd, openModal, toast, updateSettings, setNotifyOverride, toggleMuted, openDm, addFriend, acceptFriend, removeFriend, confirmDialog, makeInvite, sendMessage, type MenuItem, type NotifyLevel } from '../lib/store';
import { useActs, startAlong, openInSpotify } from '../lib/activity';
import { joinVoice, setUserVolume } from '../lib/voice';
import { Modal } from './Modals';
import { Avatar, Toggle } from './Common';
import { cx, copyText, displayName, fmtTime } from '../lib/util';
import { can, canEditRole, isTimedOut, isVoiceLike, outranks, Perm, type Community } from '../../shared/protocol';

const close = () => openModal(null);

/** Bir üye için sağ tık menüsü (üye listesi, ayarlar, profil kartı) — Discord'daki sırayla */
export function memberMenu(c: Community, me: string, uid: string, opts: { noProfile?: boolean; at?: { x: number; y: number }; onMention?: () => void } = {}): MenuItem[] {
  const st = useStore.getState();
  const m = c.members.find((x) => x.userId === uid);
  const name = displayName(c, uid, st.users);
  const user = st.users[uid] || c.users[uid];
  const self = uid === me;
  const human = !user?.bot && uid !== 'kovan-asistan';
  const items: MenuItem[] = [];
  const pop = () => useStore.setState({ popout: { uid, cid: c.id, x: opts.at?.x ?? 400, y: opts.at?.y ?? 200 } });

  // 1) profil ve iletişim
  if (!opts.noProfile) items.push({ label: 'Profil', onClick: pop });
  if (opts.onMention) items.push({ label: 'Bahset', onClick: opts.onMention });
  if (self) {
    items.push({ label: 'Profili düzenle', onClick: () => openModal({ type: 'settings', tab: 'profile' }) });
  } else if (human) {
    items.push({ label: 'Mesaj', onClick: () => openDm(uid) });
    items.push({ label: 'Ara', onClick: () => callUser(uid) });
    items.push({ label: 'Not ekle', onClick: pop });
  }

  // 2) etkinlikle ilgili
  const acts = useActs.getState().acts[uid] || [];
  const song = acts.find((a) => a.kind === 'listening' && a.src === 'spotify');
  const live = acts.find((a) => a.kind === 'streaming' && a.url);
  if (!self && (song || live)) {
    items.push({ sep: true });
    if (song) {
      items.push({ label: 'Beraber dinle', onClick: () => startAlong(uid) });
      items.push({ label: "Şarkıyı Spotify'da aç", onClick: () => openInSpotify(song) });
    }
    if (live) items.push({ label: 'Yayını izle', onClick: () => window.kovan.openExternal(live.url!) });
  }

  // 3) arkadaşlık, davet, sesi kapat, engelle
  if (!self && human) {
    items.push({ sep: true });
    const invites = Object.values(st.communities)
      .filter((x) => !x.dm && x.id !== c.id && can(x, me, Perm.CREATE_INVITE) && !x.members.some((mm) => mm.userId === uid))
      .slice(0, 15);
    items.push({
      label: 'Topluluğa davet et',
      sub: invites.map((x) => ({ label: x.name, onClick: () => inviteTo(uid, x.id, name) })),
      disabled: !invites.length,
    });
    const fr = st.friends[uid];
    if (!fr) items.push({ label: 'Arkadaş ekle', onClick: () => addFriend(uid) });
    else if (fr.state === 'in') items.push({ label: 'Arkadaşlık isteğini kabul et', onClick: () => acceptFriend(uid) });
    else if (fr.state === 'out') items.push({ label: 'İsteği geri çek', onClick: () => removeFriend(uid) });
    else items.push({ label: 'Arkadaşlıktan çıkar', danger: true, onClick: () => confirmDialog(`${name} arkadaşlıktan çıkarılsın mı?`, 'Ortak topluluğunuz varsa yine yazışabilirsiniz.', () => removeFriend(uid), 'Çıkar') });
    const muted = st.settings.userVolumes?.[uid] === 0;
    items.push({ label: 'Sesini kapat', checked: muted, onClick: () => (setUserVolume(uid, muted ? 100 : 0), toast(muted ? `${name} yeniden duyuluyor` : `${name} artık sana sessiz`, 'ok')) });
    const blocked = st.settings.blocked.includes(uid);
    items.push({ label: blocked ? 'Engeli kaldır' : 'Engelle', danger: !blocked, onClick: () => toggleBlock(uid, name) });
  }

  // 4) topluluk: takma ad ve roller
  const comm: MenuItem[] = [];
  if ((self && (can(c, me, Perm.CHANGE_NICKNAME) || can(c, me, Perm.MANAGE_NICKNAMES))) || (!self && (can(c, me, Perm.MANAGE_NICKNAMES) || can(c, me, Perm.MANAGE_ROLES)) && outranks(c, me, uid)))
    comm.push({ label: self ? 'Takma adını değiştir' : 'Takma adı değiştir', onClick: () => openModal({ type: 'moderate', cid: c.id, uid, action: 'nick' }) });
  if (can(c, me, Perm.MANAGE_ROLES) && m) {
    const roles = c.roles.filter((r) => r.id !== c.id && canEditRole(c, me, r)).sort((a, b) => b.position - a.position);
    comm.push({
      label: 'Roller',
      sub: [
        ...roles.slice(0, 25).map((r) => {
          const has = m.roles.includes(r.id);
          return {
            label: (r.icon ? r.icon + ' ' : '') + r.name,
            checked: has,
            onClick: () => cmd(c.id, { t: 'member.update', cid: c.id, userId: uid, roles: has ? m.roles.filter((x) => x !== r.id) : [...m.roles, r.id] }),
          };
        }),
        { sep: true },
        { label: 'Rolleri yönet…', onClick: () => openModal({ type: 'commSettings', cid: c.id, tab: 'roles' }) },
      ],
    });
  }
  if (comm.length) items.push({ sep: true }, ...comm);

  // 5) moderasyon
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

  // 6) kopyala
  items.push({ sep: true });
  items.push({ label: 'Kullanıcı adını kopyala', onClick: () => (copyText(user?.name || name), toast('Kullanıcı adı kopyalandı', 'ok')) });
  items.push({ label: 'Kullanıcı kimliğini kopyala', onClick: () => (copyText(uid), toast('Kimlik kopyalandı', 'ok')) });
  return items;
}

/** Özel mesajı açıp sesli arama başlatır */
async function callUser(uid: string) {
  await openDm(uid);
  const st = useStore.getState();
  const cid = st.current;
  const ch = cid && st.communities[cid]?.dm === uid ? st.chanByComm[cid] : undefined;
  if (ch) joinVoice(cid, ch);
}

/** Özel mesajla topluluk daveti gönderir */
async function inviteTo(uid: string, cid: string, name: string) {
  const code = makeInvite(cid);
  const comm = useStore.getState().communities[cid];
  if (!code) return toast('Bu topluluk için davet kodu oluşturulamadı.', 'err');
  await openDm(uid);
  const st = useStore.getState();
  const ch = st.communities[st.current]?.dm === uid ? st.chanByComm[st.current] : undefined;
  if (!ch) return;
  sendMessage(ch, `${comm?.name || 'Topluluğuma'} gel: ${code}`);
  toast(`${name} kişisine davet gönderildi`, 'ok');
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
