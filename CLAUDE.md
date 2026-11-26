# Xanaphian (discordumsu) — Claude için proje rehberi

Discord benzeri Windows masaüstü uygulaması: Electron + React (Vite) + TypeScript. Kod içinde eski adı **Kovan** geçer (`window.kovan`, `KOVAN_*`, `%APPDATA%/Kovan`); ikisi aynı şey.
Arayüz metinleri, sürüm notları, PR başlıkları ve kullanıcıyla konuşma **Türkçe**. Kullanıcı yazılımcı değil: sade anlat, teknik terimleri açıkla.

## Kullanım tasarrufu (önemli)
Kullanıcının Claude kullanım hakkı sınırlı. Bu yüzden:
- Bu dosyadaki haritayı kullan; projeyi baştan keşfetme. Dosyayı bütünüyle değil, `grep -n` ile bulup yalnızca ilgili satır aralığını oku. Özellikle büyük dosyalar: `src/main/hub.ts` (~3300 satır), `src/renderer/components/Chat.tsx` (~1700), `src/main/main.ts` (~850), `src/shared/protocol.ts` (~700).
- Ekran görüntüsü, görsel, ses ölçümü, birden çok seçeneği karşılaştırma ve alt ajan (subagent) **yalnızca kullanıcı isterse** ya da işin kendisi görsel/ses kalitesiyse.
- Tek bir iyi çözümü uygula; alternatifleri ayrıca denemeden önce sor.
- Kısa yaz: işin sonunda 2–4 cümle, ne değişti ve kullanıcının yapması gereken bir şey var mı.

## Klasör haritası
- `src/main/` — Electron ana süreç.
  - `main.ts` pencere, IPC kayıtları · `hub.ts` yerleşik sunucu ("kovan", port 47820: topluluklar, mesajlar, yetkiler, WebSocket, REST, MCP)
  - `bots.ts` botlar ve yapay zekâ botu · `mcp-bridge.ts` Claude Desktop stdio köprüsü
  - `activity.ts` oyun/müzik etkinliği · `spotify.ts` Spotify hesabı (PKCE, Client ID gömülü, redirect `http://127.0.0.1:47833/spotify`) · `retrofy.ts`
  - `acilis.ts` açılış ekranı penceresi; sayfa ve Enes'in logo videosu `src/main/acilis-ekrani/` (index.html, acilis.mp4, ilk-kare.webp; kurulumda asar dışında)
  - `updater.ts` GitHub Releases güncellemesi · `overlay.ts` oyun içi kaplama · `davetSayfasi.ts` davet bağlantıları
- `src/preload/preload.ts` — `window.kovan` köprüsü (ana süreç ↔ arayüz). Yeni IPC = main.ts + preload.ts + renderer tarafı.
- `src/shared/` — iki tarafın ortak türleri; `protocol.ts` mesaj/olay biçimleri.
- `src/renderer/` — React arayüzü. `App.tsx` kök · `components/` ekranlar (Chat, Sidebar, Settings, VoiceSettings, ActivitySettings, profile/…) · `lib/` durum (`store.ts`), ağ (`net.ts`), ses (`voice.ts`, `ses/` gürültü engelleme) · `space/` 3D oda · `styles/`.
- `server/` — isteğe bağlı bulut sunucusu (`node.ts`, `site/`), `npm run build:server` ile derlenir.
- `test/sunucu/*.test.mjs` sunucu kuralları · `test/surum` sürüm denetimi · `test/duman` uygulamayı açıp gezen duman testi.

## Komutlar
- `npm run typecheck` · `npm test` (sürüm + sunucu testleri) · `npm run build`
- Bu bulut oturumunda genelde `node_modules` yok ve paket kurulamaz: yalnız `node test/surum/surum.mjs` yerelde çalışır. Asıl doğrulama PR'daki **"Otomatik sınama"** iş akışıdır; sonucunu `gh api repos/Xanaphian/discordumsu/actions/runs?branch=<dal>` ile kontrol et.

## Sürüm ve PR kuralları
- Uygulamayı değiştiren her iş bir sürüm artırır (yalnız belge/CLAUDE.md değişikliği artırmaz; sürüm yayını yalnız `package.json` değişince tetiklenir): `package.json` ve `package-lock.json` (kök `version` + `packages[""].version`) birlikte. Küçük düzeltme = yama (1.60.0 → 1.60.1), yeni özellik = ara sürüm.
- Her sürüme `release-notes/<sürüm>.md`: üstte `<!-- tarih: YYYY-AA-GG -->`, `<!-- baslik: … -->`, isteğe bağlı `<!-- gorsel: dosya.webp | açıklama -->` (görseller `release-notes/gorseller/<sürüm>/`), sonra `## Xanaphian <sürüm>` ve kullanıcı diliyle maddeler.
- Dal adı `claude/<kısa-ad>`, PR başlığı Türkçe ve sonunda `(vX.Y.Z)`. Birleştirme **squash**. `main`'e giren sürüm "Sürüm yayınla" iş akışıyla otomatik yayınlanır.
- GraphQL kapalı: `gh pr …` yerine `gh api repos/Xanaphian/discordumsu/pulls…` (REST) kullan.
- Testler geçen basit işleri birleştirebilirsin. Sesi, gizliliği, performansı ya da var olan davranışı belirgin şekilde değiştiren işlerde birleştirmeden önce kullanıcıya sor.
