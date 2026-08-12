import { describe, expect, it, vi } from 'vitest'

import {
  extractGarminActivityCadence,
  extractGarminBodyBatteryScore,
  extractGarminReadinessScore,
  extractGarminSpO2Percentage,
  GarminService,
  isGarminExternalUserIdConflict
} from '../../../../../server/utils/services/garminService'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    integration: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    },
    user: {
      findUnique: vi.fn()
    }
  }
}))

vi.mock('../../../../../server/utils/db', () => ({
  prisma: prismaMock
}))

// CW-95: keep every real SDK export, but make `task()` hand back the raw run function so the
// garmin-backfill task's status handling can be exercised directly.
vi.mock('@trigger.dev/sdk/v3', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    task: (config: any) => ({ id: config.id, run: config.run }),
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
  }
})

describe('GarminService.extractPullToken', () => {
  it('prefers the webhook query token', () => {
    const token = GarminService.extractPullToken(
      { token: 'payload-token' },
      { query: { token: 'query-token' }, headers: { 'x-garmin-pull-token': 'header-token' } }
    )

    expect(token).toBe('query-token')
  })

  it('falls back to the payload token', () => {
    const token = GarminService.extractPullToken(
      { token: 'payload-token' },
      { query: {}, headers: {} }
    )

    expect(token).toBe('payload-token')
  })

  it('falls back to the header token and handles missing values', () => {
    expect(
      GarminService.extractPullToken({}, { query: {}, headers: { 'x-garmin-pull-token': 'abc' } })
    ).toBe('abc')

    expect(GarminService.extractPullToken({}, { query: {}, headers: {} })).toBeNull()
  })
})

describe('extractGarminPushList', () => {
  it('prefers Health API Push keys over legacy aliases', async () => {
    const { extractGarminPushList } =
      await import('../../../../../server/utils/services/garminService')

    expect(
      extractGarminPushList(
        {
          bodyComps: [{ userId: 'a', weightInGrams: 70000 }],
          bodyComposition: [{ userId: 'b' }]
        },
        'bodyComps',
        'bodyComposition'
      )
    ).toEqual([{ userId: 'a', weightInGrams: 70000 }])

    expect(
      extractGarminPushList(
        { bodyComposition: [{ userId: 'legacy' }] },
        'bodyComps',
        'bodyComposition'
      )
    ).toEqual([{ userId: 'legacy' }])

    expect(
      extractGarminPushList({ stressDetails: [{ userId: 's' }] }, 'stressDetails', 'stress')
    ).toEqual([{ userId: 's' }])

    expect(
      extractGarminPushList(
        { allDayRespiration: [{ userId: 'r' }] },
        'allDayRespiration',
        'respiration'
      )
    ).toEqual([{ userId: 'r' }])

    expect(extractGarminPushList({ pulseox: [{ userId: 'p' }] }, 'pulseox', 'pulseOx')).toEqual([
      { userId: 'p' }
    ])

    expect(extractGarminPushList({}, 'bodyComps', 'bodyComposition')).toEqual([])
  })
})

describe('GarminService.getActivityFileExternalIds', () => {
  it('matches activity file records back to garmin workout external ids', () => {
    expect(
      GarminService.getActivityFileExternalIds({
        activityId: 22047215050,
        summaryId: '22047215050-file'
      })
    ).toEqual(['22047215050', '22047215050-file'])
  })

  it('handles sparse records', () => {
    expect(GarminService.getActivityFileExternalIds({ summaryId: 'abc-file' })).toEqual([
      'abc-file',
      'abc'
    ])
    expect(GarminService.getActivityFileExternalIds({})).toEqual([])
  })
})

describe('GarminService.resolveWellnessDate', () => {
  it('prefers Garmin calendarDate for date-only wellness records', () => {
    const date = GarminService.resolveWellnessDate({
      calendarDate: '2026-03-10',
      startTimeInSeconds: 1773097200
    })

    expect(date?.toISOString()).toBe('2026-03-10T00:00:00.000Z')
  })

  it('uses Garmin startTimeOffsetInSeconds to keep the user local day', () => {
    const date = GarminService.resolveWellnessDate(
      {
        startTimeInSeconds: Date.parse('2026-03-09T23:00:00.000Z') / 1000,
        startTimeOffsetInSeconds: 3600
      },
      {
        timestampField: 'startTimeInSeconds',
        offsetField: 'startTimeOffsetInSeconds'
      }
    )

    expect(date?.toISOString()).toBe('2026-03-10T00:00:00.000Z')
  })

  it('falls back to UTC timestamp normalization when no offset is provided', () => {
    const date = GarminService.resolveWellnessDate(
      {
        startTimeInSeconds: Date.parse('2026-03-10T04:30:00.000Z') / 1000
      },
      {
        timestampField: 'startTimeInSeconds',
        offsetField: 'startTimeOffsetInSeconds'
      }
    )

    expect(date?.toISOString()).toBe('2026-03-10T00:00:00.000Z')
  })
})

