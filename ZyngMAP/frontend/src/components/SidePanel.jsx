import { useState } from 'react'

export default function SidePanel({
  startPoint,
  endPoint,
  vehicleType,
  setVehicleType,
  region,
  setRegion,
  truckHeight,
  setTruckHeight,
  truckHeightLimits,
  route,
  loading,
  error,
  onCalculateRoute,
  onClearRoute,
  onSaveRoute,
  savedRoutes,
  onLoadRoute
}) {
  const [startLat, setStartLat] = useState('')
  const [startLng, setStartLng] = useState('')
  const [endLat, setEndLat] = useState('')
  const [endLng, setEndLng] = useState('')

  const limits = truckHeightLimits[region] || truckHeightLimits.usa

  const handleSetStart = () => {
    const lat = parseFloat(startLat)
    const lng = parseFloat(startLng)
    if (!isNaN(lat) && !isNaN(lng)) {
      // Trigger map update through parent
      window.dispatchEvent(new CustomEvent('setStart', { detail: { lat, lng } }))
      setStartLat('')
      setStartLng('')
    }
  }

  const handleSetEnd = () => {
    const lat = parseFloat(endLat)
    const lng = parseFloat(endLng)
    if (!isNaN(lat) && !isNaN(lng)) {
      window.dispatchEvent(new CustomEvent('setEnd', { detail: { lat, lng } }))
      setEndLat('')
      setEndLng('')
    }
  }

  return (
    <div className="side-panel">
      {/* Header */}
      <div className="panel-header">
        🗺️ NAVIGATOR
      </div>

      <div className="panel-content">
        {/* START POINT */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#1f2937', textTransform: 'uppercase' }}>
            📍 Start Point
          </label>

          {startPoint && (
            <div style={{
              background: '#d1fae5',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '10px',
              fontSize: '13px',
              color: '#065f46',
              fontWeight: '600',
              borderLeft: '4px solid #10b981'
            }}>
              ✅ {startPoint.lat.toFixed(4)}, {startPoint.lng.toFixed(4)}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <input
              type="number"
              placeholder="Latitude"
              value={startLat}
              onChange={(e) => setStartLat(e.target.value)}
              style={{
                padding: '10px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'inherit'
              }}
            />
            <input
              type="number"
              placeholder="Longitude"
              value={startLng}
              onChange={(e) => setStartLng(e.target.value)}
              style={{
                padding: '10px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <button
            onClick={handleSetStart}
            style={{
              width: '100%',
              padding: '10px',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600'
            }}
          >
            SET START
          </button>
        </div>

        {/* END POINT */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#1f2937', textTransform: 'uppercase' }}>
            🎯 End Point
          </label>

          {endPoint && (
            <div style={{
              background: '#fee2e2',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '10px',
              fontSize: '13px',
              color: '#7c2d12',
              fontWeight: '600',
              borderLeft: '4px solid #ef4444'
            }}>
              ✅ {endPoint.lat.toFixed(4)}, {endPoint.lng.toFixed(4)}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <input
              type="number"
              placeholder="Latitude"
              value={endLat}
              onChange={(e) => setEndLat(e.target.value)}
              style={{
                padding: '10px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'inherit'
              }}
            />
            <input
              type="number"
              placeholder="Longitude"
              value={endLng}
              onChange={(e) => setEndLng(e.target.value)}
              style={{
                padding: '10px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <button
            onClick={handleSetEnd}
            style={{
              width: '100%',
              padding: '10px',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600'
            }}
          >
            SET END
          </button>
        </div>

        {/* VEHICLE TYPE */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ display: 'block', marginBottom: '10px', fontSize: '12px', fontWeight: '600', color: '#1f2937', textTransform: 'uppercase' }}>
            🚗 Vehicle
          </label>
          <div className="vehicle-selector">
            <button
              className={`vehicle-btn ${vehicleType === 'car' ? 'active' : ''}`}
              onClick={() => setVehicleType('car')}
            >
              Car
            </button>
            <button
              className={`vehicle-btn ${vehicleType === 'truck' ? 'active' : ''}`}
              onClick={() => setVehicleType('truck')}
            >
              Truck
            </button>
          </div>
        </div>

        {/* REGION */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ display: 'block', marginBottom: '10px', fontSize: '12px', fontWeight: '600', color: '#1f2937', textTransform: 'uppercase' }}>
            🌍 Region
          </label>
          <div className="region-selector">
            <button
              className={`region-btn ${region === 'usa' ? 'active' : ''}`}
              onClick={() => setRegion('usa')}
            >
              USA
            </button>
            <button
              className={`region-btn ${region === 'europe' ? 'active' : ''}`}
              onClick={() => setRegion('europe')}
            >
              Europe
            </button>
            <button
              className={`region-btn ${region === 'russia' ? 'active' : ''}`}
              onClick={() => setRegion('russia')}
            >
              Russia
            </button>
          </div>
        </div>

        {/* TRUCK HEIGHT */}
        {vehicleType === 'truck' && (
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', marginBottom: '10px', fontSize: '12px', fontWeight: '600', color: '#1f2937', textTransform: 'uppercase' }}>
              📏 Height: {truckHeight.toFixed(2)}m
            </label>
            <input
              type="range"
              className="height-slider"
              min={limits.min}
              max={limits.max}
              step="0.1"
              value={truckHeight}
              onChange={(e) => setTruckHeight(parseFloat(e.target.value))}
            />
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', textAlign: 'center' }}>
              {limits.min}m - {limits.max}m
            </div>
          </div>
        )}

        {/* ROUTE INFO */}
        {route && (
          <div className="route-info" style={{ marginBottom: '18px' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '13px', color: '#1f2937' }}>✅ ROUTE READY</h3>
            <div className="route-stat">
              <span>Distance:</span>
              <strong>{(route.distance / 1000).toFixed(1)} km</strong>
            </div>
            <div className="route-stat">
              <span>Duration:</span>
              <strong>{Math.round(route.duration / 60)} min</strong>
            </div>
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="error" style={{ marginBottom: '18px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* SAVED ROUTES */}
        {savedRoutes.length > 0 && (
          <div className="saved-routes">
            <h4 style={{ marginBottom: '12px', fontSize: '12px', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase' }}>
              💾 Saved Routes
            </h4>
            {savedRoutes.map(r => (
              <div
                key={r.id}
                className="route-item"
                onClick={() => onLoadRoute(r)}
              >
                <div className="route-item-name">{r.name}</div>
                <div className="route-item-info">{r.vehicleType} • {r.region}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="panel-footer">
        <button
          className="btn btn-primary"
          onClick={onCalculateRoute}
          disabled={!startPoint || !endPoint || loading}
        >
          {loading ? '⏳ CALCULATING...' : '🔍 CALCULATE ROUTE'}
        </button>

        {route && (
          <>
            <button
              className="btn btn-primary"
              onClick={onSaveRoute}
              style={{ background: '#10b981', marginBottom: '10px' }}
            >
              💾 SAVE ROUTE
            </button>
            <button
              className="btn btn-secondary"
              onClick={onClearRoute}
            >
              🔄 CLEAR
            </button>
          </>
        )}

        <div style={{
          marginTop: '12px',
          padding: '10px',
          background: '#f9fafb',
          borderRadius: '6px',
          fontSize: '11px',
          color: '#999',
          textAlign: 'center'
        }}>
          ZyngMAP v1.0
        </div>
      </div>
    </div>
  )
}
