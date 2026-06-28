import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://icq:icqpass@db:5432/icqdb"
)

# IMPORTANT: Never decrease this version.
# New columns are added with ALTER TABLE IF NOT EXISTS — user data & passwords are NEVER lost.
DB_VERSION = "v5"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def _add_col(conn, sql: str):
    try:
        await conn.execute(text(sql))
    except Exception:
        pass


async def init_db():
    from app.models import Base

    # Check version in isolated connection to avoid transaction abort
    current_ver = None
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text("SELECT value FROM _schema_version WHERE key='version'")
            )
            current_ver = result.scalar()
    except Exception:
        current_ver = None

    async with engine.begin() as conn:
        # Always create new tables (safe — does nothing if table exists)
        await conn.run_sync(Base.metadata.create_all)

        # Ensure version tracking table exists
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS _schema_version (key TEXT PRIMARY KEY, value TEXT)"
        ))

        if current_ver != DB_VERSION:
            # Additive migrations only — never drops data or passwords
            await _add_col(conn, "ALTER TABLE chats ADD COLUMN IF NOT EXISTS description VARCHAR(500)")
            await _add_col(conn, "ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(7) DEFAULT '#5B8DEF'")
            await _add_col(conn, "ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_channel BOOLEAN DEFAULT FALSE")
            await _add_col(conn, "ALTER TABLE chats ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)")
            await _add_col(conn, "ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member'")
            await _add_col(conn, "ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id)")

            await conn.execute(text(
                f"INSERT INTO _schema_version(key,value) VALUES('version','{DB_VERSION}') "
                f"ON CONFLICT(key) DO UPDATE SET value='{DB_VERSION}'"
            ))