describe('extractGarminBodyBatteryScore', () => {
  it('prefers the most recent body battery value when available', () => {
    expect(
      extractGarminBodyBatteryScore({
        bodyBatteryMostRecentValue: 68,
        bodyBatteryHighestValue: 92
      })
    ).toBe(68)
  })

  it('falls back to the highest body battery value when that is all Garmin provides', () => {
    expect(
      extractGarminBodyBatteryScore({
        bodyBatteryHighestValue: 81
      })
    ).toBe(81)
  })

  it('clamps out-of-range values into the app recovery score range', () => {
    expect(
      extractGarminBodyBatteryScore({
        bodyBatteryCurrentValue: 123
      })
    ).toBe(100)
  })

  it('returns null when the Garmin daily record has no body battery fields', () => {
    expect(
      extractGarminBodyBatteryScore({
        averageStressLevel: 37
      })
    ).toBeNull()
  })

  it('falls back to Garmin readiness-style scores when body battery is not available', () => {
    expect(
      extractGarminBodyBatteryScore({
        trainingReadinessScore: 74
      })
    ).toBe(74)
  })
})

describe('extractGarminBodyBatteryScore (documented Garmin Health API fields)', () => {
  it('derives an absolute recovery level from Stress Details timeOffsetBodyBatteryValues', () => {
    // Real Garmin Stress Details push payloads sample Body Battery throughout the day as
    // { "<secondsSinceStartOfDay>": level }. The peak sample is the best documented proxy
    // for "how recovered" the user was (Body Battery is highest right after sleep/rest).
    expect(
      extractGarminBodyBatteryScore({
        userId: 'garmin-user-1',
        calendarDate: '2026-03-10',
        timeOffsetBodyBatteryValues: {
          '0': 62,
          '3600': 78,
          '7200': 55,
          '10800': 40
        }
      })
    ).toBe(78)
  })

  it('derives a net recovery percentage from Daily bodyBatteryChargedValue/bodyBatteryDrainedValue', () => {
    // Garmin Daily Summary only documents charged/drained deltas, not an absolute level.
    // Product rule: 50 (neutral) + netChange/2, clamped to 0-100.
    expect(
      extractGarminBodyBatteryScore({
        calendarDate: '2026-03-10',
        bodyBatteryChargedValue: 60,
        bodyBatteryDrainedValue: 40
      })
    ).toBe(60)
  })

  it('clamps a fully-drained day to 0 when only bodyBatteryDrainedValue is present', () => {
    expect(
      extractGarminBodyBatteryScore({
        bodyBatteryDrainedValue: 100
      })
    ).toBe(0)
  })

  it('clamps a fully-charged day to 100 when only bodyBatteryChargedValue is present', () => {
    expect(
      extractGarminBodyBatteryScore({
        bodyBatteryChargedValue: 100
      })
    ).toBe(100)
  })

  it('prefers the Stress Details time series over Daily charged/drained deltas when both are present', () => {
    expect(
      extractGarminBodyBatteryScore({
        timeOffsetBodyBatteryValues: { '0': 45, '3600': 90 },
        bodyBatteryChargedValue: 10,
        bodyBatteryDrainedValue: 80
      })
    ).toBe(90)
  })

  it('still falls back to the legacy non-standard fields when only those are present (kept for backward compatibility)', () => {
    expect(
      extractGarminBodyBatteryScore({
        bodyBatteryMostRecentValue: 68
      })
    ).toBe(68)
  })
})

describe('extractGarminReadinessScore', () => {
  it('normalizes Garmin training readiness scores into the app readiness scale', () => {
    expect(
      extractGarminReadinessScore({
        trainingReadinessScore: 74
      })
    ).toBe(7)
  })

  it('supports nested Garmin score payloads', () => {
    expect(
      extractGarminReadinessScore({
        trainingReadiness: { value: 83 }
      })
    ).toBe(8)
  })

  it('returns null when Garmin does not include a readiness metric', () => {
    expect(
      extractGarminReadinessScore({
        bodyBatteryMostRecentValue: 68
      })
    ).toBeNull()
  })
})

describe('extractGarminSpO2Percentage', () => {
  it('reads direct Garmin daily SpO2 fields', () => {
    expect(
      extractGarminSpO2Percentage({
        averagePulseOx: 96.4
      })
    ).toBe(96.4)
  })

  it('derives SpO2 from Garmin sleep sample maps when no daily average is present', () => {
    expect(
      extractGarminSpO2Percentage({
        timeOffsetSleepSpo2: {
          60: 95,
          120: 97,
          180: 96
        }
      })
    ).toBe(96)
  })

  it('returns null when Garmin provides no usable SpO2 data', () => {
    expect(
      extractGarminSpO2Percentage({
        averageStressLevel: 18
      })
    ).toBeNull()
  })
})

