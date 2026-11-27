// Hafif ve güvenli (innerHTML kullanmayan) mesaj biçimlendirici.
import { isInviteLink } from '../../shared/davetBaglanti';
import React, { ReactNode, useState } from 'react';
import { highlight } from './highlight';
import { useStore, confirmDialog, openModal } from './store';
import { openInSiteRoom } from './site';
import { parseMedia, type MediaMsg } from './medya';

function MediaView({ m, base }: { m: MediaMsg; base: string }) {
  const [bad, setBad] = useState(false);
  const src = m.local ? m.url : base + m.url;
  if (bad) return <span className="msg-media-missing">[{m.kind === 'gif' ? 'GIF' : 'Çıkartma'}: {m.name}]</span>;
  return (
    <img
      className={'msg-media ' + (m.kind === 'gif' ? 'msg-gif' : 'msg-sticker')}
      src={src}
      alt={m.name}
      title={m.name}
      loading="lazy"
      draggable={false}
      onError={() => setBad(true)}
    />
  );
}

export interface MdCtx {
  userName: (id: string) => string | null;
  userColor?: (id: string) => string;
  channelName: (id: string) => string | null;
  onUser?: (id: string, e: React.MouseEvent) => void;
  onChannel?: (id: string) => void;
  meId: string;
  /** <@&rol> etiketleri için ad, renk ve benim bu rolde olup olmadığım */
  roleInfo?: (id: string) => { name: string; color: string; mine: boolean } | null;
  /** topluluk çıkartmalarının resim adresi için sunucu kökü */
  base?: string;
}

type Rule = { re: RegExp; render: (m: RegExpExecArray, ctx: MdCtx, key: number) => ReactNode };

// Dengeli ayraçlar adresin parçasıdır: https://tr.wikipedia.org/wiki/Ankara_(il) sondaki ")" ile birlikte bağlantı olur
const URL_BODY = String.raw`https?:\/\/(?:\([^\s<()]*\)|[^\s<()])*(?:\([^\s<()]*\)|[^\s<.,:;"'()\]!?*_~|>])`;
const URL_RE = new RegExp('^' + URL_BODY);
// "www.ornek.com" gibi başında https:// olmayan adresler de bağlantı olur (Discord'daki gibi)
const WWW_BODY = String.raw`www\.[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:[/?#](?:\([^\s<()]*\)|[^\s<()])*(?:\([^\s<()]*\)|[^\s<.,:;"'()\]!?*_~|>]))?`;
const WWW_RE = new RegExp('^' + WWW_BODY, 'u');
const WWW_BEFORE = /[\p{L}\p{N}._\/@:-]/u;

function Spoiler({ children }: { children: ReactNode }) {
  const [clicked, setOpen] = useState(false);
  const always = useStore((s) => s.settings.spoilers === 'always');
  const open = clicked || always;
  return (
    <span className={open ? 'md-spoiler open' : 'md-spoiler'} onClick={(e) => (e.stopPropagation(), setOpen(true))}>
      {children}
    </span>
  );
}

