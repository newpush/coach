# Withings Integration Enhancements

## Overview

Based on an audit of the current Withings integration and the [Withings API Reference](https://developer.withings.com/api-reference/), we have identified missing components for a comprehensive ingestion process. Specifically, Sleep data and Webhook support are currently absent.

## 1. Sleep Data Ingestion

Withings provides daily sleep summaries that include total duration, sleep stages, and vitals.

### API Endpoint

- **Action**: `v2/sleep?action=getsummary`
- **Scopes**: `user.activity` (verify if `user.metrics` or a dedicated sleep scope is required for specific vitals).
- **Key Fields**: `total_sleep_time`, `lightsleepduration`, `remsleepduration`, `deepsleepduration`, `hr_average`, `sleep_score`.

### Implementation Plan

- Add `fetchWithingsSleep(integration, startDate, endDate)` to `server/utils/withings.ts`.
- Add `normalizeWithingsSleep(sleepData, userId)` to map Withings sleep series to the `Wellness` table.
- Update `trigger/ingest-withings.ts` to fetch and store sleep data alongside measures and workouts.

## 2. Webhook Support

Implementing webhooks will allow real-time updates when a user weighs in or completes a workout, reducing latency and API polling.

### API Endpoint

- **Subscription**: `notify?action=subscribe`
- **Revocation**: `notify?action=revoke`

### Webhook Endpoint

- Create `server/api/integrations/withings/webhook.post.ts`.
- It should handle different `appli` values:
  - `1`: Weight/Measures
  - `4`: Activity/Workouts
  - `16`: Sleep
- Upon receiving a notification, it should trigger the `ingest-withings` task for the specific user and a narrow time window.

### Subscription Logic

- During the OAuth callback (`server/api/integrations/withings/callback.get.ts`), after successful connection, subscribe to relevant notifications.

## 3. Data Scopes Update

Ensure the authorization URL includes all necessary scopes:

- `user.metrics` (Measures)
- `user.activity` (Workouts & Sleep)

## 4. Normalization Improvements

- Ensure `restingHr` is extracted from both `getmeas` (if heart rate type 11 is present) and `getsummary` (sleep).
- Deduplicate or merge `rawJson` correctly when multiple sources (measures, sleep) update the same `Wellness` record.

## Technical Specification

### `Wellness` Mapping

| Withings Field     | Wellness Table Column       | Notes                                |
| ------------------ | --------------------------- | ------------------------------------ |
| `total_sleep_time` | `sleepSeconds`              | From `getsummary`                    |
| `hr_average`       | `restingHr`                 | From `getsummary` (best for resting) |
| `weight`           | `weight`                    | From `getmeas`                       |
| `fat_ratio`        | `rawJson.withings.fatRatio` |                                      |

### Trigger Task Update

Modify `trigger/ingest-withings.ts`:

1. Fetch Measures.
2. Fetch Workouts.
3. Fetch Sleep Summaries.
4. Batch update `Wellness` and `Workouts`.
