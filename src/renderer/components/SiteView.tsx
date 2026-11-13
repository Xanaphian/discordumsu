// Site odası: bir siteyi (varsayılan xanaphian.com) uygulama içinde açar; yanında odanın
// sohbeti ve o an kimin hangi sayfaya baktığı durur. Birini takip edince o gezdikçe sen de gezersin.
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe, ArrowLeft, ArrowRight, RotateCw, X, Home, ExternalLink, Share2, MessageSquare, Compass, Search, Eye, EyeOff, AlertTriangle, LoaderCircle,
} from 'lucide-react';
import { useStore, openMenu, sendMessage, toast, openModal } from '../lib/store';
import {
  useSite, reportAt, leaveSite, setFollow, takePending, lastUrl, XANAPHIAN_LINKS, CHAMPIONS, fold, isXanaphian,
} from '../lib/site';
import { Avatar, Tooltip } from './Common';
import { MessageList, Composer } from './Chat';
import { cx, displayName } from '../lib/util';
import { DEFAULT_SITE_URL, cleanSiteUrl, sameSite, can, Perm, type Channel, type Community, type ID } from '../../shared/protocol';

export const SITE_PARTITION = 'persist:kovan-site';

/** Electron <webview> öğesinin kullandığımız kısmı */
interface WebviewEl extends HTMLElement {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
}

/** Karşılaştırma için adres: sondaki / ve # kısmı atılır */
const norm = (u: string) => u.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();

function prettyUrl(u: string) {
  try {
    const x = new URL(u);
    const path = decodeURI(x.pathname + x.search);
    return { host: x.hostname.replace(/^www\./, ''), path: path === '/' ? '' : path };
  } catch {
    return { host: u, path: '' };
  }
}

function pageLabel(url: string, title: string) {
  const t = title.replace(/\s*[|–—-]\s*(xanaphian|scuttle)[^|–—-]*$/i, '').trim();
  if (t) return t;
  const p = prettyUrl(url);
  return p.host + p.path;
}

const loadChatOpen = () => {
  try {
    return localStorage.getItem('kovan.siteChat') !== '0';
  } catch {
    return true;
  }
};

// ---------------------------------------------------------------------------
// Kenar çubuğunda kanalın altında: odada kimler var

export const SiteViewers = memo(function SiteViewers({ c, chId }: { c: Community; chId: string }) {
  const viewers = useSite((s) => s.viewers[chId]);
  const users = useStore((s) => s.users);
  const list = useMemo(() => uniqueByUser(viewers || []), [viewers]);
  if (!list.length) return null;
  return (
    <div className="vc-members">
      {list.map((v) => (
        <div key={v.sessionId} className="vc-member" title={v.title || v.url} onClick={(e) => useStore.setState({ popout: { uid: v.userId, cid: c.id, x: e.clientX, y: e.clientY } })}>
          <Avatar user={users[v.userId]} size={22} />
          <span className="vc-name">{displayName(c, v.userId, users)}</span>
          <Eye size={13} className="site-eye" />
        </div>
      ))}
    </div>
  );
});

function uniqueByUser<T extends { userId: ID }>(list: T[]): T[] {
  const seen = new Set<ID>();
  return list.filter((v) => (seen.has(v.userId) ? false : (seen.add(v.userId), true)));
}

// ---------------------------------------------------------------------------
// Şampiyon arama kutusu (yalnız xanaphian.com)

