import { useState, useEffect } from 'react'
import ProfileSetup from './components/ProfileSetup'
import Dashboard from './components/Dashboard'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState('setup')
  const [profile, setProfile] = useState(null)
  const [results, setResults] = useState(null)
  const [trackedWeights, setTrackedWeights] = useState([])
  const [trackedCalories, setTrackedCalories] = useState([])

  useEffect(() => {
    const savedProfile = localStorage.getItem('trackerProfile')
    const savedWeights = localStorage.getItem('trackedWeights')
    const savedCalories = localStorage.getItem('trackedCalories')

    if (savedProfile) {
      setProfile(JSON.parse(savedProfile))
      setCurrentPage('dashboard')
    }
    if (savedWeights) setTrackedWeights(JSON.parse(savedWeights))
    if (savedCalories) setTrackedCalories(JSON.parse(savedCalories))
  }, [])

  const handleProfileSubmit = async (profileData) => {
    setProfile(profileData)
    localStorage.setItem('trackerProfile', JSON.stringify(profileData))

    try {
      const apiUrl = window.location.pathname.includes('/tracker')
        ? '/tracker/api/calculate'
        : 'http://localhost:5000/api/calculate'

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      })

      if (!response.ok) throw new Error('Failed to calculate')
      const data = await response.json()
      setResults(data)
      setCurrentPage('dashboard')
    } catch (error) {
      alert('Ошибка при расчёте: ' + error.message)
    }
  }

  const handleWeightUpdate = (weight) => {
    const newWeight = { weight, date: new Date().toISOString().split('T')[0] }
    const updated = [...trackedWeights, newWeight]
    setTrackedWeights(updated)
    localStorage.setItem('trackedWeights', JSON.stringify(updated))
  }

  const handleCalorieUpdate = (calories, meal) => {
    const newEntry = {
      calories,
      meal,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    }
    const updated = [...trackedCalories, newEntry]
    setTrackedCalories(updated)
    localStorage.setItem('trackedCalories', JSON.stringify(updated))
  }

  const handleReset = () => {
    setProfile(null)
    setResults(null)
    setTrackedWeights([])
    setTrackedCalories([])
    localStorage.removeItem('trackerProfile')
    localStorage.removeItem('trackedWeights')
    localStorage.removeItem('trackedCalories')
    setCurrentPage('setup')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>💪 ZyngTRACKER</h1>
        <p>Твой личный фитнес тренер</p>
      </header>

      <main className="app-main">
        {currentPage === 'setup' ? (
          <ProfileSetup onSubmit={handleProfileSubmit} />
        ) : (
          <Dashboard
            profile={profile}
            results={results}
            trackedWeights={trackedWeights}
            trackedCalories={trackedCalories}
            onWeightUpdate={handleWeightUpdate}
            onCalorieUpdate={handleCalorieUpdate}
            onReset={handleReset}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>ZyngTRACKER v1.0 © 2024 | Твой путь к здоровью начинается здесь</p>
      </footer>
    </div>
  )
}

export default App
