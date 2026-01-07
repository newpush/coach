import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { syncPlannedWorkoutToIntervals } from '../../utils/intervals-sync'

defineRouteMeta({
  openAPI: {
    tags: ['Planned Workouts'],
    summary: 'Update planned workout',
    description: 'Updates a specific planned workout and syncs changes to Intervals.icu.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              date: { type: 'string', format: 'date-time' },
              title: { type: 'string' },
              description: { type: 'string' },
              type: { type: 'string' },
              durationSec: { type: 'integer' },
              tss: { type: 'number' }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                workout: { type: 'object' },
                syncStatus: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Workout not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const userId = (session.user as any).id
  const workoutId = event.context.params?.id
  const body = await readBody(event)

  if (!workoutId) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }

  try {
    // Check if workout exists and belongs to user
    const existing = await prisma.plannedWorkout.findUnique({
      where: { id: workoutId }
    })

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: 'Workout not found'
      })
    }

    if (existing.userId !== userId) {
      throw createError({
        statusCode: 403,
        message: 'Not authorized to update this workout'
      })
    }

    // Update workout locally first (optimistic update)
    const updated = await prisma.plannedWorkout.update({
      where: { id: workoutId },
      data: {
        ...(body.date && { date: new Date(body.date) }),
        ...(body.title && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.type && { type: body.type }),
        ...(body.durationSec && { durationSec: body.durationSec }),
        ...(body.duration_minutes && { durationSec: body.duration_minutes * 60 }),
        ...(body.tss !== undefined && { tss: body.tss }),
        ...(body.workIntensity !== undefined && { workIntensity: body.workIntensity }),
        modifiedLocally: true,
        syncStatus: 'PENDING'
      }
    })

    // Attempt sync to Intervals.icu
    const syncResult = await syncPlannedWorkoutToIntervals(
      'UPDATE',
      {
        id: updated.id,
        externalId: updated.externalId,
        date: updated.date,
        title: updated.title,
        description: updated.description,
        type: updated.type,
        durationSec: updated.durationSec,
        tss: updated.tss
      },
      userId
    )

    // Update sync status based on result
    const finalWorkout = await prisma.plannedWorkout.update({
      where: { id: workoutId },
      data: {
        syncStatus: syncResult.synced ? 'SYNCED' : 'PENDING',
        lastSyncedAt: syncResult.synced ? new Date() : undefined,
        syncError: syncResult.error || null
      }
    })

    return {
      success: true,
      workout: finalWorkout,
      syncStatus: syncResult.synced ? 'synced' : 'pending',
      message: syncResult.message || 'Workout updated successfully'
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    console.error('Error updating planned workout:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to update planned workout'
    })
  }
})
