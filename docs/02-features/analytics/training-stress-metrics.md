# Training Stress Metrics: Implementation Guide

## Overview

Training stress metrics are essential for tracking fitness, fatigue, and form in endurance athletes. This document describes the key metrics, their calculations, and visualization methods based on the Performance Management Chart (PMC) methodology.

## Core Metrics

### 1. Training Stress Score (TSS)

**Definition**: A composite number that takes into account the duration and intensity of a training session to arrive at a single estimate of the overall training load and physiological stress created by that training session.

**Types**:

- **TSS** (Power-based): Used when power data is available
- **HRSS** (Heart Rate-based): Used when only heart rate data is available
- **TRIMP** (Training Impulse): Alternative heart rate-based metric

**Purpose**: Quantifies the training load of a single workout session.

#### TSS Calculation (Power-based)

```
TSS = (seconds × NP × IF) / (FTP × 3600) × 100
```

Where:

- **seconds**: Duration of the workout
- **NP**: Normalized Power (watts)
- **IF**: Intensity Factor = NP / FTP
- **FTP**: Functional Threshold Power (watts)

**Example**:

- Duration: 3600 seconds (1 hour)
- NP: 200 watts
- FTP: 250 watts
- IF: 200/250 = 0.8
- TSS = (3600 × 200 × 0.8) / (250 × 3600) × 100 = 64

#### HRSS Calculation (Heart Rate-based)

```
HRSS = (seconds × avgHR × HRR) / (LTHR × 3600) × 100
```

Where:

- **avgHR**: Average heart rate during workout
- **HRR**: Heart Rate Reserve = (avgHR - restingHR) / (maxHR - restingHR)
- **LTHR**: Lactate Threshold Heart Rate

#### TRIMP Calculation

```
TRIMP = duration (min) × avgHR × HRR × e^(1.92 × HRR)
```

Where:

- **e**: Euler's number (2.71828)
- **HRR**: Heart Rate Reserve (as decimal)

### 2. CTL (Chronic Training Load) - "Fitness"

**Definition**: A weighted average of your daily TSS over the past 42 days, representing your fitness level.

**Calculation**:

```
CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) / 42
```

**Exponentially Weighted Moving Average (EWMA) Formula**:

```
CTL = TSS₁ × (1/42) + TSS₂ × (1/42) × (41/42) + TSS₃ × (1/42) × (41/42)² + ...
```

**Time Constant**: 42 days

- This means it takes ~42 days to see significant changes in fitness
- After 42 days, about 63% of the effect from a training session has been incorporated

**Interpretation**:

- **Low CTL** (<40): Low fitness base
- **Moderate CTL** (40-80): Recreational athlete fitness
- **High CTL** (80-120): Competitive athlete fitness
- **Elite CTL** (>120): Professional/elite athlete fitness

### 3. ATL (Acute Training Load) - "Fatigue"

**Definition**: A weighted average of your daily TSS over the past 7 days, representing your recent training load and fatigue.

**Calculation**:

```
ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) / 7
```

**Exponentially Weighted Moving Average (EWMA) Formula**:

```
ATL = TSS₁ × (1/7) + TSS₂ × (1/7) × (6/7) + TSS₃ × (1/7) × (6/7)² + ...
```

**Time Constant**: 7 days

- This means it takes ~7 days to fully recover from a training block
- ATL responds much faster to changes in training load than CTL

**Interpretation**:

- Rises quickly with increased training
- Falls quickly during rest/taper periods
- High ATL relative to CTL indicates accumulated fatigue

### 4. TSB (Training Stress Balance) - "Form"

**Definition**: The difference between your CTL and ATL, indicating your readiness to perform.

**Calculation**:

```
TSB = CTL - ATL
```

**Interpretation**:

| TSB Range  | Status           | Training Recommendation                         |
| ---------- | ---------------- | ----------------------------------------------- |
| > +25      | **No Fitness**   | You've been resting too long; fitness declining |
| +5 to +25  | **Performance**  | Fresh and ready to race; peak form              |
| -10 to +5  | **Maintenance**  | Neutral zone; maintaining fitness               |
| -25 to -10 | **Productive**   | Optimal training zone; building fitness         |
| -40 to -25 | **Cautionary**   | High fatigue; injury risk increasing            |
| < -40      | **Overreaching** | Severe fatigue; rest needed immediately         |

**Form Assessment**:

```javascript
function getFormStatus(tsb) {
  if (tsb > 25) return 'No Fitness'
  if (tsb > 5) return 'Performance'
  if (tsb > -10) return 'Maintenance'
  if (tsb > -25) return 'Productive'
  if (tsb > -40) return 'Cautionary'
  return 'Overreaching'
}
```

## Performance Management Chart (PMC)

### Visualization Components

The PMC is a line chart with three traces:

1. **CTL Line** (Fitness)
   - Color: Purple/Blue (`rgb(171, 131, 186)`)
   - Represents long-term fitness trend
   - Slowly rising line indicates fitness gains

