import json
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select, and_
from app.database import AsyncSessionLocal
from app.models import User, Message, ChatMember
from app.auth import SECRET_KEY, ALGORITHM
from app.websocket.manager import manager
from datetime import datetime

router = APIRouter()


async def get_uid(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except Exception:
        return None


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: str = ""):
    uid = await get_uid(token)
    if not uid:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, uid)

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(ChatMember).where(ChatMember.user_id == int(uid)))
        for m in res.scalars().all():
            manager.join_chat(str(m.chat_id), uid)
        u = await db.get(User, int(uid))
        if u:
            u.status = "online"
            await db.commit()

    await manager.broadcast_status(uid, "online")

    try:
        while True:
            raw = await websocket.receive_text()
            await handle(uid, json.loads(raw))
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, uid)
        async with AsyncSessionLocal() as db:
            u = await db.get(User, int(uid))
            if u:
                u.status = "offline"
                await db.commit()
        await manager.broadcast_status(uid, "offline")
        for cid in list(manager.chat_users.keys()):
            manager.leave_chat(cid, uid)


async def handle(uid: str, data: dict):
    t = data.get("type")

    if t == "send_message":
        chat_id = data.get("chat_id")
        text = data.get("text", "").strip()
        file_url = data.get("file_url")
        file_name = data.get("file_name")
        file_size = data.get("file_size")
        file_type = data.get("file_type")

        if not chat_id or (not text and not file_url):
            return

        async with AsyncSessionLocal() as db:
            mem = await db.execute(
                select(ChatMember).where(
                    and_(ChatMember.chat_id == int(chat_id), ChatMember.user_id == int(uid))
                )
            )
            if not mem.scalar_one_or_none():
                return

            user = await db.get(User, int(uid))
            msg = Message(
                chat_id=int(chat_id),
                sender_id=int(uid),
                text=text or None,
                file_url=file_url,
                file_name=file_name,
                file_size=file_size,
                file_type=file_type,
                created_at=datetime.utcnow(),
            )
            db.add(msg)
            await db.commit()
            await db.refresh(msg)

            payload = {
                "type": "new_message",
                "id": msg.id,
                "chat_id": int(chat_id),
                "sender_id": int(uid),
                "sender_name": user.username,
                "sender_color": user.avatar_color,
                "text": text or "",
                "file_url": file_url,
                "file_name": file_name,
                "file_size": file_size,
                "file_type": file_type,
                "created_at": msg.created_at.isoformat(),
                "is_read": False,
            }

        await manager.send_to_user(uid, {**payload, "is_mine": True})
        await manager.broadcast_to_chat(str(chat_id), {**payload, "is_mine": False}, exclude_user=uid)

    elif t == "typing":
        chat_id = data.get("chat_id")
        if chat_id:
            await manager.broadcast_to_chat(str(chat_id), {
                "type": "typing", "chat_id": int(chat_id), "user_id": int(uid)
            }, exclude_user=uid)

    elif t == "join_chat":
        chat_id = data.get("chat_id")
        if chat_id:
            manager.join_chat(str(chat_id), uid)
