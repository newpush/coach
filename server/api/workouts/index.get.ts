import { getEffectiveUserId } from '../../utils/coaching'

export default defineEventHandler({
  openAPI: {
    $global: {
      components: {
        schemas: {
          Workout: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              userId: { type: 'string' },
              externalId: { type: 'string' },
              source: { type: 'string' },
              date: { type: 'string', format: 'date-time' },
              title: { type: 'string' },
              description: { type: 'string', nullable: true },
              type: { type: 'string', nullable: true },
              durationSec: { type: 'integer' },
              distanceMeters: { type: 'number', nullable: true },
              elevationGain: { type: 'integer', nullable: true },
              averageWatts: { type: 'integer', nullable: true },
              maxWatts: { type: 'integer', nullable: true },
              normalizedPower: { type: 'integer', nullable: true },
              averageHr: { type: 'integer', nullable: true },
              maxHr: { type: 'integer', nullable: true },
              tss: { type: 'number', nullable: true },
              intensity: { type: 'number', nullable: true },
              kilojoules: { type: 'integer', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    },
    tags: ['Workouts'],
    summary: 'List workouts',
    description: 'Returns a list of workouts for the authenticated user or an athlete they coach.',
    parameters: [
      {
        name: 'limit',
        in: 'query',
        description: 'Maximum number of workouts to return',
        schema: { type: 'integer' }
      },
      {
        name: 'startDate',
        in: 'query',
        description: 'Filter workouts after this date (ISO 8601)',
        schema: { type: 'string', format: 'date-time' }
      },
      {
        name: 'endDate',
        in: 'query',
        description: 'Filter workouts before this date (ISO 8601)',
        schema: { type: 'string', format: 'date-time' }
      },
      {
        name: 'includeDuplicates',
        in: 'query',
        description: 'Whether to include duplicate workouts in the results',
        schema: { type: 'boolean' }
      },
      {
        name: 'x-act-as-user',
        in: 'header',
        description: 'Athlete user ID to act as (for coaches)',
        schema: { type: 'string' }
      },
      {
        name: 'X-API-Key',
        in: 'header',
        description: 'API key for authentication',
        schema: { type: 'string' }
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
                $ref: '#/components/schemas/Workout'
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden' }
    }
  },
  async handler(event) {
    const userId = await getEffectiveUserId(event)
    
    const query = getQuery(event)
    const limit = query.limit ? parseInt(query.limit as string) : undefined
    const startDate = query.startDate ? new Date(query.startDate as string) : undefined
    const endDate = query.endDate ? new Date(query.endDate as string) : undefined
    const includeDuplicates = query.includeDuplicates === 'true'

    const workouts = await workoutRepository.getForUser(userId, {
      startDate,
      endDate,
      limit,
      includeDuplicates,
      include: {
        streams: {
          select: {
            id: true
          }
        }
      }
    })
    
    return workouts
  }
})