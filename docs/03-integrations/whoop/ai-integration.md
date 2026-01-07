# WHOOP Data Integration with AI Systems

## Overview

WHOOP recovery, sleep, and wellness data is now fully integrated into all AI-powered coaching features including workout analysis, weekly reports, and daily training recommendations.

## Data Flow

### 1. Data Collection

- **WHOOP OAuth**: User connects WHOOP account via [`/settings`](http://localhost:3099/settings)
- **Data Sync**: [`trigger/ingest-whoop.ts`](../trigger/ingest-whoop.ts) fetches:
  - Recovery data: recovery score, HRV, resting HR, SpO2
  - Sleep data: sleep hours, sleep score, sleep stages
- **Storage**: Data stored in `Wellness` table (unified wellness data from all sources)

### 2. AI System Integration

#### Today's Training Recommendations ([`trigger/recommend-today-activity.ts`](../trigger/recommend-today-activity.ts))

**WHOOP Metrics Used:**

- Recovery Score (0-100%)
- HRV (Heart Rate Variability in ms)
- Resting Heart Rate (bpm)
- Sleep Hours and Sleep Score
- SpO2 (Blood Oxygen Saturation)

**AI Decision Logic:**

- Recovery < 33%: Strong recommendation for rest
- Recovery 33-50%: Reduce intensity significantly
- Recovery 50-67%: Modify if workout is hard
- Recovery 67-80%: Proceed as planned
- Recovery > 80%: Good day for intensity

Additional factors: Low HRV, poor sleep, high recent TSS

#### Weekly Reports ([`trigger/generate-weekly-report.ts`](../trigger/generate-weekly-report.ts))

**WHOOP Metrics Used:**

- Daily recovery scores over 7-day period
- HRV trends and patterns
- Sleep quality and duration trends
- SpO2 patterns
- Subjective wellness (if available)

**AI Analysis Sections:**

1. **Training Load Analysis**: TSS distribution with recovery adequacy
2. **Recovery Trends**: HRV patterns, sleep quality relative to training stress
3. **Power Progression**: Performance improvements with recovery context
4. **Fatigue & Form**: Training stress balance (CTL/ATL) with WHOOP readiness

#### Workout Analysis ([`trigger/analyze-workout.ts`](../trigger/analyze-workout.ts))

Future enhancement: Can incorporate pre-workout recovery metrics to contextualize performance

### 3. Data Structure

**Wellness Table Schema** (stores WHOOP + Intervals.icu data):

```typescript
{
  // Recovery Metrics (WHOOP)
  recoveryScore: Int // 0-100%
  hrv: Float // HRV RMSSD in ms
  restingHr: Int // Resting heart rate in bpm
  spO2: Float // Blood oxygen %

  // Sleep Metrics (WHOOP)
  sleepHours: Float // Total sleep duration
  sleepScore: Int // Sleep performance 0-100%
  sleepSecs: Int // Sleep in seconds

  // Additional Wellness
  readiness: Int // 1-10 scale
  soreness: Int // 1-10 scale
  fatigue: Int // 1-10 scale
  stress: Int // 1-10 scale
  mood: Int // 1-10 scale

  // Training Load (Intervals.icu)
  ctl: Float // Chronic Training Load
  atl: Float // Acute Training Load
}
```

### 4. Enhanced Metrics Summary

The [`buildMetricsSummary()`](../server/utils/gemini.ts) function now provides comprehensive wellness context to AI:

```
**Date**: Recovery 75%, HRV 62ms, Resting HR 48bpm, Sleep 7.8h, Sleep Score 85%, SpO2 98%
```

This gives the AI complete visibility into:

- Cardiovascular readiness (HRV, HR)
- Recovery status (WHOOP score)
- Sleep quality and quantity
- Respiratory health (SpO2)
- Training load (CTL/ATL from Intervals.icu)

## API Endpoints Updated

1. **[`/api/metrics/today`](../server/api/metrics/today.get.ts)**: Returns today's wellness data including WHOOP metrics
2. **Data Page ([`/data`](../app/pages/data.vue))**: Displays all WHOOP recovery and sleep metrics in table format

## Key Benefits

1. **Comprehensive Recovery Assessment**: AI considers multiple recovery dimensions
2. **Sleep-Informed Training**: Sleep quality/quantity impacts workout recommendations
3. **HRV-Based Intensity Modulation**: Low HRV triggers intensity reduction
4. **Trend Analysis**: Weekly patterns in recovery inform long-term recommendations
5. **Holistic Coaching**: Combines performance (power) with recovery (WHOOP) data

## Testing the Integration

### 1. Sync WHOOP Data

- Go to [`/settings`](http://localhost:3099/settings)
- Click "Sync Now" on WHOOP integration
- Verify data appears on [`/data`](http://localhost:3099/data) page

### 2. Generate Today's Recommendation

```bash
# Trigger daily recommendation
curl -X POST http://localhost:3099/api/recommendations/today
```

Check the reasoning - it should reference WHOOP metrics like:

- "Recovery score of 65% suggests moderate readiness"
- "HRV at 58ms is within normal range"
- "7.2 hours of sleep with 82% score indicates good recovery"

### 3. Generate Weekly Report

```bash
# Trigger weekly report
curl -X POST http://localhost:3099/api/reports/generate
```

Check the "Recovery Trends" section - it should analyze:

- Week-over-week HRV patterns
- Sleep quality vs training load
- Recovery adequacy for given training stress

## Future Enhancements

1. **Strain Score Integration**: Add WHOOP daily strain to training load analysis
2. **Respiratory Rate**: Use respiratory rate trends for illness detection
3. **Skin Temperature**: Incorporate temp changes for recovery/illness insights
4. **Cycle Tracking**: For female athletes, correlate performance with menstrual cycle data
5. **Predictive Modeling**: ML models to predict optimal training days based on recovery patterns

## Migration Notes

**Breaking Change**: System now uses `Wellness` table instead of `DailyMetric` for all recovery data. The `DailyMetric` table is deprecated but remains for backward compatibility.

If you have existing data in `DailyMetric`, consider migrating it to `Wellness` or updating data sources to write to `Wellness` directly.