/** `masked`: [yazı](adres) biçimi. Görünen yazı başka bir adres gibi durabilir (oltalama), o yüzden asıl adres her zaman sorulur. */
function Link({ href, children, masked }: { href: string; children: ReactNode; masked?: boolean }) {
  return (
    <a
      className="md-link"
      href={href}
      title={href}
      onClick={(e) => {
        e.preventDefault();
        // davet bağlantısı tarayıcıya gitmez: katılma penceresi açılır
        if (isInviteLink(href)) return openModal({ type: 'join', code: href });
        if (openInSiteRoom(href)) return;
        if (masked)
          confirmDialog('Bağlantı açılsın mı?', `Bu bağlantının yazısı ile gittiği adres farklı. Tarayıcında gerçekte şu adres açılacak:\n${href}`, () => window.kovan.openExternal(href), 'Aç', false);
        else if (useStore.getState().settings.confirmLinks)
          confirmDialog('Bağlantı açılsın mı?', `Tarayıcında şu adres açılacak:\n${href}`, () => window.kovan.openExternal(href), 'Aç', false);
        else window.kovan.openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

const inlineRules: Rule[] = [
  { re: /^\\([*_~`|\\<>#@:[\]()-])/, render: (m) => m[1] },
  { re: /^`([^`\n]+)`/, render: (m, _c, k) => <code key={k} className="md-code">{m[1]}</code> },
  { re: /^\*\*([\s\S]+?)\*\*(?!\*)/, render: (m, c, k) => <strong key={k}>{inline(m[1], c)}</strong> },
  { re: /^__([\s\S]+?)__(?!_)/, render: (m, c, k) => <u key={k}>{inline(m[1], c)}</u> },
  { re: /^\*(?=\S)([\s\S]*?\S)\*(?!\*)/, render: (m, c, k) => <em key={k}>{inline(m[1], c)}</em> },
  { re: /^_(?=\S)([\s\S]*?\S)_(?![_\p{L}\p{N}])/u, render: (m, c, k) => <em key={k}>{inline(m[1], c)}</em> },
  { re: /^~~([\s\S]+?)~~/, render: (m, c, k) => <s key={k}>{inline(m[1], c)}</s> },
  { re: /^\|\|([\s\S]+?)\|\|/, render: (m, c, k) => <Spoiler key={k}>{inline(m[1], c)}</Spoiler> },
  {
    re: /^\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/,
    render: (m, c, k) => (
      <Link key={k} href={m[2]} masked={m[1].trim() !== m[2]}>
        {inline(m[1], c)}
      </Link>
    ),
  },
  // <adres>: önizleme kartı çıkmaz, köşeli ayraçlar görünmez (v1.26)
  { re: /^<(https?:\/\/[^\s<>]+)>/, render: (m, _c, k) => <Link key={k} href={m[1]}>{m[1]}</Link> },
  { re: URL_RE, render: (m, _c, k) => <Link key={k} href={m[0]}>{m[0]}</Link> },
  {
    re: /^<@&([\w-]+)>/,
    render: (m, c, k) => {
      const r = c.roleInfo?.(m[1]);
      return (
        <span key={k} className={'md-mention role' + (r?.mine ? ' me' : '')} style={r?.color ? ({ '--role': r.color } as React.CSSProperties) : undefined}>
          @{r?.name ?? 'silinmiş-rol'}
        </span>
      );
    },
  },
  {
    re: /^<@([\w-]+)>/,
    render: (m, c, k) => {
      const name = c.userName(m[1]);
      return (
        <span key={k} className={'md-mention' + (m[1] === c.meId ? ' me' : '')} onClick={(e) => c.onUser?.(m[1], e)}>
          @{name ?? 'bilinmeyen'}
        </span>
      );
    },
  },
  {
    re: /^<#(\w+)>/,
    render: (m, c, k) => {
      const name = c.channelName(m[1]);
      return (
        <span key={k} className="md-mention ch" onClick={() => c.onChannel?.(m[1])}>
          #{name ?? 'silinmiş-kanal'}
        </span>
      );
    },
  },
  { re: /^@(everyone|here|herkes)\b/, render: (m, _c, k) => <span key={k} className="md-mention me">@{m[1]}</span> },
];

const SPECIAL = /[\\`*_~|[hw<@]/;
const WORD_CH = /[\p{L}\p{N}]/u;

export function inline(src: string, ctx: MdCtx): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0;
  let key = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const next = rest.search(SPECIAL);
    if (next < 0) {
      buf += rest;
      break;
    }
    if (next > 0) {
      buf += rest.slice(0, next);
      i += next;
      continue;
    }
    let matched = false;
    // "h" ile başlayan kelimeler sadece URL için; kelime ortasındaki h'leri hızla geç
    if (rest[0] === 'h' && !rest.startsWith('http')) {
      buf += 'h';
      i++;
      continue;
    }
    if (rest[0] === 'w') {
      const m = rest.startsWith('www.') && (i === 0 || !WWW_BEFORE.test(src[i - 1])) ? WWW_RE.exec(rest) : null;
      if (m) {
        if (buf) out.push(buf), (buf = '');
        out.push(<Link key={key++} href={'https://' + m[0]}>{m[0]}</Link>);
        i += m[0].length;
      } else {
        buf += 'w';
        i++;
      }
      continue;
    }
    // Kelime ortasındaki alt çizgi biçim değildir: snake_case, xX_ad_Xx gibi yazılar eğik/altı çizili olmasın
    if (rest[0] === '_' && i > 0 && WORD_CH.test(src[i - 1])) {
      const run = /^_+/.exec(rest)![0];
      buf += run;
      i += run.length;
      continue;
    }
    for (const r of inlineRules) {
      const m = r.re.exec(rest);
      if (m) {
        if (buf) out.push(buf), (buf = '');
        out.push(r.render(m, ctx, key++));
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      buf += rest[0];
      i++;
    }
  }
  if (buf) out.push(buf);
  return out;
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u;
export function isEmojiOnly(s: string) {
  if (!s || s.length > 60 || !EMOJI_ONLY.test(s) || /^[\d#*\s]+$/.test(s)) return false;
  const count = [...s.matchAll(/\p{Extended_Pictographic}/gu)].length;
  return count > 0 && count <= 27;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-pre">
      <div className="md-pre-bar">
        <span>{lang || 'kod'}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
      </div>
      <pre>
        <code>{highlight(code, lang)}</code>
      </pre>
    </div>
  );
}

/** Blok düzeyi: kod blokları, başlıklar, alıntılar, listeler. */
export function renderMarkdown(src: string, ctx: MdCtx): ReactNode[] {
  // Mesajın tamamı GIF ya da çıkartmaysa resim olarak göster
  const media = parseMedia(src);
  if (media) return [<MediaView key="m" m={media} base={ctx.base || ''} />];
  const out: ReactNode[] = [];
  const parts = src.split(/```/);
  let key = 0;
  parts.forEach((part, idx) => {
    if (idx % 2 === 1 && idx < parts.length - 1) {
      const nl = part.indexOf('\n');
      let lang = '';
      let code = part;
      if (nl >= 0 && /^[\w+#-]{0,20}$/.test(part.slice(0, nl).trim())) {
        lang = part.slice(0, nl).trim();
        code = part.slice(nl + 1);
      }
      out.push(<CodeBlock key={key++} lang={lang} code={code.replace(/\n$/, '')} />);
      return;
    }
    const text = idx % 2 === 1 ? '```' + part : part;
    let t = text;
    if (idx > 0) t = t.replace(/^\n/, '');
    if (idx < parts.length - 1) t = t.replace(/\n$/, '');
    if (!t) return;
    const lines = t.split('\n');
    let para: string[] = [];
    let quote: string[] = [];
    let list: { ordered: boolean; start: number; items: string[] } | null = null;
    const flushPara = () => {
      while (para.length && !para[0].trim()) para.shift();
      while (para.length && !para[para.length - 1].trim()) para.pop();
      if (para.length) out.push(<div key={key++} className="md-p">{inline(para.join('\n'), ctx)}</div>);
      para = [];
    };
    const flushQuote = () => {
      if (quote.length) {
        out.push(
          <blockquote key={key++} className="md-quote">
            {renderMarkdown(quote.join('\n'), ctx)}
          </blockquote>,
        );
        quote = [];
      }
    };
    const flushList = () => {
      if (list) {
        const items = list.items.map((it, i) => <li key={i}>{inline(it, ctx)}</li>);
        out.push(list.ordered ? <ol key={key++} className="md-list" start={list.start}>{items}</ol> : <ul key={key++} className="md-list">{items}</ul>);
        list = null;
      }
    };
    for (const line of lines) {
      let m: RegExpExecArray | null;
      if ((m = /^>\s?(.*)$/.exec(line))) {
        flushPara();
        flushList();
        quote.push(m[1]);
        continue;
      }
      flushQuote();
      if ((m = /^(#{1,3})\s+(.+)$/.exec(line))) {
        flushPara();
        flushList();
        const H = (`h${m[1].length}` as 'h1' | 'h2' | 'h3');
        out.push(<H key={key++} className="md-h">{inline(m[2], ctx)}</H>);
        continue;
      }
      if ((m = /^-#\s+(.+)$/.exec(line))) {
        flushPara();
        flushList();
        out.push(<small key={key++} className="md-sub">{inline(m[1], ctx)}</small>);
        continue;
      }
      if ((m = /^\s*([-*]|\d{1,3}\.)\s+(.+)$/.exec(line))) {
        flushPara();
        const ordered = /\d/.test(m[1]);
        if (list && list.ordered !== ordered) flushList();
        list ||= { ordered, start: ordered ? parseInt(m[1], 10) || 1 : 1, items: [] }; // "3. ..." 1'den değil 3'ten başlar
        list.items.push(m[2]);
        continue;
      }
      flushList();
      para.push(line);
    }
    flushPara();
    flushQuote();
    flushList();
  });
  return out;
}

export function firstUrl(s: string): string | null {
  const t = s.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  const m = new RegExp(URL_BODY).exec(t);
  const w = new RegExp(String.raw`(?<![\p{L}\p{N}._/@:-])` + WWW_BODY, 'u').exec(t);
  if (w && (!m || w.index < m.index)) return 'https://' + w[0];
  return m ? m[0] : null;
}