describe('extractGarminActivityCadence (CW-97)', () => {
  it('extracts cycling cadence from bike cadence fields, unchanged from prior behavior', () => {
    const record = {
      activityType: 'ROAD_BIKING',
      averageBikeCadenceInRoundsPerMinute: 84.6,
      maxBikeCadenceInRoundsPerMinute: 102.3,
      // Should be ignored for a cycling activity even if present.
      averageRunCadenceInStepsPerMinute: 170,
      averageSwimCadenceInStrokesPerMinute: 32
    }

    expect(extractGarminActivityCadence(record, 'Ride')).toEqual({
      average: 84.6,
      max: 102.3
    })
  })

  it('extracts running cadence from run cadence fields', () => {
    const record = {
      activityType: 'RUNNING',
      averageRunCadenceInStepsPerMinute: 172.4,
      maxRunCadenceInStepsPerMinute: 188.1,
      // A run summary has no bike cadence fields at all in real Garmin payloads.
      averageBikeCadenceInRoundsPerMinute: undefined
    }

    expect(extractGarminActivityCadence(record, 'Run')).toEqual({
      average: 172.4,
      max: 188.1
    })
  })

  it('extracts swimming cadence from swim cadence fields', () => {
    const record = {
      activityType: 'LAP_SWIMMING',
      averageSwimCadenceInStrokesPerMinute: 31.5,
      maxSwimCadenceInStrokesPerMinute: 38
    }

    expect(extractGarminActivityCadence(record, 'Swim')).toEqual({
      average: 31.5,
      max: 38
    })
  })

  it('returns null cadence for activity types with no documented cadence fields', () => {
    const record = {
      activityType: 'STRENGTH_TRAINING'
    }

    expect(extractGarminActivityCadence(record, 'WeightTraining')).toEqual({
      average: null,
      max: null
    })
  })

  it('returns null cadence for a null/undefined record', () => {
    expect(extractGarminActivityCadence(null, 'Run')).toEqual({ average: null, max: null })
    expect(extractGarminActivityCadence(undefined, 'Ride')).toEqual({ average: null, max: null })
  })
})

describe('GarminService.processActivities cadence mapping (CW-97)', () => {
  it('maps run cadence into averageCadence/maxCadence for a running activity', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ dashboardSettings: {} })
    prismaMock.fitFile = { findUnique: vi.fn().mockResolvedValue(null) } as any

    const workoutRepoModule =
      await import('../../../../../server/utils/repositories/workoutRepository')
    const upsertSpy = vi.spyOn(workoutRepoModule.workoutRepository, 'upsert').mockResolvedValue({
      record: { id: 'workout-run-1' } as any,
      created: true
    })

    const streamRepoModule =
      await import('../../../../../server/utils/repositories/workoutStreamRepository')
    vi.spyOn(streamRepoModule.workoutStreamRepository, 'existsByWorkoutId').mockResolvedValue(false)

    await GarminService.processActivities(
      'user-1',
      [
        {
          summaryId: 'activity-run-1',
          startTimeInSeconds: 1700000000,
          durationInSeconds: 1800,
          activityType: 'RUNNING',
          averageRunCadenceInStepsPerMinute: 175.8,
          maxRunCadenceInStepsPerMinute: 190.2,
          averageBikeCadenceInRoundsPerMinute: 999 // must not leak into a run's cadence
        }
      ],
      { id: 'int-1' }
    )

    expect(upsertSpy).toHaveBeenCalledWith(
      'user-1',
      'garmin',
      'activity-run-1',
      expect.objectContaining({ type: 'Run', averageCadence: 176, maxCadence: 190 }),
      expect.objectContaining({ type: 'Run', averageCadence: 176, maxCadence: 190 })
    )
    vi.restoreAllMocks()
  })

  it('maps swim cadence into averageCadence/maxCadence for a swimming activity', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ dashboardSettings: {} })
    prismaMock.fitFile = { findUnique: vi.fn().mockResolvedValue(null) } as any

    const workoutRepoModule =
      await import('../../../../../server/utils/repositories/workoutRepository')
    const upsertSpy = vi.spyOn(workoutRepoModule.workoutRepository, 'upsert').mockResolvedValue({
      record: { id: 'workout-swim-1' } as any,
      created: true
    })

    const streamRepoModule =
      await import('../../../../../server/utils/repositories/workoutStreamRepository')
    vi.spyOn(streamRepoModule.workoutStreamRepository, 'existsByWorkoutId').mockResolvedValue(false)

    await GarminService.processActivities(
      'user-1',
      [
        {
          summaryId: 'activity-swim-1',
          startTimeInSeconds: 1700000000,
          durationInSeconds: 2400,
          activityType: 'LAP_SWIMMING',
          averageSwimCadenceInStrokesPerMinute: 30.6,
          maxSwimCadenceInStrokesPerMinute: 36.4
        }
      ],
      { id: 'int-1' }
    )

    expect(upsertSpy).toHaveBeenCalledWith(
      'user-1',
      'garmin',
      'activity-swim-1',
      expect.objectContaining({ type: 'Swim', averageCadence: 31, maxCadence: 36 }),
      expect.objectContaining({ type: 'Swim', averageCadence: 31, maxCadence: 36 })
    )
    vi.restoreAllMocks()
  })

  it('keeps mapping bike cadence into averageCadence/maxCadence for a cycling activity', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ dashboardSettings: {} })
    prismaMock.fitFile = { findUnique: vi.fn().mockResolvedValue(null) } as any

    const workoutRepoModule =
      await import('../../../../../server/utils/repositories/workoutRepository')
    const upsertSpy = vi.spyOn(workoutRepoModule.workoutRepository, 'upsert').mockResolvedValue({
      record: { id: 'workout-ride-1' } as any,
      created: true
    })

    const streamRepoModule =
      await import('../../../../../server/utils/repositories/workoutStreamRepository')
    vi.spyOn(streamRepoModule.workoutStreamRepository, 'existsByWorkoutId').mockResolvedValue(false)

    await GarminService.processActivities(
      'user-1',
      [
        {
          summaryId: 'activity-ride-1',
          startTimeInSeconds: 1700000000,
          durationInSeconds: 3600,
          activityType: 'ROAD_BIKING',
          averageBikeCadenceInRoundsPerMinute: 85.2,
          maxBikeCadenceInRoundsPerMinute: 104.9
        }
      ],
      { id: 'int-1' }
    )

    expect(upsertSpy).toHaveBeenCalledWith(
      'user-1',
      'garmin',
      'activity-ride-1',
      expect.objectContaining({ type: 'Ride', averageCadence: 85, maxCadence: 105 }),
      expect.objectContaining({ type: 'Ride', averageCadence: 85, maxCadence: 105 })
    )
    vi.restoreAllMocks()
  })
})

