#!/usr/bin/env bash
# Kovan merkezi sunucusunu kurar ya da günceller (Ubuntu + systemd + nginx).
# Kullanım (sunucuda root olarak):  curl -fsSL https://raw.githubusercontent.com/Xanaphian/discordumsu/main/server/kur.sh | bash
# Yalnızca şunlara dokunur: /opt/kovan, 'kovan' kullanıcısı, kovan.service, /etc/nginx/snippets/kovan.conf
# ve nginx site dosyasına tek bir 'include snippets/kovan.conf;' satırı (önce /root/yedek altına yedeklenir).
set -euo pipefail
REF="${KOVAN_REF:-main}"
BASE="https://raw.githubusercontent.com/Xanaphian/discordumsu/${REF}/server"
PORT="${KOVAN_PORT:-47900}"
SITE="${KOVAN_NGINX_SITE:-/etc/nginx/sites-available/larkcia-ev}"
DIR=/opt/kovan

echo "== Sunucu durumu"
free -m | sed -n 1,2p
uptime
command -v node >/dev/null || { echo "Node yüklü değil"; exit 1; }
echo "node $(node -v)"

if ss -ltn "( sport = :${PORT} )" | grep -q LISTEN && ! systemctl is-active --quiet kovan; then
  echo "Port ${PORT} başka bir şey tarafından kullanılıyor, durdum."; exit 1
fi

echo "== Kullanıcı ve klasör"
id kovan >/dev/null 2>&1 || useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin kovan
mkdir -p "$DIR/data"
curl -fsSL "$BASE/paket/kovan-server.js" -o "$DIR/kovan-server.js.new"
mv "$DIR/kovan-server.js.new" "$DIR/kovan-server.js"
if [ ! -f "$DIR/.env" ]; then
  umask 077
  {
    echo "KOVAN_PORT=${PORT}"
    echo "KOVAN_HOST=127.0.0.1"
    echo "KOVAN_DATA=${DIR}/data"
    echo "KOVAN_SECRET=$(openssl rand -hex 32)"
  } > "$DIR/.env"
fi
chown -R kovan:kovan "$DIR"
chmod 750 "$DIR"
chmod 600 "$DIR/.env"

echo "== systemd servisi"
cat > /etc/systemd/system/kovan.service <<UNIT
[Unit]
Description=Kovan sohbet sunucusu
After=network-online.target
Wants=network-online.target

[Service]
User=kovan
Group=kovan
WorkingDirectory=${DIR}
EnvironmentFile=${DIR}/.env
ExecStart=$(command -v node) ${DIR}/kovan-server.js
Restart=always
RestartSec=3
MemoryMax=768M
CPUQuota=100%
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DIR}/data

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable kovan >/dev/null 2>&1
systemctl restart kovan
sleep 2
curl -fsS "http://127.0.0.1:${PORT}/info" && echo

echo "== nginx"
cat > /etc/nginx/snippets/kovan.conf <<NGX
# Kovan sohbet sunucusu (kovan.service, port ${PORT})
location = /kovan { return 301 /kovan/; }
location /kovan/ {
    proxy_pass http://127.0.0.1:${PORT}/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    proxy_buffering off;
    proxy_request_buffering off;
    client_max_body_size 200m;
}
NGX
if ! grep -q "include snippets/kovan.conf;" "$SITE"; then
  mkdir -p /root/yedek
  BK="/root/yedek/nginx-$(basename "$SITE")-$(date +%Y%m%d-%H%M%S).conf"
  cp "$SITE" "$BK"
  echo "nginx ayarı yedeklendi: $BK"
  # 443 bloğundaki 'location / {' satırının hemen önüne ekle (tek olmalı)
  n=$(grep -c "^[[:space:]]*location / {" "$SITE" || true)
  if [ "$n" != "1" ]; then echo "Beklenmedik nginx ayarı ('location / {' sayısı: $n). Elle eklemek gerekiyor."; exit 1; fi
  sed -i "0,/^\([[:space:]]*\)location \/ {/s//\1include snippets\/kovan.conf;\n\1location \/ {/" "$SITE"
  if ! nginx -t; then
    cp "$BK" "$SITE"
    echo "nginx denetimi geçmedi, eski ayar geri yüklendi."; exit 1
  fi
fi
nginx -t && systemctl reload nginx
sleep 1
echo "== Dışarıdan deneme"
curl -fsS "https://45-87-173-18.sslip.io/kovan/info" && echo
systemctl --no-pager --lines=3 status kovan | head -12
echo "Tamam."
