import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.database import init_db
from app.api import auth, users, chats, ws, upload, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await create_admin()
    yield


app = FastAPI(title="Jeff Messenger", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(chats.router)
app.include_router(ws.router)
app.include_router(upload.router)
app.include_router(admin.router)

# Serve uploaded files
UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Serve frontend
STATIC = "/app/static"
if os.path.exists(STATIC):
    app.mount("/css", StaticFiles(directory=os.path.join(STATIC, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(STATIC, "js")), name="js")

    @app.get("/")
    async def index():
        return FileResponse(os.path.join(STATIC, "index.html"))


async def create_admin():
    from app.database import AsyncSessionLocal
    from app.models import User
    from app.auth import hash_password
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.username == "admin"))
        if not res.scalar_one_or_none():
            admin = User(
                username="admin",
                password_hash=hash_password("a1523415"),
                avatar_color="#5B8DEF",
            )
            db.add(admin)
            await db.commit()
