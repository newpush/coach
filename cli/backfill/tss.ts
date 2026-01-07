import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { calculateCTL, calculateATL, getStressScore } from '../../server/utils/training-stress'

const backfillTssCommand = new Command('tss')
  .description('Backfill Training Stress metrics (CTL, ATL) for workouts')
  .option('-u, --user <userId>', 'Target specific user ID')
  .option('-d, --dry-run', 'Dry run mode (do not commit changes)', false)
  .option('--prod', 'Use production database', false)
  .action(async (options) => {
    console.log(chalk.blue('=== Backfill Training Stress (CTL/ATL) ==='))
    console.log(`Dry Run: ${options.dryRun ? 'YES' : 'NO'}`)
    if (options.user) console.log(`Target User: ${options.user}`)

    // Database selection logic
    const isProd = options.prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      if (!connectionString) {
        console.error(chalk.red('DATABASE_URL_PROD is not defined.'))
        process.exit(1)
      }
      console.log(chalk.yellow('Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    // Initialize Prisma Client dynamically
    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      // Get users to process
      const users = options.user
        ? await prisma.user.findMany({
            where: { id: options.user },
            select: { id: true, email: true }
          })
        : await prisma.user.findMany({
            where: {
              workouts: {
                some: {
                  isDuplicate: false
                  // durationSec: { gt: 0 } // Optional filter from original script, keeping it broad here
                }
              }
            },
            select: { id: true, email: true }
          })

      if (users.length === 0) {
        console.log(chalk.yellow('No users found to process.'))
        return
      }

      console.log(`Found ${users.length} user(s) to process.\n`)

      let totalUpdated = 0
      let totalSkipped = 0

      for (const user of users) {
        console.log(chalk.cyan(`Processing User: ${user.email || user.id}`))

        // Fetch all workouts for this user, ordered chronologically
        const workouts = await prisma.workout.findMany({
          where: {
            userId: user.id,
            isDuplicate: false
            // Ensure we have some stress score to work with or at least a date
          },
          orderBy: { date: 'asc' },
          select: {
            id: true,
            date: true,
            title: true,
            tss: true,
            // hrss: true, // Removed as per schema validation error
            trimp: true,
            ctl: true,
            atl: true
          }
        })

        if (workouts.length === 0) {
          console.log('  No workouts found.')
          continue
        }

        console.log(`  Found ${workouts.length} workouts.`)

        let ctl = 0
        let atl = 0
        let userUpdated = 0
        let userSkipped = 0

        for (const workout of workouts) {
          // getStressScore implementation in utils expects generic object
          // but our selected object might be missing hrss if it's not in schema
          // We cast to any to satisfy ts, or we rely on the utility handling missing keys (it uses ??)
          const tss = getStressScore(workout)

          // Calculate new CTL and ATL
          ctl = calculateCTL(ctl, tss)
          atl = calculateATL(atl, tss)

          // Check if we need to update
          // Use a small epsilon for float comparison to avoid unnecessary updates
          const epsilon = 0.01
          const currentCtl = workout.ctl || 0
          const currentAtl = workout.atl || 0

          const needsUpdate =
            Math.abs(currentCtl - ctl) > epsilon || Math.abs(currentAtl - atl) > epsilon

          if (needsUpdate) {
            if (options.dryRun) {
              // Verbose dry run might be too much, maybe just count?
              // console.log(`  [DRY RUN] Would update ${workout.id}: CTL ${currentCtl.toFixed(1)}->${ctl.toFixed(1)}, ATL ${currentAtl.toFixed(1)}->${atl.toFixed(1)}`);
            } else {
              await prisma.workout.update({
                where: { id: workout.id },
                data: { ctl, atl }
              })
            }
            userUpdated++
          } else {
            userSkipped++
          }
        }

        if (options.dryRun) {
          console.log(
            chalk.yellow(`  [DRY RUN] Would update ${userUpdated} workouts, skip ${userSkipped}.`)
          )
        } else {
          console.log(chalk.green(`  Updated ${userUpdated} workouts, skipped ${userSkipped}.`))
        }
        console.log(`  Final Status: CTL ${ctl.toFixed(1)}, ATL ${atl.toFixed(1)}, TSB ${(ctl - atl).toFixed(1)}
`)

        totalUpdated += userUpdated
        totalSkipped += userSkipped
      }

      console.log(chalk.bold('=== Summary ==='))
      console.log(`Users Processed: ${users.length}`)
      if (options.dryRun) {
        console.log(`Total Workouts That Would Be Updated: ${totalUpdated}`)
      } else {
        console.log(`Total Workouts Updated: ${totalUpdated}`)
      }
      console.log(`Total Workouts Skipped: ${totalSkipped}`)
    } catch (error) {
      console.error(chalk.red('Error during backfill:'), error)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
    }
  })

export default backfillTssCommand