describe('GarminService.processStressDetails', () => {
  it('persists a recognized recovery-bearing Stress Details summary instead of discarding it (CW-96)', async () => {
    const wellnessRepoModule =
      await import('../../../../../server/utils/repositories/wellnessRepository')
    const upsertSpy = vi
      .spyOn(wellnessRepoModule.wellnessRepository, 'upsert')
      .mockResolvedValue({ record: {} as any, isNew: true })

    await GarminService.processStressDetails('user-1', [
      {
        userId: 'garmin-ext-1',
        calendarDate: '2026-03-10',
        startTimeInSeconds: 1773097200,
        startTimeOffsetInSeconds: 0,
        timeOffsetBodyBatteryValues: {
          '0': 40,
          '3600': 85,
          '7200': 60
        }
      }
    ])

    expect(upsertSpy).toHaveBeenCalledTimes(1)
    expect(upsertSpy).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
      expect.objectContaining({ recoveryScore: 85 }),
      expect.objectContaining({ recoveryScore: 85 }),
      'garmin'
    )

    vi.restoreAllMocks()
  })

  it('skips Stress Details records with no usable date or recovery signal without throwing', async () => {
    const wellnessRepoModule =
      await import('../../../../../server/utils/repositories/wellnessRepository')
    const upsertSpy = vi
      .spyOn(wellnessRepoModule.wellnessRepository, 'upsert')
      .mockResolvedValue({ record: {} as any, isNew: true })

    await GarminService.processStressDetails('user-1', [
      { calendarDate: '2026-03-10', averageStressLevel: 20 }
    ])

    expect(upsertSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})

describe('GarminService.runIngestGarmin', () => {
  it('triggers backfill when direct REST pulls fail with InvalidPullTokenException', async () => {
    prismaMock.integration.findUnique.mockResolvedValue({
      id: 'int-123',
      userId: 'user-123',
      provider: 'garmin',
      ingestWorkouts: true,
      settings: {}
    })
    prismaMock.integration.update.mockResolvedValue({})

    const startBackfillSpy = vi.spyOn(GarminService, 'startBackfill').mockResolvedValue({
      status: 'success',
      requested: ['activities', 'dailies', 'sleeps', 'hrv', 'bodyComps', 'userMetrics'],
      failed: []
    })

    const fetchers = await import('../../../../../server/utils/garmin')
    vi.spyOn(fetchers, 'refreshGarminIntegrationPermissions').mockImplementation(
      async (int: any) => int
    )
    vi.spyOn(fetchers, 'fetchGarminDailies').mockRejectedValue(
      new Error('Garmin API error (400): InvalidPullTokenException failure')
    )
    vi.spyOn(fetchers, 'fetchGarminSleeps').mockRejectedValue(
      new Error('Garmin API error (400): InvalidPullTokenException failure')
    )
    vi.spyOn(fetchers, 'fetchGarminHRV').mockRejectedValue(
      new Error('Garmin API error (400): InvalidPullTokenException failure')
    )
    vi.spyOn(fetchers, 'fetchGarminBodyComps').mockRejectedValue(
      new Error('Garmin API error (400): InvalidPullTokenException failure')
    )
    vi.spyOn(fetchers, 'fetchGarminUserMetrics').mockRejectedValue(
      new Error('Garmin API error (400): InvalidPullTokenException failure')
    )
    vi.spyOn(fetchers, 'fetchGarminActivities').mockRejectedValue(
      new Error('Garmin API error (400): InvalidPullTokenException failure')
    )

    const result = await GarminService.runIngestGarmin({ userId: 'user-123' })

    expect(result.success).toBe(true)
    expect(result.backfillTriggered).toBe(true)
    expect(startBackfillSpy).toHaveBeenCalledWith('user-123')
    expect(prismaMock.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'int-123' },
        data: expect.objectContaining({
          syncStatus: 'SUCCESS',
          errorMessage: expect.stringContaining('Direct pull restricted by Garmin Health API')
        })
      })
    )

    vi.restoreAllMocks()
  })
})

