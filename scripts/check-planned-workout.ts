import { prisma } from '../server/utils/db'

async function checkPlannedWorkout() {
  const id = 'c1f7832c-fc5e-4940-a68e-5cd3149f825e'

  console.log(`Checking planned workout with ID: ${id}`)

  const workout = await prisma.plannedWorkout.findUnique({
    where: { id },
    include: {
      completedWorkouts: true,
      trainingWeek: {
        include: {
          block: {
            include: {
              plan: true
            }
          }
        }
      }
    }
  })

  if (!workout) {
    console.log('Workout not found!')
    return
  }

  console.log('Workout Details:')
  console.log('----------------')
  console.log(`Title: ${workout.title}`)
  console.log(`Date: ${workout.date}`)
  console.log(`Type: ${workout.type}`)
  console.log(`Completed: ${workout.completed}`)

  console.log('\nMetrics:')
  console.log('----------------')
  console.log(`Duration (sec): ${workout.durationSec}`)
  console.log(`Distance (meters): ${workout.distanceMeters}`)
  console.log(`TSS: ${workout.tss}`)
  console.log(`Intensity: ${workout.workIntensity}`)

  console.log('\nRaw JSON (first 500 chars):')
  console.log('----------------')
  console.log(JSON.stringify(workout.rawJson).substring(0, 500))

  if (workout.structuredWorkout) {
    console.log('\nStructured Workout:')
    console.log('----------------')
    console.log(JSON.stringify(workout.structuredWorkout, null, 2).substring(0, 1000))
  }
}

checkPlannedWorkout()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
