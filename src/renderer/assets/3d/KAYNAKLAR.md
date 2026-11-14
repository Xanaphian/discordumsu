# 3D oda modelleri: kaynak ve lisans

Bu klasördeki bütün `.glb` dosyaları **KayKit** paketlerinden (Kay Lousberg, kaylousberg.com) alınmıştır.
Hepsi **CC0 1.0** (kamu malı): kişisel ve ticari kullanım, değiştirme ve yeniden dağıtım serbest, atıf zorunlu değil.
Yine de uygulamada 3D ayarları panelinde "Emeği geçenler" satırında anılır.

Paketler `github.com/KayKit-Game-Assets/<paket>` adreslerinden indirildi; her birinin kökünde `LICENSE.txt` (CC0) bulunur.
Dosyalar `scripts/3d-paketle.mjs` ile üretilir (seçilen modeller birleştirilir, kullanılmayan animasyon ve silahlar atılır, meshopt ile sıkıştırılır).

| Dosya | İçerik | Kaynak paket | Lisans |
| --- | --- | --- | --- |
| `sovalye.glb`, `barbar.glb`, `buyucu.glb`, `haydut.glb`, `kukuletali.glb` | Karakterler: Knight, Barbarian, Mage, Rogue, Rogue_Hooded (silahlar çıkarıldı; miğfer, şapka, pelerin duruyor) | KayKit-Character-Pack-Adventures-1.0 | CC0 |
| `animasyon.glb` | Ortak iskelet animasyonları: Idle, Walking_A, Running_A, Sit_Chair_Idle, Jump_Idle | KayKit-Character-Pack-Adventures-1.0 | CC0 |
| `salon.glb` | Kanepe, koltuk, sehpa, masa, sandalye, lamba, dolap, raf, çerçeve, saksı, kitap, yastık | KayKit-Furniture-Bits-1.0 | CC0 |
| `salon.glb` | Yuvarlak masa, tabure, tabak, menü, burger | KayKit-Restaurant-Bits-1.0 | CC0 |
| `salon.glb`, `meydan.glb` | Kupa (`mug_full`) | KayKit-Character-Pack-Adventures-1.0 | CC0 |
| `salon.glb` | Şişe | KayKit-Dungeon-Remastered-1.0 | CC0 |
| `meydan.glb` | Ağaçlar, kütükler, kayalar, bulutlar, nilüfer ve sazlar; fıçı, sandıklar, çuval, çadır, bayraklar, kova, kereste, el arabası, palet; kuyu | KayKit-Medieval-Hexagon-Pack-1.0 | CC0 |
| `meydan.glb` | Bank, fener, taş yol parçaları | KayKit-Halloween-Bits-1.0 | CC0 |
| `meydan.glb` | Saksılı çalı | KayKit-City-Builder-Bits-1.0 | CC0 |
| `meydan.glb` | Sancaklar, büyük fıçı, fıçı yığını, hazine sandığı | KayKit-Dungeon-Remastered-1.0 | CC0 |

## Xanaphian için kodla üretilenler (hazır model değil)

- Tepki hareketleri (el sallama, dans, alkış, kalp, gülme, dönme, işaret etme, selam): `space/avatar.ts` içinde kemikler üzerinde hesaplanır.
- Şapkalar (taç, şapka, sivri şapka, hale, kulaklık): `space/avatar.ts`.
- Kıyafet rengi: karakter dokusunun kıyafet tonları kullanıcının rengine çevrilir (`space/assets.ts`).
- Salon: duvarlar, zemin, halı, büyük ekran, pencereler, tablolar, neon amblem, sarkıt lambalar (`space/salon.ts`).
- Meydan: taş zemin, sahne ve pano, hoparlörler, çeşme, kamp ateşi alevi, gölet suyu, fener sütunları ve ışık haleleri, çalılar, çiçekler, gökyüzü (`space/world.ts`).

Riot Games'e ya da başka bir oyuna ait hiçbir varlık kullanılmamıştır.
