import { getServerSession } from '../../utils/session'
import { metabolicService } from '../../utils/services/metabolicService'
import { isNutritionTrackingEnabled } from '../../utils/nutrition/feature'
import { summariseIntakeConfidence } from '../../utils/nutrition/intake-confidence'

/**
 * Maximum inclusive span, in days, this endpoint will simulate (CW-73).
 *
 * The wave costs ~97 timeline points plus per-day work for every day in the range, so an unbounded
 * range lets a single request cost thousands of times the intended budget. 62 days comfortably
 * covers the widest legitimate caller — the activities calendar, which requests a padded month grid
 * of up to 42 days — while keeping the worst case bounded. The service enforces its own, looser
 * hard limit underneath this one.
 */
const MAX_WAVE_RANGE_DAYS = 62
const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseDateOnlyUtc(value: string, field: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) {
    throw createError({ statusCode: 400, message: `Invalid ${field}: ${value}` })
  }
  return parsed
}

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Get metabolic wave for range',
    description: 'Returns continuous metabolic points for a specific date range.',
    inputSchema: [
      {
        name: 'startDate',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date' }
      },
      {
        name: 'endDate',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date' }
      }
    ],
    responses: {
      200: { description: 'Success' },
      400: { description: 'Missing, malformed, inverted, or too wide a date range (max 62 days)' },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  if (!(await isNutritionTrackingEnabled(userId))) {
    return {
      success: true,
      points: [],
      journeyEvents: []
    }
  }
  const query = getQuery(event)
  const startStr = query.startDate as string
  const endStr = query.endDate as string

  if (!startStr || !endStr) {
    throw createError({ statusCode: 400, message: 'Start and End date required' })
  }

  const startDate = parseDateOnlyUtc(String(startStr), 'startDate')
  const endDate = parseDateOnlyUtc(String(endStr), 'endDate')

  if (endDate.getTime() < startDate.getTime()) {
    throw createError({ statusCode: 400, message: 'endDate must not be before startDate' })
  }

  const spanDays = Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1
  if (spanDays > MAX_WAVE_RANGE_DAYS) {
    throw createError({
      statusCode: 400,
      message: `Requested range of ${spanDays} days exceeds the maximum of ${MAX_WAVE_RANGE_DAYS} days`
    })
  }

  const { points, journeyEvents } = await metabolicService.getWaveRange(userId, startDate, endDate)

  return {
    success: true,
    points,
    intakeConfidence: summariseIntakeConfidence(points as any),
    journeyEvents
  }
})
