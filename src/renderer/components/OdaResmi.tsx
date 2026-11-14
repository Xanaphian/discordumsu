// Oda afişi (v1.40): oda satırının arka planında geniş resim; simge her zaman odanın türünü gösterir.
// (1.30–1.39'daki küçük kare oda resmi kaldırıldı: profil resmine benzeyip odayı kişiyle karıştırıyordu.)
import React, { useRef } from 'react';
import { Hash, Volume2, Megaphone, Globe, ImagePlus, Trash2 } from 'lucide-react';
import { ToolIcon } from './Tools';
import { toast } from '../lib/store';
import { cleanChannelBanner, isToolChannel, type Channel } from '../../shared/protocol';

/** Kanal türünün simgesi (site odasında sitenin kendi simgesi varsa o) */
export function ChannelGlyph({ type, size = 18, icon }: { type: Channel['type']; size?: number; icon?: string }) {
  if (type === 'site' && icon) return <img className="ch-site-icon" src={icon} alt="" width={size} height={size} draggable={false} />;
  if (isToolChannel(type)) return <ToolIcon type={type} size={size} />;
  if (type === 'voice' || type === 'space') return <Volume2 size={size} />;
  if (type === 'site') return <Globe size={size} />;
  if (type === 'announce') return <Megaphone size={size} />;
  return <Hash size={size} />;
}

/** Oda satırının arkasındaki afiş + okunaklılık perdesi */
export function ChannelBannerBg({ banner }: { banner: string }) {
  return (
    <>
      <img className="ch-banner-img" src={banner} alt="" draggable={false} />
      <span className="ch-banner-shade" aria-hidden />
    </>
  );
}

const BW = 600;
const BH = 200;

/** Dosyadan oda afişi: ortadan 3:1 kırpılır, 600x200 webp'e küçültülür */
export function readChannelBanner(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) {
    toast('Bir resim dosyası seç.', 'err');
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = BW / BH;
      let sw = img.width;
      let sh = img.width / ratio;
      if (sh > img.height) {
        sh = img.height;
        sw = img.height * ratio;
      }
      const c = document.createElement('canvas');
      c.width = BW;
      c.height = BH;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, BW, BH);
      let q = 0.85;
      let out = c.toDataURL('image/webp', q);
      while (!cleanChannelBanner(out) && q > 0.35) out = c.toDataURL('image/webp', (q -= 0.15));
      const ok = cleanChannelBanner(out);
      if (!ok) toast('Bu resim kullanılamadı.', 'err');
      resolve(ok);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast('Resim okunamadı.', 'err');
      resolve(undefined);
    };
    img.src = url;
  });
}

/** Ayarlarda / oluştururken afiş seçme alanı; önizleme oda satırının kendisi */
export function ChannelBannerField({
  type,
  name,
  icon,
  banner,
  onChange,
  disabled,
}: {
  type: Channel['type'];
  name: string;
  icon?: string;
  banner?: string;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="field oda-afis-field">
      <span>Oda afişi</span>
      <button type="button" className={cx2('oda-afis-onizleme', banner && 'has-banner')} disabled={disabled} onClick={() => file.current?.click()}>
        {banner && <ChannelBannerBg banner={banner} />}
        <span className="ch-icon">
          <ChannelGlyph type={type} icon={icon} size={18} />
        </span>
        <span className="ch-name">{name || 'oda'}</span>
        {!banner && (
          <span className="oda-afis-ipucu">
            <ImagePlus size={14} /> Afiş seç
          </span>
        )}
      </button>
      <div className="oda-afis-alt">
        <div className="oda-afis-dugmeler">
          <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => file.current?.click()}>
            <ImagePlus size={14} /> {banner ? 'Değiştir' : 'Afiş yükle'}
          </button>
          {banner && (
            <button type="button" className="btn ghost sm danger-text" disabled={disabled} onClick={() => onChange(undefined)}>
              <Trash2 size={14} /> Kaldır
            </button>
          )}
        </div>
        <small className="field-hint">{banner ? 'Oda listesinde odanın arkasında bu afiş görünür.' : 'İsteğe bağlı. Geniş bir resim seç; ortadan kırpılır.'}</small>
      </div>
      <input
        ref={file}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const v = await readChannelBanner(f);
          if (v) onChange(v);
        }}
      />
    </div>
  );
}

const cx2 = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');
