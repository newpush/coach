import { config } from 'dotenv'

// Load environment variables before importing anything else
config()

async function analyzeDuplicates() {
  console.log('Environment variables loaded.')

  const { prisma } = await import('../server/utils/db')

  const USER_ID = '6cbccf6c-e5a3-4df2-8305-2584e317f1ea'
  // Focus on the date from the screenshot: Sat Dec 6th
  const START_DATE = new Date('2025-12-06T00:00:00Z')
  const END_DATE = new Date('2025-12-07T00:00:00Z')

  console.log(`Analyzing workouts for user ${USER_ID} on ${START_DATE.toISOString().split('T')[0]}`)

  const workouts = await prisma.workout.findMany({
    where: {
      userId: USER_ID,
      date: {
        gte: START_DATE,
        lt: END_DATE
      }
    },
    orderBy: { date: 'asc' }
  })

  console.log(`Found ${workouts.length} workouts on this day:`)
  console.log('---------------------------------------------------')

  for (const w of workouts) {
    console.log(`ID: ${w.id}`)
    console.log(`Source: ${w.source}`)
    console.log(`Ext ID: ${w.externalId}`)
    console.log(`Title: ${w.title}`)
    console.log(`Type: ${w.type}`)
    console.log(`Date (UTC): ${w.date.toISOString()}`)
    console.log(`Duration: ${w.durationSec}s`)
    console.log(`Distance: ${w.distanceMeters}m`)
    console.log(`Duplicate?: ${w.isDuplicate}`)
    console.log(`Dup Of: ${w.duplicateOf}`)
    console.log('---------------------------------------------------')
  }

  // Check simple overlap
  console.log('\nChecking overlaps (Start A < End B && End A > Start B):')
  for (let i = 0; i < workouts.length; i++) {
    for (let j = i + 1; j < workouts.length; j++) {
      const w1 = workouts[i]
      const w2 = workouts[j]

      const start1 = w1.date.getTime()
      const end1 = start1 + w1.durationSec * 1000

      const start2 = w2.date.getTime()
      const end2 = start2 + w2.durationSec * 1000

      // Check overlap
      if (start1 < end2 && end1 > start2) {
        console.log(`\nOverlap detected between:`)
        console.log(
          `1. [${w1.source}] ${w1.title} (${new Date(start1).toISOString()} - ${new Date(end1).toISOString()})`
        )
        console.log(
          `2. [${w2.source}] ${w2.title} (${new Date(start2).toISOString()} - ${new Date(end2).toISOString()})`
        )

        // Calculate overlap duration
        const overlapStart = Math.max(start1, start2)
        const overlapEnd = Math.min(end1, end2)
        const overlapDuration = (overlapEnd - overlapStart) / 1000
        console.log(`   Overlap Duration: ${overlapDuration}s`)

        // Check similarity
        const typeMatch = w1.type === w2.type
        console.log(`   Type Match: ${typeMatch} (${w1.type} vs ${w2.type})`)
      }
    }
  }

  await prisma.$disconnect()
}

analyzeDuplicates()
