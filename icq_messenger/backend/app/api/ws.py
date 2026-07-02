import json
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select, and_
from app.database import AsyncSessionLocal
from app.models import User, Message, ChatMember, Chat, ChatType
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
        reply_to_id = data.get("reply_to_id")

        if not chat_id or (not text and not file_url):
            return

        async with AsyncSessionLocal() as db:
            mem = await db.execute(
                select(ChatMember).where(
                    and_(ChatMember.chat_id == int(chat_id), ChatMember.user_id == int(uid))
                )
            )
            my_mem = mem.scalar_one_or_none()
            if not my_mem:
                return

            # Channel: only owner/admin can post
            chat = await db.get(Chat, int(chat_id))
            if chat and chat.is_channel and my_mem.role not in ("owner", "admin"):
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
                reply_to_id=reply_to_id,
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
                "reply_to_id": reply_to_id,
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

    elif t == "edit_message":
        mid = data.get("message_id")
        text = (data.get("text") or "").strip()
        if not mid or not text:
            return
        async with AsyncSessionLocal() as db:
            m = await db.get(Message, int(mid))
            if not m or m.sender_id != int(uid):
                return
            m.text = text
            m.is_edited = True
            await db.commit()
            chat_id = m.chat_id
        await manager.broadcast_to_chat(str(chat_id), {
            "type": "message_edited", "id": int(mid), "chat_id": chat_id, "text": text,
        })

    elif t == "delete_message":
        mid = data.get("message_id")
        if not mid:
            return
        async with AsyncSessionLocal() as db:
            m = await db.get(Message, int(mid))
            if not m or m.sender_id != int(uid):
                return
            chat_id = m.chat_id
            # убрать ссылки reply_to на удаляемое сообщение
            refs = await db.execute(select(Message).where(Message.reply_to_id == int(mid)))
            for r in refs.scalars().all():
                r.reply_to_id = None
            await db.delete(m)
            await db.commit()
        await manager.broadcast_to_chat(str(chat_id), {
            "type": "message_deleted", "id": int(mid), "chat_id": chat_id,
        })

    # WebRTC signaling for voice/video calls
    elif t == "call_offer":
        target_uid = str(data.get("to_user_id"))
        async with AsyncSessionLocal() as db:
            caller = await db.get(User, int(uid))
        await manager.send_to_user(target_uid, {
            "type": "call_offer",
            "from_user_id": int(uid),
            "from_name": data.get("from_name", "") or (caller.username if caller else ""),
            "from_color": caller.avatar_color if caller else "#5288c1",
            "sdp": data.get("sdp"),
            "call_type": data.get("call_type", "voice"),
        })

    elif t == "call_answer":
        target_uid = str(data.get("to_user_id"))
        await manager.send_to_user(target_uid, {
            "type": "call_answer",
            "from_user_id": int(uid),
            "sdp": data.get("sdp"),
        })

    elif t == "call_ice":
        target_uid = str(data.get("to_user_id"))
        await manager.send_to_user(target_uid, {
            "type": "call_ice",
            "from_user_id": int(uid),
            "candidate": data.get("candidate"),
        })

    elif t == "call_end":
        target_uid = str(data.get("to_user_id"))
        await manager.send_to_user(target_uid, {
            "type": "call_end",
            "from_user_id": int(uid),
        })

    elif t == "call_reject":
        target_uid = str(data.get("to_user_id"))
        await manager.send_to_user(target_uid, {
            "type": "call_reject",
            "from_user_id": int(uid),
        })
