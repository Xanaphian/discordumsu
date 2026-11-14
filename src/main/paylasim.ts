// v1.48 Ana Sayfa paylaşım akışı (sunucu tarafı).
// Paylaşımlar hub klasöründe posts.json'da tutulur. Hub bu sınıfa yalnız birkaç geri çağırma verir;
// böylece hub.ts'te değişiklik birkaç satırla kalır.
import fs from 'node:fs';
import path from 'node:path';
import { makeId, type Attachment, type ClientFrame, type ID, type ServerFrame, type UserPublic } from '../shared/protocol';
import {
  cleanPostText, FEED_PAGE, POST_DAY_LIMIT, POST_GAP_MS, REPLY_GAP_MS, REPORT_HIDE_AT, REPORT_REASONS,
  type FeedScope, type PostView, type PostVis, type StoredPost,
} from '../shared/paylasim';

/** toplam saklanan paylaşım (yanıtlar dahil); aşılınca en eskiler silinir */
const MAX_POSTS = 20_000;
const THREAD_MAX = 300;

export interface PostHost {
  dir: string;
  user(uid: ID): UserPublic | undefined;
  isFriend(a: ID, b: ID): boolean;
  isBot(uid: ID): boolean;
  /** çevrimiçi oturumlar: kullanıcı + gönderici */
  sessions(): Iterable<{ uid: ID; send: (f: ServerFrame) => void }>;
}

interface PostFile {
  posts: StoredPost[];
  /** kullanıcı -> engellediği kişiler (istemci her bağlantıda bildirir) */
  blocks?: Record<ID, ID[]>;
}

type PostFrame = Extract<ClientFrame, { t: `post.${string}` }>;

export class PostStore {
  private list: StoredPost[] = [];
  private byId = new Map<ID, StoredPost>();
  private blocks = new Map<ID, Set<ID>>();
  private rate = new Map<ID, { post: number; reply: number; like: number; day: number; n: number }>();
  private timer: NodeJS.Timeout | null = null;
  private file: string;

  constructor(private host: PostHost) {
    this.file = path.join(host.dir, 'posts.json');
    try {
      const d: PostFile = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.list = Array.isArray(d.posts) ? d.posts.filter((p) => p && typeof p.id === 'string') : [];
      this.list.sort((a, b) => (a.id < b.id ? -1 : 1));
      for (const p of this.list) this.byId.set(p.id, p);
      for (const [k, v] of Object.entries(d.blocks || {})) if (Array.isArray(v) && v.length) this.blocks.set(k, new Set(v));
    } catch {
      /* ilk açılış */
    }
  }

