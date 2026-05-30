import aiohttp
from config import ESIM_API_KEY, ESIM_API_URL, MARKUP_PERCENT

HEADERS = {
    "RT-AccessCode": ESIM_API_KEY,
    "Content-Type": "application/json",
}

REGIONS = {
    "🇪🇺 Европа": "Europe",
    "🌏 Азия": "Asia",
    "🌍 Африка": "Africa",
    "🌎 Америка": "America",
    "🌐 Глобальный": "Global",
    "🏖 Ближний Восток": "Middle East",
}


def apply_markup(price_usd: float) -> int:
    usd_to_rub = 90
    rub = price_usd * usd_to_rub * (1 + MARKUP_PERCENT / 100)
    return int(round(rub / 10) * 10)


async def get_packages(location: str = None, country: str = None) -> list[dict]:
    payload = {"type": 0}
    if location:
        payload["locationCode"] = location
    if country:
        payload["slug"] = country

    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{ESIM_API_URL}/package/list",
            json=payload,
            headers=HEADERS,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            data = await resp.json()
            if data.get("success") and data.get("obj"):
                return data["obj"].get("packageList", [])
            return []


async def get_countries_by_region(region_en: str) -> list[dict]:
    packages = await get_packages()
    countries = {}
    for pkg in packages:
        location = pkg.get("location", "")
        slug = pkg.get("slug", "")
        name = pkg.get("name", "")
        area_list = pkg.get("areaList", [])

        if not slug or not name:
            continue

        region_match = any(
            region_en.lower() in (a.get("areaName", "") or "").lower()
            for a in area_list
        )
        if region_match and slug not in countries:
            country_name = area_list[0].get("areaName", name) if area_list else name
            countries[slug] = country_name

    return [{"slug": k, "name": v} for k, v in sorted(countries.items(), key=lambda x: x[1])]


async def get_packages_for_country(slug: str) -> list[dict]:
    packages = await get_packages(country=slug)
    result = []
    for pkg in packages:
        price_usd = float(pkg.get("price", 0)) / 10000
        price_rub = apply_markup(price_usd)
        duration = pkg.get("duration", 0)
        data_mb = pkg.get("volume", 0)
        data_gb = data_mb / 1024 if data_mb else 0
        data_str = "Безлимит" if data_mb == 0 else f"{data_gb:.0f} ГБ" if data_gb >= 1 else f"{data_mb} МБ"

        result.append({
            "packageId": pkg.get("packageCode", ""),
            "name": pkg.get("name", ""),
            "data": data_str,
            "days": duration,
            "price_rub": price_rub,
            "price_usd": price_usd,
        })

    return sorted(result, key=lambda x: x["price_rub"])


async def order_esim(package_id: str, count: int = 1) -> dict | None:
    payload = {
        "transactionId": f"tg_{package_id}_{id(package_id)}",
        "packageInfoList": [{"packageCode": package_id, "count": count, "price": 0}],
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{ESIM_API_URL}/esim/order",
            json=payload,
            headers=HEADERS,
            timeout=aiohttp.ClientTimeout(total=20),
        ) as resp:
            data = await resp.json()
            if data.get("success") and data.get("obj"):
                esim_list = data["obj"].get("esimList", [])
                return esim_list[0] if esim_list else None
            return None


async def query_esim(iccid: str) -> dict | None:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{ESIM_API_URL}/esim/query",
            json={"iccid": iccid},
            headers=HEADERS,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            data = await resp.json()
            if data.get("success"):
                return data.get("obj")
            return None
