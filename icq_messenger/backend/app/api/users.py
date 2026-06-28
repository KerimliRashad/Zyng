from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from app.database import get_db
from app.models import User, FriendRequest, Chat, ChatMember, ChatType
from app.auth import get_current_user
from app.websocket.manager import manager

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/search")
async def search_users(q: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Search by ID if query is a number, otherwise by username
    if q.isdigit():
        result = await db.execute(
            select(User).where(and_(User.id == int(q), User.id != current_user.id))
        )
    else:
        result = await db.execute(
            select(User).where(
                and_(User.username.ilike(f"%{q}%"), User.id != current_user.id)
            ).limit(20)
        )
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "avatar_color": u.avatar_color,
            "status": "online" if manager.is_online(str(u.id)) else "offline",
        }
        for u in users
    ]


@router.post("/friend-request/{user_id}")
async def send_friend_request(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя добавить себя")

    existing = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == user_id),
                and_(FriendRequest.sender_id == user_id, FriendRequest.receiver_id == current_user.id),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Запрос уже отправлен")

    req = FriendRequest(sender_id=current_user.id, receiver_id=user_id)
    db.add(req)
    await db.commit()
    await db.refresh(req)

    await manager.send_to_user(str(user_id), {
        "type": "friend_request",
        "from_id": current_user.id,
        "from_name": current_user.username,
        "from_username": current_user.username,
        "request_id": req.id,
    })
    return {"status": "sent"}


@router.post("/friend-request/{request_id}/accept")
async def accept_friend_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(FriendRequest).where(
            and_(FriendRequest.id == request_id, FriendRequest.receiver_id == current_user.id)
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Запрос не найден")

    req.status = "accepted"

    chat = Chat(type=ChatType.PERSONAL)
    db.add(chat)
    await db.flush()

    db.add(ChatMember(chat_id=chat.id, user_id=req.sender_id))
    db.add(ChatMember(chat_id=chat.id, user_id=current_user.id))
    await db.commit()

    sender_result = await db.execute(select(User).where(User.id == req.sender_id))
    sender = sender_result.scalar_one()

    await manager.send_to_user(str(req.sender_id), {
        "type": "friend_accepted",
        "chat_id": chat.id,
        "user_id": current_user.id,
        "display_name": current_user.username,
        "username": current_user.username,
        "avatar_color": current_user.avatar_color,
    })

    return {
        "chat_id": chat.id,
        "user": {
            "id": sender.id,
            "username": sender.username,
            "avatar_color": sender.avatar_color,
        }
    }


@router.get("/friends")
async def get_friends(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(FriendRequest).where(
            and_(
                or_(
                    FriendRequest.sender_id == current_user.id,
                    FriendRequest.receiver_id == current_user.id
                ),
                FriendRequest.status == "accepted"
            )
        )
    )
    requests = result.scalars().all()

    friends = []
    for req in requests:
        friend_id = req.receiver_id if req.sender_id == current_user.id else req.sender_id
        u_result = await db.execute(select(User).where(User.id == friend_id))
        u = u_result.scalar_one_or_none()
        if not u:
            continue

        # Find shared personal chat
        chat_id = None
        cm_result = await db.execute(
            select(ChatMember).where(ChatMember.user_id == current_user.id)
        )
        for cm in cm_result.scalars().all():
            other = await db.execute(
                select(ChatMember).where(
                    and_(ChatMember.chat_id == cm.chat_id, ChatMember.user_id == friend_id)
                )
            )
            if other.scalar_one_or_none():
                chat_id = cm.chat_id
                break

        friends.append({
            "id": u.id,
            "username": u.username,
            "avatar_color": u.avatar_color,
            "status": "online" if manager.is_online(str(u.id)) else "offline",
            "status_message": u.status_message,
            "chat_id": chat_id,
        })

    return friends


@router.get("/pending-requests")
async def get_pending_requests(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(FriendRequest).where(
            and_(FriendRequest.receiver_id == current_user.id, FriendRequest.status == "pending")
        )
    )
    out = []
    for req in result.scalars().all():
        u_result = await db.execute(select(User).where(User.id == req.sender_id))
        u = u_result.scalar_one_or_none()
        if u:
            out.append({
                "request_id": req.id,
                "from_id": u.id,
                "from_name": u.username,
                "from_username": u.username,
                "avatar_color": u.avatar_color,
            })
    return out