2. **ATL Line** (Fatigue)
   - Color: Yellow (`rgb(245, 226, 59)`)
   - Represents short-term fatigue
   - Spikes with hard training, drops with rest

3. **TSB Line/Area** (Form)
   - Color: Orange (`rgb(193, 125, 55)`)
   - Often shown as filled area above/below zero
   - Zero line represents CTL = ATL

### Chart Configuration

```javascript
{
  type: 'line',
  data: [
    {
      name: 'CTL (Fitness)',
      x: dates,
      y: ctlValues,
      line: { color: 'rgb(171, 131, 186)', width: 2 }
    },
    {
      name: 'ATL (Fatigue)',
      x: dates,
      y: atlValues,
      line: { color: 'rgb(245, 226, 59)', width: 2 }
    },
    {
      name: 'TSB (Form)',
      x: dates,
      y: tsbValues,
      fill: 'tozeroy',
      fillcolor: 'rgba(193, 125, 55, 0.5)',
      line: { color: 'rgb(193, 125, 55)', width: 2 }
    }
  ],
  layout: {
    yaxis: { title: 'Training Load' },
    xaxis: { title: 'Date' }
  }
}
```

## Implementation in Coach Watts

### Database Schema Requirements

```typescript
// Workout table should include:
interface Workout {
  id: string
  date: Date
  tss: number | null // Training Stress Score
  hrss: number | null // Heart Rate Stress Score
  trimp: number | null // Training Impulse
  ctl: number | null // Chronic Training Load (Fitness)
  atl: number | null // Acute Training Load (Fatigue)
  // ... other fields
}
```

### Calculation Service

```typescript
// server/utils/training-stress.ts

export interface PMCMetrics {
  ctl: number
  atl: number
  tsb: number
}

export function calculateCTL(previousCTL: number, todayTSS: number): number {
  const timeConstant = 42
  return previousCTL + (todayTSS - previousCTL) / timeConstant
}

export function calculateATL(previousATL: number, todayTSS: number): number {
  const timeConstant = 7
  return previousATL + (todayTSS - previousATL) / timeConstant
}

export function calculateTSB(ctl: number, atl: number): number {
  return ctl - atl
}

export function getStressScore(workout: Workout): number {
  // Prefer power-based TSS, fallback to HRSS, then TRIMP
  return workout.tss ?? workout.hrss ?? workout.trimp ?? 0
}

export async function calculatePMCForDateRange(
  startDate: Date,
  endDate: Date,
  userId: string
): Promise<PMCMetrics[]> {
  const workouts = await db.workout.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate }
    },
    orderBy: { date: 'asc' }
  })

  let ctl = 0
  let atl = 0
  const results: PMCMetrics[] = []

  for (const workout of workouts) {
    const tss = getStressScore(workout)
    ctl = calculateCTL(ctl, tss)
    atl = calculateATL(atl, tss)
    const tsb = calculateTSB(ctl, atl)

    results.push({
      date: workout.date,
      ctl,
      atl,
      tsb,
      tss
    })
  }

  return results
}
```

### API Endpoint

```typescript
// server/api/performance/pmc.get.ts

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const days = parseInt(query.days as string) || 90
  const session = await requireUserSession(event)

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const workouts = await db.workout.findMany({
    where: {
      userId: session.user.id,
      date: { gte: startDate, lte: endDate }
    },
    select: {
      date: true,
      tss: true,
      hrss: true,
      trimp: true,
      ctl: true,
      atl: true
    },
    orderBy: { date: 'asc' }
  })

  // Calculate TSB dynamically
  const data = workouts.map((w) => ({
    date: w.date,
    ctl: w.ctl,
    atl: w.atl,
    tsb: (w.ctl ?? 0) - (w.atl ?? 0)
  }))

  // Calculate summary statistics
  const latest = data[data.length - 1]
  const summary = {
    currentCTL: latest?.ctl ?? 0,
    currentATL: latest?.atl ?? 0,
    currentTSB: latest?.tsb ?? 0,
    formStatus: getFormStatus(latest?.tsb ?? 0)
  }

  return { data, summary }
})
```

### Vue Component

