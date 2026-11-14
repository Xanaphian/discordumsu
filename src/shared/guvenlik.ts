// Hesabın gizli anahtarının hangi sunucuya gönderileceğiyle ilgili ortak tanımlar (ana süreç + arayüz).

/** Herkesin bağlandığı resmî merkezi sunucu. Hesabın asıl gizli anahtarı yalnız buraya (ve bu bilgisayardaki yerel sunucuya) gönderilir. */
export const OFFICIAL_SERVER = 'https://45-87-173-18.sslip.io/kovan';

/** Sunucu adresinin karşılaştırma biçimi: boşluksuz, sondaki / işaretleri olmadan, küçük harf */
export const normHost = (h: unknown) => (typeof h === 'string' ? h : '').trim().replace(/\/+$/, '').toLowerCase();

/** Adres bu bilgisayarın kendisini mi gösteriyor (yerel sunucu)? */
export const isLoopbackHost = (h: string) => /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(h);
