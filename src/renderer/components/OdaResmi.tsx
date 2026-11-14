// Odalara özel resim (v1.29): oda listesinde türün simgesi yerine küçük resim, sağ altında tür işareti.
import React, { useRef } from 'react';
import { Hash, Volume2, Megaphone, Globe, ImagePlus, Trash2 } from 'lucide-react';
import { ToolIcon } from './Tools';
import { toast } from '../lib/store';
import { resizeImage } from '../lib/util';
import { isToolChannel, cleanChannelImage, type Channel } from '../../shared/protocol';

/** Kanal türünün simgesi (site odasında sitenin kendi simgesi varsa o) */
export function ChannelGlyph({ type, size = 18, icon }: { type: Channel['type']; size?: number; icon?: string }) {
  if (type === 'site' && icon) return <img className="ch-site-icon" src={icon} alt="" width={size} height={size} draggable={false} />;
  if (isToolChannel(type)) return <ToolIcon type={type} size={size} />;
  if (type === 'voice' || type === 'space') return <Volume2 size={size} />;
  if (type === 'site') return <Globe size={size} />;
  if (type === 'announce') return <Megaphone size={size} />;
  return <Hash size={size} />;
}

const TYPE_LABEL: Partial<Record<Channel['type'], string>> = {
  text: 'Metin kanalı',
  announce: 'Duyuru kanalı',
  voice: 'Sesli oda',
  space: 'Sesli oda',
  site: 'Site odası',
};

/** Oda resmi + sağ altta tür işareti */
export function ChannelPic({ type, image, size = 32 }: { type: Channel['type']; image: string; size?: number }) {
  return (
    <span className="ch-pic" style={{ width: size, height: size }}>
      <img src={image} alt="" draggable={false} />
      <span className="ch-pic-type" title={TYPE_LABEL[type]}>
        <ChannelGlyph type={type} size={Math.max(9, Math.round(size * 0.32))} />
      </span>
    </span>
  );
}

/** Dosyadan oda resmi: ortadan kare kırpılır, 96 px'e küçültülür */
export async function readChannelImage(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) {
    toast('Bir resim dosyası seç.', 'err');
    return;
  }
  try {
    let out = await resizeImage(file, 96, 0.86);
    if (!cleanChannelImage(out)) out = await resizeImage(new Blob([file], { type: 'image/webp' }), 96, 0.7);
    const ok = cleanChannelImage(out);
    if (!ok) toast('Bu resim kullanılamadı.', 'err');
    return ok;
  } catch {
    toast('Resim okunamadı.', 'err');
  }
}

/** Ayarlarda / oluştururken resim seçme alanı */
export function ChannelPicField({
  type,
  icon,
  image,
  onChange,
  disabled,
}: {
  type: Channel['type'];
  icon?: string;
  image?: string;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="field oda-resmi-field">
      <span>Oda resmi</span>
      <div className="oda-resmi">
        <button type="button" className="oda-resmi-kutu" disabled={disabled} onClick={() => file.current?.click()} aria-label="Resim seç">
          {image ? <ChannelPic type={type} image={image} size={56} /> : <span className="oda-resmi-bos"><ChannelGlyph type={type} icon={icon} size={24} /></span>}
        </button>
        <div className="oda-resmi-yan">
          <div className="oda-resmi-dugmeler">
            <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => file.current?.click()}>
              <ImagePlus size={14} /> {image ? 'Değiştir' : 'Resim yükle'}
            </button>
            {image && (
              <button type="button" className="btn ghost sm danger-text" disabled={disabled} onClick={() => onChange(undefined)}>
                <Trash2 size={14} /> Kaldır
              </button>
            )}
          </div>
          <small className="field-hint">{image ? 'Oda listesinde simgenin yerine bu resim görünür.' : 'İsteğe bağlı. Resim koymazsan odanın kendi simgesi kalır.'}</small>
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
            const v = await readChannelImage(f);
            if (v) onChange(v);
          }}
        />
      </div>
    </div>
  );
}
