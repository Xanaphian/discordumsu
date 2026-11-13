// v1.27 oyun içi kaplama sayfası: seslidekiler ve gelen mesajlar. Tıklamalar oyuna geçer.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MicOff, HeadphoneOff, MonitorUp, MessageSquare, AtSign, Gamepad2 } from 'lucide-react';
import type { OvlMessage, OvlPayload, OvlMember } from './lib/overlay';
import './styles/kaplama.css';

const MSG_MS = 7000;

function Face({ m, size = 28 }: { m: { name: string; avatar?: string; color: string }; size?: number }) {
  return m.avatar ? (
    <img className="ovl-face" src={m.avatar} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="ovl-face ovl-face-txt" style={{ width: size, height: size, background: m.color }}>
      {(m.name || '?').trim().charAt(0).toLocaleUpperCase('tr')}
    </span>
  );
}

function Member({ m }: { m: OvlMember }) {
  return (
    <li className={'ovl-mem' + (m.speaking ? ' talk' : '')}>
      <Face m={m} />
      <span className="ovl-name">{m.name}</span>
      <span className="ovl-marks">
        {m.screen && <MonitorUp size={13} className="ovl-live" />}
        {m.deaf ? <HeadphoneOff size={13} /> : m.muted ? <MicOff size={13} /> : null}
      </span>
    </li>
  );
}

function Overlay() {
  const [st, setSt] = useState<OvlPayload | null>(null);
  const [msgs, setMsgs] = useState<(OvlMessage & { out?: boolean })[]>([]);
  useEffect(() => {
    const a = window.kovan.overlay.onState((p: OvlPayload) => {
      setSt(p);
      document.documentElement.dataset.corner = p.corner;
      document.documentElement.style.setProperty('--ovl-accent', p.accent || '#c8aa6e');
    });
    const b = window.kovan.overlay.onMessage((m: OvlMessage) => {
      setMsgs((l) => [...l.filter((x) => x.id !== m.id), m].slice(-3));
      setTimeout(() => setMsgs((l) => l.map((x) => (x.id === m.id ? { ...x, out: true } : x))), MSG_MS - 400);
      setTimeout(() => setMsgs((l) => l.filter((x) => x.id !== m.id)), MSG_MS);
    });
    return () => {
      a();
      b();
    };
  }, []);
  if (!st) return null;
  const members = st.voice ? (st.onlySpeaking ? st.voice.members.filter((m) => m.speaking) : st.voice.members) : [];
  const bottom = st.corner.startsWith('b');
  const voice = st.voice && (
    <section className="ovl-card ovl-voice">
      <header className="ovl-head">
        <span className="ovl-dot" />
        <b>{st.voice.channel}</b>
        <span className="ovl-sub">{st.voice.community}</span>
      </header>
      {members.length ? (
        <ul className="ovl-list">
          {members.slice(0, 12).map((m) => (
            <Member key={m.id} m={m} />
          ))}
          {members.length > 12 && <li className="ovl-more">+{members.length - 12} kişi daha</li>}
        </ul>
      ) : (
        <p className="ovl-quiet">Şu an kimse konuşmuyor</p>
      )}
    </section>
  );
  const toasts = (
    <div className="ovl-toasts">
      {msgs.map((m) => (
        <article key={m.id} className={'ovl-card ovl-msg' + (m.mention ? ' ment' : '') + (m.out ? ' out' : '')}>
          <Face m={{ name: m.author, avatar: m.avatar, color: m.color }} size={30} />
          <div className="ovl-msg-main">
            <div className="ovl-msg-top">
              <b>{m.author}</b>
              <span>
                {m.mention ? <AtSign size={11} /> : <MessageSquare size={11} />} {m.where}
              </span>
            </div>
            <p>{m.body}</p>
          </div>
        </article>
      ))}
    </div>
  );
  return (
    <div className={'ovl' + (bottom ? ' ovl-bottom' : '')}>
      {!st.voice && !msgs.length && st.game && (
        <div className="ovl-card ovl-pill">
          <Gamepad2 size={13} /> Xanaphian · {st.game}
        </div>
      )}
      {voice}
      {toasts}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Overlay />);
