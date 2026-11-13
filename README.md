# Kovan

Topluluklar, kanallar ve gerçek zamanlı sohbet için hafif bir masaüstü uygulaması (Windows).

## Özellikler
- **Topluluklar**: altıgen simgeli sunucu rayı, sürükle-bırak sıralama, okunmamış/bahsetme rozetleri
- **Kanallar**: kategoriler, metin / ses / duyuru kanalları, konu, yavaş mod, sürükle-bırak sıralama
- **Mesajlaşma**: gruplanan mesajlar, yanıt, düzenleme, silme, sabitleme, tepkiler, @bahsetme, #kanal bağlantısı,
  markdown (kalın, italik, altı çizili, üstü çizili, spoiler, alıntı, liste, başlık, sözdizimi renkli kod blokları),
  dosya/görsel yükleme (sürükle-bırak, yapıştır), yazıyor göstergesi, arama, gün ayraçları, "YENİ" çizgisi
- **Üyeler**: roller (renk, rozet, sıralama, hiyerarşi, bahsedilebilir roller), 19 ayrı yetki, çevrimiçi/boşta/rahatsız etmeyin/görünmez durumları, profil kartı
- **Kanal izinleri**: rol ve üye bazında izin ver / reddet / devral, özel kanallar, kategori izinleri, ses kanalı kişi sınırı
- **Moderasyon**: zaman aşımı, atma, yasaklama, denetim kaydı, otomatik moderasyon (kelime filtresi, bağlantı engeli, bahsetme sınırı, yeni üye bekleme süresi)
- **Ses**: WebRTC ile eşler arası sesli kanallar, konuşma göstergesi, susturma/sağırlaştırma
- **Performans**: sanal liste (yalnızca görünen mesajlar çizilir), sayfalı geçmiş yükleme, hafif durum yönetimi
- **Güncelleme**: GitHub Releases üzerinden, üst çubuktaki **Güncelle** düğmesiyle tek tıkla

## Nasıl çalışır
Her Kovan uygulaması kendi içinde küçük bir sunucu (kovan) çalıştırır (varsayılan port **47820**).
Topluluk oluşturan kişinin bilgisayarı o topluluğu barındırır; diğerleri **davet koduyla** bağlanır.
Aynı ağda doğrudan çalışır; farklı ağlar için barındıran kişi portu yönlendirip dış adresini Ayarlar → Bağlantı'ya yazar.
Veriler `%APPDATA%/Kovan/hub` altında saklanır.

## Geliştirme
```bash
npm install
npm run build && npm start        # derle ve çalıştır
npm run dist:win                  # Windows kurulum dosyası (release/)
```

## Yeni sürüm yayınlama
1. `package.json` içindeki `version` alanını artır (ör. `1.0.1`) ve isteğe bağlı olarak `release-notes/1.0.1.md` yaz.
2. `main` dalına gönder. `Sürüm yayınla` iş akışı Windows kurulumunu derleyip `v1.0.1` olarak Releases'a yükler
   (Actions sekmesinden elle de çalıştırılabilir).
3. Kurulu uygulamalar yeni sürümü görür; üst çubukta **Güncelle** düğmesi belirir.
