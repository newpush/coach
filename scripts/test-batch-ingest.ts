import { tasks } from '@trigger.dev/sdk/v3'

async function testBatchIngest() {
  // Replace with your actual user ID
  const userId = 'your-user-id-here'

  const now = new Date()
  const startDate = new Date(now)
  startDate.setDate(startDate.getDate() - 7) // Last 7 days

  console.log('🚀 Triggering batch ingestion task...')
  console.log(`User ID: ${userId}`)
  console.log(`Date Range: ${startDate.toISOString()} to ${now.toISOString()}`)
  console.log('')

  try {
    const handle = await tasks.trigger('ingest-all', {
      userId,
      startDate: startDate.toISOString(),
      endDate: now.toISOString()
    })

    console.log('✅ Task triggered successfully!')
    console.log(`Job ID: ${handle.id}`)
    console.log('')
    console.log('View the task execution at:')
    console.log(`https://cloud.trigger.dev/runs/${handle.id}`)
  } catch (error) {
    console.error('❌ Failed to trigger task:', error)
    console.error('')
    console.error('Make sure:')
    console.error('1. Trigger.dev dev server is running (pnpm dev:trigger)')
    console.error('2. TRIGGER_SECRET_KEY is set in your .env file')
    console.error('3. The user has at least one connected integration')
  }
}

testBatchIngest()
