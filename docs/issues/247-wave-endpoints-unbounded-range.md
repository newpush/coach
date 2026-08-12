# 247 — Metabolic Wave Endpoints Accept Unbounded Ranges (CPU/DB Amplification)

**Type:** Bug / Performance  
**Priority:** Medium  
**Area:** `nutrition` (API)  
**Status:** Fixed (CW-73)

## Description

Both wave endpoints pass user-controlled ranges straight into the day-by-day simulator
(`getWaveRange`: 97 timeline points per day, plus upfront fetches, plus the recursive
`getMetabolicStateForDate` resolver):

- `GET /api/nutrition/extended-wave?daysAhead=N` — `parseInt` with no clamp; `N=3650`
  simulates ten years.
- `GET /api/nutrition/metabolic-wave?startDate=&endDate=` — no validation of parse
  success, ordering, or span; `endDate=2100-01-01` runs ~27k day simulations in one
  request. An invalid date string produces `NaN` day math.

Any authenticated user can tie up the server with a single request.

## Affected Files

- `server/api/nutrition/extended-wave.get.ts`
- `server/api/nutrition/metabolic-wave.get.ts`
- `server/utils/services/metabolicService.ts` (`getWaveRange` defensive cap)

## Acceptance Criteria

- `daysAhead` clamped (e.g. 1–14); range endpoints validate dates and cap the span
  (e.g. ≤ 31 days), returning 400 otherwise.
- `getWaveRange` itself refuses absurd spans as defense in depth.

## Resolution (CW-73)

- `extended-wave`: `daysAhead` defaults to 3 when absent, returns 400 when it is not an integer
  (`abc`, `2.5`, repeated params), and clamps to 1–14 otherwise.
- `metabolic-wave`: `startDate`/`endDate` are parsed and validated (400 on malformed dates and on
  `endDate < startDate`), and the inclusive span is capped at **62 days**. The cap is 62 rather
  than 31 because the activities calendar legitimately requests a month padded out to whole weeks —
  up to 42 days — and a 31-day cap would have broken that view.
- `metabolicService.getWaveRange` carries its own hard limit (`MAX_WAVE_RANGE_SPAN_DAYS = 92`) plus
  invalid-date and inverted-range guards, so no caller (current or future) can get an unbounded
  span past it. `generateExtendedWave` additionally rejects a non-finite/negative `daysAhead`.
