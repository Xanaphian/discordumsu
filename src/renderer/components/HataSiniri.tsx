// Çökme koruması: bir bölüm çizilirken hata verirse yalnız o bölüm durur, uygulamanın geri kalanı çalışmaya devam eder.
// (React'te yakalanmayan bir çizim hatası bütün pencereyi boşaltır; v1.43.1'deki boş ekran böyle olmuştu.)
import React from 'react';
import { Check, Flag, RefreshCw, TriangleAlert } from 'lucide-react';
import { hataBildir, hataKaydet } from '../lib/hata';

interface Props {
  /** kayda düşecek bölüm adı */
  name: string;
  children: React.ReactNode;
  /** değişince hata temizlenir (ör. başka kanala geçince bölüm yeniden denenir) */
  resetKey?: string;
  /** hiçbir şey gösterme (açılır pencereler, kartlar): hata olunca kapanır */
  silent?: boolean;
  /** hata olunca bir kez çağrılır (ör. açık pencereyi kapat) */
  onError?: () => void;
  /** bütün pencereyi kaplayan kurtarma ekranı (en dış sınır) */
  full?: boolean;
}

type Sent = '' | 'wait' | 'ok' | 'kopya' | 'err';
interface St {
  failed: boolean;
  key?: string;
  sent?: Sent;
}

export class HataSiniri extends React.Component<Props, St> {
  state: St = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true, sent: '' as Sent };
  }

  static getDerivedStateFromProps(p: Props, s: St) {
    // başka bir kanala/pencereye geçildiyse yeniden dene
    if (p.resetKey !== s.key) return { failed: false, key: p.resetKey };
    return null;
  }

  componentDidCatch(err: unknown) {
    console.error(`"${this.props.name}" bölümü çizilemedi`, err);
    hataKaydet(this.props.name, err);
    try {
      this.props.onError?.();
    } catch {
      /* kurtarma adımı da hata verirse yoksay */
    }
    // Sessiz bölümler (pencere, kart) kapandıktan sonra bir sonraki açılışta yeniden çalışabilsin.
    // Hata kalıcıysa boşuna dönüp durmasın: ilk denemeden sonra 3 saniyede bir denenir.
    if (this.props.silent) {
      const now = Date.now();
      const again = now - this.lastFail < 5000;
      this.lastFail = now;
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.setState({ failed: false }), again ? 3000 : 0);
    }
  }

  private lastFail = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;

  componentWillUnmount() {
    clearTimeout(this.retry);
  }

  /** Hatayı (kişisel bilgi olmadan) sunucuya bildirir; sunucu kabul etmiyorsa rapor panoya kopyalanır */
  private report = async () => {
    this.setState({ sent: 'wait' });
    try {
      const r = await hataBildir();
      this.setState({ sent: r === 'kopya' ? 'kopya' : 'ok' });
    } catch {
      this.setState({ sent: 'err' });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null;
    const sent = this.state.sent || '';
    return (
      <div className={this.props.full ? 'hata-kutu hata-tam' : 'hata-kutu'} role="alert">
        <TriangleAlert size={28} />
        <b>Bu bölüm açılırken bir sorun oldu</b>
        <span>Uygulamanın geri kalanı çalışmaya devam ediyor.</span>
        <button className="btn primary sm" onClick={() => (this.props.full ? location.reload() : this.setState({ failed: false }))}>
          <RefreshCw size={14} /> {this.props.full ? 'Yeniden yükle' : 'Yeniden dene'}
        </button>
        {sent === 'ok' || sent === 'kopya' ? (
          <span className="hata-ok">
            <Check size={14} /> {sent === 'ok' ? 'Bildirildi, teşekkürler.' : 'Rapor panoya kopyalandı, bize iletebilirsin.'}
          </span>
        ) : (
          <button className="btn ghost sm" disabled={sent === 'wait'} onClick={this.report} title="Hatanın teknik ayrıntısı gönderilir; adın, mesajların ve dosyaların gönderilmez.">
            <Flag size={14} /> {sent === 'wait' ? 'Gönderiliyor…' : sent === 'err' ? 'Gönderilemedi, yeniden dene' : 'Hata bildir'}
          </button>
        )}
      </div>
    );
  }
}
