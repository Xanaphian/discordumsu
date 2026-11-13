// v1.26 Bağlantı önizlemesi: mesajdaki bağlantıların başlığı, açıklaması ve görseli kart olarak görünür.
// Bilgi uygulamanın kendisinde (main süreç) alınır; sunucu değişikliği gerekmez.
import React, { memo, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { useStore, confirmDialog, openModal } from '../lib/store';
import { openInSiteRoom } from '../lib/site';
import { cx } from '../lib/util';

type Meta = NonNullable<Awaited<ReturnType<typeof window.kovan.linkMeta>>>;

const cache = new Map<string, Meta | null>();
const pending = new Map<string, Promise<Meta | null>>();

function fetchMeta(url: string): Promise<Meta | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url)!);
  let p = pending.get(url);
  if (!p) {
    p = window.kovan
      .linkMeta(url)
      .catch(() => null)
      .then((m) => {
        cache.set(url, m);
        pending.delete(url);
        return m;
      });
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
    if (!out.includes(u)) out.push(u);
    if (out.length >= 3) break;
  }
  return out;
}

export function openLink(href: string) {
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
