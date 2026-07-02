#!/usr/bin/env bash
# JeffTUN VPN — первичная настройка. Запускать один раз в папке qipcall_vpn.
set -e

DOMAIN="${1:-qipcall.duckdns.org}"
SERVER_IP="${2:-$(curl -s https://api.ipify.org || echo 2.26.18.209)}"
SNI="${3:-www.microsoft.com}"

echo "==> Генерация ключей REALITY через xray..."
KEYS=$(docker run --rm teddysun/xray:latest xray x25519)
PRIV=$(echo "$KEYS" | grep -i private | awk '{print $NF}')
PUB=$(echo "$KEYS" | grep -i password -i -e public | awk '{print $NF}')
# у разных версий разные подписи полей — подстрахуемся
[ -z "$PRIV" ] && PRIV=$(echo "$KEYS" | sed -n '1p' | awk '{print $NF}')
[ -z "$PUB" ]  && PUB=$(echo "$KEYS" | sed -n '2p' | awk '{print $NF}')
SHORT_ID=$(openssl rand -hex 4)

echo "==> Запись .env..."
cat > .env <<EOF
PANEL_DOMAIN=$DOMAIN
SERVER_IP=$SERVER_IP
REALITY_SNI=$SNI
REALITY_PRIVATE_KEY=$PRIV
REALITY_PUBLIC_KEY=$PUB
REALITY_SHORT_ID=$SHORT_ID
DB_PASSWORD=vpnpass2026
ADMIN_PASSWORD=a1523415
SECRET_KEY=$(openssl rand -hex 16)
EOF

echo "==> Открываю порты в firewall (если ufw включён)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 443/tcp   || true
  ufw allow 80/tcp    || true
  ufw allow 8443/tcp  || true
  ufw allow 2053/tcp  || true
  ufw allow 2083/tcp  || true
  ufw allow 8388/tcp  || true
  ufw allow 8388/udp  || true
fi

echo ""
echo "════════════════════════════════════════════"
echo " Готово! Параметры записаны в .env"
echo "  Домен:        $DOMAIN"
echo "  IP:           $SERVER_IP"
echo "  REALITY SNI:  $SNI"
echo "  Public key:   $PUB"
echo "  Short ID:     $SHORT_ID"
echo "════════════════════════════════════════════"
echo ""
echo "Дальше:  docker compose up --build -d"
echo "Панель:  https://$DOMAIN:8443/admin   (пароль: a1523415)"
