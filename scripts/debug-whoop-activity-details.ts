import { config } from 'dotenv'

config()

async function debugWhoopDetails() {
  console.log('Environment variables loaded.')

  const { prisma } = await import('../server/utils/db')
  const { refreshWhoopToken } = await import('../server/utils/whoop')

  const USER_ID = '6cbccf6c-e5a3-4df2-8305-2584e317f1ea'

  console.log(`Starting debug for Whoop Workouts`)

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

  let validIntegration = integration
  if (
    integration.expiresAt &&
    new Date() >= new Date(integration.expiresAt.getTime() - 5 * 60 * 1000)
  ) {
    console.log('Refreshing expired token...')
    validIntegration = await refreshWhoopToken(integration)
  }

  try {
    const START_DATE_ISO = '2025-12-06T12:00:00Z'
    const END_DATE_ISO = '2025-12-07T00:00:00Z'

    // Try V1 Endpoint
    const urlV1 = new URL('https://api.prod.whoop.com/developer/v1/activity/workout')
    urlV1.searchParams.set('start', START_DATE_ISO)
    urlV1.searchParams.set('end', END_DATE_ISO)

    console.log('Fetching WORKOUTS from Whoop V1:', urlV1.toString())

    const responseV1 = await fetch(urlV1.toString(), {
      headers: {
        Authorization: `Bearer ${validIntegration.accessToken}`
      }
    })

    if (responseV1.ok) {
      const data = await responseV1.json()
      const workouts = data.records || []
      console.log(`Found ${workouts.length} WORKOUTS in Whoop (V1) for this date range.`)

      for (const workout of workouts) {
        console.log('\n--- Whoop Workout Activity (V1) ---')
        console.log(`ID: ${workout.id}`)
        console.log(`Start: ${workout.start}`)
        console.log(`End: ${workout.end}`)
        console.log(`Sport ID: ${workout.sport_id}`)

        if (workout.score) {
          console.log(`Strain: ${workout.score.strain}`)
          console.log(`Avg HR: ${workout.score.average_heart_rate}`)
          console.log(`Max HR: ${workout.score.max_heart_rate}`)
        }
      }
    } else {
      console.log('V1 API Failed:', responseV1.status, await responseV1.text())
    }
  } catch (error) {
    console.error('Error fetching from Whoop:', error)
  } finally {
    await prisma.$disconnect()
  }
}

debugWhoopDetails()