describe('GarminService activity push stream & file ingestion', () => {
  it('does not attempt direct REST file download during processActivities when pullToken is absent', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ dashboardSettings: {} })
    prismaMock.fitFile = { findUnique: vi.fn().mockResolvedValue(null) } as any

    const garminModule = await import('../../../../../server/utils/garmin')
    const fetchFileSpy = vi
      .spyOn(garminModule, 'fetchGarminActivityFile')
      .mockResolvedValue(Buffer.from('fake'))

    const workoutRepoModule =
      await import('../../../../../server/utils/repositories/workoutRepository')
    const upsertSpy = vi.spyOn(workoutRepoModule.workoutRepository, 'upsert').mockResolvedValue({
      record: { id: 'workout-100' } as any,
      created: true
    })

    const streamRepoModule =
      await import('../../../../../server/utils/repositories/workoutStreamRepository')
    vi.spyOn(streamRepoModule.workoutStreamRepository, 'existsByWorkoutId').mockResolvedValue(false)

    await GarminService.processActivities(
      'user-1',
      [{ summaryId: 'activity-100', startTimeInSeconds: 1700000000, activityType: 'RUNNING' }],
      { id: 'int-1' }
    )

    expect(fetchFileSpy).not.toHaveBeenCalled()
    expect(upsertSpy).toHaveBeenCalledWith(
      'user-1',
      'garmin',
      'activity-100',
      expect.objectContaining({ externalId: 'activity-100', source: 'garmin' }),
      expect.objectContaining({ externalId: 'activity-100', source: 'garmin' })
    )
    vi.restoreAllMocks()
  })

  it('downloads FIT file directly and creates workout when activityFiles push arrives out-of-order', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ dashboardSettings: {} })
    prismaMock.workout = {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue({ rawJson: null }),
      update: vi.fn().mockResolvedValue({})
    } as any
    prismaMock.fitFile = {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({})
    } as any

    const garminModule = await import('../../../../../server/utils/garmin')
    const fetchByCallbackSpy = vi
      .spyOn(garminModule, 'fetchGarminActivityFileByCallbackUrl')
      .mockResolvedValue(Buffer.from('fake-fit-bytes'))

    const workoutRepoModule =
      await import('../../../../../server/utils/repositories/workoutRepository')
    const upsertSpy = vi.spyOn(workoutRepoModule.workoutRepository, 'upsert').mockResolvedValue({
      record: { id: 'workout-early-1', externalId: '23703759997' } as any,
      created: true
    })

    const streamRepoModule =
      await import('../../../../../server/utils/repositories/workoutStreamRepository')
    vi.spyOn(streamRepoModule.workoutStreamRepository, 'upsert').mockResolvedValue({} as any)

    const fitModule = await import('../../../../../server/utils/fit')
    vi.spyOn(fitModule, 'parseFitFile').mockResolvedValue({
      sessions: [
        {
          start_time: new Date(),
          total_timer_time: 1800,
          sport: 'running'
        }
      ],
      records: []
    } as any)

    await GarminService.processActivityFiles(
      'user-1',
      [
        {
          activityId: 23703759997,
          callbackURL:
            'https://apis.garmin.com/wellness-api/rest/activityFile?id=23703759997&token=abc123token'
        }
      ],
      { id: 'int-1' }
    )

    expect(fetchByCallbackSpy).toHaveBeenCalledWith(
      { id: 'int-1' },
      'https://apis.garmin.com/wellness-api/rest/activityFile?id=23703759997&token=abc123token'
    )
    expect(upsertSpy).toHaveBeenCalledWith(
      'user-1',
      'garmin',
      '23703759997',
      expect.objectContaining({ externalId: '23703759997', source: 'garmin' }),
      expect.objectContaining({ externalId: '23703759997', source: 'garmin' })
    )

    vi.restoreAllMocks()
  })

  it('marks file ingestion expired and requests backfill when activityFiles download token is invalid', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    prismaMock.workout = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'workout-expired-1',
        externalId: '23772550387',
        date: new Date('2026-07-01T10:00:00.000Z')
      }),
      findUnique: vi.fn().mockResolvedValue({
        rawJson: { activityName: 'Morning Run' }
      }),
      update: vi.fn().mockResolvedValue({})
    } as any
    prismaMock.fitFile = {
      findUnique: vi.fn().mockResolvedValue(null)
    } as any

    const streamRepoModule =
      await import('../../../../../server/utils/repositories/workoutStreamRepository')
    vi.spyOn(streamRepoModule.workoutStreamRepository, 'existsByWorkoutId').mockResolvedValue(false)

    const garminModule = await import('../../../../../server/utils/garmin')
    vi.spyOn(garminModule, 'fetchGarminActivityFileByCallbackUrl').mockRejectedValue(
      new garminModule.GarminDownloadTokenExpiredError(
        'Garmin File API error (400): Invalid download token',
        400
      )
    )
    const backfillSpy = vi
      .spyOn(garminModule, 'requestGarminBackfill')
      .mockResolvedValue({ success: true } as any)

    await expect(
      GarminService.processActivityFiles(
        'user-1',
        [
          {
            activityId: 23772550387,
            startTimeInSeconds: 1_720_000_000,
            callbackURL:
              'https://apis.garmin.com/wellness-api/rest/activityFile?id=23772550387&token=stale'
          }
        ],
        { id: 'int-1' }
      )
    ).resolves.toBeUndefined()

    expect(prismaMock.workout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'workout-expired-1' },
        data: expect.objectContaining({
          rawJson: expect.objectContaining({
            activityName: 'Morning Run',
            garminFileIngestion: expect.objectContaining({
              status: 'download_token_expired',
              retryable: true,
              externalId: '23772550387'
            })
          })
        })
      })
    )
    expect(backfillSpy).toHaveBeenCalledWith(
      { id: 'int-1' },
      'activities',
      1_720_000_000 - 3600,
      expect.any(Number)
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('download token expired'),
      expect.objectContaining({ workoutId: 'workout-expired-1' })
    )
    expect(errorSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('handles expired download tokens during processActivities without failing the batch', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    prismaMock.user.findUnique.mockResolvedValue({ dashboardSettings: {} })
    prismaMock.fitFile = { findUnique: vi.fn().mockResolvedValue(null) } as any
    prismaMock.workout = {
      findUnique: vi.fn().mockResolvedValue({ rawJson: {} }),
      update: vi.fn().mockResolvedValue({})
    } as any

    const garminModule = await import('../../../../../server/utils/garmin')
    vi.spyOn(garminModule, 'fetchGarminActivityFile').mockRejectedValue(
      new Error('Garmin File API error (400): Invalid download token')
    )
    const backfillSpy = vi
      .spyOn(garminModule, 'requestGarminBackfill')
      .mockResolvedValue({ success: true } as any)

    const workoutRepoModule =
      await import('../../../../../server/utils/repositories/workoutRepository')
    vi.spyOn(workoutRepoModule.workoutRepository, 'upsert').mockResolvedValue({
      record: { id: 'workout-200', externalId: 'activity-200' } as any,
      created: true
    })

    const streamRepoModule =
      await import('../../../../../server/utils/repositories/workoutStreamRepository')
    vi.spyOn(streamRepoModule.workoutStreamRepository, 'existsByWorkoutId').mockResolvedValue(false)

    await expect(
      GarminService.processActivities(
        'user-1',
        [
          {
            summaryId: 'activity-200',
            startTimeInSeconds: 1_720_000_100,
            activityType: 'RUNNING'
          }
        ],
        { id: 'int-1' },
        'stale-pull-token'
      )
    ).resolves.toBeUndefined()

    expect(prismaMock.workout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'workout-200' },
        data: expect.objectContaining({
          rawJson: expect.objectContaining({
            garminFileIngestion: expect.objectContaining({
              status: 'download_token_expired',
              retryable: true,
              externalId: 'activity-200'
            })
          })
        })
      })
    )
    expect(backfillSpy).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})

