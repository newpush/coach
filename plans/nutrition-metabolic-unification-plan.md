# Plan: Nutrition + Metabolic Engine Unification (Real-Time Server Computation)

## Context

Current nutrition/metabolic behavior is split across multiple places:

- Server services (`metabolicService`, `nutrition/fueling`)
- App utilities (`app/utils/nutrition-logic`, `app/utils/nutrition-absorption`, `app/utils/merging-nutrition`)
- Trigger-based background generation (`generate-fueling-plan`)

This creates drift risks, timezone inconsistency, and side effects in read APIs.

## Decision

Adopt a **single, server-side nutrition domain engine** and compute fueling timelines **on demand in real time**.  
Move away from trigger-based fueling timeline calculation as a primary path.

## Goals

1. One canonical computation path for fueling plan, energy timeline, and glycogen state.
2. Zero app-layer imports in server domain/services.
3. Read endpoints become deterministic and mostly side-effect free.
4. Unified timezone/day-boundary policy.
5. Trigger `generate-fueling-plan` removed from critical runtime path.

## Non-Goals

1. Changing training science formulas in this phase.
2. Reworking UI components beyond adapting to new API contracts.
3. Removing all background jobs (some jobs may remain for cache warmup/backfill).

## Target Architecture

## 1) Domain Package (Server-Owned)

Create a canonical domain module:

- `server/utils/nutrition-domain/`
  - `types.ts` (strict DTOs)
  - `date-context.ts` (canonical day/time helpers)
  - `workout-selection.ts` (single merged workout policy)
  - `fueling-plan.ts` (plan windows/totals)
  - `metabolic-simulation.ts` (timeline + glycogen)
  - `synthetic-intake.ts` (future/today synthesis policy)
  - `index.ts`

No imports from `app/utils/*` inside server domain.

## 2) Service Layer

- `metabolicService` becomes orchestration only:
  - fetch data
  - call domain functions
  - return typed result
- Split operations:
  - `read` path: pure computation (no DB writes)
  - `command` path: explicit persistence (`finalizeDay`, optional snapshot writes)

## 3) API Layer

Thin endpoints:

- `/api/nutrition/[id]`
- `/api/nutrition/metabolic-wave`
- `/api/nutrition/extended-wave`

All use same service entrypoints and DTOs.

## 4) Trigger Strategy

- Deprioritize/remove `generate-fueling-plan` as runtime dependency.
- Keep optional background jobs only for:
  - cache precompute (optional)
  - backfill/migration
  - end-of-day snapshotting (if required for analytics)

## High-Priority Workstreams

## A. Unify Computation on Server

1. Move computation from `app/utils/nutrition-logic.ts` and `app/utils/nutrition-absorption.ts` into server domain module.
2. Replace any endpoint/trigger imports of app utils with server-domain imports.
3. Make UI consume computed API outputs instead of recomputing.

Acceptance:

- Same input context yields same results across day view, metabolic wave, and extended wave.
- No server import from `app/utils/*` for nutrition/metabolic logic.

## B. Remove Trigger-Centric Fueling Generation

1. Stop requiring `trigger/generate-fueling-plan.ts` to produce daily fueling data.
2. Compute fueling plan on request (`GET` nutrition/metabolic endpoints), with optional short-lived caching.
3. Keep persisted `fuelingPlan` as optional snapshot, not source of truth.

Acceptance:

- User gets up-to-date plan/timeline without waiting on trigger execution.
- Endpoint behavior remains correct when trigger system is unavailable.

## C. Make Read Paths Side-Effect Safe

1. Refactor `ensureMetabolicState` into:
   - `getMetabolicStateForDate` (read-only)
   - `repairMetabolicChain` (explicit command/job)
2. Ensure GET endpoints do not mutate nutrition records by default.
3. Add guarded write mode only where explicitly requested.

Acceptance:

- GET endpoints can run with DB write disabled (except logging if explicitly enabled).
- Concurrent reads do not race to create/update daily records.

## D. Unify Timezone/Day Boundary

1. Introduce `NutritionDateContext`:
   - canonical user-local date key
   - start/end-of-day boundaries
   - safe compare helpers (`isPastLocalDay`, `isTodayLocalDay`, etc.)
2. Remove ad-hoc `toISOString().split('T')[0]` for day decisions.
3. Standardize workout and meal bucketing with the same context.

Acceptance:

- No day-shift regressions in timezone tests.
- Same day classification across APIs and service methods.

## E. Extended-Wave and Activity Sparkline Consistency

1. Make one canonical wave generator in service layer:
   - `metabolicService.getWaveRange(userId, startDate, endDate)`
   - All wave consumers call this method.
