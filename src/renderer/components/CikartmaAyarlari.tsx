// Topluluk ayarları → Çıkartmalar: topluluğa özel çıkartma yükleme, adlandırma, silme
import React, { useRef, useState } from 'react';
import { Trash2, Upload, LoaderCircle, ImagePlus } from 'lucide-react';
import { cmd, toast, uploadFile, hostHttp, confirmDialog, useStore } from '../lib/store';
import { makeId, type Community } from '../../shared/protocol';
import { STICKER_BYTES_MAX, STICKER_MAX, STICKER_NAME_MAX, type Sticker } from '../../shared/stickers';

const TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];

/** Hareketsiz resmi en fazla 320 piksele sığdırıp WebP yapar (oran korunur, kırpılmaz) */
function shrink(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 320 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * k));
      cv.height = Math.max(1, Math.round(img.height * k));
      const ctx = cv.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? resolve(new File([b], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' })) : reject(new Error('dönüştürülemedi'))), 'image/webp', 0.9);
    };
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('Resim açılamadı')));
    img.src = url;
  });
}

const fileName = (name: string) =>
  (name
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (ch) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[ch] as string)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'cikartma');

export function StickersTab({ c }: { c: Community }) {
  const list = c.stickers || [];
  const base = hostHttp(c.id);
  const me = useStore((s) => s.me.id);
  const [draft, setDraft] = useState<{ file: File; preview: string; name: string; tag: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);

  const save = (next: Sticker[], ok: string) => {
    cmd(c.id, { t: 'comm.update', cid: c.id, stickers: next });
    // Eski sunucu sürümü çıkartma alanını tanımaz ve sessizce yok sayar; bunu kullanıcıya söyle
    const want = next.length;
    setTimeout(() => {
      const now = useStore.getState().communities[c.id]?.stickers?.length || 0;
      if (now !== want) toast('Sunucu çıkartmaları kaydetmedi. Sunucunun güncellenmesi gerekiyor.', 'err');
      else toast(ok, 'ok');
    }, 1500);
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!TYPES.includes(f.type)) return toast('PNG, GIF, WebP ya da JPG seçmelisin.', 'err');
    let file = f;
    try {
      if (f.type !== 'image/gif' && (f.size > STICKER_BYTES_MAX || f.size > 200 * 1024)) file = await shrink(f);
    } catch {
      return toast('Resim açılamadı.', 'err');
    }
    if (file.size > STICKER_BYTES_MAX) return toast(`Dosya çok büyük. En fazla ${STICKER_BYTES_MAX / 1024} KB olmalı${f.type === 'image/gif' ? ' (GIF küçültülemiyor)' : ''}.`, 'err');
    const preview = URL.createObjectURL(file);
    setDraft({ file, preview, name: f.name.replace(/\.\w+$/, '').slice(0, STICKER_NAME_MAX), tag: '' });
  };

  const upload = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return toast('Çıkartmaya bir ad ver.', 'err');
    setBusy(true);
    try {
      const f = new File([draft.file], fileName(name) + '.' + (draft.file.type.split('/')[1] || 'png').replace('jpeg', 'jpg'), { type: draft.file.type });
      const a = await uploadFile(c.id, f);
      const st: Sticker = { id: makeId(), name, url: a.url, by: me };
      if (draft.tag.trim()) st.tag = draft.tag.trim();
      save([...list, st], `"${name}" çıkartması eklendi.`);
      URL.revokeObjectURL(draft.preview);
      setDraft(null);
    } catch (e) {
      toast((e as Error).message || 'Yüklenemedi.', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Çıkartmalar</h1>
      <p className="note">
        Topluluğuna özel çıkartmalar yükle; üyeler yazı kutusundaki emoji düğmesinden <b>Çıkartmalar</b> sekmesini açıp gönderebilir. PNG, GIF (hareketli), WebP ya da JPG; en fazla {STICKER_BYTES_MAX / 1024} KB.
        Büyük resimler otomatik küçültülür. En fazla {STICKER_MAX} çıkartma.
      </p>

      <input ref={inp} type="file" accept={TYPES.join(',')} hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />

      {draft ? (
        <div className="stk-draft">
          <div className="stk-draft-preview">
            <img src={draft.preview} alt="" />
          </div>
          <div className="stk-draft-form">
            <label>
              <span>Çıkartma adı</span>
              <input autoFocus maxLength={STICKER_NAME_MAX} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && upload()} />
            </label>
            <label>
              <span>İlgili emoji (isteğe bağlı)</span>
              <input maxLength={8} placeholder="ör. 😂" value={draft.tag} onChange={(e) => setDraft({ ...draft, tag: e.target.value })} />
            </label>
            <div className="stk-draft-btns">
              <button className="btn primary" disabled={busy} onClick={upload}>
                {busy ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />} Yükle
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => (URL.revokeObjectURL(draft.preview), setDraft(null))}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button className="btn primary" disabled={list.length >= STICKER_MAX} onClick={() => inp.current?.click()}>
          <ImagePlus size={16} /> Çıkartma yükle
        </button>
      )}

      <h3 className="stk-count">
        Yüklenenler ({list.length}/{STICKER_MAX})
      </h3>
      {list.length ? (
        <div className="stk-list">
          {list.map((s) => (
            <div key={s.id} className="stk-item">
              <div className="stk-img">
                <img src={base + s.url} alt={s.name} loading="lazy" />
              </div>
              <div className="stk-meta">
                <b title={s.name}>{s.name}</b>
                <span>{s.tag || ' '}</span>
              </div>
              <button
                className="stk-del icon-btn"
                title="Sil"
                onClick={() => confirmDialog(`"${s.name}" silinsin mi?`, 'Daha önce gönderilmiş mesajlarda görünmeye devam eder.', () => save(list.filter((x) => x.id !== s.id), 'Çıkartma silindi.'), 'Sil')}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="stk-none">Henüz çıkartma yok. İlk çıkartmayı yükleyince burada görünecek.</div>
      )}
    </>
  );
}
