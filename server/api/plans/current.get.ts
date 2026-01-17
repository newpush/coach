import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { getUserLocalDate, getUserTimezone } from '../../utils/date'

defineRouteMeta({
  openAPI: {
    tags: ['Plans'],
    summary: 'Get current training plan',
    description: 'Returns the active training plan for the current week.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                plan: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    status: { type: 'string' },
                    weekStartDate: { type: 'string', format: 'date-time' },
                    weekEndDate: { type: 'string', format: 'date-time' },
                    planJson: { type: 'object' },
                    totalTSS: { type: 'number' }
                  }
                },
                weekStart: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      },
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
  const timezone = await getUserTimezone(userId)
  const today = getUserLocalDate(timezone)

  // Get the start of the current week (Monday) based on user's local date
  // Since 'today' is already UTC midnight representation of user's local date,
  // we can use standard Date methods to shift it.
  const currentWeekStart = new Date(today)
  const day = currentWeekStart.getUTCDay()
  const diff = currentWeekStart.getUTCDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday (0) -> prev Monday (-6)
  currentWeekStart.setUTCDate(diff)
  // No need to setHours, already UTC midnight from getUserLocalDate logic

  // Get active or most recent plan
  const plan = await prisma.weeklyTrainingPlan.findFirst({
    where: {
      userId,
      weekStartDate: {
        lte: currentWeekStart
      }
    },
    orderBy: [
      { status: 'asc' }, // ACTIVE comes before DRAFT alphabetically
      { weekStartDate: 'desc' }
    ]
  })

  return {
    plan,
    weekStart: currentWeekStart.toISOString()
  }
})
