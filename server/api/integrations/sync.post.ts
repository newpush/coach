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
  
  if (!provider || !['intervals', 'whoop', 'yazio'].includes(provider)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid provider. Must be "intervals", "whoop", or "yazio"'
    })
  }
  
  // Check if integration exists
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
  
  // Calculate date range
  // For Intervals: last 90 days + next 30 days (to capture future planned workouts)
  // For Whoop: last 90 days
  // For Yazio: last 5 days (to avoid rate limiting - older data is kept as-is)
  const now = new Date()
  const startDate = new Date(now)
  const daysBack = provider === 'yazio' ? 5 : 90
  startDate.setDate(startDate.getDate() - daysBack)
  
  const endDate = provider === 'intervals'
    ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)  // +30 days for planned workouts
    : new Date(now)  // Today for Whoop and Yazio
  
  // Trigger the appropriate job
  const taskId = provider === 'intervals'
    ? 'ingest-intervals'
    : provider === 'whoop'
    ? 'ingest-whoop'
    : 'ingest-yazio'
  
  try {
    console.log(`[Sync] Triggering task: ${taskId} for user: ${(session.user as any).id}`)
    console.log(`[Sync] Current time: ${now.toISOString()}`)
    console.log(`[Sync] Start date: ${startDate.toISOString()} (${startDate.toISOString().split('T')[0]})`)
    console.log(`[Sync] End date: ${endDate.toISOString()} (${endDate.toISOString().split('T')[0]})`)
    console.log(`[Sync] Days to sync: ${Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))}`)
    
    const handle = await tasks.trigger(taskId, {
      userId: (session.user as any).id,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
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