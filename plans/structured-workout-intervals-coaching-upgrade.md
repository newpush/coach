# Structured Workout + Intervals.icu + Coaching Quality Upgrade Plan

## 1. Objective

Upgrade structured workout generation and Intervals.icu export so that:

1. Exported workouts parse reliably in Intervals.icu.
2. Workout prompts and schemas produce higher-quality, sport-specific coaching prescriptions.
3. Weekly/block planning logic reflects modern endurance coaching principles, not only scheduling constraints.

## 2. Scope

In scope:

- Structured workout generation and adjustment triggers.
- Ad-hoc workout generation trigger.
- Weekly plan and training block prompt quality.
- Intervals.icu text formatter and export reliability.
- Contract tests and validation tooling for formatter + prompts.

Out of scope:

- UI redesign.
- New integrations/providers.
- Full physiological modeling engine rewrite.

## 3. Principles (State Of The Art Coaching)

All generated workouts and plans should satisfy:

1. Clear physiological intent per session (aerobic, threshold, VO2, neuromuscular, recovery).
2. Intentional intensity distribution (easy/hard balance, appropriate sequencing).
3. Fatigue-aware progression and deload logic (not blind linear overload).
4. Event-goal specificity and phase-appropriate workouts.
5. Explicit execution cues and success criteria for athletes.

## 4. Workstreams And Task List

## A) Intervals.icu Export Contract (P0)

Files:

- `server/utils/workout-converter.ts`
- `server/utils/workout-converter.test.ts`

Tasks:

- [ ] Define a canonical Intervals export contract for step lines.
- [ ] Preserve target unit semantics from source data (no forced implicit conversion).
- [ ] Standardize duration and distance token formatting for parser safety.
- [ ] Ensure deterministic handling for repeats (`Nx`) and ramps (`ramp`).
- [ ] Ensure rest steps remain parse-valid with explicit targets when needed.
- [ ] Keep label-first output compatibility where parser-safe.
- [ ] Remove nonstandard unit tokens that can break parser behavior.

Acceptance criteria:

- Intervals parser-compatible syntax for power/HR/pace/cadence and repeat/ramp structures.
- No ambiguous or lossy target transformations.
- All formatter contract tests pass.

## B) Structured Workout Schema + Normalization Hardening (P0)

Files:

- `trigger/generate-structured-workout.ts`
- `trigger/adjust-structured-workout.ts`

Tasks:

- [ ] Extend workout target schema to support explicit unit metadata across power/HR/pace.
- [ ] Unify post-generation normalization logic between generate and adjust triggers.
- [ ] Guarantee each non-rest step has at least one valid intensity target object.
- [ ] Guarantee cadence defaults/validation are consistent by sport and step type.
- [ ] Guarantee repeat/nested step inheritance rules are explicit and deterministic.
- [ ] Add strict cleanup for malformed AI output fields.

Acceptance criteria:

- Generate and adjust paths output equivalent structural quality.
- No missing critical target fields after normalization.
- Reduced malformed structured-workout records in logs/debug tooling.

## C) Prompt Upgrade: Structured Workout Generation (P0)

File:

- `trigger/generate-structured-workout.ts`

Tasks:

- [ ] Rewrite prompt to require session objective and block-level intent.
- [ ] Enforce step intent mapping (what each block trains and why).
- [ ] Add guardrails for intensity progression and rest-work ratio.
- [ ] Add explicit sport-specific constraints (ride/run/swim/gym) with metric-priority behavior.
- [ ] Require execution cues and concise athlete-facing success criteria.
- [ ] Require target object validity independent of textual description.

Acceptance criteria:

- Output includes clear purpose and internally coherent step progression.
- Fewer generic or contradictory sessions.
- Better consistency with athlete profile and active goal context.

## D) Prompt Upgrade: Structured Workout Adjustment (P0)

File:

- `trigger/adjust-structured-workout.ts`

Tasks:

- [ ] Bring prompt feature parity with generation prompt quality constraints.
- [ ] Preserve original workout objective unless user feedback explicitly changes it.
- [ ] Require explicit explanation of what changed and why.
- [ ] Require adaptation strategy by adjustment type (duration/intensity/feedback).
- [ ] Apply same metric-priority and unit constraints as generation.

Acceptance criteria:

