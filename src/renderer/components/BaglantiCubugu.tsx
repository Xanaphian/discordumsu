// Sohbetin üstünde bağlantı uyarısı: sunucuyla bağlantı kopunca ne olduğu açıkça görünür.
// (Eskiden yalnız topluluk simgesinde küçük bir işaret çıkıyordu; mesajların neden gitmediği anlaşılmıyordu.)
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useStore, reconnectNow } from '../lib/store';
import '../styles/baglanti.css';

export function BaglantiCubugu({ cid }: { cid: string }) {
  const status = useStore((s) => s.conns[s.commHost[cid]]?.status);
  const error = useStore((s) => s.conns[s.commHost[cid]]?.error);
  const down = !!status && status !== 'online';
  // kısa süreli kopmalarda (yeniden bağlanma bir saniyeden kısa sürerse) çubuk hiç görünmesin
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!down) return setShow(false);
    const t = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(t);
  }, [down]);
  if (!down || !show) return null;
  return (
    <div className="baglanti-cubugu" role="status">
      <WifiOff size={15} />
      <span>{error ? `Sunucuya bağlanılamadı: ${error}.` : 'Sunucuyla bağlantı koptu. Yeniden bağlanılıyor; o zamana kadar mesajlar gönderilemez.'}</span>
      <button className="btn ghost sm" onClick={reconnectNow}>
        Şimdi dene
      </button>
    </div>
  );
}
