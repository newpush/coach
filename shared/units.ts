/**
 * Shared unit conversions.
 *
 * Single home for conversion factors that both the Nuxt app and the Nitro
 * server need, so the convention is stated once instead of being re-derived at
 * every call site.
 */

/**
 * Metres per second -> kilometres per hour.
 *
 * Storage convention: `Workout.averageSpeed` and the `velocity` stream are
 * persisted in **metres per second**. Every user-facing surface (explorer
 * charts, AI prompts, workout summaries) displays km/h, so the stored value
 * must be multiplied by this factor on the way out — and divided by it on the
 * way in.
 */
export const MPS_TO_KPH = 3.6

/**
 * Convert a persisted speed/velocity from m/s to km/h.
 *
 * `Workout.averageSpeed` and the `velocity` stream are stored in m/s; this is
 * the only correct direction for display. CW-382 is why this lives in one
 * place: the AI payload builder divided instead of multiplying for years,
 * telling the model every athlete moved 3.6x slower than they did, because the
 * convention only existed in scattered comments next to bare `* 3.6` literals.
 *
 * Pure multiplication — no rounding and no guarding. Non-finite input
 * propagates (`NaN` -> `NaN`, `Infinity` -> `Infinity`) rather than being
 * coerced, because callers differ in how they format and validate: the
 * explorer rejects `NaN` before converting and rounds to one decimal, while
 * `convertVelocity` returns the raw product and lets the formatter decide.
 * Callers convert; callers format.
 */
export function metresPerSecondToKmh(metresPerSecond: number): number {
  return metresPerSecond * MPS_TO_KPH
}
