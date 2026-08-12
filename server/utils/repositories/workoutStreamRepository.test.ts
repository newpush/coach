import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../db'
import {
  enforceNoNullStreamElements,
  extractDecodeColumn,
  workoutStreamRepository
} from './workoutStreamRepository'

vi.mock('../db', () => ({
  prisma: {
    workoutStreamV2: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn()
    },
    workoutStream: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    $queryRaw: vi.fn()
  }
}))

const db = prisma as unknown as {
  workoutStreamV2: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  workoutStream: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  $queryRaw: ReturnType<typeof vi.fn>
}

/**
 * The exact shape of the Prisma client failure this ticket is about: Postgres
 * allows a NULL element inside an `integer[]`, the client's decoder does not.
 */
function decodeError(column: string): Error {
  return new Error(`Expected an integer in column '${column}', got object: null`)
}

/** A WorkoutStreamV2 row as the DB returns it once NULL elements are repaired. */
function repairedRow(workoutId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `stream-${workoutId}`,
    workoutId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    time: [0, 1, 2],
    heartrate: [120, 121, 122],
    watts: [200, 0, 210],
    velocity: [5.1, 5.2, 5.3],
    cadence: [90, 0, 91],
    lat: [47.5, 47.5, 47.5],
    lng: [19.0, 19.0, 19.0],
    hrZoneTimes: null,
    powerZoneTimes: null,
    ...overrides
  }
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  // V1 is empty in production; individual tests override where it matters.
  db.workoutStream.findUnique.mockResolvedValue(null)
  db.workoutStream.findMany.mockResolvedValue([])
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('extractDecodeColumn', () => {
  it('pulls the offending column out of a Prisma decode error', () => {
    expect(extractDecodeColumn(decodeError('cadence[593]'))).toBe('cadence[593]')
  })

  it('returns null for an error that names no column', () => {
    expect(extractDecodeColumn(new Error('connection reset'))).toBeNull()
  })
})

describe('findByWorkoutId', () => {
  it('returns usable stream data for a row whose arrays contain NULL elements', async () => {
    db.workoutStreamV2.findMany.mockRejectedValue(decodeError('cadence[593]'))
    db.$queryRaw.mockResolvedValue([repairedRow('workout-1')])

    const stream = await workoutStreamRepository.findByWorkoutId('workout-1')

    expect(stream).not.toBeNull()
    expect(stream?.workoutId).toBe('workout-1')
    // NULL elements are coerced to 0 rather than dropped, so every series stays
    // index-aligned with `time`.
    expect(stream?.cadence).toEqual([90, 0, 91])
    expect(stream?.time).toEqual([0, 1, 2])
    expect(stream?.latlng).toEqual([
      [47.5, 19.0],
      [47.5, 19.0],
      [47.5, 19.0]
    ])
    // The undecodable row must not fall through to the (production-empty) V1 table.
    expect(db.workoutStream.findUnique).not.toHaveBeenCalled()
  })

  it('logs the workout id and the offending column instead of swallowing the error', async () => {
    db.workoutStreamV2.findMany.mockRejectedValue(decodeError('cadence[593]'))
    db.$queryRaw.mockResolvedValue([repairedRow('workout-1')])

    await workoutStreamRepository.findByWorkoutId('workout-1')

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[workoutStreamRepository] stream read failed',
      expect.objectContaining({
        operation: 'findByWorkoutId',
        table: 'WorkoutStreamV2',
        column: 'cadence[593]',
        workoutIds: ['workout-1']
      })
    )
  })

  it('logs when the legacy V1 fallback read fails', async () => {
    db.workoutStreamV2.findMany.mockResolvedValue([])
    db.workoutStream.findUnique.mockRejectedValue(new Error('connection reset'))

    await expect(workoutStreamRepository.findByWorkoutId('workout-1')).resolves.toBeNull()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[workoutStreamRepository] stream read failed',
      expect.objectContaining({ operation: 'findByWorkoutId', table: 'WorkoutStream' })
    )
  })
})

