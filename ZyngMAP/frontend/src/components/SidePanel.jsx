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
  const limits = truckHeightLimits[region] || truckHeightLimits.usa

  return (
    <div className="side-panel">
      {/* Header */}
      <div className="panel-header">
        🗺️ ZYNGMAP Navigator
      </div>

      <div className="panel-content">
        {/* Points Status */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            background: startPoint ? '#d1fae5' : '#f3f4f6',
            padding: '14px',
            borderRadius: '8px',
            marginBottom: '12px',
            borderLeft: startPoint ? '4px solid #10b981' : '4px solid #d1d5db'
          }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>📍 Start</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: startPoint ? '#065f46' : '#6b7280' }}>
              {startPoint ? `✅ Set (${startPoint.lat.toFixed(2)}, ${startPoint.lng.toFixed(2)})` : '👆 Click on map'}
            </div>
          </div>

          <div style={{
            background: endPoint ? '#fee2e2' : '#f3f4f6',
            padding: '14px',
            borderRadius: '8px',
            borderLeft: endPoint ? '4px solid #ef4444' : '4px solid #d1d5db'
          }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>🎯 End</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: endPoint ? '#7c2d12' : '#6b7280' }}>
              {endPoint ? `✅ Set (${endPoint.lat.toFixed(2)}, ${endPoint.lng.toFixed(2)})` : '👆 Click on map'}
            </div>
          </div>
        </div>

        {/* Vehicle Type */}
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

        {/* Region */}
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

        {/* Truck Height */}
        {vehicleType === 'truck' && (
          <div className={`truck-settings show`} style={{ marginBottom: '18px' }}>
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

        {/* Route Info */}
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

        {/* Error */}
        {error && (
          <div className="error" style={{ marginBottom: '18px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Saved Routes */}
        {savedRoutes.length > 0 && (
          <div className="saved-routes" style={{ marginBottom: '18px' }}>
            <h4 style={{ marginBottom: '12px', fontSize: '12px', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase' }}>
              💾 Saved Routes
            </h4>
            {savedRoutes.map(r => (
              <div
                key={r.id}
                className="route-item"
                onClick={() => onLoadRoute(r)}
                style={{ cursor: 'pointer', marginBottom: '8px' }}
              >
                <div className="route-item-name">{r.name}</div>
                <div className="route-item-info">{r.vehicleType} • {r.region}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="panel-footer">
        <button
          className="btn btn-primary"
          onClick={onCalculateRoute}
          disabled={!startPoint || !endPoint || loading}
          style={{
            opacity: (!startPoint || !endPoint) ? 0.5 : 1,
            cursor: (!startPoint || !endPoint) ? 'not-allowed' : 'pointer'
          }}
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
