// Takım ilanından oyuna katılma: LoL'de kendiliğinden davet + kabul, Steam'de arkadaşın oyununa katılma,
// diğer oyunlarda oyun içi adı kopyalama. Oyun hesapları profildeki "Bağlı hesaplar"dan okunur.
import type { ID, UserPublic } from '../../shared/protocol';
import { useStore, toast, editMessage } from './store';
import { parseCard, lfgSlots, lfgClosed, encodeCard, type LfgCard } from './cards';
import { useActs } from './activity';
import { lfgGameOf } from './lfgGames';

type Svc = 'riot' | 'epic' | 'steam' | 'battlenet';
export const GAME_ACCOUNT: Record<string, { svc: Svc; label: string }> = {
  lol: { svc: 'riot', label: 'Riot ID' },
  valorant: { svc: 'riot', label: 'Riot ID' },
  fortnite: { svc: 'epic', label: 'Epic adı' },
  cs2: { svc: 'steam', label: 'Steam' },
  dota2: { svc: 'steam', label: 'Steam' },
  pubg: { svc: 'steam', label: 'Steam' },
  thefinals: { svc: 'steam', label: 'Steam' },
};
export const STEAM_JOIN = new Set(['cs2', 'dota2', 'pubg', 'thefinals']);

const userOf = (uid: ID): UserPublic | undefined => {
  const s = useStore.getState();
  if (uid === s.me.id) return { ...(s.users[uid] || {}), profile: s.me.extra } as UserPublic;
  return s.users[uid];
};

export function accountFor(uid: ID, gk?: string): string | undefined {
  const a = gk && GAME_ACCOUNT[gk];
  if (!a) return undefined;
  return userOf(uid)?.profile?.accounts?.find((x) => x.svc === a.svc)?.name;
}

const api = () => (window as any).kovan?.game as
  | {
      lolState: () => Promise<{ running: boolean; me?: string; lobby: boolean; lobbyId?: string; phase?: string }>;
      lolInvite: (r: string) => Promise<{ ok: boolean; error?: string }>;
      lolAccept: (r: string) => Promise<{ ok: boolean; error?: string }>;
      steamJoin: (id: string) => Promise<boolean>;
    }
  | undefined;

/** Katılan taraf: LoL ilanına girince ilan sahibinin davetini bekle ve kabul et */
export async function lolWaitInvite(author: ID) {
  const from = accountFor(author, 'lol');
  const g = api();
  if (!from || !g) return;
  const st = await g.lolState().catch(() => null);
  if (!st?.running) return toast('LoL istemcisi açık değil. LoL\'ü aç, sonra ilandaki "Lobiye katıl"a bas.', 'info');
  toast(`LoL'de ${from} davetini bekliyorum; gelince kendiliğinden kabul edilecek.`, 'info');
  const r = await g.lolAccept(from);
  toast(r.ok ? 'LoL lobisine katıldın.' : `Lobiye katılamadın: ${r.error}`, r.ok ? 'ok' : 'err');
}

export async function steamJoin(author: ID): Promise<void> {
  const id = accountFor(author, 'cs2');
  const g = api();
  if (!g || !id || !(await g.steamJoin(id))) toast('Steam ile katılmak için ilan sahibinin profilinde 17 haneli Steam kimliği (SteamID64) bağlı olmalı.', 'err');
}

// ---------------------------------------------------------------------------
// İlan sahibi tarafı: kendi LoL ilanlarıma yeni biri girince LoL istemcimden davet gönder.
const seen = new Map<ID, Set<ID>>();
let started = false;

