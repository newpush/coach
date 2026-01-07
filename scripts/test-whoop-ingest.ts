import { config } from 'dotenv'

// Load environment variables before importing anything else
config()

async function testWhoopIngest() {
  console.log('Environment variables loaded.')

  // Dynamically import modules to ensure env vars are available when they initialize
  const { prisma } = await import('../server/utils/db')
  const { ingestWhoopTask } = await import('../trigger/ingest-whoop')

  const USER_ID = '6cbccf6c-e5a3-4df2-8305-2584e317f1ea'
  const START_DATE = '2025-12-01'
  const END_DATE = '2025-12-08'

  console.log(`Starting Whoop Ingest Test for user: ${USER_ID}`)
  console.log(`Date Range: ${START_DATE} to ${END_DATE}`)

  try {
    // Run the task directly (simulating a trigger)
    // NOTE: In the current Trigger.dev SDK version or setup, tasks might be objects or functions.
    // The previous error "ingestWhoopTask.run is not a function" suggests we might need to invoke the task handler directly
    // or inspect how 'ingestWhoopTask' is exported. It's exported as 'task({...})'.
    // If we can't run it easily via SDK in a script without full context,
    // let's try calling the internal logic if we can refactor, OR simpler:
    // Just trigger it via the real trigger mechanism if possible, OR just mock the call to the underlying functions.

    // Actually, looking at `trigger/ingest-whoop.ts`:
    // export const ingestWhoopTask = task({ id: "ingest-whoop", run: async ... })
    // The `.run` method is usually available in tests but maybe not in this standalone script context correctly.

    // Let's manually invoke the logic by importing the functions used inside the task
    // effectively replicating the task logic here for the test.
    const {
      fetchWhoopRecovery,
      fetchWhoopSleep,
      fetchWhoopWorkouts,
      normalizeWhoopRecovery,
      normalizeWhoopWorkout
    } = await import('../server/utils/whoop')

    // 1. Get Integration (Already do this in real task but we need it here)
    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId: USER_ID, provider: 'whoop' } }
    })

    if (!integration) throw new Error('Integration not found')

    // 2. Fetch Workouts directly (The new part we added)
    console.log('Fetching workouts directly via utils...')
    const workoutsData = await fetchWhoopWorkouts(
      integration,
      new Date(START_DATE),
      new Date(END_DATE)
    )

    console.log(`Fetched ${workoutsData.length} workouts from Whoop API.`)

    // 3. Normalize and Insert
    let inserted = 0
    for (const w of workoutsData) {
      const norm = normalizeWhoopWorkout(w, USER_ID)
      if (norm) {
        await prisma.workout.upsert({
          where: {
            userId_source_externalId: {
              userId: USER_ID,
              source: 'whoop',
              externalId: norm.externalId
            }
          },
          update: norm,
          create: norm
        })
        inserted++
      }
    }

    console.log(`Manually inserted/updated ${inserted} workouts.`)

    // Verify workouts were inserted
    const workouts = await prisma.workout.findMany({
      where: {
        userId: USER_ID,
        source: 'whoop',
        date: {
          gte: new Date(START_DATE),
          lte: new Date(END_DATE)
        }
      },
      orderBy: { date: 'desc' }
    })

    console.log(`\nFound ${workouts.length} Whoop workouts in DB:`)
    workouts.forEach((w) => {
      console.log(
        `- ${w.date.toISOString()} | ${w.type} | Strain: ${(w.rawJson as any)?.score?.strain} | Avg HR: ${w.averageHr}`
      )
    })
  } catch (error) {
    console.error('Error running ingest task:', error)
  } finally {
    await prisma.$disconnect()
  }
}

testWhoopIngest()
