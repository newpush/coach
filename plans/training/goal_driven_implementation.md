# Goal-Driven Training System Implementation Plan

This document outlines the step-by-step implementation plan for the "Goal-Driven Training System" based on the architecture research.

## Phase 1: Database Schema & Core Models ✅

**Status:** Completed.

- Models `TrainingPlan`, `TrainingBlock`, `TrainingWeek` added.
- `PlannedWorkout` updated.

## Phase 2: Plan Wizard & Onboarding (Frontend) ✅

**Status:** Completed.

- `PlanWizard.vue` implemented.
- `/api/plans/initialize` implemented.
- `/plan` page refactored to use new dashboard.

## Phase 3: AI Generation Logic (Backend/Trigger.dev) ✅

**Status:** Completed.

- `generate-training-block` task implemented (generates daily workouts from block context).
- `generate-structured-workout` task implemented (generates granular JSON).
- `initialize.post.ts` updated to trigger generation.

## Phase 4: Interactive Plan UI (Frontend) ✅

**Status:** Completed.

- `PlanDashboard.vue` visualizes blocks and weeks.
- Block navigation implemented.

## Phase 5: Dynamic Adaptation & Sync 🚧

**Status:** In Progress.

- **Adaptation UI:** "Adapt Plan" button added to dashboard.
- **Logic:** `adapt-training-plan` skeleton created. Needs detailed prompts for "Push/Recalculate" logic.

## Phase 6: Manual Workout Matching ✅

**Status:** Completed.

- `WorkoutMatcher.vue` component created.
- Integration into `/activities` page via "Link Workouts" button.
- Backend endpoint `/api/workouts/[id]/link` created.

---

## Technical Dependencies

- `zod`: For validating AI-generated JSON schemas.
- `@vueuse/core`: For UI interactions.
- `chart.js`: For rendering workout graphs (future).

## Next Steps

1.  Flesh out the `adapt-training-plan` logic with Gemini calls.
2.  Implement the UI for the Adaptation Wizard (connecting the button to the API).
