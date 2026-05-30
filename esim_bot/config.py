import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_IDS = [int(x) for x in os.getenv("ADMIN_IDS", "0").split(",") if x.strip()]

ESIM_API_KEY = os.getenv("ESIM_API_KEY", "")
ESIM_API_URL = os.getenv("ESIM_API_URL", "https://api.esimaccess.com/api/v1/open")

YOOKASSA_SHOP_ID = os.getenv("YOOKASSA_SHOP_ID", "")
YOOKASSA_SECRET_KEY = os.getenv("YOOKASSA_SECRET_KEY", "")
YOOKASSA_RETURN_URL = os.getenv("YOOKASSA_RETURN_URL", "https://t.me/bot")

WEBHOOK_HOST = os.getenv("WEBHOOK_HOST", "")
WEBHOOK_PATH = os.getenv("WEBHOOK_PATH", "/yookassa-webhook")
WEB_PORT = int(os.getenv("WEB_PORT", "8080"))

MARKUP_PERCENT = float(os.getenv("MARKUP_PERCENT", "30"))
