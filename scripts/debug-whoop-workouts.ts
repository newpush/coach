import { config } from 'dotenv'

// Load environment variables before importing anything else
config()

async function debugWhoopWorkouts() {
  console.log('Environment variables loaded.')

  // Dynamically import modules to ensure env vars are available when they initialize
  const { prisma } = await import('../server/utils/db')
  const { refreshWhoopToken } = await import('../server/utils/whoop')

  const USER_ID = '6cbccf6c-e5a3-4df2-8305-2584e317f1ea'

  console.log(`Starting debug for Whoop Workouts`)

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
    const START_DATE_ISO = '2025-12-01T00:00:00Z'
    const END_DATE_ISO = '2025-12-08T00:00:00Z'

    // Trying V2 endpoint
    // https://developer.whoop.com/api/#tag/Workout/operation/getWorkoutCollection
    // GET /developer/v2/activity/workout (Wait, is it just /activity/workout or does it need developer/v2?)
    // The previous successful cycle call was: https://api.prod.whoop.com/developer/v1/cycle
    // So the base is https://api.prod.whoop.com/developer
    // User suggests v2/activity/workout

    const urlV2 = new URL('https://api.prod.whoop.com/developer/v1/activity/workout')
    // Wait, let's try explicitly what was suggested in feedback: v2
    // If v1/activity/workout failed with 404, maybe it's just v1 that is deprecated or wrong for this resource?
    // Actually the docs often have inconsistencies. Let's try v1 first as most other endpoints are v1.
    // Wait, the previous run FAILED on v1/activity/workout with 404.
    // So let's try the collection endpoint which might be distinct?
    // No, standard is /activity/workout?start=...

    // Let's try V1/cycle again to confirm base URL is correct.
    // We did that in debug-whoop-activity.ts and it worked.

    // Let's try the user suggestion: v1 failed, so let's try v2 if available or fallback strategies.
    // NOTE: Whoop documentation often refers to "v1" in base URL but specific endpoints might differ.
    // However, if V1 gives 404, it might be the user has no workouts or the endpoint is wrong.

    // Attempting Collection Endpoint: /activity/workout/collection? (Some APIs use this)
    // Attempting V2: /developer/v2/activity/workout (Hypothetical based on feedback, though official docs usually stick to v1 base)

    // Let's try the collection endpoint idea if it exists, or check 'cycles' to see if workouts are nested.
    // We already checked cycles and they didn't have workout data embedded.

    // Let's try to fetch a single known cycle and see if it links to workouts?
    // Cycle ID: 1188932032

    // Let's simply try the V1 endpoint one more time but strictly with the exact params required.
    // Actually, I suspect the issue is simply that "workoouts" don't exist for this user in this range as independent objects,
    // OR the endpoint is actually `v1/activity/workout` (singular) vs `workouts`? It is singular in my code.

    // Let's try to call the User Profile to ensure token scope is good.
    const profileUrl = 'https://api.prod.whoop.com/developer/v1/user/profile/basic'
    const profileResp = await fetch(profileUrl, {
      headers: { Authorization: `Bearer ${validIntegration.accessToken}` }
    })
    console.log('Profile Check:', profileResp.status)

    // Retry Workout Fetch with V2 as requested by user
    const url = new URL('https://api.prod.whoop.com/developer/v2/activity/workout')
    url.searchParams.set('start', START_DATE_ISO)
    url.searchParams.set('end', END_DATE_ISO)

    console.log('Retrying Whoop Workouts (V2):', url.toString())
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${validIntegration.accessToken}` }
    })

    if (!response.ok) {
      console.error('Whoop API V2 Error:', response.status, await response.text())
    } else {
      const data = await response.json()
      const workouts = data.records || []
      console.log(`Found ${workouts.length} workouts (V2).`)

      for (const workout of workouts) {
        console.log('\n--- Whoop Workout (V2) ---')
        console.log(`ID: ${workout.id}`)
        console.log(`Start: ${workout.start}`)
        console.log(`End: ${workout.end}`)
        if (workout.score) {
          console.log(`Strain: ${workout.score.strain}`)
          console.log(`Avg HR: ${workout.score.average_heart_rate}`)
          console.log(`Max HR: ${workout.score.max_heart_rate}`)
        }
      }
    }
  } catch (error) {
    console.error('Error fetching from Whoop:', error)
  } finally {
    await prisma.$disconnect()
  }
}

debugWhoopWorkouts()
