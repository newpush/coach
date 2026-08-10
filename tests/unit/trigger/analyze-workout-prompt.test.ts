import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWorkoutAnalysisFactsV2 } from '../../../server/utils/workout-analysis-facts'
import { analyzeWorkoutTask, buildWorkoutAnalysisPrompt } from '../../../trigger/analyze-workout'

const { generateStructuredAnalysis } = vi.hoisted(() => ({
  generateStructuredAnalysis: vi.fn()
}))

vi.mock('../../../trigger/init', () => ({}))

vi.mock('../../../server/utils/db', () => ({
  prisma: {
    workout: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    emailPreference: { findUnique: vi.fn() },
    athleteJourneyEvent: { findMany: vi.fn() }
  }
}))

vi.mock('../../../server/utils/repositories/workoutStreamRepository', () => ({
  attachStreamToWorkout: vi.fn(async (workout: any) => ({ ...workout, streams: null }))
}))

vi.mock('../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: {
    updateStatus: vi.fn(),
    update: vi.fn()
  }
}))

vi.mock('../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: {
    getForActivityType: vi.fn().mockResolvedValue(null)
  }
}))

vi.mock('../../../server/utils/date', () => ({
  getUserTimezone: vi.fn().mockResolvedValue('Europe/Budapest'),
  formatUserDate: vi.fn(() => '2026-03-15'),
  getUserLocalDate: vi.fn(() => '2026-03-15'),
  calculateAge: vi.fn(() => 35)
}))

vi.mock('../../../server/utils/ai-user-settings', () => ({
  getUserAiSettings: vi.fn().mockResolvedValue({
    aiPersona: 'Supportive',
    aiModelPreference: 'gemini-2.0-flash-exp',
    aiContext: null
  })
}))

vi.mock('../../../server/utils/quotas/engine', () => ({
  checkQuota: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../server/utils/gemini', () => ({
  generateCoachAnalysis: vi.fn(),
  generateStructuredAnalysis
}))

vi.mock('@trigger.dev/sdk/v3', async () => {
  const actual = await vi.importActual('@trigger.dev/sdk/v3')
  return {
    ...actual,
    logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    task: vi.fn().mockImplementation((config: any) => ({
      run: config.run,
      id: config.id
    }))
  }
})

describe('buildWorkoutAnalysisPrompt', () => {
  it('adds stop-and-go and ski-specific guardrails to the workout analysis prompt', () => {
    const speed = [
      ...Array.from({ length: 150 }, () => 0),
      ...Array.from({ length: 220 }, () => 3.2),
      ...Array.from({ length: 60 }, () => 0),
      ...Array.from({ length: 180 }, () => 5.8),
      ...Array.from({ length: 80 }, () => 0.4),
      ...Array.from({ length: 200 }, () => 4.9),
      ...Array.from({ length: 90 }, () => 0)
    ]

    const workoutData = {
      date: new Date('2026-03-15T10:00:00Z'),
      title: 'Ski de fond classique MSA',
      type: 'NordicSki',
      duration_m: Math.round((speed.length * 5) / 60),
      duration_s: speed.length * 5,
      avg_hr: 152,
      max_hr: 181,
      avg_speed_ms: 3.4,
      avg_power: null,
      normalized_power: null,
      variability_index: null,
      decoupling: -91.8,
      atl: 34.4
    }

    const analysisFactsV2 = buildWorkoutAnalysisFactsV2({
      workout: {
        ...workoutData,
        durationSec: workoutData.duration_s,
        averageHr: workoutData.avg_hr,
        maxHr: workoutData.max_hr,
        averageSpeed: workoutData.avg_speed_ms,
        averageWatts: null,
        normalizedPower: null,
        intensity: 0.84,
        streams: {
          velocity: speed,
          heartrate: Array.from({ length: speed.length }, (_, index) =>
            index % 180 < 90 ? 168 : 132
          )
        }
      }
    })

    const prompt = buildWorkoutAnalysisPrompt(
      workoutData,
      'Europe/Budapest',
      'Supportive',
      undefined,
      {
        age: 35,
        sex: 'male',
        weight: null,
        language: 'English',
        temperatureUnits: 'Celsius'
      },
      null,
      undefined,
      analysisFactsV2
    )

    expect(prompt).toContain('Session Steadiness: stochastic')
    expect(prompt).toContain('Pacing Drift Applicable: No')
    expect(prompt).toContain('Pacing Drift Applicability Reason:')
    expect(prompt).toContain(
      'Do not criticize the athlete for lacking a constant pace or uniform effort'
    )
    expect(prompt).toContain(
      'avoid cycling-specific gear advice such as recommending a power meter'
    )
    expect(prompt).toContain('Keep recommendations conservative and avoid strong causal claims')
    expect(prompt).toContain('Decoupling Guardrail:')
    expect(prompt).not.toContain('- Decoupling: -91.8%')
  })

  it('formats strength-exercise set distance using the athlete distanceUnits preference', () => {
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

    const milesPrompt = buildWorkoutAnalysisPrompt(
      workoutData,
      'Europe/Budapest',
      'Supportive',
      undefined,
      {
        age: 35,
        sex: 'male',
        weight: null,
        language: 'English',
        distanceUnits: 'Miles'
      }
    )

    // 20 meters -> ~66 feet
    expect(milesPrompt).toContain('66 ft')
    expect(milesPrompt).not.toContain('20m')

    const metricPrompt = buildWorkoutAnalysisPrompt(
      workoutData,
      'Europe/Budapest',
      'Supportive',
      undefined,
      {
        age: 35,
        sex: 'male',
        weight: null,
        language: 'English',
        distanceUnits: 'Kilometers'
      }
    )

    expect(metricPrompt).toContain('20 m')
    expect(metricPrompt).not.toContain('20m')
  })
})

