import 'dotenv/config'
import { prisma } from '../server/utils/db'
import { refreshWhoopToken } from '../server/utils/whoop'

/**
 * TROUBLESHOOTING TOOL: Whoop Workout Integration
 *
 * This script fetches a specific workout from both the Whoop API
 * and our local database to compare the data and identify discrepancies.
 *
 * Usage: pnpm exec tsx scripts/troubleshoot-whoop-workout.ts [WHOOP_WORKOUT_ID]
 */

async function troubleshoot() {
  const whoopWorkoutId = process.argv[2] || '9b3b4a82-eb31-4b46-9262-c7038c9b02d0'

  console.log(`\n🔍 Troubleshooting Whoop Workout: ${whoopWorkoutId}`)
  console.log('='.repeat(50))

  try {
    // 1. Find the workout in our database
    console.log('\n[1/4] Searching database for workout...')
    const localWorkout = await prisma.workout.findFirst({
      where: {
        externalId: whoopWorkoutId,
        source: 'whoop'
      },
      include: {
        user: true
      }
    })

    if (!localWorkout) {
      console.warn('❌ Local workout not found in database.')
      // If not found, we need to find ANY Whoop integration to talk to the API
      // In a real scenario, we might want to pass a userId as well
    } else {
      console.log('✅ Local workout found:')
      console.log(`   - ID: ${localWorkout.id}`)
      console.log(`   - User: ${localWorkout.user.email} (${localWorkout.userId})`)
      console.log(`   - Date: ${localWorkout.date}`)
      console.log(`   - Title: ${localWorkout.title}`)
      console.log(`   - Type: ${localWorkout.type}`)
      console.log(`   - Duration: ${localWorkout.durationSec}s`)
      console.log(`   - Avg HR: ${localWorkout.averageHr}`)
      console.log(`   - Max HR: ${localWorkout.maxHr}`)
      console.log(`   - TSS: ${localWorkout.tss}`)
    }

    // 2. Get Whoop Integration
    console.log('\n[2/4] Getting Whoop integration...')
    let userId = localWorkout?.userId

    if (!userId) {
      // Try to find any Whoop integration if no local workout exists
      const anyWhoop = await prisma.integration.findFirst({
        where: { provider: 'whoop' }
      })
      if (!anyWhoop) {
        throw new Error('No Whoop integrations found in database to perform API call.')
      }
      userId = anyWhoop.userId
      console.log(`ℹ️ Using integration from user: ${userId} (no local workout found)`)
    }

    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'whoop'
        }
      }
    })

    if (!integration) {
      throw new Error(`Whoop integration not found for user ${userId}`)
    }

    // Ensure valid token
    let validIntegration = integration
    const buffer = 5 * 60 * 1000 // 5 minutes
    if (integration.expiresAt && new Date() >= new Date(integration.expiresAt.getTime() - buffer)) {
      console.log('🔄 Refreshing expired Whoop token...')
      validIntegration = await refreshWhoopToken(integration)
    }

    // 3. Fetch from Whoop API
    console.log('\n[3/4] Fetching workout from Whoop API...')
    const baseUrlV1 = 'https://api.prod.whoop.com/developer/v1/activity/workout'
    const baseUrlV2 = 'https://api.prod.whoop.com/developer/v2/activity/workout'
    let whoopData: any

    async function tryFetch(url: string) {
      console.log(`📡 Trying URL: ${url}`)
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${validIntegration.accessToken}`
        }
      })
      return res
    }

    let response = await tryFetch(`${baseUrlV1}/${whoopWorkoutId}`)
    if (!response.ok) {
      console.warn(`⚠️ V1 ID fetch failed (${response.status}). Trying V2 ID fetch...`)
      response = await tryFetch(`${baseUrlV2}/${whoopWorkoutId}`)
    }

    if (!response.ok) {
      console.warn(`⚠️ V2 ID fetch failed (${response.status}). Trying V1 Collection fetch...`)

      const startDate = localWorkout
        ? new Date(localWorkout.date.getTime() - 2 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const endDate = localWorkout
        ? new Date(localWorkout.date.getTime() + 2 * 24 * 60 * 60 * 1000)
        : new Date()

      const urlV1 = new URL(baseUrlV1)
      urlV1.searchParams.set('start', startDate.toISOString())
      urlV1.searchParams.set('end', endDate.toISOString())

      let collectionResponse = await tryFetch(urlV1.toString())

      if (!collectionResponse.ok) {
        console.warn(
          `⚠️ V1 Collection fetch failed (${collectionResponse.status}). Trying V2 Collection fetch...`
        )
        const urlV2 = new URL(baseUrlV2)
        urlV2.searchParams.set('start', startDate.toISOString())
        urlV2.searchParams.set('end', endDate.toISOString())
        collectionResponse = await tryFetch(urlV2.toString())
      }

      if (!collectionResponse.ok) {
        throw new Error(
          `Whoop API collection fetch failed for both V1 and V2: ${collectionResponse.status}`
        )
      }

      const collectionData = await collectionResponse.json()
      const records = collectionData.records || []
      console.log(`✅ Collection fetch successful. Found ${records.length} records.`)

      const found = records.find(
        (r: any) => r.id === whoopWorkoutId || String(r.id) === whoopWorkoutId
      )

      if (!found) {
        console.log(
          'Record IDs found:',
          records.map((r: any) => r.id)
        )
        throw new Error(
          `Workout ${whoopWorkoutId} not found in collection for range ${startDate.toISOString()} to ${endDate.toISOString()}`
        )
      }

      console.log('✅ Found workout in collection!')
      whoopData = found
    } else {
      whoopData = await response.json()
    }

    console.log('✅ Whoop API Response Data:')
    console.log(JSON.stringify(whoopData, null, 2))

    // 4. Comparison
    console.log('\n[4/4] Data Comparison:')
    console.log('='.repeat(50))

    const compare = (label: string, local: any, remote: any) => {
      const match = local == remote // loose comparison for null/undefined
      console.log(
        `${label.padEnd(20)} | Local: ${String(local).padEnd(15)} | Remote: ${String(remote).padEnd(15)} | ${match ? '✅ MATCH' : '❌ DISCREPANCY'}`
      )
    }

    if (localWorkout) {
      compare('Start Date', localWorkout.date.toISOString(), whoopData.start)
      compare(
        'Duration (s)',
        localWorkout.durationSec,
        Math.round((new Date(whoopData.end).getTime() - new Date(whoopData.start).getTime()) / 1000)
      )
      compare('Average HR', localWorkout.averageHr, whoopData.score?.average_heart_rate)
      compare('Max HR', localWorkout.maxHr, whoopData.score?.max_heart_rate)
      compare('Kilojoules', localWorkout.kilojoules, Math.round(whoopData.score?.kilojoule))
      compare('Distance (m)', localWorkout.distanceMeters, whoopData.score?.distance_meter)
    } else {
      console.log('⚠️ Cannot perform comparison - local workout missing.')
    }
  } catch (error: any) {
    console.error('\n💥 Error during troubleshooting:')
    console.error(error.message)
    if (error.stack) {
      // console.error(error.stack)
    }
  } finally {
    await prisma.$disconnect()
    console.log('\nDone.')
  }
}

troubleshoot()
