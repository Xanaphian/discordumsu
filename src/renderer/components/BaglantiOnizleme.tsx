// v1.26 Bağlantı önizlemesi: mesajdaki bağlantıların başlığı, açıklaması ve görseli kart olarak görünür.
// v1.67: bilgi sunucudan istenir (sayfayı sunucu getirir), böylece bağlantının sitesi kullanıcının IP adresini görmez.
// Sunucu eskiyse (özellik yoksa) eskisi gibi uygulamanın kendisi (main süreç) getirir.
import React, { memo, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { useStore, confirmDialog, openModal, previewConn } from '../lib/store';
import { openInSiteRoom } from '../lib/site';
import { cx } from '../lib/util';
import { isInviteLink } from '../../shared/davetBaglanti';
import type { LinkMeta } from '../../shared/onizleme';

type Meta = LinkMeta;

const cache = new Map<string, Meta | null>();
const pending = new Map<string, Promise<Meta | null>>();

/** Sunucudan gelen ham görseli kart boyutuna küçültür (bellekte MB'larca veri tutulmasın) */
function shrink(src: string, maxW: number): Promise<{ src: string; w: number; h: number } | null> {
  if (!/^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,/.test(src)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) return resolve(null);
      // küçük GIF hareketli kalsın
      if (src.startsWith('data:image/gif') && src.length < 2_000_000) return resolve({ src, w: nw, h: nh });
      const w = Math.min(maxW, nw);
      const h = Math.max(1, Math.round((nh * w) / nw));
      try {
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext('2d')!;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ src: cv.toDataURL('image/webp', 0.86), w, h });
      } catch {
        resolve(null);
      }
    };
    img.src = src;
  });
}

// Sunucuya aynı anda en çok 3 önizleme isteği gider (bağlantı dolu bir kanal açılınca sunucuyu boğmasın); kalanı sırada bekler
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function loadMeta(url: string): Promise<Meta | null> {
  const conn = previewConn();
  if (!conn) return window.kovan.linkMeta(url);
  const ask = () => slot(() => conn.request<{ data: Meta | null }>({ t: 'link.meta', url, rid: '' }, 25000));
  // sunucu meşgulse ya da hız sınırına takıldıysa biraz bekleyip bir kez daha dene
  const r = await ask().catch(() => new Promise((res) => setTimeout(res, 4000)).then(ask));
  const d = r?.data;
  if (!d || typeof d !== 'object') return null;
  const str = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
  const m: Meta = { url, site: str(d.site, 60), title: str(d.title, 160), desc: str(d.desc, 300), direct: d.direct === true };
  if (typeof d.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(d.color)) m.color = d.color;
  const t = typeof d.image === 'string' ? await shrink(d.image, 520) : null;
  if (t) (m.image = t.src), (m.imageW = t.w), (m.imageH = t.h);
  if (m.direct ? !m.image : !m.title && !m.desc && !m.image) return null;
  return m;
}

function fetchMeta(url: string): Promise<Meta | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url)!);
  let p = pending.get(url);
  if (!p) {
    p = loadMeta(url).then(
      (m) => {
        cache.set(url, m);
        if (cache.size > 300) cache.delete(cache.keys().next().value!);
        pending.delete(url);
        return m;
      },
      () => {
        // bağlantı yok ya da sunucu meşgul: sonuç saklanmaz, kart yeniden çizilince tekrar denenir
        pending.delete(url);
        return null;
      },
    );
    pending.set(url, p);
  }
  return p;
}

/** Mesajdaki önizlenecek bağlantılar: kod blokları ve <adres> biçimindekiler (önizleme kapalı) hariç, en çok 3 */
export function previewUrls(content: string): string[] {
  const text = content.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/<https?:\/\/[^\s>]+>/g, ' ').replace(/\|\|[\s\S]*?\|\|/g, ' ');
  const out: string[] = [];
  for (const m of text.matchAll(/\[[^\]\n]{1,200}\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>]+[^\s<.,:;"')\]!?*_~|>]/g)) {
    const u = m[1] || m[0];
    if (isInviteLink(u)) continue; // davet bağlantısı kendi kartıyla görünür
    if (!out.includes(u)) out.push(u);
    if (out.length >= 3) break;
  }
  return out;
}

export function openLink(href: string) {
  // davet bağlantısı tarayıcıya gitmez: katılma penceresi açılır
  if (isInviteLink(href)) return openModal({ type: 'join', code: href });
  if (openInSiteRoom(href)) return;
  if (useStore.getState().settings.confirmLinks)
    confirmDialog('Bağlantı açılsın mı?', `Tarayıcında şu adres açılacak:\n${href}`, () => window.kovan.openExternal(href), 'Aç', false);
  else window.kovan.openExternal(href);
}

const isVideo = (url: string) => /(^|\.)(youtube\.com|youtu\.be|twitch\.tv|kick\.com|vimeo\.com)$/i.test(hostOf(url));
function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const Card = memo(function Card({ url }: { url: string }) {
  const [meta, setMeta] = useState<Meta | null | undefined>(() => cache.get(url));
  useEffect(() => {
    if (meta !== undefined) return;
    let alive = true;
    fetchMeta(url).then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, [url, meta]);
  if (!meta) return null;
  if (meta.direct && meta.image)
    return (
      <div className="lp-direct" onClick={() => openModal({ type: 'image', src: meta.image!, name: hostOf(url) })}>
        <img src={meta.image} alt="" style={{ aspectRatio: meta.imageW && meta.imageH ? `${meta.imageW} / ${meta.imageH}` : undefined }} />
      </div>
    );
  const video = isVideo(url) && !!meta.image;
  const big = !!meta.image && (video || ((meta.imageW || 0) >= 360 && (meta.imageW || 0) / Math.max(1, meta.imageH || 1) > 1.25));
  return (
    <div className={cx('lp-card', big ? 'big' : 'side')} style={meta.color ? ({ ['--lp']: meta.color } as React.CSSProperties) : undefined}>
      <div className="lp-text">
        {meta.site && <div className="lp-site">{meta.site}</div>}
        {meta.title && (
          <a className="lp-title" href={url} onClick={(e) => (e.preventDefault(), openLink(url))} title={url}>
            {meta.title}
          </a>
        )}
        {meta.desc && <div className="lp-desc">{meta.desc}</div>}
      </div>
      {meta.image && (
        <button className={cx('lp-img', video && 'video')} onClick={() => (video ? openLink(url) : openModal({ type: 'image', src: meta.image!, name: meta.title || hostOf(url) }))}>
          <img src={meta.image} alt="" style={{ aspectRatio: meta.imageW && meta.imageH ? `${meta.imageW} / ${meta.imageH}` : undefined }} />
          {video && (
            <span className="lp-play">
              <Play size={22} fill="currentColor" />
            </span>
          )}
        </button>
      )}
    </div>
  );
});

/** Mesajın altına bağlantı kartlarını koyar (ayar kapalıysa hiçbir şey çizmez) */
export const LinkPreviews = memo(function LinkPreviews({ content }: { content: string }) {
  const on = useStore((s) => s.settings.showLinkPreviews);
  if (!on || !content || !/https?:\/\//.test(content)) return null;
  const urls = previewUrls(content);
  if (!urls.length) return null;
  return (
    <div className="lp-list">
      {urls.map((u) => (
        <Card key={u} url={u} />
      ))}
    </div>
  );
});
