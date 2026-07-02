from datetime import datetime
from sqlalchemy import Column, String, Integer, BigInteger, Boolean, DateTime
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class VpnUser(Base):
    __tablename__ = "vpn_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Логин/метка пользователя (email в терминах xray)
    name = Column(String(100), unique=True, nullable=False)
    # UUID для VLESS/VMess
    uuid = Column(String(64), unique=True, nullable=False)
    # Пароль для Trojan / Shadowsocks
    secret = Column(String(64), nullable=False)
    # Токен для ссылки-подписки /sub/{token}
    sub_token = Column(String(64), unique=True, nullable=False)

    # Тариф / срок
    plan = Column(String(50), default="basic")
    expires_at = Column(DateTime, nullable=True)          # None = бессрочно
    traffic_limit = Column(BigInteger, default=0)         # байты, 0 = безлимит
    traffic_used = Column(BigInteger, default=0)

    is_active = Column(Boolean, default=True)
    telegram_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def is_expired(self):
        return self.expires_at is not None and self.expires_at < datetime.utcnow()

    @property
    def enabled(self):
        return self.is_active and not self.is_expired
