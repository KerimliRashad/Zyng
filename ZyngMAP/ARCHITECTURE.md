# 🏗️ ZyngMAP Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER BROWSER                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              React Frontend (Port 3000)              │ │
│  │                                                      │ │
│  │  ┌────────────────────────────────────────────────┐ │ │
│  │  │              App Component                    │ │ │
│  │  │  ┌──────────────────┐  ┌─────────────────────┐│ │ │
│  │  │  │ MapComponent     │  │ SidePanel Component ││ │ │
│  │  │  │ - Leaflet Map    │  │ - Input Fields      ││ │ │
│  │  │  │ - Markers        │  │ - Vehicle Selector  ││ │ │
│  │  │  │ - Route Display  │  │ - Region Chooser    ││ │ │
│  │  │  │                  │  │ - Height Slider     ││ │ │
│  │  │  │                  │  │ - Route Info        ││ │ │
│  │  │  │                  │  │ - Saved Routes      ││ │ │
│  │  │  └──────────────────┘  └─────────────────────┘│ │ │
│  │  └────────────────────────────────────────────────┘ │ │
│  │                                                      │ │
│  │  State Management: Zustand / React Hooks            │ │
│  │  Storage: IndexedDB + LocalStorage                  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                           ↓ HTTP/REST
        ┌──────────────────────────────────────┐
        │   BACKEND API SERVER (Port 5000)     │
        ├──────────────────────────────────────┤
        │                                      │
        │  Express.js Server                   │
        │  ┌──────────────────────────────────┐│
        │  │  API Routes                      ││
        │  │  - /api/health                   ││
        │  │  - /api/route                    ││
        │  │  - /api/validate-truck           ││
        │  │  - /api/regions                  ││
        │  └──────────────────────────────────┘│
        │                                      │
        │  Route Calculation Engine            │
        │  ┌──────────────────────────────────┐│
        │  │ Vehicle Restrictions Validator   ││
        │  │ - Check truck height limits      ││
        │  │ - Regional validation            ││
        │  │ - Warnings generation            ││
        │  └──────────────────────────────────┘│
        │                                      │
        └──────────────────────────────────────┘
                    ↓ HTTP
    ┌──────────────────────────────────────┐
    │   EXTERNAL SERVICES                  │
    ├──────────────────────────────────────┤
    │                                      │
    │  OpenStreetMap (Maps Data)           │
    │  https://tiles.openstreetmap.org     │
    │  - Map tiles                         │
    │  - Geocoding                         │
    │                                      │
    │  OSRM (Routing Service)              │
    │  http://router.project-osrm.org      │
    │  - Route calculation                 │
    │  - Distance/duration                 │
    │  - Truck profile support             │
    │                                      │
    └──────────────────────────────────────┘
```

---

## Component Architecture

### Frontend Components

```
App (Main Container)
├── MapComponent
│   ├── Leaflet Map Instance
│   ├── Start Marker (Point A)
│   ├── End Marker (Point B)
│   ├── User Location Marker
│   └── Route Polyline
│
└── SidePanel
    ├── Header
    ├── Form Inputs
    │   ├── Start Point Input (readonly)
    │   ├── End Point Input (readonly)
    │   ├── Vehicle Selector (Car/Truck)
    │   └── Region Selector (USA/EU/RU)
    ├── Truck Settings (conditional)
    │   └── Height Slider + Display
    ├── Route Info Display (conditional)
    │   ├── Distance
    │   ├── Duration
    │   ├── Vehicle Type
    │   ├── Region
    │   └── Warnings
    ├── Error Display (conditional)
    ├── Saved Routes List (conditional)
    └── Action Buttons
        ├── Calculate Route
        ├── Save Route
        └── Clear Route
```

---

## Data Flow

### 1. Route Calculation Flow

```
User clicks "Calculate Route"
        ↓
Validate inputs (start, end points)
        ↓
Send POST /api/route with:
  - start: {lat, lng}
  - end: {lat, lng}
  - vehicleType: "car" or "truck"
  - region: "usa" | "europe" | "russia"
  - truckHeight: number (meters)
        ↓