function scan(items: { id: ID; authorId: ID; content: string; reactions?: Record<string, ID[]>; ts: number }[], me: ID) {
  for (let i = items.length - 1, n = 0; i >= 0 && n < 60; i--, n++) {
    const m = items[i];
    if (m.authorId !== me || Date.now() - m.ts > 6 * 3600_000) continue;
    const card = parseCard(m.content);
    if (!card || card.k !== 'lfg' || lfgGameOf(card)?.key !== 'lol') continue;
    const now = new Set(lfgSlots(m as any, card as LfgCard).filter((x): x is ID => !!x && x !== me));
    const prev = seen.get(m.id);
    seen.set(m.id, now);
    if (!prev) continue; // ilk görüş: eskileri davet etme
    for (const uid of now) if (!prev.has(uid)) invite(uid);
  }
}

async function invite(uid: ID) {
  const rid = accountFor(uid, 'lol');
  const name = userOf(uid)?.name || 'Biri';
  if (!rid) return toast(`${name} takıma girdi ama profilinde Riot hesabı bağlı değil; LoL'den elle davet et.`, 'info');
  const g = api();
  if (!g) return;
  const r = await g.lolInvite(rid);
  toast(r.ok ? `${name} (${rid}) LoL lobine davet edildi.` : `${name} davet edilemedi: ${r.error}`, r.ok ? 'ok' : 'err');
}

// ---------------------------------------------------------------------------
// Lobi dağıldı: ilan sahibinin uygulaması kendi açık ilanlarını izler. LoL'de lobi kapanır ya da başka bir lobiye
// geçilirse, Steam oyunlarında oyun kapanırsa ilan "Lobi dağıldı" diye işaretlenir ve katılım kapanır.
const PLAYING = new Set(['Matchmaking', 'ReadyCheck', 'ChampSelect', 'GameStart', 'InProgress', 'Reconnect', 'WaitingForStats', 'PreEndOfGame', 'EndOfGame']);
const miss = new Map<ID, number>();

async function watchLobbies() {
  const s = useStore.getState();
  const me = s.me.id;
  const mine: { ch: ID; m: { id: ID; ts: number }; card: LfgCard }[] = [];
  for (const ch in s.chans) {
    const items = s.chans[ch].items;
    for (let i = items.length - 1, n = 0; i >= 0 && n < 60; i--, n++) {
      const m = items[i];
      if (m.authorId !== me) continue;
      const card = parseCard(m.content);
      if (card?.k === 'lfg' && !lfgClosed(m, card)) mine.push({ ch, m, card });
    }
  }
  if (!mine.length) return;
  const playing = useActs.getState().detected?.game?.name;
  const live = playing ? lfgGameOf({ g: playing })?.key : undefined;
  let lol: Awaited<ReturnType<NonNullable<ReturnType<typeof api>>['lolState']>> | null | undefined;
  for (const x of mine) {
    const gk = lfgGameOf(x.card)?.key;
    let ok: boolean;
    if (gk === 'lol') {
      if (lol === undefined) lol = (await api()?.lolState().catch(() => null)) ?? null;
      if (!lol) continue; // istemciyle konuşulamıyor: karar verme
      ok = (lol.lobby && (!x.card.lb || lol.lobbyId === x.card.lb)) || PLAYING.has(lol.phase || '');
    } else ok = !!gk && live === gk;
    if (ok) {
      miss.delete(x.m.id);
      continue;
    }
    // kısa kopmalarda hemen kapatma: LoL'de ~20 sn, diğerlerinde ~1 dk
    const n = (miss.get(x.m.id) || 0) + 1;
    miss.set(x.m.id, n);
    if (n >= (gk === 'lol' ? 2 : 6)) {
      miss.delete(x.m.id);
      editMessage(x.ch, x.m.id, encodeCard({ ...x.card, x: 1 }));
    }
  }
}

export function startLfgJoin() {
  if (started) return;
  started = true;
  setInterval(() => void watchLobbies().catch(() => {}), 10_000);
  let prev = useStore.getState().chans;
  useStore.subscribe((s) => {
    if (s.chans === prev) return;
    const old = prev;
    prev = s.chans;
    for (const ch in s.chans) if (s.chans[ch] !== old[ch]) scan(s.chans[ch].items, s.me.id);
  });
}
