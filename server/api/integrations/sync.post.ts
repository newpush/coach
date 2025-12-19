import { getServerSession } from '#auth'
import { tasks } from "@trigger.dev/sdk/v3";

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({ 
      statusCode: 401,
      message: 'Unauthorized' 
    })
  }
  
  const body = await readBody(event)
  const { provider } = body
  
  if (!provider || !['intervals', 'whoop', 'yazio', 'strava', 'all'].includes(provider)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid provider. Must be "intervals", "whoop", "yazio", "strava", or "all"'
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
          userId: (session.user as any).id,
          provider: 'intervals'
        }
      }
    })
    
    // If we haven't completed an initial sync yet, or if it's explicitly marked as false
    // @ts-ignore - property exists in db but type not updated yet
    if (integration && integration.initialSyncCompleted === false) {
      isInitialSync = true;
    }
  }

  if (provider === 'all') {
    // For batch sync, use a moderate 7-day window for recent data
    // This balances API rate limits across all services
    startDate.setDate(startDate.getDate() - 7)
  } else {
    // Individual provider sync windows
    // For Intervals: last 90 days + next 30 days (to capture future planned workouts)
    // For Whoop: last 90 days
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
          userId: (session.user as any).id,
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
    : provider === 'yazio'
    ? 'ingest-yazio'
    : 'ingest-strava'
  
  try {
    console.log(`[Sync] Triggering task: ${taskId} for user: ${(session.user as any).id}`)
    console.log(`[Sync] Current time: ${now.toISOString()}`)
    console.log(`[Sync] Start date: ${startDate.toISOString()} (${startDate.toISOString().split('T')[0]})`)
    console.log(`[Sync] End date: ${endDate.toISOString()} (${endDate.toISOString().split('T')[0]})`)
    console.log(`[Sync] Days to sync: ${Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))}`)
    
    const userId = (session.user as any).id
    const handle = await tasks.trigger(taskId, {
      userId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }, {
      concurrencyKey: userId
    })
    
    console.log(`[Sync] Task triggered successfully. Job ID: ${handle.id}`)
    
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