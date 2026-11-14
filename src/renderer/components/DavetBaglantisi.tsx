// Davet bağlantıları (v1.57): sohbette "Katıl" düğmeli davet kartı, katılma penceresindeki önizleme,
// davet penceresindeki bağlantı + arkadaşlara gönderme + süre / kullanım sınırı, ayarlardaki davet listesi.
import React, { memo, useEffect, useMemo, useState } from 'react';
import { Check, Copy, LoaderCircle, Search, Settings2, Trash2 } from 'lucide-react';
import {
  useStore, createInvite, deleteInvite, fetchInviteInfo, invitesSupported, joinByInvite, listInvites, makeInvite, selectCommunity, sendDmQuiet, toast, openModal,
} from '../lib/store';
import { Avatar, CommunityIcon } from './Common';
import { copyText, cx } from '../lib/util';
import { INVITE_AGES, INVITE_USES, inviteCodeOfLink, inviteCodesIn, inviteLeft, inviteLink, type Invite, type InviteInfo } from '../../shared/davetBaglanti';
import { SHORT_CODE_RE, type Community } from '../../shared/protocol';

/** undefined = yükleniyor, null = geçersiz (ya da sunucu önizleme vermiyor) */
function useInviteInfo(code: string | null): InviteInfo | null | undefined {
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined);
  const online = useStore(() => invitesSupported());
  useEffect(() => {
    if (!code) return setInfo(null);
    let live = true;
    setInfo(undefined);
    fetchInviteInfo(code).then((x) => live && setInfo(x));
    return () => {
      live = false;
    };
  }, [code, online]);
  return info;
}

function Counts({ info }: { info: InviteInfo }) {
  return (
    <div className="dv-counts">
      <span>
        <i className="on" />
        {info.online} çevrimiçi
      </span>
      <span>
        <i />
        {info.members} üye
      </span>
    </div>
  );
}