describe('findManyByWorkoutIds', () => {
  it('repairs the whole batch in SQL when one row cannot be decoded', async () => {
    db.workoutStreamV2.findMany.mockRejectedValue(decodeError('watts[12]'))
    db.$queryRaw.mockResolvedValue([
      repairedRow('good-1'),
      repairedRow('bad-1'),
      repairedRow('good-2')
    ])

    const streams = await workoutStreamRepository.findManyByWorkoutIds([
      'good-1',
      'bad-1',
      'good-2'
    ])

    expect([...streams.keys()].sort()).toEqual(['bad-1', 'good-1', 'good-2'])
    expect(streams.get('bad-1')?.watts).toEqual([200, 0, 210])
  })

  it('returns every row it can decode and omits only the undecodable one', async () => {
    // Both the typed read and the SQL repair fail, forcing the per-row path.
    db.workoutStreamV2.findMany.mockRejectedValue(decodeError('cadence[593]'))
    db.$queryRaw.mockRejectedValue(new Error('relation "WorkoutStreamV2" is not available'))
    db.workoutStreamV2.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.workoutId === 'bad-1') throw decodeError('cadence[593]')
      return repairedRow(where.workoutId)
    })

    const streams = await workoutStreamRepository.findManyByWorkoutIds([
      'good-1',
      'bad-1',
      'good-2'
    ])

    expect([...streams.keys()].sort()).toEqual(['good-1', 'good-2'])
    expect(streams.has('bad-1')).toBe(false)
    expect(streams.get('good-1')?.time).toEqual([0, 1, 2])
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[workoutStreamRepository] stream read failed',
      expect.objectContaining({
        operation: 'findManyByWorkoutIds:per-row',
        workoutIds: ['bad-1']
      })
    )
  })

  it('leaves the clean path untouched', async () => {
    db.workoutStreamV2.findMany.mockResolvedValue([repairedRow('good-1')])

    const streams = await workoutStreamRepository.findManyByWorkoutIds(['good-1'])

    expect(streams.get('good-1')?.watts).toEqual([200, 0, 210])
    expect(db.$queryRaw).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})

describe('findWattsByWorkoutIds', () => {
  it('recovers watts from a row with NULL elements', async () => {
    db.workoutStreamV2.findMany.mockRejectedValue(decodeError('watts[41]'))
    db.$queryRaw.mockResolvedValue([{ workoutId: 'workout-1', watts: [250, 0, 260] }])

    const watts = await workoutStreamRepository.findWattsByWorkoutIds(['workout-1'])

    expect(watts.get('workout-1')).toEqual([250, 0, 260])
  })
})

describe('upsert write guard', () => {
  it('never writes a NULL element into a numeric or boolean array', async () => {
    db.workoutStreamV2.upsert.mockResolvedValue({ id: 'stream-1' })

    await workoutStreamRepository.upsert('workout-1', {
      time: [0, null as any, 2],
      cadence: [90, null as any, 91],
      watts: [200, undefined as any, 210],
      altitude: [100.5, null as any, 101.5],
      moving: [true, null as any, false],
      latlng: [
        [47.5, 19.0],
        [null as any, 19.1],
        [47.6, 19.2]
      ]
    })

    const payload = db.workoutStreamV2.upsert.mock.calls[0]?.[0].update
    for (const column of ['time', 'cadence', 'watts', 'altitude', 'moving', 'lat', 'lng']) {
      expect(payload[column].some((value: unknown) => value == null)).toBe(false)
    }
    expect(payload.time).toEqual([0, 0, 2])
    expect(payload.cadence).toEqual([90, 0, 91])
    expect(payload.watts).toEqual([200, 0, 210])
    expect(payload.moving).toEqual([true, false, false])
    // The invalid GPS point is skipped, so lat/lng stay pairwise consistent.
    expect(payload.lat).toHaveLength(2)
    expect(payload.lng).toHaveLength(2)
  })

  it('logs loudly if a NULL element ever reaches the final guard', () => {
    const writeData: Record<string, unknown> = { cadence: [90, null, 91], lapSplits: [null] }

    enforceNoNullStreamElements(writeData, 'workout-1')

    expect(writeData.cadence).toEqual([90, 0, 91])
    // JSON metadata may legitimately contain nulls and must not be rewritten.
    expect(writeData.lapSplits).toEqual([null])
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[workoutStreamRepository] blocked NULL element in stream write',
      expect.objectContaining({ workoutId: 'workout-1', column: 'cadence', index: 1 })
    )
  })
})
