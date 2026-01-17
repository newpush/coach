import { getServerSession } from '../../utils/session'
import { getUserTimezone, getStartOfYearUTC, getUserLocalDate } from '../../utils/date'
import type { PMCMetrics } from '../../utils/training-stress'
import {
  calculatePMCForDateRange,
  getInitialPMCValues,
  getCurrentFitnessSummary,
  getFormStatus
} from '../../utils/training-stress'

defineRouteMeta({
  openAPI: {
    tags: ['Performance'],
    summary: 'Get Performance Management Chart (PMC)',
    description: 'Returns fitness (CTL), fatigue (ATL), and form (TSB) metrics over time.',
    parameters: [
      {
        name: 'days',
        in: 'query',
        schema: { type: ['integer', 'string'], default: 90 }
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
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', format: 'date-time' },
                      ctl: { type: 'number' },
                      atl: { type: 'number' },
                      tsb: { type: 'number' },
                      tss: { type: 'number' }
                    }
                  }
                },
                summary: {
                  type: 'object',
                  properties: {
                    currentCTL: { type: 'number' },
                    currentATL: { type: 'number' },
                    currentTSB: { type: 'number' },
                    formStatus: { type: 'string' },
                    formColor: { type: 'string' },
                    formDescription: { type: 'string' },
                    lastUpdated: { type: 'string', format: 'date-time' }
                  }
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
  const days = parseInt(query.days as string) || 90
  const userId = (session.user as any).id
  const timezone = await getUserTimezone(userId)

  // Get current fitness summary first to determine the true end date
  const summary = await getCurrentFitnessSummary(userId)

  // Default end date is today (User Local Time @ UTC Midnight)
  let endDate = getUserLocalDate(timezone)

  // If we have data from "tomorrow" (timezone diff), extend the chart to include it
  // But cap it at 48 hours to prevent showing far future dates
  if (summary.lastUpdated && new Date(summary.lastUpdated) > endDate) {
    const lastUpdate = new Date(summary.lastUpdated)
    const maxDate = getUserLocalDate(timezone)
    maxDate.setUTCDate(maxDate.getUTCDate() + 2) // Max 2 days ahead

    if (lastUpdate < maxDate) {
      endDate = lastUpdate
    }
  }

  // Ensure we include the full end date by setting to end of day in UTC (since dates are UTC aligned)
  endDate.setUTCHours(23, 59, 59, 999)

  let startDate = getUserLocalDate(timezone)

  if (query.days === 'YTD') {
    startDate = getStartOfYearUTC(timezone)
  } else {
    // Start date is relative to TODAY, regardless of extended end date (to keep window consistent)
    startDate.setUTCDate(startDate.getUTCDate() - days)
  }

  startDate.setUTCHours(0, 0, 0, 0) // Start from beginning of the start day (UTC)

  // Get initial CTL/ATL values from before the date range
  const initialValues = await getInitialPMCValues(userId, startDate)

  // Calculate PMC for date range
  const metrics = await calculatePMCForDateRange(
    startDate,
    endDate,
    userId,
    initialValues.ctl,
    initialValues.atl
  )

  // Calculate average TSS (per workout in the period)
  const totalTSS = metrics.reduce((sum, m) => sum + m.tss, 0)
  const workoutCount = metrics.filter((m) => m.tss > 0).length
  const avgTSS = workoutCount > 0 ? totalTSS / workoutCount : 0

  // Format data for chart
  const data = metrics.map((m: PMCMetrics) => ({
    date: m.date.toISOString(),
    ctl: m.ctl,
    atl: m.atl,
    tsb: m.tsb,
    tss: m.tss
  }))

  return {
    data,
    summary: {
      currentCTL: summary.ctl,
      currentATL: summary.atl,
      currentTSB: summary.tsb,
      avgTSS,
      formStatus: summary.formStatus.status,
      formColor: summary.formStatus.color,
      formDescription: summary.formStatus.description,
      lastUpdated: summary.lastUpdated
    }
  }
})
