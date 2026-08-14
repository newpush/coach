import { z } from 'zod'
import { prisma } from '../../../../utils/db'
import { getServerSession } from '../../../../utils/session'
import {
  buildGarminCoursePayload,
  createGarminCourse,
  createGarminWorkout,
  createGarminWorkoutSchedule,
  updateGarminWorkout,
  updateGarminWorkoutSchedule,
  extractGarminScheduleId
} from '../../../../utils/garmin-push'
import {
  fetchGarminUserPermissions,
  hasGarminPermission,
  parseGarminScope,
  reconcileGarminScopes,
  serializeGarminScopes
} from '../../../../utils/garmin'
import { plannedWorkoutPublishRepository } from '../../../../utils/repositories/plannedWorkoutPublishRepository'
import { serializeCanonicalForGarmin } from '../../../../utils/canonical-workout-serializer'
import {
  appendPublishStalenessWarning,
  buildPublishWarnings,
  loadPlannedWorkoutPublishContext
} from '../../../../utils/planned-workout-publish-guards'
import { throwPublishPreconditionHttpError } from '../../../../utils/planned-workout-intervals-publish'

type PublishDestination = 'training' | 'course'

function toDateOnly(value: Date): string {
  return value.toISOString().split('T')[0]!
}

function extractCourseGeoPoints(workout: any): any[] {
  const structured = workout?.structuredWorkout as any
  const raw = workout?.rawJson as any

  const candidates = [
    structured?.geoPoints,
    structured?.route?.geoPoints,
    structured?.route?.points,
    raw?.geoPoints,
    raw?.route?.geoPoints,
    raw?.route?.points
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate
  }
  return []
}

