import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://icq:icqpass@db:5432/icqdb"
)

DB_VERSION = "v4"  # bump this to force schema reset

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    from app.models import Base
    async with engine.begin() as conn:
        # Check schema version — drop+recreate only when version changes
        try:
            res = await conn.execute(text("SELECT value FROM _schema_version WHERE key='version'"))
            ver = res.scalar()
        except Exception:
            ver = None

        if ver != DB_VERSION:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text("CREATE TABLE IF NOT EXISTS _schema_version (key TEXT PRIMARY KEY, value TEXT)"))
            await conn.execute(text(f"INSERT INTO _schema_version(key,value) VALUES('version','{DB_VERSION}') ON CONFLICT(key) DO UPDATE SET value='{DB_VERSION}'"))
        else:
            await conn.run_sync(Base.metadata.create_all)
