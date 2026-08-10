import { Command } from 'commander'
import chalk from 'chalk'
import { prisma } from '../../server/utils/db'
import { calculateHrZones, calculatePowerZones, type Zone } from '../../server/utils/zones'

const migrateZonesCommand = new Command('migrate-zones')

/**
 * Zone maths lives in exactly one place: `server/utils/zones.ts` (CW-431).
 *
 * This file used to carry its own copy of the percentages and band names. It
 * had drifted: HR bands were named `Z5 SuperThreshold` / `Z6 Aerobic Capacity`
 * / `Z7 Anaerobic` against the canonical `Z5a` / `Z5b` / `Z5c`, Z1 topped out at
 * 80% of LTHR instead of 81%, the sixth band at 105% instead of 106%, the top
 * band at `threshold * 1.1` instead of max HR, and a missing LTHR was papered
 * over with a `maxHr * 0.85` estimate so the tool always emitted seven Friel
 * bands where the app emits the five-band max-HR model. Two athletes therefore
 * saw different zone names for the same physiology depending on whether their
 * profile was written by this migration or computed by the app.
 *
 * Import the canonical helpers; never re-derive bands here.
 */

/** The athlete references this migration derives zone definitions from. */
export interface ZoneReferences {
  ftp?: number | null
  lthr?: number | null
  maxHr?: number | null
}

export interface ResolvedZones {
  hrZones: Zone[]
  powerZones: Zone[]
  /** True when the band definitions were derived rather than carried over. */
  computedHrZones: boolean
  computedPowerZones: boolean
}

/**
 * Decide which zone definitions to store for one athlete.
 *
 * Precedence is legacy-custom > calculated > empty: zones the athlete already
 * has are carried over untouched, and only a missing set is derived - from the
 * canonical model, so a migrated profile is indistinguishable from one the app
 * computes for the same references.
 */
export function resolveZonesForMigration(
  refs: ZoneReferences,
  existingHrZones?: unknown,
  existingPowerZones?: unknown
): ResolvedZones {
  const carriedHrZones = Array.isArray(existingHrZones) ? (existingHrZones as Zone[]) : []
  const carriedPowerZones = Array.isArray(existingPowerZones) ? (existingPowerZones as Zone[]) : []

  const computePower = carriedPowerZones.length === 0 && !!refs.ftp
  const computeHr = carriedHrZones.length === 0 && !!(refs.lthr || refs.maxHr)

  return {
    powerZones: computePower ? calculatePowerZones(refs.ftp!) : carriedPowerZones,
    hrZones: computeHr ? calculateHrZones(refs.lthr ?? null, refs.maxHr ?? null) : carriedHrZones,
    computedPowerZones: computePower,
    computedHrZones: computeHr
  }
}

/** Compact one-line summary of a band set, for the recompute diff log. */
function describeZones(zones: unknown): string {
  if (!Array.isArray(zones) || zones.length === 0) return 'none'
  return (zones as Zone[]).map((zone) => `${zone.name} ${zone.min}-${zone.max}`).join(', ')
}

/**
 * Opt-in remediation for profiles this tool already wrote with the pre-CW-431
 * band names and percentages.
 *
 * This is deliberately NOT part of a plain run. It rewrites athlete-visible
 * zone definitions in place - band names change (`Z5 SuperThreshold` becomes
 * `Z5a SuperThreshold`), boundaries shift by roughly a percent, and an athlete
 * with a max HR but no LTHR drops from seven bands to the canonical five - and
 * it cannot tell a stale migrated band set from one the athlete customised by
 * hand, so it replaces both. Run `--dry-run` first and read the diff.
 */
async function recomputeExistingProfiles(dryRun: boolean) {
  const profiles = await prisma.sportSettings.findMany({
    select: { id: true, name: true, userId: true, ftp: true, lthr: true, maxHr: true }
  })

  console.log(chalk.gray(`Found ${profiles.length} sport settings profiles to inspect.`))

  let rewritten = 0
  let skipped = 0

  for (const profile of profiles) {
    // Derive from the profile's own references, ignoring whatever is stored, so
    // the result is exactly what the app would compute for this athlete.
    const { hrZones, powerZones } = resolveZonesForMigration(profile)

    if (hrZones.length === 0 && powerZones.length === 0) {
      skipped++
      continue
    }

    console.log(chalk.cyan(`Recomputing zones for profile ${profile.name} (${profile.id})`))
    if (hrZones.length > 0) console.log(chalk.gray(`  HR    -> ${describeZones(hrZones)}`))
    if (powerZones.length > 0) console.log(chalk.gray(`  Power -> ${describeZones(powerZones)}`))

    if (!dryRun) {
      await prisma.sportSettings.update({
        where: { id: profile.id },
        data: {
          ...(hrZones.length > 0 ? { hrZones } : {}),
          ...(powerZones.length > 0 ? { powerZones } : {})
        }
      })
    }
    rewritten++
  }

  console.log(chalk.bold('\nRecompute Results:'))
  console.log(`Total Profiles: ${profiles.length}`)
  console.log(`${dryRun ? 'Would rewrite' : 'Rewritten'}:  ${rewritten}`)
  console.log(`Skipped (no references): ${skipped}`)
}

