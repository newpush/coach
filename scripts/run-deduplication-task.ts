import 'dotenv/config'
import { prisma } from '../server/utils/db'
import { tasks } from '@trigger.dev/sdk/v3'

async function main() {
  const userId = '13b357f8-6e54-46c5-9271-e97c11f71a93' // User ID found from looking at the workouts previously or we can query it

  console.log(`Triggering deduplication for user ${userId}...`)

  // We can trigger the task using the Trigger.dev SDK
  // But since we are in a script, we might not have the full Trigger.dev context initialized properly for 'tasks.trigger'
  // if not running within the Trigger.dev infrastructure or without proper API keys in .env.
  // Assuming .env has TRIGGER_SECRET_KEY.

  try {
    const handle = await tasks.trigger('deduplicate-workouts', {
      userId: userId
    })

    console.log(`Task triggered successfully! ID: ${handle.id}`)
    console.log('Check Trigger.dev dashboard for status.')
  } catch (e) {
    console.error('Failed to trigger task:', e)
    // Fallback: we could run the logic directly if we imported the function,
    // but the task function is wrapped in `task(...)`.
    // Let's rely on the user confirming if they want to run it via UI or if this script works.
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
