// v1.26 Yayıncı modu: OBS (ya da benzeri) açılınca bildirimleri, davet kodlarını ve kişisel bilgileri gizler.
// Gizleme çoğunlukla CSS ile yapılır (html.sm-invites / html.sm-personal), böylece tek tek bileşenlere dokunmak gerekmez.
import { create } from 'zustand';
import { useStore, type Settings } from './store';
import { soundGate } from './sound';
import { IS_POPOUT } from './popout';

interface StreamerState {
  /** bir yayın programı açık */
  obs: boolean;
  /** yayıncı modu şu an etkin */
  active: boolean;
}

export const useStreamer = create<StreamerState>(() => ({ obs: false, active: false }));

const S = () => useStore.getState();

function apply(st: Settings, obs: boolean) {
  const active = st.streamerMode === 'on' || (st.streamerMode === 'auto' && obs);
  const r = document.documentElement;
  r.classList.toggle('streamer', active);
  r.classList.toggle('sm-invites', active && st.streamerHideInvites);
  r.classList.toggle('sm-personal', active && st.streamerHidePersonal);
  soundGate.muted = IS_POPOUT || (active && st.streamerMuteSounds);
  if (useStreamer.getState().active !== active || useStreamer.getState().obs !== obs) useStreamer.setState({ active, obs });
  if (!IS_POPOUT) window.kovan.streamer.state({ active, hideNotifs: st.streamerHideNotifs });
}

let started = false;
function start() {
  if (started) return;
  started = true;
  window.kovan.streamer.onObs((on) => apply(S().settings, on));
  let prevMode = '';
  const sync = () => {
    const st = S().settings;
    if (st.streamerMode !== prevMode) {
      prevMode = st.streamerMode;
      window.kovan.streamer.watch(st.streamerMode === 'auto').then((on) => apply(S().settings, on));
    }
    apply(st, useStreamer.getState().obs);
  };
  sync();
  let prev = S().settings;
  useStore.subscribe((s) => {
    if (s.settings === prev) return;
    prev = s.settings;
    sync();
  });
}

if (S().booted) start();
else {
  const un = useStore.subscribe((s) => {
    if (s.booted) {
      un();
      start();
    }
  });
}

/** Yayıncı modunda gizlenecek metin: etkinse noktalarla değiştirir (CSS bulanıklığı kopyalanabilir metinlerde yetmez) */
export function useHidden(kind: 'invites' | 'personal') {
  const active = useStreamer((s) => s.active);
  const on = useStore((s) => (kind === 'invites' ? s.settings.streamerHideInvites : s.settings.streamerHidePersonal));
  return active && on;
}
