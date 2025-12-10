/**
 * Backfill Training Stress Metrics (CTL/ATL)
 * 
 * This script calculates and updates CTL (Chronic Training Load) and ATL (Acute Training Load)
 * for all workouts in the database. It processes workouts chronologically to ensure
 * accurate exponentially weighted moving averages.
 * 
 * Usage:
 *   npx tsx scripts/backfill-training-stress.ts [userId]
 * 
 * If userId is not provided, it will process all users.
 */

import 'dotenv/config'
import { prisma } from '../server/utils/db'

// Inline the calculation functions
function calculateCTL(previousCTL: number, todayTSS: number): number {
  const timeConstant = 42
  return previousCTL + (todayTSS - previousCTL) / timeConstant
}

function calculateATL(previousATL: number, todayTSS: number): number {
  const timeConstant = 7
  return previousATL + (todayTSS - previousATL) / timeConstant
}

function getStressScore(workout: any): number {
  return workout.tss ?? workout.hrss ?? workout.trimp ?? 0
}

interface BackfillStats {
  usersProcessed: number
  workoutsUpdated: number
  workoutsSkipped: number
  errors: number
}

async function backfillUserMetrics(userId: string): Promise<{ updated: number; skipped: number }> {
  console.log(`\nProcessing user: ${userId}`)
  
  // Fetch all workouts for this user, ordered chronologically
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      isDuplicate: false,
      durationSec: { gt: 0 }
    },
    orderBy: { date: 'asc' }
  })
  
  if (workouts.length === 0) {
    console.log('  No workouts found')
    return { updated: 0, skipped: 0 }
  }
  
  console.log(`  Found ${workouts.length} workouts`)
  
  let ctl = 0
  let atl = 0
  let updated = 0
  let skipped = 0
  
  for (const workout of workouts) {
    // Get TSS (or HRSS/TRIMP)
    const tss = getStressScore(workout)
    
    // Calculate new CTL and ATL
    ctl = calculateCTL(ctl, tss)
    atl = calculateATL(atl, tss)
    
    // Check if we need to update
    const needsUpdate = workout.ctl !== ctl || workout.atl !== atl
    
    if (needsUpdate) {
      await prisma.workout.update({
        where: { id: workout.id },
        data: { ctl, atl }
      })
      updated++
      
      if (updated % 100 === 0) {
        console.log(`  Updated ${updated} workouts...`)
      }
    } else {
      skipped++
    }
  }
  
  console.log(`  ✓ Updated: ${updated}, Skipped: ${skipped}`)
  console.log(`  Final CTL: ${ctl.toFixed(1)}, ATL: ${atl.toFixed(1)}, TSB: ${(ctl - atl).toFixed(1)}`)
  
  return { updated, skipped }
}

async function main() {
  const args = process.argv.slice(2)
  const targetUserId = args[0]
  
  console.log('=== Training Stress Metrics Backfill ===\n')
  
  const stats: BackfillStats = {
    usersProcessed: 0,
    workoutsUpdated: 0,
    workoutsSkipped: 0,
    errors: 0
  }
  
  try {
    let userIds: string[]
    
    if (targetUserId) {
      console.log(`Processing single user: ${targetUserId}`)
      userIds = [targetUserId]
    } else {
      // Get all users who have workouts
      const users = await prisma.user.findMany({
        where: {
          workouts: {
            some: {
              isDuplicate: false,
              durationSec: { gt: 0 }
            }
          }
        },
        select: { id: true, email: true }
      })
      
      console.log(`Found ${users.length} users with workouts\n`)
      userIds = users.map(u => u.id)
    }
    
    // Process each user
    for (const userId of userIds) {
      try {
        const result = await backfillUserMetrics(userId)
        stats.usersProcessed++
        stats.workoutsUpdated += result.updated
        stats.workoutsSkipped += result.skipped
      } catch (error) {
        console.error(`  ✗ Error processing user ${userId}:`, error)
        stats.errors++
      }
    }
    
    // Print summary
    console.log('\n=== Summary ===')
    console.log(`Users processed: ${stats.usersProcessed}`)
    console.log(`Workouts updated: ${stats.workoutsUpdated}`)
    console.log(`Workouts skipped: ${stats.workoutsSkipped}`)
    console.log(`Errors: ${stats.errors}`)
    
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

main()