// Regression coverage for CW-196: the two tests above exercise buildWorkoutAnalysisPrompt
// directly with a hand-built userProfile, which would happily pass even if the real
// analyzeWorkoutTask forgot to fetch/thread distanceUnits from the database. These tests
// instead drive the actual trigger task's data-fetching path (mocking prisma.user.findUnique)
// so a missing `distanceUnits: true` in the Prisma select, or a missing `distanceUnits` field
// in the userProfile object built from `user`, is caught.
describe('analyzeWorkoutTask (data-fetching path)', () => {
  const baseWorkoutRecord = {
    id: 'workout-1',
    userId: 'user-1',
    date: new Date('2026-03-15T10:00:00Z'),
    title: 'Evening Run',
    type: 'Run',
    durationSec: 1800,
    distanceMeters: 8046.72, // 5 miles
    elevationGain: null,
    averageWatts: null,
    averageHr: null,
    exercises: [],
    plannedWorkout: null,
    plannedWorkoutId: null
  }

  const baseUser = {
    dob: new Date('1990-01-01'),
    sex: 'male',
    weight: 70,
    weightUnits: 'Kilograms',
    height: 180,
    heightUnits: 'Centimeters',
    language: 'English',
    temperatureUnits: 'Celsius',
    aiAutoAnalyzeWorkouts: true
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const { prisma } = await import('../../../server/utils/db')
    vi.mocked(prisma.workout.findUnique).mockResolvedValue(baseWorkoutRecord as any)
    vi.mocked(prisma.emailPreference.findUnique).mockResolvedValue(null as any)
    vi.mocked(prisma.athleteJourneyEvent.findMany).mockResolvedValue([] as any)

    generateStructuredAnalysis.mockRejectedValue(new Error('stop after prompt build'))
  })

  it('threads the athlete distanceUnits preference from the DB into the generated prompt', async () => {
    const { prisma } = await import('../../../server/utils/db')
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...baseUser,
      distanceUnits: 'Miles'
    } as any)

    await expect(
      analyzeWorkoutTask.run({ workoutId: 'workout-1', source: 'MANUAL' })
    ).rejects.toThrow('stop after prompt build')

    expect(generateStructuredAnalysis).toHaveBeenCalledTimes(1)
    const [prompt] = generateStructuredAnalysis.mock.calls[0]

    // 8046.72m -> 5.00 mi. If distanceUnits were dropped (as in the CW-196 regression this
    // guards against), the prompt would silently fall back to metric ("8.05 km") instead.
    expect(prompt).toContain('5.00 mi')
    expect(prompt).not.toContain('8.05 km')
  })

  it('falls back to metric when the athlete has no distanceUnits preference set', async () => {
    const { prisma } = await import('../../../server/utils/db')
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...baseUser,
      distanceUnits: null
    } as any)

    await expect(
      analyzeWorkoutTask.run({ workoutId: 'workout-1', source: 'MANUAL' })
    ).rejects.toThrow('stop after prompt build')

    const [prompt] = generateStructuredAnalysis.mock.calls[0]
    expect(prompt).toContain('8.05 km')
    expect(prompt).not.toContain('5.00 mi')
  })
})
