# Davet bağlantıları: xanaphian.com tarafı

Davet bağlantıları `https://xanaphian.com/davet/<kod>` biçimindedir (`src/shared/davetBaglanti.ts` → `INVITE_LINK_BASE`).
Sayfayı sohbet sunucusu üretir (`src/main/davetSayfasi.ts`, VDS'te `/kovan/davet/<kod>`); xanaphian.com yalnız aktarır.

Site (ScuttleLol, Cloudflare Pages) tarafında iki değişiklik gerekir; site kaynağı Enes'in bilgisayarında `C:\Users\Kadir\lol-biyografi`:

1. `functions/davet/[[yol]].js` → bu klasördeki dosyanın kopyası.
2. `_routes.json` içindeki `include` listesine `"/davet/*"` eklenir (yoksa yol statik aranır ve 404 verir).

Sonra site her zamanki yolla yayınlanır: Git Bash'te `bash vds/site-gonder.sh --yayinla`.

Sıra önemli değil: sunucu henüz güncellenmediyse aktarıcı sade bir yedek sayfa gösterir ("Xanaphian'da aç" yine çalışır,
çünkü uygulama kodu kendisi çözer). Alan adı değişirse `INVITE_LINK_BASE` ve aktarıcının yolu birlikte değişir.
