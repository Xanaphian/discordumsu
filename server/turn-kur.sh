#!/usr/bin/env bash
# Naphian ses aktarma sunucusunu (TURN, coturn) kurar ya da günceller.
# Ne işe yarar: iki kişi birbirine doğrudan bağlanamadığında (katı modem, yurt/okul/şirket ağı, mobil ağ)
# ses ve yayın bu sunucu üstünden geçer. Doğrudan bağlanabilenler aktarmayı hiç kullanmaz.
#
# Kullanım (sunucuda root olarak): kur.sh'ı KOVAN_TURN=1 ile çalıştırmak yeterli; kendi başına da çalışır.
# Yalnızca şunlara dokunur:
#   - coturn paketi (kendi 'turnserver' kullanıcısı ve kendi coturn.service'i ile gelir)
#   - /etc/turnserver.conf (varsa önce /root/yedek altına yedeklenir)
#   - /etc/systemd/system/coturn.service.d/xanaphian.conf (bellek ve işlemci sınırı)
#   - /opt/kovan/.env içindeki KOVAN_TURN_URLS ve KOVAN_TURN_SECRET satırları
#   - ufw etkinse: 3478/udp, 3478/tcp ve aktarma UDP aralığı için izin
# nginx'e, Larkcia botuna, Scuttle'a ve başka hiçbir servise dokunmaz. 443 ve 3100 kullanılmaz.
# Gizli anahtar sunucuda üretilir, yalnız yukarıdaki iki dosyaya yazılır ve ekrana basılmaz.
set -euo pipefail

IP="${KOVAN_PUBLIC_IP:-45.87.173.18}"
PORT="${KOVAN_TURN_PORT:-3478}"
MINP="${KOVAN_TURN_MIN_PORT:-49160}"
MAXP="${KOVAN_TURN_MAX_PORT:-50159}"
DIR=/opt/kovan
CONF=/etc/turnserver.conf

[ "$(id -u)" = "0" ] || { echo "root olarak çalıştır."; exit 1; }
[ -f "$DIR/.env" ] || { echo "$DIR/.env yok: önce kur.sh ile sohbet sunucusunu kur."; exit 1; }

echo "== TURN: sunucu durumu (kurulumdan önce)"
free -m | sed -n 1,2p
uptime
echo "işlemci çekirdeği: $(nproc)"
df -h / | sed -n 2p
AVAIL=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
if [ "$AVAIL" -lt 200 ]; then
  echo "Kullanılabilir bellek ${AVAIL} MB: TURN kurulmadı (en az 200 MB boş bellek gerekir)."; exit 1
fi

# Port başka bir şeyde mi? (coturn'un kendisi dinliyorsa sorun değil)
if ss -lntuH "( sport = :${PORT} )" 2>/dev/null | grep -q . && ! systemctl is-active --quiet coturn; then
  echo "Port ${PORT} başka bir şey tarafından kullanılıyor, TURN kurulmadı."; exit 1
fi

echo "== TURN: coturn paketi"
if ! command -v turnserver >/dev/null; then
  # Paket kurulurken servis ayarsız (kimlik sormayan) haliyle bir an bile açılmasın: ayar yazılana kadar maskeli kalır
  systemctl mask coturn >/dev/null 2>&1 || true
  trap 'systemctl unmask coturn >/dev/null 2>&1 || true' EXIT
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq coturn
fi
turnserver --version 2>/dev/null | head -1 || true

# Gizli anahtar: daha önce kurulduysa aynısı kalır (bağlı kullanıcıların kimliği geçerli kalsın)
SECRET=""
if [ -f "$CONF" ]; then
  SECRET=$(sed -n 's/^static-auth-secret=//p' "$CONF" | head -1)
  mkdir -p /root/yedek
  cp -a "$CONF" "/root/yedek/turnserver.conf-$(date +%Y%m%d-%H%M%S)"
fi
[ -n "$SECRET" ] || SECRET=$(openssl rand -hex 32)

# Sunucunun kendi adresi dış adresten farklıysa (NAT arkasındaysa) coturn'a eşleme verilir
LOCAL=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
EXT=""
if [ -n "$LOCAL" ] && [ "$LOCAL" != "$IP" ]; then EXT="external-ip=${IP}/${LOCAL}"; fi

# Sürüm destekliyorsa ek sıkılaştırma seçenekleri (yansıtma saldırılarında kullanılmasın)
EXTRA=""
for o in no-rfc5780 no-stun-backward-compatibility response-origin-only-with-rfc5780 no-software-attribute; do
  if turnserver -h 2>&1 | grep -q -- "--$o"; then EXTRA="${EXTRA}${o}"$'\n'; fi
