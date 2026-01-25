import { z } from 'zod'
import { getServerSession } from '#auth'
import { prisma } from '../../../utils/db'

const bodySchema = z.object({
  startDate: z.string().date(), // YYYY-MM-DD
  endDate: z.string().date(), // YYYY-MM-DD
  source: z.enum(['all', 'intervals', 'coach-wattz']).optional().default('all'),
  keyword: z.string().optional(), // Optional title filter
  preview: z.boolean().default(false)
})

export default eventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session || !session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readValidatedBody(event, (b) => bodySchema.parse(b))
  const userId = (session.user as any).id

  // Construct Date Objects (UTC Midnight)
  const start = new Date(body.startDate)
  const end = new Date(body.endDate)
  // Set end date to end of day
  end.setHours(23, 59, 59, 999)

  // Build Filters
  const plannedWorkoutWhere: any = {
    userId,
    date: {
      gte: start,
      lte: end
    }
  }

  const eventWhere: any = {
    userId,
    date: {
      gte: start,
      lte: end
    }
  }

  const noteWhere: any = {
    userId,
    startDate: {
      gte: start,
      lte: end
    }
  }

  // Source Filtering
  if (body.source === 'intervals') {
    plannedWorkoutWhere.externalId = { not: null }
    eventWhere.source = 'intervals'
    noteWhere.source = 'intervals'
  } else if (body.source === 'coach-wattz') {
    plannedWorkoutWhere.externalId = null
    eventWhere.source = { not: 'intervals' }
    noteWhere.source = { not: 'intervals' }
  }

  // Keyword Filtering
  if (body.keyword) {
    const contains = { contains: body.keyword, mode: 'insensitive' }
    plannedWorkoutWhere.title = contains
    eventWhere.title = contains
    noteWhere.title = contains
  }

  // Preview Mode: Just Count
  if (body.preview) {
    const [plannedWorkouts, events, notes] = await Promise.all([
      prisma.plannedWorkout.count({ where: plannedWorkoutWhere }),
      prisma.event.count({ where: eventWhere }),
      prisma.calendarNote.count({ where: noteWhere })
    ])

    return {
      success: true,
      preview: true,
      counts: {
        plannedWorkouts,
        events,
        notes,
        total: plannedWorkouts + events + notes
      }
    }
  }

  // Execute Deletions in Transaction
  try {
    const [deletedWorkouts, deletedEvents, deletedNotes] = await prisma.$transaction([
      prisma.plannedWorkout.deleteMany({ where: plannedWorkoutWhere }),
      prisma.event.deleteMany({ where: eventWhere }),
      prisma.calendarNote.deleteMany({ where: noteWhere })
    ])

    return {
      success: true,
      preview: false,
      deleted: {
        plannedWorkouts: deletedWorkouts.count,
        events: deletedEvents.count,
        notes: deletedNotes.count,
        total: deletedWorkouts.count + deletedEvents.count + deletedNotes.count
      }
    }
  } catch (error) {
    console.error('Bulk delete failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete items' })
  }
})
