from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import User
from app.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    is_admin: bool
    avatar_color: str


COLORS = ["#5B8DEF","#9b59b6","#e74c3c","#e67e22","#2ecc71","#1abc9c","#e91e8c","#f39c12"]

@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if len(data.username) < 3:
        raise HTTPException(status_code=400, detail="Логин минимум 3 символа")
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Пароль минимум 4 символа")

    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Логин уже занят")

    # Count users to pick color
    count_res = await db.execute(select(User))
    count = len(count_res.scalars().all())
    color = COLORS[count % len(COLORS)]

    user = User(username=data.username, password_hash=hash_password(data.password), avatar_color=color)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        avatar_color=user.avatar_color,
    )


@router.post("/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == form.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    return TokenResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        avatar_color=user.avatar_color,
    )


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "avatar_color": user.avatar_color,
        "status": user.status,
    }
