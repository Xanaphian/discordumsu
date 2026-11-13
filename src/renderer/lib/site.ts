// Site odaları: odada kimin hangi sayfaya baktığı, takip ve bağlantı yönlendirme.
import { create } from 'zustand';
import { type ID, type ServerFrame, type WebViewer, sameSite } from '../../shared/protocol';
import { useStore, connFor, selectChannel, siteHooks } from './store';

interface SiteState {
  /** kanal -> o an bakanlar */
  viewers: Record<ID, WebViewer[]>;
  /** kanal -> açılınca gidilecek adres (sohbetteki bağlantıdan) */
  pending: Record<ID, string>;
  /** kanal -> takip edilen kullanıcı */
  follow: Record<ID, ID | undefined>;
}

export const useSite = create<SiteState>(() => ({ viewers: {}, pending: {}, follow: {} }));
const set = useSite.setState;

/** kanal -> son bakılan adres (kanaldan çıkıp dönünce kaldığı yerden devam) */
export const lastUrl = new Map<ID, string>();

export function onSiteFrame(f: ServerFrame) {
  if (f.t === 'ready') {
    if (f.web) set((s) => ({ viewers: { ...s.viewers, ...f.web } }));
    return;
  }
  if (f.t !== 'web') return;
  set((s) => ({ viewers: { ...s.viewers, [f.ch]: f.viewers } }));
}

siteHooks.onFrame = onSiteFrame;

let atTimer: ReturnType<typeof setTimeout> | null = null;
let current: { ch: ID; url: string; title: string } | null = null;

/** Bu oturumun baktığı sayfayı odaya bildir (kısa gecikmeyle birleştirilir) */
export function reportAt(ch: ID, url: string, title: string) {
  lastUrl.set(ch, url);
  if (current && current.ch === ch && current.url === url && current.title === title) return;
  current = { ch, url, title };
  if (atTimer) clearTimeout(atTimer);
  atTimer = setTimeout(() => {
    atTimer = null;
    if (current) connFor(current.ch)?.send({ t: 'web.at', ch: current.ch, url: current.url, title: current.title.slice(0, 120) });
  }, 250);
}

export function leaveSite(ch: ID) {
  if (atTimer) clearTimeout(atTimer);
  atTimer = null;
  if (current?.ch === ch) current = null;
  connFor(ch)?.send({ t: 'web.leave' });
}

export function setFollow(ch: ID, uid: ID | undefined) {
  set((s) => ({ follow: { ...s.follow, [ch]: uid } }));
}

export function takePending(ch: ID): string | undefined {
  const url = useSite.getState().pending[ch];
  if (url) set((s) => ({ pending: { ...s.pending, [ch]: '' } }));
  return url || undefined;
}

/**
 * Sohbetteki bir bağlantı bir site odasının sitesine aitse onu o odada aç.
 * Önce o anki topluluğa, sonra diğer topluluklara bakar. Açtıysa true döner.
 */
export function openInSiteRoom(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const st = useStore.getState();
  const comms = Object.values(st.communities);
  const order = st.current !== 'home' ? [...comms.filter((c) => c.id === st.current), ...comms.filter((c) => c.id !== st.current)] : comms;
  for (const c of order) {
    const ch = c.channels.find((x) => x.type === 'site' && x.url && sameSite(url, x.url));
    if (!ch) continue;
    set((s) => ({ pending: { ...s.pending, [ch.id]: url }, follow: { ...s.follow, [ch.id]: undefined } }));
    selectChannel(c.id, ch.id);
    return true;
  }
  return false;
}

/** xanaphian.com için kısayollar (siteye özel; başka sitelerde gösterilmez) */
export const XANAPHIAN_LINKS: { label: string; path: string }[] = [
  { label: 'Ana sayfa (meta)', path: '/' },
  { label: 'Şampiyonlar', path: '/sampiyonlar' },
  { label: 'Şampiyon istatistikleri', path: '/sampiyonlar/istatistik' },
  { label: 'Kademe listesi', path: '/kademe' },
  { label: 'Sıralama', path: '/siralama' },
  { label: 'Ustalık sıralaması', path: '/siralama/ustalik' },
  { label: 'Yama notları', path: '/yama' },
  { label: 'Oyuncu istatistikleri', path: '/istatistik/oyuncu' },
  { label: 'Sunucu istatistikleri', path: '/istatistik/sunucu' },
  { label: 'Arena şampiyonları', path: '/arena/sampiyonlar' },
  { label: 'Arena ikilileri', path: '/arena/ikililer' },
];

const CHAMP_SLUGS =
  'aatrox ahri akali akshan alistar ambessa amumu anivia annie aphelios ashe aurelionsol aurora azir bard belveth blitzcrank brand braum briar caitlyn camille cassiopeia chogath corki darius diana drmundo draven ekko elise evelynn ezreal fiddlesticks fiora fizz galio gangplank garen gnar gragas graves gwen hecarim heimerdinger hwei illaoi irelia ivern janna jarvaniv jax jayce jhin jinx ksante kaisa kalista karma karthus kassadin katarina kayle kayn kennen khazix kindred kled kogmaw leblanc leesin leona lillia lissandra locke lucian lulu lux malphite malzahar maokai masteryi mel milio missfortune mordekaiser morgana naafiri nami nasus nautilus neeko nidalee nilah nocturne nunu olaf orianna ornn pantheon poppy pyke qiyana quinn rakan rammus reksai rell renata renekton rengar riven rumble ryze samira sejuani senna seraphine sett shaco shen shyvana singed sion sivir skarner smolder sona soraka swain sylas syndra tahmkench taliyah talon taric teemo thresh tristana trundle tryndamere twistedfate twitch udyr urgot varus vayne veigar velkoz vex vi viego viktor vladimir volibear warwick monkeyking xayah xerath xinzhao yasuo yone yorick yunara yuumi zaahen zac zed zeri ziggs zilean zoe zyra';

const SPECIAL: Record<string, string> = {
  aurelionsol: 'Aurelion Sol',
  belveth: "Bel'Veth",
  chogath: "Cho'Gath",
  drmundo: 'Dr. Mundo',
  jarvaniv: 'Jarvan IV',
  ksante: "K'Sante",
  kaisa: "Kai'Sa",
  khazix: "Kha'Zix",
  kogmaw: "Kog'Maw",
  leblanc: 'LeBlanc',
  leesin: 'Lee Sin',
  masteryi: 'Master Yi',
  missfortune: 'Miss Fortune',
  nunu: 'Nunu ve Willump',
  reksai: "Rek'Sai",
  renata: 'Renata Glasc',
  tahmkench: 'Tahm Kench',
  twistedfate: 'Twisted Fate',
  velkoz: "Vel'Koz",
  monkeyking: 'Wukong',
  xinzhao: 'Xin Zhao',
};

export const CHAMPIONS: { slug: string; name: string; key: string }[] = CHAMP_SLUGS.split(' ')
  .map((slug) => {
    const name = SPECIAL[slug] || slug[0].toUpperCase() + slug.slice(1);
    return { slug, name, key: fold(name + ' ' + slug) };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

export function fold(s: string) {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[ıi̇]/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, '');
}

export const isXanaphian = (url: string) => sameSite(url, 'https://xanaphian.com/');
