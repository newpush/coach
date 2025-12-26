import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = session.user.id
  const planId = event.context.params?.id

  if (!planId) {
    throw createError({ statusCode: 400, message: 'Plan ID required' })
  }

  // 1. Verify ownership
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

  if (!plan) {
    throw createError({ statusCode: 404, message: 'Plan not found' })
  }

  if (plan.userId !== userId) {
    throw createError({ statusCode: 403, message: 'Not authorized' })
  }

  // 2. Mark as ABANDONED
  await prisma.trainingPlan.update({
    where: { id: planId },
    data: { status: 'ABANDONED' }
  })

  // 3. Delete future planned workouts
  // We identify "future" by date > now
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Find all workout IDs that are in the future
  // We can do this efficiently with a deleteMany query on PlannedWorkout
  // but we need to ensure they belong to this plan.
  // PlannedWorkout is linked to TrainingWeek, which is linked to TrainingBlock, which is linked to TrainingPlan.
  
  // Efficient query:
  const deleted = await prisma.plannedWorkout.deleteMany({
    where: {
      date: { gt: today }, // Strictly future
      trainingWeek: {
        block: {
          trainingPlanId: planId
        }
      },
      completed: false // Only delete uncompleted ones? Or all? Usually abandon means all future.
    }
  })

  return {
    success: true,
    message: 'Plan abandoned',
    deletedWorkouts: deleted.count
  }
})
