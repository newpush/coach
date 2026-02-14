# Nutrition Recommendation and Planning Architecture

Status: Draft (living document)  
Owner: Product + Engineering  
Last Updated: 2026-02-13

## 1. Purpose

Define the target architecture for:

- meal recommendations (single window and day-level)
- nutrition planning (what to eat and when, ahead of time)
- grocery list generation from planned meals
- shared use across `/nutrition` UI and `/chat`
- consistent LLM orchestration via Trigger.dev + Gemini

This document is intended to be continuously updated during implementation.

## 2. Current State Summary

### 2.1 What exists today

- **Unified Metabolic Engine**: Canonical fueling windows and macro targets are generated in real-time by the server's domain module.
- **Deterministic APIs**: `/api/nutrition` returns pre-computed energy points and glycogen states.
- **AI Recommendation Alignment**: `recommend-today-activity` trigger now pulls from the canonical meal-target context.
- User nutrition constraints are stored in `UserNutritionSettings`.

### 2.2 Gaps identified

- The current "AI helper" modal is a logger flow, not a recommendation planner flow.
- Modal close behavior is broken due to split open state ownership (parent + local child state).
- Meal recommendations are not yet centrally generated with hard constraint enforcement.
- Grocery "export" is currently heuristic/static, not derived from planned meals.
- Chat and `/nutrition` do not share a single recommendation service layer.

## 3. Product Goals

1. Recommend meals per fueling window with exact portions and macros.
2. Let users build and manage a day/week nutrition plan from those recommendations.
3. Respect nutrition constraints as non-negotiable safety rules.
4. Generate grocery lists from accepted/planned meals.
5. Use the same backend logic for `/nutrition` and `/chat`.
6. Keep orchestration consistent with existing Trigger.dev patterns.

## 4. Core Design Decision

Adopt a 4-layer nutrition decision model:

1. **Targets**: metabolic engine outputs window-specific macro demand.
2. **Recommendations**: candidate meals generated and ranked for each target.
3. **Plan**: user-selected planned meal for each window/time.
4. **Execution**: logged intake mapped against plan/targets for compliance.

This separation avoids mixing "planned" and "logged" concerns.

## 5. Proposed Architecture

### 5.1 Shared service (single source of truth)

Create:

- `server/utils/services/mealRecommendationService.ts`

Responsibilities:

- resolve target context from metabolic engine
- pull user constraints and preference profile
- build structured Gemini prompt payloads
- run post-generation validation/filtering/ranking
- return normalized recommendation objects

All entry points (`/nutrition` endpoints, chat tools, triggers) call this service.

### 5.2 Trigger orchestration

Create Trigger tasks:

- `recommend-nutrition-meal` (single window)
- `recommend-nutrition-day` (multi-window/day)
- `generate-nutrition-plan` (day/week plan generation)
- `replan-nutrition-window` (partial updates)

Rationale:

- consistent with existing app pattern
- resilient retries + status tracking
- shared monitor/polling UX
- stable behavior across UI and chat

### 5.3 API surface

Initial endpoints:

- `POST /api/nutrition/recommendations/meal`
- `POST /api/nutrition/recommendations/day`
- `GET /api/nutrition/recommendations/:id`
- `POST /api/nutrition/plans/generate`
- `GET /api/nutrition/plans/:id`
- `PATCH /api/nutrition/plans/:id/meals/:mealId` (accept/swap/edit/status)
- `GET /api/nutrition/plans/:id/grocery-list`

### 5.4 Chat tools (same core logic)

Add tools in `server/utils/ai-tools/nutrition.ts`:

- `recommend_nutrition_meal`
- `recommend_nutrition_day`
- `create_nutrition_plan`
- `show_nutrition_plan`
- `swap_planned_meal`
- `complete_planned_meal`
- `export_grocery_list`

Tools should return either:

- `status=ready` with payload
- `status=pending` with `runId` + follow-up fetch path

## 6. Data Model Proposal

### 6.1 New entities (minimum)

`NutritionRecommendation`:

- `id`, `userId`, `date`, `scope` (`MEAL|DAY`)
- `windowType` (nullable for day scope)
- `status` (`PENDING|PROCESSING|COMPLETED|FAILED`)
- `contextJson` (target + constraints snapshot)
- `resultJson` (recommendation options)
- `runId`
- `createdAt`, `updatedAt`

