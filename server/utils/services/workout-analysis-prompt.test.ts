import { describe, expect, it } from 'vitest'
import {
  buildAnalysisFactsPromptBlock,
  buildAnalysisGuardrailInstructions,
  buildWorkoutAnalysisData,
  buildWorkoutAnalysisPrompt,
  getAnalysisSectionsGuidance,
  getWorkoutTypeGuidance,
  normalizeRunningCadence
} from './workout-analysis-prompt'
import * as analyzeWorkoutTrigger from '../../../trigger/analyze-workout'
import { buildWorkoutAnalysisFactsV2 } from '../workout-analysis-facts'

/**
 * CW-392 regression coverage.
 *
 * These builders used to exist twice -- once in `trigger/analyze-workout.ts` and once
 * in `server/utils/services/workoutAnalysisService.ts` -- and had already drifted apart.
 * This suite pins the emitted prompt for a representative workout so a future edit to
 * the shared module can't silently change what the model sees, and asserts that the
 * Trigger.dev entry point resolves to the exact same function objects.
 */

const RIDE_WORKOUT = {
  id: 'workout-fixture-1',
  date: new Date('2026-03-15T10:00:00Z'),
  title: 'Sweet Spot Intervals',
  description: '3x12 min sweet spot',
  notes: 'Legs felt strong throughout',
  type: 'Ride',
  durationSec: 5400,
  distanceMeters: 48000,
  elevationGain: 620,
  averageWatts: 231,
  maxWatts: 812,
  normalizedPower: 248,
  weightedAvgWatts: 250,
  ftp: 275,
  averageHr: 148,
  maxHr: 176,
  averageCadence: 88,
  maxCadence: 121,
  // m/s, as every sync writer stores it (48000 m / 5400 s = 8.889 m/s).
  averageSpeed: 8.9,
  tss: 96,
  trainingLoad: 101,
  intensity: 0.9,
  kilojoules: 1240,
  variabilityIndex: 1.07,
  powerHrRatio: 1.56,
  efficiencyFactor: 1.68,
  decoupling: 4.2,
  ctl: 71,
  atl: 84,
  rpe: 7,
  feel: 4,
  avgTemp: 21,
  trainer: false,
  lrBalance: 51.4,
  rawJson: {
    icu_intervals: [
      {
        type: 'WORK',
        label: 'Block 1',
        moving_time: 720,
        elapsed_time: 730,
        distance: 6400,
        average_watts: 255,
        max_watts: 402,
        weighted_average_watts: 258,
        intensity: 0.93,
        average_heartrate: 155,
        max_heartrate: 168,
        average_cadence: 90,
        max_cadence: 104,
        average_speed: 9.1,
        w5s_variability: 1.04
      },
      {
        type: 'RECOVERY',
        label: 'Rest 1',
        moving_time: 300,
        elapsed_time: 305,
        distance: 2000,
        average_watts: 120,
        intensity: 0.44,
        average_heartrate: 128,
        average_cadence: 78,
        average_speed: 6.6
      }
    ]
  }
}

const USER_PROFILE = {
  age: 35,
  sex: 'male',
  weight: 72,
  weightUnits: 'Kilograms',
  height: 180,
  heightUnits: 'Centimeters',
  language: 'English',
  temperatureUnits: 'Celsius',
  distanceUnits: 'Kilometers'
}

describe('normalizeRunningCadence', () => {
  it('doubles per-foot cadence exports for running workouts only', () => {
    expect(normalizeRunningCadence(87, true)).toBe(174)
    expect(normalizeRunningCadence(174, true)).toBe(174)
    expect(normalizeRunningCadence(88, false)).toBe(88)
  })

  it('passes through nullish and zero cadence untouched', () => {
    expect(normalizeRunningCadence(null, true)).toBeNull()
    expect(normalizeRunningCadence(undefined, true)).toBeUndefined()
    expect(normalizeRunningCadence(0, true)).toBe(0)
  })
})

