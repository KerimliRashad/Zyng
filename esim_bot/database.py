import aiosqlite
import json
from datetime import datetime

DB_PATH = "esim_bot.db"


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                package_id TEXT NOT NULL,
                package_name TEXT NOT NULL,
                price_rub INTEGER NOT NULL,
                yookassa_payment_id TEXT,
                esim_order_id TEXT,
                status TEXT DEFAULT 'pending',
                qr_code TEXT,
                activation_code TEXT,
                smdp_address TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()


async def create_order(user_id: int, package_id: str, package_name: str, price_rub: int) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO orders (user_id, package_id, package_name, price_rub) VALUES (?, ?, ?, ?)",
            (user_id, package_id, package_name, price_rub),
        )
        await db.commit()
        return cursor.lastrowid


async def update_order_payment(order_id: int, payment_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE orders SET yookassa_payment_id=?, status='waiting_payment' WHERE id=?",
            (payment_id, order_id),
        )
        await db.commit()


async def get_order_by_payment_id(payment_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM orders WHERE yookassa_payment_id=?", (payment_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def complete_order(order_id: int, esim_order_id: str, qr_code: str, smdp: str, activation_code: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE orders SET status='completed', esim_order_id=?,
               qr_code=?, smdp_address=?, activation_code=? WHERE id=?""",
            (esim_order_id, qr_code, smdp, activation_code, order_id),
        )
        await db.commit()


async def get_user_orders(user_id: int) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 10",
            (user_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
