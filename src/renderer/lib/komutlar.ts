// Eğik çizgi komutları: mesaj kutusunda "/" ile başlayan kısa yollar. Hepsi bu bilgisayarda
// çözülür; sunucuya düz mesaj gider.

export interface Komut {
  ad: string;
  /** komuttan sonra yazı bekliyorsa ipucu */
  arg?: string;
  aciklama: string;
  /** mesaja dönüştürür; null dönerse gönderilmez (ör. yazı eksik) */
  uygula: (yazi: string) => string | null;
}

const ek = (yazi: string, son: string) => (yazi ? yazi + ' ' + son : son);

export const KOMUTLAR: Komut[] = [
  { ad: 'shrug', arg: 'mesaj', aciklama: 'Mesajın sonuna ¯\\_(ツ)_/¯ ekler', uygula: (t) => ek(t, '¯\\\\\\_(ツ)\\_/¯') },
  { ad: 'tableflip', arg: 'mesaj', aciklama: 'Mesajın sonuna (╯°□°)╯︵ ┻━┻ ekler', uygula: (t) => ek(t, '(╯°□°)╯︵ ┻━┻') },
  { ad: 'unflip', arg: 'mesaj', aciklama: 'Mesajın sonuna ┬─┬ノ( º _ ºノ) ekler', uygula: (t) => ek(t, '┬─┬ノ( º \\_ ºノ)') },
  { ad: 'lenny', arg: 'mesaj', aciklama: 'Mesajın sonuna ( ͡° ͜ʖ ͡°) ekler', uygula: (t) => ek(t, '( ͡° ͜ʖ ͡°)') },
  { ad: 'me', arg: 'mesaj', aciklama: 'Mesajı eğik yazıyla gönderir', uygula: (t) => (t ? `*${t.replace(/\*/g, '\\*')}*` : null) },
  { ad: 'spoiler', arg: 'mesaj', aciklama: 'Mesajı tıklayınca açılan gizli yazı yapar', uygula: (t) => (t ? `||${t}||` : null) },
  { ad: 'kod', arg: 'kod', aciklama: 'Yazıyı kod bloğu olarak gönderir', uygula: (t) => (t ? '```\n' + t + '\n```' : null) },
];

const RE = /^\/([a-zçğıöşü]+)(?:\s+([\s\S]*))?$/;

/** Yazı bir komutla başlıyorsa dönüştürür. Komut değilse `undefined`, yazı eksikse `null`. */
export function komutUygula(text: string): string | null | undefined {
  const m = RE.exec(text);
  if (!m) return undefined;
  const k = KOMUTLAR.find((x) => x.ad === m[1]);
  if (!k) return undefined;
  return k.uygula((m[2] || '').trim());
}

/** "/sh" gibi yarım yazılmış komut için öneriler (yalnızca kutunun başında). */
export function komutOner(before: string): Komut[] | null {
  const m = /^\/([a-zçğıöşü]*)$/.exec(before);
  if (!m) return null;
  const list = KOMUTLAR.filter((k) => k.ad.startsWith(m[1]));
  return list.length ? list : null;
}
