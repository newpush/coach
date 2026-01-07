# Training Stress Metrics - Implementation Status

## Overview

Full implementation of Training Stress Metrics (TSS, CTL, ATL, TSB) for tracking fitness, fatigue, and form. The implementation follows the Performance Management Chart (PMC) methodology.

## Implemented Components

### 1. Core Calculation Service ✅

**File**: [`server/utils/training-stress.ts`](../server/utils/training-stress.ts)

**Features**:

- `calculateCTL()` - 42-day exponentially weighted moving average for fitness
- `calculateATL()` - 7-day exponentially weighted moving average for fatigue
- `calculateTSB()` - Training Stress Balance (CTL - ATL) for form
- `getStressScore()` - Prioritizes TSS > HRSS > TRIMP
- `getFormStatus()` - Returns status, color, and description based on TSB
- `getTSBColorClass()` - UI color classes for TSB values
- `calculatePMCForDateRange()` - Calculate metrics for date range
- `getInitialPMCValues()` - Get starting CTL/ATL from last workout
- `backfillPMCMetrics()` - Backfill all historical data for a user
- `getCurrentFitnessSummary()` - Get current fitness state

**Form Status Zones**:

- TSB > 25: "No Fitness" (gray) - Resting too long
- TSB > 5: "Performance" (green) - Fresh and ready to race
- TSB > -10: "Maintenance" (yellow) - Maintaining fitness
- TSB > -25: "Productive" (blue) - Optimal training zone
- TSB > -40: "Cautionary" (orange) - High fatigue risk
- TSB < -40: "Overreaching" (red) - Severe fatigue

### 2. Database Schema ✅

**File**: [`prisma/schema.prisma`](../prisma/schema.prisma)

**Workout Model Fields**:

```prisma
model Workout {
  tss      Float?  // Training Stress Score
  ctl      Float?  // Chronic Training Load (Fitness)
  atl      Float?  // Acute Training Load (Fatigue)
  trimp    Int?    // Training Impulse (alternative metric)
  // ... other fields
}
```

### 3. API Endpoints ✅

#### Calendar API (Updated)

**File**: [`server/api/calendar/index.get.ts`](../server/api/calendar/index.get.ts)

**Changes**:

- Added `ctl` and `atl` fields to completed workout responses
- These metrics are now available for all activities in the calendar view

#### PMC Endpoint (New)

**File**: [`server/api/performance/pmc.get.ts`](../server/api/performance/pmc.get.ts)

**Endpoint**: `GET /api/performance/pmc?days=90`

**Response**:

```json
{
  "data": [
    {
      "date": "2024-01-01T00:00:00.000Z",
      "ctl": 45.2,
      "atl": 38.5,
      "tsb": 6.7,
      "tss": 85
    }
  ],
  "summary": {
    "currentCTL": 45.2,
    "currentATL": 38.5,
    "currentTSB": 6.7,
    "formStatus": "Performance",
    "formColor": "green",
    "formDescription": "Fresh and ready to race; peak form",
    "lastUpdated": "2024-01-15T00:00:00.000Z"
  }
}
```

### 4. Activities Page Enhancements ✅

**File**: [`app/pages/activities.vue`](../app/pages/activities.vue)

**Weekly Summary Column**:

- Shows CTL (Chronic Training Load / Fitness)
- Shows TSB (Training Stress Balance / Form) with color coding
- Shows Form Status text (e.g., "Peak Form", "Building", "Caution")
- Color-coded based on training zone:
  - Green: Performance zone (TSB > 5)
  - Yellow: Maintenance zone (TSB -10 to 5)
  - Blue: Productive training (TSB -25 to -10)
  - Red: High fatigue (TSB < -25)

**Added Functions**:

- `getTSBColor()` - Returns appropriate color class for TSB value
- `getFormStatusText()` - Returns short status text for weekly summary

### 5. Activity Cards Enhancement ✅

**File**: [`app/components/CalendarDayCell.vue`](../app/components/CalendarDayCell.vue)

**New Display Elements**:

- CTL (Fitness) indicator in purple
- ATL (Fatigue) indicator in yellow
- TSB (Form) indicator with dynamic color
- Only shown for completed workouts with metrics
- Compact display with 9px font size
- Tooltip titles for each metric

**Added Functions**:

- `getTSBColor()` - Consistent color coding for TSB across components

### 6. Backfill Script ✅

**File**: [`scripts/backfill-training-stress.ts`](../scripts/backfill-training-stress.ts)

**Usage**:

```bash
# Backfill all users
npx tsx scripts/backfill-training-stress.ts

# Backfill specific user
npx tsx scripts/backfill-training-stress.ts [userId]
```

