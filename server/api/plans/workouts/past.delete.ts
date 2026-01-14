import { prisma } from '../../../utils/db'
import { deleteIntervalsPlannedWorkout } from '../../../utils/intervals'
import { getServerSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  const now = new Date()

  // Fetch user's Intervals integration
  const integration = await prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: 'intervals'
      }
    }
  })

  // Find past planned workouts that are:
  // 1. Managed by CoachWatts
  // 2. In the past
  // 3. Not completed (flag is false)
  // 4. Not linked to any actual workout (double check)
  const pastWorkouts = await prisma.plannedWorkout.findMany({
    where: {
      userId,
      date: {
        lt: now
      },
      managedBy: 'COACH_WATTS',
      completed: false,
      completedWorkouts: {
        none: {}
      }
    }
  })

  let remoteDeleteCount = 0
  let localDeleteCount = 0

  if (pastWorkouts.length > 0) {
    // 1. Delete from remote (Intervals.icu) if integrated
    if (integration) {
      // Process remote deletions
      const results = await Promise.allSettled(
        pastWorkouts.map(async (workout) => {
          if (
            workout.externalId &&
            !workout.externalId.startsWith('ai_gen') &&
            !workout.externalId.startsWith('tmpl_') &&
            /^\d+$/.test(workout.externalId)
          ) {
            await deleteIntervalsPlannedWorkout(integration, workout.externalId)
            remoteDeleteCount++
          }
        })
      )

      // Log errors if any
            results.forEach((result, index) => {
              if (result.status === 'rejected') {
                const workout = pastWorkouts[index]
                console.error(`Failed to delete past Intervals workout ${workout?.externalId || 'unknown'}:`, result.reason)
              }
            })
    }

    // 2. Delete from local DB
    const idsToDelete = pastWorkouts.map((w) => w.id)
    const localDeleteResult = await prisma.plannedWorkout.deleteMany({
      where: {
        id: { in: idsToDelete }
      }
    })
    localDeleteCount = localDeleteResult.count
  }

  return {
    success: true,
    count: localDeleteCount,
    remoteCount: remoteDeleteCount
  }
})
