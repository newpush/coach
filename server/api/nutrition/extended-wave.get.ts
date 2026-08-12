import { requireAuth } from '../../utils/auth-guard'
import { metabolicService } from '../../utils/services/metabolicService'
import { summariseIntakeConfidence } from '../../utils/nutrition/intake-confidence'

const DEFAULT_DAYS_AHEAD = 3
const MIN_DAYS_AHEAD = 1
/**
 * The wave simulation costs ~97 timeline points plus per-day work for every day in the range, so an
 * unbounded `daysAhead` lets one request cost thousands of times the intended budget (CW-73). Two
 * weeks is well past anything the UI asks for (the nutrition page requests 3).
 */
const MAX_DAYS_AHEAD = 14

/**
 * Missing/empty -> default. Unparseable -> 400, because `daysAhead=abc` is a caller bug worth
 * surfacing rather than silently answering with the default. In-range-but-out-of-bounds numbers are
 * clamped, so an over-eager client still gets a useful (bounded) answer instead of an error.
 */
function resolveDaysAhead(raw: unknown) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_DAYS_AHEAD

  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) {
    throw createError({
      statusCode: 400,
      message: `Invalid daysAhead: ${String(raw)}. Expected an integer between ${MIN_DAYS_AHEAD} and ${MAX_DAYS_AHEAD}.`
    })
  }

  return Math.min(MAX_DAYS_AHEAD, Math.max(MIN_DAYS_AHEAD, parsed))
}

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Get extended metabolic wave',
    description: 'Returns a multi-day predictive energy wave (historical + current + future).',
    inputSchema: [
      {
        name: 'daysAhead',
        in: 'query',
        description:
          'Number of future days to project. Values outside the range are clamped; non-integer values are rejected.',
        schema: { type: 'integer', default: 3, minimum: 1, maximum: 14 }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                points: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      time: { type: 'string' },
                      timestamp: { type: 'number' },
                      level: { type: 'number' },
                      kcalBalance: { type: 'number' },
                      carbBalance: { type: 'number' },
                      fluidDeficit: { type: 'number' },
                      dataType: { type: 'string' },
                      event: { type: 'string', nullable: true }
                    }
                  }
                }
              }
            }
          }
        }
      },
      400: { description: 'Invalid daysAhead' },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const authUser = await requireAuth(event, ['nutrition:read'])
  const userId = authUser.id
  const query = getQuery(event)
  const daysAhead = resolveDaysAhead(query.daysAhead)

  try {
    const { points, journeyEvents } = await metabolicService.generateExtendedWave(userId, daysAhead)

    return {
      success: true,
      points,
      journeyEvents,
      intakeConfidence: summariseIntakeConfidence(points as any)
    }
  } catch (error: any) {
    // Don't bury a client error (e.g. the service's own range guards) under a 500.
    if (error?.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      throw error
    }
    console.error('Error generating extended wave:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate extended metabolic wave'
    })
  }
})
