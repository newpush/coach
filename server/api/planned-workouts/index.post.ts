import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { createIntervalsPlannedWorkout } from '../../utils/intervals'

defineRouteMeta({
  openAPI: {
    tags: ['Planned Workouts'],
    summary: 'Create planned workout',
    description: 'Creates a new planned workout and syncs it to Intervals.icu.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['date', 'title'],
            properties: {
              date: { type: 'string', format: 'date-time' },
              title: { type: 'string' },
              description: { type: 'string' },
              type: { type: 'string', default: 'Ride' },
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
                workout: { type: 'object' }
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
  if (!body.date || !body.title) {
    throw createError({
      statusCode: 400,
      message: 'Date and title are required'
    })
  }

  try {
    // Get Intervals.icu integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider: 'intervals'
      }
    })

    if (!integration) {
      throw createError({
        statusCode: 400,
        message: 'Intervals.icu integration not found. Please connect your account first.'
      })
    }

    // Force date to UTC midnight to avoid timezone shift issues
    const rawDate = new Date(body.date)
    const forcedDate = new Date(
      Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate())
    )

    // Create the workout in Intervals.icu
    const intervalsWorkout = await createIntervalsPlannedWorkout(integration, {
      date: forcedDate,
      title: body.title,
      description: body.description,
      type: body.type || 'Ride',
      durationSec: body.durationSec,
      tss: body.tss
    })

    // Create planned workout in our database with the Intervals.icu ID
    const plannedWorkout = await prisma.plannedWorkout.create({
      data: {
        userId,
        externalId: String(intervalsWorkout.id),
        date: forcedDate,
        title: body.title,
        description: body.description || '',
        type: body.type || 'Ride',
        durationSec: body.durationSec || 3600,
        tss: body.tss,
        completed: false,
        rawJson: intervalsWorkout
      }
    })

    return {
      success: true,
      workout: plannedWorkout
    }
  } catch (error: any) {
    console.error('Error creating planned workout:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to create planned workout'
    })
  }
})
