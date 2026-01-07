# Frontend Refactoring Plan

## 1. Current State Analysis

### `dashboard.vue`

- **State:** Manages local state for:
  - Integration status (`intervalsConnected`)
  - Sync status (`syncingData`, `dataSyncStatus`)
  - Profile data (`profileData`, `profile`)
  - Recommendations (`todayRecommendation`, `loadingRecommendation`)
  - Scores (`profileScores`, `loadingScores`)
  - Recent activity (`recentActivity`, `loadingActivity`)
  - Modals (`showWellnessModal`, `showRecommendationModal`, `showScoreModal`)
- **API Calls:** Direct `$fetch` and `useFetch` calls for various endpoints.
- **Logic:** Mixed concerns (data fetching, transformation, UI state).
- **Repetition:** Polling logic for recommendations and sync is embedded.

### `app/pages/profile/athlete.vue`

- **State:** Manages profile generation status, polling, and display logic.
- **Repetition:** Similar polling logic for profile generation as in dashboard.

### `app/pages/reports.vue`

- **State:** Manages report generation, list fetching, and configuration modal.
- **Logic:** Report type configurations hardcoded in the component.

## 2. Pinia Store Opportunities

We should create the following stores to centralize state and logic:

### `useUserStore` (or `useProfileStore`)

- **State:** Athlete profile data, preferences.
- **Actions:** Fetch profile, update settings.
- **Getters:** `isProfileComplete`, `athleteName`.

### `useIntegrationStore`

- **State:** Status of all integrations (Intervals, etc.), last sync times.
- **Actions:** Fetch status, sync data (batch or individual), connect/disconnect.
- **Getters:** `isIntervalsConnected`, `lastSyncTime`.

### `useRecommendationStore`

- **State:** Today's recommendation, history, loading states.
- **Actions:** Fetch today's recommendation, generate new recommendation (with polling).
- **Getters:** `hasRecommendationForToday`.

### `useReportStore`

- **State:** List of reports, current report details, generation status.
- **Actions:** Fetch reports, generate report (with polling), fetch single report.

### `useActivityStore`

- **State:** Recent activities, specific activity details.
- **Actions:** Fetch recent activities.

## 3. Composable Opportunities

We should create/refactor these composables for reusable logic:

### `usePolling`

- **Purpose:** Abstract the polling logic used for long-running tasks (recommendations, reports, sync).
- **Params:** `fn` (async function), `checkFn` (condition to stop), `interval`, `maxAttempts`.

### `useFormat`

- **Purpose:** Centralize date and number formatting.
- **Functions:** `formatDate`, `formatShortDate`, `formatDuration`, `formatNumber`.

### `useScoreColor`

- **Purpose:** Centralize score color logic (used in dashboard and athlete profile).
- **Functions:** `getScoreColor`, `getTrendColor`.

### `useAsyncState` (or leverage Nuxt's `useAsyncData`/`useFetch` better)

- **Purpose:** specific wrapper if we need consistent loading/error handling patterns beyond defaults.

## 4. Refactoring Plan

### Phase 1: Foundation (Composables & Utils)

1.  Create `useFormat` composable.
2.  Create `useScoreColor` composable.
3.  Create `usePolling` composable.

### Phase 2: Stores Implementation

1.  Create `useIntegrationStore`: Migrate logic from dashboard.
2.  Create `useUserStore`: Migrate profile logic.
3.  Create `useRecommendationStore`: Migrate recommendation fetching/generation.
4.  Create `useReportStore`: Migrate report logic.

### Phase 3: Component Refactoring

1.  Refactor `dashboard.vue` to use stores.
2.  Refactor `app/pages/profile/athlete.vue` to use `useUserStore` and `usePolling`.
3.  Refactor `app/pages/reports.vue` to use `useReportStore`.

## 5. Proposed File Structure

```
app/
  composables/
    useFormat.ts
    usePolling.ts
    useScoreColor.ts
  stores/
    user.ts
    integrations.ts
    recommendations.ts
    reports.ts
    activities.ts
```
