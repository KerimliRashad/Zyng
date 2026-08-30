# 🗺️ ZyngMAP Navigator

**Global Browser Navigator for Trucks & Cars** - Navigate the world with region-specific truck height restrictions!

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-18+-green)

## ✨ Features

- 🗺️ **Interactive World Map** - Navigate anywhere globally
- 🚗 **Multi-Vehicle Support** - Optimized routes for cars and trucks
- 🚚 **Truck Height Management** - Adjust height limits by region
- 🌍 **Region-Specific Restrictions**:
  - 🇺🇸 **USA** - Max height: 4.11-4.29m
  - 🇪🇺 **Europe** - Max height: 4.0-4.3m
  - 🇷🇺 **Russia** - Max height: 3.8-4.2m
- 💾 **Save & Load Routes** - Store your favorite routes locally
- 📊 **Route Information** - Distance, duration, and vehicle restrictions
- 🔍 **Smart Route Calculation** - Uses OpenStreetMap routing
- 📱 **Responsive Design** - Works on desktop and mobile

## 🚀 Quick Start

### Option 1: Docker (Easiest - All Platforms)

```bash
# Clone the repository
git clone <repo-url>
cd ZyngMAP

# Build and run with Docker
docker compose up --build

# Open in browser
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000
```

### Option 2: Manual Installation

#### Windows

1. **Install Dependencies**
   - Download Node.js from https://nodejs.org/ (v18 or higher)
   - Install Git from https://git-scm.com/

2. **Setup Project**
   ```bash
   # Open Command Prompt or PowerShell
   cd ZyngMAP
   npm run install-all
   ```

3. **Start Development Server**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm start
   
   # Terminal 2 - Frontend (new window)
   cd frontend
   npm run dev
   ```

4. **Open in Browser**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

#### macOS

1. **Install Dependencies**
   ```bash
   # Install Node.js with Homebrew
   brew install node
   
   # Or download from https://nodejs.org/
   ```

2. **Setup Project**
   ```bash
   cd ZyngMAP
   npm run install-all
   ```

3. **Start Development Server**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm start
   
   # Terminal 2 - Frontend (new tab/window)
   cd frontend
   npm run dev
   ```

4. **Open in Browser**
   - http://localhost:3000

#### Linux (Ubuntu/Debian)

1. **Install Dependencies**
   ```bash
   sudo apt update
   sudo apt install nodejs npm git
   ```

2. **Setup Project**
   ```bash
   cd ZyngMAP
   npm run install-all
   ```

3. **Start Development Server**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm start
   
   # Terminal 2 - Frontend (new terminal)
   cd frontend
   npm run dev
   ```

4. **Open in Browser**
   - http://localhost:3000

## 📖 How to Use

### 1️⃣ **Select Start Point**
   - Click on the map to set your starting location
   - Or use the input field to enter coordinates

### 2️⃣ **Select End Point**
   - Click on the map to set your destination
   - Or enter coordinates in the input field

### 3️⃣ **Choose Vehicle Type**
   - 🚗 **Car** - Standard automobile routing
   - 🚚 **Truck** - Truck-specific routing with height restrictions

### 4️⃣ **Select Region**
   - 🇺🇸 **USA** - North American standards
   - 🇪🇺 **Europe** - European standards
   - 🇷🇺 **Russia** - Russian standards

### 5️⃣ **Adjust Truck Height (Trucks Only)**
   - Use the slider to adjust maximum truck height
   - Restrictions vary by region:
     - **USA**: 4.11m - 4.29m
     - **Europe**: 4.0m - 4.3m
     - **Russia**: 3.8m - 4.2m

### 6️⃣ **Calculate Route**
   - Click "🔍 Calculate Route"
   - View route distance, duration, and vehicle info

### 7️⃣ **Save Route**
   - Click "💾 Save Route" to store locally
   - Routes are saved in browser storage
   - Load saved routes anytime

## 🏗️ Project Structure

```
ZyngMAP/
├── frontend/                 # React web app
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── MapComponent.jsx
│   │   │   └── SidePanel.jsx
│   │   ├── App.jsx          # Main app component
│   │   ├── App.css          # Styling
│   │   └── main.jsx         # Entry point
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── backend/                  # Node.js API server
│   ├── server.js            # Express server
│   ├── package.json
│   └── .env
│
├── Dockerfile               # Docker container config
├── docker-compose.yml       # Multi-container setup
├── package.json             # Root package config
└── README.md               # This file
```

## 🔧 API Endpoints

### Backend API (http://localhost:5000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/route` | Calculate route |
| POST | `/api/validate-truck` | Validate truck height |
| GET | `/api/regions` | Get regions and restrictions |

### Calculate Route

