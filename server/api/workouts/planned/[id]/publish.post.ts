import { prisma } from '../../../../utils/db'
import {
  createIntervalsPlannedWorkout,
  updateIntervalsPlannedWorkout
} from '../../../../utils/intervals'
import { WorkoutConverter } from '../../../../utils/workout-converter'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing workout ID' })
  }

  const userId = session.user.id

  // Fetch the workout
  const workout = await prisma.plannedWorkout.findUnique({
    where: { id, userId },
    include: {
      user: { select: { ftp: true } }
    }
  })

  if (!workout) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  // Get Intervals integration
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: 'intervals' }
  })

  if (!integration) {
    console.error('[Publish] Intervals integration not found for user:', userId)
    throw createError({ statusCode: 400, message: 'Intervals.icu integration not found' })
  }

  // Check if already published/synced
  const isLocal =
    workout.syncStatus === 'LOCAL_ONLY' ||
    workout.externalId.startsWith('ai_gen_') ||
    workout.externalId.startsWith('ai-gen-')

  // Prepare workout data
  let workoutDoc = ''
  if (workout.structuredWorkout) {
    const workoutData = {
      title: workout.title,
      description: workout.description || '',
      steps: (workout.structuredWorkout as any).steps || [],
      messages: (workout.structuredWorkout as any).messages || [],
      ftp: (workout.user as any).ftp || 250
    }
    workoutDoc = WorkoutConverter.toIntervalsICU(workoutData)
  }

  try {
    let resultWorkout
    let message = ''

    if (isLocal) {
      // CREATE
      console.log('[Publish] Creating new workout on Intervals.icu:', { localId: workout.id })
      const intervalsWorkout = await createIntervalsPlannedWorkout(integration, {
        date: workout.date,
        title: workout.title,
        description: workout.description || '',
        type: workout.type || 'Ride',
        durationSec: workout.durationSec || 3600,
        tss: workout.tss ?? undefined,
        workout_doc: workoutDoc
      })

      resultWorkout = intervalsWorkout
      message = 'Workout published successfully'

      // Update local record with new external ID
      await prisma.plannedWorkout.update({
        where: { id },
        data: {
          externalId: String(intervalsWorkout.id),
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date()
        }
      })
    } else {
      // UPDATE
      console.log('[Publish] Updating existing workout on Intervals.icu:', {
        localId: workout.id,
        externalId: workout.externalId
      })
      try {
        const intervalsWorkout = await updateIntervalsPlannedWorkout(
          integration,
          workout.externalId,
          {
            date: workout.date,
            title: workout.title,
            description: workout.description || '',
            type: workout.type || 'Ride',
            durationSec: workout.durationSec || 3600,
            tss: workout.tss ?? undefined,
            workout_doc: workoutDoc
          }
        )

        resultWorkout = intervalsWorkout
        message = 'Workout updated on Intervals.icu'

        // Update local sync status
        await prisma.plannedWorkout.update({
          where: { id },
          data: {
            syncStatus: 'SYNCED',
            lastSyncedAt: new Date()
          }
        })
      } catch (updateError: any) {
        // If the event was deleted on Intervals.icu (404), we should recreate it
        if (
          updateError.message &&
          (updateError.message.includes('404') || updateError.message.includes('Event not found'))
        ) {
          console.warn('[Publish] Workout not found on Intervals.icu (404), recreating it:', {
            localId: workout.id
          })

          const intervalsWorkout = await createIntervalsPlannedWorkout(integration, {
            date: workout.date,
            title: workout.title,
            description: workout.description || '',
            type: workout.type || 'Ride',
            durationSec: workout.durationSec || 3600,
            tss: workout.tss ?? undefined,
            workout_doc: workoutDoc
          })

          resultWorkout = intervalsWorkout
          message = 'Workout recreated on Intervals.icu'

          // Update local record with new external ID
          await prisma.plannedWorkout.update({
            where: { id },
            data: {
              externalId: String(intervalsWorkout.id),
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date()
            }
          })
        } else {
          // Re-throw other errors
          throw updateError
        }
      }
    }

    // Return the updated local workout
    const updatedWorkout = await prisma.plannedWorkout.findUnique({ where: { id } })

    return {
      success: true,
      message,
      workout: updatedWorkout
    }
  } catch (error: any) {
    console.error('Error publishing/updating workout:', error)

    if (error.code === 'P2002') {
      throw createError({ statusCode: 409, message: 'A workout with this ID already exists' })
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to sync workout with Intervals.icu'
    })
  }
})
