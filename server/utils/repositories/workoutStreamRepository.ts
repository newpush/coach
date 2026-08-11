import { prisma } from '../db'
import { toPrismaInputJsonValue } from '../prisma-json'

export type NormalizedStream = {
  id: string
  workoutId: string
  time: number[] | null
  distance: number[] | null
  velocity: number[] | null
  heartrate: number[] | null
  cadence: number[] | null
  watts: number[] | null
  altitude: number[] | null
  latlng: [number, number][] | null
  grade: number[] | null
  moving: boolean[] | null
  temp: number[] | null
  torque: number[] | null
  leftRightBalance: number[] | null
  hrv: number[] | null
  respiration: number[] | null
  targetPower: number[] | null
  avgPacePerKm: number | null
  paceVariability: number | null
  lapSplits: unknown
  paceZones: unknown
  pacingStrategy: unknown
  surges: unknown
  hrZoneTimes: unknown
  powerZoneTimes: unknown
  extrasMeta: unknown
  createdAt: Date
  updatedAt: Date
}

function normalizeV2(stream: any): NormalizedStream {
  const { lat, lng, ...rest } = stream
  const latlng: [number, number][] | null =
    Array.isArray(lat) && lat.length > 0
      ? (lat as number[]).map((latVal: number, i: number) => [latVal, (lng as number[])[i] ?? 0])
      : null
  return { ...rest, latlng }
}

function hasUsableStreamData(stream: NormalizedStream | null): stream is NormalizedStream {
  if (!stream) return false
  if (Array.isArray(stream.time) && stream.time.length > 0) return true
  if (Array.isArray(stream.heartrate) && stream.heartrate.length > 0) return true
  if (Array.isArray(stream.watts) && stream.watts.length > 0) return true
  if (Array.isArray(stream.velocity) && stream.velocity.length > 0) return true
  if (Array.isArray(stream.latlng) && stream.latlng.length > 0) return true
  if (stream.hrZoneTimes != null) return true
  if (stream.powerZoneTimes != null) return true
  return false
}

function toNormalizedFromV1(stream: any): NormalizedStream {
  return stream as NormalizedStream
}

/** Prisma Int[] columns reject null elements; preserve series length by coercing gaps to 0. */
export function sanitizeIntStreamArray(values: readonly unknown[] | null | undefined): number[] {
  if (!values?.length) return []
  return values.map((value) => {
    if (value == null || !Number.isFinite(Number(value))) return 0
    return Math.trunc(Number(value))
  })
}

/**
 * Prisma Float[] columns reject nulls and mixed integer/float elements in one array.
 * Coerce nulls to 0 and ensure whole numbers are encoded as floats for client validation.
 */
export function sanitizeFloatStreamArray(values: readonly unknown[] | null | undefined): number[] {
  if (!values?.length) return []
  return values.map((value) => {
    if (value == null || !Number.isFinite(Number(value))) return 0
    const n = Number(value)
    return Number.isInteger(n) ? n + 1e-9 : n
  })
}

/** @deprecated Use sanitizeIntStreamArray or sanitizeFloatStreamArray */
export function sanitizeNumericStreamArray(values: number[] | null | undefined): number[] {
  return sanitizeIntStreamArray(values)
}

export function sanitizeBooleanStreamArray(values: boolean[] | null | undefined): boolean[] {
  if (!values?.length) return []
  return values.map((value) => value === true)
}

/** Intervals stream payloads can include null lat/lng pairs; skip invalid points instead of throwing. */
export function splitLatlngPoints(latlng: readonly unknown[] | null | undefined): {
  lat: number[]
  lng: number[]
} {
  if (!latlng?.length) return { lat: [], lng: [] }

  const lat: number[] = []
  const lng: number[] = []

  for (const point of latlng) {
    if (!Array.isArray(point) || point.length < 2) continue

    const latVal = point[0]
    const lngVal = point[1]
    if (latVal == null || lngVal == null) continue
    if (!Number.isFinite(Number(latVal)) || !Number.isFinite(Number(lngVal))) continue

    lat.push(Number(latVal))
    lng.push(Number(lngVal))
  }

  return { lat, lng }
}

export async function attachStreamToWorkout<T extends { id: string }>(
  workout: T
): Promise<T & { streams: NormalizedStream | null }> {
  const streams = await workoutStreamRepository.findByWorkoutId(workout.id)
  return { ...workout, streams }
}

