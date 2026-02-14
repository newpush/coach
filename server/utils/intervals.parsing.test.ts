import { normalizeIntervalsPlannedWorkout } from './intervals'
import { describe, it, expect } from 'vitest'

// Mock minimal event structure
const createEvent = (steps: any[], type = 'Ride') => ({
  id: 'test-id',
  start_date_local: '2025-01-01T00:00:00',
  name: 'Test Workout',
  type,
  category: 'WORKOUT',
  workout_doc: { steps }
})

describe('Intervals.icu Parsing Logic', () => {
  describe('Cadence Normalization', () => {
    it('should handle simple number cadence', () => {
      const event = createEvent([{ duration: 60, cadence: 90 }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].cadence).toBe(90)
    })

    it('should handle object cadence with value', () => {
      const event = createEvent([{ duration: 60, cadence: { value: 90, units: 'rpm' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].cadence).toBe(90)
    })

    it('should normalize cadence range to average', () => {
      const event = createEvent([{ duration: 60, cadence: { start: 80, end: 100, units: 'rpm' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].cadence).toBe(90) // (80+100)/2
    })

    it('should handle missing/invalid cadence gracefully', () => {
      const event = createEvent([{ duration: 60, cadence: { foo: 'bar' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].cadence).toBeUndefined()
    })
  })

  describe('Power Normalization', () => {
    it('should normalize %ftp to ratio (value > 5)', () => {
      const event = createEvent([{ duration: 60, power: { value: 90, units: '%ftp' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].power.value).toBe(0.9)
    })

    it('should normalize %ftp to ratio (explicit units)', () => {
      const event = createEvent([{ duration: 60, power: { value: 0.9, units: '%ftp' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].power.value).toBeCloseTo(0.9) // Fixed: should not divide by 100 if already ratio
    })

    it('should normalize power range with %ftp', () => {
      const event = createEvent([{ duration: 60, power: { start: 80, end: 100, units: '%ftp' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      const step = result.structuredWorkout.steps[0]
      expect(step.power.range.start).toBe(0.8)
      expect(step.power.range.end).toBe(1.0)
      expect(step.power.start).toBeUndefined() // Should clean up
    })

    it('should keep watts as absolute values', () => {
      const event = createEvent([{ duration: 60, power: { value: 200, units: 'w' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].power.value).toBe(200)
    })

    it('should keep watts range as absolute values', () => {
      const event = createEvent([{ duration: 60, power: { start: 200, end: 300, units: 'w' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      const step = result.structuredWorkout.steps[0]
      expect(step.power.range.start).toBe(200)
      expect(step.power.range.end).toBe(300)
    })
  })

  describe('Nested Steps (Repeats)', () => {
    it('should process nested steps recursively', () => {
      const event = createEvent([
        {
          reps: 3,
          steps: [
            { duration: 300, power: { start: 90, end: 100, units: '%ftp' } }, // Active
            { duration: 120, power: { value: 50, units: '%ftp' } } // Rest
          ]
        }
      ])

      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      const parentStep = result.structuredWorkout.steps[0]
      const activeStep = parentStep.steps[0]
      const restStep = parentStep.steps[1]

      // Check Active Step normalization
      expect(activeStep.power.range.start).toBe(0.9)
      expect(activeStep.power.range.end).toBe(1.0)
      expect(activeStep.type).toBe('Active') // > 60% intensity

      // Check Rest Step normalization
      expect(restStep.power.value).toBe(0.5)
      expect(restStep.type).toBe('Rest') // < 60% intensity
    })

    it('should handle deeply nested steps', () => {
      const event = createEvent([
        {
          reps: 2,
          steps: [
            {
              reps: 3,
              steps: [{ duration: 30, power: { value: 150, units: '%ftp' } }]
            }
          ]
        }
      ])

      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      const innerStep = result.structuredWorkout.steps[0].steps[0].steps[0]

      expect(innerStep.power.value).toBe(1.5)
    })
  })

  describe('Type Inference', () => {
    it('should infer Warmup and Cooldown from flags', () => {
      const event = createEvent([
        { duration: 600, warmup: true },
        { duration: 600, cooldown: true }
      ])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].type).toBe('Warmup')
      expect(result.structuredWorkout.steps[1].type).toBe('Cooldown')
    })

    it('should infer Rest based on low intensity (<60%)', () => {
      const event = createEvent([{ duration: 600, power: { value: 50, units: '%ftp' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].type).toBe('Rest')
    })

    it('should infer Active based on high intensity (>=60%)', () => {
      const event = createEvent([{ duration: 600, power: { value: 70, units: '%ftp' } }])
      const result = normalizeIntervalsPlannedWorkout(event as any, 'user-1')
      expect(result.structuredWorkout.steps[0].type).toBe('Active')
    })
  })
})