defineRouteMeta({
  openAPI: {
    tags: ['Planned Workouts'],
    summary: 'Publish planned workout to Garmin',
    description: 'Publishes a planned workout to Garmin Training API or Courses API.',
    responses: {
      200: { description: 'Published successfully' },
      400: { description: 'Invalid request or missing permissions' },
      401: { description: 'Unauthorized' },
      404: { description: 'Workout not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing workout ID' })

  const body = await readBody<{ destination?: PublishDestination }>(event).catch(() => ({}) as any)
  const destination: PublishDestination = body?.destination === 'course' ? 'course' : 'training'

  const userId = (session.user as any).id as string

  const precondition = await loadPlannedWorkoutPublishContext(userId, id)
  if (!precondition.ok) {
    throwPublishPreconditionHttpError(precondition.code, precondition.error, {
      settings_staleness: precondition.settings_staleness
    })
  }

  const { workout, sportSettings, settingsStaleness } = precondition.context

  const integration = await prisma.integration.findFirst({
    where: { userId, provider: 'garmin' }
  })
  if (!integration) {
    throw createError({ statusCode: 400, message: 'Garmin integration not found' })
  }

  let scopes = parseGarminScope(integration.scope)
  const requiredPermission = destination === 'training' ? 'WORKOUT_IMPORT' : 'COURSE_IMPORT'

  if (!hasGarminPermission(scopes, requiredPermission)) {
    try {
      // Only a successful permissions response drives this: on failure the catch below leaves the
      // stored scope untouched rather than pruning it.
      const permissions = await fetchGarminUserPermissions(integration as any)
      scopes = reconcileGarminScopes(scopes, permissions)
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          scope: serializeGarminScopes(scopes),
          errorMessage: null
        }
      })
    } catch (error) {
      console.warn('[GarminPublish] Failed to fetch permissions from Garmin API', error)
    }
  }
  if (destination === 'training' && !hasGarminPermission(scopes, 'WORKOUT_IMPORT')) {
    throw createError({
      statusCode: 400,
      message:
        'Garmin WORKOUT_IMPORT permission is required. Reconnect Garmin and grant permission.'
    })
  }
  if (destination === 'course' && !hasGarminPermission(scopes, 'COURSE_IMPORT')) {
    throw createError({
      statusCode: 400,
      message: 'Garmin COURSE_IMPORT permission is required. Reconnect Garmin and grant permission.'
    })
  }

  const provider = destination === 'training' ? 'garmin_training' : 'garmin_courses'
  const existingTarget = await plannedWorkoutPublishRepository.getByProvider(id, provider)

  try {
    if (destination === 'training') {
      const payload = serializeCanonicalForGarmin({
        title: workout.title,
        description: workout.description || '',
        type: workout.type,
        structure: workout.structuredWorkout,
        zoneProfileSnapshot: (workout.structuredWorkout as any)?.zoneProfileSnapshot,
        durationSec: workout.durationSec,
        distanceMeters: workout.distanceMeters,
        sourceId: workout.id,
        workout,
        liveSportSettings: sportSettings
      })

      let workoutId = existingTarget?.externalId || null
      if (workoutId) {
        try {
          await updateGarminWorkout(integration, workoutId, payload)
        } catch (e: any) {
          const message = String(e?.message || '')
          // Stale/partial Garmin workouts or invalid update identity → recreate.
          if (
            message.includes('(404)') ||
            (message.includes('requires') && message.includes('ownerId')) ||
            message.includes('requires numeric workoutId') ||
            message.includes('not a valid `java.lang.Long`') ||
            message.includes("doesn't match with null") ||
            message.includes('has no steps') ||
            e?.code === 'GARMIN_OWNER_ID_REQUIRED' ||
            e?.code === 'GARMIN_WORKOUT_ID_INVALID'
          ) {
            workoutId = null
          } else {
            throw e
          }
        }
      }

      if (!workoutId) {
        const created = await createGarminWorkout(integration, payload)
        workoutId = String(created?.workoutId || created?.id || '')
      }

      if (!workoutId) {
        throw new Error('Garmin workout created but no workoutId was returned')
      }

      const schedulePayload = {
        workoutId: Number(workoutId),
        date: toDateOnly(workout.date)
      }

      let scheduleId = existingTarget?.scheduleId || null
      if (scheduleId) {
        try {
          await updateGarminWorkoutSchedule(integration, scheduleId, schedulePayload)
        } catch (e: any) {
          if (String(e?.message || '').includes('(404)')) {
            scheduleId = null
          } else {
            throw e
          }
        }
      }
      if (!scheduleId) {
        const createdSchedule = await createGarminWorkoutSchedule(integration, schedulePayload)
        scheduleId = extractGarminScheduleId(createdSchedule)
      }

      const now = new Date()
      await plannedWorkoutPublishRepository.upsert(id, provider, {
        externalId: workoutId,
        scheduleId,
        status: 'SYNCED',
        error: null,
        lastSyncedAt: now
      })

      return {
        success: true,
        message: appendPublishStalenessWarning(
          'Workout published to Garmin Training API.',
          settingsStaleness
        ),
        destination,
        ...(buildPublishWarnings(settingsStaleness)
          ? { warnings: buildPublishWarnings(settingsStaleness) }
          : {}),
        target: {
          provider,
          externalId: workoutId,
          scheduleId,
          status: 'SYNCED',
          lastSyncedAt: now
        }
      }
    }

    const geoPoints = extractCourseGeoPoints(workout)
    const coursePayload = buildGarminCoursePayload({
      ...workout,
      geoPoints
    })

    const course = await createGarminCourse(integration, coursePayload)
    const courseId = String(course?.courseId || course?.id || '')
    if (!courseId) throw new Error('Garmin course created but no courseId was returned')

    const now = new Date()
    await plannedWorkoutPublishRepository.upsert(id, provider, {
      externalId: courseId,
      status: 'SYNCED',
      error: null,
      lastSyncedAt: now
    })

    return {
      success: true,
      message: appendPublishStalenessWarning(
        'Course published to Garmin Courses API.',
        settingsStaleness
      ),
      destination,
      ...(buildPublishWarnings(settingsStaleness)
        ? { warnings: buildPublishWarnings(settingsStaleness) }
        : {}),
      target: {
        provider,
        externalId: courseId,
        status: 'SYNCED',
        lastSyncedAt: now
      }
    }
  } catch (error: any) {
    await plannedWorkoutPublishRepository.upsert(id, provider, {
      status: 'FAILED',
      error: error?.message || 'Failed to publish to Garmin'
    })

    throw createError({
      statusCode: Number(error?.statusCode) || 500,
      message: error?.message || 'Failed to publish to Garmin'
    })
  }
})
