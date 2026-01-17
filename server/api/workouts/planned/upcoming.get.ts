import { prisma } from '../../../utils/db'
import { getServerSession } from '../../../utils/session'
import { getUserLocalDate } from '../../../utils/date'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.email) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, timezone: true }
  })

  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // Get user's local "today" to ensure we show everything from today onwards
  // We use the user's timezone to determine the start of the day
  const today = getUserLocalDate(user.timezone ?? 'UTC')

  const workouts = await prisma.plannedWorkout.findMany({
    where: {
      userId: user.id,
      date: {
        gte: today
      },
      completed: false
    },
    orderBy: {
      date: 'asc'
    },
    take: 10, // Fetch next 10 workouts
    include: {
      trainingWeek: {
        include: {
          block: {
            include: {
              plan: {
                select: {
                  name: true,
                  goal: {
                    select: {
                      title: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  })

  // Map to a cleaner structure
  return {
    workouts: workouts.map((w) => {
      const plan = w.trainingWeek?.block?.plan
      const planName = plan?.name || plan?.goal?.title || (plan ? 'Training Plan' : null)

      return {
        id: w.id,
        date: w.date,
        title: w.title,
        description: w.description,
        type: w.type,
        durationSec: w.durationSec,
        tss: w.tss,
        planName
      }
    })
  }
})
