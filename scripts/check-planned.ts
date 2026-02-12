import { prisma } from '../server/utils/db'

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'hdkiller@gmail.com' } })
  if (!user) return

  const dateStr = '2026-02-11'
  const dateObj = new Date(`${dateStr}T00:00:00Z`)

  console.log(`Fetching Planned Workouts for ${dateStr}...`)

  const planned = await prisma.plannedWorkout.findMany({
    where: {
      userId: user.id,
      date: dateObj
    }
  })

  console.log(`Found ${planned.length} planned workouts:`)
  planned.forEach((p) => {
    console.log(`- ID: ${p.id}`)
    console.log(`  Title: ${p.title}`)
    console.log(`  Completed: ${p.completed}`)
    console.log(`  Completion Status: ${p.completionStatus}`)
  })

  console.log('Fetching Completed Workouts for this day...')
  const completed = await prisma.workout.findMany({
    where: {
      userId: user.id,
      date: {
        gte: new Date('2026-02-11T00:00:00Z'),
        lt: new Date('2026-02-12T00:00:00Z')
      }
    }
  })

  console.log(`Found ${completed.length} completed workouts:`)
  completed.forEach((w) => {
    console.log(`- ID: ${w.id}`)
    console.log(`  Title: ${w.title}`)
    console.log(`  PlannedWorkoutId: ${w.plannedWorkoutId}`)
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