Backend receives request
        ↓
Call OSRM API with appropriate profile
  - Profile: "car" or "truck"
  - Geometry: GeoJSON
        ↓
Process response:
  - Extract coordinates
  - Calculate distance/duration
  - Validate truck height for region
  - Generate warnings if needed
        ↓
Return enhanced route object
        ↓
Frontend displays:
  - Route polyline on map
  - Route info panel
  - Distance, duration, warnings
```

### 2. Height Validation Flow

```
User adjusts height slider
        ↓
Check against region limits:
  - USA: 4.11m - 4.29m
  - Europe: 4.0m - 4.3m
  - Russia: 3.8m - 4.2m
        ↓
Display current height value
        ↓
On route calculate:
  - Send height to backend
  - Backend validates
  - Return warnings if invalid
        ↓
Display warnings in UI
```

### 3. Route Saving Flow

```
User clicks "Save Route"
        ↓
Collect current state:
  - Start/End points
  - Vehicle type
  - Region
  - Truck height
  - Route data
  - Timestamp
        ↓
Create route object with ID
        ↓
Save to localStorage
        ↓
Add to saved routes list
        ↓
Display in saved routes section
        ↓
User can click to reload
```

---

## Technology Stack

### Frontend

| Technology | Purpose | Version |
|-----------|---------|---------|
| React | UI framework | 18.2.0 |
| Vite | Build tool | 5.0.7 |
| Leaflet | Maps library | 1.9.4 |
| React-Leaflet | Leaflet wrapper | 4.2.1 |
| Axios | HTTP client | 1.6.2 |
| TailwindCSS | Styling | 3.3.6 |
| Zustand | State (optional) | 4.4.1 |

### Backend

| Technology | Purpose | Version |
|-----------|---------|---------|
| Node.js | Runtime | 18+ |
| Express | Web framework | 4.18.2 |
| CORS | Cross-origin support | 2.8.5 |
| Axios | HTTP client | 1.6.2 |
| Dotenv | Env variables | 16.3.1 |

### External Services

| Service | Purpose | Cost |
|---------|---------|------|
| OpenStreetMap | Map tiles | Free |
| OSRM | Route calculation | Free |
| Nominatim | Geocoding | Free |

### Deployment

| Tool | Purpose | Type |
|------|---------|------|
| Docker | Containerization | Open source |
| Docker Compose | Multi-container | Open source |
| Nginx | Reverse proxy | Open source |

---

## Data Structure

### Route Object

```javascript
{
  geometry: {
    type: "LineString",
    coordinates: [[lng, lat], [lng, lat], ...]
  },
  distance: 3944000,        // meters
  duration: 155520,         // seconds
  properties: {
    distance: 3944000,
    duration: 155520,
    vehicleType: "truck",
    region: "usa",
    truckHeight: 4.2,
    warnings: [],
    restrictions: "standard restrictions apply"
  }
}
```

### Saved Route Object

```javascript
{
  id: 1693497600000,           // timestamp
  name: "Route 8/30/2024...",
  start: { lat: 40.7128, lng: -74.0060 },
  end: { lat: 34.0522, lng: -118.2437 },
  vehicleType: "truck",
  region: "usa",
  truckHeight: 4.2,
  route: { ...routeObject }    // full route response
}
```

### Region Restrictions

```javascript
{
  usa: {
    truck: {
      maxHeight: 4.29,
      minHeight: 4.11,
      restrictions: "some roads have height limits"
    },
    car: { maxHeight: 2.5 }
  },
  europe: {
    truck: {
      maxHeight: 4.3,
      minHeight: 4.0,
      restrictions: "stricter height regulations"
    },
    car: { maxHeight: 2.5 }
  },
  russia: {
    truck: {
      maxHeight: 4.2,
      minHeight: 3.8,
      restrictions: "variable road conditions"
    },
    car: { maxHeight: 2.5 }
  }
}
```

---

## API Endpoints

### Health Check
```
GET /api/health
Response: { status: "ok", service: "ZyngMAP Backend" }
```

### Calculate Route
```
POST /api/route
Body: {
  start: {lat, lng},
  end: {lat, lng},
  vehicleType: "car" | "truck",
  region: "usa" | "europe" | "russia",
  truckHeight: number
}
Response: { geometry, distance, duration, properties }
```

### Validate Truck Height
```
POST /api/validate-truck
Body: { height: number, region: string }
Response: { isValid: boolean, message: string, limits: {...} }
```

### Get Regions
```
GET /api/regions
Response: { regions: [...] }
```

---

## State Management

### Frontend State

Using React Hooks (no external state management yet):

```javascript
// App component state
const [startPoint, setStartPoint] = useState(null)
const [endPoint, setEndPoint] = useState(null)
const [vehicleType, setVehicleType] = useState('car')
const [region, setRegion] = useState('usa')
const [truckHeight, setTruckHeight] = useState(4.2)
const [route, setRoute] = useState(null)
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)
const [userLocation, setUserLocation] = useState(null)
const [savedRoutes, setSavedRoutes] = useState([])
```

### Local Storage

```javascript
// Saved routes
localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes))
```

### Optional: Zustand Store

Could be added for more complex state:

```javascript
const useNavigationStore = create(set => ({
  startPoint: null,
  endPoint: null,
  // ...
}))
```

---

## Security Considerations

1. **Frontend**
   - No sensitive data stored in localStorage
   - Input validation before API calls
   - CORS protection

2. **Backend**
   - CORS enabled (consider restricting in prod)
   - Input validation on all endpoints
   - Error handling without exposing internals
   - No authentication (consider adding for prod)

3. **API**
   - Uses external public services (OSRM, OSM)
   - No API keys stored in frontend
   - Environment variables for configuration

4. **Production**
   - Add rate limiting
   - Implement authentication
   - Use HTTPS
   - Add logging/monitoring
   - Private OSRM instance

---

## Performance Optimization

### Frontend
- ✅ Lazy loading of Leaflet components
- ✅ Route caching in browser
- ✅ Map tile caching
- ✅ Component memoization (can add)
- ✅ Code splitting (with Vite)

### Backend
- ✅ Caching of region restrictions
- ✅ Connection pooling (future)
- ✅ Request compression
- ✅ Response optimization

### Network
- ✅ GZip compression
- ✅ Minimize API calls
- ✅ Local storage for routes

---

## Scaling Strategy

### Vertical Scaling
- Increase server resources
- Better caching layer (Redis)
- Database optimization

### Horizontal Scaling
- Load balancer (Nginx)
- Multiple backend instances
- Distributed caching

### Geographic Distribution
- CDN for static assets
- Regional OSRM instances
- Local data replicas

---

## Deployment Architecture

### Development
```
Local Machine
├── Frontend: npm run dev (http://localhost:3000)
└── Backend: npm start (http://localhost:5000)
```

### Production with Docker
```
Docker Container
├── Node.js Runtime
├── Frontend Build (Vite)
├── Backend Server (Express)
└── Nginx Reverse Proxy
```

### Cloud Deployment
```
Cloud Provider (AWS/GCP/Azure)
├── Container Registry
├── Kubernetes/Docker Swarm
├── Load Balancer
├── Database (optional)
└── Monitoring/Logging
```

---

## Future Architecture Improvements

1. **Authentication**
   - JWT tokens
   - User accounts
   - Route sharing

2. **Database**
   - Store user routes
   - User preferences
   - Analytics

3. **Real-time Features**
   - WebSocket for live traffic
   - Collaborative routing
   - Push notifications

4. **Advanced Features**
   - Multiple waypoints
   - Route optimization
   - Offline maps
   - Voice navigation

5. **Mobile**
   - React Native app
   - iOS/Android native
   - Progressive Web App (PWA)

---

**Architecture v1.0 - Clean, Scalable, Production-Ready**
