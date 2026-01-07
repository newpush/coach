import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function checkHiddenWorkouts() {
  // Cast prisma to any to avoid type issues with script execution context
  const db = prisma as any

  const ids = [
    '64d11491-fe95-4c6c-9b18-a066c3d7fc40',
    '5671b447-e901-44cb-a69e-304954b11b87',
    'a98d6c77-0a84-4907-afab-394ff9144e89',
    '7b020269-8602-4cc0-9466-d8cbb86e7f36',
    '77db85b6-4506-493c-b365-b094a4752132'
  ]

  console.log('Checking workouts...')

  const workouts = await db.workout.findMany({
    where: {
      id: { in: ids }
    },
    select: {
      id: true,
      title: true,
      date: true,
      isDuplicate: true,
      source: true
    }
  })

  console.log('Found workouts:', workouts)

  if (workouts.length === 0) {
    console.log('No workouts found with these IDs. They might have been deleted.')
  } else {
    workouts.forEach((w: any) => {
      console.log(
        `- ${w.title} (${w.id}): isDuplicate=${w.isDuplicate}, source=${w.source}, date=${w.date}`
      )
    })
  }
}

checkHiddenWorkouts()
  .catch(console.error)
  .finally(async () => {
    const db = prisma as any
    await db.$disconnect()
  })
