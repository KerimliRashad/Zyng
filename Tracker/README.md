# 💪 ZyngTRACKER - Fitness & Health Tracking App

A comprehensive web-based fitness and health tracking application that helps users monitor their calories, weight, and provides personalized workout and diet recommendations.

## Features

✅ **TDEE Calculator** - Calculates Total Daily Energy Expenditure based on Harris-Benedict formula
✅ **Macro Nutrient Breakdown** - Personalized protein, carbs, and fat distribution
✅ **Diet Recommendations** - Tailored diet tips based on selected diet type
✅ **Workout Plans** - Customized workout routines by fitness level and goals
✅ **Weight Tracking** - Log and track weight changes over time
✅ **Calorie Counter** - Track daily calorie intake by meal type
✅ **Progress Visualization** - View progress bars and statistics
✅ **Health Tips** - Daily health and wellness advice
✅ **Local Storage** - All data saved locally in the browser

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Node.js + Express
- **Database**: LocalStorage (browser)
- **Styling**: Pure CSS with responsive design

## Project Structure

```
Tracker/
├── frontend/              # React application
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── ProfileSetup.jsx
│   │   │   └── Dashboard.jsx
│   │   ├── App.jsx       # Main app component
│   │   ├── App.css       # Styling
│   │   ├── index.css     # Global styles
│   │   └── main.jsx      # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── backend/               # Express API
│   ├── server.js         # API server with fitness calculators
│   ├── package.json
│   └── .env
│
└── package.json
```

## Installation

### Frontend Setup

```bash
cd frontend
npm install
```

**Development:**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
```

### Backend Setup

```bash
cd backend
npm install
```

**Development:**
```bash
npm start
```

Or with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Health Check
```
GET /api/health
```

### Calculate Fitness Plan
```
POST /api/calculate
Content-Type: application/json

{
  "gender": "male",
  "age": 25,
  "weight": 75,
  "height": 180,
  "activityLevel": "moderate",
  "dietType": "balanced",
  "goal": "maintenance",
  "fitnessLevel": "beginner"
}
```

**Response:**
```json
{
  "tdee": 2500,
  "macros": {
    "protein": 187,
    "carbs": 312,
    "fats": 83
  },
  "dietRecommendations": [...],
  "workoutPlan": {...},
  "healthTips": [...],
  "calorieGoal": 2500
}
```

### Track Weight
```
POST /api/track-weight
{
  "weight": 75.5,
  "date": "2024-01-20"
}
```

### Track Calories
```
POST /api/track-calories
{
  "calories": 500,
  "date": "2024-01-20",
  "meal": "breakfast"
}
```

## Features Explained

### TDEE Calculation
Uses the Harris-Benedict formula for accurate BMR (Basal Metabolic Rate) calculation:
- **Men**: BMR = 88.362 + (13.397 × weight) + (4.799 × height) - (5.677 × age)
- **Women**: BMR = 447.593 + (9.247 × weight) + (3.098 × height) - (4.330 × age)

TDEE is calculated by multiplying BMR by activity level multiplier (1.2 - 1.9)

### Activity Levels
- **Sedentary**: 1.2× (little or no exercise)
- **Light**: 1.375× (1-3 days/week)
- **Moderate**: 1.55× (3-5 days/week)
- **Active**: 1.725× (6-7 days/week)
- **Very Active**: 1.9× (intense training 2x/day)

### Diet Types
- **Balanced**: 30% protein, 40% carbs, 30% fats
- **High Protein**: 40% protein, 30% carbs, 30% fats
- **Low Carb**: 35% protein, 25% carbs, 40% fats
- **Mediterranean**: 25% protein, 50% carbs, 25% fats

### Fitness Goals
- **Weight Loss**: Creates 500kcal deficit
- **Maintenance**: Same as TDEE
- **Muscle Gain**: Creates 300kcal surplus

### Fitness Levels
- **Beginner**: Light weights, basic exercises
- **Intermediate**: Moderate weights, split programs
- **Advanced**: Heavy weights, specialized routines

## Deployment to zyng.online/tracker

### 1. Build Frontend
```bash
cd frontend
npm run build
```

### 2. Copy to Web Server
```bash
mkdir -p /var/www/html/tracker
cp -r frontend/dist/* /var/www/html/tracker/
```

### 3. Configure Nginx

Add this to `/etc/nginx/sites-available/zyng.online`:

```nginx
upstream tracker_api {
    server localhost:5000;
}

# ZyngTRACKER Frontend
location /tracker {
    alias /var/www/html/tracker;
    try_files $uri $uri/ /tracker/index.html;
}

# ZyngTRACKER API
location /tracker/api {
    proxy_pass http://tracker_api/api;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### 4. Start Backend with PM2
```bash
cd backend
pm2 start server.js --name "tracker-api" --env production
pm2 save
```

### 5. Restart Nginx
```bash
nginx -s reload
```

Visit: **http://zyng.online/tracker**

## Usage

1. **Profile Setup**: Enter your personal data (age, weight, height, etc.)
2. **Review Plan**: See your calculated TDEE, macros, and recommendations
3. **Track Weight**: Log weight changes regularly
4. **Track Calories**: Add meals and calories throughout the day
5. **View Workouts**: Follow the recommended workout plan
6. **Monitor Progress**: Check your weight graph and calorie intake

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Fast load times (<2s)
- Responsive design for all screen sizes
- LocalStorage for instant data access
- No external dependencies for styling

## Future Enhancements

- User authentication and cloud sync
- Advanced analytics and progress graphs
- Integration with fitness trackers
- Meal plan templates
- Video workout tutorials
- Social features and challenges
- Offline mode

## License

MIT License - Free to use and modify

---

**Made with 💪 for your fitness journey!**
