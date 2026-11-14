# Sürüm notları

Buradaki her `<sürüm>.md` iki yerde kullanılır:

1. **GitHub Releases**: `release.yml` yeni sürümü yayınlarken `release-notes/<sürüm>.md` dosyasını sürüm notu yapar.
2. **Uygulama içi "Son eklenenler"** (Ana Sayfa > Son eklenenler): bütün dosyalar derlemeye girer ve zaman çizelgesi olarak gösterilir (`src/renderer/lib/yenilikler.ts`).

## Yeni sürüm eklemek

1. `release-notes/1.2.3.md` yaz. Dosyanın en başına (GitHub'da görünmeyen) şu yorumları koy:

   ```md
   <!-- tarih: 2026-11-14 -->
   <!-- baslik: Kısa, anlaşılır başlık -->
   <!-- gorsel: 1-afis-kirpma.webp | Afiş kırpma penceresi -->
   <!-- gorsel: 2-profil-karti.webp | Profil kartı -->
   ## Xanaphian 1.2.3

   - **Yeni şey.** Açıklaması.
   ```

   - `tarih` yoksa derleme günü kullanılır.
   - `baslik` yoksa `## Xanaphian 1.2.3: başlık` satırındaki iki noktadan sonraki kısım alınır.
   - `gorsel` satırları isteğe bağlıdır: görsele Türkçe karakterli açıklama verir ve sırasını belirler. Satırı olmayan görsel de gösterilir (açıklaması dosya adından çıkar).

2. Bitmiş halin ekran görüntülerini `release-notes/gorseller/1.2.3/` klasörüne koy. WebP, en çok 1400 piksel genişlik önerilir (uygulamanın boyutu şişmesin), örneğin:

   ```sh
   python3 -c "from PIL import Image; im=Image.open('a.png').convert('RGB'); im.thumbnail((1400,9999)); im.save('1-ad.webp', quality=74, method=6)"
   ```

3. Düzeltme sürümleri (1.2.4, 1.2.5…) kendi dosyalarını alır; uygulamada 1.2 kartının altında "düzeltme sürümü" olarak listelenir.

Başka hiçbir dosyaya dokunmak gerekmez.
