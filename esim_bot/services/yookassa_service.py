import uuid
import aiohttp
import base64
from config import YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, YOOKASSA_RETURN_URL, WEBHOOK_HOST, WEBHOOK_PATH


def _auth_header() -> str:
    creds = f"{YOOKASSA_SHOP_ID}:{YOOKASSA_SECRET_KEY}"
    return "Basic " + base64.b64encode(creds.encode()).decode()


async def create_payment(amount_rub: int, description: str, order_id: int, user_id: int) -> dict | None:
    idempotency_key = str(uuid.uuid4())
    payload = {
        "amount": {"value": f"{amount_rub}.00", "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": YOOKASSA_RETURN_URL},
        "capture": True,
        "description": description,
        "metadata": {"order_id": str(order_id), "user_id": str(user_id)},
    }
    headers = {
        "Authorization": _auth_header(),
        "Idempotence-Key": idempotency_key,
        "Content-Type": "application/json",
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.yookassa.ru/v3/payments",
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            if resp.status == 200:
                return await resp.json()
            return None


async def get_payment(payment_id: str) -> dict | None:
    headers = {"Authorization": _auth_header()}
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"https://api.yookassa.ru/v3/payments/{payment_id}",
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status == 200:
                return await resp.json()
            return None
