import { useState, useEffect } from 'react'
import MapComponent from './components/MapComponent'
import SidePanel from './components/SidePanel'
import './App.css'

function App() {
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

  useEffect(() => {
    // Get user location with high accuracy
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          })
        },
        (error) => console.log('Geolocation error:', error),
        { enableHighAccuracy: true, timeout: 5000 }
      )

      // Watch position for real-time updates
      navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          })
        }
      )
    }
    const stored = localStorage.getItem('savedRoutes')
    if (stored) setSavedRoutes(JSON.parse(stored))
  }, [])

  const truckHeightLimits = {
    usa: { min: 4.11, max: 4.29, default: 4.2 },
    europe: { min: 4.0, max: 4.3, default: 4.2 },
    russia: { min: 3.8, max: 4.2, default: 4.0 }
  }

  const calculateRoute = async () => {
    if (!startPoint || !endPoint) {
      setError('Please select both start and end points')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const apiUrl = window.location.pathname.includes('/map')
        ? '/map/api/route'
        : 'http://localhost:5000/api/route'

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: startPoint,
          end: endPoint,
          vehicleType,
          region,
          truckHeight
        })
      })

      if (!response.ok) throw new Error('Failed to calculate route')
      const data = await response.json()
      setRoute(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const saveRoute = () => {
    if (!route) return
    const newRoute = {
      id: Date.now(),
      name: `Route ${new Date().toLocaleString()}`,
      start: startPoint,
      end: endPoint,
      vehicleType,
      region,
      truckHeight,
      route
    }
    const updated = [...savedRoutes, newRoute]
    setSavedRoutes(updated)
    localStorage.setItem('savedRoutes', JSON.stringify(updated))
  }

  const loadRoute = (savedRoute) => {
    setStartPoint(savedRoute.start)
    setEndPoint(savedRoute.end)
    setVehicleType(savedRoute.vehicleType)
    setRegion(savedRoute.region)
    setTruckHeight(savedRoute.truckHeight)
    setRoute(savedRoute.route)
  }

  const clearRoute = () => {
    setStartPoint(null)
    setEndPoint(null)
    setRoute(null)
    setError(null)
  }

  return (
    <div className="app-container">
      <MapComponent
        startPoint={startPoint}
        endPoint={endPoint}
        route={route}
        userLocation={userLocation}
        onSelectPoint={(point, type) => {
          if (type === 'start') setStartPoint(point)
          else setEndPoint(point)
        }}
      />

      <SidePanel
        startPoint={startPoint}
        endPoint={endPoint}
        vehicleType={vehicleType}
        setVehicleType={setVehicleType}
        region={region}
        setRegion={setRegion}
        truckHeight={truckHeight}
        setTruckHeight={setTruckHeight}
        truckHeightLimits={truckHeightLimits}
        route={route}
        loading={loading}
        error={error}
        onCalculateRoute={calculateRoute}
        onClearRoute={clearRoute}
        onSaveRoute={saveRoute}
        savedRoutes={savedRoutes}
        onLoadRoute={loadRoute}
        onSelectPoint={(point, type) => {
          if (type === 'start') setStartPoint(point)
          else setEndPoint(point)
        }}
      />
    </div>
  )
}

export default App
