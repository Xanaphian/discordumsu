// Hafif ve güvenli (innerHTML kullanmayan) mesaj biçimlendirici.
import React, { ReactNode, useState } from 'react';
import { highlight } from './highlight';
import { openInSiteRoom } from './site';

export interface MdCtx {
  userName: (id: string) => string | null;
  userColor?: (id: string) => string;
  channelName: (id: string) => string | null;
  onUser?: (id: string, e: React.MouseEvent) => void;
  onChannel?: (id: string) => void;
  meId: string;
}

type Rule = { re: RegExp; render: (m: RegExpExecArray, ctx: MdCtx, key: number) => ReactNode };

const URL_RE = /^https?:\/\/[^\s<]+[^\s<.,:;"')\]!?*_~|]/;

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={open ? 'md-spoiler open' : 'md-spoiler'} onClick={(e) => (e.stopPropagation(), setOpen(true))}>
      {children}
    </span>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="md-link"
      href={href}
      title={href}
      onClick={(e) => {
        e.preventDefault();
        if (!openInSiteRoom(href)) window.kovan.openExternal(href);
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
      <Link key={k} href={m[2]}>
        {inline(m[1], c)}
      </Link>
    ),
  },
  { re: URL_RE, render: (m, _c, k) => <Link key={k} href={m[0]}>{m[0]}</Link> },
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

const SPECIAL = /[\\`*_~|[h<@]/;

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
    let list: { ordered: boolean; items: string[] } | null = null;
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
        out.push(list.ordered ? <ol key={key++} className="md-list">{items}</ol> : <ul key={key++} className="md-list">{items}</ul>);
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
        list ||= { ordered, items: [] };
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
  const m = /https?:\/\/[^\s<>]+[^\s<.,:;"')\]!?*_~|>]/.exec(s.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, ''));
  return m ? m[0] : null;
}