**Request:**
```bash
POST /api/route
Content-Type: application/json

{
  "start": { "lat": 40.7128, "lng": -74.0060 },
  "end": { "lat": 51.5074, "lng": -0.1278 },
  "vehicleType": "truck",
  "region": "europe",
  "truckHeight": 4.2
}
```

**Response:**
```json
{
  "geometry": { "coordinates": [...] },
  "distance": 5832000,
  "duration": 3600,
  "properties": {
    "distance": 5832000,
    "duration": 3600,
    "vehicleType": "truck",
    "region": "europe",
    "truckHeight": 4.2,
    "warnings": [],
    "restrictions": "standard restrictions apply"
  }
}
```

## 📋 System Requirements

- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **RAM**: 512MB minimum (1GB recommended)
- **Browser**: Modern browser with Geolocation API support
  - Chrome/Chromium 5+
  - Firefox 3.5+
  - Safari 5.1+
  - Edge 12+

## 🐳 Docker Requirements

- Docker Desktop 20.10+
- Docker Compose 2.0+

## 🌐 Deployment

### Deploy with Docker

1. **Build Image**
   ```bash
   docker build -t zyngmap:1.0 .
   ```

2. **Run Container**
   ```bash
   docker run -p 3000:3000 -p 5000:5000 zyngmap:1.0
   ```

3. **Access Application**
   - http://localhost:3000

### Deploy to Cloud

**Heroku**
```bash
git push heroku main
```

**AWS / Google Cloud / DigitalOcean**
- Push Docker image to registry
- Deploy using Docker Compose or Kubernetes

## 🔒 Environment Variables

**Backend (.env)**
```
PORT=5000
NODE_ENV=development
OSRM_URL=http://router.project-osrm.org
```

## 🛠️ Development

### Install Dependencies
```bash
npm run install-all
```

### Start Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Run Backend Only
```bash
cd backend && npm start
```

### Run Frontend Only
```bash
cd frontend && npm run dev
```

## 📝 Truck Height Limits by Region

### 🇺🇸 United States
- **Maximum Height**: 4.29m (14'0")
- **Minimum Height**: 4.11m (13'6")
- **Notes**: Federal limit, some states allow 4.36m

### 🇪🇺 European Union
- **Maximum Height**: 4.3m (14'1")
- **Minimum Height**: 4.0m (13'1")
- **Notes**: Strict enforcement, higher penalties

### 🇷🇺 Russian Federation
- **Maximum Height**: 4.2m (13'9")
- **Minimum Height**: 3.8m (12'6")
- **Notes**: Variable road conditions, regional variations

## 🎯 Road Quality Indicators

- 🟢 **Green Routes**: Well-maintained highways
- 🟡 **Yellow Routes**: Secondary roads
- 🔴 **Red Routes**: Limited truck access

## 🐛 Troubleshooting

### Backend Not Responding
```bash
# Check if port 5000 is in use
# Windows: netstat -ano | findstr :5000
# Mac/Linux: lsof -i :5000

# Kill process and restart
npm run dev
```

### Map Not Loading
- Check internet connection
- Ensure browser allows geolocation
- Clear browser cache (Ctrl+Shift+Delete)

### Routes Not Calculating
- Verify both points are selected
- Check backend is running (http://localhost:5000/api/health)
- Try different coordinates

### High Disk Usage
- Clear saved routes in browser storage
- Delete old cache files

## 📱 Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Recommended |
| Firefox | ✅ Full | Full support |
| Safari | ✅ Full | macOS 10.13+ |
| Edge | ✅ Full | Windows 10+ |
| IE | ❌ None | Not supported |

## 📊 Route Calculation Engine

- **Routing**: Open Source Routing Machine (OSRM)
- **Maps**: OpenStreetMap
- **Geocoding**: Nominatim
- **Profile**: Car, Truck with height restrictions

## 🚀 Performance Optimization

- **Lazy Loading**: Maps load on demand
- **Route Caching**: Recent routes stored in browser
- **Tile Caching**: Map tiles cached locally
- **Compression**: GZip compression enabled

## 💡 Future Features

- [ ] Multiple waypoints
- [ ] Real-time traffic
- [ ] Offline maps
- [ ] Voice navigation
- [ ] Fuel cost calculator
- [ ] Toll road integration
- [ ] Mobile app (React Native)
- [ ] WebGL 3D maps

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push and open a Pull Request

## 📧 Support

- 📧 Email: support@zyngmap.com
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions

## 🙏 Credits

- **Routing**: OSRM (OpenRouteServiceMachine)
- **Maps**: OpenStreetMap contributors
- **Framework**: React + Leaflet
- **Backend**: Express.js

## 📅 Changelog

### v1.0.0 (2024)
- Initial release
- Core navigation features
- Multi-vehicle support
- Region-specific restrictions
- Route saving functionality

---

**Happy Navigating! 🚗🚚🗺️**

Made with ❤️ for ZyngMAP
