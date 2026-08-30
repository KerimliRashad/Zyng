import { useState } from 'react'

export default function ProfileSetup({ onSubmit }) {
  const [formData, setFormData] = useState({
    gender: 'male',
    age: 25,
    weight: 75,
    height: 180,
    activityLevel: 'moderate',
    dietType: 'balanced',
    goal: 'maintenance',
    fitnessLevel: 'beginner'
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: isNaN(value) ? value : parseFloat(value)
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="card">
      <h2 style={{ marginBottom: '30px', color: '#333', textAlign: 'center' }}>
        Расскажи о себе 👤
      </h2>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="form-group">
            <label>Пол</label>
            <select name="gender" value={formData.gender} onChange={handleChange}>
              <option value="male">Мужчина</option>
              <option value="female">Женщина</option>
            </select>
          </div>

          <div className="form-group">
            <label>Возраст (лет)</label>
            <input
              type="number"
              name="age"
              value={formData.age}
              onChange={handleChange}
              min="15"
              max="100"
            />
          </div>

          <div className="form-group">
            <label>Вес (кг)</label>
            <input
              type="number"
              name="weight"
              value={formData.weight}
              onChange={handleChange}
              min="30"
              max="300"
              step="0.1"
            />
          </div>

          <div className="form-group">
            <label>Рост (см)</label>
            <input
              type="number"
              name="height"
              value={formData.height}
              onChange={handleChange}
              min="100"
              max="250"
            />
          </div>
        </div>

        <div className="form-group">
          <label>Уровень активности</label>
          <select name="activityLevel" value={formData.activityLevel} onChange={handleChange}>
            <option value="sedentary">Малоподвижный образ жизни</option>
            <option value="light">Лёгкая активность (1-3 дня в неделю)</option>
            <option value="moderate">Умеренная активность (3-5 дней в неделю)</option>
            <option value="active">Активный образ жизни (6-7 дней в неделю)</option>
            <option value="veryActive">Очень активный (тренировки 2 раза в день)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Твоя цель</label>
          <select name="goal" value={formData.goal} onChange={handleChange}>
            <option value="maintenance">Поддержание веса</option>
            <option value="weightLoss">Похудение</option>
            <option value="muscleGain">Набор мышц</option>
          </select>
        </div>

        <div className="form-group">
          <label>Уровень подготовки</label>
          <select name="fitnessLevel" value={formData.fitnessLevel} onChange={handleChange}>
            <option value="beginner">Новичок</option>
            <option value="intermediate">Средний уровень</option>
            <option value="advanced">Продвинутый</option>
          </select>
        </div>

        <div className="form-group">
          <label>Тип диеты</label>
          <select name="dietType" value={formData.dietType} onChange={handleChange}>
            <option value="balanced">Сбалансированная (40% углеводы, 30% белки, 30% жиры)</option>
            <option value="highProtein">Высокобелковая (40% белки, 30% углеводы, 30% жиры)</option>
            <option value="lowCarb">Низкоуглеводная (25% углеводы, 35% белки, 40% жиры)</option>
            <option value="mediterranean">Средиземноморская (25% белки, 50% углеводы, 25% жиры)</option>
          </select>
        </div>

        <button type="submit" className="btn btn-primary">
          Начать мой путь к здоровью 🚀
        </button>
      </form>
    </div>
  )
}
