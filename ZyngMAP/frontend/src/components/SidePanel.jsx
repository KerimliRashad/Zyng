import { useState } from 'react'

const SidePanel = ({
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
  onLoadRoute,
  onSelectPoint
}) => {
  const [showSavedRoutes, setShowSavedRoutes] = useState(false)
  const [startInput, setStartInput] = useState('')
  const [endInput, setEndInput] = useState('')

  const limits = truckHeightLimits[region] || truckHeightLimits.usa

  const parseCoordinates = (input) => {
    const coords = input.split(',').map(c => parseFloat(c.trim()))
    if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
      return { lat: coords[0], lng: coords[1] }
    }
    return null
  }

  const handleSetStart = () => {
    const coords = parseCoordinates(startInput)
    if (coords) {
      onSelectPoint(coords, 'start')
      setStartInput('')
    } else {
      alert('❌ Invalid format! Use: latitude, longitude (e.g., 55.75, 37.62)')
    }
  }

  const handleSetEnd = () => {
    const coords = parseCoordinates(endInput)
    if (coords) {
      onSelectPoint(coords, 'end')
      setEndInput('')
    } else {
      alert('❌ Invalid format! Use: latitude, longitude (e.g., 55.75, 37.62)')
    }
  }

  return (
    <div className="side-panel">
      <div className="panel-header">
        🗺️ ZyngMAP Navigator
      </div>

      <div className="panel-content">
        {/* Start Point */}
        <div className="form-group">
          <label>📍 Start Point</label>
          {startPoint && (
            <div style={{
              padding: '10px',
              background: '#e0e7ff',
              borderRadius: '6px',
              marginBottom: '8px',
              fontSize: '13px',
              color: '#1f2937',
              fontWeight: '600'
            }}>
              ✅ {startPoint.lat.toFixed(4)}, {startPoint.lng.toFixed(4)}
            </div>
          )}
          <input
            type="text"
            placeholder="lat, lng (e.g., 55.75, 37.62)"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSetStart()}
          />
          <button
            onClick={handleSetStart}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600'
            }}
          >
            Set Start
          </button>
          <p style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>Or click on map →</p>
        </div>

        {/* End Point */}
        <div className="form-group">
          <label>🎯 End Point</label>
          {endPoint && (
            <div style={{
              padding: '10px',
              background: '#e0e7ff',
              borderRadius: '6px',
              marginBottom: '8px',
              fontSize: '13px',
              color: '#1f2937',
              fontWeight: '600'
            }}>
              ✅ {endPoint.lat.toFixed(4)}, {endPoint.lng.toFixed(4)}
            </div>
          )}
          <input
            type="text"
            placeholder="lat, lng (e.g., 55.75, 37.62)"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSetEnd()}
          />
          <button
            onClick={handleSetEnd}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600'
            }}
          >
            Set End
          </button>
          <p style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>Or click on map →</p>
        </div>

        {/* Vehicle Type */}
        <div className="form-group">
          <label>🚗 Vehicle Type</label>
          <div className="vehicle-selector">
            <button
              className={`vehicle-btn ${vehicleType === 'car' ? 'active' : ''}`}
              onClick={() => setVehicleType('car')}
            >
              🚗 Car
            </button>
            <button
              className={`vehicle-btn ${vehicleType === 'truck' ? 'active' : ''}`}
              onClick={() => setVehicleType('truck')}
            >
              🚚 Truck
            </button>
          </div>
        </div>

        {/* Region Selection */}
        <div className="form-group">
          <label>🌍 Region (Height Limits)</label>
          <div className="region-selector">
            <button
              className={`region-btn ${region === 'usa' ? 'active' : ''}`}
              onClick={() => setRegion('usa')}
            >
              🇺🇸 USA
            </button>
            <button
              className={`region-btn ${region === 'europe' ? 'active' : ''}`}
              onClick={() => setRegion('europe')}
            >
              🇪🇺 Europe
            </button>
            <button
              className={`region-btn ${region === 'russia' ? 'active' : ''}`}
              onClick={() => setRegion('russia')}
            >
              🇷🇺 Russia
            </button>
          </div>
        </div>

        {/* Truck Height Settings */}
        <div className={`truck-settings ${vehicleType === 'truck' ? 'show' : ''}`}>
          <label>📏 Maximum Height (meters)</label>
          <input
            type="range"
            className="height-slider"
            min={limits.min}
            max={limits.max}
            step="0.05"
            value={truckHeight}
            onChange={(e) => setTruckHeight(parseFloat(e.target.value))}
          />
          <div className="height-display">
            {truckHeight.toFixed(2)} m
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
              Range: {limits.min}m - {limits.max}m
            </div>
          </div>
        </div>

        {/* Route Info */}
        {route && (
          <div className="route-info">
            <h3>📊 Route Information</h3>
            <div className="route-stat">
              <span>Distance:</span>
              <strong>{(route.properties?.distance / 1000).toFixed(1)} km</strong>
            </div>
            <div className="route-stat">
              <span>Duration:</span>
              <strong>{Math.round(route.properties?.duration / 60)} min</strong>
            </div>
            <div className="route-stat">
              <span>Vehicle:</span>
              <strong>{vehicleType === 'car' ? 'Car' : `Truck (${truckHeight}m)`}</strong>
            </div>
            <div className="route-stat">
              <span>Region:</span>
              <strong>{region.toUpperCase()}</strong>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <div className="error">⚠️ {error}</div>}

        {/* Saved Routes */}
        {savedRoutes.length > 0 && (
          <div className="saved-routes">
            <h4>💾 Saved Routes ({savedRoutes.length})</h4>
            {showSavedRoutes ? (
              <>
                {savedRoutes.map(r => (
                  <div
                    key={r.id}
                    className="route-item"
                    onClick={() => onLoadRoute(r)}
                  >
                    <div className="route-item-name">{r.name}</div>
                    <div className="route-item-info">
                      {r.vehicleType} • {r.region} • {(r.route.properties?.distance / 1000).toFixed(1)}km
                    </div>
                  </div>
                ))}
              </>
            ) : null}
            <button
              className="btn btn-secondary"
              style={{ marginTop: '8px', fontSize: '12px' }}
              onClick={() => setShowSavedRoutes(!showSavedRoutes)}
            >
              {showSavedRoutes ? '▲ Hide' : '▼ Show'} Saved Routes
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="panel-footer">
        <button
          className="btn btn-primary"
          onClick={onCalculateRoute}
          disabled={!startPoint || !endPoint || loading}
        >
          {loading ? '⏳ Calculating...' : '🔍 Calculate Route'}
        </button>

        {route && (
          <>
            <button
              className="btn btn-primary"
              onClick={onSaveRoute}
              style={{ background: '#50c878' }}
            >
              💾 Save Route
            </button>
            <button
              className="btn btn-secondary"
              onClick={onClearRoute}
            >
              🗑️ Clear
            </button>
          </>
        )}

        <div style={{
          marginTop: '12px',
          padding: '10px',
          background: '#f9f9f9',
          borderRadius: '6px',
          fontSize: '11px',
          color: '#666',
          textAlign: 'center',
          lineHeight: '1.4'
        }}>
          Made with ❤️ for ZyngMAP v1.0
        </div>
      </div>
    </div>
  )
}

export default SidePanel
