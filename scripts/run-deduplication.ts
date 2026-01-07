import { tasks } from '@trigger.dev/sdk/v3'

/**
 * Manual script to run workout deduplication
 * Usage: npx tsx scripts/run-deduplication.ts <user-email>
 */

const userEmail = process.argv[2]

if (!userEmail) {
  console.error('❌ Error: User email required')
  console.error('Usage: npx tsx scripts/run-deduplication.ts <user-email>')
  process.exit(1)
}

async function runDeduplication() {
  console.log(`🧹 Starting deduplication for user: ${userEmail}`)

  try {
    const handle = await tasks.trigger('deduplicate-workouts', {
      userId: userEmail
    })

    console.log('✅ Deduplication task triggered successfully!')
    console.log(`📋 Task ID: ${handle.id}`)
    console.log('\nThe task is now running in the background.')
    console.log('Check the /data page to see progress and results.')
  } catch (error) {
    console.error('❌ Failed to trigger deduplication:', error)
    process.exit(1)
  }
}

runDeduplication()
