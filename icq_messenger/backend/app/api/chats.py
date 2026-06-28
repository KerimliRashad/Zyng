from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from app.database import get_db
from app.models import Chat, ChatMember, Message, User, ChatType
from app.auth import get_current_user
from app.websocket.manager import manager

router = APIRouter(prefix="/api/chats", tags=["chats"])


def msg_dict(msg: Message, sender: User, is_mine: bool) -> dict:
    return {
        "id": msg.id,
        "chat_id": msg.chat_id,
        "sender_id": msg.sender_id,
        "sender_name": sender.username,
        "sender_color": sender.avatar_color,
        "text": msg.text or "",
        "file_url": msg.file_url,
        "file_name": msg.file_name,
        "file_size": msg.file_size,
        "file_type": msg.file_type,
        "created_at": msg.created_at.isoformat(),
        "is_read": msg.is_read,
        "is_mine": is_mine,
    }


@router.get("")
async def get_chats(db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)):
    res = await db.execute(
        select(Chat).join(ChatMember, Chat.id == ChatMember.chat_id).where(ChatMember.user_id == cu.id)
    )
    chats = res.scalars().all()
    out = []
    for c in chats:
        lm = (await db.execute(
            select(Message).where(Message.chat_id == c.id).order_by(desc(Message.created_at)).limit(1)
        )).scalar_one_or_none()

        unread = len((await db.execute(
            select(Message).where(
                and_(Message.chat_id == c.id, Message.sender_id != cu.id, Message.is_read == False)
            )
        )).scalars().all())

        other = None
        if c.type == ChatType.PERSONAL:
            om = (await db.execute(
                select(ChatMember).where(and_(ChatMember.chat_id == c.id, ChatMember.user_id != cu.id))
            )).scalar_one_or_none()
            if om:
                other = await db.get(User, om.user_id)

        lm_text = ""
        if lm:
            lm_text = lm.text or (f"📎 {lm.file_name}" if lm.file_name else "Файл")

        out.append({
            "id": c.id,
            "name": other.username if other else (c.name or "Чат"),
            "type": c.type.value,
            "last_message": {"text": lm_text, "created_at": lm.created_at.isoformat()} if lm else None,
            "unread_count": unread,
            "other_user": {
                "id": other.id, "username": other.username,
                "avatar_color": other.avatar_color,
                "status": "online" if manager.is_online(str(other.id)) else "offline",
            } if other else None,
        })

    return sorted(out, key=lambda x: x["last_message"]["created_at"] if x["last_message"] else "", reverse=True)


@router.get("/{chat_id}/messages")
async def get_messages(
    chat_id: int, limit: int = 50, offset: int = 0,
    db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)
):
    if not (await db.execute(
        select(ChatMember).where(and_(ChatMember.chat_id == chat_id, ChatMember.user_id == cu.id))
    )).scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа")

    msgs = (await db.execute(
        select(Message).where(Message.chat_id == chat_id)
        .order_by(desc(Message.created_at)).offset(offset).limit(limit)
    )).scalars().all()

    out = []
    for m in reversed(msgs):
        sender = await db.get(User, m.sender_id)
        out.append(msg_dict(m, sender, m.sender_id == cu.id))
        if m.sender_id != cu.id and not m.is_read:
            m.is_read = True

    await db.commit()
    return out
