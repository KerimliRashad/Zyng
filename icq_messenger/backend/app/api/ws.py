import json
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.database import AsyncSessionLocal
from app.models import User, Message, Chat, ChatMember
from app.auth import SECRET_KEY, ALGORITHM
from app.websocket.manager import manager
from datetime import datetime

router = APIRouter()


async def get_user_from_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except Exception:
        return None


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    user_id = await get_user_from_token(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, user_id)

    async with AsyncSessionLocal() as db:
        # Load user's chats into manager
        result = await db.execute(
            select(ChatMember).where(ChatMember.user_id == user_id)
        )
        for member in result.scalars().all():
            manager.join_chat(str(member.chat_id), user_id)

        # Update status to online
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.status = "online"
            await db.commit()

    await manager.broadcast_status(user_id, "online")

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            await handle_message(user_id, msg)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, user_id)
        async with AsyncSessionLocal() as db:
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            if user:
                user.status = "offline"
                await db.commit()
        await manager.broadcast_status(user_id, "offline")

        # Leave all chats
        for chat_id in list(manager.chat_users.keys()):
            manager.leave_chat(chat_id, user_id)


async def handle_message(user_id: str, data: dict):
    msg_type = data.get("type")

    if msg_type == "send_message":
        chat_id = data.get("chat_id")
        text = data.get("text", "").strip()
        if not chat_id or not text:
            return

        async with AsyncSessionLocal() as db:
            # Verify membership
            member = await db.execute(
                select(ChatMember).where(
                    and_(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
                )
            )
            if not member.scalar_one_or_none():
                return

            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one()

            message = Message(
                chat_id=chat_id,
                sender_id=user_id,
                text=text,
                created_at=datetime.utcnow(),
            )
            db.add(message)
            await db.commit()
            await db.refresh(message)

            payload = {
                "type": "new_message",
                "id": str(message.id),
                "chat_id": chat_id,
                "sender_id": user_id,
                "sender_name": user.display_name,
                "sender_color": user.avatar_color,
                "text": text,
                "created_at": message.created_at.isoformat(),
                "is_read": False,
            }

        await manager.send_to_user(user_id, {**payload, "is_mine": True})
        await manager.broadcast_to_chat(chat_id, {**payload, "is_mine": False}, exclude_user=user_id)

    elif msg_type == "typing":
        chat_id = data.get("chat_id")
        if chat_id:
            await manager.broadcast_to_chat(chat_id, {
                "type": "typing",
                "chat_id": chat_id,
                "user_id": user_id,
            }, exclude_user=user_id)

    elif msg_type == "join_chat":
        chat_id = data.get("chat_id")
        if chat_id:
            manager.join_chat(chat_id, user_id)
