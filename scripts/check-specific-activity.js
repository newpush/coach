// Script to check a specific activity from Intervals.icu
import 'dotenv/config'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

async function main() {
  // Get user and integration
  const userResult = await pool.query('SELECT * FROM "User" LIMIT 1')
  const user = userResult.rows[0]

  const integrationResult = await pool.query(
    'SELECT * FROM "Integration" WHERE "userId" = $1 AND provider = $2',
    [user.id, 'intervals']
  )

  const integration = integrationResult.rows[0]

  // Check one of the undefined activities
  const activityId = '16639341172'

  const athleteId = integration.externalUserId || 'i0'
  const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')

  console.log(`Fetching activity ${activityId} from Intervals.icu...\n`)

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/activities/${activityId}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`
    }
  })

  if (!response.ok) {
    console.error(`API Error: ${response.status} ${response.statusText}`)
    const text = await response.text()
    console.error(text)
    return
  }

  const activity = await response.json()

  console.log('Full activity data:')
  console.log(JSON.stringify(activity, null, 2))

  // Also check what's stored in the database
  console.log('\n\n='.repeat(50))
  console.log('Database record:\n')

  const dbResult = await pool.query('SELECT * FROM "Workout" WHERE "externalId" = $1', [activityId])

  if (dbResult.rows.length > 0) {
    const workout = dbResult.rows[0]
    console.log(`Title: ${workout.title}`)
    console.log(`Type: ${workout.type}`)
    console.log(`Date: ${workout.date}`)
    console.log(`Duration: ${workout.durationSec}`)
    console.log(`Distance: ${workout.distanceMeters}`)
    console.log('\nRaw JSON stored:')
    console.log(JSON.stringify(workout.rawJson, null, 2))
  }
}

main()
  .catch(console.error)
  .finally(() => pool.end())
