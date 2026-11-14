// v1.50 sunucu ekleri: hata bildirimleri, yükleme kotası, ses için TURN bilgisi.
// Sunucu bu özellikleri ready.feats içinde duyurur; eski sunucuda istemci kendiliğinden eski davranışa döner.
import type { ID } from './protocol';

/** Sunucu hata bildirimi kabul ediyor */
export const FEAT_REPORT = 'hata';
/** Bu kullanıcı sunucunun yöneticisi (hata bildirimlerini görebilir) */
export const FEAT_ADMIN = 'yonetici';
/** Sunucu ses için aktarma (TURN) bilgisi verebiliyor */
export const FEAT_ICE = 'ice';
/** Mesaj atılmadan açılan özel sohbet karşı tarafın listesine girmez */
export const FEAT_DM_QUIET = 'dm-sessiz';

export const ERR_MAX_ITEMS = 10;
export const ERR_MSG_MAX = 300;
export const ERR_STACK_MAX = 2500;

/** İstemcinin gönderdiği tek hata. Kişisel veri taşımaz: kullanıcı kimliği, ad, mesaj içeriği yok. */
export interface ErrItem {
  /** hangi bölüm (ör. "içerik", "pencere") */
  where: string;
  msg: string;
  stack: string;
  at: number;
}

/** Sunucuda saklanan bildirim (aynı hata tekrar gelirse sayaç artar) */
export interface ErrReport {
  id: ID;
  first: number;
  last: number;
  /** kaç kez bildirildi */
  n: number;
  ver: string;
  os: string;
  where: string;
  msg: string;
  stack: string;
}

/** Ses bağlantısı için sunucunun verdiği ICE sunucuları (süreli kimlikle) */
export interface IceInfo {
  iceServers: { urls: string[]; username?: string; credential?: string }[];
  /** saniye; bu süre dolmadan yeniden istenir */
  ttl: number;
}
