# Kovan davet rehberi

`xanaphian/s3gas25` gibi adlı davet kodlarındaki adı (`xanaphian`), o kişinin Kovan'ına ulaşılabilecek adreslere çeviren küçük bir Cloudflare Worker.

- `PUT /v1/ad/<ad>` `{ key, hosts: ["192.168.1.5:47820"], port }`: adı kaydeder ya da günceller. İlk kaydeden sahibi olur; sonraki güncellemeler aynı `key` ile yapılır. İsteği gönderenin dış IP'si de eklenir.
- `GET /v1/ad/<ad>`: `{ hosts: [...] }` döner.
- `DELETE /v1/ad/<ad>` `{ key }`: adı bırakır.

Kayıtlar 60 gün kullanılmazsa silinir. Topluluk, mesaj veya davet kodu saklanmaz.

## Kurulum

GitHub deposuna iki gizli değer eklenir: `CLOUDFLARE_API_TOKEN` ("Edit Cloudflare Workers" şablonuyla) ve `CLOUDFLARE_ACCOUNT_ID`. Sonra **Actions → Davet rehberi → Run workflow** çalıştırılır ya da bu klasörde bir değişiklik main'e itilir. İş akışı KV alanını gerekirse oluşturur ve Worker'ı `kovan-davet` adıyla yayınlar; adresi iş özetine yazar.
