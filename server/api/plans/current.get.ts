import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

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
  const today = new Date()

  // Get the start of the current week (Monday)
  const currentWeekStart = new Date(today)
  const day = currentWeekStart.getDay()
  const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
  currentWeekStart.setDate(diff)
  currentWeekStart.setHours(0, 0, 0, 0)

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
