// Sağ tık menüsü simgeleri (v1.41): menüleri tek tek elden geçirmeden, öğenin adından simge seçilir.
import React from 'react';
import {
  User, AtSign, MessageSquare, Phone, StickyNote, Pencil, PenLine, Shield, Clock, LogOut, Ban, Copy, Settings, Trash2,
  CheckCheck, BellOff, Bell, UserPlus, UserMinus, UserCheck, UserX, VolumeX, Volume2, Reply, Pin, PinOff, Bookmark, BookmarkMinus,
  ExternalLink, LogIn, Headphones, Music, Tv, Link, Hash, Eye, EyeOff, Lock, FolderPlus, Plus, Mail, Flag, Smile, Users,
  ImageDown, Share2, Undo2, Box, SlidersHorizontal, DoorOpen,
} from 'lucide-react';

type Rule = [RegExp, React.ComponentType<{ size?: number }>];

// Sıra önemli: daha özel kalıplar önce
const RULES: Rule[] = [
  [/zaman aşımını kaldır/, Undo2],
  [/zaman aşımı/, Clock],
  [/yasağı kaldır/, Undo2],
  [/yasakla$/, Ban],
  [/kişisini at$|^at$/, LogOut],
  [/engeli kaldır/, UserCheck],
  [/^engelle/, UserX],
  [/kimliğini kopyala|kimliği kopyala/, Copy],
  [/bağlantı.*kopyala|bağlantısını kopyala/, Link],
  [/etiket olarak kopyala/, Hash],
  [/kopyala/, Copy],
  [/^profili düzenle/, Pencil],
  [/^profil/, User],
  [/^bahset/, AtSign],
  [/^mesaj$|mesaj gönder/, MessageSquare],
  [/^ara$|sesli ara|görüntülü ara/, Phone],
  [/not ekle|^not$/, StickyNote],
  [/takma ad/, PenLine],
  [/roller|rolleri|^rol/, Shield],
  [/izinler/, Lock],
  [/arkadaşlıktan çıkar|isteği geri çek/, UserMinus],
  [/isteğini kabul/, UserCheck],
  [/arkadaş ekle/, UserPlus],
  [/davet/, Mail],
  [/sesini kapat|sesini aç|sessize al|sesini a/, VolumeX],
  [/bildirim/, Bell],
  [/okundu/, CheckCheck],
  [/yanıtla/, Reply],
  [/sabitlemeyi kaldır|sabitten çıkar/, PinOff],
  [/sabitle/, Pin],
  [/kaydedilenlerden çıkar/, BookmarkMinus],
  [/kaydet/, Bookmark],
  [/düzenle/, Pencil],
  [/sil$|^sil|silinsin/, Trash2],
  [/ayrı pencere/, ExternalLink],
  [/odaya gir|katıl/, LogIn],
  [/odadan çık|bağlantıyı kes|ayrıl|çık$/, DoorOpen],
  [/beraber dinle/, Headphones],
  [/spotify/, Music],
  [/yayını izle|izle$/, Tv],
  [/gizle/, EyeOff],
  [/göster/, Eye],
  [/kategori oluştur/, FolderPlus],
  [/oluştur/, Plus],
  [/bildir$|şikayet/, Flag],
  [/tepki/, Smile],
  [/üye/, Users],
  [/resmi kaydet|indir/, ImageDown],
  [/paylaş/, Share2],
  [/3d/, Box],
  [/ses düzeyi|ses ayar/, Volume2],
  [/ayarlar|ayarları/, Settings],
  [/seçenekler/, SlidersHorizontal],
];

export function menuIconFor(label?: string): React.ComponentType<{ size?: number }> | null {
  if (!label) return null;
  const l = label.toLocaleLowerCase('tr').trim();
  for (const [re, Ic] of RULES) if (re.test(l)) return Ic;
  return null;
}

/** Geçerli simge yoksa yer tutucu (yazılar hizalı kalsın) */
export function MenuIcon({ label }: { label?: string }) {
  const Ic = menuIconFor(label);
  return <span className="ctx-ic">{Ic ? <Ic size={15} /> : null}</span>;
}

// kullanılmayan içe aktarma uyarısı olmasın
void BellOff;
