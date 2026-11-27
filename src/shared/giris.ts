// v1.68 hesap girişi (e-posta / kullanıcı adı + şifre, QR ile giriş): ana süreç, sunucu ve arayüzün ortak kuralları.

/** Sunucu şifreyle ve QR ile girişi destekliyor (ready.feats) */
export const FEAT_GIRIS = 'giris';

/** QR kodunun içeriği: telefondaki uygulama bu önekle başlayan kodu tanır */
export const QR_ONEK = 'xanaphian://qr/';
/** QR kodu kaç ms geçerli */
export const QR_SURE = 120_000;

export const KULLANICI_ADI = /^[a-z0-9._]{3,32}$/;
export const EPOSTA = /^[^\s@<>"',;:\\()[\]]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const SIFRE_MIN = 8;
export const SIFRE_MAX = 128;

export const kullaniciAdiDuzelt = (s: unknown) => (typeof s === 'string' ? s : '').trim().replace(/^@/, '').toLowerCase();
export const epostaDuzelt = (s: unknown) => (typeof s === 'string' ? s : '').trim().toLowerCase();

export function kullaniciAdiHatasi(s: string): string {
  if (s.length < 3) return 'Kullanıcı adı en az 3 karakter olmalı.';
  if (s.length > 32) return 'Kullanıcı adı en çok 32 karakter olabilir.';
  if (!KULLANICI_ADI.test(s)) return 'Kullanıcı adında yalnız küçük harf (a-z), rakam, nokta ve alt çizgi olabilir.';
  if (/^[._]|[._]$|\.\./.test(s)) return 'Kullanıcı adı nokta ya da alt çizgiyle başlayıp bitemez.';
  return '';
}

export function epostaHatasi(s: string): string {
  if (!s) return 'E-posta adresini yaz.';
  if (s.length > 254 || !EPOSTA.test(s)) return 'Bu e-posta adresi geçerli görünmüyor.';
  return '';
}

export function sifreHatasi(s: string): string {
  if (s.length < SIFRE_MIN) return `Şifre en az ${SIFRE_MIN} karakter olmalı.`;
  if (s.length > SIFRE_MAX) return `Şifre en çok ${SIFRE_MAX} karakter olabilir.`;
  if (/^\d+$/.test(s) || new Set(s).size < 4) return 'Bu şifre çok kolay tahmin edilir, biraz daha karışık bir şey seç.';
  return '';
}

/** auth.me cevabı */
export interface HesapGirisi {
  /** e-posta ve şifre belirlenmiş mi */
  hasPassword: boolean;
  email?: string;
  username?: string;
  /** şifre ya da QR ile giriş yapılmış diğer cihaz sayısı */
  devices: number;
  /** sunucu şifre sıfırlama e-postası gönderebiliyor mu */
  mail: boolean;
}