// CW-99: Integration(provider, externalUserId) unique index + P2002 handling.
describe('isGarminExternalUserIdConflict', () => {
  it('detects a driver-adapter P2002 error, stripping the quote artifact Postgres adds to camelCase field names', () => {
    // This is the exact shape captured from a real Postgres 16 +
    // @prisma/adapter-pg 7.8.0 violation of the multi-column
    // Integration_provider_externalUserId_key index: the "provider" entry is
    // clean, but "externalUserId" comes back with literal embedded quotes
    // because Postgres quotes camelCase identifiers when rendering the index
    // definition and the driver adapter does not strip them.
    const dbError = {
      code: 'P2002',
      meta: {
        modelName: 'Integration',
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            originalCode: '23505',
            originalMessage:
              'duplicate key value violates unique constraint "Integration_provider_externalUserId_key"',
            kind: 'UniqueConstraintViolation',
            constraint: { fields: ['provider', '"externalUserId"'] }
          }
        }
      }
    }

    expect(isGarminExternalUserIdConflict(dbError)).toBe(true)
  })

  it('detects a classic-engine-shaped P2002 error (meta.target)', () => {
    const dbError = {
      code: 'P2002',
      meta: { target: ['provider', 'externalUserId'] }
    }

    expect(isGarminExternalUserIdConflict(dbError)).toBe(true)
  })

  it('ignores P2002 on an unrelated constraint, e.g. Integration_userId_provider_key', () => {
    const dbError = {
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { fields: ['"userId"', 'provider'] } }
        }
      }
    }

    expect(isGarminExternalUserIdConflict(dbError)).toBe(false)
  })

  it('ignores non-P2002 errors and malformed error shapes', () => {
    expect(isGarminExternalUserIdConflict(new Error('boom'))).toBe(false)
    expect(isGarminExternalUserIdConflict({ code: 'P2025' })).toBe(false)
    expect(isGarminExternalUserIdConflict(null)).toBe(false)
    expect(isGarminExternalUserIdConflict(undefined)).toBe(false)
    expect(isGarminExternalUserIdConflict({ code: 'P2002' })).toBe(false)
    expect(isGarminExternalUserIdConflict({ code: 'P2002', meta: {} })).toBe(false)
  })
})

