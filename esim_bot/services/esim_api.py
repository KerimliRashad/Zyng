import math
import aiohttp
from config import ESIM_API_KEY, ESIM_API_URL, MARKUP_PERCENT, STARS_PER_USD

HEADERS = {
    "RT-AccessCode": ESIM_API_KEY,
    "Content-Type": "application/json",
}

# Коды регионов из /location/list API
REGIONS = {
    "🇪🇺 Европа": "EU-42",
    "🌏 Азия": "AS-31",
    "🌍 Африка": "AF-29",
    "🌎 Америка": "SA-18",
    "🌐 Глобальный": "GL-144",
    "🏖 Ближний Восток": "ME-13",
}


def apply_markup(price_usd: float) -> int:
    usd_to_rub = 90
    rub = price_usd * usd_to_rub * (1 + MARKUP_PERCENT / 100)
    return int(round(rub / 10) * 10)


def usd_to_stars(price_usd: float) -> int:
    stars = math.ceil(price_usd * STARS_PER_USD)
    return max(stars, 1)


async def _post(endpoint: str, payload: dict) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{ESIM_API_URL}/{endpoint}",
            json=payload,
            headers=HEADERS,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            return await resp.json()


async def get_countries_by_region(region_code: str) -> list[dict]:
    data = await _post("location/list", {})
    if not data.get("success"):
        return []

    locations = data["obj"].get("locationList", [])
    for loc in locations:
        if loc.get("code") == region_code:
            sub = loc.get("subLocationList") or []
            return sorted(
                [{"slug": s["code"], "name": s["name"]} for s in sub if s.get("code")],
                key=lambda x: x["name"],
            )
    return []


async def get_packages_for_country(slug: str) -> list[dict]:
    data = await _post("package/list", {"locationCode": slug, "type": 0})
    if not data.get("success") or not data.get("obj"):
        return []

    result = []
    for pkg in data["obj"].get("packageList", []):
        price_usd = float(pkg.get("price", 0)) / 10000
        if price_usd <= 0:
            continue
        duration = pkg.get("duration", 0)
        data_bytes = pkg.get("volume", 0)
        data_gb = data_bytes / 1073741824 if data_bytes else 0
        data_mb = data_bytes / 1048576 if data_bytes else 0
        if data_bytes == 0:
            data_str = "Безлимит"
        elif data_gb >= 1:
            data_str = f"{data_gb:.0f} ГБ"
        else:
            data_str = f"{data_mb:.0f} МБ"

        result.append({
            "packageId": pkg.get("packageCode", ""),
            "name": pkg.get("name", ""),
            "data": data_str,
            "days": duration,
            "price_usd": price_usd,
            "price_rub": apply_markup(price_usd),
            "price_stars": usd_to_stars(price_usd),
        })

    return sorted(result, key=lambda x: x["price_stars"])


async def order_esim(package_id: str, count: int = 1) -> dict | None:
    import time
    payload = {
        "transactionId": f"tg_{package_id}_{int(time.time()*1000)}",
        "packageInfoList": [{"packageCode": package_id, "count": count}],
    }
    data = await _post("esim/order", payload)
    if data.get("success") and data.get("obj"):
        esim_list = data["obj"].get("esimList", [])
        return esim_list[0] if esim_list else None
    return None


async def query_esim(iccid: str) -> dict | None:
    data = await _post("esim/query", {"iccid": iccid})
    if data.get("success"):
        return data.get("obj")
    return None
