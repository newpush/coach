/**
 * Check if duplicate workouts are affecting TSS calculations
 */
import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  console.log('Checking for duplicate workout TSS issues...\n')

  // Get all users
  const users = await prisma.user.findMany({
    select: { id: true, email: true }
  })

  for (const user of users) {
    console.log(`\n=== User: ${user.email} ===`)

    // Get all workouts (including duplicates)
    const allWorkouts = await prisma.workout.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        title: true,
        date: true,
        tss: true,
        isDuplicate: true,
        duplicateOf: true
      },
      orderBy: { date: 'desc' },
      take: 50
    })

    // Get non-duplicate workouts
    const nonDuplicates = allWorkouts.filter((w) => !w.isDuplicate)
    const duplicates = allWorkouts.filter((w) => w.isDuplicate)

    console.log(`Total workouts: ${allWorkouts.length}`)
    console.log(`Non-duplicates: ${nonDuplicates.length}`)
    console.log(`Duplicates: ${duplicates.length}`)

    // Calculate TSS totals
    const totalTssAll = allWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0)
    const totalTssNonDup = nonDuplicates.reduce((sum, w) => sum + (w.tss || 0), 0)
    const totalTssDup = duplicates.reduce((sum, w) => sum + (w.tss || 0), 0)

    console.log(`\nTSS Summary (last 50 workouts):`)
    console.log(`  All workouts TSS: ${Math.round(totalTssAll)}`)
    console.log(`  Non-duplicate TSS: ${Math.round(totalTssNonDup)}`)
    console.log(`  Duplicate TSS: ${Math.round(totalTssDup)}`)
    console.log(`  Difference: ${Math.round(totalTssAll - totalTssNonDup)}`)

    if (duplicates.length > 0) {
      console.log(`\nRecent duplicates:`)
      duplicates.slice(0, 5).forEach((d) => {
        const canonical = allWorkouts.find((w) => w.id === d.duplicateOf)
        console.log(`  - ${d.title} (${d.date.toISOString().split('T')[0]})`)
        console.log(`    TSS: ${d.tss || 0}, Duplicate of: ${canonical?.title || 'Unknown'}`)
      })
    }

    // Check for workouts on the same date
    const dateGroups = new Map<string, typeof allWorkouts>()
    allWorkouts.forEach((w) => {
      const dateKey = w.date.toISOString().split('T')[0]
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, [])
      }
      dateGroups.get(dateKey)!.push(w)
    })

    const datesWithMultiple = Array.from(dateGroups.entries())
      .filter(([_, workouts]) => workouts.length > 1)
      .slice(0, 5)

    if (datesWithMultiple.length > 0) {
      console.log(`\nDates with multiple workouts:`)
      datesWithMultiple.forEach(([date, workouts]) => {
        console.log(`  ${date}:`)
        workouts.forEach((w) => {
          console.log(`    - ${w.title} (TSS: ${w.tss || 0}, Duplicate: ${w.isDuplicate})`)
        })
      })
    }
  }
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
