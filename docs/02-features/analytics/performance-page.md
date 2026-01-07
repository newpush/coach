# Performance Page Documentation

## Overview

The Performance page provides comprehensive visualization and tracking of all scoring metrics across workouts, nutrition, and athlete profile. It features interactive charts, score cards, and trend analysis to help athletes monitor their progress over time.

## Location

**URL**: `/performance`  
**File**: [`app/pages/performance.vue`](../app/pages/performance.vue)  
**Access**: Requires authentication

## Features

### 1. Athlete Profile Dashboard

Displays current athlete profile scores at the top of the page:

- **Current Fitness Score** - Overall fitness level
- **Recovery Capacity Score** - Ability to recover from training
- **Nutrition Compliance Score** - Long-term nutrition quality
- **Training Consistency Score** - Training adherence over time

Each score includes:

- Icon representation
- Numeric score (0-10 scale)
- Visual progress bar
- Color-coded status (green=excellent, blue=strong, yellow=adequate, orange=needs work, red=poor)

### 2. Workout Performance Section

Comprehensive workout score tracking with:

**Score Cards** (5 metrics):

- Overall Score
- Technical Score (form, efficiency)
- Effort Score (appropriateness)
- Pacing Score (strategy)
- Execution Score (plan adherence)

**Trend Chart**:

- Line chart showing all 5 workout scores over time
- Interactive tooltips on hover
- Color-coded lines for each metric
- Responsive date labels

**Radar Chart**:

- Pentagon visualization of score balance
- Shows current average across all 5 dimensions
- Helps identify strengths and weaknesses visually

### 3. Nutrition Quality Section

Comprehensive nutrition score tracking with:

**Score Cards** (5 metrics):

- Overall Score
- Macro Balance Score
- Quality Score (food quality)
- Adherence Score (goal compliance)
- Hydration Score

**Trend Chart**:

- Line chart showing all 5 nutrition scores over time
- Interactive tooltips
- Color-coded lines

**Radar Chart**:

- Pentagon visualization of nutrition balance
- Current average across all 5 dimensions

### 4. Time Period Selector

Dropdown menu to adjust the viewing period:

- 7 Days
- 14 Days
- 30 Days (default)
- 90 Days

Dynamically updates all charts and statistics.

## Components

### ScoreCard Component

**File**: [`app/components/ScoreCard.vue`](../app/components/ScoreCard.vue)

**Props**:

- `title` (string) - Card title
- `score` (number | null) - Score value (1-10)
- `icon` (string) - Heroicon name
- `color` (string) - Icon color theme
- `compact` (boolean) - Compact display mode

**Features**:

- Color-coded score display
- Visual progress bar
- Score label (Exceptional/Strong/Adequate/Needs Work/Poor)
- Responsive design
- Dark mode support

### TrendChart Component

**File**: [`app/components/TrendChart.vue`](../app/components/TrendChart.vue)

**Props**:

- `data` (array) - Score data points
- `type` ('workout' | 'nutrition') - Chart type

**Features**:

- SVG-based line chart
- Multiple metrics displayed simultaneously
- Interactive tooltips showing exact values
- Responsive date axis
- Grid lines for easy reading
- Legend with color coding
- Dark mode support

**Metrics Displayed**:

- Workout: overall, technical, effort, pacing, execution
- Nutrition: overall, macroBalance, quality, adherence, hydration

### RadarChart Component

**File**: [`app/components/RadarChart.vue`](../app/components/RadarChart.vue)

**Props**:

- `scores` (object) - Score values for each dimension
- `type` ('workout' | 'nutrition') - Chart type

**Features**:

- Pentagon-shaped radar visualization
- Shows balance across all dimensions
- Interactive tooltips on data points
- Grid circles for scale reference
- Labeled axes
- Color-coded by type (blue for workout, green for nutrition)
- Dark mode support

## API Endpoints

### GET /api/scores/workout-trends

**Query Parameters**:

- `days` (number) - Number of days to retrieve (default: 30)

**Response**:

```json
{
  "workouts": [
    {
      "id": "string",
      "date": "ISO date",
      "title": "string",
      "type": "string",
      "overallScore": number,
      "technicalScore": number,
      "effortScore": number,
      "pacingScore": number,
      "executionScore": number
    }
  ],
  "summary": {
    "total": number,
    "avgOverall": number,
    "avgTechnical": number,
    "avgEffort": number,
    "avgPacing": number,
    "avgExecution": number
  }
}
```

