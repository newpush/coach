import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Checking workouts in database...\n')

  // Get user
  const user = await prisma.user.findFirst()
  if (!user) {
    console.log('No user found')
    return
  }

  console.log(`User: ${user.email}`)
  console.log(`User ID: ${user.id}\n`)

  // Get intervals integration
  const integration = await prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId: user.id,
        provider: 'intervals'
      }
    }
  })

  if (!integration) {
    console.log('No intervals integration found')
    return
  }

  console.log(`Integration: ${integration.provider}`)
  console.log(`Sync Status: ${integration.syncStatus}`)
  console.log(`Last Sync: ${integration.lastSyncAt}`)
  console.log(`Error: ${integration.errorMessage}\n`)

  // Get recent workouts (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const workouts = await prisma.workout.findMany({
    where: {
      userId: user.id,
      date: {
        gte: sevenDaysAgo
      }
    },
    orderBy: {
      date: 'desc'
    },
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      source: true,
      externalId: true,
      durationSec: true,
      distanceMeters: true
    }
  })

  console.log(`\nRecent workouts (last 7 days): ${workouts.length}`)
  console.log('='.repeat(80))

  workouts.forEach((w, idx) => {
    console.log(`\n${idx + 1}. ${w.title}`)
    console.log(`   Date: ${w.date.toISOString()}`)
    console.log(`   Type: ${w.type}`)
    console.log(`   Source: ${w.source}`)
    console.log(`   External ID: ${w.externalId}`)
    console.log(`   Duration: ${w.durationSec ? `${Math.round(w.durationSec / 60)} min` : 'N/A'}`)
    console.log(
      `   Distance: ${w.distanceMeters ? `${(w.distanceMeters / 1000).toFixed(2)} km` : 'N/A'}`
    )
  })

  console.log('\n' + '='.repeat(80))
  console.log(
    `\nTotal workouts in DB: ${await prisma.workout.count({ where: { userId: user.id } })}`
  )
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
