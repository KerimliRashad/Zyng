import asyncio
from aiogram import Router, Bot, F
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiohttp import web

from database import create_order, update_order_payment, get_order_by_payment_id, complete_order
from services.yookassa_service import create_payment, get_payment
from services.esim_api import order_esim
import json

router = Router()


@router.callback_query(F.data.startswith("buy:"))
async def start_purchase(callback: CallbackQuery):
    parts = callback.data.split(":")
    pkg_id = parts[1]
    slug = parts[2]
    price_rub = int(parts[3])
    pkg_name = parts[4] if len(parts) > 4 else "eSIM"

    order_id = await create_order(
        user_id=callback.from_user.id,
        package_id=pkg_id,
        package_name=pkg_name,
        price_rub=price_rub,
    )

    payment = await create_payment(
        amount_rub=price_rub,
        description=f"eSIM {pkg_name}",
        order_id=order_id,
        user_id=callback.from_user.id,
    )

    if not payment:
        await callback.answer("❌ Ошибка создания платежа. Попробуйте позже.", show_alert=True)
        return

    payment_id = payment["id"]
    pay_url = payment["confirmation"]["confirmation_url"]

    await update_order_payment(order_id, payment_id)

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💳 Оплатить", url=pay_url)],
        [InlineKeyboardButton(text="✅ Проверить оплату", callback_data=f"check:{payment_id}")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="main_menu")],
    ])

    await callback.message.edit_text(
        f"💳 <b>Оплата заказа #{order_id}</b>\n\n"
        f"📦 {pkg_name}\n"
        f"💰 Сумма: <b>{price_rub}₽</b>\n\n"
        "Нажмите кнопку для оплаты, затем вернитесь и нажмите «Проверить оплату»",
        reply_markup=kb,
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("check:"))
async def check_payment(callback: CallbackQuery, bot: Bot):
    payment_id = callback.data.split(":", 1)[1]
    await callback.answer("⏳ Проверяю...")

    payment = await get_payment(payment_id)
    if not payment:
        await callback.answer("❌ Не удалось проверить платёж", show_alert=True)
        return

    status = payment.get("status")

    if status == "succeeded":
        order = await get_order_by_payment_id(payment_id)
        if not order or order["status"] == "completed":
            await callback.answer("✅ Заказ уже выполнен", show_alert=True)
            return

        await callback.message.edit_text("⏳ Оплата получена! Выпускаю eSIM...")

        esim = await order_esim(order["package_id"])
        if not esim:
            await callback.message.edit_text(
                "❌ Ошибка выпуска eSIM. Свяжитесь с поддержкой.\n"
                f"ID заказа: #{order['id']}"
            )
            return

        iccid = esim.get("iccid", "")
        qr_code = esim.get("qrCodeUrl", "") or esim.get("ac", "")
        smdp = esim.get("smdpAddress", "")
        ac = esim.get("activationCode", "") or esim.get("ac", "")

        await complete_order(order["id"], iccid, qr_code, smdp, ac)

        text = (
            f"✅ <b>eSIM готова!</b>\n\n"
            f"📦 {order['package_name']}\n\n"
        )
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
        await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")

    elif status == "pending" or status == "waiting_for_capture":
        await callback.answer("⏳ Ожидаем оплату. Попробуйте через минуту.", show_alert=True)
    else:
        await callback.answer(f"❌ Платёж не завершён (статус: {status})", show_alert=True)


async def yookassa_webhook_handler(request: web.Request, bot: Bot):
    try:
        data = await request.json()
        event = data.get("event", "")
        obj = data.get("object", {})

        if event == "payment.succeeded":
            payment_id = obj.get("id")
            order = await get_order_by_payment_id(payment_id)
            if order and order["status"] != "completed":
                esim = await order_esim(order["package_id"])
                if esim:
                    iccid = esim.get("iccid", "")
                    qr_code = esim.get("qrCodeUrl", "") or esim.get("ac", "")
                    smdp = esim.get("smdpAddress", "")
                    ac = esim.get("activationCode", "") or esim.get("ac", "")
                    await complete_order(order["id"], iccid, qr_code, smdp, ac)

                    text = (
                        f"✅ <b>Ваша eSIM готова!</b>\n\n"
                        f"📦 {order['package_name']}\n\n"
                    )
                    if smdp and ac:
                        text += f"📡 SM-DP+: <code>{smdp}</code>\n"
                        text += f"🔑 Код: <code>{ac}</code>\n\n"

                    text += "📱 Настройки → Сотовая связь → Добавить план"
                    await bot.send_message(order["user_id"], text, parse_mode="HTML")

    except Exception:
        pass

    return web.Response(status=200)
