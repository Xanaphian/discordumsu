// v1.50 Kullanıcı etiketi (ad#kod): görünüm parçaları
import React, { useState } from 'react';
import { Copy, Hash, Pencil, Check, LoaderCircle } from 'lucide-react';
import { useStore, toast, tagsSupported, setMyTagCode } from '../lib/store';
import { tagOf, foldName, customCodeError, TAG_CUSTOM_MIN, TAG_CUSTOM_MAX, TAG_CHANGES_PER_DAY, nameError } from '../../shared/etiket';
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

/** Kendi etiketin: büyük gösterim + Kopyala + Kodu değiştir (Arkadaş ekle, Ayarlar > Profilim). */
export function MyTagBox({ compact }: { compact?: boolean }) {
  const me = useStore((s) => s.me);
  const sup = useStore((s) => tagsSupported(s));
  const t = tagOf(me);
  const [edit, setEdit] = useState(false);
  return (
    <div className={cx('my-tag-box', compact && 'compact', edit && 'editing')}>
      <div className="mtb-main">
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
        {t && !edit && (
          <button className="btn sm ghost" onClick={() => setEdit(true)}>
            <Pencil size={14} /> Kodu değiştir
          </button>
        )}
        <button className="btn sm primary" disabled={!t} onClick={() => t && (copyText(t), toast(`${t} kopyalandı`, 'ok'))}>
          <Copy size={14} /> Kopyala
        </button>
      </div>
      {edit && t && <TagCodeEditor onDone={() => setEdit(false)} />}
    </div>
  );
}

/** Kodu değiştirme: 2–5 harf/rakam, yazıldıkça denetlenir; sunucu alınmış kodu ve sıklık sınırını söyler */
function TagCodeEditor({ onDone }: { onDone: () => void }) {
  const me = useStore((s) => s.me);
  const [v, setV] = useState(me.tag || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const local = v.trim() ? customCodeError(v) : null;
  const same = v.trim() === me.tag;
  const save = async () => {
    if (local || same || busy || !v.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const code = await setMyTagCode(v);
      toast(`Yeni etiketin: ${me.name}#${code}`, 'ok');
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'Kod değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  };
  const msg = err || local;
  return (
    <div className="tag-edit">
      <div className="tag-edit-row">
        <span className="tag-edit-name">{me.name}#</span>
        <input
          className="tag-edit-input"
          value={v}
          maxLength={TAG_CUSTOM_MAX}
          spellCheck={false}
          autoFocus
          placeholder="OVA"
          aria-invalid={!!msg}
          onChange={(e) => (setV(e.target.value.replace(/\s|#/g, '')), setErr(''))}
          onKeyDown={(e) => (e.key === 'Enter' ? save() : e.key === 'Escape' && onDone())}
        />
        <button className="btn sm ghost" onClick={onDone}>
          Vazgeç
        </button>
        <button className="btn sm primary" disabled={!!local || same || busy || !v.trim()} onClick={save}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Kaydet
        </button>
      </div>
      <div className={cx('tag-edit-msg', msg && 'err')} role={msg ? 'alert' : undefined}>
        {msg ||
          `${TAG_CUSTOM_MIN}–${TAG_CUSTOM_MAX} harf ya da rakam. Yazdığın gibi görünür; arkadaşların büyük/küçük harfe bakmadan yazabilir (${me.name}#OVA = ${me.name.toLocaleLowerCase('tr')}#ova). Günde en çok ${TAG_CHANGES_PER_DAY} kez değiştirebilirsin.`}
      </div>
    </div>
  );
}

/** Ad alanının altındaki not: ad yazıldıkça etiketin nasıl görüneceği */
export function NameTagHint({ draft }: { draft: string }) {
  const me = useStore((s) => s.me);
  const sup = useStore((s) => tagsSupported(s));
  const name = draft.trim() || me.name;
  const nErr = draft.trim() !== me.name ? nameError(draft) : null;
  if (nErr) return <small className="name-tag-hint err">{nErr}</small>;
  if (!me.tag) return <small className="name-tag-hint">{sup === false ? 'Etiketin (ad#kod) sunucu güncellenince atanacak.' : 'Etiketin (ad#kod) sunucuya bağlanınca görünür.'}</small>;
  const changed = foldName(name) !== foldName(me.name);
  return (
    <small className="name-tag-hint">
      Etiketin{' '}
      <b className="my-tag">
        <TagText user={{ name, tag: me.tag }} />
      </b>
      {changed ? '. Kodun korunur; bu ad ve kod başkasındaysa kaydedince yeni bir sayı kodu verilir.' : '. Arkadaşların seni bununla ekler.'}
    </small>
  );
}
