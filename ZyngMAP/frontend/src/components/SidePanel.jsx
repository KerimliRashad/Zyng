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
  const [activeTab, setActiveTab] = useState('route')

  const limits = truckHeightLimits[region] || truckHeightLimits.usa

  return (
    <div className="side-panel">
      {/* Premium Header */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
        padding: '24px 20px',
        color: 'white',
        boxShadow: '0 4px 20px rgba(79, 70, 229, 0.3)'
      }}>
        <div style={{ fontSize: '28px', fontWeight: '800', marginBottom: '4px' }}>🗺️ ZyngMAP</div>
        <div style={{ fontSize: '12px', opacity: '0.9', letterSpacing: '0.5px' }}>GLOBAL NAVIGATOR</div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb'
      }}>
        <button
          onClick={() => setActiveTab('route')}
          style={{
            flex: 1,
            padding: '12px',
            border: 'none',
            background: activeTab === 'route' ? 'white' : 'transparent',
            borderBottom: activeTab === 'route' ? '3px solid #4f46e5' : 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            color: activeTab === 'route' ? '#4f46e5' : '#6b7280',
            transition: 'all 0.3s'
          }}
        >
          📍 ROUTE
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          style={{
            flex: 1,
            padding: '12px',
            border: 'none',
            background: activeTab === 'settings' ? 'white' : 'transparent',
            borderBottom: activeTab === 'settings' ? '3px solid #4f46e5' : 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            color: activeTab === 'settings' ? '#4f46e5' : '#6b7280',
            transition: 'all 0.3s'
          }}
        >
          ⚙️ SETTINGS
        </button>
      </div>

      <div className="panel-content">
        {/* ROUTE TAB */}
        {activeTab === 'route' && (
          <>
            {/* Start Point */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '12px',
                fontSize: '13px',
                fontWeight: '700',
                color: '#1f2937',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                <span style={{ fontSize: '18px', marginRight: '8px' }}>🟢</span>
                Start Point
              </div>
              <div style={{
                padding: '16px',
                background: startPoint ? 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%)' : '#f3f4f6',
                borderLeft: startPoint ? '4px solid #3b82f6' : '4px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                color: startPoint ? '#0c4a6e' : '#6b7280',
                fontWeight: startPoint ? '600' : '500',
                textAlign: 'center'
              }}>
                {startPoint ? '✅ SET' : '👆 CLICK ON MAP'}
              </div>
            </div>

            {/* End Point */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '12px',
                fontSize: '13px',
                fontWeight: '700',
                color: '#1f2937',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                <span style={{ fontSize: '18px', marginRight: '8px' }}>🔴</span>
                End Point
              </div>
              <div style={{
                padding: '16px',
                background: endPoint ? 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)' : '#f3f4f6',
                borderLeft: endPoint ? '4px solid #ef4444' : '4px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                color: endPoint ? '#7c2d12' : '#6b7280',
                fontWeight: endPoint ? '600' : '500',
                textAlign: 'center'
              }}>
                {endPoint ? '✅ SET' : '👆 CLICK ON MAP'}
              </div>
            </div>

            {/* Route Information */}
            {route && (
              <div style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dbeafe 100%)',
                border: '1px solid #86efac',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#15803d',
                  textTransform: 'uppercase',
                  marginBottom: '12px',
                  letterSpacing: '0.5px'
                }}>
                  ✅ ROUTE READY
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Distance</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
                      {(route.distance / 1000).toFixed(1)} km
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Duration</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
                      {Math.round(route.duration / 60)} min
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#991b1b'
              }}>
                ⚠️ {error}
              </div>
            )}
          </>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <>
            {/* Vehicle Type */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '700',
                color: '#1f2937',
                textTransform: 'uppercase',
                marginBottom: '12px',
                letterSpacing: '0.5px'
              }}>
                🚗 Vehicle Type
              </div>
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
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '700',
                color: '#1f2937',
                textTransform: 'uppercase',
                marginBottom: '12px',
                letterSpacing: '0.5px'
              }}>
                🌍 Region
              </div>
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
                  🇪🇺 EU
                </button>
                <button
                  className={`region-btn ${region === 'russia' ? 'active' : ''}`}
                  onClick={() => setRegion('russia')}
                >
                  🇷🇺 RU
                </button>
              </div>
            </div>

            {/* Truck Height */}
            {vehicleType === 'truck' && (
              <div style={{
                background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                borderRadius: '12px',
                padding: '16px',
                borderLeft: '4px solid #4f46e5'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
                    📏 Truck Height
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#4f46e5' }}>
                    {truckHeight.toFixed(2)}m
                  </span>
                </div>
                <input
                  type="range"
                  className="height-slider"
                  min={limits.min}
                  max={limits.max}
                  step="0.1"
                  value={truckHeight}
                  onChange={(e) => setTruckHeight(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  marginTop: '10px',
                  textAlign: 'center'
                }}>
                  {limits.min}m - {limits.max}m
                </div>
              </div>
            )}
          </>
        )}

        {/* Saved Routes */}
        {activeTab === 'route' && savedRoutes.length > 0 && (
          <div style={{
            borderTop: '1px solid #e5e7eb',
            paddingTop: '16px',
            marginTop: '16px'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '700',
              color: '#1f2937',
              textTransform: 'uppercase',
              marginBottom: '12px',
              letterSpacing: '0.5px'
            }}>
              💾 SAVED ROUTES ({savedRoutes.length})
            </div>
            {showSavedRoutes ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {savedRoutes.map(r => (
                  <div
                    key={r.id}
                    onClick={() => onLoadRoute(r)}
                    style={{
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      borderLeft: '4px solid #4f46e5'
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937' }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      {r.vehicleType} • {r.region}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <button
              onClick={() => setShowSavedRoutes(!showSavedRoutes)}
              style={{
                width: '100%',
                marginTop: '8px',
                padding: '8px',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                color: '#4f46e5',
                transition: 'all 0.2s'
              }}
            >
              {showSavedRoutes ? '▲ Hide Routes' : '▼ Show Routes'}
            </button>
          </div>
        )}
      </div>

      {/* Premium Footer */}
      <div style={{
        borderTop: '1px solid #e5e7eb',
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <button
          className="btn btn-primary"
          onClick={onCalculateRoute}
          disabled={!startPoint || !endPoint || loading}
          style={{
            background: !startPoint || !endPoint ? '#d1d5db' : 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
            opacity: loading ? 0.8 : 1
          }}
        >
          {loading ? '⏳ CALCULATING...' : '🔍 CALCULATE ROUTE'}
        </button>

        {route && (
          <>
            <button
              className="btn btn-primary"
              onClick={onSaveRoute}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              }}
            >
              💾 SAVE ROUTE
            </button>
            <button
              className="btn btn-secondary"
              onClick={onClearRoute}
              style={{
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb'
              }}
            >
              🔄 CLEAR
            </button>
          </>
        )}

        <div style={{
          fontSize: '10px',
          color: '#9ca3af',
          textAlign: 'center',
          marginTop: '4px',
          letterSpacing: '0.3px'
        }}>
          ZyngMAP v1.0 • Global Navigator
        </div>
      </div>
    </div>
  )
}

export default SidePanel
