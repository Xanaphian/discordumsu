import React, { useEffect } from 'react';
import { useStore, openModal, selectChannel, sortedChannels, markRead } from './lib/store';
import { toggleMute, toggleDeaf, useVoice } from './lib/voice';
import { TitleBar } from './components/TitleBar';
import { ServerRail } from './components/ServerRail';
import { Sidebar } from './components/Sidebar';
import { ChatView, PickerHost } from './components/Chat';
import { MemberList, DmProfile } from './components/Members';
import { Modals } from './components/Modals';
import { ContextMenu, Toasts, UserPopout } from './components/Overlays';
import { CropHost } from './components/Kirpma';
import { HomeView, Onboarding } from './components/Views';
import { VoiceView, IncomingCall } from './components/Media';
import { SpaceView } from './components/SpaceView';
import { useSpace } from './lib/space';
import { SiteView } from './components/SiteView';
import { Logo } from './components/Common';
import { DESTAN_FAMILY } from './components/Appearance';
import { isVoiceLike } from '../shared/protocol';
import { PopoutApp, usePopoutReturn } from './components/AyriPencere';
import { isToolChannel } from '../shared/protocol';
import { ToolView } from './components/Tools';
import { startOverlay } from './lib/overlay';
import { ExploreView, startCommunityWatch } from './components/ToplulukAraclari';
import { HataSiniri } from './components/HataSiniri';

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  const accent = useStore((s) => s.settings.accent);
  const fontSize = useStore((s) => s.settings.fontSize);
  const compact = useStore((s) => s.settings.compact);
  const reduceMotion = useStore((s) => s.settings.reduceMotion);
  const msgStyle = useStore((s) => s.settings.msgStyle);
  const layout = useStore((s) => s.settings.layout);
  const backdrop = useStore((s) => s.settings.backdrop);
  const powerSaver = useStore((s) => s.settings.powerSaver);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.msgstyle = msgStyle || 'petek';
    r.dataset.layout = layout || 'float';
    // pil dostu modda doku da kapanır (her karede yeniden boyanan katman)
    r.classList.toggle('backdrop', backdrop !== false && !powerSaver);
    r.classList.toggle('power-saver', !!powerSaver);
  }, [msgStyle, layout, backdrop, powerSaver]);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = theme;
    r.dataset.style = DESTAN_FAMILY.includes(theme) ? 'destan' : 'kovan';
    r.style.setProperty('--accent', accent);
    r.style.setProperty('--msg-font', fontSize + 'px');
    r.classList.toggle('compact', compact);
    r.classList.toggle('reduce-motion', reduceMotion);
  }, [theme, accent, fontSize, compact, reduceMotion]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const st = useStore.getState();
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openModal(st.modal?.type === 'quick' ? null : { type: 'quick' });
        return;
      }
      if (mod && e.key === '/') {
        e.preventDefault();
        openModal(st.modal?.type === 'settings' ? null : { type: 'settings', tab: 'app' });
        return;
      }
      // Esc: açık kanalı okundu say (pencere ya da menü açık değilken, yanıt/düzenleme yokken)
      if (e.key === 'Escape' && !st.modal && !st.menu && !st.editing && st.current !== 'home' && !document.querySelector('.modal-backdrop, .suggest, .popout, .emoji-picker')) {
        const ch = st.chanByComm[st.current];
        if (ch && !st.replyTo[ch] && st.lastIds[ch] && st.lastIds[ch] > (st.read[ch] || '')) {
          markRead(ch);
        }
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        openModal({ type: 'settings' });
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleDeaf();
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && st.current !== 'home') {
        const c = st.communities[st.current];
        if (!c) return;
        e.preventDefault();
        const list = sortedChannels(c).filter((x) => !isVoiceLike(x.type));
        const cur = list.findIndex((x) => x.id === st.chanByComm[c.id]);
        const dir = e.key === 'ArrowUp' ? -1 : 1;
        if (e.shiftKey) {
          // sıradaki okunmamış kanal
          for (let i = 1; i <= list.length; i++) {
            const ch = list[(cur + dir * i + list.length * 2) % list.length];
            if (st.lastIds[ch.id] && st.lastIds[ch.id] > (st.read[ch.id] || '')) return selectChannel(c.id, ch.id);
          }
          return;
        }
        const next = list[(cur + dir + list.length) % list.length];
        if (next) selectChannel(c.id, next.id);
        return;
      }
      // herhangi bir yerde yazmaya başlayınca mesaj kutusuna odaklan
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (st.settings.inputMode === 'ptt' && e.code === st.settings.pttKey && useVoice.getState().ch) return; // bas-konuş tuşu
      if (!st.modal && !mod && !e.altKey && e.key.length === 1 && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        const ta = document.getElementById('composer-input') as HTMLTextAreaElement | null;
        ta?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Ayrı pencerenin kökü (tema ve kısayollar ana pencereyle aynı) */
export function PopoutRoot() {
  useTheme();
  return <PopoutApp />;
}

function Main() {
  const current = useStore((s) => s.current);
  const c = useStore((s) => (s.current !== 'home' ? s.communities[s.current] : undefined));
  const chId = useStore((s) => (s.current !== 'home' ? s.chanByComm[s.current] : undefined));
  const membersOpen = useStore((s) => s.settings.membersOpen);
  const in3d = useSpace((s) => !!chId && s.ch === chId && s.status !== 'idle');
  if (current === 'explore') return <ExploreView />;
  if (current === 'home' || !c) return <HomeView />;
  const ch = c.channels.find((x) => x.id === chId);
  if (!ch)
    return (
      <section className="chat empty-state">
        <div>
          <Logo size={56} />
          <h2>Burada hiç metin kanalı yok</h2>
          <p>Soldan bir kanal oluşturabilir ya da bir ses kanalına katılabilirsin.</p>
        </div>
      </section>
    );
  if (c.dm)
    return (
      <>
        <ChatView c={c} ch={ch} />
        {membersOpen && <DmProfile c={c} />}
      </>
    );
  return (
    <>
      {isVoiceLike(ch.type) ? in3d ? <SpaceView c={c} ch={ch} /> : <VoiceView c={c} ch={ch} /> : ch.type === 'site' ? <SiteView c={c} ch={ch} /> : isToolChannel(ch.type) ? <ToolView key={ch.id} c={c} ch={ch} /> : <ChatView c={c} ch={ch} />}
      {membersOpen && !isVoiceLike(ch.type) && ch.type !== 'site' && !isToolChannel(ch.type) && <MemberList c={c} />}
    </>
  );
}

export function App() {
  const booted = useStore((s) => s.booted);
  const onboarded = useStore((s) => s.onboarded);
  useTheme();
  useShortcuts();
  usePopoutReturn();
  const where = useStore((s) => s.current);
  const whereCh = useStore((s) => (s.current !== 'home' ? s.chanByComm[s.current] : ''));
  useEffect(() => {
    if (!booted) return;
    startOverlay();
    startCommunityWatch();
  }, [booted]);
  if (!booted)
    return (
      <div className="splash">
        <Logo size={72} />
      </div>
    );
  // Her bölüm kendi çökme sınırında: biri hata verirse diğerleri (ve ses bağlantısı) çalışmaya devam eder.
  const close = (patch: Partial<ReturnType<typeof useStore.getState>>) => () => useStore.setState(patch);
  return (
    <div className="app">
      <HataSiniri name="üst çubuk" silent>
        <TitleBar />
      </HataSiniri>
      {!onboarded ? (
        <Onboarding />
      ) : (
        <div className="shell">
          <HataSiniri name="topluluk listesi">
            <ServerRail />
          </HataSiniri>
          <HataSiniri name="kenar çubuğu" resetKey={String(where)}>
            <Sidebar />
          </HataSiniri>
          <div className="content">
            <HataSiniri name="içerik" resetKey={where + ':' + (whereCh || '')}>
              <Main />
            </HataSiniri>
          </div>
        </div>
      )}
      <HataSiniri name="pencere" silent onError={close({ modal: null })}>
        <Modals />
      </HataSiniri>
      <ContextMenu />
      <HataSiniri name="profil kartı" silent onError={close({ popout: null })}>
        <UserPopout />
      </HataSiniri>
      <HataSiniri name="emoji seçici" silent>
        <PickerHost />
      </HataSiniri>
      <HataSiniri name="kırpma" silent>
        <CropHost />
      </HataSiniri>
      <HataSiniri name="bildirimler" silent>
        <Toasts />
      </HataSiniri>
      <HataSiniri name="gelen arama" silent onError={close({ ringing: null })}>
        <IncomingCall />
      </HataSiniri>
    </div>
  );
}


