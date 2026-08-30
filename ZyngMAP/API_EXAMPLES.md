# 📡 ZyngMAP API Examples

Base URL: `http://localhost:5000`

---

## 🏥 Health Check

**Check if backend is running**

```bash
curl http://localhost:5000/api/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "ZyngMAP Backend"
}
```

---

## 🛣️ Calculate Route

**Request:**
```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": {"lat": 40.7128, "lng": -74.0060},
    "end": {"lat": 34.0522, "lng": -118.2437},
    "vehicleType": "truck",
    "region": "usa",
    "truckHeight": 4.2
  }'
```

**Parameters:**
- `start` (Object): Starting point with `lat` and `lng`
- `end` (Object): Destination with `lat` and `lng`
- `vehicleType` (String): `"car"` or `"truck"`
- `region` (String): `"usa"`, `"europe"`, or `"russia"`
- `truckHeight` (Number): Maximum height in meters (for trucks)

**Response:**
```json
{
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [-74.0060, 40.7128],
      [-74.0050, 40.7140],
      [...],
      [-118.2437, 34.0522]
    ]
  },
  "distance": 3944000,
  "duration": 155520,
  "properties": {
    "distance": 3944000,
    "duration": 155520,
    "vehicleType": "truck",
    "region": "usa",
    "truckHeight": 4.2,
    "warnings": [],
    "restrictions": "standard restrictions apply"
  }
}
```

**Response Fields:**
- `geometry` - GeoJSON LineString with route coordinates
- `distance` - Distance in meters
- `duration` - Duration in seconds
- `properties.warnings` - Array of height/restriction warnings
- `properties.restrictions` - Region-specific notes

---

## ✅ Validate Truck Height

**Check if height is valid for region**

```bash
curl -X POST http://localhost:5000/api/validate-truck \
  -H "Content-Type: application/json" \
  -d '{
    "height": 4.2,
    "region": "europe"
  }'
```

**Response:**
```json
{
  "isValid": true,
  "message": "Height is acceptable",
  "limits": {
    "maxHeight": 4.3,
    "minHeight": 4.0,
    "restrictions": "stricter height regulations"
  }
}
```

---

## 🌍 Get Regions & Restrictions

**Get all available regions and their restrictions**

```bash
curl http://localhost:5000/api/regions
```

**Response:**
```json
{
  "regions": [
    {
      "id": "usa",
      "name": "USA",
      "restrictions": {
        "truck": {
          "maxHeight": 4.29,
          "minHeight": 4.11,
          "restrictions": "some roads have height limits"
        },
        "car": {
          "maxHeight": 2.5
        }
      }
    },
    {
      "id": "europe",
      "name": "EUROPE",
      "restrictions": {
        "truck": {
          "maxHeight": 4.3,
          "minHeight": 4.0,
          "restrictions": "stricter height regulations"
        },
        "car": {
          "maxHeight": 2.5
        }
      }
    },
    {
      "id": "russia",
      "name": "RUSSIA",
      "restrictions": {
        "truck": {
          "maxHeight": 4.2,
          "minHeight": 3.8,
          "restrictions": "variable road conditions"
        },
        "car": {
          "maxHeight": 2.5
        }
      }
    }
  ]
}
```

---

## 📍 Example Routes

### New York to Los Angeles (USA, Car)

```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": {"lat": 40.7128, "lng": -74.0060},
    "end": {"lat": 34.0522, "lng": -118.2437},
    "vehicleType": "car",
    "region": "usa",
    "truckHeight": 4.2
  }'
```

### Paris to Berlin (Europe, Truck)

```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": {"lat": 48.8566, "lng": 2.3522},
    "end": {"lat": 52.5200, "lng": 13.4050},
    "vehicleType": "truck",
    "region": "europe",
    "truckHeight": 4.2
  }'
```

### Moscow to St. Petersburg (Russia, Truck)

```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": {"lat": 55.7558, "lng": 37.6173},
    "end": {"lat": 59.9271, "lng": 30.3642},
    "vehicleType": "truck",
    "region": "russia",
    "truckHeight": 4.0
  }'
```

---

## 🐍 Python Example

```python
import requests
import json

BASE_URL = "http://localhost:5000/api"

# Calculate route
response = requests.post(f"{BASE_URL}/route", json={
    "start": {"lat": 40.7128, "lng": -74.0060},
    "end": {"lat": 34.0522, "lng": -118.2437},
    "vehicleType": "truck",
    "region": "usa",
    "truckHeight": 4.2
})

route = response.json()
print(f"Distance: {route['distance']/1000:.1f} km")
print(f"Duration: {route['duration']/3600:.1f} hours")
print(f"Warnings: {route['properties']['warnings']}")
```

---

## 🟦 JavaScript Example

```javascript
const API_URL = "http://localhost:5000/api";

async function calculateRoute(start, end, vehicleType, region, truckHeight) {
  const response = await fetch(`${API_URL}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start,
      end,
      vehicleType,
      region,
      truckHeight
    })
  });
  
  const route = await response.json();
  console.log(`Distance: ${route.distance / 1000} km`);
  console.log(`Duration: ${route.duration / 3600} hours`);
  return route;
}

// Usage
calculateRoute(
  { lat: 40.7128, lng: -74.0060 },
  { lat: 34.0522, lng: -118.2437 },
  "truck",
  "usa",
  4.2
);
```

---

## 🧪 Testing with Postman

1. Import this collection URL (if available)
2. Or create requests manually:

**POST** `/api/route`
```
Headers: Content-Type: application/json

Body (raw JSON):
{
  "start": {"lat": 40.7128, "lng": -74.0060},
  "end": {"lat": 34.0522, "lng": -118.2437},
  "vehicleType": "truck",
  "region": "usa",
  "truckHeight": 4.2
}
```

---

## ⚠️ Error Responses

### Missing Parameters
```json
{
  "error": "Start and end points required"
}
```

### Invalid Route
```json
{
  "error": "Could not calculate route"
}
```

### Backend Error
```json
{
  "error": "Failed to calculate route"
}
```

---

## 🔐 CORS

API allows requests from:
- `http://localhost:3000` (frontend dev)
- Any origin (CORS enabled)

---

## 📈 Rate Limiting

Currently: **No rate limiting** (development)

Production should implement:
- 100 requests per minute per IP
- Queue system for large batches

---

## 🔄 Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (missing params) |
| 500 | Server error |

---

## 🚀 Deployment

For production, update:
- OSRM URL to private instance
- Add authentication
- Implement rate limiting
- Add request logging

---

**API Documentation v1.0 - Made for ZyngMAP**
