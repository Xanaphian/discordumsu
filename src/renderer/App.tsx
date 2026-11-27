import React, { useEffect } from 'react';
import { useStore, openModal, selectChannel, sortedChannels, selectCommunity, markRead, markCommunityRead, updateSettings, toast } from './lib/store';
import { startGlobalKeys, handleGlobalKeysLocally, applyZoom, stepZoom } from './lib/kisayollar';
import { modKey } from './lib/util';
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
import { IS_MOBILE, useMobil } from './lib/mobil';
import { MobilGeri, MobilPerde } from './components/Mobil';

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

/** Topluluk listesi sırası (sol şerit): Ana Sayfa + topluluklar */
function railList(): (string | 'home')[] {
  const st = useStore.getState();
  const ids = st.settings.railOrder.filter((id) => st.communities[id] && !st.communities[id].dm);
  for (const id of Object.keys(st.communities)) if (!ids.includes(id) && !st.communities[id].dm) ids.push(id);
  return ['home', ...ids];
}

/** Açık bir katman (menü, seçici, açılır pencere) varsa Esc onu kapatır, kanalı okundu saymaz */
const LAYERS = '.ctx-menu, .popout, .emoji-picker, .popover, .pcard, .ns-pop, .dev-menu, .cp-plus, .topic-pop, .suggest, .modal-backdrop, .edit-box';

/** Mesaj yazma kutusunun yanındaki düğmeye kısayolla basar (emoji, dosya) */
function clickIn(sel: string) {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return false;
  el.click();
  return true;
}

