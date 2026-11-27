// v1.68 telefon: geri tuşu, uzun basınca sağ tık menüsü, klavye açılınca yükseklik
import '../styles/mobil.css';
import { useStore } from '../lib/store';
import { useMobil, mobilListe } from '../lib/mobil';

// ---- Android geri tuşu: açık katmanı kapat, sonra kanal listesine dön ----
window.kovan.mobile?.onBack(() => {
  const st = useStore.getState();
  if (st.confirm) return useStore.setState({ confirm: null }), true;
  if (st.modal) return useStore.setState({ modal: null }), true;
  if (st.menu || st.popout) return useStore.setState({ menu: null, popout: null }), true;
  const layer = document.querySelector('.emoji-picker, .popover, .ns-pop, .dev-menu, .cp-plus, .topic-pop');
  if (layer) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  }
  if (st.settings.membersOpen && useMobil.getState().panel === 'icerik') {
    useStore.setState((x) => ({ settings: { ...x.settings, membersOpen: false } }));
    return true;
  }
  if (useMobil.getState().panel === 'icerik') return mobilListe(), true;
  return false;
});

// ---- uzun bas = sağ tık (mesaj, kişi, kanal menüleri) ----
// Android WebView uzun basışta her zaman `contextmenu` göndermiyor; 480 ms parmak kıpırdamadan durursa biz gönderiyoruz.
let timer: ReturnType<typeof setTimeout> | null = null;
let start: { x: number; y: number; t: EventTarget | null } | null = null;
let fired = 0;
const cancel = () => {
  if (timer) clearTimeout(timer);
  timer = null;
  start = null;
};
window.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length !== 1) return cancel();
    const t = e.touches[0];
    const el = e.target as HTMLElement | null;
    // yazı kutularında uzun basış metin seçimi/yapıştırma içindir
    if (el?.closest('input, textarea, [contenteditable="true"]')) return cancel();
    start = { x: t.clientX, y: t.clientY, t: e.target };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!start) return;
      fired = Date.now();
      (start.t as Element | null)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2 }));
      navigator.vibrate?.(12);
      start = null;
    }, 480);
  },
  { passive: true, capture: true },
);
window.addEventListener('touchmove', (e) => start && Math.hypot(e.touches[0].clientX - start.x, e.touches[0].clientY - start.y) > 10 && cancel(), { passive: true, capture: true });
window.addEventListener('touchend', (e) => {
  cancel();
  // menü açıldıktan sonra parmağı kaldırmak altındaki öğeye "tıklamasın"
  if (Date.now() - fired < 700) e.preventDefault();
}, { capture: true });
window.addEventListener('touchcancel', cancel, { capture: true });
// tarayıcının kendi uzun basış menüsü bizimkiyle üst üste gelmesin
window.addEventListener(
  'contextmenu',
  (e) => {
    if (e.isTrusted && Date.now() - fired < 1000) {
      e.preventDefault();
      e.stopImmediatePropagation();
    } else if (e.isTrusted) {
      // önce tarayıcınınki geldiyse bizimki gelmesin
      fired = Date.now();
      cancel();
    }
  },
  { capture: true },
);

// ---- ekran yüksekliği: klavye açılınca içerik klavyenin üstünde kalsın ----
const vv = window.visualViewport;
const fit = () => document.documentElement.style.setProperty('--mob-h', `${Math.round(vv ? vv.height : window.innerHeight)}px`);
vv?.addEventListener('resize', fit);
window.addEventListener('resize', fit);
fit();
