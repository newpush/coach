import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { calculateWorkoutStress } from '../../utils/calculate-workout-stress'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Create manual workout',
    description: 'Creates a manual workout entry for the user.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['title', 'date', 'durationSec'],
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              type: { type: 'string' },
              date: { type: 'string', format: 'date-time' },
              durationSec: { type: 'integer' },
              distanceMeters: { type: 'number' },
              tss: { type: 'number' },
              rpe: { type: 'integer' },
              plannedWorkoutId: { type: 'string' }
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
                workout: { $ref: '#/components/schemas/Workout' }
              }
            }
          }
        }
      },
      400: { description: 'Invalid input' },
      401: { description: 'Unauthorized' }
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
  const body = await readBody(event)

  // Validate required fields
  if (!body.title || !body.date || !body.durationSec) {
    throw createError({
      statusCode: 400,
      message: 'Title, date, and duration are required'
    })
  }

  try {
    // Create a manual workout entry
    const workout = await workoutRepository.create({
      userId,
      externalId: `manual-${Date.now()}`, // Unique ID for manual entries
      source: 'manual',
      title: body.title,
      description: body.description || null,
      type: body.type || 'Activity',
      date: new Date(body.date),
      durationSec: parseInt(body.durationSec),
      distanceMeters: body.distanceMeters ? parseFloat(body.distanceMeters) : null,
      tss: body.tss ? parseFloat(body.tss) : null,
      rpe: body.rpe ? parseInt(body.rpe) : null,
      plannedWorkoutId: body.plannedWorkoutId || null
    })

    // Calculate CTL/ATL for the new workout
    try {
      const { ctl, atl } = await calculateWorkoutStress(workout.id, userId)
      workout.ctl = ctl
      workout.atl = atl
    } catch (error) {
      console.error('Error calculating workout stress metrics:', error)
      // Don't fail the request if stress calculation fails
    }

    // If linked to a planned workout, mark it as completed
    if (body.plannedWorkoutId) {
      await prisma.plannedWorkout.update({
        where: { id: body.plannedWorkoutId },
        data: { completed: true }
      })
    }

    return {
      success: true,
      workout
    }
  } catch (error: any) {
    console.error('Error creating manual workout:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to create manual workout'
    })
  }
})
