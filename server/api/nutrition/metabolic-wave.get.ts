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

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Absolute plausible-date window (CW-506).
 *
 * The span cap above bounds how *much* work one request costs, but says nothing about *where* the
 * range sits: `?startDate=9999-01-01&endDate=9999-02-01` is a legal 32-day span that still runs 32
 * days of simulation plus the repository queries behind it. That is a caller bug, not an
 * amplification vector, so the window is deliberately generous — far wider than the activities
 * calendar could reach by month-stepping — and exists only to turn obvious nonsense into a 400.
 */
const MIN_DATE_YEAR = 1900
const MAX_DATE_YEAR = 2200

/**
 * Strict `YYYY-MM-DD` parsing, matching `extended-wave.get.ts`'s policy of 400ing on malformed input
 * rather than coercing it (CW-506).
 *
 * `value` is `unknown` on purpose: Nitro hands back an array for a repeated query parameter
 * (`?startDate=a&startDate=b`), and the previous `String(value).slice(0, 10)` joined that array and
 * silently kept the first date. The same slice also swallowed trailing junk (`2026-01-01junk`).
 * Anything that is not exactly one `YYYY-MM-DD` string is now a caller bug worth surfacing.
 */
function parseDateOnlyUtc(value: unknown, field: string) {
  const expected = `Expected a single date in YYYY-MM-DD format between ${MIN_DATE_YEAR} and ${MAX_DATE_YEAR}.`

  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) {
    throw createError({
      statusCode: 400,
      message: `Invalid ${field}: ${String(value)}. ${expected}`
    })
  }

  // Shape-valid but not a real calendar date (e.g. 2026-02-30, 2026-13-01) parses to Invalid Date.
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) {
    throw createError({ statusCode: 400, message: `Invalid ${field}: ${value}. ${expected}` })
  }

  const year = parsed.getUTCFullYear()
  if (year < MIN_DATE_YEAR || year > MAX_DATE_YEAR) {
    throw createError({ statusCode: 400, message: `Invalid ${field}: ${value}. ${expected}` })
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
        description: 'Single YYYY-MM-DD date. Repeated or malformed values are rejected.',
        schema: { type: 'string', format: 'date' }
      },
      {
        name: 'endDate',
        in: 'query',
        required: true,
        description: 'Single YYYY-MM-DD date. Repeated or malformed values are rejected.',
        schema: { type: 'string', format: 'date' }
      }
    ],
    responses: {
      200: { description: 'Success' },
      400: {
        description:
          'Missing, repeated, malformed, implausible, inverted, or too wide a date range (max 62 days)'
      },
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
  const startStr: unknown = query.startDate
  const endStr: unknown = query.endDate

  if (!startStr || !endStr) {
    throw createError({ statusCode: 400, message: 'Start and End date required' })
  }

  const startDate = parseDateOnlyUtc(startStr, 'startDate')
  const endDate = parseDateOnlyUtc(endStr, 'endDate')

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
