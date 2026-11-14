// Oyuna ve dinlemeye davet (Discord'daki "#kanal kanalını X oynamaya / Spotify dinlemeye davet et").
// Davet, takım ilanı gibi mesaj içinde kart olarak taşınır (sunucu değişikliği yok); "katıldım" bir "~j" tepkisidir.
// Gönderenin uygulaması, oyunu kapatınca ya da müziği durdurunca kendi davetini "sona erdi" olarak işaretler.
import type { Community, ID, Message } from '../../shared/protocol';
import { isVoiceLike } from '../../shared/protocol';
import { useStore, toast, sendMessage, editMessage, toggleReaction } from './store';
import { useActs, startAlong } from './activity';
import { encodeCard, parseCard, JOIN_KEY, INVITE_TTL, type PlayCard, type ListenCard } from './cards';
import { accountFor } from './lfgJoin';

const gameApi = () => (window as any).kovan?.game as
  | { has?: (n: string) => Promise<boolean>; launch?: (n: string) => Promise<{ ok: boolean; error?: string }>; steamJoin?: (id: string) => Promise<boolean> }
  | undefined;

/** Şu an davet edilebilecek oyun / şarkı (bu bilgisayarda algılanan) */
export function inviteables() {
  const d = useActs.getState().detected;
  return { game: d?.game || null, media: d?.media?.playing && d.media.title ? d.media : null };
}

export function sendPlayInvite(ch: ID) {
  const g = inviteables().game;
  if (!g) return toast('Şu an açık bir oyun görünmüyor.', 'info');
  const card: PlayCard = { k: 'play', g: g.name.slice(0, 80) };
  if (g.details) card.d = g.details.slice(0, 80);
  if (g.state) card.s = g.state.slice(0, 80);
  if (g.store) card.st = g.store;
  sendMessage(ch, encodeCard(card));
}

export function sendListenInvite(ch: ID) {
  const m = inviteables().media;
  if (!m) return toast('Şu an çalan bir şarkı görünmüyor.', 'info');
  const card: ListenCard = { k: 'listen', t: m.title.slice(0, 120), p: (m.appName || 'Müzik').slice(0, 40) };
  const a = m.artist || m.album;
  if (a) card.a = a.slice(0, 120);
  if (m.src) card.src = m.src;
  sendMessage(ch, encodeCard(card));
}

export const inviteClosed = (m: { ts: number }, card: PlayCard | ListenCard) => !!card.x || Date.now() - m.ts > INVITE_TTL;

/** Davet edenin bulunduğu ses odası (bu toplulukta) */
export function authorVoice(c: Community, uid: ID) {
  const voice = useStore.getState().voice;
  return c.channels.find((x) => isVoiceLike(x.type) && (voice[x.id] || []).some((v) => v.userId === uid));
}

/** Oyuna davete katıl: işaretle, davet edenin ses odasına geç, oyunu aç (Steam'de arkadaşın oyununa katıl) */
export async function joinPlay(m: Message, card: PlayCard, c: Community, voiceNow: ID | null) {
  const me = useStore.getState().me.id;
  if (!m.reactions?.[JOIN_KEY]?.includes(me)) toggleReaction(m, JOIN_KEY);
  const done: string[] = [];
  const vc = authorVoice(c, m.authorId);
  if (vc && voiceNow !== vc.id) {
    const { joinVoice } = await import('./voice');
    joinVoice(c.id, vc.id);
    done.push(`${vc.name} odasına geçtin`);
  }
  const g = gameApi();
  const steamId = card.st === 'steam' ? accountFor(m.authorId, 'cs2') : undefined;
  if (steamId && g?.steamJoin && (await g.steamJoin(steamId).catch(() => false))) done.push("Steam'de oyununa katılıyorsun");
  else if (g?.launch && (await g.has?.(card.g).catch(() => false))) {
    const r = await g.launch(card.g).catch(() => ({ ok: false, error: 'Oyun açılamadı.' }));
    if (r.ok) done.push(`${card.g} açılıyor`);
    else toast(r.error || 'Oyun açılamadı.', 'err');
  } else if (!vc) {
    toast(`Katıldın. ${card.g} bu bilgisayarda henüz görülmedi; oyunu kendin açınca davet eden seni görür.`, 'info');
    return;
  }
  toast(done.length ? 'Katıldın: ' + done.join(', ') + '.' : 'Katıldın.', 'ok');
}

export function leaveInvite(m: Message) {
  const me = useStore.getState().me.id;
  if (m.reactions?.[JOIN_KEY]?.includes(me)) toggleReaction(m, JOIN_KEY);
}

/** Dinlemeye davete katıl: gönderen hâlâ dinliyorsa "Beraber dinle" başlar (dış uygulama açılmaz) */
export function joinListen(m: Message) {
  const s = useStore.getState();
  if (!m.reactions?.[JOIN_KEY]?.includes(s.me.id)) toggleReaction(m, JOIN_KEY);
  const live = useActs.getState().acts[m.authorId]?.find((x) => x.kind === 'listening');
  if (!live) return toast('Şarkı bitti ya da müzik durdu; şimdilik dinlenecek bir şey yok.', 'info');
  startAlong(m.authorId); // bağlı Spotify hesabında çalar ya da ne yapılacağını söyler
}

export function closeInvite(m: Message, card: PlayCard | ListenCard) {
  editMessage(m.channelId, m.id, encodeCard({ ...card, x: 1 }));
}

// ---------------------------------------------------------------------------
// Gönderen tarafı: oyunu kapatınca / müziği durdurunca kendi açık davetlerini kapat (~1 dk tolerans)
const miss = new Map<ID, number>();
function watch() {
  const s = useStore.getState();
  const me = s.me.id;
  if (!me) return;
  const { game, media } = inviteables();
  for (const ch in s.chans) {
    const items = s.chans[ch].items;
    for (let i = items.length - 1, n = 0; i >= 0 && n < 60; i--, n++) {
      const m = items[i];
      if (m.authorId !== me || m.pending) continue;
      const card = parseCard(m.content);
      if (!card || (card.k !== 'play' && card.k !== 'listen') || inviteClosed(m, card)) continue;
      const ok = card.k === 'play' ? !!game && game.name.slice(0, 80) === card.g : !!media;
      if (ok) {
        miss.delete(m.id);
        continue;
      }
      const k = (miss.get(m.id) || 0) + 1;
      miss.set(m.id, k);
      if (k >= 4) miss.delete(m.id), closeInvite(m, card);
    }
  }
}
let started = false;
export function startInvites() {
  if (started) return;
  started = true;
  setInterval(() => {
    try {
      watch();
    } catch {
      /* yok say */
    }
  }, 15_000);
}
