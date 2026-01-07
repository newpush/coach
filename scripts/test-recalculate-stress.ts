import 'dotenv/config'
import { prisma } from '../server/utils/db'
import { calculateWorkoutStress } from '../server/utils/calculate-workout-stress'
import { userRepository } from '../server/utils/repositories/userRepository'

async function main() {
  const workoutId = 'a98d6c77-0a84-4907-afab-394ff9144e89'

  console.log(`Testing TSS Recalculation for Workout: ${workoutId}`)

  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: {
      id: true,
      userId: true,
      date: true,
      tss: true,
      ftp: true,
      title: true,
      streams: { select: { watts: true } }
    }
  })

  if (!workout) {
    console.error('Workout not found!')
    return
  }

  console.log(`Found Workout: ${workout.title} (${workout.date.toISOString()})`)

  if (workout.streams?.watts) {
    console.log('Watts stream type:', typeof workout.streams.watts)
    console.log('Is Array?', Array.isArray(workout.streams.watts))
    // console.log('Sample:', (workout.streams.watts as any).slice(0, 5))
  } else {
    console.log('No watts stream found')
  }

  console.log(
    `Current DB State -> TSS: ${workout.tss}, FTP: ${workout.ftp}, CTL: ${workout.ctl}, ATL: ${workout.atl}`
  )

  // Clear CTL/ATL to force recalculation logic
  console.log('Clearing CTL/ATL to force recalculation...')
  await prisma.workout.update({
    where: { id: workoutId },
    data: { ctl: null, atl: null }
  })

  // Check what FTP the repository returns for this date
  const historicalFtp = await userRepository.getFtpForDate(workout.userId, workout.date)
  console.log(`UserRepository determined Historical FTP for this date: ${historicalFtp}W`)

  // Run the calculation logic
  console.log('Running calculateWorkoutStress...')
  const result = await calculateWorkoutStress(workoutId, workout.userId)

  console.log('Calculation Result:', result)

  // Fetch updated state
  const updatedWorkout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { tss: true, ftp: true, ctl: true, atl: true }
  })

  console.log('Updated DB State:')
  console.log(`- TSS: ${updatedWorkout?.tss}`)
  console.log(`- FTP: ${updatedWorkout?.ftp} (Should match historical if recalculated)`)
  console.log(`- CTL: ${updatedWorkout?.ctl}`)
  console.log(`- ATL: ${updatedWorkout?.atl}`)
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
