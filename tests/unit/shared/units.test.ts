import { describe, expect, it } from 'vitest'
import { MPS_TO_KPH, metresPerSecondToKmh } from '../../../shared/units'

describe('MPS_TO_KPH', () => {
  it('is the m/s -> km/h factor, not its reciprocal', () => {
    expect(MPS_TO_KPH).toBe(3.6)
  })
})

describe('metresPerSecondToKmh', () => {
  it('converts in the display direction (CW-382 regression)', () => {
    // 3 m/s is a jog, 10.8 km/h. Dividing instead of multiplying would yield
    // 0.83, which is what the AI payload builder reported for years.
    expect(metresPerSecondToKmh(3)).toBeCloseTo(10.8, 10)
    expect(metresPerSecondToKmh(10)).toBeCloseTo(36, 10)
    expect(metresPerSecondToKmh(1)).toBeCloseTo(3.6, 10)
  })

  it('maps zero to zero', () => {
    expect(metresPerSecondToKmh(0)).toBe(0)
  })

  it('is monotonic and sign-preserving', () => {
    expect(metresPerSecondToKmh(5)).toBeGreaterThan(metresPerSecondToKmh(4))
    expect(metresPerSecondToKmh(-2)).toBeLessThan(0)
  })

  it('propagates non-finite input instead of coercing it', () => {
    // Callers guard: normalizeWorkoutMetricValue rejects NaN before converting,
    // and gemini.ts only converts a truthy averageSpeed.
    expect(Number.isNaN(metresPerSecondToKmh(Number.NaN))).toBe(true)
    expect(metresPerSecondToKmh(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
    expect(metresPerSecondToKmh(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY)
  })

  it('is bit-identical to the inline `* 3.6` the call sites used to do', () => {
    // Guards the refactor itself: any displayed number must be unchanged,
    // including after each call site's own .toFixed(1) formatting.
    const samples = [
      0,
      1,
      2.5,
      3,
      4.16667,
      5,
      8.333333333333334,
      9.7,
      11.11111,
      0.05,
      0.001,
      1e-8,
      1e8,
      12.3456789,
      7.777777777777777,
      -3.5,
      Number.EPSILON,
      Number.MAX_SAFE_INTEGER
    ]
    for (const v of samples) {
      expect(Object.is(metresPerSecondToKmh(v), v * 3.6)).toBe(true)
      expect(metresPerSecondToKmh(v).toFixed(1)).toBe((v * 3.6).toFixed(1))
    }
    // Wider randomised sweep over the plausible speed range.
    for (let i = 0; i < 20000; i++) {
      const v = Math.random() * 40
      expect(Object.is(metresPerSecondToKmh(v), v * 3.6)).toBe(true)
      expect(metresPerSecondToKmh(v).toFixed(1)).toBe((v * 3.6).toFixed(1))
    }
  })
})
