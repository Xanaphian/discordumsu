// Klavye kısayolları: liste (kısayol penceresi ve ayarlar aynı listeyi gösterir),
// tuş birleşimi kaydetme/okuma ve genel (oyun içinde de çalışan) sustur / sağırlaştır tuşları.
import { useStore } from './store';
import { useVoice, toggleMute, toggleDeaf } from './voice';
import { modKey } from './util';

export interface Kisayol {
  keys: string[]; // her öğe ayrı bir <kbd>; "/" ile ayrılanlar seçenektir
  label: string;
  /** aramada eşleşsin diye ek sözcükler */
  tags?: string;
}
export interface KisayolGrubu {
  title: string;
  items: Kisayol[];
}

export function kisayolGruplari(): KisayolGrubu[] {
  const M = modKey;
  return [
    {
      title: 'Gezinme',
      items: [
        { keys: [`${M}+K`], label: 'Hızlı geçiş: kanal, topluluk ya da kişi bul' },
        { keys: ['Alt+↑', 'Alt+↓'], label: 'Önceki / sonraki kanal' },
        { keys: ['Alt+Shift+↑', 'Alt+Shift+↓'], label: 'Önceki / sonraki okunmamış kanal' },
        { keys: [`${M}+Alt+↑`, `${M}+Alt+↓`], label: 'Önceki / sonraki topluluk', tags: 'sunucu' },
        { keys: [`${M}+F`], label: 'Bu toplulukta mesaj ara' },
        { keys: [`${M}+P`], label: 'Sabitlenmiş mesajlar' },
        { keys: [`${M}+U`], label: 'Üye listesini aç / kapat' },
        { keys: [`${M}+Shift+N`], label: 'Topluluk oluştur' },
      ],
    },
    {
      title: 'Mesajlar',
      items: [
        { keys: ['Esc'], label: 'Kanalı okundu say', tags: 'okunmamış' },
        { keys: ['Shift+Esc'], label: 'Topluluğun tamamını okundu say' },
        { keys: ['↑'], label: 'Boş kutudayken son mesajını düzenle' },
        { keys: ['Shift+Enter'], label: 'Yeni satır' },
        { keys: [`${M}+B`, `${M}+I`], label: 'Kalın / eğik yazı' },
        { keys: [`${M}+E`], label: 'Emoji, GIF ve çıkartma seçici' },
        { keys: [`${M}+Shift+U`], label: 'Dosya yükle' },
        { keys: ['Page Up', 'Page Down'], label: 'Mesajlarda yukarı / aşağı kaydır' },
        { keys: ['Esc'], label: 'Yanıtı ya da düzenlemeyi iptal et' },
        { keys: ['/'], label: 'Kutunun başında komutlar: /shrug, /me, /spoiler…', tags: 'komut' },
      ],
    },
    {
      title: 'Ses',
      items: [
        { keys: [`${M}+Shift+M`], label: 'Mikrofonu aç / kapat', tags: 'sustur mikrofon ses' },
        { keys: [`${M}+Shift+D`], label: 'Sağırlaştır', tags: 'kulaklık ses' },
      ],
    },
    {
      title: 'Pencere',
      items: [
        { keys: [`${M}+/`], label: 'Bu kısayol listesi' },
        { keys: [`${M}+,`], label: 'Ayarlar' },
        { keys: [`${M}++`, `${M}+-`], label: 'Yakınlaştır / uzaklaştır', tags: 'zoom büyüt küçült yazı boyutu' },
        { keys: [`${M}+0`], label: 'Yakınlaştırmayı sıfırla' },
        { keys: ['Tab', 'Shift+Tab'], label: 'Düğmeler arasında gezin' },
        { keys: ['↑', '↓'], label: 'Açık menüde gezin, Enter ile seç' },
        { keys: ['Esc'], label: 'Pencereyi ya da menüyü kapat' },
        { keys: ['←', '→'], label: 'Resim açıkken önceki / sonraki resim', tags: 'görüntüleyici' },
        { keys: ['+', '−', '0'], label: 'Resim açıkken yakınlaştır / uzaklaştır / sığdır', tags: 'görüntüleyici zoom' },
      ],
    },
  ];
}

// ---------- tuş birleşimi: "Ctrl+Shift+KeyM" biçiminde saklanır ----------
const MOD_CODES = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

/** Basılan tuştan birleşim üretir; yalnız değiştirici tuşa basıldıysa null */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (MOD_CODES.has(e.code) || !e.code) return null;
  const p: string[] = [];
  if (e.ctrlKey) p.push('Ctrl');
  if (e.altKey) p.push('Alt');
  if (e.shiftKey) p.push('Shift');
  if (e.metaKey) p.push('Meta');
  p.push(e.code);
  return p.join('+');
}