describe('buildWorkoutAnalysisData', () => {
  it('normalises a raw workout row into the AI payload shape', () => {
    const data = buildWorkoutAnalysisData(RIDE_WORKOUT)

    expect(data.duration_m).toBe(90)
    expect(data.avg_power).toBe(231)
    expect(data.normalized_power).toBe(248)
    expect(data.avg_cadence).toBe(88)
    expect(data.avg_speed_ms).toBe(8.9)
    // Provider lap labels are re-derived rather than trusted (CW-376).
    expect(data.intervals).toHaveLength(2)
    expect(data.intervals[0].type).toBe('WORK')
    expect(data.intervals[1].type).toBe('RECOVERY')
  })

  it('doubles per-foot cadence for running workouts', () => {
    const data = buildWorkoutAnalysisData({
      type: 'TrailRun',
      durationSec: 3600,
      averageCadence: 87,
      maxCadence: 95
    })

    expect(data.avg_cadence).toBe(174)
    expect(data.max_cadence).toBe(190)
  })

  it('passes the stored m/s average speed through untouched (CW-382)', () => {
    // Every sync writer persists `averageSpeed` in m/s. The payload used to divide it by
    // 3.6 as if it were km/h, so a 3.0 m/s run (5:33/km) reached the model as 0.83 m/s.
    const data = buildWorkoutAnalysisData({
      type: 'Run',
      durationSec: 3333,
      distanceMeters: 10000,
      averageSpeed: 3.0
    })

    expect(data.avg_speed_ms).toBe(3.0)
  })
})

describe('getWorkoutTypeGuidance / getAnalysisSectionsGuidance', () => {
  it('selects sport-specific guidance', () => {
    expect(getWorkoutTypeGuidance('Ride', true, false)).toContain('This is a cycling workout')
    expect(getWorkoutTypeGuidance('Run', true, false)).toContain('This is a running workout')
    expect(getWorkoutTypeGuidance('Strength', false, true)).toContain(
      'strength training aspects like volume'
    )

    expect(getAnalysisSectionsGuidance('Run', true, false)).toContain('**Running Form**')
    expect(getAnalysisSectionsGuidance('Ride', true, false)).toContain('**Pedaling Efficiency**')
    expect(getAnalysisSectionsGuidance('Strength', false, true)).toContain('**Training Volume**')
  })
})

describe('buildAnalysisFactsPromptBlock / buildAnalysisGuardrailInstructions', () => {
  it('returns nothing when no v2 facts are supplied', () => {
    expect(buildAnalysisFactsPromptBlock(undefined)).toBe('')
  })

  it('emits the v2 facts contract and matching guardrails for a stochastic ski session', () => {
    const speed = [
      ...Array.from({ length: 150 }, () => 0),
      ...Array.from({ length: 220 }, () => 3.2),
      ...Array.from({ length: 60 }, () => 0),
      ...Array.from({ length: 180 }, () => 5.8),
      ...Array.from({ length: 80 }, () => 0.4),
      ...Array.from({ length: 200 }, () => 4.9),
      ...Array.from({ length: 90 }, () => 0)
    ]

    const facts = buildWorkoutAnalysisFactsV2({
      workout: {
        type: 'NordicSki',
        durationSec: speed.length * 5,
        averageHr: 152,
        maxHr: 181,
        averageSpeed: 12.24,
        intensity: 0.84,
        streams: {
          velocity: speed,
          heartrate: Array.from({ length: speed.length }, (_, i) => (i % 180 < 90 ? 168 : 132))
        }
      }
    } as any)

    const block = buildAnalysisFactsPromptBlock(facts)
    expect(block).toContain('## Calculated Workout Facts v2')
    expect(block).toContain('### Guardrails')
    expect(block).toContain('- Session Steadiness: stochastic')
    expect(block).toContain('Treat these facts as authoritative guardrails')

    const guardrails = buildAnalysisGuardrailInstructions('NordicSki', facts)
    expect(guardrails).toContain(
      'Do not criticize the athlete for lacking a constant pace or uniform effort'
    )
    expect(guardrails).toContain(
      'avoid cycling-specific gear advice such as recommending a power meter'
    )
    // Baseline rules are always present, even without facts.
    expect(buildAnalysisGuardrailInstructions('Ride', undefined)).toContain(
      'Do not use ATL, CTL, or TSB alone as proof of technique breakdown'
    )
  })
})