`NutritionPlan`:

- `id`, `userId`, `startDate`, `endDate`
- `status` (`DRAFT|ACTIVE|LOCKED|COMPLETED`)
- `sourceRecommendationId` (nullable)
- `summaryJson`
- `createdAt`, `updatedAt`

`NutritionPlanMeal`:

- `id`, `planId`, `date`, `windowType`, `scheduledAt`
- `status` (`PLANNED|DONE|SKIPPED|REPLACED`)
- `targetJson` (macro target snapshot)
- `mealJson` (selected option, ingredients, portions, absorption type)
- `actualNutritionItemId` (nullable link to logged item)
- `createdAt`, `updatedAt`

### 6.2 Constraint policy

Hard-block ingredients matching:

- `foodAllergies`
- `foodIntolerances`
- `lifestyleExclusions`

Preference/ranking modifiers:

- `dietaryProfile`
- prep time limit
- meal timing suitability (pre/intra/post/base)

## 7. Recommendation Pipeline

1. Resolve user/date/window context.
2. Fetch canonical target from metabolic engine (do not duplicate calculations).
3. Run `Load Balancer` to split oversized targets into human-digestible portions.
   - Example policy:
     - cap per sitting carbs (default `2.0g/kg`, tunable)
     - split into multiple meal/snack options across nearby slots
     - preserve total target across the window/day
4. Fetch constraints/settings and hydration state.
   - include `fluidDeficit` and hydration ring status in context
   - if deficit exceeds threshold (default 1.5L), attach hydration nudge metadata
5. Call selector (catalog-first) or Gemini fallback (on miss only).
6. Validate schema/output.
7. Hard-filter prohibited options.
8. Score/rank remaining options.
9. Persist recommendation snapshot.
10. Return response or pending status.

## 8. Nutrition Plan Pipeline

1. Generate day/week candidate recommendations by window.
2. Auto-select top options to produce initial draft plan.
3. Enforce capping/smoothing so no single planned meal exceeds per-sitting carb cap.
4. Allow per-window swap/edit/lock.
5. Persist immutable snapshots of target + selected meal.
6. Aggregate ingredients into grocery list by selected range.
7. During logging, attempt to match logged intake to planned meals.
8. Compute plan adherence and show deltas.

## 9. Grocery List Strategy

Input source: `NutritionPlanMeal.mealJson.ingredients` for planned/accepted meals only.

Output:

- grouped ingredients (produce, grains, dairy alternatives, etc.)
- normalized quantities and units
- date range scoped (24h/48h/7d/custom)
- export formats: in-app copy + JSON + CSV

## 10. UI Implications

1. Split "AI Logger" and "Meal Recommendation" into separate modals/components.
2. Fix modal state ownership:
   - a single source of truth (`v-model:open`) with no shadow local open state.
3. Add plan-centric screens/components:
   - day/week plan view
   - per-window meal picker/swap
   - grocery list view from plan data
4. Show "planned vs logged vs target" indicators.

### 10.1 Current UI inventory (to preserve where useful)

Primary pages:

- `/Users/hdkiller/Develop/coach-wattz/app/pages/nutrition/index.vue`
  - strategic overview (metabolic horizon, active feed, upcoming windows, grocery modal, AI helper trigger)
- `/Users/hdkiller/Develop/coach-wattz/app/pages/nutrition/[id].vue`
  - day detail (fueling timeline, energy chart, log/edit items, notes)

Current nutrition components:

- `/Users/hdkiller/Develop/coach-wattz/app/components/nutrition/ActiveFuelingFeed.vue`
  - "next target" + AI suggestion card + quick action CTA
- `/Users/hdkiller/Develop/coach-wattz/app/components/nutrition/UpcomingFuelingFeed.vue`
  - tabular future windows with per-row suggest action + export action
- `/Users/hdkiller/Develop/coach-wattz/app/components/nutrition/FoodAiModal.vue`
  - AI logging modal (parse consumed food)
- `/Users/hdkiller/Develop/coach-wattz/app/components/nutrition/FoodItemModal.vue`
  - manual add/edit/delete meal item
- `/Users/hdkiller/Develop/coach-wattz/app/components/nutrition/FuelingTimeline.vue`
  - timeline rendering on day detail