function useShortcuts() {
  useEffect(() => {
    startGlobalKeys();
    applyZoom(useStore.getState().settings.uiZoom);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const st = useStore.getState();
      const k = e.key.toLowerCase();
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || !!(document.activeElement as HTMLElement | null)?.isContentEditable;
      if (handleGlobalKeysLocally(e)) return;
      // role="button" olan (düğme olmayan) öğeler de Enter / Boşluk ile çalışsın
      const act = document.activeElement as HTMLElement | null;
      if ((e.key === 'Enter' || e.key === ' ') && !mod && act && act === e.target && act.getAttribute('role') === 'button' && act.tagName !== 'BUTTON') {
        e.preventDefault();
        act.click();
        return;
      }
      if (mod && k === 'k') {
        e.preventDefault();
        openModal(st.modal?.type === 'quick' ? null : { type: 'quick' });
        return;
      }
      if (mod && (e.key === '/' || e.code === 'Slash' || e.code === 'NumpadDivide')) {
        e.preventDefault();
        openModal(st.modal?.type === 'shortcuts' ? null : { type: 'shortcuts' });
        return;
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        openModal({ type: 'settings' });
        return;
      }
      // yakınlaştırma: Ctrl+= / Ctrl++ / Ctrl+- / Ctrl+0 (uygulama menüsü olmadığından burada)
      if (mod && !e.altKey && (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd' || e.key === '-' || e.code === 'NumpadSubtract' || (e.key === '0' && !e.shiftKey))) {
        e.preventDefault();
        const z = stepZoom(e.key === '0' ? 0 : e.key === '-' || e.code === 'NumpadSubtract' ? -1 : 1);
        if (z !== (st.settings.uiZoom || 100)) {
          updateSettings({ uiZoom: z });
          applyZoom(z);
        }
        // art arda basınca bildirimler üst üste yığılmasın
        useStore.setState((x) => ({ toasts: x.toasts.filter((t) => !t.text.startsWith('Yakınlaştırma')) }));
        toast(`Yakınlaştırma %${z}${z !== 100 ? ` · ${modKey}+0 ile sıfırla` : ''}`, 'info');
        return;
      }
      if (mod && e.shiftKey && k === 'm') {
        e.preventDefault();
        toggleMute();
        return;
      }
      if (mod && e.shiftKey && k === 'd') {
        e.preventDefault();
        toggleDeaf();
        return;
      }
      if (mod && e.shiftKey && k === 'n' && !st.modal && !st.confirm) {
        e.preventDefault();
        openModal({ type: 'createCommunity' });
        return;
      }
      // önceki / sonraki topluluk
      if (mod && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const list = railList();
        const at = st.communities[st.current]?.dm ? 0 : Math.max(0, list.indexOf(st.current));
        const next = list[(at + (e.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length];
        if (next) selectCommunity(next);
        return;
      }
      if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && st.current !== 'home') {
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
      // sohbet ekranındaki kısayollar (pencere açıkken çalışmaz)
      const chat = !st.modal && !st.confirm && document.querySelector('.content .chat .msg-scroller');
      if (chat && mod && !e.altKey) {
        if (k === 'f' && !e.shiftKey) {
          const box = document.querySelector<HTMLInputElement>('.content .search-box input');
          if (box) {
            e.preventDefault();
            box.focus();
            box.select();
            return;
          }
        }
        if (k === 'p' && !e.shiftKey && clickIn('.content button[aria-label="Sabitlenmiş mesajlar"]')) return e.preventDefault();
        if (k === 'u' && !e.shiftKey) {
          e.preventDefault();
          updateSettings({ membersOpen: !st.settings.membersOpen });
          return;
        }
        if (k === 'u' && e.shiftKey && clickIn('.content .composer input[type=file]')) return e.preventDefault();
        if (k === 'e' && !e.shiftKey && clickIn('.content .composer button[aria-label="Emoji"]')) return e.preventDefault();
      }
      // Page Up / Page Down: yazarken de mesajları kaydır
      if (chat && !mod && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown') && (!typing || (document.activeElement as HTMLElement)?.id === 'composer-input')) {
        e.preventDefault();
        const sc = chat as HTMLElement;
        sc.scrollBy({ top: (e.key === 'PageUp' ? -1 : 1) * sc.clientHeight * 0.85 });
        return;
      }
      // Esc: kanalı (Shift ile topluluğu) okundu say; açık bir katman, yanıt ya da düzenleme varken değil
      if (chat && e.key === 'Escape' && !mod && !e.altKey && !st.menu && !st.popout && !st.editing && !document.querySelector(LAYERS)) {
        const c = st.communities[st.current];
        const chId = c && st.chanByComm[c.id];
        const inComposer = (document.activeElement as HTMLElement | null)?.id === 'composer-input';
        if (c && chId && !st.replyTo[chId] && (!typing || inComposer)) {
          if (e.shiftKey) markCommunityRead(c.id);
          else markRead(chId);
          return;
        }
      }
      // herhangi bir yerde yazmaya başlayınca mesaj kutusuna odaklan
      if (st.settings.inputMode === 'ptt' && e.code === st.settings.pttKey && useVoice.getState().ch) return; // bas-konuş tuşu
      if (!st.modal && !st.confirm && !mod && !e.altKey && e.key.length === 1 && !typing && !(e.key === ' ' && tag === 'button')) {
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
        {membersOpen && IS_MOBILE && <MobilPerde />}
        {membersOpen && <DmProfile c={c} />}
      </>
    );
  return (
    <>
      {isVoiceLike(ch.type) ? in3d ? <SpaceView c={c} ch={ch} /> : <VoiceView c={c} ch={ch} /> : ch.type === 'site' ? <SiteView c={c} ch={ch} /> : isToolChannel(ch.type) ? <ToolView key={ch.id} c={c} ch={ch} /> : <ChatView c={c} ch={ch} />}
      {membersOpen && IS_MOBILE && !isVoiceLike(ch.type) && ch.type !== 'site' && !isToolChannel(ch.type) && <MobilPerde />}
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
  const mobPanel = useMobil((s) => s.panel);
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
        <div className={IS_MOBILE ? `shell mob-${mobPanel}` : 'shell'}>
          <HataSiniri name="topluluk listesi">
            <ServerRail />
          </HataSiniri>
          <HataSiniri name="kenar çubuğu" resetKey={String(where)}>
            <Sidebar />
          </HataSiniri>
          <div className="content">
            {IS_MOBILE && <MobilGeri />}
            <HataSiniri name="içerik" resetKey={where + ':' + (whereCh || '')}>
              <Main />
            </HataSiniri>
          </div>
        </div>
      )}
      <HataSiniri name="pencere" silent onError={close({ modal: null, confirm: null })}>
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


