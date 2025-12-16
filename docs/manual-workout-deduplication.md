# Manual Workout Deduplication

## Overview

While the system automatically deduplicates workouts from different sources (Intervals.icu, Strava) based on time and duration, there are edge cases where the automated logic might fail or where a user prefers to manually organize their data.

The Manual Workout Deduplication feature allows users to drag and drop one completed workout onto another in the calendar view to merge them.

## How it Works

1.  **Drag and Drop**: In the Activities Calendar view, hover over a completed workout card to see a **drag handle icon** (bars) in the top-left corner. Drag this handle to initiate the move.
2.  **Visual Feedback**: Valid drop targets (other completed workouts) are highlighted when dragging over them.
3.  **Merge Confirmation**: Dropping a workout onto another triggers a confirmation modal.
    *   **Source Workout**: The workout being dragged.
    *   **Target Workout**: The workout being dropped onto.
4.  **Processing**: Upon confirmation, the system:
    *   Marks the **Source Workout** as a duplicate (`isDuplicate: true`, `duplicateOf: <TargetID>`).
    *   Ensures the **Target Workout** is marked as primary (`isDuplicate: false`).
    *   Transfers any `plannedWorkoutId` association from the source to the target if the target doesn't already have one.

## API Endpoint

`POST /api/workouts/merge`

**Payload:**
```json
{
  "primaryWorkoutId": "uuid-of-target-workout",
  "secondaryWorkoutId": "uuid-of-source-workout"
}
```

**Logic:**
*   Verifies ownership of both workouts.
*   Updates database records in a transaction.
*   Returns success status.

## UI Components

*   **ActivityCard.vue**: Implements a dedicated drag handle with `draggable="true"` and handles drag events. Emits `merge` event.
*   **DayCell.vue**: Bubbles up the `merge` event from `ActivityCard`.
*   **activities.vue**: Listens for `merge-activity` event, shows confirmation modal, and calls the API.

## Restrictions

*   Currently restricted to **Completed** workouts only. Planned workouts cannot be merged into completed ones via this mechanism (that is handled by the completion linking logic).