### GET /api/scores/nutrition-trends

**Query Parameters**:

- `days` (number) - Number of days to retrieve (default: 14)

**Response**:

```json
{
  "nutrition": [
    {
      "id": "string",
      "date": "ISO date",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "overallScore": number,
      "macroBalanceScore": number,
      "qualityScore": number,
      "adherenceScore": number,
      "hydrationScore": number
    }
  ],
  "summary": {
    "total": number,
    "avgOverall": number,
    "avgMacroBalance": number,
    "avgQuality": number,
    "avgAdherence": number,
    "avgHydration": number
  }
}
```

### GET /api/scores/athlete-profile

**Response**:

```json
{
  "user": {
    "id": "string",
    "name": "string",
    "ftp": number,
    "weight": number,
    "maxHr": number,
    "wkg": string
  },
  "scores": {
    "currentFitness": number,
    "recoveryCapacity": number,
    "nutritionCompliance": number,
    "trainingConsistency": number,
    "lastUpdated": "ISO date"
  }
}
```

## Setup Instructions

### 1. Run Database Migration

First, apply the scoring system migration:

```bash
npx prisma migrate dev
```

This creates all score fields in the database.

### 2. Regenerate Prisma Client

Update TypeScript types to include new fields:

```bash
npx prisma generate
```

### 3. Generate Score Data

To populate scores, trigger AI analysis on existing data:

```bash
# Analyze workouts
npm run trigger:analyze-workout

# Analyze nutrition
npm run trigger:analyze-nutrition

# Generate athlete profile
npm run trigger:generate-profile
```

### 4. Access the Page

Navigate to `/performance` in your application to view the dashboard.

## Styling

The page uses:

- **Tailwind CSS** for styling
- **Nuxt UI** components (UCard, UBadge, USelectMenu, UIcon)
- **Custom SVG** charts for visualizations
- **Dark mode** support throughout
- **Responsive design** for mobile and desktop

## Color Coding

### Score Ranges

- **9-10**: Green (Exceptional)
- **7-8**: Blue (Strong)
- **5-6**: Yellow (Adequate)
- **3-4**: Orange (Needs Work)
- **1-2**: Red (Poor)

### Chart Colors

**Workout Metrics**:

- Overall: Yellow (#eab308)
- Technical: Blue (#3b82f6)
- Effort: Red (#ef4444)
- Pacing: Green (#22c55e)
- Execution: Purple (#a855f7)

**Nutrition Metrics**:

- Overall: Yellow (#eab308)
- Macro Balance: Blue (#3b82f6)
- Quality: Green (#22c55e)
- Adherence: Purple (#a855f7)
- Hydration: Cyan (#06b6d4)

## Future Enhancements

Potential improvements:

1. Export charts as PNG/PDF
2. Score goal setting and tracking
3. Comparative analysis (week-over-week, month-over-month)
4. Score predictions based on trends
5. Detailed drill-down into specific workouts/days
6. Share performance reports
7. Custom date range selection
8. Score alerts and notifications
9. Mobile app views
10. CSV export of score data

## Troubleshooting

### No Data Showing

**Issue**: Charts show "No data available"

**Solutions**:

1. Ensure migration has been run: `npx prisma migrate dev`
2. Regenerate Prisma client: `npx prisma generate`
3. Trigger analysis on existing data to generate scores
4. Check that workouts/nutrition entries exist in the database

### TypeScript Errors

**Issue**: Type errors about missing score fields

**Solution**: Regenerate Prisma client after running migration:

```bash
npx prisma generate
```

### API Errors

**Issue**: 500 errors when loading page

**Solutions**:

1. Check database connection
2. Verify migration was applied successfully
3. Check server logs for specific errors
4. Ensure user is authenticated

## Performance Considerations

- Charts are rendered as SVG for smooth scaling
- API endpoints use indexes for fast queries
- Date ranges are limited to prevent excessive data loading
- Summary statistics are pre-calculated
- Lazy loading of chart components
- Responsive breakpoints for mobile optimization

## Accessibility

- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard navigation support
- Color-blind friendly chart colors
- High contrast mode support
- Screen reader compatible tooltips
