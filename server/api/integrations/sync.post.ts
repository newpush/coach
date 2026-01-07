import { getServerSession } from '../../utils/session'
import { tasks } from "@trigger.dev/sdk/v3";

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Trigger sync',
    description: 'Triggers a background job to sync data from an integration provider.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['provider'],
            properties: {
              provider: {
                type: 'string',
                enum: ['intervals', 'whoop', 'withings', 'yazio', 'strava', 'hevy', 'all']
              },
              days: {
                type: 'number',
                description: 'Number of days to sync.'
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
                jobId: { type: 'string' },
                provider: { type: 'string' },
                message: { type: 'string' },
                dateRange: {
                  type: 'object',
                  properties: {
                    start: { type: 'string', format: 'date-time' },
                    end: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      },
      400: { description: 'Invalid provider' },
      401: { description: 'Unauthorized' },
      404: { description: 'Integration not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user?.id) {
    throw createError({ 
      statusCode: 401,
      message: 'Unauthorized' 
    })
  }
  
  const userId = session.user.id
  
  const body = await readBody(event)
  const { provider, days } = body
  
  if (!provider || !['intervals', 'whoop', 'withings', 'yazio', 'strava', 'hevy', 'all'].includes(provider)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid provider. Must be "intervals", "whoop", "withings", "yazio", "strava", "hevy", or "all"'
    })
  }
  
  // Calculate date range based on the most comprehensive sync window
  // When syncing all, use the most comprehensive date range (Intervals.icu's range)
  const now = new Date()
  const startDate = new Date(now)
  
  // Check if we need a full sync for this provider (if it's the first time)
  let isInitialSync = false;
  
  if (provider === 'intervals') {
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals'
        }
      }
    })
    
    // If we haven't completed an initial sync yet, or if it's explicitly marked as false
    // @ts-expect-error - property exists in db but type not updated yet
    if (integration && integration.initialSyncCompleted === false) {
      isInitialSync = true;
    }
  }

  if (days) {
    startDate.setDate(startDate.getDate() - days)
  }
  else if (provider === 'all') {
    // For batch sync, use a moderate 7-day window for recent data
    // This balances API rate limits across all services
    startDate.setDate(startDate.getDate() - 7)
  } else {
    // Individual provider sync windows
    // For Intervals: last 90 days + next 30 days (to capture future planned workouts)
    // For Whoop: last 90 days
    // For Withings: last 90 days
    // For Yazio: last 5 days (to avoid rate limiting - older data is kept as-is)
    // For Strava: last 7 days (to respect API rate limits - 200 req/15min, 2000/day)
    let daysBack = provider === 'yazio' ? 5 : provider === 'strava' ? 7 : 90
    
    // Logic for Intervals.icu:
    // If it's the first sync (initialSyncCompleted is false), fetch 90 days history
    // Otherwise, just fetch the last 7 days to save resources
    if (provider === 'intervals' && !isInitialSync) {
      daysBack = 7;
    }
    
    startDate.setDate(startDate.getDate() - daysBack)
  }
  
  const endDate = provider === 'intervals'
    ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)  // +30 days for planned workouts
    : new Date(now)  // Today for Whoop, Yazio, Strava, and batch "all"
  
  // Check if integration exists (skip for 'all' since it syncs all available)
  if (provider !== 'all') {
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider
        }
      }
    })
    
    if (!integration) {
      throw createError({
        statusCode: 404,
        message: `${provider} integration not found. Please connect your account first.`
      })
    }
  }
  
  // Trigger the appropriate job
  const taskId = provider === 'all'
    ? 'ingest-all'
    : provider === 'intervals'
    ? 'ingest-intervals'
    : provider === 'whoop'
    ? 'ingest-whoop'
    : provider === 'withings'
    ? 'ingest-withings'
    : provider === 'yazio'
    ? 'ingest-yazio'
    : provider === 'strava'
    ? 'ingest-strava'
    : 'ingest-hevy'
  
  try {
    const handle = await tasks.trigger(taskId, {
      userId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }, {
      concurrencyKey: userId
    })
    
    return {
      success: true,
      jobId: handle.id,
      provider,
      message: `Started syncing ${provider} data`,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    }
  } catch (error) {
    console.error(`[Sync] Failed to trigger task:`, error)
    throw createError({
      statusCode: 500,
      message: `Failed to trigger sync: ${error instanceof Error ? error.message : 'Unknown error'}. Make sure Trigger.dev dev server is running (pnpm dev:trigger)`
    })
  }
})