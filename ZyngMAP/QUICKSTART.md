# ⚡ Quick Start - ZyngMAP in 5 Minutes

## 🐳 Fastest Way (Docker)

```bash
# Clone and navigate
git clone <repo-url>
cd ZyngMAP

# Start everything
docker compose up --build

# Open browser
# → http://localhost:3000
```

Done! 🎉

---

## 🖥️ Windows Without Docker

### 1. Download Node.js
👉 https://nodejs.org/ (LTS version)

### 2. Open Command Prompt
Press `Win+R`, type `cmd`

### 3. Navigate to Project
```bash
cd path\to\ZyngMAP
```

### 4. Install & Run
```bash
# Install everything
npm run install-all

# Terminal 1: Start backend
cd backend && npm start

# Terminal 2: Start frontend (new window)
cd frontend && npm run dev
```

### 5. Open
👉 http://localhost:3000

---

## 🍎 macOS Without Docker

```bash
# Install Node if needed
brew install node

# Navigate to project
cd ~/path/to/ZyngMAP

# Install & Run
npm run install-all

# Terminal 1
cd backend && npm start

# Terminal 2 (new tab: Cmd+T)
cd frontend && npm run dev
```

Open: http://localhost:3000

---

## 🐧 Linux Without Docker

```bash
# Install Node
sudo apt install nodejs npm

# Navigate to project
cd ~/ZyngMAP

# Install & Run
npm run install-all

# Terminal 1
cd backend && npm start

# Terminal 2
cd frontend && npm run dev
```

Open: http://localhost:3000

---

## 🗺️ Using ZyngMAP

1. **Click on Map** → Select start point (point A)
2. **Click Again** → Select end point (point B)
3. **Choose Vehicle** → 🚗 Car or 🚚 Truck
4. **Pick Region** → 🇺🇸 USA, 🇪🇺 Europe, or 🇷🇺 Russia
5. **Set Height** (Trucks) → Adjust with slider
6. **Calculate** → Click "🔍 Calculate Route"
7. **Save** → Click "💾 Save Route" (optional)

---

## 📊 What You'll See

✅ **Interactive Map** - Clickable world map
✅ **Route Line** - Blue line from A to B
✅ **Route Info** - Distance, time, vehicle type
✅ **Saved Routes** - Previous routes stored

---

## 🚗 Vehicle Height Limits

| Region | Min | Max | Notes |
|--------|-----|-----|-------|
| 🇺🇸 USA | 4.11m | 4.29m | Federal standard |
| 🇪🇺 Europe | 4.0m | 4.3m | EU regulations |
| 🇷🇺 Russia | 3.8m | 4.2m | Regional varies |

---

## 🆘 Quick Troubleshooting

| Problem | Fix |
|---------|-----|
| Map blank? | Check internet connection, refresh page |
| Route not showing? | Make sure backend is running (port 5000) |
| Port in use? | Change port in vite.config.js |
| Still stuck? | See [SETUP.md](SETUP.md) for detailed help |

---

## 📚 Learn More

- [Full Documentation](README.md)
- [Detailed Setup Guide](SETUP.md)
- [API Reference](README.md#-api-endpoints)

---

**Happy Navigating! 🗺️✨**