describe('CW-99: concurrent Garmin OAuth callback race', () => {
  // Mirrors the try/catch structure in
  // server/api/integrations/garmin/callback.get.ts: an application-level
  // findFirst pre-check, then an upsert whose P2002 is interpreted with the
  // real isGarminExternalUserIdConflict guard under test. This proves the
  // exported guard, wired the way the callback wires it, turns a raw DB
  // constraint violation into a clean "already linked" outcome instead of an
  // unhandled crash.
  async function runGarminCallbackUpsert(userId: string, externalUserId: string) {
    const existingOwner = await prismaMock.integration.findFirst({
      where: { provider: 'garmin', externalUserId, NOT: { userId } },
      select: { userId: true }
    })

    if (existingOwner) {
      return { outcome: 'already-linked' as const }
    }

    try {
      const integration = await prismaMock.integration.upsert({
        where: { userId_provider: { userId, provider: 'garmin' } },
        create: { userId, provider: 'garmin', externalUserId },
        update: { externalUserId }
      })
      return { outcome: 'linked' as const, integration }
    } catch (dbError: any) {
      if (isGarminExternalUserIdConflict(dbError)) {
        return { outcome: 'already-linked' as const }
      }
      throw dbError
    }
  }

  it('gives the second of two concurrent callbacks for the same externalUserId a clean already-linked outcome, not a crash or a duplicate row', async () => {
    const externalUserId = 'garmin-ext-race-1'
    const driverAdapterP2002 = {
      code: 'P2002',
      meta: {
        modelName: 'Integration',
        driverAdapterError: {
          cause: {
            originalCode: '23505',
            kind: 'UniqueConstraintViolation',
            constraint: { fields: ['provider', '"externalUserId"'] }
          }
        }
      }
    }

    // Both requests race past the pre-check before either has written.
    prismaMock.integration.findFirst.mockResolvedValue(null)

    // First writer wins the DB-level race and succeeds.
    prismaMock.integration.upsert.mockResolvedValueOnce({
      id: 'int-user-a',
      userId: 'user-a',
      provider: 'garmin',
      externalUserId
    })
    // Second writer loses the race: the unique index added in CW-99 rejects
    // the write with P2002 instead of silently creating a duplicate mapping.
    prismaMock.integration.upsert.mockRejectedValueOnce(driverAdapterP2002)

    const [resultA, resultB] = await Promise.all([
      runGarminCallbackUpsert('user-a', externalUserId),
      runGarminCallbackUpsert('user-b', externalUserId)
    ])

    expect(resultA).toEqual({
      outcome: 'linked',
      integration: { id: 'int-user-a', userId: 'user-a', provider: 'garmin', externalUserId }
    })
    expect(resultB).toEqual({ outcome: 'already-linked' })
    expect(prismaMock.integration.upsert).toHaveBeenCalledTimes(2)
  })

  it('rethrows unrelated database errors instead of masking them as already-linked', async () => {
    prismaMock.integration.findFirst.mockResolvedValue(null)
    prismaMock.integration.upsert.mockRejectedValueOnce(new Error('connection reset'))

    await expect(runGarminCallbackUpsert('user-c', 'garmin-ext-2')).rejects.toThrow(
      'connection reset'
    )
  })
})

