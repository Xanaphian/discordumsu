// v1.27 oyun içi kaplama: ayarlar (bu bilgisayarda saklanır) ve kaplama penceresine giden durum.
import { create } from 'zustand';
import type { ID } from '../../shared/protocol';
import { useStore, overlayHooks } from './store';
import { useVoice } from './voice';
import { useActs } from './activity';
import { displayName } from './util';
import { pencere } from './gorunurluk';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export interface OverlaySettings {
  /** game = oyun açıkken, always = hep (yayın / deneme), off = kapalı */
  mode: 'game' | 'always' | 'off';
  corner: Corner;
  opacity: number;
  scale: number;
  voice: boolean;
  /** seslide yalnız konuşanları göster */
  onlySpeaking: boolean;
  msgs: boolean;
  /** yalnız bahsedilme ve özel mesaj */
  msgsMentions: boolean;
  /** Electron hızlandırıcı biçimi, ör. "Shift+F1" */
  shortcut: string;
}

export const OVERLAY_DEFAULTS: OverlaySettings = {
  mode: 'game',
  corner: 'tl',
  opacity: 92,
  scale: 100,
  voice: true,
  onlySpeaking: false,
  msgs: true,
  msgsMentions: false,
  shortcut: 'Shift+F1',
};

const KEY = 'xn.kaplama';
function load(): OverlaySettings {
  try {
    return { ...OVERLAY_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...OVERLAY_DEFAULTS };
  }
}

interface OvlStore {
  s: OverlaySettings;
  /** kısayolla gizlendi */
  hidden: boolean;
}
export const useOverlay = create<OvlStore>(() => ({ s: load(), hidden: false }));

export function setOverlay(patch: Partial<OverlaySettings>) {
  const s = { ...useOverlay.getState().s, ...patch };
  useOverlay.setState({ s });
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* yer yok */
  }
  if (patch.shortcut !== undefined) window.kovan.overlay?.shortcut(s.shortcut);
  push();
}

// ---------------------------------------------------------------------------
export interface OvlMember {
  id: ID;
  name: string;
  avatar?: string;
  color: string;
  speaking: boolean;
  muted: boolean;
  deaf: boolean;
  me?: boolean;
  screen?: boolean;
}
export interface OvlPayload {
  show: boolean;
  corner: Corner;
  opacity: number;
  scale: number;
  game: string | null;
  voice: { channel: string; community: string; members: OvlMember[] } | null;
  onlySpeaking: boolean;
  theme: string;
  accent: string;
  /** v1.59.1: yalnız değişen profil resimleri (null = kaldırıldı); üyelerin kendi avatar alanı gönderilmez */
  avatars?: Record<ID, string | null>;
}
export interface OvlMessage {
  id: ID;
  author: string;
  avatar?: string;
  color: string;
  where: string;
  body: string;
  mention: boolean;
  ts: number;
}

function build(): OvlPayload {
  const { s } = useOverlay.getState();
  const st = useStore.getState();
  const v = useVoice.getState();
  const game = useActs.getState().detected?.game?.name || null;
  let voice: OvlPayload['voice'] = null;
  if (s.voice && v.ch && v.cid) {
    const c = st.communities[v.cid];
    const ch = c?.channels.find((x) => x.id === v.ch);
    const list = st.voice[v.ch] || [];
    const seen = new Set<ID>();
    const members: OvlMember[] = [];
    for (const m of list) {
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      const u = (c?.users[m.userId] || st.users[m.userId]) as { name?: string; avatar?: string; color?: string } | undefined;
      const isMe = m.userId === st.me.id;
      members.push({
        id: m.userId,
        name: c ? displayName(c, m.userId, st.users) : u?.name || 'Biri',
        avatar: isMe ? st.me.avatar || undefined : u?.avatar,
        color: (isMe ? st.me.color : u?.color) || '#c8aa6e',
        speaking: !!v.speaking[m.userId],
        muted: isMe ? v.muted : m.muted,
        deaf: isMe ? v.deaf : m.deaf,
        me: isMe || undefined,
        screen: !!m.screen || undefined,
      });
    }
    voice = { channel: ch?.name || 'Ses', community: c?.dm ? 'Özel arama' : c?.name || '', members };
  }
  const show = s.mode === 'always' || (s.mode === 'game' && !!game);
  return {
    show: show && (!!voice || s.msgs),
    corner: s.corner,
    opacity: s.opacity,
    scale: s.scale,
    game,
    voice,
    onlySpeaking: s.onlySpeaking,
    theme: st.settings.theme,
    accent: st.settings.accent,
  };
}

let lastSig = '';
let timer: ReturnType<typeof setTimeout> | null = null;
/** kaplamaya gönderilmiş profil resimleri */
const sentAvatars = new Map<ID, string>();
function push() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    let p = build();
    pencere.kaplama = p.show;
    // v1.59.1: kaplama görünmüyorken sesliler gönderilmez. Önceden her konuşma değişikliğinde (saniyede birkaç kez)
    // herkesin profil resmiyle birlikte yüzlerce KB JSON'a çevrilip ana sürece yollanıyordu, kaplama kapalıyken bile.
    if (!p.show) p = { ...p, voice: null };
    // profil resimleri (kişi başı 200 KB'a kadar data URL) yalnız değişince gider; kaplama kendisi saklar
    if (p.voice) {
      let avatars: Record<ID, string | null> | undefined;
      p.voice.members = p.voice.members.map(({ avatar, ...m }) => {
        if (avatar ? sentAvatars.get(m.id) !== avatar : sentAvatars.has(m.id)) {
          (avatars ||= {})[m.id] = avatar || null;
          if (avatar) sentAvatars.set(m.id, avatar);
          else sentAvatars.delete(m.id);
        }
        return m;
      });
      if (avatars) p.avatars = avatars;
    }
    const sig = JSON.stringify(p);
    if (sig === lastSig) return;
    lastSig = sig;
    window.kovan.overlay?.state(p);
  }, 60);
}

/** Kaplamada şu an görünüyor mu (ayarlardaki önizleme rozeti için) */
export const overlayVisible = () => {
  const p = build();
  return p.show && !useOverlay.getState().hidden;
};

let started = false;
export function startOverlay() {
  if (started || !window.kovan?.overlay) return;
  started = true;
  useVoice.subscribe((a, b) => (a.speaking !== b.speaking || a.ch !== b.ch || a.muted !== b.muted || a.deaf !== b.deaf) && push());
  useStore.subscribe((a, b) => (a.voice !== b.voice || a.communities !== b.communities || a.settings.theme !== b.settings.theme) && push());
  useActs.subscribe((a, b) => a.detected?.game?.name !== b.detected?.game?.name && push());
  window.kovan.overlay.onHidden((hidden) => useOverlay.setState({ hidden }));
  window.kovan.overlay.shortcut(useOverlay.getState().s.shortcut);
  overlayHooks.onNotify = (m, c, author, body, mentioned) => {
    const { s } = useOverlay.getState();
    if (!s.msgs || (s.msgsMentions && !mentioned)) return;
    const st = useStore.getState();
    const u = st.users[m.authorId] || c?.users[m.authorId];
    const ch = c?.channels.find((x) => x.id === m.channelId);
    const msg: OvlMessage = {
      id: m.id,
      author,
      avatar: u?.avatar,
      color: u?.color || '#c8aa6e',
      where: c?.dm ? 'Özel mesaj' : `#${ch?.name || 'kanal'} · ${c?.name || ''}`,
      body: body.slice(0, 220),
      mention: mentioned,
      ts: m.ts,
    };
    window.kovan.overlay.message(msg);
  };
  push();
}