  private save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const blocks: Record<ID, ID[]> = {};
      for (const [k, v] of this.blocks) if (v.size) blocks[k] = [...v];
      const data: PostFile = { posts: this.list, blocks };
      const tmp = this.file + '.tmp';
      fs.promises
        .writeFile(tmp, JSON.stringify(data))
        .then(() => fs.promises.rename(tmp, this.file))
        .catch(() => {});
    }, 800);
  }

  /** istemcinin engel listesi (privacy çerçevesiyle gelir) */
  setBlocks(uid: ID, list: unknown) {
    if (!Array.isArray(list)) return;
    const ids = list.filter((x): x is string => typeof x === 'string' && x.length < 80).slice(0, 2000);
    const old = this.blocks.get(uid);
    if (old && old.size === ids.length && ids.every((x) => old.has(x))) return;
    if (ids.length) this.blocks.set(uid, new Set(ids));
    else this.blocks.delete(uid);
    this.save();
  }

  blockedEither(a: ID, b: ID) {
    return !!(this.blocks.get(a)?.has(b) || this.blocks.get(b)?.has(a));
  }

  private rootOf(p: StoredPost): StoredPost | undefined {
    return p.re ? this.byId.get(p.re) : p;
  }

  canSee(viewer: ID, p: StoredPost): boolean {
    const root = this.rootOf(p);
    if (!root) return false;
    if (viewer !== p.by && (this.blockedEither(viewer, p.by) || p.reports?.includes(viewer) || p.hidden)) return false;
    if (root !== p && viewer !== root.by && (this.blockedEither(viewer, root.by) || root.hidden)) return false;
    if (root.vis === 'friends' && viewer !== root.by && !this.host.isFriend(viewer, root.by)) return false;
    return true;
  }

  private view(viewer: ID, p: StoredPost): PostView {
    const u = this.host.user(p.by) || { id: p.by, name: 'Silinmiş kullanıcı', color: '#888888' };
    const v: PostView = {
      id: p.id,
      author: u,
      text: p.text,
      vis: this.rootOf(p)?.vis || p.vis,
      likes: p.likes.length,
      liked: p.likes.includes(viewer),
      replies: p.replies,
    };
    if (p.image) v.image = p.image;
    if (p.re) v.re = p.re;
    if (p.hidden && viewer === p.by) v.hidden = true;
    return v;
  }

  /** p'yi görebilen çevrimiçi herkese çerçeve gönderir (izleyiciye göre üretilir) */
  private push(p: StoredPost, make: (uid: ID) => ServerFrame) {
    for (const s of this.host.sessions()) if (this.canSee(s.uid, p)) s.send(make(s.uid));
  }

  private remove(p: StoredPost) {
    const gone = new Set<ID>([p.id]);
    if (!p.re) {
      for (const x of this.list) if (x.re === p.id) gone.add(x.id);
    } else {
      const root = this.byId.get(p.re);
      if (root) root.replies = Math.max(0, root.replies - 1);
    }
    this.list = this.list.filter((x) => !gone.has(x.id));
    for (const id of gone) this.byId.delete(id);
    this.save();
    for (const s of this.host.sessions()) for (const id of gone) s.send({ t: 'post.del', id });
    if (p.re) {
      const root = this.byId.get(p.re);
      if (root) this.push(root, (uid) => ({ t: 'post.upd', id: root.id, likes: root.likes.length, replies: root.replies, liked: root.likes.includes(uid) }));
    }
  }

  private trim() {
    if (this.list.length <= MAX_POSTS) return;
    const drop = this.list.length - MAX_POSTS;
    const gone = new Set(this.list.slice(0, drop).map((x) => x.id));
    this.list = this.list.filter((x) => !gone.has(x.id) && !(x.re && gone.has(x.re)));
    this.byId = new Map(this.list.map((x) => [x.id, x]));
  }

  /** post.* çerçevelerini işler; işlediyse true */
  handle(uid: ID, f: ClientFrame, reply: (f: ServerFrame) => void): boolean {
    if (!f.t.startsWith('post.')) return false;
    const x = f as PostFrame;
    const err = (msg: string, rid?: string) => reply({ t: 'err', msg, rid });
    switch (x.t) {
      case 'post.feed': {
        const scope: FeedScope = x.scope === 'friends' || x.scope === 'mine' ? x.scope : 'all';
        const who = scope === 'mine' ? (typeof x.uid === 'string' && x.uid ? x.uid : uid) : null;
        const out: PostView[] = [];
        let more = false;
        for (let i = this.list.length - 1; i >= 0; i--) {
          const p = this.list[i];
          if (p.re) continue;
          if (x.before && p.id >= x.before) continue;
          if (who && p.by !== who) continue;
          if (scope === 'friends' && p.by !== uid && !this.host.isFriend(uid, p.by)) continue;
          if (!this.canSee(uid, p)) continue;
          if (out.length >= FEED_PAGE) {
            more = true;
            break;
          }
          out.push(this.view(uid, p));
        }
        reply({ t: 'ok', rid: x.rid, data: { posts: out, more } });
        return true;
      }
      case 'post.thread': {
        const p = this.byId.get(String(x.id || ''));
        const root = p && this.rootOf(p);
        if (!p || !root || !this.canSee(uid, root)) return err('Bu paylaşım artık yok ya da göremiyorsun.', x.rid), true;
        const replies = this.list.filter((r) => r.re === root.id && this.canSee(uid, r)).slice(-THREAD_MAX);
        reply({ t: 'ok', rid: x.rid, data: { post: this.view(uid, root), replies: replies.map((r) => this.view(uid, r)) } });
        return true;
      }
      case 'post.create': {
        if (this.host.isBot(uid)) return err('Botlar paylaşım yapamaz.', x.rid), true;
        const text = cleanPostText(x.text);
        const img = x.image as Attachment | undefined;
        const image =
          img && typeof img.url === 'string' && img.url.startsWith('/f/') && typeof img.mime === 'string' && img.mime.startsWith('image/')
            ? { id: String(img.id).slice(0, 40), name: String(img.name || 'resim').slice(0, 120), size: Number(img.size) || 0, mime: img.mime.slice(0, 60), url: img.url.slice(0, 300), ...(img.w && img.h ? { w: Math.min(+img.w, 20000), h: Math.min(+img.h, 20000) } : {}) }
            : undefined;
        if (!text && !image) return err('Boş paylaşım yapılamaz.', x.rid), true;
        let root: StoredPost | undefined;
        if (x.re) {
          root = this.byId.get(String(x.re));
          if (root?.re) root = this.byId.get(root.re);
          if (!root || !this.canSee(uid, root)) return err('Yanıtladığın paylaşım artık yok.', x.rid), true;
          if (image) return err('Yanıtlara resim eklenemez.', x.rid), true;
        }
        // hız sınırı
        const now = Date.now();
        const day = Math.floor(now / 86_400_000);
        const r = this.rate.get(uid) || { post: 0, reply: 0, like: 0, day, n: 0 };
        if (r.day !== day) (r.day = day), (r.n = 0);
        if (r.n >= POST_DAY_LIMIT) return err(`Bugünlük paylaşım sınırına ulaştın (${POST_DAY_LIMIT}). Yarın yine yazabilirsin.`, x.rid), true;
        const gap = root ? REPLY_GAP_MS - (now - r.reply) : POST_GAP_MS - (now - r.post);
        if (gap > 0) return err(`Biraz bekle: ${Math.ceil(gap / 1000)} saniye sonra yeniden paylaşabilirsin.`, x.rid), true;
        if (root) r.reply = now;
        else r.post = now;
        r.n++;
        this.rate.set(uid, r);

        const vis: PostVis = root ? root.vis : x.vis === 'friends' ? 'friends' : 'public';
        const p: StoredPost = { id: makeId(now), by: uid, text, vis, likes: [], replies: 0 };
        if (image) p.image = image;
        if (root) {
          p.re = root.id;
          root.replies++;
        }
        this.list.push(p);
        this.byId.set(p.id, p);
        this.trim();
        this.save();
        reply({ t: 'ok', rid: x.rid, data: this.view(uid, p) });
        this.push(p, (v) => ({ t: 'post', p: this.view(v, p) }));
        if (root) {
          const rt = root;
          this.push(rt, (v) => ({ t: 'post.upd', id: rt.id, likes: rt.likes.length, replies: rt.replies, liked: rt.likes.includes(v) }));
        }
        return true;
      }
      case 'post.del': {
        const p = this.byId.get(String(x.id || ''));
        if (!p) return x.rid && reply({ t: 'ok', rid: x.rid }), true;
        const root = p.re ? this.byId.get(p.re) : undefined;
        // yazan kendi paylaşımını, ana paylaşımın sahibi altına gelen yanıtları silebilir
        if (p.by !== uid && root?.by !== uid) return err('Bunu silemezsin.', x.rid), true;
        this.remove(p);
        if (x.rid) reply({ t: 'ok', rid: x.rid });
        return true;
      }
      case 'post.like': {
        const p = this.byId.get(String(x.id || ''));
        if (!p || !this.canSee(uid, p) || this.host.isBot(uid)) return true;
        const now = Date.now();
        const r = this.rate.get(uid) || { post: 0, reply: 0, like: 0, day: Math.floor(now / 86_400_000), n: 0 };
        if (now - r.like < 150) return true;
        r.like = now;
        this.rate.set(uid, r);
        const has = p.likes.includes(uid);
        if (!!x.on === has) return true;
        p.likes = x.on ? [...p.likes, uid] : p.likes.filter((y) => y !== uid);
        this.save();
        this.push(p, (v) => ({ t: 'post.upd', id: p.id, likes: p.likes.length, replies: p.replies, liked: p.likes.includes(v) }));
        return true;
      }
      case 'post.report': {
        const p = this.byId.get(String(x.id || ''));
        if (!p || p.by === uid || !this.canSee(uid, p)) return x.rid && reply({ t: 'ok', rid: x.rid }), true;
        if (!REPORT_REASONS.some((rr) => rr.id === x.reason)) return err('Bir sebep seç.', x.rid), true;
        p.reports ||= [];
        if (!p.reports.includes(uid)) p.reports.push(uid);
        if (p.reports.length >= REPORT_HIDE_AT && !p.hidden) {
          p.hidden = true;
          // yazan dışında herkesin akışından kalkar
          for (const s of this.host.sessions()) if (s.uid !== p.by) s.send({ t: 'post.del', id: p.id });
        }
        this.save();
        if (x.rid) reply({ t: 'ok', rid: x.rid });
        return true;
      }
    }
    return false;
  }
}
