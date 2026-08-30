import express from 'express'
import cors from 'cors'
import axios from 'axios'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const OSRM_URL = 'http://router.project-osrm.org'

const profileMap = {
  car: 'car',
  truck: 'truck'
}

const vehicleRestrictions = {
  usa: {
    truck: {
      maxHeight: 4.29,
      minHeight: 4.11,
      restrictions: 'some roads have height limits'
    },
    car: {
      maxHeight: 2.5
    }
  },
  europe: {
    truck: {
      maxHeight: 4.3,
      minHeight: 4.0,
      restrictions: 'stricter height regulations'
    },
    car: {
      maxHeight: 2.5
    }
  },
  russia: {
    truck: {
      maxHeight: 4.2,
      minHeight: 3.8,
      restrictions: 'variable road conditions'
    },
    car: {
      maxHeight: 2.5
    }
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ZyngMAP Backend' })
})

app.post('/api/route', async (req, res) => {
  try {
    const { start, end, vehicleType, region, truckHeight } = req.body

    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end points required' })
    }

    const profile = profileMap[vehicleType] || 'car'
    const url = `${OSRM_URL}/route/v1/${profile}/${start.lng},${start.lat};${end.lng},${end.lat}`

    const params = {
      steps: true,
      geometries: 'geojson',
      overview: 'full',
      continue_straight: false
    }

    const response = await axios.get(url, { params })

    if (response.data.code !== 'Ok') {
      return res.status(400).json({ error: 'Could not calculate route' })
    }

    const route = response.data.routes[0]

    const regionLimits = vehicleRestrictions[region] || vehicleRestrictions.usa
    const vehicleLimits = regionLimits[vehicleType]

    let warnings = []
    if (vehicleType === 'truck') {
      if (truckHeight > vehicleLimits.maxHeight) {
        warnings.push(`Height ${truckHeight}m exceeds ${region} limit of ${vehicleLimits.maxHeight}m`)
      }
      if (truckHeight < vehicleLimits.minHeight) {
        warnings.push(`Height ${truckHeight}m below minimum of ${vehicleLimits.minHeight}m`)
      }
    }

    const enhancedRoute = {
      ...route,
      properties: {
        distance: route.distance,
        duration: route.duration,
        vehicleType,
        region,
        truckHeight,
        warnings,
        restrictions: vehicleLimits.restrictions || 'standard restrictions apply'
      }
    }

    res.json(enhancedRoute)
  } catch (error) {
    console.error('Route calculation error:', error.message)
    res.status(500).json({ error: 'Failed to calculate route' })
  }
})

app.post('/api/validate-truck', (req, res) => {
  const { height, region } = req.body

  if (!height || !region) {
    return res.status(400).json({ error: 'Height and region required' })
  }

  const limits = vehicleRestrictions[region]?.truck
  if (!limits) {
    return res.status(400).json({ error: 'Unknown region' })
  }

  const isValid = height >= limits.minHeight && height <= limits.maxHeight
  res.json({
    isValid,
    message: isValid ? 'Height is acceptable' : `Height must be between ${limits.minHeight}m and ${limits.maxHeight}m`,
    limits
  })
})

app.get('/api/regions', (req, res) => {
  res.json({
    regions: Object.keys(vehicleRestrictions).map(key => ({
      id: key,
      name: key.toUpperCase(),
      restrictions: vehicleRestrictions[key]
    }))
  })
})

app.listen(PORT, () => {
  console.log(`🚀 ZyngMAP Backend running on http://localhost:${PORT}`)
  console.log(`📍 API endpoints:`)
  console.log(`   GET  /api/health          - Health check`)
  console.log(`   POST /api/route           - Calculate route`)
  console.log(`   POST /api/validate-truck  - Validate truck height`)
  console.log(`   GET  /api/regions         - Get regions and restrictions`)
})
