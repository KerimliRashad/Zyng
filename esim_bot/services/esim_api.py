import math
import time
import logging
import aiohttp
from config import ESIM_API_KEY, ESIM_API_URL, MARKUP_PERCENT, STARS_PER_USD

HEADERS = {
    "RT-AccessCode": ESIM_API_KEY,
    "Content-Type": "application/json",
}

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
    return max(math.ceil(price_usd * STARS_PER_USD), 1)


async def _post(endpoint: str, payload: dict) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{ESIM_API_URL}/{endpoint}",
            json=payload,
            headers=HEADERS,
            timeout=aiohttp.ClientTimeout(total=20),
        ) as resp:
            return await resp.json()


async def get_countries_by_region(region_code: str) -> list[dict]:
    data = await _post("location/list", {})
    if not data.get("success"):
        logging.error(f"location/list failed: {data}")
        return []

    for loc in (data["obj"].get("locationList") or []):
        if loc.get("code") == region_code:
            sub = loc.get("subLocationList") or []
            return sorted(
                [{"slug": s["code"], "name": s["name"]} for s in sub if s.get("code")],
                key=lambda x: x["name"],
            )
    return []


async def get_packages_for_country(location_code: str) -> list[dict]:
    # locationCode фильтрует пакеты по стране/региону
    data = await _post("package/list", {"locationCode": location_code})
    logging.info(f"package/list [{location_code}] success={data.get('success')} errorCode={data.get('errorCode')}")

    if not data.get("success") or not data.get("obj"):
        logging.error(f"package/list failed: {data}")
        return []

    packages = data["obj"].get("packageList") or []
    logging.info(f"package/list [{location_code}] got {len(packages)} packages")

    result = []
    for pkg in packages:
        price_raw = pkg.get("price", 0) or 0
        price_usd = float(price_raw) / 10000
        if price_usd <= 0:
            continue

        duration = pkg.get("duration", 0)
        data_bytes = pkg.get("volume", 0) or 0
        if data_bytes == 0:
            data_str = "Безлимит"
        elif data_bytes >= 1073741824:
            data_str = f"{data_bytes / 1073741824:.0f} ГБ"
        else:
            data_str = f"{data_bytes / 1048576:.0f} МБ"

        pkg_code = pkg.get("packageCode", "") or pkg.get("slug", "")
        if not pkg_code:
            continue

        result.append({
            "packageId": pkg_code,
            "name": pkg.get("name", pkg_code),
            "data": data_str,
            "days": duration,
            "price_usd": price_usd,
            "price_stars": usd_to_stars(price_usd),
        })

    return sorted(result, key=lambda x: x["price_stars"])


async def order_esim(package_code: str) -> tuple[dict | None, str]:
    """Заказывает eSIM. Возвращает (профиль, сообщение_об_ошибке)."""
    import asyncio
    transaction_id = f"tg_{int(time.time() * 1000)}"
    payload = {
        "transactionId": transaction_id,
        "packageInfoList": [{"packageCode": package_code, "count": 1}],
    }
    data = await _post("esim/order", payload)
    logging.info(f"esim/order [{package_code}] full response: {data}")

    if not data.get("success"):
        err = data.get("errorMsg") or data.get("errorCode") or str(data)
        logging.error(f"esim/order failed: {data}")
        return None, f"API error: {err}"

    if not data.get("obj"):
        return None, "Empty response from API"

    order_no = data["obj"].get("orderNo")
    esim_list = data["obj"].get("esimList") or []

    if esim_list:
        return esim_list[0], ""

    if not order_no:
        return None, "No orderNo in response"

    # eSIM provisioning is async — retry up to 10 times over 30 seconds
    for attempt in range(10):
        await asyncio.sleep(3)
        result, err = await query_esim_by_order(order_no)
        if result:
            return result, ""
        logging.info(f"esim/query attempt {attempt+1} not ready: {err}")

    return None, f"eSIM not provisioned after retries (orderNo={order_no})"


async def query_esim_by_order(order_no: str) -> tuple[dict | None, str]:
    """Запрашивает eSIM профиль по номеру заказа."""
    data = await _post("esim/query", {"orderNo": order_no})
    logging.info(f"esim/query [{order_no}] response: {data}")

    if not data.get("success"):
        return None, data.get("errorMsg", "failed")

    if not data.get("obj"):
        return None, "empty obj"

    esim_list = data["obj"].get("esimList") or []
    if not esim_list:
        return None, "esimList empty"

    esim = esim_list[0]
    # Normalize field names across API versions
    if not esim.get("smdpAddress"):
        esim["smdpAddress"] = esim.get("smdpAddr") or esim.get("rspAddr") or ""
    if not esim.get("activationCode"):
        esim["activationCode"] = (
            esim.get("matchingId") or esim.get("ac") or esim.get("confirmationCode") or ""
        )
    if not esim.get("qrCodeUrl"):
        esim["qrCodeUrl"] = esim.get("qrCode") or esim.get("qrurl") or ""
    # Build LPA string if we have the parts
    if esim.get("smdpAddress") and esim.get("activationCode") and not esim.get("lpaCode"):
        esim["lpaCode"] = f"LPA:1${esim['smdpAddress']}${esim['activationCode']}"

    logging.info(f"esim/query [{order_no}] normalized: iccid={esim.get('iccid')} smdp={esim.get('smdpAddress')} ac={esim.get('activationCode')}")
    return esim, ""


async def query_esim(iccid: str) -> dict | None:
    data = await _post("esim/query", {"iccid": iccid})
    if data.get("success"):
        return data.get("obj")
    return None
