import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

from config import BOT_TOKEN
from database import init_db
from handlers import start, catalog, payment

logging.basicConfig(level=logging.INFO)


async def main():
    await init_db()

    bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()

    dp.include_router(start.router)
    dp.include_router(catalog.router)
    dp.include_router(payment.router)

    logging.info("Бот запущен")
    await dp.start_polling(
        bot,
        allowed_updates=["message", "callback_query", "pre_checkout_query"],
    )


if __name__ == "__main__":
    asyncio.run(main())
