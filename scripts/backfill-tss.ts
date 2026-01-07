/**
 * Backfill TSS for existing workouts
 *
 * This script normalizes TSS for workouts that don't have it set.
 * It will:
 * 1. Find workouts with tss = null
 * 2. Try to calculate TSS using available data (power, HR, suffer score, TRIMP, etc.)
 * 3. Update CTL/ATL values after TSS is set
 *
 * Usage:
 *   npx tsx scripts/backfill-tss.ts [userId] [limit]
 *
 * Examples:
 *   npx tsx scripts/backfill-tss.ts                    # Process all users, all workouts
 *   npx tsx scripts/backfill-tss.ts <userId>           # Process specific user, all workouts
 *   npx tsx scripts/backfill-tss.ts <userId> 50        # Process specific user, 50 workouts
 */

import 'dotenv/config'
import { prisma } from '../server/utils/db'
import { backfillTSSForWorkouts } from '../server/utils/normalize-tss'
import { backfillPMCMetrics } from '../server/utils/training-stress'

async function main() {
  const args = process.argv.slice(2)
  const targetUserId = args[0]
  const limit = args[1] ? parseInt(args[1]) : undefined

  console.log('\n' + '='.repeat(80))
  console.log('TSS BACKFILL SCRIPT')
  console.log('='.repeat(80))
  console.log()

  if (targetUserId) {
    console.log(`Target User: ${targetUserId}`)
    console.log(`Limit: ${limit || 'All workouts'}`)
  } else {
    console.log('Mode: Process all users')
    console.log(`Limit: ${limit || 'All workouts per user'}`)
  }

  console.log()

  // Get users to process
  const users = targetUserId
    ? await prisma.user.findMany({ where: { id: targetUserId }, select: { id: true, email: true } })
    : await prisma.user.findMany({ select: { id: true, email: true } })

  if (users.length === 0) {
    console.log('❌ No users found')
    return
  }

  console.log(`Found ${users.length} user(s) to process\n`)

  let totalProcessed = 0
  let totalNormalized = 0
  let totalFailed = 0

  for (const user of users) {
    console.log('-'.repeat(80))
    console.log(`Processing User: ${user.email} (${user.id})`)
    console.log('-'.repeat(80))

    // Check user profile completeness
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { ftp: true, maxHr: true, restingHr: true }
    })

    console.log('User Profile:')
    console.log(`  FTP: ${profile?.ftp || 'Not set'} ${profile?.ftp ? '✅' : '❌'}`)
    console.log(`  Max HR: ${profile?.maxHr || 'Not set'} ${profile?.maxHr ? '✅' : '❌'}`)
    console.log(
      `  Resting HR: ${profile?.restingHr || 'Not set'} ${profile?.restingHr ? '✅' : '❌'}`
    )
    console.log()

    // Count workouts without TSS
    const workoutsWithoutTSS = await prisma.workout.count({
      where: {
        userId: user.id,
        tss: null,
        isDuplicate: false
      }
    })

    console.log(`Workouts without TSS: ${workoutsWithoutTSS}`)

    if (workoutsWithoutTSS === 0) {
      console.log('✓ All workouts already have TSS\n')
      continue
    }

    // Run backfill
    try {
      const result = await backfillTSSForWorkouts(user.id, limit)

      totalProcessed += result.processed
      totalNormalized += result.normalized
      totalFailed += result.failed

      console.log()
      console.log('Results:')
      console.log(`  Processed: ${result.processed}`)
      console.log(`  Normalized: ${result.normalized} ✓`)
      console.log(`  Failed: ${result.failed} ${result.failed > 0 ? '✗' : ''}`)
      console.log()

      // Recalculate CTL/ATL if any workouts were normalized
      if (result.normalized > 0) {
        console.log('Recalculating CTL/ATL...')
        const updated = await backfillPMCMetrics(user.id)
        console.log(`✓ Updated CTL/ATL for ${updated} workouts`)
      }

      console.log()
    } catch (error) {
      console.error(`✗ Error processing user: ${error}`)
      totalFailed += workoutsWithoutTSS
    }
  }

  // Summary
  console.log('='.repeat(80))
  console.log('BACKFILL COMPLETE')
  console.log('='.repeat(80))
  console.log()
  console.log(`Total Users: ${users.length}`)
  console.log(`Total Workouts Processed: ${totalProcessed}`)
  console.log(`Total Normalized: ${totalNormalized} ✓`)
  console.log(`Total Failed: ${totalFailed} ${totalFailed > 0 ? '✗' : ''}`)
  console.log()

  if (totalNormalized > 0) {
    const successRate = ((totalNormalized / totalProcessed) * 100).toFixed(1)
    console.log(`Success Rate: ${successRate}%`)
    console.log()
  }

  // Show recommendations if many failed
  if (totalFailed > totalNormalized) {
    console.log('💡 RECOMMENDATIONS:')
    console.log('   Many workouts could not be normalized. Consider:')
    console.log('   - Setting FTP, Max HR, and Resting HR in user profile')
    console.log('   - Ingesting stream data for workouts (power/HR data)')
    console.log('   - Using Strava or Intervals.icu which provide TSS/suffer scores')
    console.log()
  }

  console.log('Done!\n')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