migrateZonesCommand
  .description('Migrate custom zones (HR/Power) from User model to SportSettings')
  .option('--force', 'Force re-creation of default profiles even if they exist')
  .option(
    '--recompute-zones',
    'Rewrite the stored zone definitions of EXISTING default profiles onto the canonical model ' +
      '(server/utils/zones.ts). Athlete-visible: it replaces band names and boundaries, including ' +
      'any the athlete customised. Off by default - a plain run never touches an existing profile.'
  )
  .option('--dry-run', 'Report what would change without writing anything')
  .action(async (options) => {
    console.log(chalk.blue('🚀 Starting Custom Zones Migration...'))
    if (options.dryRun) console.log(chalk.magenta('DRY RUN - no writes will be performed.'))

    try {
      if (options.recomputeZones) {
        await recomputeExistingProfiles(Boolean(options.dryRun))
        return
      }

      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          hrZones: true,
          powerZones: true,
          ftp: true,
          maxHr: true,
          lthr: true,
          restingHr: true
        }
      })

      console.log(chalk.gray(`Found ${users.length} users to process.`))

      let migrated = 0
      let skipped = 0
      let errors = 0

      for (const user of users) {
        try {
          const existingDefault = await prisma.sportSettings.findFirst({
            where: { userId: user.id, isDefault: true }
          })

          // Determine optimal zones (Legacy > Calculated > Empty)
          const resolved = resolveZonesForMigration(user, user.hrZones, user.powerZones)
          const finalHrZones = resolved.hrZones
          const finalPowerZones = resolved.powerZones

          if (resolved.computedPowerZones) {
            console.log(chalk.gray(`  Calculated Power Zones for ${user.email} (FTP: ${user.ftp})`))
          }

          if (resolved.computedHrZones) {
            console.log(chalk.gray(`  Calculated HR Zones for ${user.email}`))
          }

          if (existingDefault && !options.force) {
            // Check if existing default is empty but we have calculated ones now?
            // If the user didn't ask for force, we skip.
            console.log(
              chalk.yellow(`Skipping user ${user.email} - Default profile already exists.`)
            )
            skipped++
            continue
          }

          if (existingDefault && options.force) {
            console.log(chalk.cyan(`Updating existing default profile for ${user.email}...`))
            if (options.dryRun) {
              migrated++
              continue
            }
            await prisma.sportSettings.update({
              where: { id: existingDefault.id },
              data: {
                hrZones: finalHrZones,
                powerZones: finalPowerZones,
                ftp: user.ftp,
                maxHr: user.maxHr,
                lthr: user.lthr,
                restingHr: user.restingHr
              }
            })
          } else {
            console.log(chalk.green(`Creating default profile for ${user.email}...`))
            if (options.dryRun) {
              migrated++
              continue
            }

            // We can't use sportSettingsRepository.createDefault because it doesn't take our calculated zones
            // So we create manually
            await prisma.sportSettings.create({
              data: {
                userId: user.id,
                name: 'Default',
                isDefault: true,
                types: [],
                source: 'system',
                externalId: `default_${user.id}`,
                ftp: user.ftp,
                lthr: user.lthr,
                maxHr: user.maxHr,
                restingHr: user.restingHr,
                hrZones: finalHrZones,
                powerZones: finalPowerZones,
                warmupTime: 10,
                cooldownTime: 10,
                loadPreference: 'POWER_HR_PACE'
              }
            })
          }

          migrated++
        } catch (err) {
          console.error(chalk.red(`Error migrating user ${user.email}:`), err)
          errors++
        }
      }

      console.log(chalk.bold('\nMigration Results:'))
      console.log(`Total Users: ${users.length}`)
      console.log(`Migrated:    ${migrated}`)
      console.log(`Skipped:     ${skipped}`)
      console.log(`Errors:      ${errors}`)
    } catch (error) {
      console.error(chalk.red('Fatal error during migration:'), error)
    } finally {
      await prisma.$disconnect()
    }
  })

export default migrateZonesCommand
