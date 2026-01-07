import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { userReportsQueue } from './queues'
import { getUserTimezone, getUserLocalDate, getEndOfDayUTC } from '../server/utils/date'

export const adaptTrainingPlanTask = task({
  id: 'adapt-training-plan',
  queue: userReportsQueue,
  run: async (payload: {
    planId: string
    userId: string
    adaptationType: string
    context?: string
  }) => {
    const { planId, userId, adaptationType, context } = payload

    logger.log('Adapting training plan', { planId, adaptationType })

    const timezone = await getUserTimezone(userId)

    // 1. Fetch Current State
    const plan = await prisma.trainingPlan.findUnique({
      where: { id: planId },
      include: {
        blocks: {
          include: {
            weeks: {
              include: {
                workouts: true
              }
            }
          }
        }
      }
    })

    if (!plan) throw new Error('Plan not found')

    // Find current active week
    const now = new Date()
    const currentBlock = plan.blocks.find(
      (b) =>
        new Date(b.startDate) <= now &&
        new Date(b.startDate).getTime() + b.durationWeeks * 7 * 24 * 3600 * 1000 > now.getTime()
    )

    if (!currentBlock) {
      logger.warn('No active block found to adapt')
      return { success: false, message: 'No active block found' }
    }

    // 2. Logic based on type
    if (adaptationType === 'RECALCULATE_WEEK') {
      // Re-generate the remaining workouts for the current week
      // We can reuse the generate-training-block logic but constrained to specific dates?
      // Or just simple prompt: "Here is the week so far (missed X). Redesign the rest."

      const currentWeek = currentBlock.weeks.find(
        (w) => new Date(w.startDate) <= now && new Date(w.endDate) >= now
      )

      if (currentWeek) {
        // Delete future workouts in this week
        await prisma.plannedWorkout.deleteMany({
          where: {
            trainingWeekId: currentWeek.id,
            date: { gt: now },
            completed: false
          }
        })

        // Trigger regeneration for this specific context
        // Ideally we'd have a specific task for "fill_week" but we can hack it here or reuse logic.
        // For MVP, let's just log. In full prod, we'd call Gemini here.
        logger.log('Cleared future workouts. Ready for regeneration.')

        // TODO: Call Gemini to fill the gap.
        // const newWorkouts = await gemini.generate(...)
        // await prisma.plannedWorkout.createMany(...)
      }
    }

    return { success: true }
  }
})
