import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_SCORE_MAX,
  ANALYSIS_SCORE_MIN,
  ANALYSIS_SECTION_STATUSES,
  analysisSchema,
  buildAnalysisFactsPromptBlock,
  buildAnalysisGuardrailInstructions,
  buildWorkoutAnalysisData,
  buildWorkoutAnalysisPrompt,
  clampAnalysisScore,
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

  it('uses one cadence convention across the session line and the interval rows for a run (CW-387)', () => {
    // Same physical legs, three places in one prompt. Before CW-387 the session line
    // said "176 spm", the Interval Breakdown said "180 rpm" for an equally doubled
    // number, and the facts rows said "90rpm" for the undoubled one.
    const prompt = buildWorkoutAnalysisPrompt(
      buildWorkoutAnalysisData({
        id: 'workout-fixture-run-cadence',
        date: new Date('2026-03-17T06:00:00Z'),
        title: '3 x 1km Threshold',
        type: 'Run',
        durationSec: 3000,
        distanceMeters: 9000,
        averageSpeed: 3.0,
        averageHr: 158,
        maxHr: 176,
        // One-legged, exactly as Strava / Intervals.icu store run cadence.
        averageCadence: 88,
        maxCadence: 95,
        rawJson: {
          icu_intervals: [
            {
              type: 'WORK',
              label: 'Rep 1',
              moving_time: 240,
              distance: 1000,
              average_heartrate: 168,
              average_cadence: 90,
              average_speed: 4.1667,
              intensity: 101
            },
            {
              type: 'RECOVERY',
              label: 'Jog 1',
              moving_time: 120,
              distance: 400,
              average_heartrate: 138,
              average_cadence: 76,
              average_speed: 3.0,
              intensity: 68
            }
          ]
        }
      }),
      'Europe/Budapest',
      'Supportive',
      // HR-primary so the session cadence line is not condensed away; the
      // Interval Breakdown prints cadence either way.
      { loadPreference: 'HR' },
      USER_PROFILE
    )

    // Session level: doubled and labelled spm.
    expect(prompt).toContain('- Average Cadence: 176 spm')
    expect(prompt).toContain('- Max Cadence: 190 spm')
    // Interval Breakdown: same convention, same unit -- no hardcoded rpm.
    expect(prompt).toContain('## Interval Breakdown')
    expect(prompt).toContain('- Avg Cadence: 180 spm')
    expect(prompt).toContain('- Avg Cadence: 152 spm')
    // A run prompt must never mention rpm anywhere.
    expect(prompt).not.toContain('rpm')
    expect(prompt).not.toContain('RPM')
  })

  it('keeps rpm for a ride in both the session line and the interval rows (CW-387)', () => {
    const prompt = buildWorkoutAnalysisPrompt(
      buildWorkoutAnalysisData(RIDE_WORKOUT),
      'Europe/Budapest',
      'Supportive',
      { loadPreference: 'POWER' },
      USER_PROFILE
    )

    expect(prompt).toContain('- Average Cadence: 88 rpm')
    expect(prompt).toContain('- Avg Cadence: 90 rpm')
    expect(prompt).not.toContain('spm')
  })

  it('floors the minutes term of an interval duration instead of rounding it (CW-388)', () => {
    // The seconds term is a true remainder, so rounding the minutes counted it
    // twice: 150s rendered as "3m 30s" and 110s as "2m 50s".
    const prompt = buildWorkoutAnalysisPrompt(
      buildWorkoutAnalysisData({
        id: 'workout-fixture-duration',
        date: new Date('2026-03-18T06:00:00Z'),
        title: 'Short reps',
        type: 'Ride',
        durationSec: 1800,
        ftp: 275,
        rawJson: {
          icu_intervals: [
            { type: 'WORK', label: 'Rep 1', moving_time: 150, average_watts: 300 },
            { type: 'WORK', label: 'Rep 2', moving_time: 110, average_watts: 295 },
            { type: 'WORK', label: 'Rep 3', moving_time: 720, average_watts: 260 }
          ]
        }
      }),
      'Europe/Budapest',
      'Supportive',
      { loadPreference: 'POWER' },
      USER_PROFILE
    )

    expect(prompt).toContain('- Duration: 2m 30s')
    expect(prompt).toContain('- Duration: 1m 50s')
    // A whole number of minutes is unaffected.
    expect(prompt).toContain('- Duration: 12m 0s')
    expect(prompt).not.toContain('- Duration: 3m 30s')
    expect(prompt).not.toContain('- Duration: 2m 50s')
  })

  it('puts interval intensity on the session Intensity Factor scale and labels it (CW-388)', () => {
    // Intervals.icu hands us `icu_intervals[].intensity` as a PERCENTAGE of
    // threshold, while the session line is a factor. Both must read as one scale.
    const prompt = buildWorkoutAnalysisPrompt(
      buildWorkoutAnalysisData({
        id: 'workout-fixture-intensity',
        date: new Date('2026-03-18T06:00:00Z'),
        title: 'Threshold blocks',
        type: 'Ride',
        durationSec: 3600,
        ftp: 275,
        averageWatts: 230,
        intensity: 0.83,
        rawJson: {
          icu_intervals: [
            // Percent scale, as the provider sends it.
            { type: 'WORK', label: 'Block 1', moving_time: 600, intensity: 101 },
            // Already on the factor scale -- must pass through, not be divided again.
            { type: 'WORK', label: 'Block 2', moving_time: 600, intensity: 0.93 }
          ]
        }
      }),
      'Europe/Budapest',
      'Supportive',
      { loadPreference: 'POWER' },
      USER_PROFILE
    )

    expect(prompt).toContain('- Intensity Factor: 0.830')
    expect(prompt).toContain('- Intensity: 1.01 IF (101% of threshold)')
    expect(prompt).toContain('- Intensity: 0.93 IF (93% of threshold)')
    // The raw provider percentage must never reach the model unlabelled.
    expect(prompt).not.toContain('- Intensity: 101.00')
  })

  it('normalises interval intensity in the payload, not in the renderer (CW-388)', () => {
    const data = buildWorkoutAnalysisData({
      id: 'workout-fixture-intensity-payload',
      date: new Date('2026-03-18T06:00:00Z'),
      title: 'Threshold blocks',
      type: 'Ride',
      durationSec: 3600,
      rawJson: {
        icu_intervals: [
          { type: 'WORK', label: 'Block 1', moving_time: 600, intensity: 101 },
          { type: 'WORK', label: 'Block 2', moving_time: 600, intensity: 0.93 }
        ]
      }
    })

    expect(data.intervals[0].intensity).toBeCloseTo(1.01, 5)
    expect(data.intervals[1].intensity).toBeCloseTo(0.93, 5)
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

/**
 * CW-403 regression coverage.
 *
 * The response schema used to exist twice -- once in `trigger/analyze-workout.ts`
 * (1-10 scores, `excellent/good/moderate/needs_improvement/poor`) and once in
 * `server/utils/services/workoutAnalysisService.ts` (0-100 scores,
 * `excellent/good/fair/needs_attention/info`). Gemini enforces whichever schema it is
 * handed, so the service path -- the one that actually runs in production -- forced the
 * model off the vocabulary the prompt asks for, and every UI status->colour mapper fell
 * through to `neutral`: problem sections rendered grey instead of red.
 *
 * These tests read the vocabulary and the score scale back out of the *prompt string*
 * and compare them to the schema, so the two cannot drift apart again silently.
 */
describe('analysisSchema matches the prompt it is handed with', () => {
  const sectionStatusEnum = (analysisSchema.properties.sections as any).items.properties.status.enum
  const scoreProps = (analysisSchema.properties.scores as any).properties
  const scoreKeys = ['overall', 'technical', 'effort', 'pacing', 'execution'] as const

  /** Every distinct "Assign status: a/b/c" vocabulary the prompt instructs, across sports. */
  function statusVocabulariesInstructedByPrompt(): string[][] {
    const guidance = [
      getAnalysisSectionsGuidance('Strength', false, true),
      getAnalysisSectionsGuidance('Run', true, false),
      getAnalysisSectionsGuidance('Ride', true, false)
    ].join('\n')

    const matches = [...guidance.matchAll(/Assign status: ([a-z_/]+)/g)]
    expect(matches.length).toBeGreaterThan(0)
    return matches.map((m) => m[1]!.split('/'))
  }

  it('instructs exactly one status vocabulary across every sport variant', () => {
    const vocabularies = statusVocabulariesInstructedByPrompt()
    for (const vocabulary of vocabularies) {
      expect(vocabulary).toEqual(vocabularies[0])
    }
  })

  it('declares the section status enum the prompt asks for, and nothing else', () => {
    const [instructed] = statusVocabulariesInstructedByPrompt()

    expect(sectionStatusEnum).toEqual(instructed)
    expect(sectionStatusEnum).toEqual([...ANALYSIS_SECTION_STATUSES])
    // The retired vocabulary must never come back: the UI mappers do not understand it.
    expect(sectionStatusEnum).not.toContain('fair')
    expect(sectionStatusEnum).not.toContain('needs_attention')
    expect(sectionStatusEnum).not.toContain('info')
  })

  it('declares 1-10 score bounds, matching the scale the prompt states', () => {
    const prompt = buildWorkoutAnalysisPrompt(
      buildWorkoutAnalysisData(RIDE_WORKOUT),
      'Europe/Budapest',
      'Supportive',
      undefined,
      USER_PROFILE
    )
    expect(prompt).toContain('**Performance Scores** (1-10 scale for tracking progress over time)')

    expect(ANALYSIS_SCORE_MIN).toBe(1)
    expect(ANALYSIS_SCORE_MAX).toBe(10)
    for (const key of scoreKeys) {
      expect(scoreProps[key].minimum).toBe(1)
      expect(scoreProps[key].maximum).toBe(10)
      expect(scoreProps[key].description).toContain('(1-10)')
    }
  })

  it('is the exact same object on both analysis entry points', () => {
    expect(analyzeWorkoutTrigger.analysisSchema).toBe(analysisSchema)
  })

  it('is not redefined by either entry point', async () => {
    const fs = await import('node:fs')
    const serviceSource = fs.readFileSync(
      new URL('./workoutAnalysisService.ts', import.meta.url),
      'utf-8'
    )
    const triggerSource = fs.readFileSync(
      new URL('../../../trigger/analyze-workout.ts', import.meta.url),
      'utf-8'
    )

    expect(serviceSource).not.toContain('const analysisSchema')
    expect(triggerSource).not.toContain('const analysisSchema')
    expect(serviceSource).not.toContain('interface StructuredAnalysis')
    expect(triggerSource).not.toContain('interface StructuredAnalysis')
    // The service must import, never re-export: server/utils is Nitro auto-imported and
    // re-exporting produces "Duplicated imports" warnings (CW-392 NOTE, CW-404).
    expect(serviceSource).not.toMatch(/^export \{/m)
  })
})

describe('clampAnalysisScore', () => {
  it('is the single implementation both entry points call', async () => {
    expect(analyzeWorkoutTrigger.clampAnalysisScore).toBe(clampAnalysisScore)

    const fs = await import('node:fs')
    const serviceSource = fs.readFileSync(
      new URL('./workoutAnalysisService.ts', import.meta.url),
      'utf-8'
    )
    const triggerSource = fs.readFileSync(
      new URL('../../../trigger/analyze-workout.ts', import.meta.url),
      'utf-8'
    )
    expect(serviceSource).not.toContain('const clampScore')
    expect(triggerSource).not.toContain('const clampScore')
  })

  it('keeps 1-10 scores on the stored scale', () => {
    expect(clampAnalysisScore(1)).toBe(1)
    expect(clampAnalysisScore(7.4)).toBe(7)
    expect(clampAnalysisScore(10)).toBe(10)
  })

  it('folds a stray 0-100 score back onto the stored 1-10 scale', () => {
    // Safety net for responses produced while one entry point still declared 0-100.
    expect(clampAnalysisScore(88)).toBe(9)
    expect(clampAnalysisScore(100)).toBe(10)
  })

  it('returns null for non-numeric input', () => {
    expect(clampAnalysisScore(null)).toBeNull()
    expect(clampAnalysisScore(undefined)).toBeNull()
    expect(clampAnalysisScore(Number.NaN)).toBeNull()
  })
})
