import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Hash, Volume2, Megaphone, Box, Globe, Copy, Check, ImagePlus, LoaderCircle, Search, ExternalLink, RefreshCw } from 'lucide-react';
import {
  useStore, openModal, createCommunity, joinByInvite, makeInvite, updateSettings, inviteHostOptions, cmd, toast, selectChannel, selectCommunity, request, jumpToMessage, Modal as ModalT,
} from '../lib/store';
import { CommunityIcon, Avatar } from './Common';
import { cx, COLORS, resizeImage, copyText, fmtTime, displayName } from '../lib/util';
import { renderMarkdown } from '../lib/markdown';
import { can, Perm, isVoiceLike, hasFreeName, cleanSiteUrl, DEFAULT_SITE_URL, type ChannelType, type Message } from '../../shared/protocol';
import { UserSettings } from './Settings';
import { CommunitySettings } from './CommunitySettings';
import { CommunityProfileModal } from './CommunityProfile';
import { ChannelSettings, CategorySettings } from './ChannelSettings';
import { ModerateModal, NotifyModal } from './Moderation';
import { Toggle } from './Common';
import { joinVoice } from '../lib/voice';
import { ScreenPickerModal } from './Media';
import { ProfileModal, CustomStatusModal } from './profile/ProfileModal';
import { SelfRolesModal } from './RolSec';

export function Modal({ children, onClose, className, wide }: { children: React.ReactNode; onClose: () => void; className?: string; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'wide', className)} role="dialog" aria-modal>
        {children}
      </div>
    </div>
  );
}

const close = () => openModal(null);

function ModalHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="modal-head">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
      <button className="modal-x icon-btn" onClick={close} aria-label="Kapat">
        <X size={20} />
      </button>
    </div>
  );
}

function CreateCommunityModal() {
  const me = useStore((s) => s.me);
  const [name, setName] = useState(`${me.name} topluluğu`);
  const [color, setColor] = useState(COLORS[Math.floor(Math.random() * 6)]);
  const [icon, setIcon] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createCommunity(name.trim(), color, icon);
      close();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
    setBusy(false);
  };
  return (
    <Modal onClose={close}>
      <ModalHead title="Topluluğunu oluştur" sub="Topluluk sunucuda durur; bilgisayarın kapalıyken de arkadaşların sohbet edebilir. Arkadaşların davet koduyla katılır." />
      <div className="modal-body center">
        <button className="icon-upload hex" onClick={() => file.current?.click()}>
          {icon ? <CommunityIcon c={{ name, icon, color }} size={84} /> : <div className="icon-upload-empty" style={{ background: color }}><ImagePlus size={26} /><span>YÜKLE</span></div>}
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setIcon(await resizeImage(e.target.files[0], 160))} />
        <label className="field">
          <span>Topluluk adı</span>
          <input autoFocus value={name} maxLength={48} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        <div className="field">
          <span>Renk</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button key={c} className={cx('swatch', c === color && 'on')} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={() => openModal({ type: 'join' })}>
          Bunun yerine davetle katıl
        </button>
        <button className="btn primary" disabled={busy || !name.trim()} onClick={submit}>
          {busy ? <LoaderCircle size={16} className="spin" /> : 'Oluştur'}
        </button>
      </div>
    </Modal>
  );
}

function JoinModal({ code: initial }: { code?: string }) {
  const [code, setCode] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      await joinByInvite(code.trim());
      close();
      toast('Topluluğa katıldın!', 'ok');
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <Modal onClose={close}>
      <ModalHead title="Bir topluluğa katıl" sub="Arkadaşından aldığın davet kodunu yapıştır." />
      <div className="modal-body">
        <label className="field">
          <span>Davet kodu</span>
          <input autoFocus placeholder="ör. xanaphian/s3gas25" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} className={cx(err && 'invalid')} />
        </label>
        {err && <div className="field-err">{err}</div>}
        <div className="hint-card">
          Davet kodları <code>xanaphian/s3gas25</code> gibi görünür. Kodu yapıştırıp Katıl'a basman yeterli; arkadaşının bilgisayarının açık olması gerekmez.
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={close}>
          Vazgeç
        </button>
        <button className="btn primary" disabled={busy || !code.trim()} onClick={submit}>
          {busy ? <LoaderCircle size={16} className="spin" /> : 'Katıl'}
        </button>
      </div>
    </Modal>
  );
}

