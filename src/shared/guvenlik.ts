// Hesabın gizli anahtarının hangi sunucuya gönderileceğiyle ilgili ortak tanımlar (ana süreç + arayüz).

/** Herkesin bağlandığı resmî merkezi sunucu. Hesabın asıl gizli anahtarı yalnız buraya (ve bu bilgisayardaki yerel sunucuya) gönderilir. */
export const OFFICIAL_SERVER = 'https://45-87-173-18.sslip.io/kovan';

/** Sunucu adresinin karşılaştırma biçimi: boşluksuz, sondaki / işaretleri olmadan, küçük harf */
export const normHost = (h: unknown) => (typeof h === 'string' ? h : '').trim().replace(/\/+$/, '').toLowerCase();

/** Adres bu bilgisayarın kendisini mi gösteriyor (yerel sunucu)? */
export const isLoopbackHost = (h: string) => /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(h);

/** Sunucu hesap anahtarını yenilemeyi destekliyor (v1.67; `rekey` çerçevesi) */
export const FEAT_REKEY = 'rekey';

/** Sunucu telefon eşleştirmeyi destekliyor (v1.68; `POST /pair/offer` + `POST /pair/claim`) */
export const FEAT_PAIR = 'pair';
/** Eşleştirme kodunun harfleri: karışan 0/O, 1/I yok */
export const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIR_LEN = 8;
/** Kodu karşılaştırma biçimi: boşluk ve tire atılır, büyük harf */
export const normPairCode = (c: unknown) => (typeof c === 'string' ? c : '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
