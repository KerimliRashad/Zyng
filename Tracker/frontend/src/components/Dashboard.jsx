import { useState } from 'react'

export default function Dashboard({
  profile,
  results,
  trackedWeights,
  trackedCalories,
  onWeightUpdate,
  onCalorieUpdate,
  onReset
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [newWeight, setNewWeight] = useState('')
  const [newCalories, setNewCalories] = useState('')
  const [mealType, setMealType] = useState('breakfast')

  const currentWeight = trackedWeights.length > 0
    ? trackedWeights[trackedWeights.length - 1].weight
    : profile.weight

  const todayCalories = trackedCalories
    .filter(c => c.date === new Date().toISOString().split('T')[0])
    .reduce((sum, c) => sum + c.calories, 0)

  const weightChange = trackedWeights.length > 0
    ? (currentWeight - profile.weight).toFixed(1)
    : 0

  const handleAddWeight = () => {
    if (newWeight && !isNaN(newWeight)) {
      onWeightUpdate(parseFloat(newWeight))
      setNewWeight('')
    }
  }

  const handleAddCalories = () => {
    if (newCalories && !isNaN(newCalories)) {
      onCalorieUpdate(parseInt(newCalories), mealType)
      setNewCalories('')
    }
  }

  return (
    <div className="card" style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 style={{ color: '#333' }}>Твой прогресс 📊</h2>
        <button className="btn btn-secondary" onClick={onReset} style={{ marginTop: 0 }}>
          Сбросить профиль
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Калорийность в день</h3>
          <div className="value">{results?.tdee}</div>
          <div className="unit">ккал</div>
        </div>
        <div className="stat-card">
          <h3>Текущий вес</h3>
          <div className="value">{currentWeight.toFixed(1)}</div>
          <div className="unit" style={{ color: weightChange >= 0 ? '#ff6b6b' : '#51cf66' }}>
            {weightChange >= 0 ? '+' : ''}{weightChange} кг
          </div>
        </div>
        <div className="stat-card">
          <h3>Сегодня съедено</h3>
          <div className="value">{todayCalories}</div>
          <div className="unit">из {results?.calorieGoal} ккал</div>
        </div>
        <div className="stat-card">
          <h3>Макронутриенты</h3>
          <div className="unit">Б: {results?.macros.protein}г | У: {results?.macros.carbs}г | Ж: {results?.macros.fats}г</div>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📋 Обзор
        </button>
        <button
          className={`tab-btn ${activeTab === 'tracking' ? 'active' : ''}`}
          onClick={() => setActiveTab('tracking')}
        >
          📝 Отслеживание
        </button>
        <button
          className={`tab-btn ${activeTab === 'workout' ? 'active' : ''}`}
          onClick={() => setActiveTab('workout')}
        >
          💪 Тренировки
        </button>
      </div>

      <div className={`tab-content ${activeTab === 'overview' ? 'active' : ''}`}>
        <div className="section">
          <h2>🍽️ Макронутриенты</h2>
          <p style={{ marginBottom: '15px', color: '#555' }}>
            Оптимальное распределение питательных веществ для твоей цели:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #ff6b9d 0%, #ff4757 100%)',
              color: 'white',
              padding: '20px',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', fontWeight: '700' }}>🥩</div>
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{results?.macros.protein}г</div>
                <div style={{ opacity: 0.9, fontSize: '0.9rem' }}>Белки</div>
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #ffa500 0%, #ff6348 100%)',
              color: 'white',
              padding: '20px',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', fontWeight: '700' }}>🍚</div>
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{results?.macros.carbs}г</div>
                <div style={{ opacity: 0.9, fontSize: '0.9rem' }}>Углеводы</div>
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #ffd700 0%, #ffaa00 100%)',
              color: 'white',
              padding: '20px',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', fontWeight: '700' }}>🥑</div>
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{results?.macros.fats}г</div>
                <div style={{ opacity: 0.9, fontSize: '0.9rem' }}>Жиры</div>
              </div>
            </div>
          </div>
        </div>

        <div className="section">
          <h2>📋 Рекомендации по диете</h2>
          <ul>
            {results?.dietRecommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>

        <div className="section">
          <h2>💡 Советы по здоровью</h2>
          <ul>
            {results?.healthTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`tab-content ${activeTab === 'tracking' ? 'active' : ''}`}>
        <div className="section">
          <h2>⚖️ Отслеживание веса</h2>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <input
              type="number"
              placeholder="Вес в кг"
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              step="0.1"
              style={{
                flex: 1,
                padding: '12px 15px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px'
              }}
            />
            <button
              onClick={handleAddWeight}
              className="btn btn-primary"
              style={{ marginTop: 0, width: 'auto', padding: '12px 20px' }}
            >
              Добавить
            </button>
          </div>

          {trackedWeights.length > 0 && (
            <div className="weight-log">
              <h3 style={{ marginBottom: '10px', color: '#333' }}>История веса:</h3>
              {[...trackedWeights].reverse().map((entry, i) => (
                <div key={i} className="log-entry">
                  <span>{entry.date}</span>
                  <span className="value">{entry.weight.toFixed(1)} кг</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <h2>🍲 Отслеживание калорий</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              style={{
                padding: '10px 12px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px'
              }}
            >
              <option value="breakfast">Завтрак</option>
              <option value="lunch">Обед</option>
              <option value="dinner">Ужин</option>
              <option value="snack">Перекус</option>
            </select>

            <input
              type="number"
              placeholder="Калории"
              value={newCalories}
              onChange={(e) => setNewCalories(e.target.value)}
              style={{
                padding: '10px 12px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px'
              }}
            />

            <button
              onClick={handleAddCalories}
              className="btn btn-primary"
              style={{ marginTop: 0, width: '100%' }}
            >
              Добавить
            </button>
          </div>

          {todayCalories > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ marginBottom: '10px', color: '#666', fontWeight: '600' }}>
                Прогресс: {todayCalories} из {results?.calorieGoal} ккал
              </p>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min((todayCalories / results?.calorieGoal) * 100, 100)}%`
                  }}
                ></div>
              </div>
            </div>
          )}

          {trackedCalories.length > 0 && (
            <div className="calorie-log">
              <h3 style={{ marginBottom: '10px', color: '#333' }}>История питания:</h3>
              {[...trackedCalories].reverse().map((entry, i) => (
                <div key={i} className="log-entry">
                  <div>
                    <div style={{ fontWeight: '600', color: '#333' }}>{entry.meal}</div>
                    <div className="date">{entry.date} {entry.time}</div>
                  </div>
                  <span className="value">{entry.calories} ккал</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`tab-content ${activeTab === 'workout' ? 'active' : ''}`}>
        <div className="section">
          <h2>💪 План тренировок</h2>
          <p style={{ marginBottom: '15px', color: '#555', fontWeight: '600' }}>
            Кардио: {results?.workoutPlan.cardio}
          </p>
          <p style={{ marginBottom: '20px', color: '#555', fontWeight: '600' }}>
            Силовая подготовка: {results?.workoutPlan.strength}
          </p>

          <h3 style={{ marginTop: '20px', marginBottom: '15px', color: '#333' }}>Рекомендуемые упражнения:</h3>
          <ul>
            {results?.workoutPlan.exercises.map((exercise, i) => (
              <li key={i} style={{ listStyle: 'none', paddingLeft: '25px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0 }}>✅</span>
                {exercise}
              </li>
            ))}
          </ul>
        </div>

        <div className="section">
          <h2>🎯 Советы для тренировок</h2>
          <ul style={{ marginTop: '15px' }}>
            <li>Начни с разминки 5-10 минут</li>
            <li>Пей воду каждые 15-20 минут</li>
            <li>Соблюдай правильную технику упражнений</li>
            <li>Не пропускай дни отдыха - они важны для восстановления</li>
            <li>Записывай свои тренировки и прогресс</li>
            <li>Постепенно увеличивай интенсивность</li>
            <li>Консультируйся с тренером если что-то боит</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
