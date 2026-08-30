# 🚀 ZyngTRACKER Quick Start Guide

## 5-Minute Local Setup

### 1. Install Dependencies

```bash
# Install root dependencies (if any)
npm install

# Install frontend
cd frontend
npm install

# Install backend
cd ../backend
npm install
```

### 2. Start Backend

```bash
cd backend
npm start
# Server runs on http://localhost:5000
```

### 3. Start Frontend (New Terminal)

```bash
cd frontend
npm run dev
# Opens on http://localhost:5173
```

### 4. Open in Browser

Visit: **http://localhost:5173**

---

## What You Can Do Now

1. **Fill Profile Form**
   - Enter your age, weight, height, gender
   - Choose activity level and fitness goal
   - Click "Start"

2. **View Your Plan**
   - See your TDEE (daily calories)
   - Check macro nutrients
   - Read diet recommendations

3. **Track Your Progress**
   - Add weight entries
   - Log meals and calories
   - See progress bar

4. **View Workout Plan**
   - Exercises for your fitness level
   - Cardio and strength recommendations
   - Health tips

---

## Environment Variables

### Backend (.env)

```env
PORT=5000
NODE_ENV=development
```

For production:
```env
PORT=5000
NODE_ENV=production
```

---

## Building for Production

### 1. Build Frontend

```bash
cd frontend
npm run build
# Creates dist/ folder with optimized files
```

### 2. Deploy Files

Copy `frontend/dist/*` to your web server's `/tracker/` directory

### 3. Run Backend on Server

```bash
cd backend
PORT=5000 npm start
```

Or with PM2:
```bash
pm2 start server.js --name "tracker-api"
```

---

## API Testing

### Test Backend Health

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{"status":"ok","service":"Tracker Backend"}
```

### Calculate Fitness Plan

```bash
curl -X POST http://localhost:5000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "gender": "male",
    "age": 25,
    "weight": 75,
    "height": 180,
    "activityLevel": "moderate",
    "dietType": "balanced",
    "goal": "maintenance",
    "fitnessLevel": "beginner"
  }'
```

---

## Project Structure Quick Reference

```
Tracker/
├── frontend/src/
│   ├── components/
│   │   ├── ProfileSetup.jsx    # Initial form
│   │   └── Dashboard.jsx       # Main dashboard
│   ├── App.jsx                 # Main component
│   └── App.css                 # Styling
├── backend/
│   └── server.js               # API endpoints
└── README.md                   # Full documentation
```

---

## Common Commands

```bash
# Frontend
cd frontend
npm install      # Install packages
npm run dev      # Start dev server
npm run build    # Build for production

# Backend
cd backend
npm install      # Install packages
npm start        # Start server
npm run dev      # Start with auto-reload (requires nodemon)
```

---

## Troubleshooting

### Port 5000 Already in Use
```bash
# Kill process on port 5000
lsof -i :5000
kill -9 <PID>

# Or use different port
PORT=5001 npm start
```

### Dependencies Not Found
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Vite Dev Server Issues
```bash
# Clear cache
rm -rf .vite

# Reinstall
npm install

# Start again
npm run dev
```

---

## Next Steps

1. ✅ Get it running locally
2. 📖 Read `README.md` for full documentation
3. 🚀 Follow `TRACKER_DEPLOYMENT.md` for server deployment
4. 🎨 Customize colors in `App.css` if needed
5. 🔧 Modify calculations in `backend/server.js` if desired

---

## Tips

- **LocalStorage**: All user data is stored locally in browser
- **No Database**: This version doesn't need a database
- **Responsive**: Works on mobile and desktop
- **Fast**: Simple calculations, no external APIs needed
- **Customizable**: Easy to modify colors, text, calculations

---

## Performance

- Frontend: **< 100KB** gzipped
- Backend: **< 10KB**
- Startup time: **< 1 second**
- No external dependencies for core functionality

---

Need help? Check the full documentation in `README.md`
