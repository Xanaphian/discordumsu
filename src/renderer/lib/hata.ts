// Hata bildir (v1.50): uygulamada olan son hataları tutar, kullanıcı isterse sunucuya gönderir.
// Gönderilen bilgi kişisel veri taşımaz: kullanıcı kimliği, ad, mesaj içeriği ve dosya yolları yoktur;
// yalnız hatanın metni, kodda nerede olduğu, uygulama sürümü ve işletim sistemi gider.
import { create } from 'zustand';
import { ERR_MAX_ITEMS, ERR_MSG_MAX, ERR_STACK_MAX, FEAT_ADMIN, FEAT_REPORT, type ErrItem, type ErrReport } from '../../shared/ekler';
import { useStore, homeRequest } from './store';

/** Yolları, adresleri ve tırnak içindeki metinleri temizler (kullanıcı adı ya da içerik sızmasın). */
export function temizle(s: string, max: number) {
  return String(s || '')
    .replace(/(?:file|https?|app|wss?|blob|kovan-file):\/\/[^\s)'"]*\/([^/\s)'"?#]+)[^\s)'"]*?(:\d+:\d+)?(?=[\s)'"]|$)/g, '$1$2')
    .replace(/[A-Za-z]:\\[^\s)'":]*\\/g, '')
    .replace(/\/(?:Users|home)\/[^\s)'":]*\//g, '')
    .replace(/"[^"\n]{3,}"/g, '"…"')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '…')
    .slice(0, max);
}

const items: ErrItem[] = [];
/** n: bekleyen (gönderilmemiş) hata sayısı; ayarlar ekranı bunu izler */
export const useHata = create<{ n: number }>(() => ({ n: 0 }));

/** Bir hatayı listeye ekler (göndermez). */
export function hataKaydet(where: string, err: unknown) {
  try {
    const e = err as { message?: unknown; stack?: unknown } | undefined;
    const msg = temizle(typeof e?.message === 'string' ? e.message : String(err), ERR_MSG_MAX);
    const stack = temizle(typeof e?.stack === 'string' ? e.stack : '', ERR_STACK_MAX);
    if (!msg && !stack) return;
    // aynı hata art arda geliyorsa (ör. her çizimde) bir kez tutulur
    const same = items.find((x) => x.where === where && x.msg === msg && x.stack === stack);
    if (same) same.at = Date.now();
    else items.push({ where: where.slice(0, 40), msg, stack, at: Date.now() });
    while (items.length > ERR_MAX_ITEMS) items.shift();
    useHata.setState({ n: items.length });
  } catch {
    /* hata kaydı hiçbir zaman yeni bir hataya yol açmasın */
  }
}

export const bekleyenHatalar = () => [...items];

const homeConn = (s = useStore.getState()) => Object.values(s.conns).find((x) => x.home);
export const sunucuBildirimAliyor = () => homeConn()?.status === 'online' && !!homeConn()?.feats?.includes(FEAT_REPORT);
/** Bu kullanıcı sunucunun yöneticisi mi (gelen hata bildirimlerini görebilir) */
export const useYonetici = () => useStore((s) => !!homeConn(s)?.feats?.includes(FEAT_ADMIN));

function ortam() {
  const info = useStore.getState().info;
  const nt = /Windows NT [\d.]+|Mac OS X [\d_.]+|Linux/.exec(navigator.userAgent)?.[0] || info?.platform || '';
  return { ver: info?.version || '', os: `${nt} · Electron ${info?.electron || '?'}`.slice(0, 80) };
}

/** Gönderilecek bilginin kullanıcıya gösterilebilen düz metni */
export function raporMetni(not = '') {
  const { ver, os } = ortam();
  const head = `Xanaphian ${ver} · ${os}`;
  const body = items.map((x) => `[${x.where}] ${x.msg}\n${x.stack}`).join('\n\n');
  return [head, not.trim() && 'Not: ' + not.trim(), body].filter(Boolean).join('\n\n');
}

/** Son hataları (ve isteğe bağlı kısa notu) sunucuya gönderir. 'kopya': sunucu kabul etmiyor, rapor panoya kopyalandı. */
export async function hataBildir(not = ''): Promise<'ok' | 'kopya' | 'bos'> {
  const note = not.trim().slice(0, ERR_MSG_MAX);
  if (!items.length && !note) return 'bos';
  const list: ErrItem[] = [...items];
  if (note) list.unshift({ where: 'not', msg: note, stack: '', at: Date.now() });
  if (!sunucuBildirimAliyor()) {
    await navigator.clipboard.writeText(raporMetni(note)).catch(() => {});
    return 'kopya';
  }
  await homeRequest({ t: 'err.report', ...ortam(), items: list.slice(0, ERR_MAX_ITEMS), rid: '' });
  items.length = 0;
  useHata.setState({ n: 0 });
  return 'ok';
}

// ---------- yönetici: gelen bildirimler ----------
export async function bildirimleriGetir(): Promise<ErrReport[]> {
  const r = await homeRequest<{ data: ErrReport[] }>({ t: 'err.list', rid: '' });
  return r?.data || [];
}
export const bildirimSil = (id?: string) => homeRequest({ t: 'err.clear', id, rid: '' });

/** Pencere düzeyindeki yakalanmamış hataları da listeye alır (bir kez kurulur). */
export function hataDinle() {
  window.addEventListener('error', (e) => hataKaydet('pencere', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => hataKaydet('söz', e.reason));
}
