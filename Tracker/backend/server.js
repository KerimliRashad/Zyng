import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

// Калории расчёты (TDEE - Total Daily Energy Expenditure)
const calculateTDEE = (gender, age, weight, height, activityLevel) => {
  let bmr

  if (gender === 'male') {
    bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age)
  } else {
    bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age)
  }

  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9
  }

  const tdee = bmr * (activityMultipliers[activityLevel] || 1.55)
  return Math.round(tdee)
}

// Макронутриенты расчёты
const calculateMacros = (tdee, dietType) => {
  const macros = {
    balanced: { protein: 0.30, carbs: 0.40, fats: 0.30 },
    highProtein: { protein: 0.40, carbs: 0.30, fats: 0.30 },
    lowCarb: { protein: 0.35, carbs: 0.25, fats: 0.40 },
    mediterranean: { protein: 0.25, carbs: 0.50, fats: 0.25 }
  }

  const macro = macros[dietType] || macros.balanced
  return {
    protein: Math.round(tdee * macro.protein / 4),
    carbs: Math.round(tdee * macro.carbs / 4),
    fats: Math.round(tdee * macro.fats / 9)
  }
}

// Рекомендации по диете
const getDietRecommendations = (goal, dietType) => {
  const recommendations = {
    balanced: [
      'Ешь больше овощей и фруктов',
      'Выбирай цельнозерновые продукты',
      'Пей много воды',
      'Ограничь сахар и обработанные продукты'
    ],
    highProtein: [
      'Включи белок в каждый приём пищи',
      'Куриное мясо, рыба, яйца - хорошие источники',
      'Молочные продукты помогут в восстановлении',
      'Тренируйся с силовыми упражнениями'
    ],
    lowCarb: [
      'Ограничь хлеб, макароны и рис',
      'Фокусируйся на зелени и овощах',
      'Здоровые жиры: авокадо, орехи, оливковое масло',
      'Минимизируй сахаристые продукты'
    ],
    mediterranean: [
      'Оливковое масло как основной источник жиров',
      'Много овощей, орехов и целых зёрен',
      'Рыба 2-3 раза в неделю',
      'Молочные продукты в модерации'
    ]
  }

  return recommendations[dietType] || recommendations.balanced
}

// Рекомендации по тренировкам
const getWorkoutPlan = (goal, fitnessLevel) => {
  const plans = {
    weightLoss: {
      beginner: {
        cardio: '30 мин, 3-4 раза в неделю',
        strength: '2-3 раза в неделю, лёгкие веса',
        exercises: ['Ходьба быстрая', 'Плавание', 'Велосипед', 'Приседания', 'Отжимания']
      },
      intermediate: {
        cardio: '40-45 мин, 4-5 раз в неделю',
        strength: '3-4 раза в неделю, средние веса',
        exercises: ['Бег трусцой', 'HIIT', 'Кроссфит', 'Прыжки на скакалке', 'Силовые упражнения']
      },
      advanced: {
        cardio: '45-60 мин, 5-6 раз в неделю',
        strength: '4-5 раз в неделю, тяжёлые веса',
        exercises: ['Интервальный бег', 'Интенсивный HIIT', 'Тяжёлая атлетика', 'Берпи']
      }
    },
    muscleGain: {
      beginner: {
        strength: '3 раза в неделю, фокус на технике',
        cardio: '1-2 раза, лёгкое',
        exercises: ['Приседания', 'Жим лежа', 'Тяги', 'Отжимания', 'Подтягивания']
      },
      intermediate: {
        strength: '4 раза в неделю, сплит программа',
        cardio: '1-2 раза, 20-30 мин',
        exercises: ['Сложные движения', 'Изоляция мышц', 'Суперсеты']
      },
      advanced: {
        strength: '5-6 раз в неделю, продвинутый сплит',
        cardio: 'Минимум, только восстановление',
        exercises: ['Максимальная нагрузка', 'Техника высокого уровня']
      }
    },
    maintenance: {
      beginner: {
        strength: '2-3 раза в неделю',
        cardio: '2-3 раза в неделю, 20-30 мин',
        exercises: ['Разнообразные упражнения', 'Функциональные движения']
      },
      intermediate: {
        strength: '3-4 раза в неделю',
        cardio: '2-3 раза в неделю',
        exercises: ['Баланс силовых и кардио']
      },
      advanced: {
        strength: '4-5 раз в неделю',
        cardio: '2-3 раза в неделю',
        exercises: ['Специализированная программа']
      }
    }
  }

  return plans[goal]?.[fitnessLevel] || plans.maintenance.beginner
}

// Здоровье советы
const getHealthTips = () => [
  'Спи 7-9 часов в сутки для восстановления',
  'Пей минимум 8 стаканов воды в день',
  'Делай перерывы от экранов каждый час',
  'Занимайся медитацией 10-15 минут в день',
  'Избегай стресса через здоровые привычки',
  'Регулярно проверяй здоровье у врача'
]

// API маршруты
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Tracker Backend' })
})

app.post('/api/calculate', (req, res) => {
  const { gender, age, weight, height, activityLevel, dietType, goal, fitnessLevel } = req.body

  if (!gender || !age || !weight || !height) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const tdee = calculateTDEE(gender, age, weight, height, activityLevel)
  const macros = calculateMacros(tdee, dietType)
  const dietRecommendations = getDietRecommendations(goal, dietType)
  const workoutPlan = getWorkoutPlan(goal, fitnessLevel)
  const healthTips = getHealthTips()

  res.json({
    tdee,
    macros,
    dietRecommendations,
    workoutPlan,
    healthTips,
    calorieGoal: goal === 'weightLoss' ? tdee - 500 : goal === 'muscleGain' ? tdee + 300 : tdee
  })
})

app.post('/api/track-weight', (req, res) => {
  const { weight, date } = req.body
  // В реальном приложении это бы сохранялось в БД
  res.json({ success: true, message: 'Weight tracked', weight, date })
})

app.post('/api/track-calories', (req, res) => {
  const { calories, date, meal } = req.body
  // В реальном приложении это бы сохранялось в БД
  res.json({ success: true, message: 'Calories tracked', calories, date, meal })
})

app.listen(PORT, () => {
  console.log(`Tracker Backend running on port ${PORT}`)
})