function InviteModal({ cid }: { cid: string }) {
  const c = useStore((s) => s.communities[cid]);
  const me = useStore((s) => s.me.id);
  const info = useStore((s) => s.info);
  const publicAddress = useStore((s) => s.settings.publicAddress);
  const inviteHost = useStore((s) => s.settings.inviteHost);
  const [copied, setCopied] = useState(false);
  const opts = useMemo(() => inviteHostOptions(cid), [cid, publicAddress, info]); // eslint-disable-line
  const code = useMemo(() => makeInvite(cid), [cid, c?.inviteKey, c?.inviteCode, publicAddress, inviteHost, info]); // eslint-disable-line
  const local = useStore((s) => s.commHost[cid] === `127.0.0.1:${s.info?.hubPort}`);
  if (!c) return null;
  return (
    <Modal onClose={close}>
      <ModalHead title={`Arkadaşlarını ${c.name} topluluğuna davet et`} />
      <div className="modal-body">
        <label className="field">
          <span>Davet kodunu gönder</span>
          <div className="copy-row">
            <input readOnly value={code} onFocus={(e) => e.target.select()} />
            <button
              className={cx('btn', copied ? 'success' : 'primary')}
              onClick={() => {
                copyText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </label>
        {c.inviteCode && opts.length > 1 && (
          <label className="field">
            <span>Bu kod hangi ağ için?</span>
            <select value={opts.some((o) => o.host === inviteHost) ? inviteHost : opts[0].host} onChange={(e) => updateSettings({ inviteHost: e.target.value })}>
              {opts.map((o) => (
                <option key={o.host} value={o.host}>
                  {o.label} · {o.host}
                </option>
              ))}
            </select>
          </label>
        )}
        {local && (
          <div className="hint-card">
            Bu topluluk senin bilgisayarında çalışıyor. Ağdaki adreslerin: <b>{info?.lan.map((x) => `${x}:${info.hubPort}`).join(', ') || 'bulunamadı'}</b>
            {publicAddress ? (
              <>
                {' '}
                · Dış adres: <b>{publicAddress}</b>
              </>
            ) : (
              <> · İnternet üzerinden davet için Ayarlar → Bağlantı'dan dış adres ekleyebilirsin.</>
            )}
            <br />
            Arkadaşların bağlıyken Xanaphian'ın açık kalması gerekir (kapatınca tepside çalışmaya devam eder).
          </div>
        )}
        {can(c, me, Perm.MANAGE_COMMUNITY) && (
          <button className="btn ghost sm" onClick={() => cmd(cid, { t: 'comm.invite.reset', cid })}>
            <RefreshCw size={14} /> Kodu yenile (eski davetler geçersiz olur)
          </button>
        )}
      </div>
    </Modal>
  );
}

const TYPES: { t: ChannelType; label: string; sub: string; icon: React.ReactNode }[] = [
  { t: 'text', label: 'Metin', sub: 'Mesaj, görsel, emoji ve dosya gönder', icon: <Hash size={22} /> },
  { t: 'voice', label: 'Ses', sub: 'Sesli sohbet için birlikte takıl', icon: <Volume2 size={22} /> },
  { t: 'announce', label: 'Duyuru', sub: 'Sadece yöneticilerin yazabildiği kanal', icon: <Megaphone size={22} /> },
  { t: 'space', label: '3D Oda', sub: 'Avatarlarla dolaşılan, yakınlık sesli meydan', icon: <Box size={22} /> },
  { t: 'site', label: 'Site Odası', sub: 'Bir siteyi (ör. xanaphian.com) birlikte gez, yanında sohbet et', icon: <Globe size={22} /> },
];

function CreateChannelModal({ cid, categoryId, kind }: { cid: string; categoryId: string | null; kind?: ChannelType }) {
  const c = useStore((s) => s.communities[cid]);
  const [type, setType] = useState<ChannelType>(kind || 'text');
  const [name, setName] = useState('');
  const [url, setUrl] = useState(DEFAULT_SITE_URL);
  const [cat, setCat] = useState<string | null>(categoryId);
  const [priv, setPriv] = useState(false);
  if (!c) return null;
  const urlOk = type !== 'site' || !!cleanSiteUrl(url);
  const submit = async () => {
    if ((!name.trim() && type !== 'site') || !urlOk) return;
    try {
      const r = await request<{ data: string }>(cid, { t: 'chan.create', cid, name, type, categoryId: cat, private: priv, ...(type === 'site' ? { url: cleanSiteUrl(url)! } : {}) });
      close();
      if (type === 'voice' && !priv) joinVoice(cid, r.data);
      selectChannel(cid, r.data);
      if (priv) openModal({ type: 'editChannel', cid, chId: r.data, tab: 'perms' });
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };
  return (
    <Modal onClose={close}>
      <ModalHead title="Kanal oluştur" sub={cat ? `${c.categories.find((x) => x.id === cat)?.name} kategorisinde` : undefined} />
      <div className="modal-body">
        <div className="field">
          <span>Kanal türü</span>
          <div className="type-list">
            {TYPES.map((x) => (
              <button key={x.t} className={cx('type-opt', type === x.t && 'on')} onClick={() => setType(x.t)}>
                {x.icon}
                <div>
                  <b>{x.label}</b>
                  <span>{x.sub}</span>
                </div>
                <span className="radio" />
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Kanal adı</span>
          <div className="input-icon">
            {type === 'voice' ? <Volume2 size={16} /> : type === 'space' ? <Box size={16} /> : type === 'site' ? <Globe size={16} /> : type === 'announce' ? <Megaphone size={16} /> : <Hash size={16} />}
            <input autoFocus placeholder={type === 'voice' ? 'Sohbet odası' : type === 'space' ? 'Meydan' : type === 'site' ? 'Boş bırakırsan sitenin adı kullanılır' : 'yeni-kanal'} value={name} maxLength={48} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
        </label>
        {type === 'site' && (
          <label className="field">
            <span>Sitenin adresi</span>
            <input value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="https://xanaphian.com/" />
            <small className={cx('field-hint', !urlOk && 'err')}>{urlOk ? 'Oda bu adresle açılır; bu sitenin tüm sayfaları odanın içinde gezilebilir.' : 'Geçerli bir http(s) adresi yaz.'}</small>
          </label>
        )}
        <label className="field">
          <span>Kategori</span>
          <select value={cat || ''} onChange={(e) => setCat(e.target.value || null)}>
            <option value="">Kategorisiz</option>
            {c.categories.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <div className="set-row compact">
          <div className="set-row-text">
            <div className="set-row-title">Özel kanal</div>
            <div className="set-row-sub">Sadece seçtiğin roller ve üyeler görebilir. Kimin göreceğini sonra kanal ayarları → İzinler'den seçersin.</div>
          </div>
          <Toggle value={priv} onChange={setPriv} />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={close}>
          Vazgeç
        </button>
        <button className="btn primary" disabled={(!name.trim() && type !== 'site') || !urlOk} onClick={submit}>
          Kanal oluştur
        </button>
      </div>
    </Modal>
  );
}

function CategoryModal({ cid, catId }: { cid: string; catId?: string }) {
  const cat = useStore((s) => s.communities[cid]?.categories.find((x) => x.id === catId));
  const [name, setName] = useState(cat?.name || '');
  const submit = () => {
    if (!name.trim()) return;
    if (catId) cmd(cid, { t: 'cat.update', cid, id: catId, name });
    else cmd(cid, { t: 'cat.create', cid, name });
    close();
  };
  return (
    <Modal onClose={close}>
      <ModalHead title={catId ? 'Kategoriyi yeniden adlandır' : 'Kategori oluştur'} />
      <div className="modal-body">
        <label className="field">
          <span>Kategori adı</span>
          <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Yeni kategori" />
        </label>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={close}>
          Vazgeç
        </button>
        <button className="btn primary" disabled={!name.trim()} onClick={submit}>
          {catId ? 'Kaydet' : 'Oluştur'}
        </button>
      </div>
    </Modal>
  );
}

function ConfirmModal({ m }: { m: Extract<ModalT, { type: 'confirm' }> }) {
  return (
    <Modal onClose={close} className="confirm">
      <ModalHead title={m.title} />
      <div className="modal-body">
        <p className="confirm-body">{m.body}</p>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={close}>
          Vazgeç
        </button>
        <button
          autoFocus
          className={cx('btn', m.danger ? 'danger' : 'primary')}
          onClick={() => {
            close();
            m.onConfirm();
          }}
        >
          {m.confirmText || 'Onayla'}
        </button>
      </div>
    </Modal>
  );
}

function ImageModal({ src, name }: { src: string; name: string }) {
  return (
    <div className="image-viewer" onClick={close}>
      <img src={src} alt={name} onClick={(e) => e.stopPropagation()} />
      <div className="iv-bar" onClick={(e) => e.stopPropagation()}>
        <span>{name}</span>
        <a href={src} download={name} className="link">
          İndir
        </a>
        <button className="link" onClick={() => window.kovan.openExternal(src)}>
          Tarayıcıda aç <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
}

function QuickSwitcher() {
  const communities = useStore((s) => s.communities);
  const lastIds = useStore((s) => s.lastIds);
  const read = useStore((s) => s.read);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const items = useMemo(() => {
    const all: { key: string; label: string; sub: string; kind: 'ch' | 'voice' | 'space' | 'site' | 'comm'; cid: string; ch?: string; unread: boolean }[] = [];
    for (const c of Object.values(communities)) {
      if (c.dm) {
        const ch = c.channels[0]?.id;
        all.push({ key: c.id, label: c.name, sub: 'Özel mesaj', kind: 'comm', cid: c.id, unread: !!ch && !!lastIds[ch] && lastIds[ch] > (read[ch] || '') });
        continue;
      }
      all.push({ key: c.id, label: c.name, sub: 'Topluluk', kind: 'comm', cid: c.id, unread: false });
      for (const ch of c.channels)
        all.push({ key: ch.id, label: ch.name, sub: c.name, kind: ch.type === 'voice' ? 'voice' : ch.type === 'space' ? 'space' : ch.type === 'site' ? 'site' : 'ch', cid: c.id, ch: ch.id, unread: !!lastIds[ch.id] && lastIds[ch.id] > (read[ch.id] || '') });
    }
    const n = q.toLocaleLowerCase('tr').replace(/^[#@*!]/, '');
    const f = n ? all.filter((x) => x.label.toLocaleLowerCase('tr').includes(n)) : all.filter((x) => x.unread).concat(all.filter((x) => !x.unread && x.kind === 'ch'));
    return f.slice(0, 12);
  }, [q, communities, lastIds, read]);
  const go = (i: number) => {
    const it = items[i];
    if (!it) return;
    close();
    if (it.kind === 'comm') selectCommunity(it.cid);
    else {
      if (it.kind === 'voice') joinVoice(it.cid, it.ch!);
      selectChannel(it.cid, it.ch!);
    }
  };
  return (
    <Modal onClose={close} className="quick">
      <div className="quick-body">
        <input
          autoFocus
          placeholder="Nereye gitmek istersin?"
          value={q}
          onChange={(e) => (setQ(e.target.value), setSel(0))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
            if (e.key === 'Enter') go(sel);
          }}
        />
        <div className="quick-title">{q ? 'Sonuçlar' : 'Okunmamış ve son kanallar'}</div>
        <div className="quick-list">
          {items.map((it, i) => (
            <div key={it.key} className={cx('quick-item', i === sel && 'sel', it.unread && 'unread')} onMouseEnter={() => setSel(i)} onClick={() => go(i)}>
              {it.kind === 'comm' ? <CommunityIcon c={communities[it.cid]} size={22} /> : it.kind === 'voice' ? <Volume2 size={18} /> : it.kind === 'space' ? <Box size={18} /> : it.kind === 'site' ? <Globe size={18} /> : <Hash size={18} />}
              <span className="qi-label">{it.label}</span>
              <span className="qi-sub">{it.sub}</span>
            </div>
          ))}
          {!items.length && <div className="empty-note">Eşleşen bir şey yok.</div>}
        </div>
        <div className="quick-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> gezin · <kbd>Enter</kbd> git · <kbd>Esc</kbd> kapat
        </div>
      </div>
    </Modal>
  );
}

function SearchModal({ cid, q: initial }: { cid: string; q?: string }) {
  const c = useStore((s) => s.communities[cid]);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me.id);
  const [q, setQ] = useState(initial || '');
  const [res, setRes] = useState<Message[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (query: string) => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const r = await request<{ msgs: Message[] }>(cid, { t: 'search', cid, q: query, rid: '' });
      setRes(r.msgs);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
    setBusy(false);
  };
  useEffect(() => {
    if (initial) run(initial);
  }, []); // eslint-disable-line
  const md = useMemo(
    () => ({ meId: me, userName: (id: string) => users[id]?.name ?? null, channelName: (id: string) => c?.channels.find((x) => x.id === id)?.name ?? null }),
    [c, users, me],
  );
  if (!c) return null;
  return (
    <Modal onClose={close} wide>
      <ModalHead title={`${c.name} içinde ara`} />
      <div className="modal-body">
        <div className="input-icon">
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run(q)} placeholder="Mesajlarda ara…" />
        </div>
        <div className="search-results scroll-thin">
          {busy && <LoaderCircle className="spin" size={20} />}
          {res && !busy && <div className="quick-title">{res.length} sonuç</div>}
          {res?.map((m) => {
            const ch = c.channels.find((x) => x.id === m.channelId);
            return (
              <div key={m.id} className="mini-msg" onClick={() => (close(), jumpToMessage(cid, m.channelId, m.id))}>
                <Avatar user={users[m.authorId]} size={32} />
                <div>
                  <div className="mini-head">
                    <b>{displayName(c, m.authorId, users)}</b> <span>#{ch?.name} · {fmtTime(m.ts)}</span>
                  </div>
                  <div className="mini-body">{renderMarkdown(m.content, md)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

export function Modals() {
  const m = useStore((s) => s.modal);
  if (!m) return null;
  switch (m.type) {
    case 'createCommunity':
      return <CreateCommunityModal />;
    case 'join':
      return <JoinModal code={m.code} />;
    case 'invite':
      return <InviteModal cid={m.cid} />;
    case 'createChannel':
      return <CreateChannelModal cid={m.cid} categoryId={m.categoryId} kind={m.kind} />;
    case 'editChannel':
      return <ChannelSettings key={m.chId} cid={m.cid} chId={m.chId} tab={m.tab} />;
    case 'editCategory':
      return <CategorySettings key={m.catId} cid={m.cid} catId={m.catId} tab={m.tab} />;
    case 'notify':
      return <NotifyModal cid={m.cid} chId={m.chId} />;
    case 'moderate':
      return <ModerateModal cid={m.cid} uid={m.uid} action={m.action} />;
    case 'createCategory':
      return <CategoryModal cid={m.cid} catId={m.catId} />;
    case 'confirm':
      return <ConfirmModal m={m} />;
    case 'image':
      return <ImageModal src={m.src} name={m.name} />;
    case 'screenShare':
      return <ScreenPickerModal />;
    case 'quick':
      return <QuickSwitcher />;
    case 'search':
      return <SearchModal cid={m.cid} q={m.q} />;
    case 'settings':
      return <UserSettings tab={m.tab} />;
    case 'commProfile':
      return <CommunityProfileModal cid={m.cid} />;
    case 'commSettings':
      return <CommunitySettings cid={m.cid} tab={m.tab} />;
    case 'profile':
      return <ProfileModal uid={m.uid} cid={m.cid} />;
    case 'customStatus':
      return <CustomStatusModal />;
    case 'selfRoles':
      return <SelfRolesModal cid={m.cid} />;
  }
}
