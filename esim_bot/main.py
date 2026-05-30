import asyncio
import logging
from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

from config import BOT_TOKEN, WEBHOOK_HOST, WEBHOOK_PATH, WEB_PORT
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

    if WEBHOOK_HOST:
        app = web.Application()
        app["bot"] = bot

        async def webhook_handler(request: web.Request):
            return await payment.yookassa_webhook_handler(request, request.app["bot"])

        app.router.add_post(WEBHOOK_PATH, webhook_handler)

        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", WEB_PORT)
        await site.start()
        logging.info(f"Webhook сервер запущен на порту {WEB_PORT}")

    logging.info("Бот запущен (polling)")
    await dp.start_polling(bot, allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    asyncio.run(main())
