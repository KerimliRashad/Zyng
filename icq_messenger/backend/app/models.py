from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey, Integer, Enum as SAEnum, BigInteger
from sqlalchemy.orm import relationship, DeclarativeBase
import enum


class Base(DeclarativeBase):
    pass


class ChatType(str, enum.Enum):
    PERSONAL = "PERSONAL"
    GROUP = "GROUP"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    avatar_color = Column(String(7), default="#5B8DEF")
    status = Column(String(20), default="offline")
    status_message = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def is_admin(self):
        return self.id == 1

    sent_messages = relationship("Message", back_populates="sender", foreign_keys="Message.sender_id")
    memberships = relationship("ChatMember", back_populates="user")
    friend_requests_sent = relationship("FriendRequest", back_populates="sender", foreign_keys="FriendRequest.sender_id")
    friend_requests_received = relationship("FriendRequest", back_populates="receiver", foreign_keys="FriendRequest.receiver_id")


class Chat(Base):
    __tablename__ = "chats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=True)
    type = Column(SAEnum(ChatType), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    messages = relationship("Message", back_populates="chat", order_by="Message.created_at")
    members = relationship("ChatMember", back_populates="chat")


class ChatMember(Base):
    __tablename__ = "chat_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    chat = relationship("Chat", back_populates="members")
    user = relationship("User", back_populates="memberships")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=True)
    file_url = Column(String(500), nullable=True)
    file_name = Column(String(255), nullable=True)
    file_size = Column(BigInteger, nullable=True)
    file_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)

    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User", back_populates="sent_messages")


class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    sender = relationship("User", back_populates="friend_requests_sent", foreign_keys=[sender_id])
    receiver = relationship("User", back_populates="friend_requests_received", foreign_keys=[receiver_id])
