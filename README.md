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
- **Botlar**: hazır komutlar (zar, anket, yazı-tura…), otomatik yanıtlar, karşılama mesajı
- **Yapay zekâ**: Claude ile konuşan bot (Anthropic API anahtarıyla); her bot ayrıca bir **MCP sunucusu**, Claude Desktop / Claude Code topluluğa doğrudan bağlanabilir
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

## Botlar, MCP ve bot API'si
Botlar topluluk menüsü → **Botlar ve yapay zekâ** bölümünden oluşturulur. Her botun bir belirteci vardır (`kvb.<botId>.<gizli>`).
Botlar topluluğu barındıran bilgisayardaki kovanda çalışır (kod: `src/main/bots.ts`).

- **MCP (Streamable HTTP):** `POST http://<kovan>:47820/mcp`, başlık `Authorization: Bearer <belirteç>`.
  Araçlar: `get_community_info`, `list_channels`, `read_messages`, `search_messages`, `list_members`, `send_message`, `edit_message`, `add_reaction`, `wait_for_messages`.
- **MCP (stdio köprüsü, Claude Desktop için):** `ELECTRON_RUN_AS_NODE=1 Kovan.exe <resources>/app.asar.unpacked/dist/main/mcp-bridge.js --url http://127.0.0.1:47820/mcp`, belirteç `KOVAN_TOKEN` ortam değişkeninde. Uygulamadaki "Claude Desktop'a ekle" düğmesi bunu kendisi yazar.
- **REST:** `Authorization: Bot <belirteç>` ile `GET /api/v1/channels`, `GET|POST /api/v1/channels/:kanal/messages`, `GET /api/v1/members`, `GET /api/v1/updates?timeout=25`.
- **WebSocket:** `ws://<kovan>:47820/ws` adresine `{ t: 'hello', user: { id: <botId> }, secret: <belirtecin son parçası> }` gönderen program bot olarak bağlanır ve tüm olayları alır.
- **Yapay zekâ botu:** Anthropic TypeScript SDK ile Messages API (araç döngüsü, isteğe bağlı web araması ve MCP bağlayıcısı). API anahtarı Electron `safeStorage` ile şifrelenir.
