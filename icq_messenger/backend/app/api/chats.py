from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from app.database import get_db
from app.models import Chat, ChatMember, Message, User, ChatType
from app.auth import get_current_user
from app.websocket.manager import manager

router = APIRouter(prefix="/api/chats", tags=["chats"])


@router.get("")
async def get_chats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Chat).join(ChatMember, Chat.id == ChatMember.chat_id)
        .where(ChatMember.user_id == current_user.id)
    )
    chats = result.scalars().all()

    out = []
    for chat in chats:
        msg_result = await db.execute(
            select(Message).where(Message.chat_id == chat.id).order_by(desc(Message.created_at)).limit(1)
        )
        last_msg = msg_result.scalar_one_or_none()

        unread_result = await db.execute(
            select(Message).where(
                and_(Message.chat_id == chat.id, Message.sender_id != current_user.id, Message.is_read == False)
            )
        )
        unread = len(unread_result.scalars().all())

        other_user = None
        if chat.type == ChatType.PERSONAL:
            members_result = await db.execute(
                select(ChatMember).where(
                    and_(ChatMember.chat_id == chat.id, ChatMember.user_id != current_user.id)
                )
            )
            other_member = members_result.scalar_one_or_none()
            if other_member:
                u_result = await db.execute(select(User).where(User.id == other_member.user_id))
                other_user = u_result.scalar_one_or_none()

        out.append({
            "id": chat.id,
            "name": other_user.username if other_user else chat.name,
            "type": chat.type.value,
            "last_message": {
                "text": last_msg.text,
                "created_at": last_msg.created_at.isoformat(),
            } if last_msg else None,
            "unread_count": unread,
            "other_user": {
                "id": other_user.id,
                "username": other_user.username,
                "avatar_color": other_user.avatar_color,
                "status": "online" if manager.is_online(str(other_user.id)) else "offline",
            } if other_user else None,
        })

    return sorted(out, key=lambda x: x["last_message"]["created_at"] if x["last_message"] else "", reverse=True)


@router.get("/{chat_id}/messages")
async def get_messages(
    chat_id: int,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    member = await db.execute(
        select(ChatMember).where(
            and_(ChatMember.chat_id == chat_id, ChatMember.user_id == current_user.id)
        )
    )
    if not member.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа")

    result = await db.execute(
        select(Message).where(Message.chat_id == chat_id)
        .order_by(desc(Message.created_at)).offset(offset).limit(limit)
    )
    messages = result.scalars().all()

    out = []
    for msg in reversed(messages):
        u_result = await db.execute(select(User).where(User.id == msg.sender_id))
        sender = u_result.scalar_one()
        out.append({
            "id": msg.id,
            "chat_id": msg.chat_id,
            "sender_id": msg.sender_id,
            "sender_name": sender.username,
            "sender_color": sender.avatar_color,
            "text": msg.text,
            "created_at": msg.created_at.isoformat(),
            "is_read": msg.is_read,
            "is_mine": msg.sender_id == current_user.id,
        })

    for msg in messages:
        if msg.sender_id != current_user.id and not msg.is_read:
            msg.is_read = True
    await db.commit()

    return out