export function comboMatches(e: KeyboardEvent, combo: string): boolean {
  if (!combo) return false;
  return comboFromEvent(e) === combo;
}

/** "Ctrl+Shift+KeyM" → "Ctrl+Shift+M" */
export function comboLabel(combo: string): string {
  if (!combo) return 'Atanmadı';
  return combo
    .split('+')
    .map((k) =>
      k
        .replace(/^Key/, '')
        .replace(/^Digit/, '')
        .replace(/^Numpad/, 'Num ')
        .replace(/^Arrow(Up|Down|Left|Right)$/, (_, d: string) => ({ Up: '↑', Down: '↓', Left: '←', Right: '→' })[d] || d)
        .replace(/^Space$/, 'Boşluk')
        .replace(/^Backquote$/, '"')
        .replace(/^Meta$/, modKey === '⌘' ? '⌘' : 'Win'),
    )
    .join('+');
}

// ---------- genel sustur / sağırlaştır ----------
// Bir ses odasındayken genel klavye kancası (uiohook) çalışır: oyun öndeyken de tuş yakalanır.
// Kanca yoksa ya da sesteyken değilsek tuşlar yalnız pencere odaktayken çalışır (aşağıdaki yerel yedek).
let globalOn = false;

async function syncGlobalKeys() {
  const st = useStore.getState().settings;
  const binds = { mute: st.globalMuteKey || '', deaf: st.globalDeafKey || '' };
  const active = !!useVoice.getState().ch && !!(binds.mute || binds.deaf);
  try {
    globalOn = (await window.kovan.keys.configure({ enabled: active, ...binds })) && active;
  } catch {
    globalOn = false;
  }
}

let started = false;
export function startGlobalKeys() {
  if (started) return;
  started = true;
  window.kovan.keys.onPress((action) => {
    if (!globalOn) return;
    // değiştiricisiz bir tuş (ör. M) atandıysa uygulamada yazı yazarken susturmasın
    const st = useStore.getState().settings;
    if (document.hasFocus() && typingNow() && plainKey(action === 'mute' ? st.globalMuteKey : st.globalDeafKey)) return;
    if (action === 'mute') toggleMute();
    else if (action === 'deaf') toggleDeaf();
  });
  useVoice.subscribe((s, p) => s.ch !== p.ch && syncGlobalKeys());
  useStore.subscribe((s, p) => (s.settings.globalMuteKey !== p.settings.globalMuteKey || s.settings.globalDeafKey !== p.settings.globalDeafKey) && syncGlobalKeys());
  syncGlobalKeys();
}

function typingNow() {
  const el = document.activeElement as HTMLElement | null;
  const tag = (el?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
}
/** Ctrl/Alt/Win olmadan, F tuşu da değilse yazı yazarken karışır */
function plainKey(combo: string) {
  return !!combo && !/(^|\+)(Ctrl|Alt|Meta)\+/.test(combo) && !/(^|\+)F\d+$/.test(combo);
}

/** Pencere odaktayken atanmış genel tuşa basıldıysa (kanca çalışmıyorsa) işler; işlediyse true */
export function handleGlobalKeysLocally(e: KeyboardEvent): boolean {
  const st = useStore.getState().settings;
  const mute = comboMatches(e, st.globalMuteKey);
  const deaf = !mute && comboMatches(e, st.globalDeafKey);
  if (!mute && !deaf) return false;
  if (typingNow() && plainKey(mute ? st.globalMuteKey : st.globalDeafKey)) return false;
  e.preventDefault();
  if (e.repeat) return true;
  // kanca çalışıyorsa tuşu o yakaladı; ikinci kez çevirmeyelim
  if (globalOn) return true;
  if (mute) toggleMute();
  else toggleDeaf();
  return true;
}

// ---------- yakınlaştırma ----------
const ZOOM_STEPS = [67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
export function applyZoom(pct: number) {
  try {
    window.kovan.zoom.set((pct || 100) / 100);
  } catch {
    /* eski önyükleme */
  }
}
export function stepZoom(dir: 1 | -1 | 0): number {
  const cur = useStore.getState().settings.uiZoom || 100;
  if (dir === 0) return 100;
  const i = ZOOM_STEPS.findIndex((z) => z >= cur);
  const at = i < 0 ? ZOOM_STEPS.length - 1 : ZOOM_STEPS[i] === cur ? i : dir > 0 ? i - 1 : i;
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, at + dir))];
}