### 10.2 Proposed UI component map

New components (planned):

1. `NutritionMealRecommendationModal`

- Purpose: show 3-5 recommendation options for one window.
- Inputs: `date`, `windowType`, `target`, `contextSource`.
- Actions:
  - `Accept as planned meal`
  - `Swap option`
  - `Ask chat refinement` (optional)
- Output events:
  - `planned`
  - `rejected`
  - `retry`
- UX rules:
  - show active constraint chips and which constraints were applied
  - when user clicks `Swap`, prefer alternatives with same absorption profile first
  - highlight safe substitutions explicitly (e.g., dairy-free alternatives)

2. `NutritionPlanBoard`

- Purpose: day/week planning surface grouped by date and window.
- Displays:
  - target macros
  - selected planned meal
  - status chip (`PLANNED|DONE|SKIPPED|REPLACED`)
  - variance badge once logging exists
- Actions:
  - plan all / replan window / lock day / unlock day

3. `NutritionPlanMealCard`

- Purpose: single planned meal card (window-level).
- Shows:
  - scheduled time
  - meal name + ingredients summary
  - planned macros
  - substitutions
  - prep time
- Actions:
  - mark done
  - replace
  - open in logger prefilled

4. `NutritionGroceryListPanel`

- Purpose: derive and show grocery list from selected plan meals.
- Features:
  - date range selector
  - grouped ingredients
  - normalized quantities
  - export buttons (copy/CSV/JSON)

### 10.3 UI states and loading model

For recommendation and planning views, standardize states:

1. `idle` - no request yet.
2. `loading` - trigger started / pending response.
3. `ready` - structured recommendations received.
4. `empty` - no feasible option after filters.
5. `error` - schema/LLM/runtime error.

Display behavior:

- `loading`: skeleton rows + run status badge.
- `ready`: ranked options with reasons + actions.
- `empty`: clear reason ("No valid options under current constraints").
- `error`: retry with diagnostic message ID.

### 10.4 Interaction flows

Flow A - From Upcoming Window row to planned meal:

1. User clicks "Suggest" in upcoming table.
2. `NutritionMealRecommendationModal` opens.
3. Recommendations fetched via trigger-backed API.
4. User accepts one option.
5. Plan card updates in-place; grocery projection refreshes.

Flow B - From Chat recommendation to plan:

1. Chat tool generates recommendation via shared service.
2. User confirms in chat ("Use this for pre-workout").
3. Backend writes `NutritionPlanMeal`.
4. `/nutrition` plan board reflects the same change.

Flow C - Logging against plan:

1. User logs meal (manual or AI logger).
2. Backend attempts match to planned meal by date/window/time.
3. Planned meal status becomes `DONE` (or partial mismatch).
4. UI shows variance from target and from planned item.

### 10.5 Modal/state rules (must-follow)

1. Modal open state is controlled by parent `v-model:open`.
2. Child component must emit model updates rather than maintaining a conflicting local `isOpen`.
3. Logging modal and recommendation modal must never share the same open state or business flow.
4. Recommendation modal should not post to logging endpoint.

### 10.6 UX constraints and guardrails

1. Allergies/intolerances/exclusions must be visible in recommendation UI as active constraint chips.
2. If a recommendation is excluded by constraints, show reason on hover/expand.
3. Time sensitivity must be explicit:
   - "Eat now"
   - "In ~45 min"
   - "Post-workout within 60 min"
4. Grocery list must only include accepted/planned meals by default (optionally include candidates with toggle).
5. If hydration debt is high, recommendation cards should include hydration nudge text and suggested volume.

## 11. Rollout Phases

### Phase 0 - Synthetic Bootstrap [COMPLETED]

- [x] Build `syntheticNutritionPlanGenerator` for next 72h placeholders
- [x] Implement target capping logic for synthetic meals (no oversized single sitting)
- [x] Map synthetic placeholders to `NutritionPlanBoard` so UI is usable before full catalog integration

### Phase 1 - Foundation [COMPLETED]

- [x] Fix nutrition modal state ownership bug
- [x] Add `mealRecommendationService`
- [x] Add Trigger task `recommend-nutrition-meal`
- [x] Add meal recommendation endpoint + result endpoint

### Phase 2 - Shared Consumption [IN PROGRESS]

