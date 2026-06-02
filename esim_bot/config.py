import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_IDS = [int(x) for x in os.getenv("ADMIN_IDS", "0").split(",") if x.strip()]

ESIM_API_KEY = os.getenv("ESIM_API_KEY", "")
ESIM_API_URL = os.getenv("ESIM_API_URL", "https://api.esimaccess.com/api/v1/open")

# Stars: сколько Stars за 1 USD (включая наценку)
# 1 Star ≈ $0.013 → без наценки ~77 Stars/USD
# С наценкой 30% → ~100 Stars/USD
STARS_PER_USD = int(os.getenv("STARS_PER_USD", "100"))

MARKUP_PERCENT = float(os.getenv("MARKUP_PERCENT", "30"))
