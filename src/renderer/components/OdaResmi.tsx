// Oda afişi (v1.40): oda satırının arka planında geniş resim; simge her zaman odanın türünü gösterir.
// (1.30–1.39'daki küçük kare oda resmi kaldırıldı: profil resmine benzeyip odayı kişiyle karıştırıyordu.)
import React, { useRef } from 'react';
import { Hash, Volume2, Megaphone, Globe, ImagePlus, Trash2 } from 'lucide-react';
import { ToolIcon } from './Tools';
import { toast } from '../lib/store';
import { CHANNEL_BANNER_MAX, cleanChannelBanner, isToolChannel, type Channel } from '../../shared/protocol';
import { cropImage } from './Kirpma';

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
        <small className="field-hint">{banner ? 'Oda listesinde odanın arkasında bu afiş görünür.' : 'İsteğe bağlı. Resmi seçince hangi kısmının görüneceğini ayarlarsın.'}</small>
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
          const r = await cropImage(f, { title: 'Oda afişi · ' + (name || 'oda'), aspect: 6, outW: 720, max: CHANNEL_BANNER_MAX, hint: 'Oda listesinde odanın arkasında bu kısım görünür.' });
          if (!r) return;
          const v = cleanChannelBanner(r.image);
          if (v) onChange(v);
          else toast('Bu resim kullanılamadı.', 'err');
        }}
      />
    </div>
  );
}

const cx2 = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');
