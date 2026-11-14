// v1.48 Ana Sayfa paylaşım akışı: kısa yazılı (isteğe bağlı resimli) paylaşımlar.
// Görünürlük: herkese açık ya da yalnızca arkadaşlar. Yanıtlar ana paylaşımın görünürlüğünü alır.
import type { Attachment, ID, UserPublic } from './protocol';

export type PostVis = 'public' | 'friends';

export const POST_MAX = 500;
/** paylaşımlar arası en kısa süre (yanıtlar hariç) */
export const POST_GAP_MS = 20_000;
/** yanıtlar arası en kısa süre */
export const REPLY_GAP_MS = 4_000;
/** kişi başı günlük paylaşım + yanıt sınırı */
export const POST_DAY_LIMIT = 60;
/** bu kadar farklı kişi şikâyet edince herkese açık paylaşım akıştan kalkar */
export const REPORT_HIDE_AT = 3;
export const FEED_PAGE = 25;

/** Sunucunun desteklediği özellik adı (ready.feats) */
export const FEAT_POSTS = 'posts';

/** Sunucuda saklanan paylaşım */
export interface StoredPost {
  id: ID;
  by: ID;
  text: string;
  vis: PostVis;
  image?: Attachment;
  /** yanıtsa ana paylaşım */
  re?: ID;
  likes: ID[];
  replies: number;
  /** şikâyet edenler */
  reports?: ID[];
  /** çok şikâyet alıp gizlendi (yalnız yazan görür) */
  hidden?: boolean;
}

/** İstemciye gönderilen paylaşım (izleyiciye göre) */
export interface PostView {
  id: ID;
  author: UserPublic;
  text: string;
  vis: PostVis;
  image?: Attachment;
  re?: ID;
  likes: number;
  liked: boolean;
  replies: number;
  /** yazan bu paylaşımı görüyorsa: kaç şikâyet aldığı gizlendi mi */
  hidden?: boolean;
  /** akışta yanıtın ilk birkaçı (yalnız ana paylaşımlarda, en çok 2) */
  top?: PostView[];
}

export type FeedScope = 'all' | 'friends' | 'mine';

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam ya da reklam' },
  { id: 'hate', label: 'Nefret söylemi ya da taciz' },
  { id: 'nsfw', label: 'Uygunsuz içerik' },
  { id: 'other', label: 'Başka bir sebep' },
] as const;

/** Metni temizler: kontrol karakterleri, art arda boş satırlar */
export function cleanPostText(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, POST_MAX);
}
