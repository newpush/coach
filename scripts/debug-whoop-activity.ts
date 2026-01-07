import { config } from 'dotenv'

// Load environment variables before importing anything else
config()

async function debugWhoop() {
  console.log('Environment variables loaded.')

  // Dynamically import modules to ensure env vars are available when they initialize
  const { prisma } = await import('../server/utils/db')
  const { refreshWhoopToken } = await import('../server/utils/whoop')

  const USER_ID = '6cbccf6c-e5a3-4df2-8305-2584e317f1ea'
  // The workout date was "2025-12-06T14:14:39Z" (local time in activity), or "2025-12-06T21:14:39Z" UTC
  // We'll search for Whoop workouts around this time.
  const START_DATE_ISO = '2025-12-06T00:00:00Z'
  const END_DATE_ISO = '2025-12-07T00:00:00Z'

  console.log(`Starting debug for Whoop for user: ${USER_ID}`)

  // 1. Get Integration
  const integration = await prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId: USER_ID,
        provider: 'whoop'
      }
    }
  })

  if (!integration) {
    console.error('Whoop integration not found!')
    return
  }

  console.log('Found integration, ensuring valid token...')

  // Ensure token is valid
  let validIntegration = integration
  if (
    integration.expiresAt &&
    new Date() >= new Date(integration.expiresAt.getTime() - 5 * 60 * 1000)
  ) {
    console.log('Refreshing expired token...')
    validIntegration = await refreshWhoopToken(integration)
  }

  try {
    // 2. Fetch Workouts from Whoop API
    // Correct Endpoint: /developer/v1/activity/workout is actually /developer/v1/activity/workout (collection)
    // Double checking docs... it seems the endpoint might be slightly different or user has no data.
    // The previous error was 404, which suggests the endpoint path might be wrong for "collection" or my usage.
    // Docs say: GET /developer/v1/activity/workout

    // Let's try listing all activities collection (collection)
    // Actually the docs say: GET /activity/workout/collection
    // But commonly APIs use plural or collection names.
    // Let's try /developer/v1/activity/workout with pagination params as originally tried but double check URL.
    // Another possibility: /developer/v1/activity/collection/workout ? No.
    // Wait, the docs in docs/whoop-integration.md say:
    // - read:workout - Workout activity Strain and average heart rate
    // But doesn't list the endpoint explicitly for workouts, only recovery and user profile.

    // Let's try to list workouts using the standard endpoint pattern if it exists.
    // The previous 404 suggests /activity/workout might be wrong or require an ID.

    // Let's try to get ALL cycles first, maybe workouts are attached to cycles?
    // https://api.prod.whoop.com/developer/v1/cycle
    const url = new URL('https://api.prod.whoop.com/developer/v1/cycle')
    url.searchParams.set('start', START_DATE_ISO)
    url.searchParams.set('end', END_DATE_ISO)
    url.searchParams.set('limit', '25')

    console.log('Fetching workouts from Whoop:', url.toString())

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${validIntegration.accessToken}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Whoop API Error:', response.status, errorText)
      return
    }

    const data = await response.json()
    const workouts = data.records || []

    console.log(`Found ${workouts.length} workouts in Whoop for this date range.`)

    for (const workout of workouts) {
      console.log('\n--- Whoop Workout ---')
      console.log(`ID: ${workout.id}`)
      console.log(`Created At: ${workout.created_at}`)
      console.log(`Updated At: ${workout.updated_at}`)
      console.log(`Start: ${workout.start}`)
      console.log(`End: ${workout.end}`)
      console.log(`Timezone Offset: ${workout.timezone_offset}`)
      console.log(`Sport ID: ${workout.sport_id}`)

      if (workout.score) {
        console.log(`Strain: ${workout.score.strain}`)
        console.log(`Avg HR: ${workout.score.average_heart_rate}`)
        console.log(`Max HR: ${workout.score.max_heart_rate}`)
        console.log(`Kilojoules: ${workout.score.kilojoule}`)
        console.log(`Zone Duration (ms):`, workout.score.zone_duration)
      } else {
        console.log('No Score (Strain/HR) data available.')
      }
    }
  } catch (error) {
    console.error('Error fetching from Whoop:', error)
  } finally {
    await prisma.$disconnect()
  }
}

debugWhoop()
