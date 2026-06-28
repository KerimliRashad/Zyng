# ICQ Messenger

Мессенджер в стиле ICQ. FastAPI + WebSocket + PostgreSQL + HTML/CSS/JS фронтенд.

## Быстрый старт на сервере

```bash
# Клонировать репо и перейти в папку
cd icq_messenger

# Запустить
docker compose up --build -d

# Приложение доступно на http://YOUR_IP:8000
```

## Функции

- Регистрация и авторизация (JWT)
- Поиск пользователей
- Запросы в друзья
- Личные чаты в реальном времени (WebSocket)
- Индикатор печатания
- Статус онлайн/офлайн
- ICQ-стиль дизайн (тёмная тема)

## Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `SECRET_KEY` | JWT секрет | `change-this-secret-in-production` |
| `DATABASE_URL` | PostgreSQL URL | `postgresql+asyncpg://icq:icqpass@db:5432/icqdb` |
