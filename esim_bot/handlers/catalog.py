from aiogram import Router, F
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from services.esim_api import REGIONS, get_countries_by_region, get_packages_for_country

router = Router()

COUNTRIES_PER_PAGE = 10


def regions_kb() -> InlineKeyboardMarkup:
    buttons = []
    for label in REGIONS:
        buttons.append([InlineKeyboardButton(text=label, callback_data=f"region:{label}")])
    buttons.append([InlineKeyboardButton(text="◀️ Назад", callback_data="main_menu")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.callback_query(F.data == "esim_regions")
async def show_regions(callback: CallbackQuery):
    await callback.message.edit_text(
        "🌍 <b>Выберите регион:</b>",
        reply_markup=regions_kb(),
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("region:"))
async def show_countries(callback: CallbackQuery):
    region_label = callback.data.split(":", 1)[1]
    region_code = REGIONS.get(region_label, "")

    await callback.message.edit_text("⏳ Загружаю страны...", parse_mode="HTML")

    countries = await get_countries_by_region(region_code)
    if not countries:
        await callback.message.edit_text(
            "😔 Нет доступных стран для этого региона.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="◀️ Назад", callback_data="esim_regions")]
            ]),
        )
        return

    await _show_countries_page(callback, region_label, countries, 0)


async def _show_countries_page(callback: CallbackQuery, region_label: str, countries: list, page: int):
    start = page * COUNTRIES_PER_PAGE
    end = start + COUNTRIES_PER_PAGE
    page_countries = countries[start:end]

    buttons = []
    for c in page_countries:
        buttons.append([InlineKeyboardButton(
            text=c["name"],
            callback_data=f"country:{c['slug']}"
        )])

    nav = []
    if page > 0:
        nav.append(InlineKeyboardButton(text="◀️", callback_data=f"cpage:{region_label}:{page-1}"))
    if end < len(countries):
        nav.append(InlineKeyboardButton(text="▶️", callback_data=f"cpage:{region_label}:{page+1}"))
    if nav:
        buttons.append(nav)

    buttons.append([InlineKeyboardButton(text="◀️ Регионы", callback_data="esim_regions")])

    await callback.message.edit_text(
        f"🌍 <b>{region_label}</b>\nВыберите страну ({len(countries)} доступно):",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("country:"))
async def show_packages(callback: CallbackQuery):
    slug = callback.data.split(":", 1)[1]

    await callback.message.edit_text("⏳ Загружаю тарифы...")

    packages = await get_packages_for_country(slug)
    if not packages:
        await callback.message.edit_text(
            "😔 Нет доступных тарифов для этой страны.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="◀️ Назад", callback_data="esim_regions")]
            ]),
        )
        return

    buttons = []
    for pkg in packages:
        label = f"{pkg['data']} · {pkg['days']} дн · ⭐️{pkg['price_stars']}"
        buttons.append([InlineKeyboardButton(
            text=label,
            callback_data=f"pkg:{pkg['packageId']}:{slug}"
        )])

    buttons.append([InlineKeyboardButton(text="◀️ Назад", callback_data="esim_regions")])

    await callback.message.edit_text(
        f"📦 <b>Тарифы для {slug.upper()}</b>\n\nВыберите пакет:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("pkg:"))
async def show_package_detail(callback: CallbackQuery):
    parts = callback.data.split(":")
    pkg_id = parts[1]
    slug = parts[2] if len(parts) > 2 else ""

    packages = await get_packages_for_country(slug)
    pkg = next((p for p in packages if p["packageId"] == pkg_id), None)
    if not pkg:
        await callback.answer("Тариф не найден", show_alert=True)
        return

    text = (
        f"📦 <b>{pkg['name']}</b>\n\n"
        f"📊 Трафик: <b>{pkg['data']}</b>\n"
        f"📅 Срок: <b>{pkg['days']} дней</b>\n"
        f"⭐️ Цена: <b>{pkg['price_stars']} Stars</b>\n\n"
        f"✅ Мгновенная активация\n"
        f"📱 Совместимо с iPhone XS+, Samsung S20+, Pixel 3+"
    )

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=f"⭐️ Купить — {pkg['price_stars']} Stars",
            callback_data=f"buy:{pkg_id}:{slug}:{pkg['price_stars']}:{pkg['name'][:30]}"
        )],
        [InlineKeyboardButton(text="◀️ Назад", callback_data=f"country:{slug}")],
    ])

    await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
