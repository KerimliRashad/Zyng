import asyncio
import logging

from aiogram import Router, Bot, F
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    LabeledPrice,
    PreCheckoutQuery,
    Message,
    URLInputFile,
)

from config import STARS_PER_USD
from database import create_order, complete_order, get_order_by_id, update_order_payment
from services.esim_api import order_esim
from services.xrocket import create_invoice, get_invoice_status

router = Router()


def _esim_kb(lpa: str) -> InlineKeyboardMarkup:
    rows = []
    if lpa:
        rows.append([InlineKeyboardButton(
            text="📱 Установить на iPhone",
            url=f"https://esimsetup.apple.com/esim_qrcode_provisioning?carddata={lpa}",
        )])
        rows.append([InlineKeyboardButton(
            text="🤖 Установить на Android",
            url=f"https://esimsetup.android.com/esim_qrcode_provisioning?carddata={lpa}",
        )])
    rows.append([InlineKeyboardButton(text="🏠 Главное меню", callback_data="main_menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _build_esim_text(esim: dict) -> tuple[str, str, str, str, str]:
    iccid = esim.get("iccid", "")
    smdp = esim.get("smdpAddress", "")
    ac = esim.get("activationCode", "")
    lpa = esim.get("lpaCode", "") or (f"LPA:1${smdp}${ac}" if smdp and ac else "")
    qr_url = esim.get("qrCodeUrl", "")

    text = "✅ <b>eSIM готова!</b>\n\n"
    if iccid:
        text += f"🔢 <b>ICCID:</b> <code>{iccid}</code>\n\n"
    if smdp:
        text += f"📡 <b>SM-DP+:</b>\n<code>{smdp}</code>\n\n"
    if ac:
        text += f"🔑 <b>Код активации:</b>\n<code>{ac}</code>\n\n"
    if lpa:
        text += f"📲 <b>LPA:</b>\n<code>{lpa}</code>\n\n"

    return text, iccid, qr_url, smdp, ac, lpa


async def _deliver_esim(send_fn, esim: dict, order_id: int):
    """Deliver eSIM to user via send_fn (message.answer / bot.send_message)."""
    iccid = esim.get("iccid", "")
    smdp = esim.get("smdpAddress", "")
    ac = esim.get("activationCode", "")
    lpa = esim.get("lpaCode", "") or (f"LPA:1${smdp}${ac}" if smdp and ac else "")
    qr_url = esim.get("qrCodeUrl", "")

    await complete_order(order_id, iccid, qr_url, smdp, ac)

    text = "✅ <b>eSIM готова!</b>\n\n"
    if iccid:
        text += f"🔢 <b>ICCID:</b> <code>{iccid}</code>\n\n"
    if smdp:
        text += f"📡 <b>SM-DP+:</b>\n<code>{smdp}</code>\n\n"
    if ac:
        text += f"🔑 <b>Код активации:</b>\n<code>{ac}</code>\n\n"
    if lpa:
        text += f"📲 <b>LPA:</b>\n<code>{lpa}</code>\n\n"

    kb = _esim_kb(lpa)

    if qr_url and qr_url.startswith("http"):
        try:
            await send_fn(
                photo=URLInputFile(qr_url, filename="esim_qr.png"),
                caption=text,
                reply_markup=kb,
                parse_mode="HTML",
            )
            return
        except Exception:
            pass
    await send_fn(text=text, reply_markup=kb, parse_mode="HTML", disable_web_page_preview=True)


# ── Step 1: choose payment method ────────────────────────────────────────────

@router.callback_query(F.data.startswith("buy:"))
async def choose_payment(callback: CallbackQuery):
    parts = callback.data.split(":")
    pkg_id = parts[1]
    slug = parts[2]
    price_stars = int(parts[3])
    pkg_name = ":".join(parts[4:]) if len(parts) > 4 else "eSIM"

    order_id = await create_order(
        user_id=callback.from_user.id,
        package_id=pkg_id,
        package_name=pkg_name,
        price_rub=price_stars,
    )

    price_usd = price_stars / STARS_PER_USD

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=f"⭐️ Telegram Stars — {price_stars} ⭐",
            callback_data=f"pay_stars:{order_id}",
        )],
        [InlineKeyboardButton(
            text=f"💎 Криптовалюта — ${price_usd:.2f} USDT",
            callback_data=f"pay_crypto:{order_id}",
        )],
        [InlineKeyboardButton(text="◀️ Назад", callback_data=f"pkg:{pkg_id}:{slug}")],
    ])

    await callback.message.edit_text(
        f"💳 <b>Выберите способ оплаты</b>\n\n"
        f"📦 <b>{pkg_name}</b>\n"
        f"💵 Цена: <b>${price_usd:.2f}</b>  |  <b>{price_stars} ⭐</b>",
        reply_markup=kb,
        parse_mode="HTML",
    )
    await callback.answer()


