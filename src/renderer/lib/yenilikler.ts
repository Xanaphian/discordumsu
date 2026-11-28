// Ana Sayfa > Son eklenenler: sürüm kayıtları.
// Kaynak depodaki release-notes/<sürüm>.md dosyaları (GitHub Releases notlarıyla aynı dosya) ve
// release-notes/gorseller/<sürüm>/*.webp ekran görüntüleri. Yeni sürüm eklemek için yalnızca bu iki
// yere dosya koymak yeterli; ayrıntı release-notes/README.md'de.
// Dosyanın başındaki gizli yorumlar (GitHub'da görünmez):
//   <!-- tarih: 2026-11-14 -->
//   <!-- baslik: Kısa başlık -->            (isteğe bağlı; yoksa "## Naphian 1.2.3: başlık" satırından alınır)
//   <!-- gorsel: 1-dosya.webp | Açıklama --> (isteğe bağlı açıklama; klasördeki her görsel yine gösterilir)

const notes = import.meta.glob('../../../release-notes/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const images = import.meta.glob('../../../release-notes/gorseller/*/*.{webp,png,jpg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type Gorsel = { src: string; caption: string };
export type Blok =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: { text: string; sub: string[] }[] };
export type Kayit = {
  version: string;
  major: number;
  minor: number;
  patch: number;
  date: string; // YYYY-AA-GG, bilinmiyorsa ''
  title: string;
  blocks: Blok[];
  images: Gorsel[];
  text: string; // arama için düz metin
};

export function cmpVersion(a: string, b: string) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

const pretty = (file: string) => {
  const s = file.replace(/\.[a-z]+$/i, '').replace(/^\d+[a-z]?-/, '').replace(/[-_]+/g, ' ').trim();
  return s ? s[0].toLocaleUpperCase('tr') + s.slice(1) : '';
};
const stripEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();

function parse(version: string, raw: string): Kayit {
  const meta: Record<string, string> = {};
  const captions: Record<string, string> = {};
  const order: string[] = [];
  const body = raw.replace(/<!--\s*([a-zçğıöşü]+)\s*:\s*([\s\S]*?)\s*-->\n?/gi, (_, k: string, v: string) => {
    const key = k.toLowerCase();
    if (key === 'gorsel') {
      const [f, c] = v.split('|').map((s) => s.trim());
      if (f) {
        order.push(f);
        if (c) captions[f] = c;
      }
    } else meta[key] = v.trim();
    return '';
  });

  let title = meta.baslik || '';
  const blocks: Blok[] = [];
  let list: Extract<Blok, { t: 'ul' }> | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', text: para.join(' ') });
    para = [];
  };
  for (const line of body.split(/\r?\n/)) {
    const ln = line.trimEnd();
    const h = /^#{1,4}\s+(.*)$/.exec(ln);
    if (h) {
      flushPara();
      list = null;
      const m = /^(?:Kovan|Xanaphian|Naphian)\s+v?\d+(?:\.\d+){0,2}\s*[:\-–]?\s*(.*)$/i.exec(h[1].trim());
      if (m) {
        if (!title && m[1]) title = stripEmoji(m[1]);
      } else if (!/^Yenilikler$/i.test(h[1].trim())) blocks.push({ t: 'h', text: stripEmoji(h[1]) });
      continue;
    }
    const sub = /^\s{2,}[-*]\s+(.*)$/.exec(ln);
    if (sub && list) {
      list.items[list.items.length - 1].sub.push(sub[1]);
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(ln);
    if (li) {
      flushPara();
      if (!list) blocks.push((list = { t: 'ul', items: [] }));
      list.items.push({ text: li[1], sub: [] });
      continue;
    }
    if (!ln.trim()) {
      flushPara();
      list = null;
      continue;
    }
    // yalnız kalın yazılmış satır bölüm başlığı gibi davranır
    const bold = /^\*\*([^*]+)\*\*:?$/.exec(ln.trim());
    if (bold) {
      flushPara();
      list = null;
      blocks.push({ t: 'h', text: bold[1] });
      continue;
    }
    if (list) {
      // listeden sonra boşluksuz gelen satır son maddenin devamıdır
      list.items[list.items.length - 1].text += ' ' + ln.trim();
      continue;
    }
    para.push(ln.trim());
  }
  flushPara();
  // başlıkla aynı olan ilk paragraf tekrar etmesin
  if (blocks[0]?.t === 'p' && title && blocks[0].text.replace(/\.$/, '') === title) blocks.shift();

  const prefix = `/gorseller/${version}/`;
  const files = Object.keys(images)
    .filter((k) => k.includes(prefix))
    .map((k) => k.slice(k.lastIndexOf('/') + 1))
    .sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      return a.localeCompare(b, 'tr', { numeric: true });
    });
  const imgs = files.map((f) => ({ src: images[Object.keys(images).find((k) => k.endsWith(prefix + f))!], caption: captions[f] || pretty(f) }));

  const [major, minor, patch] = version.split('.').map(Number);
  if (!title) {
    const first = blocks.find((b) => b.t === 'ul') as Extract<Blok, { t: 'ul' }> | undefined;
    const bolded = first && /\*\*([^*]+)\*\*/.exec(first.items[0]?.text || '');
    title = bolded ? bolded[1].replace(/[.:]$/, '') : `Sürüm ${version}`;
  }
  const text = [title, ...blocks.map((b) => (b.t === 'ul' ? b.items.map((i) => [i.text, ...i.sub].join(' ')).join(' ') : b.text)), ...imgs.map((i) => i.caption)]
    .join(' ')
    .replace(/[*`]/g, '')
    .toLocaleLowerCase('tr');
  return { version, major, minor, patch, date: /^\d{4}-\d{2}-\d{2}$/.test(meta.tarih || '') ? meta.tarih : __BUILD_DATE__, title, blocks, images: imgs, text };
}

let cache: Kayit[] | null = null;
/** En yeniden eskiye bütün sürüm kayıtları. */
export function kayitlar(): Kayit[] {
  if (cache) return cache;
  const out: Kayit[] = [];
  for (const [path, raw] of Object.entries(notes)) {
    const v = path.slice(path.lastIndexOf('/') + 1, -3);
    if (!/^\d+\.\d+\.\d+$/.test(v)) continue;
    out.push(parse(v, raw));
  }
  return (cache = out.sort((a, b) => cmpVersion(b.version, a.version)));
}

export type Grup = { key: string; main: Kayit; patches: Kayit[] };
/** Yama sürümleri (1.47.1, 1.47.2…) ana sürümün (1.47.0) altında toplanır. */
export function gruplar(list: Kayit[]): Grup[] {
  const m = new Map<string, Grup>();
  for (const k of list) {
    const key = `${k.major}.${k.minor}`;
    const g = m.get(key);
    if (!g) m.set(key, { key, main: k, patches: [] });
    else if (k.patch === 0) {
      g.patches.push(g.main);
      g.main = k;
    } else g.patches.push(k);
  }
  for (const g of m.values()) g.patches.sort((a, b) => cmpVersion(b.version, a.version));
  return [...m.values()];
}

const SEEN = 'xn.sonEklenenGoruldu';
export function sonGorulen(): string {
  try {
    return localStorage.getItem(SEEN) || '';
  } catch {
    return '';
  }
}
export function gorulduIsaretle(v: string) {
  try {
    localStorage.setItem(SEEN, v);
  } catch {
    /* yok say */
  }
}

/** Sidebar'daki nokta: son görülenden yeni bir sürüm kaydı var mı? */
export function yeniKayitVar() {
  const top = kayitlar()[0];
  if (!top) return false;
  const seen = sonGorulen();
  return !seen || cmpVersion(top.version, seen) > 0;
}

