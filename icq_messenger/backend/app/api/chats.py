from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from pydantic import BaseModel
from typing import List, Optional
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
        "sender_name": sender.username if sender else "Deleted",
        "sender_color": sender.avatar_color if sender else "#5B8DEF",
        "text": msg.text or "",
        "file_url": msg.file_url,
        "file_name": msg.file_name,
        "file_size": msg.file_size,
        "file_type": msg.file_type,
        "reply_to_id": msg.reply_to_id,
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

        member_count = len((await db.execute(
            select(ChatMember).where(ChatMember.chat_id == c.id)
        )).scalars().all())

        my_role = "member"
        my_mem = (await db.execute(
            select(ChatMember).where(and_(ChatMember.chat_id == c.id, ChatMember.user_id == cu.id))
        )).scalar_one_or_none()
        if my_mem:
            my_role = my_mem.role or "member"

        out.append({
            "id": c.id,
            "name": other.username if other else (c.name or "Чат"),
            "type": c.type.value,
            "description": c.description or "",
            "avatar_color": other.avatar_color if other else (c.avatar_color or "#5B8DEF"),
            "is_channel": c.is_channel or False,
            "member_count": member_count,
            "my_role": my_role,
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


@router.get("/{chat_id}/members")
async def get_members(
    chat_id: int,
    db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)
):
    if not (await db.execute(
        select(ChatMember).where(and_(ChatMember.chat_id == chat_id, ChatMember.user_id == cu.id))
    )).scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа")

    mems = (await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id)
    )).scalars().all()

    out = []
    for m in mems:
        u = await db.get(User, m.user_id)
        if u:
            out.append({
                "id": u.id, "username": u.username,
                "avatar_color": u.avatar_color,
                "status": "online" if manager.is_online(str(u.id)) else "offline",
                "role": m.role or "member",
            })
    return out


class CreateGroupRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    is_channel: bool = False
    member_ids: List[int] = []


@router.post("/group")
async def create_group(
    data: CreateGroupRequest,
    db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)
):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Название обязательно")

    import random
    colors = ["#5B8DEF", "#9b59b6", "#e74c3c", "#e67e22", "#2ecc71", "#1abc9c", "#e91e8c"]
    chat = Chat(
        name=data.name.strip(),
        description=data.description or "",
        type=ChatType.CHANNEL if data.is_channel else ChatType.GROUP,
        is_channel=data.is_channel,
        owner_id=cu.id,
        avatar_color=random.choice(colors),
    )
    db.add(chat)
    await db.flush()

    # Add creator as owner
    db.add(ChatMember(chat_id=chat.id, user_id=cu.id, role="owner"))

    # Add members
    for uid in data.member_ids:
        if uid != cu.id:
            u = await db.get(User, uid)
            if u:
                db.add(ChatMember(chat_id=chat.id, user_id=uid, role="member"))

    await db.commit()
    await db.refresh(chat)

    # Notify all added members
    member_ids_all = [cu.id] + [uid for uid in data.member_ids if uid != cu.id]
    for uid in member_ids_all:
        if uid != cu.id:
            await manager.send_to_user(str(uid), {
                "type": "added_to_group",
                "chat_id": chat.id,
                "chat_name": chat.name,
                "is_channel": chat.is_channel,
                "avatar_color": chat.avatar_color,
            })

    return {"chat_id": chat.id, "name": chat.name}


class AddMemberRequest(BaseModel):
    user_id: int


@router.post("/{chat_id}/members")
async def add_member(
    chat_id: int, data: AddMemberRequest,
    db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)
):
    my_mem = (await db.execute(
        select(ChatMember).where(and_(ChatMember.chat_id == chat_id, ChatMember.user_id == cu.id))
    )).scalar_one_or_none()
    if not my_mem or my_mem.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Нет прав")

    existing = (await db.execute(
        select(ChatMember).where(and_(ChatMember.chat_id == chat_id, ChatMember.user_id == data.user_id))
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Уже в группе")

    chat = await db.get(Chat, chat_id)
    db.add(ChatMember(chat_id=chat_id, user_id=data.user_id, role="member"))
    await db.commit()

    await manager.send_to_user(str(data.user_id), {
        "type": "added_to_group",
        "chat_id": chat_id,
        "chat_name": chat.name if chat else "Группа",
        "is_channel": chat.is_channel if chat else False,
        "avatar_color": chat.avatar_color if chat else "#5B8DEF",
    })
    return {"status": "ok"}


@router.post("/{chat_id}/leave")
async def leave_chat(
    chat_id: int,
    db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)
):
    mem = (await db.execute(
        select(ChatMember).where(and_(ChatMember.chat_id == chat_id, ChatMember.user_id == cu.id))
    )).scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=404, detail="Вы не в этом чате")

    chat = await db.get(Chat, chat_id)
    if chat and chat.type == ChatType.PERSONAL:
        # For personal chats: delete the chat and all messages
        await db.execute(select(Message).where(Message.chat_id == chat_id))
        msgs = (await db.execute(select(Message).where(Message.chat_id == chat_id))).scalars().all()
        for m in msgs:
            await db.delete(m)
        mems = (await db.execute(select(ChatMember).where(ChatMember.chat_id == chat_id))).scalars().all()
        for m in mems:
            await db.delete(m)
        await db.delete(chat)
    else:
        # Group/channel: just remove the member
        await db.delete(mem)
        # If owner leaves, delete entire group
        if chat and mem.role == 'owner':
            msgs = (await db.execute(select(Message).where(Message.chat_id == chat_id))).scalars().all()
            for m in msgs:
                await db.delete(m)
            rest = (await db.execute(select(ChatMember).where(ChatMember.chat_id == chat_id))).scalars().all()
            for m in rest:
                await db.delete(m)
            await db.delete(chat)

    await db.commit()
    return {"status": "ok"}


@router.delete("/{chat_id}/members/{user_id}")
async def remove_member(
    chat_id: int, user_id: int,
    db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_user)
):
    my_mem = (await db.execute(
        select(ChatMember).where(and_(ChatMember.chat_id == chat_id, ChatMember.user_id == cu.id))
    )).scalar_one_or_none()
    if not my_mem:
        raise HTTPException(status_code=403, detail="Нет доступа")

    # Can only remove self OR if admin/owner
    if user_id != cu.id and my_mem.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Нет прав")

    target = (await db.execute(
        select(ChatMember).where(and_(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id))
    )).scalar_one_or_none()
    if target:
        await db.delete(target)
        await db.commit()
    return {"status": "ok"}