2. Align API surface:
   - Keep one endpoint for range-based wave data (or make `extended-wave` a thin alias).
   - Remove endpoint-level duplicate loops/recalculation logic.
3. Standardize output contract for all wave/chart consumers:
   - canonical `timestamp`
   - canonical user-local `dateKey` (e.g. `YYYY-MM-DD`)
   - `level`, `kcalBalance`, `carbBalance`, `fluidDeficit`, `isFuture`, `dataType`
4. Remove client-side day derivation from raw timestamps for sparkline grouping.
   - Group by server-provided `dateKey`.
5. Remove timestamp reconstruction from `HH:mm` strings in API layer.
   - Never rebuild time with `...:00Z` from presentation fields.

Acceptance:

- Activity sparkline and nutrition chart show identical values for overlapping day/time points.
- No timezone-dependent day mismatch between activity calendar wave and nutrition day chart.
- Both charts are sourced from the same service computation path and DTO shape.

## F. Synthetic Meal and Recommendation Alignment

1. Introduce canonical meal-target context in service layer:
   - `metabolicService.getMealTargetContext(userId, date, now)`
   - Includes tank level, next/active fueling window, unmet carbs, and suggested intake now.
2. Feed recommendation generation from canonical context:
   - `trigger/recommend-today-activity.ts` must include this context in prompt.
   - `meal_recommendation` should align with computed unmet window carbs and timing.
3. Keep recommendation and chart logic on one engine:
   - No separate meal-target heuristics outside metabolic service.
4. Add validation checks:
   - Recommendation carbs within target tolerance unless explicit override reason.

Acceptance:

- `meal_recommendation` remains consistent with timeline/fueling windows shown in nutrition UI.
- Recommendation logic uses canonical metabolic context instead of implicit assumptions.
- Drift between suggested meal targets and chart windows is measurable and near-zero.

Status:

- [x] Added `getMealTargetContext(...)` to metabolic service.
- [x] Wired recommendation trigger prompt to use canonical meal-target context.
- [ ] Enforce hard validation (programmatic post-check) on recommendation output tolerance.

## Migration Plan

## Phase 0: Guardrails

1. Add shared DTO schemas (Zod + inferred TS types).
2. Add golden fixtures for representative scenarios:
   - no logs
   - mixed planned/completed
   - timezone edge day
   - train-low day

## Phase 1: Extract Domain Engine

1. Port logic into `server/utils/nutrition-domain/*`.
2. Add compatibility adapters so existing endpoints can switch gradually.

## Phase 2: Switch Read APIs

1. Point nutrition/metabolic GET endpoints to new service methods.
2. Remove duplicate endpoint-level recomputation loops where service already provides output.
3. Move activity sparkline endpoint to the same wave-range service method used by extended wave.

## Phase 3: Trigger Decomposition

1. Remove `generate-fueling-plan` from request critical path.
2. Convert trigger to optional precompute/snapshot task or deprecate fully.

## Phase 4: Side-Effect Separation

1. Split read vs write methods in `metabolicService`.
2. Move chain repair/persistence to explicit command path.

## Phase 5: Cleanup

1. Delete dead imports and duplicate utility paths.
2. Remove stale fields/flows that are no longer authoritative.

## Testing Strategy

1. Unit tests for domain functions (deterministic fixtures).
2. Contract tests per endpoint:
   - day view and wave endpoints produce coherent continuity.
   - activity sparkline payload and nutrition chart payload match for same date range.
3. Concurrency tests:
   - simultaneous reads do not mutate/duplicate records.
4. Timezone regression tests:
   - UTC-midnight and local-day boundaries.

## Risks and Mitigations

1. Risk: Behavioral drift during extraction.
   - Mitigation: golden fixture tests + temporary dual-run compare logs.
2. Risk: Higher latency on real-time compute.
   - Mitigation: short-lived cache keyed by `(userId, localDate, inputVersion)`.
3. Risk: Existing UI assumes persisted fuelingPlan always exists.
   - Mitigation: API guarantees computed fallback in response contract.

## Rollout

1. Feature flag: `NUTRITION_ENGINE_V2`.
2. Internal users first, then % rollout.
3. Monitor:
   - endpoint latency p50/p95
   - day-shift error reports
   - mismatch counters between legacy/new outputs.

## Done Criteria

1. All nutrition/metabolic read endpoints use unified server engine.
2. Trigger-based fueling calculation is no longer required for correctness.
3. No app-layer imports in server nutrition/metabolic domain.
4. Read endpoints are side-effect safe by default.
5. Timezone/day handling uses a single canonical policy.
6. Activity sparkline and nutrition charts consume the same wave computation source and contracts.
