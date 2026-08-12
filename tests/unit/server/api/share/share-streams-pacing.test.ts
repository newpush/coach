import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CW-441: the public share endpoint must gate the split-strategy verdict the same way the
 * owner's pacing card does (CW-436) and the AI prompt does (CW-389).
 *
 * Two things are being pinned here:
 *  1. the verdict itself -- withheld for an intervalled/stochastic session, graded otherwise,
 *     decided by the SHARED `resolveSplitPacingVerdictApplicability` (left unmocked on
 *     purpose; only the facts BUILDER is stubbed, so the gate under test is the real one);
 *  2. that nothing about the workout owner leaks into a public payload as a side effect of
 *     needing the owner's sport settings to build those facts (CW-418).
 */

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('defineRouteMeta', () => undefined)
vi.stubGlobal('createError', (err: any) => {
  const error = new Error(err.message || err.statusMessage)
  ;(error as any).statusCode = err.statusCode
  return error
})
vi.stubGlobal('getRouterParam', (event: any, key: string) => event.context?.params?.[key])

const shareTokenFindUnique = vi.fn()
const workoutFindUnique = vi.fn()
const workoutFindFirst = vi.fn()

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    shareToken: { findUnique: shareTokenFindUnique },
    workout: { findUnique: workoutFindUnique }
  }
}))

// The owner endpoint reaches `prisma` through Nuxt's auto-import rather than a module import.
vi.stubGlobal('prisma', {
  shareToken: { findUnique: shareTokenFindUnique },
  workout: { findUnique: workoutFindUnique, findFirst: workoutFindFirst }
})

const findByWorkoutId = vi.fn()
const updateMetadata = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../../server/utils/repositories/workoutStreamRepository', () => ({
  workoutStreamRepository: { findByWorkoutId, updateMetadata }
}))

const getForActivityType = vi.fn()

vi.mock('../../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getForActivityType }
}))

const buildWorkoutAnalysisFactsV2 = vi.fn()

// Only the builder is stubbed: the module's other exports are real, and the gate itself
// (`resolveSplitPacingVerdictApplicability`, reached through `analyzePacingStrategy`) is the
// production one, so these tests exercise the shared implementation rather than a stand-in.
vi.mock('../../../../../server/utils/workout-analysis-facts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildWorkoutAnalysisFactsV2
}))

vi.mock('../../../../../server/utils/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'owner-user-1' })
}))

const OWNER_ID = 'owner-user-1'
const SHARE_TOKEN = 'share-token'

// Two splits: the second half is 30s/km slower than the first, i.e. the raw numbers say
// "positive split". For an intervalled session that verdict is meaningless and must be withheld.
const LAP_SPLITS = [
  { lap: 1, distance: 1000, time: 300, paceSeconds: 300 },
  { lap: 2, distance: 1000, time: 330, paceSeconds: 330 }
]

// Owner-only detection inputs. None of these may appear in the share response.
const OWNER_SPORT_SETTINGS = {
  lthr: 168,
  maxHr: 190,
  ftp: 260,
  hrZones: [{ min: 0, max: 120 }],
  powerZones: [{ min: 0, max: 150 }]
}

function factsWithSteadiness(sessionSteadiness: string) {
  return {
    guardrails: {
      archetype: { sessionSteadiness }
    }
  } as any
}

function makeStream(overrides: Record<string, any> = {}) {
  return {
    id: 'stream-1',
    workoutId: 'workout-1',
    lapSplits: LAP_SPLITS,
    avgPacePerKm: 5.25,
    paceVariability: 15,
    // The persisted verdict, computed at ingestion with no facts available.
    pacingStrategy: {
      strategy: 'positive_split',
      description: 'Started fast and slowed down (positive split)',
      evenness: 85,
      verdictApplicable: true,
      verdictWithheldReason: null
    },
    ...overrides
  }
}

function makeSharedWorkout() {
  return {
    id: 'workout-1',
    userId: OWNER_ID,
    type: 'Run',
    maxHr: 182,
    plannedWorkout: null,
    user: {
      distanceUnits: 'Kilometers',
      weight: 70,
      weightUnits: 'kg',
      language: 'en'
    }
  }
}

