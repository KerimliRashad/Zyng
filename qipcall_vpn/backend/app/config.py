import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://vpn:vpnpass2026@db:5432/vpndb")
SECRET_KEY = os.getenv("SECRET_KEY", "qipcall-vpn-secret-2026")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "a1523415")

PANEL_DOMAIN = os.getenv("PANEL_DOMAIN", "qipcall.duckdns.org")
SERVER_IP = os.getenv("SERVER_IP", "2.26.18.209")

# REALITY параметры (генерируются скриптом setup.sh)
REALITY_PRIVATE_KEY = os.getenv("REALITY_PRIVATE_KEY", "")
REALITY_PUBLIC_KEY = os.getenv("REALITY_PUBLIC_KEY", "")
REALITY_SHORT_ID = os.getenv("REALITY_SHORT_ID", "0123abcd")
REALITY_SNI = os.getenv("REALITY_SNI", "www.microsoft.com")

# Порты inbound'ов xray
PORT_REALITY = 443
PORT_VMESS_WS = 2053
PORT_TROJAN = 2083
PORT_SHADOWSOCKS = 8388

# Путь к конфигу xray (общий volume с контейнером xray)
XRAY_CONFIG_PATH = os.getenv("XRAY_CONFIG_PATH", "/app/xray/config.json")
