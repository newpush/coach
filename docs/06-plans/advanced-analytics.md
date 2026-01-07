# Advanced Workout Analytics Implementation Plan

## Goal

Implement three advanced workout analytics features: Aerobic Decoupling (Drift), Coasting & Micro-Rest Analysis, and Surge & Fade Analysis ("Matches").

## Architecture

### 1. Server-Side Logic (`server/utils/interval-detection.ts`)

New utility functions will be added to process raw stream data:

- **`calculateAerobicDecoupling`**:
  - **Input**: Time, Power, Heart Rate arrays, optional intervals.
  - **Logic**: For intervals > 8 mins, split into two halves. Calculate Efficiency Factor (Power/HR) for each half. Drift = (EF1 - EF2) / EF1.
  - **Output**: Percentage drift per interval and/or for the whole steady-state portion.

- **`calculateCoastingStats`**:
  - **Input**: Time, Power, Cadence arrays.
  - **Logic**: Sum duration where Power < 10W or Cadence < 20rpm.
  - **Output**: Total coasting time, percentage of total time, number of coasting events.

- **`detectSurgesAndFades`**:
  - **Input**: Time, Power array, FTP.
  - **Logic**: Identify segments where Power > 120% FTP for > 5s. For each surge, calculate the average power of the _subsequent_ 30-60s to measure the "fade" or "recovery cost".
  - **Output**: Array of surge events with peak power, duration, and post-surge recovery stats.

### 2. API Integration (`server/api/workouts/[id]/intervals.get.ts`)

Update the existing endpoint to:

- Extract necessary streams (Watts, HR, Cadence).
- Call the new utility functions.
- Return the new metrics in the JSON response.

### 3. Frontend Visualization

- **`app/components/AdvancedWorkoutMetrics.vue`**: A new component to display:
  - **Drift**: A gauge or simple text showing aerobic decoupling (Green < 5%, Red > 5%).
  - **Coasting**: A progress bar showing % of time spent coasting vs. pedaling.
  - **Matches**: A timeline or list showing "burnt matches" (surges) and their intensity.
- **Integration**: Add this component to `app/pages/workouts/[id].vue` in the "Analysis" tab.

## Todo List

- [ ] Create `scripts/test-advanced-analytics.ts` to simulate data and test algorithms.
- [ ] Implement `calculateAerobicDecoupling` in `server/utils/interval-detection.ts`.
- [ ] Implement `calculateCoastingStats` in `server/utils/interval-detection.ts`.
- [ ] Implement `detectSurgesAndFades` in `server/utils/interval-detection.ts`.
- [ ] Update `server/api/workouts/[id]/intervals.get.ts` to return new metrics.
- [ ] Create `app/components/AdvancedWorkoutMetrics.vue`.
- [ ] Update `app/pages/workouts/[id].vue` to include the new component.
