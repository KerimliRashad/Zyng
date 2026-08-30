# 🚀 ZyngMAP Setup Guide

Choose your platform and follow the instructions.

## 🐳 Docker (All Platforms - Easiest)

### Install Docker

**Windows & Mac**: Download [Docker Desktop](https://www.docker.com/products/docker-desktop)

**Linux**:
```bash
sudo apt-get install docker.io docker-compose
sudo usermod -aG docker $USER
```

### Run ZyngMAP

```bash
cd ZyngMAP
docker compose up --build
```

Open: http://localhost:3000

---

## 💻 Windows Manual Setup

### Step 1: Install Node.js

1. Go to https://nodejs.org/
2. Download **LTS version** (v18+)
3. Run installer, accept default settings
4. Restart your computer

### Step 2: Verify Installation

Open Command Prompt (Win+R, type `cmd`):
```bash
node --version
npm --version
```

Should show version numbers like `v18.x.x` and `9.x.x`

### Step 3: Clone/Download Project

```bash
cd %USERPROFILE%\Desktop
# Or your preferred location
git clone <repo-url>
cd ZyngMAP
```

### Step 4: Install Dependencies

```bash
npm run install-all
```

This installs frontend and backend packages (takes 2-5 minutes)

### Step 5: Start Backend (Terminal 1)

```bash
cd backend
npm start
```

You should see:
```
🚀 ZyngMAP Backend running on http://localhost:5000
```

### Step 6: Start Frontend (Terminal 2)

```bash
# Open new Command Prompt window
cd ZyngMAP
cd frontend
npm run dev
```

You should see:
```
Local: http://localhost:3000
```

### Step 7: Open Browser

- Click link or go to **http://localhost:3000**
- Should see ZyngMAP with map

### Stop Running

Press `Ctrl+C` in both terminal windows

---

## 🍎 macOS Manual Setup

### Step 1: Install Node.js

**Option A: Using Homebrew**
```bash
brew install node
```

**Option B: Direct Download**
- Go to https://nodejs.org/ (LTS)
- Download macOS installer
- Run installer

### Step 2: Verify Installation

```bash
node --version
npm --version
```

### Step 3: Clone Project

```bash
cd ~/Desktop
# Or your preferred location
git clone <repo-url>
cd ZyngMAP
```

### Step 4: Install Dependencies

```bash
npm run install-all
```

### Step 5: Start Backend (Terminal 1)

```bash
cd backend
npm start
```

### Step 6: Start Frontend (Terminal 2)

```bash
# Open new Terminal tab (Cmd+T)
cd ZyngMAP/frontend
npm run dev
```

### Step 7: Open Browser

Visit **http://localhost:3000**

---

## 🐧 Linux (Ubuntu/Debian) Manual Setup

### Step 1: Install Node.js

```bash
sudo apt update
sudo apt install nodejs npm
```

Verify:
```bash
node --version
npm --version
```

### Step 2: Clone Project

```bash
git clone <repo-url>
cd ZyngMAP
```

### Step 3: Install Dependencies

```bash
npm run install-all
```

### Step 4: Start Backend (Terminal 1)

```bash
cd backend
npm start
```

### Step 5: Start Frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

### Step 6: Open Browser

Visit **http://localhost:3000**

---

## ⚙️ Troubleshooting

### Port Already in Use

**Windows:**
```bash
# Find process on port 3000
netstat -ano | findstr :3000

# Kill process (replace PID)
taskkill /PID 12345 /F
```

**Mac/Linux:**
```bash
# Find process
lsof -i :3000

# Kill process (replace PID)
kill -9 12345
```

### NPM Install Fails

```bash
# Clear cache
npm cache clean --force

# Remove node_modules
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Backend Not Connecting

1. Check backend is running:
   - Terminal should say: `🚀 ZyngMAP Backend running on http://localhost:5000`

2. Test backend:
   ```bash
   curl http://localhost:5000/api/health
   ```

3. Check firewall isn't blocking port 5000

### Map Not Loading

1. Check internet connection
2. Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)
3. Hard refresh (Ctrl+F5 or Cmd+Shift+R)

### "Cannot find module"

```bash
# Reinstall all dependencies
npm run install-all
```

---

## 📱 Mobile Testing

Access from phone on same network:

1. Find your computer IP:
   - **Windows**: `ipconfig` → look for "IPv4 Address"
   - **Mac/Linux**: `ifconfig` → look for "inet"

2. On phone browser:
   - `http://YOUR_IP:3000`

---

## 🚀 Next Steps

1. ✅ Application is running
2. Click on map to select points
3. Choose vehicle type (car or truck)
4. Select region for height limits
5. Click "Calculate Route"
6. Save routes for later!

---

## 📚 Learn More

- [Full README](README.md) - Complete documentation
- [GitHub Issues](https://github.com) - Report bugs
- [API Documentation](README.md#-api-endpoints) - Backend endpoints

---

**Happy navigating! 🗺️**
