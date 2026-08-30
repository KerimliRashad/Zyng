import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const MapComponent = ({ startPoint, endPoint, route, userLocation, onSelectPoint }) => {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({})
  const routeLayerRef = useRef(null)

  useEffect(() => {
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([20, 0], 2)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(mapInstanceRef.current)

      mapInstanceRef.current.on('click', (e) => {
        const { lat, lng } = e.latlng
        // If start is not set, set start. Otherwise set end.
        const pointType = !startPoint ? 'start' : 'end'
        onSelectPoint({ lat, lng }, pointType)
      })
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
      }
    }
  }, [startPoint])

  // Update user location
  useEffect(() => {
    if (userLocation && mapInstanceRef.current) {
      if (markersRef.current.user) {
        markersRef.current.user.remove()
      }
      const userIcon = L.divIcon({
        html: '<div style="width: 20px; height: 20px; background: #4CAF50; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>',
        iconSize: [20, 20]
      })
      markersRef.current.user = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup('Your Location')
    }
  }, [userLocation])

  // Update start point
  useEffect(() => {
    if (startPoint && mapInstanceRef.current) {
      if (markersRef.current.start) {
        markersRef.current.start.remove()
      }
      const startIcon = L.divIcon({
        html: '<div style="width: 32px; height: 32px; background: #4CAF50; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">A</div>',
        iconSize: [32, 32]
      })
      markersRef.current.start = L.marker([startPoint.lat, startPoint.lng], { icon: startIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup('Start Point')
        .openPopup()
      mapInstanceRef.current.setView([startPoint.lat, startPoint.lng], 12)
    }
  }, [startPoint])

  // Update end point
  useEffect(() => {
    if (endPoint && mapInstanceRef.current) {
      if (markersRef.current.end) {
        markersRef.current.end.remove()
      }
      const endIcon = L.divIcon({
        html: '<div style="width: 32px; height: 32px; background: #FF6B6B; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">B</div>',
        iconSize: [32, 32]
      })
      markersRef.current.end = L.marker([endPoint.lat, endPoint.lng], { icon: endIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup('End Point')
        .openPopup()

      if (startPoint) {
        const bounds = L.latLngBounds([
          [startPoint.lat, startPoint.lng],
          [endPoint.lat, endPoint.lng]
        ])
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] })
      }
    }
  }, [endPoint, startPoint])

  // Update route polyline
  useEffect(() => {
    if (route && mapInstanceRef.current) {
      if (routeLayerRef.current) {
        routeLayerRef.current.remove()
      }

      const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]])
      routeLayerRef.current = L.polyline(coordinates, {
        color: '#667eea',
        weight: 4,
        opacity: 0.8,
        dashArray: '5, 5'
      }).addTo(mapInstanceRef.current)

      if (startPoint && endPoint) {
        const bounds = L.latLngBounds([
          [startPoint.lat, startPoint.lng],
          [endPoint.lat, endPoint.lng]
        ])
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] })
      }
    }
  }, [route])

  return (
    <div
      ref={mapRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative'
      }}
    >
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'white',
        padding: '10px 15px',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        zIndex: 400,
        fontSize: '13px',
        color: '#666'
      }}>
        Click on map to select points
      </div>
    </div>
  )
}

export default MapComponent
