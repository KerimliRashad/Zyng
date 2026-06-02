import logging
import aiohttp
from config import XROCKET_API_KEY

XROCKET_URL = "https://pay.xrocket.tg"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {XROCKET_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def create_invoice(amount_usd: float, description: str, payload: str) -> dict | None:
    if not XROCKET_API_KEY:
        logging.error("XROCKET_API_KEY not configured")
        return None

    amount = max(round(amount_usd, 2), 1.0)  # xRocket minimum ~$1

    body = {
        "amount": amount,
        "minPayment": amount,
        "currency": "USDT",
        "numPayments": 1,
        "description": description[:255],
        "payload": payload[:255],
        "expiredIn": 3600,  # 1 hour
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{XROCKET_URL}/tg-invoices",
            json=body,
            headers=_headers(),
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            data = await resp.json()
            logging.info(f"xRocket create_invoice: {data}")
            if data.get("success"):
                return data["data"]
            logging.error(f"xRocket create_invoice failed: {data}")
            return None


async def get_invoice_status(invoice_id: str) -> str | None:
    """Returns 'active', 'paid', 'expired', or None on error."""
    if not XROCKET_API_KEY:
        return None
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{XROCKET_URL}/tg-invoices/{invoice_id}",
            headers=_headers(),
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            data = await resp.json()
            if data.get("success"):
                return data["data"].get("status")
            return None
