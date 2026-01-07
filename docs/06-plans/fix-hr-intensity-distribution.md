# Plan: Fix HR Zones in Intensity Distribution

## Analysis

The "Intensity Distribution" chart on the `/performance` page is not showing HR zones correctly. This is driven by the `WeeklyZoneChart.vue` component, which fetches data from `/api/analytics/weekly-zones`.

### Root Cause

In `server/api/analytics/weekly-zones.get.ts`:

1. During workout aggregation (looping through workouts):
   - It fetches `lthr` using `userRepository.getLthrForDate(userId, workout.date)`.
   - `userRepository.getLthrForDate` returns `Math.round(user.maxHr * 0.9)` if `maxHr` is available.
   - `calculateHrZones(lthr, user.maxHr)` is called with this `lthr`.
   - `calculateHrZones` returns **7 zones** (Friel model) if `lthr` is provided.

2. In the final response payload (for labels):
   - It calls `calculateHrZones(null, user.maxHr || 190)`.
   - Because `lthr` is `null`, `calculateHrZones` falls back to the Max HR model, which returns **5 zones**.

This mismatch causes the frontend to receive labels for 5 zones but potentially data for 7 zones (or vice versa, or just inconsistent indexing). The frontend `WeeklyZoneChart.vue` also has a fixed `zoneColors` array of 7 colors and logic to slice labels based on color length, which might be further complicating things if the data array length doesn't match.

## Proposed Fix

1. **Harmonize backend labels**: Update `server/api/analytics/weekly-zones.get.ts` to use a consistent `lthr` for label generation, matching the logic used during aggregation.
2. **Improve robustness in frontend**: Ensure `WeeklyZoneChart.vue` handles cases where the number of zones returned doesn't match its internal color palette or expected counts.

## Step-by-Step Implementation Plan

1. Modify `server/api/analytics/weekly-zones.get.ts`:
   - Calculate a "reference" `lthr` for the labels part of the response using the same logic as the repository (or call the repository for the current date).
2. Modify `app/components/WeeklyZoneChart.vue`:
   - Ensure `activeLabels` and `chartData` logic are resilient to the number of zones returned.
   - Align `zoneColors` to be appropriate for either 5 or 7 zones.
3. Verify the fix by checking the `/performance` page and toggling between Power and HR.