- Adjusted workouts remain physiologically coherent and goal-aligned.
- No quality regression compared with first-pass generation.

## E) Prompt Upgrade: Ad-Hoc Workout Prescription (P1)

File:

- `trigger/generate-ad-hoc-workout.ts`

Tasks:

- [ ] Upgrade from basic suggestion prompt to context-aware prescription prompt.
- [ ] Add fatigue/recovery guardrails and contraindication handling.
- [ ] Enforce minimal effective dose behavior for low-readiness days.
- [ ] Tie rationale to event timeline and recent load context.
- [ ] Improve output requirements to prevent generic titles/descriptions.

Acceptance criteria:

- Ad-hoc sessions feel individualized and safe.
- Recovery-constrained days avoid excessive stimulus.

## F) Prompt Upgrade: Weekly Plan (P1)

File:

- `trigger/generate-weekly-plan.ts`

Tasks:

- [ ] Remove cycling-only framing and enforce multi-sport-neutral coach framing.
- [ ] Add explicit weekly intensity distribution constraints.
- [ ] Add sequencing constraints (hard-day spacing, long-session placement).
- [ ] Add explicit deload behavior when readiness/load trends suggest risk.
- [ ] Ensure anchor and availability constraints coexist with coaching quality rules.

Acceptance criteria:

- Weekly plans show consistent structure and better periodization logic.
- Hard/easy sequencing is intentional and traceable.

## G) Prompt Upgrade: Training Block Generation (P1)

File:

- `trigger/generate-training-block.ts`

Tasks:

- [ ] Add mesocycle progression caps (volume/intensity ramp limits).
- [ ] Quantify recovery-week reductions based on rhythm and athlete state.
- [ ] Add event-specific specificity progression rules by phase.
- [ ] Require coherent week-by-week rationale linked to block goals.
- [ ] Add risk-aware fallback strategy when athlete constraints conflict.

Acceptance criteria:

- Blocks reflect clear mesocycle logic, not just calendar filling.
- Recovery and build weeks are distinctly differentiated and justified.

## H) Test And Validation Harness (P0)

Files:

- `server/utils/workout-converter.test.ts`
- New dedicated contract tests (formatter + prompt-output validation)
- Existing debug helpers in `cli/debug/intervals-workout.ts`

Tasks:

- [ ] Add contract test matrix for target syntaxes and step constructs.
- [ ] Add negative tests for malformed formatting edge cases.
- [ ] Add regression tests for known parser-breaker patterns.
- [ ] Add smoke validation workflow for generated Intervals text before publish.
- [ ] Add prompt snapshot tests or deterministic checks where feasible.

Acceptance criteria:

- Contract test suite catches format regressions before release.
- CI signals parser-risk changes clearly.

## I) Rollout, Backfill, And Safety (P1)

Files:

- `server/api/workouts/planned/[id]/publish.post.ts`
- `server/utils/intervals-sync.ts`
- Backfill script location to be defined

Tasks:

- [ ] Add rollout flag for new formatter/prompt behavior if needed.
- [ ] Identify future planned workouts created with legacy formatting.
- [ ] Republish only eligible future workouts to Intervals.icu.
- [ ] Add metrics/logging for sync failures and parser-related export failures.
- [ ] Add rollback notes and safe fallback behavior.

Acceptance criteria:

- No bulk disruption to existing scheduled workouts.
- Observable drop in format-related sync issues.

## 5. Suggested Execution Order

1. A + H (formatter contract + tests)
2. B + C + D (schema/normalization + structured prompts)
3. E + F + G (upstream coaching prompt quality)
4. I (rollout/backfill)

## 6. Definition Of Done

Done when all are true:

1. Formatter contract tests pass and cover known syntax variants.
2. Generate and adjust structured workflows produce consistent, valid step data.
3. Prompt outputs demonstrate improved coaching coherence and progression quality.
4. Intervals sync/export error rate related to formatting materially decreases.
5. Backfill/republish completed for affected future workouts (with audit log).

## 7. Tracking Checklist (Master)

- [ ] Workstream A complete
- [ ] Workstream B complete
- [ ] Workstream C complete
- [ ] Workstream D complete
- [ ] Workstream E complete
- [ ] Workstream F complete
- [ ] Workstream G complete
- [ ] Workstream H complete
- [ ] Workstream I complete
