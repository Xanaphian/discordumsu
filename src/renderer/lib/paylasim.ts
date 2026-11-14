// v1.48 Ana Sayfa paylaşım akışı (istemci): akış önbelleği, canlı güncellemeler, paylaşım/yanıt/beğeni.
// Paylaşımlar merkezi sunucuda (ana bağlantı) tutulur. Eski sunucu 'posts' özelliğini bildirmez;
// o durumda arayüz "sunucunun güncellenmesi gerekiyor" der ve istek göndermez.
import { create } from 'zustand';
import type { Attachment, ID, ServerFrame } from '../../shared/protocol';
import { FEAT_POSTS, type FeedScope, type PostView, type PostVis } from '../../shared/paylasim';
import { useStore, homeHost, homeRequest, postHooks, sendHost, toast } from './store';
import { httpBase } from './net';
import { imageSize } from './util';

type Scope = Exclude<FeedScope, 'mine'>;

interface FeedState {
  items: PostView[];
  more: boolean;
  loading: boolean;
  loaded: boolean;
  error?: string;
}

interface ThreadState {
  items: PostView[];
  loading: boolean;
}

interface PostsState {
  feeds: Record<Scope, FeedState>;
  /** id -> en güncel görünüm (beğeni/yanıt sayıları buradan okunur) */
  byId: Record<ID, PostView>;
  threads: Record<ID, ThreadState>;
  /** şikâyet edip kendi akışından kaldırdıkları */
  gone: Record<ID, 1>;
}

const emptyFeed = (): FeedState => ({ items: [], more: false, loading: false, loaded: false });

export const usePosts = create<PostsState>(() => ({
  feeds: { all: emptyFeed(), friends: emptyFeed() },
  byId: {},
  threads: {},
  gone: {},
}));

const P = () => usePosts.getState();

/** Ana sunucu durumu: çevrimdışı, eski (paylaşım desteklemiyor) ya da hazır */
export type PostSupport = 'offline' | 'old' | 'ok';

export function usePostSupport(): PostSupport {
  return useStore((s) => {
    const home = Object.values(s.conns).find((x) => x.home);
    if (!home || home.status !== 'online') return 'offline';
    return home.feats?.includes(FEAT_POSTS) ? 'ok' : 'old';
  });
}

export const homeFileBase = () => httpBase(homeHost());

function remember(list: PostView[]) {
  if (!list.length) return;
  usePosts.setState((s) => {
    const byId = { ...s.byId };
    for (const p of list) byId[p.id] = p;
    return { byId };
  });
}

function setFeed(scope: Scope, patch: Partial<FeedState>) {
  usePosts.setState((s) => ({ feeds: { ...s.feeds, [scope]: { ...s.feeds[scope], ...patch } } }));
}

export async function loadFeed(scope: Scope, more = false) {
  const f = P().feeds[scope];
  if (f.loading) return;
  const before = more ? f.items[f.items.length - 1]?.id : undefined;
  setFeed(scope, { loading: true, error: undefined });
  try {
    const r = await homeRequest<{ data: { posts: PostView[]; more: boolean } }>({ t: 'post.feed', scope, before, rid: '' });
    const list = Array.isArray(r.data?.posts) ? r.data.posts : [];
    remember(list);
    const cur = P().feeds[scope];
    const items = more ? [...cur.items, ...list.filter((p) => !cur.items.some((x) => x.id === p.id))] : list;
    setFeed(scope, { items, more: !!r.data?.more, loading: false, loaded: true });
  } catch (e) {
    setFeed(scope, { loading: false, loaded: true, error: (e as Error).message });
  }
}

export async function loadThread(id: ID) {
  usePosts.setState((s) => ({ threads: { ...s.threads, [id]: { items: s.threads[id]?.items || [], loading: true } } }));
  try {
    const r = await homeRequest<{ data: { post: PostView; replies: PostView[] } }>({ t: 'post.thread', id, rid: '' });
    remember([r.data.post, ...r.data.replies]);
    usePosts.setState((s) => ({ threads: { ...s.threads, [id]: { items: r.data.replies, loading: false } } }));
  } catch (e) {
    usePosts.setState((s) => ({ threads: { ...s.threads, [id]: { items: s.threads[id]?.items || [], loading: false } } }));
    toast((e as Error).message, 'err');
  }
}

/** Ana sunucuya resim yükler (paylaşım resmi) */
async function uploadHome(file: File): Promise<Attachment> {
  const s = useStore.getState();
  const headers: Record<string, string> = {
    'content-type': file.type || 'application/octet-stream',
    'x-kovan-user': s.me.id,
    'x-kovan-secret': s.secret,
    'x-kovan-name': encodeURIComponent(file.name || 'resim'),
  };
  const sz = await imageSize(file);
  if (sz) {
    headers['x-kovan-w'] = String(sz.w);
    headers['x-kovan-h'] = String(sz.h);
  }
  const r = await fetch(`${homeFileBase()}/upload`, { method: 'POST', headers, body: file });
  if (r.status === 413) throw new Error('Resim çok büyük.');
  if (!r.ok) throw new Error('Resim yüklenemedi (' + r.status + ')');
  return r.json();
}

