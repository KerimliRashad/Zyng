# 🚀 Полная инструкция развертывания ZyngTRACKER на zyng.online/tracker

**Следуй этим шагам - всё будет работать!**

---

## 📋 Структура развертывания

```
zyng.online/        → Основной сайт
zyng.online/tracker → ZyngTRACKER (НОВОЕ)
localhost:5000      → Backend API для TRACKER
```

---

## 🔧 Быстрое развертывание на сервере

### Шаг 1: SSH подключение

```bash
ssh root@72.62.247.43
```

### Шаг 2: Клонирование и подготовка

```bash
cd /var/www
git clone https://github.com/KerimliRashad/Zyng.git
cd Zyng/Tracker

# Установка зависимостей
npm install
cd frontend && npm install
cd ../backend && npm install
```

### Шаг 3: Сборка Frontend

```bash
cd frontend
npm run build
# Будет создана папка dist/
```

### Шаг 4: Копирование на веб-сервер

```bash
mkdir -p /var/www/html/tracker
cp -r dist/* /var/www/html/tracker/
chmod -R 755 /var/www/html/tracker
```

### Шаг 5: Запуск Backend через PM2

```bash
cd /var/www/Zyng/Tracker/backend

# Создаём .env если его нет
cat > .env << 'EOF'
PORT=5000
NODE_ENV=production
EOF

# Запускаем с PM2
pm2 start server.js --name "tracker-api"
pm2 startup
pm2 save
```

### Шаг 6: Настройка Nginx

Отредактируй `/etc/nginx/sites-available/zyng.online`:

```bash
nano /etc/nginx/sites-available/zyng.online
```

**Добавь эти блоки в конфиг:**

```nginx
# Upstream для Tracker API
upstream tracker_api {
    server localhost:5000;
}

server {
    listen 80;
    server_name zyng.online www.zyng.online;

    # Основной сайт (оставляем как было)
    location / {
        root /var/www/html;
        index index.html index.htm index.php;
        try_files $uri $uri/ /index.php?$query_string;
    }

    # ZyngTRACKER Frontend
    location /tracker {
        alias /var/www/html/tracker;
        try_files $uri $uri/ /tracker/index.html;
    }

    # ZyngTRACKER API
    location /tracker/api {
        proxy_pass http://tracker_api/api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type' always;

        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # Кэширование статических файлов
    location ~ ^/tracker/(js|css|img)/ {
        alias /var/www/html/tracker/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # PHP (если используется)
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
}
```

**Сохрани файл: Ctrl+X, Y, Enter**

### Шаг 7: Проверка конфига Nginx

```bash
nginx -t
```

Должно быть:
```
nginx: configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Шаг 8: Перезагрузка Nginx

```bash
systemctl restart nginx
```

### Шаг 9: Проверка работы

**Frontend:**
```bash
curl http://zyng.online/tracker
```

**Backend API:**
```bash
curl http://localhost:5000/api/health
```

Должно вывести:
```json
{"status":"ok","service":"Tracker Backend"}
```

---

## ✅ ГОТОВО!

Теперь открой в браузере:

👉 **http://zyng.online/tracker**

---

## 📊 Управление Tracker

### Проверка статуса
```bash
pm2 status
```

### Просмотр логов
```bash
pm2 logs tracker-api
```

### Перезапуск
```bash
pm2 restart tracker-api
```

### Остановка
```bash
pm2 stop tracker-api
```

---

## 🆘 Решение проблем

### Tracker загружается пусто

```bash
# Проверить файлы
ls -la /var/www/html/tracker/

# Проверить права доступа
chmod -R 755 /var/www/html/tracker/

# Проверить размер папки
du -sh /var/www/html/tracker/
```

### API не отвечает

```bash
# Проверить процесс
pm2 status

# Смотреть логи ошибок
pm2 logs tracker-api --lines 100

# Проверить порт
lsof -i :5000

# Перезапустить
pm2 restart tracker-api
```

### Nginx ошибки

```bash
# Проверить конфиг
nginx -t

# Смотреть логи
tail -100 /var/log/nginx/error.log

# Проверить что процесс запущен
systemctl status nginx
```

### 404 на /tracker

Убедись что:
1. Frontend собран: `ls -la /var/www/html/tracker/`
2. Nginx конфиг обновлен: `nginx -t`
3. Nginx перезагружен: `systemctl restart nginx`

---

## 🔄 Обновление Tracker

Когда нужно обновить код:

```bash
# Перейти в репо
cd /var/www/Zyng/Tracker

# Получить новый код
git pull origin claude/browser-vpn-keys-app-lz819v

# Пересобрать frontend
cd frontend
npm install  # если были новые зависимости
npm run build

# Скопировать новый build
rm -rf /var/www/html/tracker/*
cp -r dist/* /var/www/html/tracker/

# Перезагрузить Nginx
nginx -s reload

# Если backend изменился
cd ../backend
npm install
pm2 restart tracker-api

echo "✅ Обновлено!"
```

---

## 📱 Функциональность Tracker

Пользователь видит:
- 🎯 Форма для ввода личных данных
- 📊 Расчёт TDEE (сколько калорий в день нужно)
- 🥗 Рекомендации по макронутриентам
- 💪 План тренировок под свой уровень
- ⚖️ Отслеживание веса
- 🍲 Счётчик калорий
- 📈 Прогресс и статистика
- 💡 Советы по здоровью

---

## 🎯 Интеграция в основной сайт

Добавь ссылку на главной странице:

```html
<a href="/tracker">💪 Фитнес Трекер</a>
```

---

## 📝 Важные файлы

- `/var/www/Zyng/Tracker/` - исходный код
- `/var/www/html/tracker/` - развёрнутое приложение
- `/etc/nginx/sites-available/zyng.online` - конфиг Nginx
- `~/.pm2/logs/` - логи PM2

---

## ⚡ Оптимизация

### Кэширование
Все CSS/JS файлы кэшируются на 30 дней в браузере пользователя.

### Сжатие
Frontend собирается с Terser минификацией.

### API
Backend использует в памяти калькуляторы - нет БД, очень быстро.

---

## 🚀 Масштабирование (в будущем)

Если будет много пользователей:
1. Добавить базу данных (PostgreSQL/MongoDB)
2. Добавить аутентификацию (JWT)
3. Оптимизировать API (кэширование, индексы)
4. Добавить CDN для статических файлов
5. Масштабировать backend (load balancer, несколько процессов)

---

**ГОТОВО! Tracker должен работать на zyng.online/tracker 🎉**

Если что-то не получается - проверь логи и конфиги!