# ── Step 2a: Stars payment ────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("pay_stars:"))
async def pay_stars(callback: CallbackQuery, bot: Bot):
    order_id = int(callback.data.split(":")[1])
    order = await get_order_by_id(order_id)
    if not order:
        await callback.answer("Заказ не найден", show_alert=True)
        return

    await callback.message.delete()
    await bot.send_invoice(
        chat_id=callback.from_user.id,
        title=f"eSIM — {order['package_name']}",
        description=f"Моментальная выдача eSIM после оплаты. Заказ #{order_id}",
        payload=f"esim_{order_id}_{order['package_id']}",
        provider_token="",
        currency="XTR",
        prices=[LabeledPrice(label=order["package_name"], amount=order["price_rub"])],
    )
    await callback.answer()


@router.pre_checkout_query()
async def pre_checkout(query: PreCheckoutQuery):
    await query.answer(ok=True)


@router.message(F.successful_payment)
async def successful_payment(message: Message):
    payload = message.successful_payment.invoice_payload
    parts = payload.split("_", 2)
    if len(parts) < 3 or parts[0] != "esim":
        return

    order_id = int(parts[1])
    pkg_id = parts[2]
    charge_id = message.successful_payment.telegram_payment_charge_id

    await message.answer("⏳ Оплата получена! Выпускаю eSIM...")

    esim, err_msg = await order_esim(pkg_id)
    if not esim:
        try:
            await message.bot.refund_star_payment(
                user_id=message.from_user.id,
                telegram_payment_charge_id=charge_id,
            )
            refund_note = "⭐️ Звёзды возвращены автоматически."
        except Exception as e:
            logging.error(f"Stars refund failed: {e}")
            refund_note = f"Charge ID для возврата: <code>{charge_id}</code>"

        await message.answer(
            f"❌ <b>Ошибка выпуска eSIM</b>\n\n"
            f"Причина: <code>{err_msg}</code>\n"
            f"ID заказа: #{order_id}\n\n{refund_note}",
            parse_mode="HTML",
        )
        return

    await _deliver_esim(message.answer_photo, esim, order_id)


# ── Step 2b: Crypto payment ───────────────────────────────────────────────────

@router.callback_query(F.data.startswith("pay_crypto:"))
async def pay_crypto(callback: CallbackQuery):
    order_id = int(callback.data.split(":")[1])
    order = await get_order_by_id(order_id)
    if not order:
        await callback.answer("Заказ не найден", show_alert=True)
        return

    price_usd = order["price_rub"] / STARS_PER_USD

    invoice = await create_invoice(
        amount_usd=price_usd,
        description=f"eSIM — {order['package_name']}",
        payload=f"esim_{order_id}_{order['package_id']}",
    )

    if not invoice:
        await callback.answer("❌ Ошибка создания платежа. Попробуйте Stars.", show_alert=True)
        return

    invoice_id = invoice["id"]
    await update_order_payment(order_id, invoice_id)

    actual_amount = invoice.get("amount", price_usd)

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💎 Оплатить через xRocket", url=invoice["link"])],
    ])

    await callback.message.edit_text(
        f"💎 <b>Оплата криптовалютой</b>\n\n"
        f"📦 <b>{order['package_name']}</b>\n"
        f"💵 Сумма: <b>{actual_amount} USDT</b>\n\n"
        f"1. Нажмите кнопку ниже\n"
        f"2. Оплатите через @xRocketBot\n"
        f"3. eSIM придёт автоматически\n\n"
        f"⏱ Счёт действителен <b>1 час</b>",
        reply_markup=kb,
        parse_mode="HTML",
    )

    asyncio.create_task(_poll_crypto(
        bot=callback.bot,
        user_id=callback.from_user.id,
        order_id=order_id,
        pkg_id=order["package_id"],
        invoice_id=invoice_id,
    ))

    await callback.answer()


async def _poll_crypto(bot: Bot, user_id: int, order_id: int, pkg_id: str, invoice_id: str):
    """Poll xRocket every 10s for up to 20 minutes, deliver eSIM on payment."""
    for _ in range(120):
        await asyncio.sleep(10)
        try:
            status = await get_invoice_status(invoice_id)
        except Exception as e:
            logging.error(f"xRocket poll error: {e}")
            continue

        if status == "paid":
            await bot.send_message(user_id, "⏳ Оплата получена! Выпускаю eSIM...")
            esim, err = await order_esim(pkg_id)
            if esim:
                async def _send(**kwargs):
                    await bot.send_photo(chat_id=user_id, **kwargs)
                try:
                    await _deliver_esim(_send, esim, order_id)
                except Exception:
                    async def _send_msg(**kwargs):
                        await bot.send_message(chat_id=user_id, **kwargs)
                    await _deliver_esim(_send_msg, esim, order_id)
            else:
                await bot.send_message(
                    user_id,
                    f"❌ <b>Оплата прошла, но eSIM не выдалась.</b>\n"
                    f"Напишите в поддержку, ID заказа: #{order_id}\n"
                    f"Причина: <code>{err}</code>",
                    parse_mode="HTML",
                )
            return

        if status == "expired":
            await bot.send_message(
                user_id,
                f"⌛️ Счёт на оплату истёк (заказ #{order_id}).\n"
                "Создайте новый заказ.",
            )
            return

    logging.warning(f"xRocket poll timeout for order #{order_id}")