- [ ] Integrate recommendations in `/nutrition`
- [ ] Add chat nutrition recommendation tools
- [ ] Ensure both use the same service + trigger contract

### Phase 3 - Planning

- [ ] Add `NutritionPlan` + `NutritionPlanMeal` schema
- [ ] Add plan generation trigger/API
- [ ] Add accept/swap/complete meal actions

### Phase 4 - Grocery + Compliance

- [ ] Grocery export from planned meals
- [ ] Plan-vs-log matching
- [ ] Adherence analytics and UI

## 12. Open Questions

1. Should plan generation default to 24h, 48h, or 7 days?
2. Should "hard block" include dietary profile, or only allergies/intolerances/exclusions?
3. Do we need pantry-aware recommendations in v1?
4. Should recommendation generation run automatically on workout changes, or only on demand?
5. Do we allow manual custom meals in plan without an AI recommendation source?

## 13. Maintenance Protocol

When updating this document:

1. Update `Last Updated` date.
2. Move decisions from "Open Questions" into fixed sections.
3. Check/uncheck rollout items based on shipped code.
4. Add migration/API references once implemented.
5. Keep this doc aligned with `docs/INDEX.md` links.

## 14. Pre-Generated Personalized Advice (Dashboard + Day View)

### 14.1 Problem statement

Current UI still contains generic fallback advice text in key surfaces:

- `/Users/hdkiller/Develop/coach-wattz/app/components/nutrition/WindowBlock.vue`
  - `recommendationText` is heuristic/hardcoded by carb thresholds.
- `/Users/hdkiller/Develop/coach-wattz/app/components/dashboard/NutritionFuelingCard.vue`
  - "AI Nutrition Advice" can fall back to non-personalized messaging paths.
- `/Users/hdkiller/Develop/coach-wattz/app/components/nutrition/ActiveFuelingFeed.vue`
  - may render `suggestedIntake` text when no specific itemized recommendation exists.

Goal: replace these with pre-generated, user-tailored options per active/upcoming window.

### 14.2 Product behavior target

For each relevant fueling window, UI should show:

1. top 2-3 personalized meal options (not one generic line)
2. exact portions + macro totals per option
3. constraint-safe substitutions
4. timing string tied to the specific window
5. source freshness metadata (`generatedAt`, `contextVersion`)

### 14.3 Where recommendations should be pre-generated

1. Dashboard card(s):

- today active/next window
- next significant window (optional secondary suggestion)

2. `/nutrition/:date` timeline:

- each non-completed window that has unmet target

3. `/nutrition` upcoming plan table:

- upcoming windows (next 24-72h depending on quota mode)

### 14.4 Generation strategy (token-optimized)

Use **catalog-first selection** with **LLM-on-miss fallback**.

#### 14.4.1 Catalog-first mode (default)

1. Build and maintain a reusable structured `MealOptionCatalog`.
2. At runtime, select and scale options deterministically from the catalog.
3. Do not call Gemini for each fueling-plan change.
4. Keep recommendations personalized via:
   - target macro fitting
   - timing/window type
   - user constraints and preferences
   - variety rotation

#### 14.4.2 LLM-on-miss fallback

Call Gemini only when deterministic selection fails, e.g.:

1. fewer than minimum valid options remain (e.g. < 2)
2. all options filtered out by hard constraints
3. explicit user request for fresh/new ideas beyond current catalog

Any LLM-generated option should be normalized and persisted into catalog/cache for reuse.

#### 14.4.3 Trigger policy

1. Keep trigger tasks for orchestration consistency.
2. But trigger execution should:
   - first run deterministic catalog selector
   - invoke Gemini only on miss
3. Remove policy of "always trigger/generate after every fueling plan change."

#### 14.4.4 Pre-generation schedule

1. Batch catalog enrichment jobs:
   - nightly `build-nutrition-option-catalog`
   - optional weekly diversity expansion
2. Lightweight pre-warm job (optional):
   - precompute nearest 24-48h window suggestions from catalog
   - no LLM unless misses occur

#### 14.4.5 Staleness rules (snapshot layer)

Recommendation snapshot is stale when:

1. target macros materially change bucket (not every small delta)
2. window timing/type changes
3. constraints signature changes
4. logged intake changes unmet target bucket

### 14.5 Data contract for window-level pre-generated options

