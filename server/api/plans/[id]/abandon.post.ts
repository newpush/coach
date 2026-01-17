import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { getUserLocalDate, getUserTimezone } from '../../../utils/date'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
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

  // 3. Handle future planned workouts
  // We identify "future" by date > today in the user's local calendar context
  const timezone = await getUserTimezone(userId)
  const today = getUserLocalDate(timezone)

  // Scope: Future workouts belonging to this plan
  const planScope = {
    date: { gt: today },
    trainingWeek: {
      block: {
        trainingPlanId: planId
      }
    },
    completed: false
  }

  // A. Unlink User-Managed Workouts (preserve them)
  await prisma.plannedWorkout.updateMany({
    where: {
      ...planScope,
      managedBy: 'USER'
    },
    data: {
      trainingWeekId: null
    }
  })

  // B. Delete AI-Managed Workouts
  const deleted = await prisma.plannedWorkout.deleteMany({
    where: {
      ...planScope,
      managedBy: 'COACH_WATTS' // or not 'USER'
    }
  })

  return {
    success: true,
    message: 'Plan abandoned',
    deletedWorkouts: deleted.count
  }
})
