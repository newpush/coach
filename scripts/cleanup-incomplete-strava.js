// Script to clean up incomplete Strava activities from the database
import 'dotenv/config'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

async function main() {
  console.log('Finding incomplete Strava activities...\n')

  // Find workouts with null type and source 'intervals' that have rawJson indicating they're from Strava
  const result = await pool.query(`
    SELECT id, "externalId", title, type, date, "rawJson"
    FROM "Workout"
    WHERE source = 'intervals'
    AND type IS NULL
    AND "rawJson"->>'source' = 'STRAVA'
    AND "rawJson"->>'_note' LIKE '%not available via the API%'
  `)

  const incompleteWorkouts = result.rows

  console.log(`Found ${incompleteWorkouts.length} incomplete Strava activities:\n`)

  incompleteWorkouts.forEach((w, idx) => {
    console.log(`${idx + 1}. ${w.title || 'Unnamed'} (ID: ${w.externalId})`)
    console.log(`   Date: ${w.date}`)
    console.log(`   Note: ${w.rawJson._note}`)
  })

  if (incompleteWorkouts.length === 0) {
    console.log('\nNo incomplete Strava activities to clean up.')
    return
  }

  console.log(`\n${'='.repeat(80)}`)
  console.log('\nDeleting these incomplete activities...')

  const deleteResult = await pool.query(`
    DELETE FROM "Workout"
    WHERE source = 'intervals'
    AND type IS NULL
    AND "rawJson"->>'source' = 'STRAVA'
    AND "rawJson"->>'_note' LIKE '%not available via the API%'
  `)

  console.log(`\n✅ Deleted ${deleteResult.rowCount} incomplete Strava activities`)
  console.log('\nNote: These activities are synced from Strava to Intervals.icu, but')
  console.log('Intervals.icu API cannot provide their full details due to Strava API restrictions.')
  console.log(
    'To see these workouts, please connect Strava directly or view them in Intervals.icu.'
  )
}

main()
  .catch(console.error)
  .finally(() => pool.end())