Store in `NutritionRecommendation.resultJson` (window scope):

- `windowKey`
- `date`
- `windowType`
- `target` (`carbs`, `protein`, `fat`)
- `hydrationContext` (`fluidDeficitMl`, `hydrationStatus`, `nudgeText?`)
- `options[]`:
  - `title`
  - `items[]` (ingredient + quantity + unit)
  - `totals` (kcal, carbs, protein, fat)
  - `prepMinutes`
  - `timing`
  - `absorptionType`
  - `substitutions[]`
  - `constraintNotes[]`
- `generatedAt`
- `contextHash`

### 14.6 UI migration plan for these surfaces

1. `WindowBlock.vue`

- remove hardcoded `recommendationText` heuristic block
- consume pre-generated `options` from recommendation store/API
- display top option inline; "view alternatives" opens recommendation modal

2. `NutritionFuelingCard.vue` (dashboard)

- render pre-generated option cards for active/next window
- fallback order:
  - personalized options -> target-only guidance -> loading placeholder
- no static food text in final state

3. `ActiveFuelingFeed.vue`

- keep `suggestedIntake` as numeric target context
- attach personalized option list beneath numeric target when available

### 14.7 Operational and quota considerations

1. Pre-generate only nearest windows by default (e.g. 24-48h) to control cost.
2. Expand horizon on explicit user request ("plan whole week").
3. Add dedupe key: `userId + windowKey + contextHash` to prevent duplicate generations.
4. Add coarse selector cache key for reuse:
   - `windowType + carbBucket + absorptionBucket + dietaryBucket + constraintsHash`
5. Record LLM usage metadata and selector hit-rate metrics:
   - deterministic hit
   - LLM miss
   - average options returned
6. Target KPI: >80% requests served without LLM calls after warmup.

### 14.9 Catalog-first selection algorithm (v1)

For each window request:

1. Resolve `windowTarget` and `context`:
   - target macros
   - window type/time gap
   - hydration context
   - constraints signature
2. Build candidate set from catalog using coarse cache key.
3. Hard-filter disallowed candidates.
4. Portion-scaling pass:
   - solve serving multiplier `m` for carbs target first
   - clamp `m` by per-sitting cap policy
   - recompute protein/fat/kcal deltas
5. If cap exceeded:
   - split across additional snack/adjacent slot options using load balancer
   - ensure sum of split options approximates total target
6. Score each candidate:
   - macro fit score
   - timing/absorption fit score
   - prep/complexity score
   - variety/rotation penalty
7. Return top N options and substitutions.
8. If fewer than minimum valid options:
   - invoke Gemini fallback
   - normalize/store output into catalog for reuse.

### 14.10 Deterministic Portion Scaler Specification

Goal: fulfill window macro targets from catalog templates without an LLM call.

Input contract:

- `targetMacros`: `{ carbs, protein, fat }`
- `windowType`: `PRE | INTRA | POST | BASE`
- `userConstraints`: `{ allergies: string[], exclusions: string[], intolerances?: string[] }`
- `athleteContext`: `{ weightKg }`

Processing steps:

1. Search candidates in `MealOptionCatalog` by `windowType` and compatibility tags.
2. Apply hard filters:
   - remove any candidate matching allergies/exclusions/intolerances.
3. Compute scale factor using primary carb basis:
   - `scaleFactor = targetCarbs / template.baseCarbs`
4. Reject unbalanced scales:
   - discard if `scaleFactor > 2.5` or `scaleFactor < 0.4`.
5. Scale all ingredient quantities by `scaleFactor`.
6. Recompute scaled totals (`carbs/protein/fat/kcal`).
7. Enforce per-sitting carb cap (default `2.0g/kg` body weight):
   - `carbCap = 2.0 * weightKg`
   - if scaled carbs exceed cap:
     - clamp serving to cap
     - compute remainder as `postWorkoutDebtCarbs` (or nearest-slot debt)
     - mark option as `splitRequired`.
8. Rank remaining options by fit and timing.
9. Return top options or `MISS`.

Result contract (deterministic mode):

- `status: "READY" | "MISS"`
- `options[]` with:
  - scaled ingredients
  - scaled totals
  - `scaleFactor`
  - `splitRequired`
  - `postWorkoutDebtCarbs` (if any)