export async function attachStreamsToWorkouts<T extends { id: string }>(
  workouts: T[],
  options?: FindManyByWorkoutIdsOptions
): Promise<Array<T & { streams: NormalizedStream | null }>> {
  const streamMap = await workoutStreamRepository.findManyByWorkoutIds(
    workouts.map((w) => w.id),
    options
  )
  return workouts.map((workout) => ({
    ...workout,
    streams: streamMap.get(workout.id) ?? null
  }))
}

/**
 * Optional, non-mandatory NormalizedStream fields that a caller of
 * findManyByWorkoutIds/attachStreamsToWorkouts can opt into fetching on top of
 * the mandatory baseline (see REQUIRED_V2_SELECT/REQUIRED_V1_SELECT below).
 */
export type WorkoutStreamOptionalField =
  | 'distance'
  | 'cadence'
  | 'altitude'
  | 'grade'
  | 'moving'
  | 'temp'
  | 'torque'
  | 'leftRightBalance'
  | 'hrv'
  | 'respiration'
  | 'targetPower'
  | 'avgPacePerKm'
  | 'paceVariability'
  | 'lapSplits'
  | 'paceZones'
  | 'pacingStrategy'
  | 'surges'
  | 'extrasMeta'

export interface FindManyByWorkoutIdsOptions {
  /**
   * Extra columns to fetch beyond the mandatory baseline. When omitted
   * (undefined), every column is fetched -- this is the original/default
   * behavior and should be kept for callers that need full-fidelity stream
   * data (e.g. the GDPR/migration data export in data-management/collector.ts).
   *
   * When provided (including an empty array), only the mandatory baseline
   * fields plus whatever is listed here are fetched, which is dramatically
   * cheaper for hot paths that read a handful of scalar fields (or none) off
   * potentially hundreds of workouts' streams at once.
   */
  fields?: readonly WorkoutStreamOptionalField[]
}

/**
 * Columns always fetched from WorkoutStreamV2 once a caller opts into a lean
 * `fields` selection. `time`/`heartrate`/`watts`/`velocity`/`lat`/`lng`/
 * `hrZoneTimes`/`powerZoneTimes` are required because hasUsableStreamData()
 * inspects them to decide whether a V2 row counts as "usable" stream data
 * (falling back to the legacy V1 table otherwise) -- dropping any of them
 * would silently change that determination for every caller, not just the
 * one requesting a lean select. `id`/`workoutId`/`createdAt`/`updatedAt` are
 * cheap identity/bookkeeping columns kept for parity with NormalizedStream.
 */
const REQUIRED_V2_SELECT = {
  id: true,
  workoutId: true,
  createdAt: true,
  updatedAt: true,
  time: true,
  heartrate: true,
  watts: true,
  velocity: true,
  lat: true,
  lng: true,
  hrZoneTimes: true,
  powerZoneTimes: true
} as const

/** Same rationale as REQUIRED_V2_SELECT, but for the legacy V1 fallback table (single `latlng` Json column instead of split lat/lng arrays). */
const REQUIRED_V1_SELECT = {
  id: true,
  workoutId: true,
  createdAt: true,
  updatedAt: true,
  time: true,
  heartrate: true,
  watts: true,
  velocity: true,
  latlng: true,
  hrZoneTimes: true,
  powerZoneTimes: true
} as const

function buildV2Select(
  fields: readonly WorkoutStreamOptionalField[] | undefined
): Record<string, true> | undefined {
  if (fields === undefined) return undefined
  const select: Record<string, true> = { ...REQUIRED_V2_SELECT }
  for (const field of fields) select[field] = true
  return select
}

function buildV1Select(
  fields: readonly WorkoutStreamOptionalField[] | undefined
): Record<string, true> | undefined {
  if (fields === undefined) return undefined
  const select: Record<string, true> = { ...REQUIRED_V1_SELECT }
  for (const field of fields) select[field] = true
  return select
}

/**
 * Max number of workout IDs per `IN (...)` clause. A Sentry-reported slow
 * query captured 623 workout IDs in a single IN clause; batching keeps each
 * round trip's result set (and the DB's work per query) bounded regardless
 * of how many workouts a caller asks for at once.
 */