describe('buildWorkoutAnalysisPrompt', () => {
  it('emits a stable prompt for a representative ride (pure-extraction snapshot)', () => {
    const prompt = buildWorkoutAnalysisPrompt(
      buildWorkoutAnalysisData(RIDE_WORKOUT),
      'Europe/Budapest',
      'Supportive',
      {
        ftp: 275,
        lthr: 168,
        loadPreference: 'POWER',
        hrZones: [{ name: 'Z1', min: 90, max: 120 }],
        powerZones: [{ name: 'Z2', min: 150, max: 200 }]
      },
      USER_PROFILE,
      'Masters athlete, prefers metric units.',
      {
        title: 'SST 3x12',
        description: 'Sweet spot blocks',
        durationSec: 3600,
        tss: 78,
        workIntensity: 0.88
      },
      undefined,
      {
        symptoms: [
          {
            timestamp: new Date('2026-03-12T08:00:00Z'),
            category: 'ILLNESS',
            severity: 6,
            description: 'sore throat'
          }
        ]
      }
    )

    expect(prompt).toMatchSnapshot()
  })

  it('reports an average speed that agrees with the derived average pace (CW-382)', () => {
    // The two lines in the "Pace & Speed" block are derived independently: the pace from
    // distance_m / duration_s, the speed from the stored `averageSpeed` column. They only
    // agree once the bogus /3.6 conversion is gone.
    const prompt = buildWorkoutAnalysisPrompt(
      buildWorkoutAnalysisData({
        id: 'workout-fixture-run',
        date: new Date('2026-03-16T06:00:00Z'),
        title: 'Steady 10k',
        type: 'Run',
        durationSec: 3333,
        distanceMeters: 10000,
        averageSpeed: 3.0,
        averageHr: 152,
        maxHr: 171
      }),
      'Europe/Budapest',
      'Supportive',
      { loadPreference: 'PACE' },
      USER_PROFILE
    )

    expect(prompt).toContain('## Pace & Speed (Primary Metric)')
    // 10000 m / 3333 s = 3.0 m/s = 333 s/km = 5:33/km.
    expect(prompt).toContain('- Average Pace: 5:33/km')
    expect(prompt).toContain('- Average Speed: 3.00 m/s')
  })

  it('respects the athlete distanceUnits preference for strength set distances', () => {
    const workoutData = {
      date: new Date('2026-03-15T10:00:00Z'),
      title: 'Full Body Strength',
      type: 'Strength',
      duration_m: 45,
      duration_s: 2700,
      exercises: [
        {
          name: 'Sled Push',
          muscle_group: 'Legs',
          sets: [{ type: 'NORMAL', reps: 1, distance: 20 }]
        }
      ]
    }

    const imperial = buildWorkoutAnalysisPrompt(
      workoutData,
      'Europe/Budapest',
      'Supportive',
      undefined,
      {
        ...USER_PROFILE,
        distanceUnits: 'Miles'
      }
    )
    expect(imperial).toContain('66 ft')

    const metric = buildWorkoutAnalysisPrompt(
      workoutData,
      'Europe/Budapest',
      'Supportive',
      undefined,
      {
        ...USER_PROFILE,
        distanceUnits: 'Kilometers'
      }
    )
    expect(metric).toContain('20 m')
  })
})

describe('shared-module wiring', () => {
  it('is the single implementation both analysis entry points use', async () => {
    // trigger/analyze-workout.ts re-exports the shared builders; identity equality proves
    // there is exactly one implementation left after the CW-392 dedup.
    expect(analyzeWorkoutTrigger.buildWorkoutAnalysisPrompt).toBe(buildWorkoutAnalysisPrompt)
    expect(analyzeWorkoutTrigger.buildWorkoutAnalysisData).toBe(buildWorkoutAnalysisData)
    expect(analyzeWorkoutTrigger.buildAnalysisFactsPromptBlock).toBe(buildAnalysisFactsPromptBlock)
    expect(analyzeWorkoutTrigger.buildAnalysisGuardrailInstructions).toBe(
      buildAnalysisGuardrailInstructions
    )
    expect(analyzeWorkoutTrigger.getWorkoutTypeGuidance).toBe(getWorkoutTypeGuidance)
    expect(analyzeWorkoutTrigger.getAnalysisSectionsGuidance).toBe(getAnalysisSectionsGuidance)
    expect(analyzeWorkoutTrigger.normalizeRunningCadence).toBe(normalizeRunningCadence)

    // The Redis-worker service imports the same module (it does not re-export the
    // builders, to avoid Nitro auto-import collisions), so assert the module graph
    // rather than symbol identity here.
    const serviceSource = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./workoutAnalysisService.ts', import.meta.url), 'utf-8')
    )
    expect(serviceSource).toContain("} from './workout-analysis-prompt'")
    expect(serviceSource).not.toContain('function buildWorkoutAnalysisPrompt')
    expect(serviceSource).not.toContain('function buildWorkoutAnalysisData')
  })
})
