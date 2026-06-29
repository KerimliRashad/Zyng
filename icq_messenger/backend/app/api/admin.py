from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta
from app.database import get_db
from app.models import User, Message, Chat, ChatMember, FriendRequest, ChatType
from app.auth import get_current_user
from app.websocket.manager import manager

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(cu: User = Depends(get_current_user)):
    if not cu.is_admin:
        raise HTTPException(status_code=403, detail="Только для администратора")
    return cu


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db), cu: User = Depends(require_admin)):
    total_users = (await db.execute(select(func.count(User.id)))).scalar()
    online_users = len(manager.get_online_users())
    verified_users = (await db.execute(select(func.count(User.id)).where(User.is_verified == True))).scalar()
    banned_users = (await db.execute(select(func.count(User.id)).where(User.is_banned == True))).scalar()
    total_messages = (await db.execute(select(func.count(Message.id)))).scalar()
    total_chats = (await db.execute(select(func.count(Chat.id)))).scalar()
    personal_chats = (await db.execute(select(func.count(Chat.id)).where(Chat.type == ChatType.PERSONAL))).scalar()
    group_chats = (await db.execute(select(func.count(Chat.id)).where(Chat.type == ChatType.GROUP))).scalar()
    channels = (await db.execute(select(func.count(Chat.id)).where(Chat.type == ChatType.CHANNEL))).scalar()

    # Messages today
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    msgs_today = (await db.execute(select(func.count(Message.id)).where(Message.created_at >= today))).scalar()

    # New users today
    new_today = (await db.execute(select(func.count(User.id)).where(User.created_at >= today))).scalar()

    return {
        "total_users": total_users,
        "online_users": online_users,
        "verified_users": verified_users,
        "banned_users": banned_users,
        "total_messages": total_messages,
        "msgs_today": msgs_today,
        "new_users_today": new_today,
        "total_chats": total_chats,
        "personal_chats": personal_chats,
        "group_chats": group_chats,
        "channels": channels,
    }


@router.get("/users")
async def list_users(
    offset: int = 0, limit: int = 50, q: str = "",
    db: AsyncSession = Depends(get_db), cu: User = Depends(require_admin)
):
    query = select(User)
    if q:
        if q.isdigit():
            query = query.where(User.id == int(q))
        else:
            query = query.where(User.username.ilike(f"%{q}%"))
    query = query.order_by(User.id).offset(offset).limit(limit)
    users = (await db.execute(query)).scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "avatar_color": u.avatar_color,
            "is_admin": u.is_admin,
            "is_verified": u.is_verified or False,
            "is_banned": u.is_banned or False,
            "status": "online" if manager.is_online(str(u.id)) else "offline",
            "created_at": u.created_at.isoformat() if u.created_at else "",
        }
        for u in users
    ]


@router.post("/users/{user_id}/verify")
async def toggle_verify(user_id: int, db: AsyncSession = Depends(get_db), cu: User = Depends(require_admin)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    u.is_verified = not (u.is_verified or False)
    await db.commit()
    await manager.send_to_user(str(user_id), {
        "type": "account_update",
        "is_verified": u.is_verified,
    })
    return {"is_verified": u.is_verified}


@router.post("/users/{user_id}/ban")
async def toggle_ban(user_id: int, db: AsyncSession = Depends(get_db), cu: User = Depends(require_admin)):
    if user_id == cu.id:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать себя")
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    u.is_banned = not (u.is_banned or False)
    await db.commit()
    if u.is_banned:
        await manager.send_to_user(str(user_id), {"type": "banned"})
    return {"is_banned": u.is_banned}


@router.post("/chats/{chat_id}/verify")
async def toggle_chat_verify(chat_id: int, db: AsyncSession = Depends(get_db), cu: User = Depends(require_admin)):
    chat = await db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")
    chat.is_verified = not (chat.is_verified or False)
    await db.commit()
    # notify all members
    mems = (await db.execute(select(ChatMember).where(ChatMember.chat_id == chat_id))).scalars().all()
    for m in mems:
        await manager.send_to_user(str(m.user_id), {
            "type": "chat_verified",
            "chat_id": chat_id,
            "is_verified": chat.is_verified,
        })
    return {"is_verified": chat.is_verified}


@router.get("/chats")
async def list_chats(q: str = "", db: AsyncSession = Depends(get_db), cu: User = Depends(require_admin)):
    query = select(Chat).where(Chat.type != ChatType.PERSONAL)
    if q:
        query = query.where(Chat.name.ilike(f"%{q}%"))
    query = query.order_by(Chat.id.desc()).limit(100)
    chats = (await db.execute(query)).scalars().all()
    out = []
    for c in chats:
        mc = (await db.execute(select(func.count(ChatMember.id)).where(ChatMember.chat_id == c.id))).scalar()
        out.append({
            "id": c.id, "name": c.name, "type": c.type.value,
            "avatar_color": c.avatar_color, "is_verified": c.is_verified or False,
            "is_channel": c.is_channel or False, "member_count": mc,
        })
    return out


@router.post("/stats/send")
async def send_stats_to_admin(db: AsyncSession = Depends(get_db), cu: User = Depends(require_admin)):
    stats = await get_stats(db=db, cu=cu)
    text = (
        f"📊 Статистика Jeff Messenger\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"👥 Всего пользователей: {stats['total_users']}\n"
        f"🟢 Онлайн сейчас: {stats['online_users']}\n"
        f"✅ Верифицировано: {stats['verified_users']}\n"
        f"🚫 Заблокировано: {stats['banned_users']}\n"
        f"🆕 Новых сегодня: {stats['new_users_today']}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"💬 Всего сообщений: {stats['total_messages']}\n"
        f"📨 Сообщений сегодня: {stats['msgs_today']}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"🗂 Чатов всего: {stats['total_chats']}\n"
        f"  • Личных: {stats['personal_chats']}\n"
        f"  • Групп: {stats['group_chats']}\n"
        f"  • Каналов: {stats['channels']}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"🕐 {datetime.utcnow().strftime('%d.%m.%Y %H:%M')} UTC"
    )
    await manager.send_to_user(str(cu.id), {
        "type": "system_message",
        "text": text,
    })
    return {"status": "sent"}