describe('CW-95: GarminService.startBackfill result reporting', () => {
  const BACKFILL_TYPES = [
    'activities',
    'dailies',
    'sleeps',
    'hrv',
    'bodyComps',
    'userMetrics'
  ] as const

  async function garminModule() {
    return await import('../../../../../server/utils/garmin')
  }

  it('reports a missing integration instead of silently returning success', async () => {
    prismaMock.integration.findUnique.mockResolvedValue(null)
    const fetchers = await garminModule()
    const backfillSpy = vi.spyOn(fetchers, 'requestGarminBackfill')

    const result = await GarminService.startBackfill('user-without-garmin')

    expect(result).toEqual({ status: 'no-integration', requested: [], failed: [] })
    expect(backfillSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('reports total failure when every backfill request is rejected', async () => {
    prismaMock.integration.findUnique.mockResolvedValue({
      id: 'int-1',
      userId: 'user-1',
      provider: 'garmin'
    })
    const fetchers = await garminModule()
    vi.spyOn(fetchers, 'requestGarminBackfill').mockRejectedValue(
      new Error('Garmin Backfill API error (403): User not registered with consumer')
    )

    const result = await GarminService.startBackfill('user-1')

    expect(result.status).toBe('failed')
    expect(result.requested).toEqual([])
    expect(result.failed.map((f) => f.type)).toEqual([...BACKFILL_TYPES])
    expect(result.failed[0]?.error).toContain('User not registered with consumer')

    vi.restoreAllMocks()
  })

  it('reports partial success with the exact types that succeeded and failed', async () => {
    prismaMock.integration.findUnique.mockResolvedValue({
      id: 'int-1',
      userId: 'user-1',
      provider: 'garmin'
    })
    const fetchers = await garminModule()
    vi.spyOn(fetchers, 'requestGarminBackfill').mockImplementation(async (_int, type) => {
      if (type === 'hrv' || type === 'bodyComps') {
        throw new Error(`Garmin Backfill API error (400): ${type} not permitted`)
      }
      return { success: true }
    })

    const result = await GarminService.startBackfill('user-1')

    expect(result.status).toBe('partial')
    expect(result.requested).toEqual(['activities', 'dailies', 'sleeps', 'userMetrics'])
    expect(result.failed).toEqual([
      { type: 'hrv', error: 'Garmin Backfill API error (400): hrv not permitted' },
      { type: 'bodyComps', error: 'Garmin Backfill API error (400): bodyComps not permitted' }
    ])

    vi.restoreAllMocks()
  })

  it('reports full success for every requested type', async () => {
    prismaMock.integration.findUnique.mockResolvedValue({
      id: 'int-1',
      userId: 'user-1',
      provider: 'garmin'
    })
    const fetchers = await garminModule()
    const backfillSpy = vi
      .spyOn(fetchers, 'requestGarminBackfill')
      .mockResolvedValue({ success: true })

    const result = await GarminService.startBackfill('user-1')

    expect(result).toEqual({ status: 'success', requested: [...BACKFILL_TYPES], failed: [] })
    expect(backfillSpy).toHaveBeenCalledTimes(BACKFILL_TYPES.length)

    vi.restoreAllMocks()
  })
})

describe('CW-95: garmin-backfill task surfaces backfill status to the platform', () => {
  async function runBackfillTask(userId: string) {
    const { garminBackfillTask } = await import('../../../../../trigger/garmin-backfill')
    return await (garminBackfillTask as any).run({ userId, delaySeconds: 0 })
  }

  it('fails the task when the user has no Garmin integration', async () => {
    vi.spyOn(GarminService, 'startBackfill').mockResolvedValue({
      status: 'no-integration',
      requested: [],
      failed: []
    })

    await expect(runBackfillTask('user-without-garmin')).rejects.toThrow(
      /no Garmin integration found for user user-without-garmin/
    )

    vi.restoreAllMocks()
  })

  it('fails the task when every backfill request fails', async () => {
    vi.spyOn(GarminService, 'startBackfill').mockResolvedValue({
      status: 'failed',
      requested: [],
      failed: [
        { type: 'activities', error: 'boom-activities' },
        { type: 'dailies', error: 'boom-dailies' }
      ]
    })

    await expect(runBackfillTask('user-1')).rejects.toThrow(
      /all 2 backfill requests were rejected .*boom-activities.*boom-dailies/s
    )

    vi.restoreAllMocks()
  })

  it('succeeds with an explicit summary when only some types fail', async () => {
    vi.spyOn(GarminService, 'startBackfill').mockResolvedValue({
      status: 'partial',
      requested: ['activities', 'dailies'],
      failed: [{ type: 'hrv', error: 'hrv not permitted' }]
    })

    const result = await runBackfillTask('user-1')

    expect(result).toEqual({
      success: true,
      status: 'partial',
      requested: ['activities', 'dailies'],
      failed: [{ type: 'hrv', error: 'hrv not permitted' }]
    })

    vi.restoreAllMocks()
  })

  it('keeps reporting success for a fully successful backfill', async () => {
    vi.spyOn(GarminService, 'startBackfill').mockResolvedValue({
      status: 'success',
      requested: ['activities', 'dailies', 'sleeps', 'hrv', 'bodyComps', 'userMetrics'],
      failed: []
    })

    const result = await runBackfillTask('user-1')

    expect(result).toMatchObject({ success: true, status: 'success', failed: [] })
    expect(result.requested).toHaveLength(6)

    vi.restoreAllMocks()
  })
})
