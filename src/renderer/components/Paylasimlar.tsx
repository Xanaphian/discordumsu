// v1.48 Ana Sayfa > Başlangıç: paylaşım akışı. Kısa yazı (+ isteğe bağlı resim),
// görünürlük "Herkese açık" ya da "Yalnızca arkadaşlar"; beğeni, yanıt, silme, şikâyet, engelleme.
import React, { useEffect, useRef, useState } from 'react';
import {
  Globe, Users, Image as ImageIcon, X, Heart, MessageCircle, MoreHorizontal, LoaderCircle, Send, CloudOff, ServerCog, Feather, EyeOff,
} from 'lucide-react';
import { useStore, openModal, openMenu, confirmDialog, toast, type MenuItem } from '../lib/store';
import {
  usePosts, usePostSupport, loadFeed, loadThread, createPost, likePost, deletePost, reportPost, homeFileBase, POST_IMAGE_MAX,
} from '../lib/paylasim';
import { toggleBlock } from './Moderation';
import { Avatar, Tooltip } from './Common';
import { POST_MAX, REPORT_REASONS, type PostView, type PostVis } from '../../shared/paylasim';
import type { UserPublic } from '../../shared/protocol';
import { cx } from '../lib/util';

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'şimdi';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa`;
  const g = Math.round(h / 24);
  return g < 7 ? `${g} gün` : new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
const idTs = (id: string) => parseInt(id.slice(0, 9), 36);

const VIS: Record<PostVis, { label: string; short: string; icon: React.ReactNode; hint: string }> = {
  public: { label: 'Herkese açık', short: 'Herkes', icon: <Globe size={14} />, hint: 'Bu sunucudaki herkes görebilir' },
  friends: { label: 'Yalnızca arkadaşlar', short: 'Arkadaşlar', icon: <Users size={14} />, hint: 'Yalnızca arkadaşların görebilir' },
};
const VIS_KEY = 'xn.post.vis';

/** Yazar kartını açar; yazar tanıdık değilse önce kullanıcı önbelleğine eklenir */
function openAuthor(u: UserPublic, e: React.MouseEvent) {
  e.stopPropagation();
  useStore.setState((s) => ({ users: s.users[u.id] ? s.users : { ...s.users, [u.id]: u }, popout: { uid: u.id, x: e.clientX, y: e.clientY } }));
}

/** düz metin + tıklanabilir bağlantılar */
function PostText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>]+)/g);
  return (
    <p className="ps-text">
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener">
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------

export function PostFeed() {
  const support = usePostSupport();
  const [scope, setScope] = useState<'all' | 'friends'>('all');
  const feed = usePosts((s) => s.feeds[scope]);
  const blocked = useStore((s) => s.settings.blocked);
  const gone = usePosts((s) => s.gone);
  useEffect(() => {
    if (support === 'ok' && !feed.loaded && !feed.loading) loadFeed(scope);
  }, [support, scope, feed.loaded, feed.loading]);
  const items = feed.items.filter((p) => !blocked.includes(p.author.id) && !gone[p.id]);
  return (
    <section className="ps" aria-label="Paylaşımlar">
      {support === 'ok' ? <Composer /> : <Unsupported kind={support} />}
      {support === 'ok' && (
        <>
          <div className="ps-tabs" role="tablist">
            <button role="tab" aria-selected={scope === 'all'} className={cx('ps-tab', scope === 'all' && 'on')} onClick={() => setScope('all')}>
              <Globe size={15} /> Herkes
            </button>
            <button role="tab" aria-selected={scope === 'friends'} className={cx('ps-tab', scope === 'friends' && 'on')} onClick={() => setScope('friends')}>
              <Users size={15} /> Arkadaşların
            </button>
          </div>
          <div className="ps-list">
            {items.map((p) => (
              <PostCard key={p.id} p={p} />
            ))}
            {feed.loading && (
              <div className="ps-loading">
                <LoaderCircle size={18} className="spin" />
              </div>
            )}
            {feed.loaded && !feed.loading && !items.length && (
              <div className="ps-empty">
                <span className="ps-empty-ic">
                  <Feather size={22} />
                </span>
                <b>{feed.error ? 'Akış yüklenemedi' : scope === 'friends' ? 'Arkadaşların henüz bir şey paylaşmadı' : 'Henüz paylaşım yok'}</b>
                <span>{feed.error || (scope === 'friends' ? 'Paylaştıklarında burada görünecek.' : 'İlk paylaşımı sen yap, aklındakini yaz.')}</span>
              </div>
            )}
            {feed.more && !feed.loading && (
              <button className="ps-more" onClick={() => loadFeed(scope, true)}>
                Daha eski paylaşımlar
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Unsupported({ kind }: { kind: 'offline' | 'old' }) {
  return (
    <div className="ps-off">
      <span className="ps-off-ic">{kind === 'old' ? <ServerCog size={22} /> : <CloudOff size={22} />}</span>
      <div>
        <b>{kind === 'old' ? 'Paylaşımlar için sunucunun güncellenmesi gerekiyor' : 'Sunucuya bağlanılamıyor'}</b>
        <span>
          {kind === 'old'
            ? 'Bağlı olduğun sunucu bu özelliği henüz desteklemiyor. Sunucu yeni sürüme geçince akış burada kendiliğinden açılır.'
            : 'Bağlantı gelince paylaşımlar burada görünecek.'}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Composer() {
  const me = useStore((s) => s.me);
  const [text, setText] = useState('');
  const [vis, setVis] = useState<PostVis>(() => {
    try {
      return localStorage.getItem(VIS_KEY) === 'friends' ? 'friends' : 'public';
    } catch {
      return 'public';
    }
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 260) + 'px';
  }, [text]);
  const chooseVis = (v: PostVis) => {
    setVis(v);
    try {
      localStorage.setItem(VIS_KEY, v);
    } catch {}
  };
  const left = POST_MAX - text.length;
  const can = (text.trim() || file) && left >= 0 && !busy;
  const submit = async () => {
    if (!can) return;
    setBusy(true);
    const ok = await createPost(text.trim(), vis, file);
    setBusy(false);
    if (ok) {
      setText('');
      setFile(null);
    }
  };
  return (
    <div className={cx('ps-compose', (text || file) && 'active')}>
      <Avatar user={{ name: me.name, color: me.color, avatar: me.avatar, extra: me.extra }} size={42} />
      <div className="ps-compose-in">
        <textarea
          ref={ta}
          rows={1}
          value={text}
          maxLength={POST_MAX + 50}
          placeholder={`Neler oluyor, ${me.name}?`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
          }}
          onPaste={(e) => {
            const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'));
            if (f) {
              e.preventDefault();
              if (f.size > POST_IMAGE_MAX) return void toast('Resim en fazla 8 MB olabilir.', 'err');
              setFile(f);
            }
          }}
        />
        {preview && (
          <div className="ps-preview">
            <img src={preview} alt="" />
            <button className="ps-preview-x" onClick={() => setFile(null)} aria-label="Resmi kaldır">
              <X size={15} />
            </button>
          </div>
        )}
        <div className="ps-compose-bar">
          <Tooltip text="Resim ekle">
            <button className="ps-ib" onClick={() => pick.current?.click()} aria-label="Resim ekle">
              <ImageIcon size={18} />
            </button>
          </Tooltip>
          <input
            ref={pick}
            hidden
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > POST_IMAGE_MAX) return void toast('Resim en fazla 8 MB olabilir.', 'err');
              setFile(f);
            }}
          />
          <div className="ps-vis" role="radiogroup" aria-label="Kim görebilir">
            {(['public', 'friends'] as PostVis[]).map((v) => (
              <Tooltip key={v} text={VIS[v].hint}>
                <button role="radio" aria-checked={vis === v} className={cx('ps-vis-opt', vis === v && 'on')} onClick={() => chooseVis(v)}>
                  {VIS[v].icon}
                  {VIS[v].label}
                </button>
              </Tooltip>
            ))}
          </div>
          <span className="ps-fill" />
          {text.length > POST_MAX - 80 && <span className={cx('ps-count', left < 0 && 'over')}>{left}</span>}
          <button className="btn primary sm ps-send" disabled={!can} onClick={submit}>
            {busy ? <LoaderCircle size={15} className="spin" /> : 'Paylaş'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function postMenu(e: React.MouseEvent, p: PostView, rootAuthor?: string) {
  const s = useStore.getState();
  const mine = p.author.id === s.me.id;
  const items: MenuItem[] = [{ label: 'Profili görüntüle', onClick: () => openAuthor(p.author, e) }];
  if (p.text) items.push({ label: 'Metni kopyala', onClick: () => navigator.clipboard.writeText(p.text) });
  items.push({ sep: true });
  if (mine || rootAuthor === s.me.id)
    items.push({
      label: p.re ? 'Yanıtı sil' : 'Paylaşımı sil',
      danger: true,
      onClick: () => confirmDialog(p.re ? 'Yanıtı sil' : 'Paylaşımı sil', p.re ? 'Bu yanıt kalıcı olarak silinecek.' : 'Bu paylaşım ve altındaki yanıtlar kalıcı olarak silinecek.', () => deletePost(p), 'Sil'),
    });
  if (!mine) {
    items.push({ label: 'Şikâyet et', sub: REPORT_REASONS.map((r) => ({ label: r.label, onClick: () => reportPost(p, r.id) })) });
    items.push({ label: 'Engelle', danger: true, onClick: () => toggleBlock(p.author.id, p.author.name) });
  }
  openMenu(e, items);
}

function PostCard({ p: initial }: { p: PostView }) {
  const p = usePosts((s) => s.byId[initial.id]) || initial;
  const [open, setOpen] = useState(false);
  const meId = useStore((s) => s.me.id);
  const ts = idTs(p.id);
  return (
    <article className={cx('ps-post', p.hidden && 'hidden')} onContextMenu={(e) => postMenu(e, p)}>
      <button className="ps-av" onClick={(e) => openAuthor(p.author, e)} aria-label={p.author.name}>
        <Avatar user={p.author} size={42} />
      </button>
      <div className="ps-body">
        <header className="ps-head">
          <button className="ps-name" onClick={(e) => openAuthor(p.author, e)} style={{ ['--uc' as any]: p.author.color }}>
            {p.author.name}
          </button>
          <Tooltip text={VIS[p.vis].hint}>
            <span className={cx('ps-vis-tag', p.vis)}>{VIS[p.vis].icon}</span>
          </Tooltip>
          <time dateTime={new Date(ts).toISOString()} title={new Date(ts).toLocaleString('tr-TR')}>
            {ago(ts)}
          </time>
          <span className="ps-fill" />
          <button className="ps-ib sm" onClick={(e) => postMenu(e, p)} aria-label="Diğer">
            <MoreHorizontal size={17} />
          </button>
        </header>
        {p.hidden && (
          <div className="ps-hidden-note">
            <EyeOff size={13} /> Bu paylaşım şikâyetler nedeniyle başkalarına gösterilmiyor.
          </div>
        )}
        {p.text && <PostText text={p.text} />}
        {p.image && <PostImage p={p} />}
        <footer className="ps-acts">
          <button className={cx('ps-act like', p.liked && 'on')} onClick={() => likePost(p, !p.liked)} aria-pressed={p.liked} aria-label="Beğen">
            <Heart size={17} fill={p.liked ? 'currentColor' : 'none'} />
            {p.likes > 0 && <span>{p.likes}</span>}
          </button>
          <button
            className={cx('ps-act', open && 'on')}
            onClick={() => {
              if (!open) loadThread(p.id);
              setOpen(!open);
            }}
            aria-expanded={open}
          >
            <MessageCircle size={17} />
            <span>{p.replies > 0 ? `${p.replies} yanıt` : 'Yanıtla'}</span>
          </button>
        </footer>
        {open && <Thread root={p} meId={meId} />}
      </div>
    </article>
  );
}

function PostImage({ p }: { p: PostView }) {
  const img = p.image!;
  const src = homeFileBase() + img.url;
  const ratio = img.w && img.h ? Math.max(0.5, Math.min(2.2, img.w / img.h)) : undefined;
  return (
    <button className="ps-img" onClick={() => openModal({ type: 'image', src, name: img.name })} style={ratio ? { aspectRatio: String(ratio) } : undefined}>
      <img src={src} alt="" loading="lazy" draggable={false} />
    </button>
  );
}

function Thread({ root, meId }: { root: PostView; meId: string }) {
  const t = usePosts((s) => s.threads[root.id]);
  const blocked = useStore((s) => s.settings.blocked);
  const me = useStore((s) => s.me);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const items = (t?.items || []).filter((r) => !blocked.includes(r.author.id));
  const send = async () => {
    const v = text.trim();
    if (!v || busy || v.length > POST_MAX) return;
    setBusy(true);
    const ok = await createPost(v, root.vis, null, root.id);
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <div className="ps-thread">
      {t?.loading && !items.length && (
        <div className="ps-loading sm">
          <LoaderCircle size={16} className="spin" />
        </div>
      )}
      {items.map((r) => (
        <Reply key={r.id} r={r} rootAuthor={root.author.id} />
      ))}
      <div className="ps-reply-box">
        <Avatar user={{ name: me.name, color: me.color, avatar: me.avatar, extra: me.extra }} size={30} />
        <input
          value={text}
          maxLength={POST_MAX}
          placeholder={`${root.author.id === meId ? 'Kendi paylaşımına' : root.author.name + ' kişisine'} yanıt yaz…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
        />
        <button className="ps-ib accent" disabled={!text.trim() || busy} onClick={send} aria-label="Yanıtı gönder">
          {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

function Reply({ r: initial, rootAuthor }: { r: PostView; rootAuthor: string }) {
  const r = usePosts((s) => s.byId[initial.id]) || initial;
  const ts = idTs(r.id);
  return (
    <div className="ps-reply" onContextMenu={(e) => postMenu(e, r, rootAuthor)}>
      <button className="ps-av" onClick={(e) => openAuthor(r.author, e)} aria-label={r.author.name}>
        <Avatar user={r.author} size={30} />
      </button>
      <div className="ps-body">
        <header className="ps-head">
          <button className="ps-name" onClick={(e) => openAuthor(r.author, e)}>
            {r.author.name}
          </button>
          <time title={new Date(ts).toLocaleString('tr-TR')}>{ago(ts)}</time>
          <span className="ps-fill" />
          <button className={cx('ps-act like mini', r.liked && 'on')} onClick={() => likePost(r, !r.liked)} aria-label="Beğen">
            <Heart size={14} fill={r.liked ? 'currentColor' : 'none'} />
            {r.likes > 0 && <span>{r.likes}</span>}
          </button>
          <button className="ps-ib sm" onClick={(e) => postMenu(e, r, rootAuthor)} aria-label="Diğer">
            <MoreHorizontal size={15} />
          </button>
        </header>
        <PostText text={r.text} />
      </div>
    </div>
  );
}
