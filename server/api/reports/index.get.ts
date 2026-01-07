import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Reports'],
    summary: 'List reports',
    description: 'Returns a list of reports for the authenticated user.',
    parameters: [
      {
        name: 'limit',
        in: 'query',
        description: 'Maximum number of reports to return',
        schema: { type: 'integer', default: 10 }
      },
      {
        name: 'type',
        in: 'query',
        description: 'Filter by report type',
        schema: { type: 'string' }
      },
      {
        name: 'beforeDate',
        in: 'query',
        description: 'Filter reports created on or before this date',
        schema: { type: 'string', format: 'date-time' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  status: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  dateRangeStart: { type: 'string', format: 'date-time' },
                  dateRangeEnd: { type: 'string', format: 'date-time' },
                  modelVersion: { type: 'string', nullable: true },
                  analysisJson: { type: 'object', nullable: true }
                }
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

  const query = getQuery(event)
  const limit = query.limit ? parseInt(query.limit as string) : 10
  const type = query.type as string | undefined
  const beforeDate = query.beforeDate as string | undefined

  const where: any = {
    userId: (session.user as any).id
  }

  if (type) {
    where.type = type
  }

  // If beforeDate is provided, find profiles created on or before that date
  if (beforeDate) {
    where.createdAt = {
      lte: new Date(beforeDate)
    }
  }

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      dateRangeStart: true,
      dateRangeEnd: true,
      modelVersion: true,
      analysisJson: true
    }
  })

  return reports
})