const WORKOUT_ID_CHUNK_SIZE = 200

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (items.length <= size) return [items as T[]]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size) as T[])
  }
  return chunks
}

export const workoutStreamRepository = {
  async findByWorkoutId(workoutId: string): Promise<NormalizedStream | null> {
    const v2 = await (prisma as any).workoutStreamV2
      .findUnique({ where: { workoutId } })
      .catch(() => null)
    if (v2) {
      const normalized = normalizeV2(v2)
      if (hasUsableStreamData(normalized)) return normalized
    }

    const v1 = await prisma.workoutStream.findUnique({ where: { workoutId } }).catch(() => null)
    if (!v1) return null
    const normalized = toNormalizedFromV1(v1)
    return hasUsableStreamData(normalized) ? normalized : null
  },

  async existsByWorkoutId(workoutId: string): Promise<boolean> {
    const stream = await this.findByWorkoutId(workoutId)
    return stream !== null
  },

  async findManyByWorkoutIds(
    workoutIds: string[],
    options?: FindManyByWorkoutIdsOptions
  ): Promise<Map<string, NormalizedStream>> {
    const result = new Map<string, NormalizedStream>()
    if (workoutIds.length === 0) return result

    const fields = options?.fields
    const v2Select = buildV2Select(fields)

    const v2Chunks = await Promise.all(
      chunkArray(workoutIds, WORKOUT_ID_CHUNK_SIZE).map((chunk) =>
        (prisma as any).workoutStreamV2
          .findMany({
            where: { workoutId: { in: chunk } },
            ...(v2Select ? { select: v2Select } : {})
          })
          .catch(() => [])
      )
    )
    const v2Records: any[] = v2Chunks.flat()

    const missingIds: string[] = []
    for (const r of v2Records) {
      const normalized = normalizeV2(r)
      if (hasUsableStreamData(normalized)) {
        result.set(r.workoutId, normalized)
      } else {
        missingIds.push(r.workoutId)
      }
    }

    const coveredIds = new Set(v2Records.map((r: any) => r.workoutId))
    for (const id of workoutIds) {
      if (!coveredIds.has(id)) missingIds.push(id)
    }

    if (missingIds.length > 0) {
      const v1Select = buildV1Select(fields) as any
      const v1Chunks = await Promise.all(
        chunkArray(missingIds, WORKOUT_ID_CHUNK_SIZE).map((chunk) =>
          prisma.workoutStream
            .findMany({
              where: { workoutId: { in: chunk } },
              ...(v1Select ? { select: v1Select } : {})
            })
            .catch(() => [])
        )
      )
      const v1Records = v1Chunks.flat()
      for (const r of v1Records) {
        const normalized = toNormalizedFromV1(r)
        if (hasUsableStreamData(normalized)) {
          result.set(r.workoutId, normalized)
        }
      }
    }

    return result
  },

  /**
   * Watts-only bulk read for aggregate power analytics.
   *
   * findManyByWorkoutIds() always fetches the REQUIRED_V2_SELECT baseline so
   * hasUsableStreamData() can decide V2-vs-V1, which means ~6 parallel series
   * per workout. Curve endpoints scan up to two years of workouts at once and
   * only ever look at `watts`, so the baseline is the dominant cost there.
   * This reads a single column and decides the V1 fallback from the presence
   * of a non-empty watts series, which is the only signal that matters here.
   *
   * Workouts with no power data are simply absent from the returned map.
   */
  async findWattsByWorkoutIds(workoutIds: string[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>()
    if (workoutIds.length === 0) return result

    const chunks = chunkArray(workoutIds, WORKOUT_ID_CHUNK_SIZE)

    const v2Chunks = await Promise.all(
      chunks.map((chunk) =>
        (prisma as any).workoutStreamV2
          .findMany({
            where: { workoutId: { in: chunk } },
            select: { workoutId: true, watts: true }
          })
          .catch(() => [])
      )
    )

    for (const record of v2Chunks.flat() as Array<{ workoutId: string; watts: unknown }>) {
      if (Array.isArray(record.watts) && record.watts.length > 0) {
        result.set(record.workoutId, record.watts as number[])
      }
    }

    const missingIds = workoutIds.filter((id) => !result.has(id))
    if (missingIds.length === 0) return result

    const v1Chunks = await Promise.all(
      chunkArray(missingIds, WORKOUT_ID_CHUNK_SIZE).map((chunk) =>
        prisma.workoutStream
          .findMany({
            where: { workoutId: { in: chunk } },
            select: { workoutId: true, watts: true }
          })
          .catch(() => [])
      )
    )

    for (const record of v1Chunks.flat() as Array<{ workoutId: string; watts: unknown }>) {
      if (Array.isArray(record.watts) && record.watts.length > 0) {
        result.set(record.workoutId, record.watts as number[])
      }
    }

    return result
  },

  async updateMetadata(
    workoutId: string,
    data: { hrZoneTimes?: unknown; powerZoneTimes?: unknown }
  ): Promise<void> {
    const v2 = await (prisma as any).workoutStreamV2
      .findUnique({ where: { workoutId }, select: { id: true } })
      .catch(() => null)

    if (v2) {
      await (prisma as any).workoutStreamV2.update({
        where: { workoutId },
        data: { ...data, updatedAt: new Date() }
      })
      return
    }

    const v1 = await prisma.workoutStream.findUnique({
      where: { workoutId },
      select: { id: true }
    })
    if (v1) {
      const updateData: {
        updatedAt: Date
        hrZoneTimes?: ReturnType<typeof toPrismaInputJsonValue>
        powerZoneTimes?: ReturnType<typeof toPrismaInputJsonValue>
      } = { updatedAt: new Date() }
      if (data.hrZoneTimes !== undefined) {
        updateData.hrZoneTimes = toPrismaInputJsonValue(data.hrZoneTimes)
      }
      if (data.powerZoneTimes !== undefined) {
        updateData.powerZoneTimes = toPrismaInputJsonValue(data.powerZoneTimes)
      }
      await prisma.workoutStream.update({
        where: { workoutId },
        data: updateData
      })
    }
  },

  async upsert(
    workoutId: string,
    data: {
      time?: number[]
      distance?: number[]
      velocity?: number[]
      heartrate?: number[] | null
      cadence?: number[] | null
      watts?: number[] | null
      altitude?: number[] | null
      latlng?: [number, number][] | null
      grade?: number[] | null
      moving?: boolean[] | null
      temp?: number[] | null
      torque?: number[] | null
      leftRightBalance?: number[] | null
      hrv?: number[] | null
      respiration?: number[] | null
      targetPower?: number[] | null
      avgPacePerKm?: number | null
      paceVariability?: number | null
      lapSplits?: unknown
      paceZones?: unknown
      pacingStrategy?: unknown
      surges?: unknown
      hrZoneTimes?: unknown
      powerZoneTimes?: unknown
      extrasMeta?: unknown
    }
  ) {
    const {
      latlng,
      time,
      distance,
      velocity,
      heartrate,
      cadence,
      watts,
      altitude,
      grade,
      moving,
      temp,
      torque,
      leftRightBalance,
      hrv,
      respiration,
      targetPower,
      ...meta
    } = data
    const { lat, lng } = splitLatlngPoints(latlng)

    const writeData: any = {
      ...meta,
      lat: sanitizeFloatStreamArray(lat),
      lng: sanitizeFloatStreamArray(lng),
      time: sanitizeIntStreamArray(time),
      distance: sanitizeFloatStreamArray(distance),
      velocity: sanitizeFloatStreamArray(velocity),
      heartrate: sanitizeIntStreamArray(heartrate),
      cadence: sanitizeIntStreamArray(cadence),
      watts: sanitizeIntStreamArray(watts),
      altitude: sanitizeFloatStreamArray(altitude),
      grade: sanitizeFloatStreamArray(grade),
      moving: sanitizeBooleanStreamArray(moving),
      temp: sanitizeIntStreamArray(temp),
      torque: sanitizeIntStreamArray(torque),
      leftRightBalance: sanitizeIntStreamArray(leftRightBalance),
      hrv: sanitizeFloatStreamArray(hrv),
      respiration: sanitizeFloatStreamArray(respiration),
      targetPower: sanitizeIntStreamArray(targetPower)
    }

    return (prisma as any).workoutStreamV2.upsert({
      where: { workoutId },
      create: {
        workout: { connect: { id: workoutId } },
        ...writeData
      },
      update: { ...writeData, updatedAt: new Date() }
    })
  }
}
