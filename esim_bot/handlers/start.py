from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton, URLInputFile
from config import ADMIN_IDS
from database import get_user_orders

router = Router()


def main_menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🌐 Купить eSIM", callback_data="esim_regions")],
        [InlineKeyboardButton(text="📋 Мои заказы", callback_data="my_orders")],
        [InlineKeyboardButton(text="❓ Помощь", callback_data="help")],
    ])


@router.message(CommandStart())
async def cmd_start(message: Message):
    await message.answer(
        "👋 <b>Добро пожаловать в eSIM магазин!</b>\n\n"
        "🌍 Продаём eSIM для путешествий по всему миру\n"
        "⚡️ Мгновенная активация после оплаты\n"
        "📱 Работает на любом eSIM-совместимом устройстве\n\n"
        "Выберите действие:",
        reply_markup=main_menu_kb(),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "main_menu")
async def back_to_menu(callback: CallbackQuery):
    await callback.message.edit_text(
        "👋 <b>Главное меню</b>\n\nВыберите действие:",
        reply_markup=main_menu_kb(),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "my_orders")
async def show_orders(callback: CallbackQuery):
    orders = await get_user_orders(callback.from_user.id)
    if not orders:
        await callback.answer("У вас пока нет заказов", show_alert=True)
        return

    buttons = []
    for o in orders:
        status_map = {"completed": "✅", "pending": "⏳", "waiting_payment": "💳", "failed": "❌"}
        icon = status_map.get(o["status"], "❓")
        label = f"{icon} {o['package_name']} · {o['created_at'][:10]}"
        buttons.append([InlineKeyboardButton(text=label, callback_data=f"order_detail:{o['id']}")])

    buttons.append([InlineKeyboardButton(text="◀️ Назад", callback_data="main_menu")])

    await callback.message.edit_text(
        "📋 <b>Ваши заказы</b>\n\nНажмите на заказ, чтобы увидеть детали:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("order_detail:"))
async def show_order_detail(callback: CallbackQuery):
    from database import get_order_by_id
    order_id = int(callback.data.split(":")[1])
    o = await get_order_by_id(order_id)

    if not o or o["user_id"] != callback.from_user.id:
        await callback.answer("Заказ не найден", show_alert=True)
        return

    status_map = {"completed": "✅ Активна", "pending": "⏳ Обрабатывается", "failed": "❌ Ошибка"}
    status_text = status_map.get(o["status"], "❓ Неизвестно")

    text = (
        f"📦 <b>{o['package_name']}</b>\n"
        f"📅 {o['created_at'][:10]}  |  {status_text}\n"
        f"💫 Оплачено: {o['price_rub']} Stars\n"
    )

    smdp = o.get("smdp_address") or ""
    ac = o.get("activation_code") or ""
    qr = o.get("qr_code") or ""
    iccid = o.get("esim_order_id") or ""

    if o["status"] == "completed" and (smdp or ac or qr):
        text += "\n━━━━━━━━━━━━━━━━━━\n"
        text += "📲 <b>Данные для установки:</b>\n\n"
        if iccid and not iccid.startswith("http") and not iccid.startswith("LPA"):
            text += f"🔢 <b>ICCID:</b>\n<code>{iccid}</code>\n\n"
        if smdp:
            text += f"📡 <b>SM-DP+ адрес:</b>\n<code>{smdp}</code>\n\n"
        if ac:
            text += f"🔑 <b>Код активации:</b>\n<code>{ac}</code>\n\n"
        if smdp and ac:
            lpa = f"LPA:1${smdp}${ac}"
            text += f"📲 <b>LPA строка:</b>\n<code>{lpa}</code>\n\n"
        text += (
            "━━━━━━━━━━━━━━━━━━\n"
            "📱 <b>iPhone:</b> Настройки → Сотовая связь → Добавить план\n"
            "📱 <b>Android:</b> Настройки → Подключения → SIM → Добавить eSIM"
        )
    elif o["status"] != "completed":
        text += "\n⏳ eSIM данные появятся после активации заказа."

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="◀️ Мои заказы", callback_data="my_orders")]
    ])

    # If there's a QR image URL — send it as a photo with the details in caption
    if o["status"] == "completed" and qr and qr.startswith("http"):
        try:
            await callback.message.delete()
            await callback.message.answer_photo(
                photo=URLInputFile(qr, filename="esim_qr.png"),
                caption=text,
                reply_markup=kb,
                parse_mode="HTML",
            )
        except Exception:
            await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML", disable_web_page_preview=True)
    else:
        await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML", disable_web_page_preview=True)


