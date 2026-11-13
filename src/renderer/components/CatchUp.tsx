// "Sen yokken": çok mesaj birikmiş bir kanala dönünce ne konuşulduğunun özeti.
// Tamamen bu bilgisayarda hesaplanır (yapay zeka ya da sunucu gerekmez).
import React, { useState } from 'react';
import { Sparkles, ChevronDown, X, AtSign, Flame, Link2, ArrowUp } from 'lucide-react';
import { useStore, jumpToMessage, plainText, type CMessage } from '../lib/store';
import { Avatar } from './Common';
import { cx, displayName, hm } from '../lib/util';
import { parseCard, cardSummary, isCardReaction } from '../lib/cards';
import type { Channel, Community, ID } from '../../shared/protocol';

const STOP = new Set(
  (
    'ama ancak artık aslında aynen bana bende beni benim bence bile biraz bizim bunu bunlar burada bütün çünkü daha değil diye falan gibi geldi gelin geliyor hadi hala hâlâ hayır hemen herkes hepsi için iste işte kadar kanka keşke lazım mesela nasıl neden nerede niye olan olarak oldu olsun olur onlar onun orada sadece sana sanki sende seni senin sonra şimdi şuan şunu şeyi şeyler tabi tabii tamam valla vallahi yani yine zaten evet belki bunu şöyle böyle öyle değilmi galiba herhalde gerçekten aynı başka bazen hiçbir hiçbir şey neyse olmaz oluyor olmuş olacak yapalım yapıyor yaptım yapma yapın biliyorum bilmiyorum diyor dedi dedim istiyorum'
  ).split(/\s+/),
);

export interface CatchUpData {
  msgs: CMessage[];
  people: [ID, number][];
  topics: string[];
  mentions: CMessage[];
  hot: CMessage[];
  cards: CMessage[];
  links: number;
  files: number;
  more: boolean;
}

export function summarize(items: CMessage[], readAt: string, me: ID, c: Community, more: boolean): CatchUpData | null {
  if (!readAt) return null;
  const msgs = items.filter((m) => m.id > readAt && m.authorId !== me && !m.pending && !m.id.startsWith('~') && !m.kind);
  if (msgs.length < 12) return null;
  const by = new Map<ID, number>();
  const words = new Map<string, number>();
  const mentions: CMessage[] = [];
  const cards: CMessage[] = [];
  let links = 0;
  let files = 0;
  const myRoles = c.members.find((x) => x.userId === me)?.roles || [];
  for (const m of msgs) {
    by.set(m.authorId, (by.get(m.authorId) || 0) + 1);
    if (parseCard(m.content)) {
      cards.push(m);
      continue;
    }
    if (m.content.includes(`<@${me}>`) || /@(everyone|here)\b/.test(m.content) || myRoles.some((r) => m.content.includes(`<@&${r}>`))) mentions.push(m);
    links += (m.content.match(/https?:\/\/\S+/g) || []).length;
    files += m.attachments?.length || 0;
    const seen = new Set<string>();
    const text = m.content.replace(/https?:\/\/\S+/g, ' ').replace(/<[@#&!]*[\w-]+>/g, ' ').toLocaleLowerCase('tr');
    for (const w of text.split(/[^0-9a-zçğıöşüâîû]+/)) {
      if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w) || seen.has(w)) continue;
      seen.add(w);
      words.set(w, (words.get(w) || 0) + 1);
    }
  }
  const score = (m: CMessage) => Object.entries(m.reactions || {}).reduce((n, [e, u]) => n + (isCardReaction(e) ? 0 : u.length), 0);
  const hot = msgs
    .filter((m) => score(m) >= 2 && !parseCard(m.content))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3);
  const topics = [...words.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
  return {
    msgs,
    people: [...by.entries()].sort((a, b) => b[1] - a[1]),
    topics,
    mentions: mentions.slice(-4),
    hot,
    cards: cards.slice(-3),
    links,
    files,
    more: more && items[0]?.id > readAt,
  };
}

function Line({ m, c, onPick }: { m: CMessage; c: Community; onPick: (id: ID) => void }) {
  const users = useStore((s) => s.users);
  const text = cardSummary(m.content) || plainText(m.content, c) || (m.attachments?.length ? '📎 ' + m.attachments[0].name : '');
  return (
    <button className="cu-line" onClick={() => onPick(m.id)}>
      <Avatar user={users[m.authorId] || c.users[m.authorId]} size={20} />
      <b>{displayName(c, m.authorId, users)}</b>
      <span className="cu-text">{text}</span>
      <time>{hm(m.ts)}</time>
    </button>
  );
}

export function CatchUp({ c, ch, data }: { c: Community; ch: Channel; data: CatchUpData }) {
  const users = useStore((s) => s.users);
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const go = (id: ID) => jumpToMessage(c.id, ch.id, id);
  const names = data.people.slice(0, 2).map(([u]) => displayName(c, u, users));
  const rest = data.people.length - names.length;
  const n = data.msgs.length;
  return (
    <div className={cx('catchup', open && 'open')}>
      <div className="cu-bar">
        <Sparkles size={16} className="cu-spark" />
        <div className="cu-sum" onClick={() => setOpen(!open)}>
          <b>
            Sen yokken {data.more ? `${n}+` : n} mesaj
          </b>
          <span>
            {names.join(', ')}
            {rest > 0 ? ` ve ${rest} kişi daha` : ''} konuştu
            {data.mentions.length ? ` · ${data.mentions.length} kez senden bahsedildi` : ''}
          </span>
        </div>
        <button className="cu-btn" onClick={() => setOpen(!open)}>
          {open ? 'Özeti kapat' : 'Özeti aç'} <ChevronDown size={14} />
        </button>
        <button className="icon-btn cu-x" onClick={() => setGone(true)} aria-label="Kapat">
          <X size={16} />
        </button>
      </div>
      {open && (
        <div className="cu-body scroll-thin">
          <div className="cu-people">
            {data.people.slice(0, 8).map(([u, k]) => (
              <span key={u} className="cu-person" title={`${displayName(c, u, users)}: ${k} mesaj`}>
                <Avatar user={users[u] || c.users[u]} size={22} />
                <small>{k}</small>
              </span>
            ))}
            {!!data.topics.length && (
              <span className="cu-topics">
                {data.topics.map((t) => (
                  <i key={t}>{t}</i>
                ))}
              </span>
            )}
          </div>
          {!!data.mentions.length && (
            <section>
              <h4>
                <AtSign size={13} /> Senden bahsedenler
              </h4>
              {data.mentions.map((m) => (
                <Line key={m.id} m={m} c={c} onPick={go} />
              ))}
            </section>
          )}
          {!!data.hot.length && (
            <section>
              <h4>
                <Flame size={13} /> En çok tepki alanlar
              </h4>
              {data.hot.map((m) => (
                <Line key={m.id} m={m} c={c} onPick={go} />
              ))}
            </section>
          )}
          {!!data.cards.length && (
            <section>
              <h4>
                <Sparkles size={13} /> Takım ilanları ve anketler
              </h4>
              {data.cards.map((m) => (
                <Line key={m.id} m={m} c={c} onPick={go} />
              ))}
            </section>
          )}
          <div className="cu-foot">
            {(data.links > 0 || data.files > 0) && (
              <span>
                <Link2 size={13} /> {[data.links && `${data.links} bağlantı`, data.files && `${data.files} dosya`].filter(Boolean).join(', ')} paylaşıldı
              </span>
            )}
            <button className="btn ghost sm" onClick={() => go(data.msgs[0].id)}>
              <ArrowUp size={14} /> Kaldığın yere git
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
