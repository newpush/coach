/**
 * Trigger a global recalculation of training stress scores (CTL/ATL)
 * for all users, considering the current duplicate markings.
 * 
 * Usage: 
 *   Dev:  pnpm exec tsx scripts/recalculate-all-stress.ts [--dry]
 *   Prod: pnpm exec tsx scripts/recalculate-all-stress.ts --prod [--dry]
 */
import 'dotenv/config'

const useProd = process.argv.includes('--prod')
const isDryRun = process.argv.includes('--dry')

// Set the DATABASE_URL before importing prisma to ensure the singleton uses the correct one
if (useProd) {
  if (!process.env.DATABASE_URL_PROD) {
    console.error('❌ Error: DATABASE_URL_PROD is not set in your .env file.')
    process.exit(1)
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_PROD
  console.log('🚀 TARGET: PRODUCTION DATABASE')
} else {
  console.log('🛠️  TARGET: DEVELOPMENT DATABASE')
}

if (isDryRun) {
  console.log('🧪 DRY RUN MODE: No database changes will be made.')
}

async function main() {
  // Use dynamic imports to ensure process.env.DATABASE_URL is set BEFORE prisma is initialized
  const { prisma } = await import('../server/utils/db')
  // We import pure calculation functions. Note: training-stress.ts is safe to import as it uses dynamic imports for db
  const { calculateCTL, calculateATL, getStressScore } = await import('../server/utils/training-stress')

  console.log('🚀 Starting global training stress recalculation...')
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL is not set in your .env file.')
    process.exit(1)
  }

  if (useProd && !isDryRun) {
    console.log('⚠️  PROD SAFETY CHECK: Waiting 3 seconds... (Ctrl+C to abort)')
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  // Check connection
  try {
    console.log('📡 Connecting to database...')
    const users = await prisma.user.findMany({
      select: { id: true, email: true }
    })
    
    if (users.length === 0) {
      console.log('ℹ️ No users found in the database.')
      return
    }

    console.log(`✅ Found ${users.length} users. Starting recalculation chain...\n`)
    
    for (const user of users) {
      console.log(`👤 Processing user: ${user.email}`)
      
      // Get all workouts for this user, ordered by date
      const workouts = await prisma.workout.findMany({
        where: { 
          userId: user.id,
          isDuplicate: false
        },
        orderBy: { date: 'asc' },
        select: { 
          id: true, 
          date: true, 
          tss: true, 
          trimp: true,
          ctl: true, 
          atl: true,
          source: true
        }
      })
      
      if (workouts.length === 0) {
        console.log('   ℹ️ No workouts found for this user.')
        continue
      }

      console.log(`   📅 Found ${workouts.length} workouts. Starting from ${workouts[0].date.toISOString().split('T')[0]}`)
      
      let ctl = 0
      let atl = 0
      let updatedCount = 0
      let changedCount = 0
      let maxCtlDiff = 0
      let prevDate: Date | null = null
      
      for (let i = 0; i < workouts.length; i++) {
        const workout = workouts[i]

        // Use Intervals.icu data as starting point if available on the first workout
        if (i === 0 && workout.source === 'intervals' && workout.ctl !== null && workout.atl !== null) {
            ctl = workout.ctl
            atl = workout.atl
            console.log(`      🎯 Using Intervals.icu starting point: CTL=${ctl.toFixed(1)}, ATL=${atl.toFixed(1)}`)
            updatedCount++
            prevDate = new Date(workout.date)
            continue
        }

        // Apply decay for gap days
        if (prevDate) {
            // Normalize to midnight to count calendar days
            const d1 = new Date(prevDate)
            d1.setHours(0,0,0,0)
            const d2 = new Date(workout.date)
            d2.setHours(0,0,0,0)
            
            const diffTime = Math.abs(d2.getTime() - d1.getTime())
            const daysDiff = Math.round(diffTime / (1000 * 60 * 60 * 24))
            
            if (daysDiff > 1) {
                // Decay for the rest days (daysDiff - 1)
                // CTL time constant = 42 -> decay factor = 41/42
                // ATL time constant = 7  -> decay factor = 6/7
                const gapDays = daysDiff - 1
                ctl = ctl * Math.pow(41/42, gapDays)
                atl = atl * Math.pow(6/7, gapDays)
            }
        }

        const tss = getStressScore(workout)
        ctl = calculateCTL(ctl, tss)
        atl = calculateATL(atl, tss)
        
        // Check for diff
        const currentCtl = workout.ctl ?? 0
        const currentAtl = workout.atl ?? 0
        const ctlDiff = Math.abs(currentCtl - ctl)
        const atlDiff = Math.abs(currentAtl - atl)
        
        if (ctlDiff > 0.1 || atlDiff > 0.1) {
          changedCount++
          if (ctlDiff > maxCtlDiff) maxCtlDiff = ctlDiff
        }

        if (!isDryRun) {
            await prisma.workout.update({
                where: { id: workout.id },
                data: { ctl, atl }
            })
        }
        updatedCount++
        prevDate = new Date(workout.date)
      }
      
      if (isDryRun) {
        console.log(`   🧪 Dry Run Results:`)
        console.log(`      Processed: ${updatedCount}`)
        console.log(`      Would Change: ${changedCount}`)
        console.log(`      Max CTL Diff: ${maxCtlDiff.toFixed(2)}`)
      } else {
        console.log(`   ✅ Success: Updated ${updatedCount} workouts.`)
      }
    }
    
    if (isDryRun) {
        console.log('\n✨ Dry run complete. No changes were made to the database.')
    } else {
        console.log('\n✨ Global recalculation complete. Your Fitness (CTL) and Form (TSB) data is now consistent.')
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error during recalculation:')
    console.error(`   ${error.message || error}`)
    if (error.message?.includes('password')) {
        console.error('\n   Tip: Check if your connection string contains special characters that might need encoding.')
    }
    process.exit(1)
  } finally {
    try {
        const { prisma } = await import('../server/utils/db')
        await (prisma as any).$disconnect()
    } catch (e) {}
  }
}

main()