- `meta` with:
  - `selectorVersion`
  - `capApplied` boolean
  - `reasonCodes[]`

Fallback contract:

- if `< 2` valid options remain after scaling/filtering:
  - return `status: "MISS"`
  - orchestration layer triggers `recommend-nutrition-meal` Gemini task.

### 14.11 Meal Slot Naming Rules (UI label replacement)

To replace generic `Daily Base` labels with user-friendly slots:

1. `05:00-10:00` -> `Breakfast` (icon: `coffee` or `sun`)
2. `11:00-14:30` -> `Lunch` (icon: `utensils`)
3. `15:00-17:30` -> `Afternoon Snack` (icon: `cookie`)
4. `18:00-22:00` -> `Dinner` (icon: `moon`)

Notes:

- slot mapping should use user timezone.
- if outside ranges, fallback to `Snack` with neutral icon.
- slot name should be carried in recommendation/plan payload for consistent rendering across dashboard, `/nutrition`, and chat summaries.

### 14.12 Catalog Enrichment Prompt (Gemini)

Use this prompt for batch seeding of `MealOptionCatalog` (offline/batch job), not per-user runtime:

```markdown
# Role: Elite Sports Performance Nutritionist

## Objective:

Generate a structured JSON catalog of 50 unique "Reference Meal" templates. These will be used to scale portions for endurance athletes based on metabolic window demands.

## Data Constraints:

1. **Window Suitability**: Categorize each meal as (PRE | INTRA | POST | BASE).
2. **Standard Units**: All ingredients MUST use grams (g) or milliliters (ml) as the base unit for scaling.
3. **Macro Profiling**:
   - PRE-WORKOUT: High-glycemic carbs, low fiber (<5g), low fat (<10g).
   - INTRA-WORKOUT: Rapid-absorption liquids/gels (glucose/fructose focus).
   - POST-WORKOUT: 3:1 or 4:1 Carb-to-Protein ratio.
   - DAILY BASE: Complex carbs, high fiber, high protein.

## JSON Schema per Meal:

{
"title": string,
"windowType": "PRE" | "INTRA" | "POST" | "BASE",
"absorptionType": "RAPID" | "BALANCED" | "COMPLEX",
"dietaryBuckets": ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
"baseMacros": { "carbs": number, "protein": number, "fat": number, "kcal": number },
"keyIngredient": string, (The primary carb source for scaling)
"ingredients": [
{ "item": string, "quantity": number, "unit": "g" | "ml", "isScalable": boolean }
],
"prepMinutes": number,
"constraintTags": string[] (e.g., "low-fodmap", "no-nuts")
}

## Diversity Requirement:

Generate a mix of cultural cuisines (Mediterranean, Asian, Western) and varying prep times (5-min snacks to 30-min dinners).
```

### 14.13 Catalog Seeding Validation (must-pass checks)

Before inserting generated templates:

1. Key ingredient existence:
   - `keyIngredient` must be present in `ingredients[]`.
2. Macro consistency:
   - ingredient-derived macro sum must match `baseMacros` within ±5%.
3. Window suitability guard:
   - PRE templates must remain low-fiber/low-fat after validation.
4. Scaling smoke test:
   - scale each template to representative targets (e.g., 40g, 80g, 120g carbs).
   - reject or reclassify options that become impractical in portion volume.
5. Constraint tag integrity:
   - dietary buckets and constraint tags must align with ingredients.
6. Unit normalization:
   - all quantities stored as `g` or `ml` with normalized numeric precision.

### 14.14 Catalog Enrichment Operational Flow

1. Run enrichment prompt in batch job.
2. Validate candidates using checks above.
3. Insert only passed templates into `MealOptionCatalog`.
4. Log rejects with reason codes for prompt tuning.
5. Re-run enrichment on low-coverage buckets discovered by selector miss telemetry.

### 14.8 Acceptance criteria

1. No generic hardcoded food text shown in dashboard/day timeline when recommendation data exists.
2. At least 2 personalized options returned for eligible windows.
3. All shown options comply with user constraints.
4. UI updates after plan/settings/workout changes without manual refresh.
5. Chat and UI return the same options for the same `windowKey/contextHash`.
6. LLM calls are avoided for most requests via catalog-first mode (target >80% no-LLM serve rate).
