/// <reference types="vite/client" />
import type { KovanApi } from '../preload/preload';
/** v1.68 telefona özgü işler */
interface MobileApi {
  platform: 'android' | 'ios' | 'web';
  /** e-posta / kullanıcı adı ve şifreyle giriş (sunucu bu cihaza ayrı anahtar verir) */
  login: (login: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Android geri tuşu; işlenmediyse (false) uygulama arka plana alınır */
  onBack: (cb: () => boolean) => void;
}
declare global {
  const __BUILD_DATE__: string;
  interface Window {
    /** `mobile` yalnız telefon uygulamasında var (bkz. mobil/kopru.ts) */
    kovan: KovanApi & { mobile?: MobileApi };
  }
}
export {};
