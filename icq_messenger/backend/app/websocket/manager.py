import json
from typing import Dict, Set
from uuid import UUID
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # user_id -> set of websockets
        self.active: Dict[str, Set[WebSocket]] = {}
        # chat_id -> set of user_ids
        self.chat_users: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active:
            self.active[user_id] = set()
        self.active[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active:
            self.active[user_id].discard(websocket)
            if not self.active[user_id]:
                del self.active[user_id]

    def join_chat(self, chat_id: str, user_id: str):
        if chat_id not in self.chat_users:
            self.chat_users[chat_id] = set()
        self.chat_users[chat_id].add(user_id)

    def leave_chat(self, chat_id: str, user_id: str):
        if chat_id in self.chat_users:
            self.chat_users[chat_id].discard(user_id)

    def is_online(self, user_id: str) -> bool:
        return user_id in self.active and len(self.active[user_id]) > 0

    def get_online_users(self) -> list:
        return [uid for uid, sockets in self.active.items() if sockets]

    async def send_to_user(self, user_id: str, data: dict):
        if user_id in self.active:
            dead = set()
            for ws in self.active[user_id]:
                try:
                    await ws.send_text(json.dumps(data))
                except Exception:
                    dead.add(ws)
            self.active[user_id] -= dead

    async def broadcast_to_chat(self, chat_id: str, data: dict, exclude_user: str = None):
        if chat_id in self.chat_users:
            for user_id in self.chat_users[chat_id]:
                if user_id != exclude_user:
                    await self.send_to_user(user_id, data)

    async def broadcast_status(self, user_id: str, status: str):
        """Notify all users who share a chat with this user about status change."""
        notified = set()
        for chat_id, users in self.chat_users.items():
            if user_id in users:
                for uid in users:
                    if uid != user_id and uid not in notified:
                        await self.send_to_user(uid, {
                            "type": "user_status",
                            "user_id": user_id,
                            "status": status
                        })
                        notified.add(uid)


manager = ConnectionManager()