function ChampSearch({ onPick }: { onPick: (slug: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const items = useMemo(() => {
    const k = fold(q.trim());
    if (!k) return [];
    const starts = CHAMPIONS.filter((x) => fold(x.name).startsWith(k));
    const rest = CHAMPIONS.filter((x) => !starts.includes(x) && x.key.includes(k));
    return [...starts, ...rest].slice(0, 8);
  }, [q]);
  const pick = (slug: string) => {
    onPick(slug);
    setQ('');
    setOpen(false);
  };
  return (
    <div className="site-champ">
      <Search size={14} />
      <input
        placeholder="Şampiyon ara"
        value={q}
        onChange={(e) => (setQ(e.target.value), setSel(0), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
          else if (e.key === 'Enter' && items[sel]) pick(items[sel].slug);
          else if (e.key === 'Escape') (setQ(''), (e.target as HTMLInputElement).blur());
        }}
      />
      {open && items.length > 0 && (
        <div className="site-champ-list">
          {items.map((x, i) => (
            <button key={x.slug} className={cx(i === sel && 'on')} onMouseDown={(e) => (e.preventDefault(), pick(x.slug))} onMouseEnter={() => setSel(i)}>
              {x.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function SiteView({ c, ch }: { c: Community; ch: Channel }) {
  const home = ch.url || DEFAULT_SITE_URL;
  const me = useStore((s) => s.me.id);
  const users = useStore((s) => s.users);
  const holder = useRef<HTMLDivElement>(null);
  const wv = useRef<WebviewEl | null>(null);
  const ready = useRef(false);
  const curUrl = useRef('');
  const expect = useRef<{ url: string; at: number } | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState({ back: false, fwd: false });
  const [err, setErr] = useState<{ code: number; desc: string; url: string } | null>(null);
  const [addr, setAddr] = useState<string | null>(null);
  const follow = useSite((s) => s.follow[ch.id]);
  const viewers = useSite((s) => s.viewers[ch.id]);
  const pending = useSite((s) => s.pending[ch.id]);
  const others = useMemo(() => uniqueByUser((viewers || []).filter((v) => v.userId !== me)), [viewers, me]);
  const leader = follow ? (viewers || []).find((v) => v.userId === follow) : undefined;
  const xana = isXanaphian(home);
  const origin = useMemo(() => {
    try {
      return new URL(home).origin;
    } catch {
      return 'https://xanaphian.com';
    }
  }, [home]);

  const stopFollow = useCallback(
    (why?: string) => {
      if (!useSite.getState().follow[ch.id]) return;
      setFollow(ch.id, undefined);
      if (why) toast(why, 'info');
    },
    [ch.id],
  );

  /** Bu sitedeyse görünümde aç, değilse varsayılan tarayıcıya gönder */
  const go = useCallback(
    (target: string, byFollow = false) => {
      if (!sameSite(target, home)) {
        window.kovan.openExternal(target);
        toast('Bu adres odanın sitesi dışında; tarayıcında açıldı.', 'info');
        return;
      }
      if (!byFollow) stopFollow();
      expect.current = byFollow ? { url: target, at: Date.now() } : null;
      const el = wv.current;
      if (!el) return;
      setErr(null);
      if (ready.current) el.loadURL(target).catch(() => {});
      else el.setAttribute('src', target);
    },
    [home, stopFollow],
  );

  // görünümü kur (kanal ya da açılış adresi değişince yeniden)
  useEffect(() => {
    const box = holder.current;
    if (!box) return;
    const el = document.createElement('webview') as WebviewEl;
    el.className = 'site-webview';
    el.setAttribute('partition', SITE_PARTITION);
    el.setAttribute('allowpopups', '');
    const start = takePending(ch.id) || lastUrl.get(ch.id) || home;
    el.setAttribute('src', sameSite(start, home) ? start : home);
    ready.current = false;
    curUrl.current = '';
    setUrl(start);
    setTitle('');
    setErr(null);
    setLoading(true);

    const updNav = () => {
      if (!ready.current) return;
      try {
        setNav({ back: el.canGoBack(), fwd: el.canGoForward() });
      } catch {
        /* henüz bağlı değil */
      }
    };
    const onNav = (u: string) => {
      curUrl.current = u;
      setUrl(u);
      updNav();
      let t = '';
      try {
        t = el.getTitle();
      } catch {
        /* */
      }
      reportAt(ch.id, u, t);
      // takipteyken kendi başına başka sayfaya geçtiyse takibi bırak
      const ex = expect.current;
      if (useSite.getState().follow[ch.id] && ex && norm(u) !== norm(ex.url) && Date.now() - ex.at > 2500) {
        expect.current = null;
        stopFollow('Kendi başına gezmeye başladın; takip bırakıldı.');
      }
    };
    const handlers: [string, (e: any) => void][] = [
      ['dom-ready', () => ((ready.current = true), updNav())],
      ['did-start-loading', () => setLoading(true)],
      ['did-stop-loading', () => (setLoading(false), updNav())],
      ['did-navigate', (e) => (setErr(null), onNav(e.url))],
      ['did-navigate-in-page', (e) => e.isMainFrame && onNav(e.url)],
      [
        'page-title-updated',
        (e) => {
          setTitle(e.title);
          if (curUrl.current) reportAt(ch.id, curUrl.current, e.title);
        },
      ],
      [
        'did-fail-load',
        (e) => {
          // -3: iptal (yeni gezinme başladı) hata sayılmaz
          if (e.isMainFrame && e.errorCode !== -3) {
            setErr({ code: e.errorCode, desc: e.errorDescription, url: e.validatedURL });
            if (e.validatedURL) setUrl(e.validatedURL);
          }
        },
      ],
    ];
    for (const [n, h] of handlers) el.addEventListener(n, h);
    box.appendChild(el);
    wv.current = el;
    return () => {
      for (const [n, h] of handlers) el.removeEventListener(n, h);
      leaveSite(ch.id);
      el.remove();
      wv.current = null;
      ready.current = false;
    };
  }, [ch.id, home]);

  // sohbetten gelen bağlantı
  useEffect(() => {
    if (!pending) return;
    const u = takePending(ch.id);
    if (u) go(u);
  }, [pending, ch.id, go]);

  // takip: lider sayfa değiştirdikçe peşinden git
  useEffect(() => {
    if (!follow) return;
    if (!leader) {
      const name = displayName(c, follow, users);
      stopFollow(`${name} odadan ayrıldı; takip bitti.`);
      return;
    }
    if (norm(leader.url) !== norm(curUrl.current)) go(leader.url, true);
  }, [follow, leader?.url]);

  const viewerMenu = (e: React.MouseEvent, uid: ID, vurl: string) => {
    const following = follow === uid;
    openMenu(e, [
      following ? { label: 'Takibi bırak', onClick: () => stopFollow() } : { label: 'Takip et (o gezdikçe sen de gez)', onClick: () => setFollow(ch.id, uid) },
      { label: 'Baktığı sayfaya git', onClick: () => go(vurl) },
      { sep: true },
      { label: 'Profili göster', onClick: () => useStore.setState({ popout: { uid, cid: c.id, x: e.clientX, y: e.clientY } }) },
    ]);
  };

  const manage = can(c, me, Perm.MANAGE_CHANNELS);

  return (
    <section className="site-view">
      <div className="site-main">
        {leader && (
          <div className="site-follow-bar">
            <Avatar user={users[leader.userId]} size={20} />
            <span>
              <b>{displayName(c, leader.userId, users)}</b> takip ediliyor · {pageLabel(leader.url, leader.title)}
            </span>
            <button className="btn sm ghost" onClick={() => stopFollow()}>
              <EyeOff size={14} /> Bırak
            </button>
          </div>
        )}
        <div className="site-frame" ref={holder}>
          {err && (
            <div className="site-error">
              <AlertTriangle size={30} />
              <h3>Sayfa açılamadı</h3>
              <p>
                {prettyUrl(err.url).host} yanıt vermedi ({err.desc || 'hata ' + err.code}). İnternet bağlantını kontrol edip yeniden dene.
              </p>
              <div className="site-error-actions">
                <button className="btn primary" onClick={() => (setErr(null), wv.current?.reload())}>
                  Yeniden dene
                </button>
                <button className="btn ghost" onClick={() => window.kovan.openExternal(err.url)}>
                  Tarayıcıda aç
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <aside className="site-aside">
        <div className="site-people">
          <div className="site-people-head">
            <span>Odada</span>
            <b>{others.length + 1}</b>
            {manage && (
              <button className="link sm" onClick={() => openModal({ type: 'editChannel', cid: c.id, chId: ch.id })}>
                Odayı düzenle
              </button>
            )}
          </div>
          <div className="site-person me">
            <Avatar user={users[me]} size={24} />
            <div className="site-person-text">
              <b>Sen</b>
              <span>{pageLabel(url || home, title)}</span>
            </div>
          </div>
          {others.map((v) => (
            <div
              key={v.sessionId}
              className={cx('site-person', follow === v.userId && 'following')}
              onClick={(e) => viewerMenu(e, v.userId, v.url)}
              onContextMenu={(e) => viewerMenu(e, v.userId, v.url)}
              title="Takip et, sayfasına git"
            >
              <Avatar user={users[v.userId]} size={24} />
              <div className="site-person-text">
                <b>{displayName(c, v.userId, users)}</b>
                <span>{pageLabel(v.url, v.title)}</span>
              </div>
              {follow === v.userId ? <Eye size={15} className="site-eye on" /> : norm(v.url) === norm(url) ? <span className="site-same">aynı sayfa</span> : null}
            </div>
          ))}
          {!others.length && <div className="site-alone">Şu an odada yalnızsın. Davet ettiğin arkadaşların buraya girince burada görünür.</div>}
        </div>
        <div className="site-chat chat">
          <MessageList c={c} ch={ch} />
          <Composer key={ch.id} c={c} ch={ch} />
        </div>
      </aside>
    </section>
  );
}