@router.message(Command("resend"))
async def cmd_resend(message: Message):
    """Достать eSIM по номеру заказа из дашборда и отправить пользователю.
    Использование: /resend B26060204340021 <user_id>
    """
    if message.from_user.id not in ADMIN_IDS:
        return
    from services.esim_api import _post
    args = message.text.split()
    if len(args) < 3:
        await message.answer("Использование: /resend <order_no> <user_id>\nПример: /resend B26060204340021 123456789")
        return
    order_no = args[1]
    try:
        target_user_id = int(args[2])
    except ValueError:
        await message.answer("❌ Неверный user_id")
        return

    await message.answer(f"🔍 Запрашиваю eSIM для заказа {order_no}...")
    data = await _post("esim/query", {"orderNo": order_no})
    await message.answer(f"📦 Ответ API:\n<code>{str(data)[:800]}</code>", parse_mode="HTML")

    if not data.get("success") or not data.get("obj"):
        await message.answer("❌ Не удалось получить данные")
        return

    esim_list = data["obj"].get("esimList") or []
    if not esim_list:
        await message.answer("❌ esimList пустой — eSIM ещё не готова или другой формат ответа")
        return

    esim = esim_list[0]
    iccid = esim.get("iccid", "")
    smdp = esim.get("smdpAddress") or esim.get("smdpAddr") or ""
    ac = esim.get("activationCode") or esim.get("matchingId") or esim.get("ac") or ""
    qr_url = esim.get("qrCodeUrl") or ""
    lpa = esim.get("lpaCode") or (f"LPA:1${smdp}${ac}" if smdp and ac else "")

    text = "✅ <b>eSIM готова!</b>\n\n"
    if iccid:
        text += f"🔢 <b>ICCID:</b> <code>{iccid}</code>\n\n"
    if smdp:
        text += f"📡 <b>SM-DP+:</b>\n<code>{smdp}</code>\n\n"
    if ac:
        text += f"🔑 <b>Код активации:</b>\n<code>{ac}</code>\n\n"
    if lpa:
        text += f"📲 <b>LPA:</b>\n<code>{lpa}</code>\n\n"

    ios_link = f"https://esimsetup.apple.com/esim_qrcode_provisioning?carddata={lpa}" if lpa else ""
    android_link = f"https://esimsetup.android.com/esim_qrcode_provisioning?carddata={lpa}" if lpa else ""

    kb_rows = []
    if ios_link:
        kb_rows.append([InlineKeyboardButton(text="📱 Установить на iPhone", url=ios_link)])
    if android_link:
        kb_rows.append([InlineKeyboardButton(text="🤖 Установить на Android", url=android_link)])
    kb = InlineKeyboardMarkup(inline_keyboard=kb_rows) if kb_rows else None

    if qr_url and qr_url.startswith("http"):
        try:
            await message.bot.send_photo(
                chat_id=target_user_id,
                photo=URLInputFile(qr_url, filename="esim_qr.png"),
                caption=text,
                reply_markup=kb,
                parse_mode="HTML",
            )
        except Exception:
            await message.bot.send_message(target_user_id, text, reply_markup=kb, parse_mode="HTML", disable_web_page_preview=True)
    else:
        await message.bot.send_message(target_user_id, text, reply_markup=kb, parse_mode="HTML", disable_web_page_preview=True)

    await message.answer(f"✅ Отправлено пользователю {target_user_id}")


@router.message(Command("test"))
async def cmd_test(message: Message):
    if message.from_user.id not in ADMIN_IDS:
        return
    from services.esim_api import _post, get_packages_for_country
    await message.answer("🔍 Тестирую API...")
    try:
        # Баланс
        bal = await _post("balance/query", {})
        balance_usd = bal.get("obj", {}).get("balance", 0) / 10000
        await message.answer(f"✅ Баланс: ${balance_usd:.2f}")

        # Пакеты для Германии
        pkgs = await get_packages_for_country("DE")
        if pkgs:
            p = pkgs[0]
            await message.answer(f"✅ Пакеты DE: {len(pkgs)} шт\nПример: {p['name']} {p['data']} {p['days']}дн ⭐️{p['price_stars']}")
        else:
            # Пробуем сырой запрос
            raw = await _post("package/list", {"locationCode": "DE"})
            await message.answer(f"❌ Пакеты DE пусты\nRaw: {str(raw)[:300]}")
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@router.callback_query(F.data == "help")
async def show_help(callback: CallbackQuery):
    text = (
        "❓ <b>Помощь</b>\n\n"
        "📱 <b>Что такое eSIM?</b>\n"
        "eSIM — цифровая SIM-карта, встроенная в устройство. "
        "Не нужна физическая карта.\n\n"
        "✅ <b>Совместимые устройства:</b>\n"
        "iPhone XS и новее, Samsung Galaxy S20+, Google Pixel 3+\n\n"
        "🔧 <b>Как установить:</b>\n"
        "1. Получите QR-код после оплаты\n"
        "2. Настройки → Сотовая связь → Добавить план\n"
        "3. Отсканируйте QR-код\n\n"
        "💬 Вопросы? Пишите в поддержку."
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="◀️ Назад", callback_data="main_menu")]
    ])
    await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
