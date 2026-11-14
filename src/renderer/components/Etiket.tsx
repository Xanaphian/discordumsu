// v1.50 Kullanıcı etiketi (ad#1234): görünüm parçaları
import React from 'react';
import { Copy, Hash } from 'lucide-react';
import { useStore, toast, tagsSupported } from '../lib/store';
import { tagOf, foldName } from '../../shared/etiket';
import { copyText, cx } from '../lib/util';
import type { UserPublic } from '../../shared/protocol';

/** Ad + soluk #kod. Kod yoksa yalnız ad. */
export function TagText({ user, className }: { user: Pick<UserPublic, 'name' | 'tag'> | null | undefined; className?: string }) {
  if (!user) return null;
  return (
    <span className={cx('u-tag', className)}>
      <span className="u-tag-name">{user.name}</span>
      {user.tag && <span className="u-tag-code">#{user.tag}</span>}
    </span>
  );
}

/** Tıklayınca etiketi kopyalayan küçük çip (profil kartı, tam profil). */
export function TagChip({ user, isMe, className }: { user: Pick<UserPublic, 'name' | 'tag'> | null | undefined; isMe?: boolean; className?: string }) {
  const t = tagOf(user);
  if (!t) return null;
  return (
    <button
      type="button"
      className={cx('tag-chip', isMe && 'my-tag', className)}
      title="Etiketi kopyala"
      onClick={(e) => {
        e.stopPropagation();
        copyText(t);
        toast(`${t} kopyalandı`, 'ok');
      }}
    >
      <TagText user={user} />
      <Copy size={12} className="tag-chip-ic" />
    </button>
  );
}

/** Kendi etiketin: büyük gösterim + Kopyala (Arkadaş ekle, Ayarlar > Profilim). */
export function MyTagBox({ compact }: { compact?: boolean }) {
  const me = useStore((s) => s.me);
  const sup = useStore((s) => tagsSupported(s));
  const t = tagOf(me);
  return (
    <div className={cx('my-tag-box', compact && 'compact')}>
      <span className="mtb-ic" aria-hidden>
        <Hash size={16} />
      </span>
      <div className="mtb-text">
        <small>Senin etiketin</small>
        {t ? (
          <b className="my-tag">
            <TagText user={me} />
          </b>
        ) : (
          <b className="mtb-none">{sup === false ? 'Sunucu güncellenince atanacak' : sup === null ? 'Sunucuya bağlanınca görünür' : 'Atanıyor…'}</b>
        )}
      </div>
      <button className="btn sm primary" disabled={!t} onClick={() => t && (copyText(t), toast(`${t} kopyalandı`, 'ok'))}>
        <Copy size={14} /> Kopyala
      </button>
    </div>
  );
}

/** Ad alanının altındaki not: ad yazıldıkça etiketin nasıl görüneceği */
export function NameTagHint({ draft }: { draft: string }) {
  const me = useStore((s) => s.me);
  const sup = useStore((s) => tagsSupported(s));
  const name = draft.trim() || me.name;
  if (!me.tag) return <small className="name-tag-hint">{sup === false ? 'Etiketin (ad#1234) sunucu güncellenince atanacak.' : 'Etiketin (ad#1234) sunucuya bağlanınca görünür.'}</small>;
  const changed = foldName(name) !== foldName(me.name);
  return (
    <small className="name-tag-hint">
      Etiketin{' '}
      <b className="my-tag">
        <TagText user={{ name, tag: me.tag }} />
      </b>
      {changed ? '. Kodun korunur; bu ad ve kod başkasındaysa kaydedince yeni bir kod verilir.' : '. Arkadaşların seni bununla ekler.'}
    </small>
  );
}
