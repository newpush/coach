import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'
import { getUserTimezone, getStartOfDaysAgoUTC } from '../../utils/date'

defineRouteMeta({
  openAPI: {
    tags: ['Reports'],
    summary: 'Generate report',
    description: 'Triggers a background job to generate a new analysis report.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: [
                  'WEEKLY_ANALYSIS',
                  'LAST_3_WORKOUTS',
                  'LAST_3_NUTRITION',
                  'LAST_7_NUTRITION',
                  'CUSTOM'
                ],
                default: 'WEEKLY_ANALYSIS'
              },
              config: {
                type: 'object',
                description: 'Optional custom configuration for CUSTOM report type'
              }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                reportId: { type: 'string' },
                reportType: { type: 'string' },
                jobId: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      },
      400: { description: 'Invalid report type' },
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
  const body = await readBody(event)
  const reportType = body.type || 'WEEKLY_ANALYSIS'
  const customConfig = body.config // Custom configuration from the form

  // Validate report type
  const validTypes = [
    'WEEKLY_ANALYSIS',
    'LAST_3_WORKOUTS',
    'LAST_3_NUTRITION',
    'LAST_7_NUTRITION',
    'CUSTOM'
  ]
  if (!validTypes.includes(reportType)) {
    throw createError({
      statusCode: 400,
      message: `Invalid report type. Must be one of: ${validTypes.join(', ')}`
    })
  }

  // Determine date range based on report type or custom config
  const timezone = await getUserTimezone(userId)
  let dateRangeStart: Date
  let dateRangeEnd = new Date()
  let reportConfig: any = null

  if (reportType === 'CUSTOM' && customConfig) {
    // Handle custom configuration
    reportConfig = customConfig

    if (customConfig.timeframeType === 'days') {
      const days = customConfig.days || 7
      dateRangeStart = getStartOfDaysAgoUTC(timezone, days)
    } else if (customConfig.timeframeType === 'count') {
      // For count-based, we'll use a 90-day lookback to find the items
      dateRangeStart = getStartOfDaysAgoUTC(timezone, 90)
    } else if (customConfig.timeframeType === 'range') {
      dateRangeStart = new Date(customConfig.startDate)
      dateRangeEnd = new Date(customConfig.endDate)
    } else {
      dateRangeStart = getStartOfDaysAgoUTC(timezone, 7)
    }
  } else if (reportType === 'LAST_3_WORKOUTS') {
    // For last 3 workouts, we'll use a 30-day lookback to find them
    dateRangeStart = getStartOfDaysAgoUTC(timezone, 30)
  } else if (reportType === 'LAST_3_NUTRITION') {
    // For last 3 nutrition days
    dateRangeStart = getStartOfDaysAgoUTC(timezone, 3)
  } else if (reportType === 'LAST_7_NUTRITION') {
    // For last 7 nutrition days
    dateRangeStart = getStartOfDaysAgoUTC(timezone, 7)
  } else {
    // WEEKLY_ANALYSIS uses 7 days (previous week)
    dateRangeStart = getStartOfDaysAgoUTC(timezone, 7)
  }

  // Create report record with custom config stored in analysisJson temporarily
  // (will be replaced with actual analysis results)
  const reportData: any = {
    userId,
    type: reportType,
    status: 'PENDING',
    dateRangeStart,
    dateRangeEnd
  }

  // Only add analysisJson if we have a custom config
  if (reportConfig) {
    reportData.analysisJson = { _customConfig: reportConfig }
  }

  const report = await prisma.report.create({
    data: reportData
  })

  try {
    // Trigger appropriate background job based on report type with per-user concurrency
    let handle
    if (reportType === 'CUSTOM') {
      // For custom reports, use a generic analysis job that respects the config
      handle = await tasks.trigger(
        'generate-custom-report',
        {
          userId,
          reportId: report.id,
          config: reportConfig
        },
        {
          concurrencyKey: userId
        }
      )
    } else if (reportType === 'LAST_3_WORKOUTS') {
      handle = await tasks.trigger(
        'analyze-last-3-workouts',
        {
          userId,
          reportId: report.id
        },
        {
          concurrencyKey: userId
        }
      )
    } else if (reportType === 'LAST_3_NUTRITION') {
      handle = await tasks.trigger(
        'analyze-last-3-nutrition',
        {
          userId,
          reportId: report.id
        },
        {
          concurrencyKey: userId
        }
      )
    } else if (reportType === 'LAST_7_NUTRITION') {
      handle = await tasks.trigger(
        'analyze-last-7-nutrition',
        {
          userId,
          reportId: report.id
        },
        {
          concurrencyKey: userId
        }
      )
    } else {
      handle = await tasks.trigger(
        'generate-weekly-report',
        {
          userId,
          reportId: report.id
        },
        {
          concurrencyKey: userId
        }
      )
    }

    return {
      success: true,
      reportId: report.id,
      reportType,
      jobId: handle.id,
      message: 'Report generation started'
    }
  } catch (error) {
    // Update report status to failed
    await prisma.report.update({
      where: { id: report.id },
      data: { status: 'FAILED' }
    })

    throw createError({
      statusCode: 500,
      message: `Failed to trigger report generation: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})