```vue
<!-- app/components/PMCChart.vue -->
<template>
  <div class="pmc-chart-container">
    <div class="summary-cards">
      <div class="metric-card">
        <div class="metric-label">Fitness (CTL)</div>
        <div class="metric-value">{{ summary.currentCTL.toFixed(0) }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Fatigue (ATL)</div>
        <div class="metric-value">{{ summary.currentATL.toFixed(0) }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Form (TSB)</div>
        <div class="metric-value" :class="tsbColor">
          {{ summary.currentTSB > 0 ? '+' : '' }}{{ summary.currentTSB.toFixed(0) }}
        </div>
        <div class="metric-status">{{ summary.formStatus }}</div>
      </div>
    </div>

    <canvas ref="chartCanvas"></canvas>
  </div>
</template>

<script setup lang="ts">
  import { Chart } from 'chart.js'

  const props = defineProps<{
    days: number
  }>()

  const chartCanvas = ref<HTMLCanvasElement | null>(null)
  const { data: pmcData } = await useFetch(`/api/performance/pmc?days=${props.days}`)

  const tsbColor = computed(() => {
    const tsb = pmcData.value?.summary.currentTSB ?? 0
    if (tsb > 5) return 'text-green-500'
    if (tsb < -25) return 'text-red-500'
    return 'text-yellow-500'
  })

  onMounted(() => {
    if (!chartCanvas.value || !pmcData.value) return

    new Chart(chartCanvas.value, {
      type: 'line',
      data: {
        labels: pmcData.value.data.map((d) => new Date(d.date)),
        datasets: [
          {
            label: 'CTL (Fitness)',
            data: pmcData.value.data.map((d) => d.ctl),
            borderColor: 'rgb(171, 131, 186)',
            backgroundColor: 'rgba(171, 131, 186, 0.1)',
            borderWidth: 2,
            fill: false
          },
          {
            label: 'ATL (Fatigue)',
            data: pmcData.value.data.map((d) => d.atl),
            borderColor: 'rgb(245, 226, 59)',
            backgroundColor: 'rgba(245, 226, 59, 0.1)',
            borderWidth: 2,
            fill: false
          },
          {
            label: 'TSB (Form)',
            data: pmcData.value.data.map((d) => d.tsb),
            borderColor: 'rgb(193, 125, 55)',
            backgroundColor: 'rgba(193, 125, 55, 0.3)',
            borderWidth: 2,
            fill: 'origin'
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day' }
          },
          y: {
            title: { display: true, text: 'Training Load' }
          }
        }
      }
    })
  })
</script>
```

## Data Sources

### From Intervals.icu

Intervals.icu pre-calculates CTL/ATL/TSB for workouts:

- Already includes these values in workout data
- Use these values when available
- Store in `Workout.ctl` and `Workout.atl` fields

### For Workouts Without CTL/ATL

Calculate manually using the formulas above:

1. Determine TSS (or HRSS/TRIMP)
2. Calculate CTL using previous day's CTL
3. Calculate ATL using previous day's ATL
4. Calculate TSB as CTL - ATL

### Backfill Strategy

```typescript
// trigger/calculate-pmc-metrics.ts

export const calculatePMCMetrics = task({
  id: 'calculate-pmc-metrics',
  run: async (payload: { userId: string }) => {
    const workouts = await db.workout.findMany({
      where: { userId: payload.userId },
      orderBy: { date: 'asc' }
    })

    let ctl = 0
    let atl = 0

    for (const workout of workouts) {
      const tss = workout.tss ?? workout.hrss ?? workout.trimp ?? 0
      ctl = calculateCTL(ctl, tss)
      atl = calculateATL(atl, tss)

      await db.workout.update({
        where: { id: workout.id },
        data: { ctl, atl }
      })
    }
  }
})
```

## Best Practices

### 1. Data Quality

- Prioritize power-based TSS when available (most accurate)
- Use HRSS as fallback for heart rate data
- TRIMP as last resort for basic HR metrics

### 2. Initial CTL/ATL Values

- Start with CTL = 0, ATL = 0 for new athletes
- Or estimate based on recent training history
- Takes 6-12 weeks for CTL to stabilize

### 3. Workout Filtering

- Exclude very short activities (<15 minutes)
- Exclude activities without effort data
- Consider separate CTL/ATL for different sports (run vs bike)

### 4. Display Recommendations

- Show at least 90 days of history for meaningful trends
- Highlight zones in TSB chart (productive, cautionary, etc.)
- Include tooltips explaining each metric
- Show trend arrows for CTL/ATL changes

### 5. Training Zones

Color-code the TSB area chart:

- **Green** (TSB > +5): Fresh, ready to perform
- **Yellow** (TSB -10 to +5): Maintenance zone
- **Blue** (TSB -25 to -10): Productive training
- **Red** (TSB < -25): High fatigue, caution needed

## References

- **TrainingPeaks**: Original PMC methodology
- **Coggan, A.**: Training and Racing with a Power Meter
- **Banister, E.**: TRIMP methodology
- **Friel, J.**: The Cyclist's Training Bible
- **Intervals.icu**: Implementation reference

## Future Enhancements

1. **Multi-Sport CTL/ATL**: Separate metrics for run vs bike
2. **Ramp Rate**: Rate of CTL increase (should be <5-8 TSS/week)
3. **Chronic Ramp Rate (CRR)**: Weekly CTL change indicator
4. **Weekly TSS Goals**: Target TSS based on current fitness
5. **Fitness Decay Model**: Predict CTL decline during rest
6. **Peak Planning**: Optimize TSB for race day
7. **Zone Annotations**: Mark training blocks on PMC chart
