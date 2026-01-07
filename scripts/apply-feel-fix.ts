import 'dotenv/config'
import { prisma } from '../server/utils/db'
import { normalizeIntervalsWorkout } from '../server/utils/intervals'

async function main() {
  const workoutId = '6cf47ee1-c1c9-41c2-bc7b-378479984daa'

  // Fetch the current workout to get its rawJson
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { id: true, rawJson: true, feel: true, userId: true }
  })

  if (!workout || !workout.rawJson) {
    console.error('Workout or rawJson not found')
    return
  }

  const rawData = workout.rawJson as any

  console.log(`Current Feel: ${workout.feel}`)

  // Re-normalize
  const normalized = normalizeIntervalsWorkout(rawData, workout.userId)

  console.log(`New Feel: ${normalized.feel}`)

  // Update DB
  await prisma.workout.update({
    where: { id: workoutId },
    data: {
      feel: normalized.feel
    }
  })

  console.log('Database updated.')
}

main()