function makeRawSplitsWorkout() {
  return {
    ...makeSharedWorkout(),
    rawJson: {
      splits_metric: [
        { distance: 1000, moving_time: 300, average_heartrate: 150, average_speed: 3.33 },
        { distance: 1000, moving_time: 330, average_heartrate: 155, average_speed: 3.03 }
      ]
    }
  }
}

async function callShareStreams() {
  const mod = await import('../../../../../server/api/share/workouts/[token]/streams.get')
  return mod.default({ context: { params: { token: SHARE_TOKEN } } })
}

async function callOwnerStreams() {
  const mod = await import('../../../../../server/api/workouts/[id]/streams.get')
  return mod.default({ context: { params: { id: 'workout-1' } } })
}

describe('GET /api/share/workouts/[token]/streams pacing verdict gate (CW-441)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getForActivityType.mockResolvedValue(OWNER_SPORT_SETTINGS)
    buildWorkoutAnalysisFactsV2.mockReturnValue(factsWithSteadiness('steady'))
    shareTokenFindUnique.mockResolvedValue({
      resourceType: 'WORKOUT',
      resourceId: 'workout-1',
      expiresAt: null
    })
    workoutFindUnique.mockResolvedValue(makeSharedWorkout())
    findByWorkoutId.mockResolvedValue(makeStream())
  })

  describe('the verdict', () => {
    it('withholds the split-strategy verdict for a shared intervalled session', async () => {
      buildWorkoutAnalysisFactsV2.mockReturnValue(factsWithSteadiness('intervalled'))

      const result: any = await callShareStreams()

      expect(result.pacingStrategy.strategy).toBe('not_graded')
      expect(result.pacingStrategy.verdictApplicable).toBe(false)
      expect(result.pacingStrategy.verdictWithheldReason).toContain('intervalled')
      // The misleading persisted verdict must not survive into the shared payload.
      expect(result.pacingStrategy.strategy).not.toBe('positive_split')
    })

    it('withholds the verdict for a shared stochastic session', async () => {
      buildWorkoutAnalysisFactsV2.mockReturnValue(factsWithSteadiness('stochastic'))

      const result: any = await callShareStreams()

      expect(result.pacingStrategy.verdictApplicable).toBe(false)
      expect(result.pacingStrategy.strategy).toBe('not_graded')
    })

    it('leaves a shared steady session graded, exactly as before', async () => {
      const result: any = await callShareStreams()

      expect(result.pacingStrategy.strategy).toBe('positive_split')
      expect(result.pacingStrategy.verdictApplicable).toBe(true)
      expect(result.pacingStrategy.verdictWithheldReason).toBeNull()
    })

    it('keeps the split rows and the raw dispersion measurement when the verdict is withheld', async () => {
      buildWorkoutAnalysisFactsV2.mockReturnValue(factsWithSteadiness('intervalled'))

      const result: any = await callShareStreams()

      // It is the grading that is withheld, not the data.
      expect(result.lapSplits).toEqual(LAP_SPLITS)
      expect(result.paceVariability).toBe(15)
      expect(result.avgPacePerKm).toBe(5.25)
    })

    it('applies the same gate on the rawJson splits fallback path', async () => {
      findByWorkoutId.mockResolvedValue(null)
      workoutFindUnique.mockResolvedValue(makeRawSplitsWorkout())
      buildWorkoutAnalysisFactsV2.mockReturnValue(factsWithSteadiness('intervalled'))

      const result: any = await callShareStreams()

      expect(result.dataSource).toBe('splits_fallback')
      expect(result.pacingStrategy.strategy).toBe('not_graded')
      expect(result.pacingStrategy.verdictApplicable).toBe(false)
      expect(result.lapSplits).toHaveLength(2)
      expect(result.paceVariability).toBeGreaterThan(0)
    })
  })

  describe('facts build: lazy, memoised, fail-open', () => {
    it('does not build the facts when there are no splits to grade', async () => {
      findByWorkoutId.mockResolvedValue(makeStream({ lapSplits: null, pacingStrategy: null }))

      await callShareStreams()

      expect(buildWorkoutAnalysisFactsV2).not.toHaveBeenCalled()
      expect(getForActivityType).not.toHaveBeenCalled()
    })

    it('builds the facts at most once per request', async () => {
      await callShareStreams()

      expect(buildWorkoutAnalysisFactsV2).toHaveBeenCalledTimes(1)
    })

    it('fails open when the facts builder throws: the verdict stays applicable', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      buildWorkoutAnalysisFactsV2.mockImplementation(() => {
        throw new Error('facts builder exploded')
      })

      const result: any = await callShareStreams()

      // A facts problem must never take the pacing card down.
      expect(result.pacingStrategy.strategy).toBe('positive_split')
      expect(result.pacingStrategy.verdictApplicable).toBe(true)
      consoleError.mockRestore()
    })

    it('fails open when the owner sport settings lookup rejects', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      getForActivityType.mockRejectedValue(new Error('db down'))

      const result: any = await callShareStreams()

      expect(result.pacingStrategy.verdictApplicable).toBe(true)
      consoleError.mockRestore()
    })
  })

  describe('owner settings resolution (CW-418 precedent)', () => {
    it("resolves sport settings from the workout OWNER's id, not from any viewer", async () => {
      await callShareStreams()

      expect(getForActivityType).toHaveBeenCalledWith(OWNER_ID, 'Run')
    })

    it('feeds the owner settings to the facts builder and to nothing else', async () => {
      await callShareStreams()

      const args = buildWorkoutAnalysisFactsV2.mock.calls[0]![0]
      expect(args.sportSettings).toBe(OWNER_SPORT_SETTINGS)
      expect(args.workout.userId).toBe(OWNER_ID)
    })
  })

  describe('the public payload leaks nothing about the owner', () => {
    const forbiddenKeys = [
      'user',
      'userId',
      'lthr',
      'maxHr',
      'ftp',
      'hrZones',
      'powerZones',
      'sportSettings',
      'weight',
      'weightUnits',
      'language',
      'plannedWorkout'
    ]

    it('returns no owner fields and no owner id on the stream path', async () => {
      buildWorkoutAnalysisFactsV2.mockReturnValue(factsWithSteadiness('intervalled'))

      const result: any = await callShareStreams()

      for (const key of forbiddenKeys) {
        expect(result).not.toHaveProperty(key)
      }
      // Nothing nested carries it either.
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain(OWNER_ID)
      expect(serialized).not.toContain(String(OWNER_SPORT_SETTINGS.lthr))
      expect(serialized).not.toContain(String(OWNER_SPORT_SETTINGS.ftp))
    })

    it('returns no owner fields and no owner id on the splits fallback path', async () => {
      findByWorkoutId.mockResolvedValue(null)
      workoutFindUnique.mockResolvedValue(makeRawSplitsWorkout())

      const result: any = await callShareStreams()

      for (const key of forbiddenKeys) {
        expect(result).not.toHaveProperty(key)
      }
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain(OWNER_ID)
      expect(serialized).not.toContain(String(OWNER_SPORT_SETTINGS.lthr))
      expect(serialized).not.toContain(String(OWNER_SPORT_SETTINGS.ftp))
    })

    it('exposes the same keys it exposed before the gate was added', async () => {
      // The response is still the stream record, verdict aside: no key was gained.
      const result: any = await callShareStreams()

      expect(Object.keys(result).sort()).toEqual(Object.keys(makeStream()).sort())
    })
  })

  describe('owner view and share view agree (CW-436 / CW-441)', () => {
    beforeEach(() => {
      workoutFindFirst.mockResolvedValue({
        ...makeSharedWorkout(),
        user: {
          ftp: 260,
          maxHr: 190,
          lthr: 168,
          distanceUnits: 'Kilometers',
          weight: 70,
          weightUnits: 'kg',
          language: 'en'
        }
      })
    })

    it('withholds the verdict on both endpoints for the same intervalled workout', async () => {
      buildWorkoutAnalysisFactsV2.mockReturnValue(factsWithSteadiness('intervalled'))

      const shared: any = await callShareStreams()
      findByWorkoutId.mockResolvedValue(makeStream())
      const owner: any = await callOwnerStreams()

      expect(shared.pacingStrategy).toEqual(owner.pacingStrategy)
      expect(shared.pacingStrategy.verdictApplicable).toBe(false)
    })

    it('grades the verdict on both endpoints for the same steady workout', async () => {
      const shared: any = await callShareStreams()
      findByWorkoutId.mockResolvedValue(makeStream())
      const owner: any = await callOwnerStreams()

      expect(shared.pacingStrategy).toEqual(owner.pacingStrategy)
      expect(shared.pacingStrategy.verdictApplicable).toBe(true)
    })
  })
})