done

umask 077
cat > "$CONF" <<CFG
# Naphian ses aktarma sunucusu (server/turn-kur.sh yazar; elle değiştirme, yeniden kurulumda üstüne yazılır)
listening-port=${PORT}
min-port=${MINP}
max-port=${MAXP}
${EXT}
fingerprint
realm=xanaphian
# Süreli kimlik: sohbet sunucusu her kullanıcıya birkaç saatlik kimlik üretir, kalıcı parola yoktur
use-auth-secret
static-auth-secret=${SECRET}
stale-nonce=600
# Yalnız internet üzerindeki kişilere aktarma: sunucunun kendi iç ağına ve yerel servislerine ulaşılamaz
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
# Sınırlar: kişi başı ve toplam bağlantı, bağlantı başına bant genişliği (bayt/sn; 1 MB/sn = 8 Mbit)
user-quota=60
total-quota=600
max-bps=1000000
# Şifreli (TLS) uç ve yönetim arayüzü kapalı: sertifika ve ek port gerekmez. Ses zaten uçtan uca şifrelidir (DTLS-SRTP).
no-tls
no-dtls
no-cli
syslog
${EXTRA}
CFG
chown root:turnserver "$CONF" 2>/dev/null || true
chmod 640 "$CONF"

# Eski paketlerde servis bu dosyayla açılır
if [ -f /etc/default/coturn ]; then
  grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi

mkdir -p /etc/systemd/system/coturn.service.d
cat > /etc/systemd/system/coturn.service.d/xanaphian.conf <<UNIT
# Diğer servisleri (Larkcia botu, Scuttle, sohbet sunucusu) etkilemesin diye kaynak sınırı
[Service]
MemoryMax=256M
CPUQuota=60%
Restart=always
RestartSec=3
UNIT
systemctl unmask coturn >/dev/null 2>&1 || true
trap - EXIT
systemctl daemon-reload
systemctl enable coturn >/dev/null 2>&1
systemctl restart coturn
sleep 2
if ! systemctl is-active --quiet coturn; then
  echo "coturn başlamadı:"; journalctl -u coturn --no-pager -n 15 | sed 's/static-auth-secret=.*/static-auth-secret=…/'
  exit 1
fi

echo "== TURN: güvenlik duvarı"
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "${PORT}/udp" >/dev/null
  ufw allow "${PORT}/tcp" >/dev/null
  ufw allow "${MINP}:${MAXP}/udp" >/dev/null
  echo "ufw: ${PORT}/udp, ${PORT}/tcp ve ${MINP}-${MAXP}/udp açıldı."
else
  echo "ufw etkin değil; sunucuda başka bir güvenlik duvarı ya da sağlayıcı panelinde port kısıtı varsa"
  echo "${PORT}/udp, ${PORT}/tcp ve ${MINP}-${MAXP}/udp açık olmalı."
fi

echo "== TURN: sohbet sunucusuna tanıtma"
# .env içinde satırı değiştirir ya da ekler (değer ekrana basılmaz)
setenv() {
  local k="$1" v="$2" tmp
  tmp=$(mktemp)
  grep -v "^${k}=" "$DIR/.env" > "$tmp" || true
  echo "${k}=${v}" >> "$tmp"
  cat "$tmp" > "$DIR/.env"
  rm -f "$tmp"
}
setenv KOVAN_TURN_URLS "turn:${IP}:${PORT}?transport=udp,turn:${IP}:${PORT}?transport=tcp"
setenv KOVAN_TURN_SECRET "$SECRET"
chown kovan:kovan "$DIR/.env"
chmod 600 "$DIR/.env"
systemctl restart kovan
sleep 2

echo "== TURN: denetim"
systemctl is-active coturn kovan
ss -lntuH "( sport = :${PORT} )" | awk '{print $1, $5}' | sort -u
# Gerçek bir aktarma denemesi: süreli kimlikle sunucudan adres istenir
if command -v turnutils_uclient >/dev/null; then
  if timeout 15 turnutils_uclient -y -n 1 -m 1 -l 100 -W "$SECRET" -u deneme -p "$PORT" "${LOCAL:-$IP}" >/tmp/turn-deneme.log 2>&1; then
    echo "aktarma denemesi: çalışıyor"
  else
    echo "aktarma denemesi tamamlanamadı (sunucu kendi kendine denediği için olabilir); servis çalışıyor, uygulamadan denenmeli."
  fi
  rm -f /tmp/turn-deneme.log
fi
free -m | sed -n 1,2p
echo "TURN tamam: ${IP}:${PORT} (udp+tcp), aktarma aralığı ${MINP}-${MAXP}/udp."