**Features**:

- Processes workouts chronologically to maintain accuracy
- Skips duplicates automatically
- Shows progress every 100 workouts
- Displays final CTL/ATL/TSB for each user
- Summary statistics at completion

## Visual Implementation

### Weekly Summary Display

```
Week 45
────────────
Dur      8h
Dist    120k
Load     450
CTL     67.5
TSB      +8
────────────
Peak Form
```

### Activity Card Metrics

```
Morning Run
45m | 10.2km | ❤️ 152 | ─ 65

CTL 67 | ATL 59 | TSB +8
```

### TSB Color Coding

- **Green** (TSB ≥ 5): Ready to perform
- **Yellow** (TSB -10 to 5): Maintenance
- **Blue** (TSB -25 to -10): Building fitness
- **Red** (TSB < -25): High fatigue

## Testing Checklist

### Manual Testing Steps

1. **Run Backfill Script**:

   ```bash
   npx tsx scripts/backfill-training-stress.ts
   ```

   - Verify CTL/ATL calculated for all workouts
   - Check final values make sense

2. **View Activities Page**:
   - Navigate to `/activities`
   - Check weekly summary shows CTL/TSB/Form Status
   - Verify colors match TSB zones
   - Click on activities to see detailed metrics

3. **Check Activity Cards**:
   - View individual activity cards in calendar
   - Verify CTL/ATL/TSB display for completed workouts
   - Check color coding is consistent

4. **Test PMC Endpoint**:

   ```bash
   curl http://localhost:3000/api/performance/pmc?days=90
   ```

   - Verify data structure
   - Check summary contains current metrics
   - Confirm form status is calculated correctly

5. **Verify Data Quality**:
   - Ensure TSS prioritization (TSS > HRSS > TRIMP)
   - Check CTL rises slowly (42-day time constant)
   - Verify ATL responds quickly (7-day time constant)
   - Confirm TSB = CTL - ATL

## Known Limitations

1. **Data Source Dependency**:
   - Requires TSS, HRSS, or TRIMP data to be present
   - Activities without any stress score will default to 0

2. **Initial Values**:
   - New athletes start with CTL = 0, ATL = 0
   - Takes 6-12 weeks for CTL to stabilize

3. **Sync Timing**:
   - Metrics calculated on backfill or when activities sync
   - Real-time updates require re-calculation

## Future Enhancements

1. **Multi-Sport CTL/ATL**: Separate metrics for run vs bike
2. **Ramp Rate Warnings**: Alert when CTL increases too quickly (>5-8 TSS/week)
3. **Peak Planning**: Optimize TSB for race day
4. **Weekly TSS Goals**: Target recommendations based on current fitness
5. **Fitness Decay Model**: Predict CTL decline during rest periods
6. **PMC Chart Visualization**: Add interactive chart component for performance page
7. **Training Block Annotations**: Mark training phases on PMC

## Documentation References

- **Main Documentation**: [`docs/training-stress-metrics.md`](training-stress-metrics.md)
- **Calculation Service**: [`server/utils/training-stress.ts`](../server/utils/training-stress.ts)
- **PMC Endpoint**: [`server/api/performance/pmc.get.ts`](../server/api/performance/pmc.get.ts)
- **Backfill Script**: [`scripts/backfill-training-stress.ts`](../scripts/backfill-training-stress.ts)

## Integration Points

### With Intervals.icu

- CTL/ATL values synced from Intervals when available
- Falls back to calculated values for other sources

### With Strava

- Uses power data (TSS) when available
- Falls back to HR-based calculation (HRSS)

### With Whoop

- Can use TRIMP calculation from HR data
- Integrates with recovery scores

## Maintenance

### Recalculating Metrics

If metrics become out of sync:

```bash
# Recalculate for all users
npx tsx scripts/backfill-training-stress.ts

# Recalculate for one user
npx tsx scripts/backfill-training-stress.ts [userId]
```

### Monitoring

- Check for workouts with TSS but null CTL/ATL
- Verify chronological order of calculations
- Monitor for unusually high/low values

## Success Criteria ✅

- [x] Core calculation functions implemented and tested
- [x] Database schema supports CTL/ATL storage
- [x] Calendar API returns training stress metrics
- [x] PMC endpoint provides historical data
- [x] Activities page displays weekly metrics
- [x] Activity cards show individual metrics
- [x] Form status with color coding implemented
- [x] Backfill script for historical data
- [x] Documentation complete

## Status: **COMPLETE** ✅

All training stress metrics are now fully implemented and visible in the Activities page. Users can see their fitness progression, fatigue levels, and current form status at a glance.