export const POST_IMAGE_MAX = 8 * 1024 * 1024;

export async function createPost(text: string, vis: PostVis, file?: File | null, re?: ID): Promise<boolean> {
  try {
    const image = file ? await uploadHome(file) : undefined;
    const r = await homeRequest<{ data: PostView }>({ t: 'post.create', text, vis, image, re, rid: '' });
    addPost(r.data);
    return true;
  } catch (e) {
    toast((e as Error).message, 'err');
    return false;
  }
}

function friendOf(uid: ID) {
  const s = useStore.getState();
  return uid === s.me.id || s.friends[uid]?.state === 'ok';
}

/** yeni paylaşım ya da yanıt (kendi gönderdiğimiz ya da canlı gelen) */
function addPost(p: PostView) {
  remember([p]);
  usePosts.setState((s) => {
    if (p.re) {
      const t = s.threads[p.re];
      if (!t || t.items.some((x) => x.id === p.id)) return {};
      return { threads: { ...s.threads, [p.re]: { ...t, items: [...t.items, p] } } };
    }
    const feeds = { ...s.feeds };
    for (const k of ['all', 'friends'] as Scope[]) {
      const f = feeds[k];
      if (!f.loaded || f.items.some((x) => x.id === p.id)) continue;
      if (k === 'friends' && !friendOf(p.author.id)) continue;
      feeds[k] = { ...f, items: [p, ...f.items] };
    }
    return { feeds };
  });
}

function dropPost(id: ID) {
  usePosts.setState((s) => {
    const feeds = { ...s.feeds };
    for (const k of ['all', 'friends'] as Scope[]) {
      if (feeds[k].items.some((x) => x.id === id)) feeds[k] = { ...feeds[k], items: feeds[k].items.filter((x) => x.id !== id) };
    }
    const threads: Record<ID, ThreadState> = {};
    for (const [k, t] of Object.entries(s.threads)) if (k !== id) threads[k] = t.items.some((x) => x.id === id) ? { ...t, items: t.items.filter((x) => x.id !== id) } : t;
    const byId = { ...s.byId };
    delete byId[id];
    return { feeds, threads, byId };
  });
}

function patchPost(id: ID, patch: Partial<PostView>) {
  usePosts.setState((s) => {
    const cur = s.byId[id];
    if (!cur) return {};
    return { byId: { ...s.byId, [id]: { ...cur, ...patch } } };
  });
}

export function likePost(p: PostView, on: boolean) {
  const cur = P().byId[p.id] || p;
  if (cur.liked === on) return;
  patchPost(p.id, { liked: on, likes: Math.max(0, cur.likes + (on ? 1 : -1)) });
  sendHost(homeHost(), { t: 'post.like', id: p.id, on });
}

export async function deletePost(p: PostView) {
  try {
    await homeRequest({ t: 'post.del', id: p.id, rid: '' });
    dropPost(p.id);
    toast('Paylaşım silindi.', 'ok');
  } catch (e) {
    toast((e as Error).message, 'err');
  }
}

export async function reportPost(p: PostView, reason: string) {
  try {
    await homeRequest({ t: 'post.report', id: p.id, reason, rid: '' });
    usePosts.setState((s) => ({ gone: { ...s.gone, [p.id]: 1 } }));
    dropPost(p.id);
    toast('Şikâyetin alındı. Bu paylaşımı artık görmeyeceksin.', 'ok');
  } catch (e) {
    toast((e as Error).message, 'err');
  }
}

postHooks.onFrame = (host, f: ServerFrame) => {
  if (host !== homeHost()) return;
  if (f.t === 'post') {
    if (useStore.getState().settings.blocked.includes(f.p.author.id) || P().gone[f.p.id]) return;
    addPost(f.p);
  } else if (f.t === 'post.upd') patchPost(f.id, { likes: f.likes, replies: f.replies, liked: f.liked });
  else if (f.t === 'post.del') dropPost(f.id);
};

/** Bağlantı yeniden kurulunca akışlar baştan yüklensin */
let lastOnline = false;
useStore.subscribe((s) => {
  const home = Object.values(s.conns).find((x) => x.home);
  const on = !!home && home.status === 'online' && !!home.feats?.includes(FEAT_POSTS);
  if (on && !lastOnline) {
    usePosts.setState((st) => ({ feeds: { all: { ...emptyFeed(), items: st.feeds.all.items }, friends: { ...emptyFeed(), items: st.feeds.friends.items } } }));
  }
  lastOnline = on;
});
