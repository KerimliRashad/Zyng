from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
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

    text = "📋 <b>Ваши заказы:</b>\n\n"
    for o in orders:
        status_map = {"completed": "✅", "pending": "⏳", "waiting_payment": "💳", "failed": "❌"}
        icon = status_map.get(o["status"], "❓")
        text += f"{icon} <b>{o['package_name']}</b>\n"
        text += f"   {o['price_rub']}₽ · {o['created_at'][:10]}\n\n"

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="◀️ Назад", callback_data="main_menu")]
    ])
    await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")


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
