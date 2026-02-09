import { schedules } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import { getUserLocalDate, getUserTimezone } from '../server/utils/date'
import { nutritionRepository } from '../server/utils/repositories/nutritionRepository'
import type { SerializedFuelingPlan } from '../server/utils/nutrition/fueling'

export const nutritionLastCallTask = schedules.task({
  id: 'nutrition-last-call',
  cron: '0,30 * * * *', // Every 30 minutes
  run: async (payload) => {
    // Temporarily disabled until User Settings are implemented
    console.log('Nutrition Last Call trigger is currently disabled.')
    return

    const now = new Date(payload.timestamp) // Trigger timestamp

    // Look for workouts starting in 1.5 to 2.5 hours (centered on 2h)
    const windowStart = new Date(now.getTime() + 90 * 60000)
    const windowEnd = new Date(now.getTime() + 150 * 60000)

    // 1. Find Workouts
    const upcomingWorkouts = await prisma.plannedWorkout.findMany({
      where: {
        date: {
          gte: windowStart,
          lte: windowEnd
        },
        // Filter out 'Rest' days if typed
        type: { not: 'Rest' }
      },
      include: {
        user: true
      }
    })

    console.log(
      `Found ${upcomingWorkouts.length} workouts starting between ${windowStart.toISOString()} and ${windowEnd.toISOString()}`
    )

    for (const workout of upcomingWorkouts) {
      if (!workout.date) continue

      const userId = workout.userId

      // 2. Fetch Nutrition Plan
      const timezone = await getUserTimezone(userId)
      const dayStart = getUserLocalDate(timezone, workout.date)
      const nutrition = await nutritionRepository.getByDate(userId, dayStart)

      if (!nutrition || !nutrition.fuelingPlan) {
        // No plan yet? Maybe trigger generation?
        continue
      }

      const plan = nutrition.fuelingPlan as unknown as SerializedFuelingPlan
      const preWindow = plan.windows.find((w) => w.type === 'PRE_WORKOUT')

      if (!preWindow) continue

      // 3. Check Status
      if (preWindow.status === 'HIT' || preWindow.status === 'PARTIAL') {
        continue // Already fueled
      }

      // 4. Double check actual logs (in case status wasn't updated)
      // Todo: parsing meals JSON to check timestamps is heavy.
      // For now, rely on PreWindow status.
      // If we implement 'log_meal' correctly, it should update status.

      // 5. Send Notification
      const timeToStart = Math.round((workout.date.getTime() - now.getTime()) / 60000 / 60) // Hours

      await prisma.systemMessage.create({
        data: {
          userId,
          title: 'Fueling Reminder',
          message: `Last call! You have a ${workout.title} in ~2 hours. Aim for ${preWindow.targetCarbs}g carbs now.`,
          type: 'INFO',
          link: `/nutrition?date=${dayStart.toISOString().split('T')[0]}`
        }
      })

      console.log(`Sent notification to user ${userId} for workout ${workout.id}`)
    }
  }
})
