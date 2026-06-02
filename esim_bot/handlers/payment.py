from aiogram import Router, Bot, F
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    LabeledPrice,
    PreCheckoutQuery,
    Message,
)

from database import create_order, complete_order, get_order_by_id
from services.esim_api import order_esim

router = Router()


@router.callback_query(F.data.startswith("buy:"))
async def start_purchase(callback: CallbackQuery, bot: Bot):
    parts = callback.data.split(":")
    pkg_id = parts[1]
    slug = parts[2]
    price_stars = int(parts[3])
    pkg_name = parts[4] if len(parts) > 4 else "eSIM"

    order_id = await create_order(
        user_id=callback.from_user.id,
        package_id=pkg_id,
        package_name=pkg_name,
        price_rub=price_stars,  # храним stars в поле price_rub
    )

    await callback.message.delete()

    await bot.send_invoice(
        chat_id=callback.from_user.id,
        title=f"eSIM — {pkg_name}",
        description=f"Моментальная выдача eSIM после оплаты. Заказ #{order_id}",
        payload=f"esim_{order_id}_{pkg_id}",
        provider_token="",  # пустой = Telegram Stars
        currency="XTR",
        prices=[LabeledPrice(label=pkg_name, amount=price_stars)],
    )
    await callback.answer()


@router.pre_checkout_query()
async def pre_checkout(query: PreCheckoutQuery):
    await query.answer(ok=True)


@router.message(F.successful_payment)
async def successful_payment(message: Message):
    payload = message.successful_payment.invoice_payload
    # payload формат: esim_{order_id}_{pkg_id}
    parts = payload.split("_", 2)
    if len(parts) < 3 or parts[0] != "esim":
        return

    order_id = int(parts[1])
    pkg_id = parts[2]
    charge_id = message.successful_payment.telegram_payment_charge_id

    await message.answer("⏳ Оплата получена! Выпускаю eSIM...")

    esim, err_msg = await order_esim(pkg_id)
    if not esim:
        # Refund Stars automatically
        try:
            await message.bot.refund_star_payment(
                user_id=message.from_user.id,
                telegram_payment_charge_id=charge_id,
            )
            refund_note = "⭐️ Звёзды возвращены автоматически."
        except Exception as ref_err:
            import logging
            logging.error(f"Refund failed: {ref_err}")
            refund_note = f"Верните звёзды вручную, Charge ID: <code>{charge_id}</code>"

        await message.answer(
            f"❌ <b>Ошибка выпуска eSIM</b>\n\n"
            f"Причина: <code>{err_msg}</code>\n"
            f"ID заказа: #{order_id}\n\n"
            f"{refund_note}",
            parse_mode="HTML",
        )
        return

    iccid = esim.get("iccid", "")
    qr_code = esim.get("qrCodeUrl", "") or esim.get("ac", "")
    smdp = esim.get("smdpAddress", "")
    ac = esim.get("activationCode", "") or esim.get("ac", "")

    await complete_order(order_id, iccid, qr_code, smdp, ac)

    text = f"✅ <b>eSIM готова!</b>\n\n"
    if smdp and ac:
        text += f"📡 <b>SM-DP+ адрес:</b>\n<code>{smdp}</code>\n\n"
        text += f"🔑 <b>Код активации:</b>\n<code>{ac}</code>\n\n"
    if qr_code and qr_code.startswith("http"):
        text += f"📷 <b>QR-код:</b> <a href='{qr_code}'>Открыть</a>\n\n"

    text += (
        "📱 <b>Установка:</b>\n"
        "Настройки → Сотовая связь → Добавить план → Сканировать QR"
    )

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🏠 Главное меню", callback_data="main_menu")]
    ])
    await message.answer(text, reply_markup=kb, parse_mode="HTML")