const InviteCard = memo(function InviteCard({ code, mine }: { code: string; mine: boolean }) {
  const info = useInviteInfo(code);
  const supported = useStore(() => invitesSupported());
  const member = useStore((s) => !!info && !!s.communities[info.cid]);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    if (busy) return;
    if (info && member) return selectCommunity(info.cid);
    setBusy(true);
    try {
      await joinByInvite(inviteLink(code));
      toast('Topluluğa katıldın!', 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
    setBusy(false);
  };
  const head = mine ? 'Bir topluluğa davet gönderdin' : 'Bir topluluğa davet edildin';
  if (info === undefined && supported)
    return (
      <div className="dv-card loading">
        <div className="dv-head">{head}</div>
        <div className="dv-row">
          <div className="dv-ph" />
          <div className="dv-main">
            <div className="dv-ph-line" />
            <div className="dv-ph-line short" />
          </div>
        </div>
      </div>
    );
  if (!info && supported)
    return (
      <div className="dv-card bad">
        <div className="dv-head">{head}</div>
        <div className="dv-row">
          <div className="dv-bad-ic">!</div>
          <div className="dv-main">
            <div className="dv-name">Geçersiz davet</div>
            <div className="dv-sub">Bu davetin süresi dolmuş ya da bağlantı yanlış.</div>
          </div>
        </div>
      </div>
    );
  return (
    <div className="dv-card">
      <div className="dv-head">{head}</div>
      <div className="dv-row">
        {info ? <CommunityIcon c={info} size={50} /> : <div className="dv-ph" />}
        <div className="dv-main">
          <div className="dv-name">{info ? info.name : 'Topluluk daveti'}</div>
          {info ? <Counts info={info} /> : <div className="dv-sub">Katılmak için düğmeye bas.</div>}
        </div>
        <button className={cx('btn sm', member ? 'ghost' : 'primary')} disabled={busy} onClick={join}>
          {busy ? <LoaderCircle size={15} className="spin" /> : member ? 'Topluluğa git' : 'Katıl'}
        </button>
      </div>
    </div>
  );
});

/** Mesajdaki davet bağlantılarını "Katıl" düğmeli kart olarak gösterir */
export const InviteCards = memo(function InviteCards({ content, mine }: { content: string; mine: boolean }) {
  const codes = useMemo(() => inviteCodesIn(content), [content]);
  if (!codes.length) return null;
  return (
    <div className="dv-list">
      {codes.map((c) => (
        <InviteCard key={c} code={c} mine={mine} />
      ))}
    </div>
  );
});

/** Katılma penceresi: yapıştırılan bağlantının hangi topluluğa ait olduğunu gösterir */
export function InvitePreview({ text }: { text: string }) {
  const code = useMemo(() => {
    const t = text.trim();
    const m = /^(?:xanaphian|kovan)\/([a-z0-9]{7})$/i.exec(t);
    return inviteCodeOfLink(t) || (m ? m[1].toLowerCase() : SHORT_CODE_RE.test(t.toLowerCase()) ? t.toLowerCase() : null);
  }, [text]);
  const info = useInviteInfo(code);
  const member = useStore((s) => !!info && !!s.communities[info.cid]);
  if (!code || !info) return null;
  return (
    <div className="dv-preview">
      <CommunityIcon c={info} size={56} />
      <div className="dv-main">
        <div className="dv-head">{member ? 'Bu topluluğun zaten üyesisin' : 'Şu topluluğa davet edildin'}</div>
        <div className="dv-name">{info.name}</div>
        {info.about && <div className="dv-sub">{info.about}</div>}
        <Counts info={info} />
      </div>
    </div>
  );
}

function CopyRow({ value, label = 'Kopyala' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-row">
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <button
        className={cx('btn', copied ? 'success' : 'primary')}
        disabled={!value}
        onClick={() => {
          copyText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Kopyalandı' : label}
      </button>
    </div>
  );
}

/** Davet penceresinin gövdesi (merkezi sunucudaki topluluklar): arkadaşlara gönder, bağlantıyı kopyala, süre / sınır seç */
export function InviteShare({ cid }: { cid: string }) {
  const c = useStore((s) => s.communities[cid]);
  const friends = useStore((s) => s.friends);
  const me = useStore((s) => s.me.id);
  const supported = useStore(() => invitesSupported(cid));
  const permanent = useMemo(() => makeInvite(cid), [cid, c?.inviteCode]); // eslint-disable-line
  const [link, setLink] = useState(permanent);
  const [age, setAge] = useState(0);
  const [max, setMax] = useState(0);
  const [applied, setApplied] = useState({ age: 0, max: 0, exp: 0 });
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [sent, setSent] = useState<Record<string, 'ok' | 'busy'>>({});
  useEffect(() => {
    if (!applied.age && !applied.max) setLink(permanent);
  }, [permanent]); // eslint-disable-line
  const list = useMemo(() => {
    const n = q.trim().toLocaleLowerCase('tr');
    return Object.values(friends)
      .filter((f) => f.state === 'ok' && f.user.id !== me && !c?.members.some((m) => m.userId === f.user.id))
      .filter((f) => !n || f.user.name.toLocaleLowerCase('tr').includes(n))
      .sort((a, b) => a.user.name.localeCompare(b.user.name, 'tr'));
  }, [friends, q, c?.members, me]);
  const hasFriends = Object.values(friends).some((f) => f.state === 'ok');
  if (!c) return null;
  const apply = async () => {
    setBusy(true);
    try {
      setLink(await createInvite(cid, age, max));
      setApplied({ age, max, exp: age ? Date.now() + age * 1000 : 0 });
      setSent({});
      setEdit(false);
    } catch (e) {
      toast((e as Error).message || 'Bağlantı oluşturulamadı.', 'err');
    }
    setBusy(false);
  };
  const send = async (uid: string) => {
    if (sent[uid] || !link) return;
    setSent((s) => ({ ...s, [uid]: 'busy' }));
    const ok = await sendDmQuiet(uid, link);
    setSent((s) => {
      const n = { ...s };
      if (ok) n[uid] = 'ok';
      else delete n[uid];
      return n;
    });
    if (!ok) toast('Davet gönderilemedi.', 'err');
  };
  const note =
    (applied.age ? `Bu bağlantı ${inviteLeft(applied.exp)} sonra geçersiz olur` : 'Bu bağlantının süresi dolmaz') +
    (applied.max ? `, en çok ${applied.max} kişi kullanabilir.` : '.');
  return (
    <>
      {hasFriends && (
        <div className="dv-friends">
          <div className="input-icon">
            <Search size={16} />
            <input placeholder="Arkadaş ara" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="dv-friend-list">
            {list.map((f) => (
              <div className="dv-friend" key={f.user.id}>
                <Avatar user={f.user} size={32} />
                <span className="dv-friend-name">{f.user.name}</span>
                <button className={cx('btn sm', sent[f.user.id] === 'ok' ? 'ghost' : 'primary')} disabled={!!sent[f.user.id]} onClick={() => send(f.user.id)}>
                  {sent[f.user.id] === 'ok' ? 'Gönderildi' : 'Davet et'}
                </button>
              </div>
            ))}
            {!list.length && <div className="dv-empty">{q.trim() ? 'Bu adla arkadaş bulunamadı.' : 'Arkadaşlarının hepsi zaten bu toplulukta.'}</div>}
          </div>
        </div>
      )}
      <label className="field">
        <span>{hasFriends ? 'Ya da davet bağlantısını gönder' : 'Davet bağlantısını gönder'}</span>
        <CopyRow value={link} />
      </label>
      <div className="dv-note">
        <span>{note}</span>
        {supported && !edit && (
          <button className="dv-link-btn" onClick={() => setEdit(true)}>
            <Settings2 size={14} /> Bağlantıyı düzenle
          </button>
        )}
      </div>
      {edit && (
        <div className="dv-edit">
          <label className="field">
            <span>Şu süre sonra geçersiz olsun</span>
            <select value={age} onChange={(e) => setAge(Number(e.target.value))}>
              {INVITE_AGES.map((a) => (
                <option key={a.s} value={a.s}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>En çok kullanım</span>
            <select value={max} onChange={(e) => setMax(Number(e.target.value))}>
              {INVITE_USES.map((u) => (
                <option key={u.n} value={u.n}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <div className="dv-edit-foot">
            <button className="btn ghost sm" onClick={() => setEdit(false)}>
              Vazgeç
            </button>
            <button className="btn primary sm" disabled={busy} onClick={apply}>
              {busy ? <LoaderCircle size={15} className="spin" /> : 'Yeni bağlantı oluştur'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Topluluk ayarları > Davetler: kalıcı bağlantı + süreli / sınırlı davetlerin listesi */
export function InviteList({ c, manage }: { c: Community; manage: boolean }) {
  const cid = c.id;
  const supported = useStore(() => invitesSupported(cid));
  const users = useStore((s) => s.users);
  const [list, setList] = useState<Invite[] | null>(null);
  const load = () =>
    listInvites(cid)
      .then(setList)
      .catch(() => setList([]));
  useEffect(() => {
    if (supported) load();
    else setList(null);
  }, [cid, supported, c.inviteCode]); // eslint-disable-line
  if (!supported || !list) return null;
  const del = async (code: string) => {
    try {
      await deleteInvite(cid, code);
      setList((l) => (l || []).filter((i) => i.code !== code));
    } catch (e) {
      toast((e as Error).message || 'Davet silinemedi.', 'err');
    }
  };
  return (
    <div className="dv-table">
      <div className="dv-table-head">
        <h3>Süreli ve sınırlı davetler</h3>
        <button className="btn ghost sm" onClick={() => openModal({ type: 'invite', cid })}>
          Yeni davet
        </button>
      </div>
      {!list.length && <p className="note">{manage ? 'Henüz süreli ya da kullanım sınırlı bir davet yok.' : 'Oluşturduğun süreli ya da sınırlı bir davet yok.'}</p>}
      {list.map((i) => {
        const u = users[i.by];
        return (
          <div className="dv-inv" key={i.code}>
            {u ? <Avatar user={u} size={28} /> : <div className="dv-ph sm" />}
            <div className="dv-main">
              <div className="dv-inv-code">{inviteLink(i.code).replace(/^https?:\/\//, '')}</div>
              <div className="dv-sub">
                {u ? u.name : 'Bilinmeyen üye'} · {i.max ? `${i.uses}/${i.max} kullanım` : `${i.uses} kullanım`} · {i.exp ? `${inviteLeft(i.exp)} kaldı` : 'süresiz'}
              </div>
            </div>
            <button className="icon-btn" title="Bağlantıyı kopyala" aria-label="Bağlantıyı kopyala" onClick={() => (copyText(inviteLink(i.code)), toast('Davet bağlantısı kopyalandı', 'ok'))}>
              <Copy size={16} />
            </button>
            <button className="icon-btn danger" title="Daveti sil" aria-label="Daveti sil" onClick={() => del(i.code)}>
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
