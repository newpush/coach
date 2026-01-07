import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  const id1 = '87a51ffb-3a65-4481-a92c-1339b352ad84' // Strava
  const id2 = 'd4c11502-aa5b-47a3-a331-ef275612aeee' // Withings

  const workouts = await prisma.workout.findMany({
    where: {
      id: { in: [id1, id2] }
    },
    select: {
      id: true,
      source: true,
      date: true,
      durationSec: true,
      rawJson: true
    }
  })

  for (const w of workouts) {
    console.log(`\nWorkout ${w.source.toUpperCase()}:`)
    console.log(`  ID: ${w.id}`)
    console.log(`  Date (DB): ${w.date} (ISO: ${w.date.toISOString()})`)

    if (w.source === 'withings') {
      const raw = w.rawJson as any
      console.log(`  Raw Withings Startdate (unix): ${raw.startdate}`)
      console.log(`  Raw Withings Timezone: ${raw.timezone}`)
      console.log(`  Calculated Date from unix: ${new Date(raw.startdate * 1000).toISOString()}`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
