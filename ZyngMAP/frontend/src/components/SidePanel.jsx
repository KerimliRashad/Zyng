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
  onLoadRoute
}) => {
  const [showSavedRoutes, setShowSavedRoutes] = useState(false)

  const limits = truckHeightLimits[region] || truckHeightLimits.usa

  return (
    <div className="side-panel">
      <div className="panel-header">
        🗺️ ZyngMAP Navigator
      </div>

      <div className="panel-content">
        {/* Start Point */}
        <div className="form-group">
          <label>📍 Start Point</label>
          <input
            type="text"
            readOnly
            placeholder="Click on map or enter coordinates"
            value={startPoint ? `${startPoint.lat.toFixed(4)}, ${startPoint.lng.toFixed(4)}` : ''}
          />
        </div>

        {/* End Point */}
        <div className="form-group">
          <label>🎯 End Point</label>
          <input
            type="text"
            readOnly
            placeholder="Click on map or enter coordinates"
            value={endPoint ? `${endPoint.lat.toFixed(4)}, ${endPoint.lng.toFixed(4)}` : ''}
          />
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
