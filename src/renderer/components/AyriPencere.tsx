// v1.26 Ayrı pencere: bir kanal ya da özel mesaj kendi küçük penceresinde açılır.
// Ayrı pencere kendi bağlantısını kurar, yalnız o sohbeti gösterir; bildirim, ses ve etkinlik ana pencerede kalır.
import React, { useEffect } from 'react';
import { AppWindow, PanelTopClose } from 'lucide-react';
import { useStore, selectChannel, selectCommunity } from '../lib/store';
import { IS_POPOUT, POPOUT } from '../lib/popout';
import { ChatView, PickerHost } from './Chat';
import { Modals } from './Modals';
import { ContextMenu, Toasts, UserPopout } from './Overlays';
import { Logo, Tooltip, Avatar } from './Common';
import type { Channel, Community } from '../../shared/protocol';

export function popoutTitle(c: Community, ch: Channel) {
  if (c.dm) return `@${useStore.getState().users[c.dm]?.name || c.name} · Xanaphian`;
  return `#${ch.name} · ${c.name}`;
}

export function openPopout(c: Community, ch: Channel) {
  window.kovan.popout.open({ cid: c.id, ch: ch.id, title: popoutTitle(c, ch) });
}

/** Sohbet başlığındaki düğme: ana pencerede "ayrı pencerede aç", ayrı pencerede "ana pencereye dön" */
export function PopoutButton({ c, ch }: { c: Community; ch: Channel }) {
  if (IS_POPOUT)
    return (
      <Tooltip text="Ana pencerede aç" side="bottom">
        <button className="icon-btn" onClick={() => window.kovan.popout.toMain({ cid: c.id, ch: ch.id })} aria-label="Ana pencerede aç">
          <PanelTopClose size={19} />
        </button>
      </Tooltip>
    );
  return (
    <Tooltip text="Ayrı pencerede aç" side="bottom">
      <button className="icon-btn" onClick={() => openPopout(c, ch)} aria-label="Ayrı pencerede aç">
        <AppWindow size={19} />
      </button>
    </Tooltip>
  );
}

/** Ana pencere: ayrı pencereden "ana pencerede aç" denince o sohbete geç */
export function usePopoutReturn() {
  useEffect(() => {
    const off = window.kovan.popout.onGo(({ cid, ch }) => {
      const c = useStore.getState().communities[cid];
      if (!c) return;
      if (c.dm) selectCommunity(cid);
      else selectChannel(cid, ch);
    });
    return () => void off();
  }, []);
}

/** Ayrı pencerenin tamamı: ince bir üst çubuk ve sohbet */
export function PopoutApp() {
  const booted = useStore((s) => s.booted);
  const c = useStore((s) => (POPOUT ? s.communities[POPOUT.cid] : undefined));
  const ch = c?.channels.find((x) => x.id === POPOUT?.ch) || (c?.dm ? c.channels[0] : undefined);
  const peer = useStore((s) => (c?.dm ? s.users[c.dm] || c.users[c.dm] : undefined));
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    document.documentElement.classList.add('ayri-pencere');
  }, []);
  useEffect(() => {
    window.kovan.popout.theme(theme);
  }, [theme]);
  // açılınca bu sohbeti seç (okundu bilgisi ve geçmiş yükleme için)
  useEffect(() => {
    if (!c || !ch) return;
    const st = useStore.getState();
    if (c.dm) {
      if (st.current !== c.id) selectCommunity(c.id);
    } else if (st.current !== c.id || st.chanByComm[c.id] !== ch.id) selectChannel(c.id, ch.id);
    document.title = popoutTitle(c, ch);
  }, [c?.id, ch?.id]); // eslint-disable-line
  return (
    <div className="app popout-app">
      <header className="titlebar popout-bar">
        <div className="tb-brand">
          {c?.dm ? <Avatar user={peer} size={20} plain /> : <Logo size={20} />}
          <span>{c && ch ? (c.dm ? peer?.name || c.name : `#${ch.name}`) : 'Xanaphian'}</span>
          {c && !c.dm && <small>{c.name}</small>}
        </div>
        <div className="tb-drag" />
      </header>
      <div className="popout-body">
        {!booted || !c || !ch ? (
          <div className="splash">
            <Logo size={48} />
          </div>
        ) : (
          <ChatView c={c} ch={ch} />
        )}
      </div>
      <Modals />
      <ContextMenu />
      <UserPopout />
      <PickerHost />
      <Toasts />
    </div>
  );
}
