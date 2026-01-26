import { prisma } from '../../../utils/db'
import {
  deleteIntervalsPlannedWorkout,
  fetchIntervalsPlannedWorkouts
} from '../../../utils/intervals'
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

  // 1. Delete LOCAL CoachWatts workouts
  // We only delete workouts explicitly managed by CoachWatts
  const localWorkouts = await prisma.plannedWorkout.findMany({
    where: {
      userId,
      date: {
        gt: now
      },
      managedBy: 'COACH_WATTS'
    }
  })

  if (localWorkouts.length > 0 && integration) {
    // Process remote deletions for local records
    await Promise.allSettled(
      localWorkouts.map(async (workout) => {
        // Only delete from Intervals if it looks like a valid Intervals ID (numeric)
        // Ignore local AI-generated IDs (ai-gen-...) or UUIDs
        if (workout.externalId && /^\d+$/.test(workout.externalId)) {
          try {
            await deleteIntervalsPlannedWorkout(integration, workout.externalId)
          } catch (error) {
            console.error(`Failed to delete Intervals workout ${workout.externalId}:`, error)
          }
        }
      })
    )
  }

  // Delete from local DB
  const localDeleteResult = await prisma.plannedWorkout.deleteMany({
    where: {
      userId,
      date: {
        gt: now
      },
      managedBy: 'COACH_WATTS'
    }
  })

  // 2. Remote Cleanup (Extended Range)
  // Fetch future events from Intervals to find and delete CoachWatts events
  // that might not be in our local DB (beyond sync horizon or synced incorrectly)
  let remoteDeleteCount = 0

  if (integration) {
    try {
      const startDate = now
      const endDate = new Date(now)
      endDate.setDate(endDate.getDate() + 180) // Check next 6 months

      const remoteEvents = await fetchIntervalsPlannedWorkouts(integration, startDate, endDate)

      // Identify events created by CoachWatts via description tag
      const cwEvents = remoteEvents.filter(
        (e) => e.description && e.description.includes('[CoachWatts]')
      )

      if (cwEvents.length > 0) {
        console.log(`Found ${cwEvents.length} orphaned CoachWatts events on Intervals.icu`)

        await Promise.allSettled(
          cwEvents.map(async (e) => {
            try {
              await deleteIntervalsPlannedWorkout(integration, e.id)
              remoteDeleteCount++
            } catch (err) {
              console.error(`Failed to delete remote orphan ${e.id}`, err)
            }
          })
        )

        // Ensure they are gone locally too (in case they were mis-labeled in DB)
        const externalIds = cwEvents.map((e) => String(e.id))
        if (externalIds.length > 0) {
          await prisma.plannedWorkout.deleteMany({
            where: {
              userId,
              externalId: { in: externalIds }
            }
          })
        }
      }
    } catch (error) {
      console.error('Remote cleanup failed:', error)
      // Non-blocking error
    }
  }

  return {
    success: true,
    localCount: localDeleteResult.count,
    remoteOrphanCount: remoteDeleteCount
  }
})
