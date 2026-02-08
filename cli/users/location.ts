import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import geoip from 'geoip-lite'

const locationCommand = new Command('location').description('Manage user location based on IP')

async function getPrisma(isProd: boolean) {
  const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

  if (isProd) {
    console.log(chalk.yellow('⚠️  Using PRODUCTION database.'))
  } else {
    console.log(chalk.blue('Using DEVELOPMENT database.'))
  }

  if (!connectionString) {
    console.error(chalk.red('Error: Database connection string is not defined.'))
    if (isProd) {
      console.error(chalk.red('Make sure DATABASE_URL_PROD is set in .env'))
    } else {
      console.error(chalk.red('Make sure DATABASE_URL is set in .env'))
    }
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  return { prisma, pool }
}

locationCommand
  .command('check')
  .description('Check last IP and suggested country for a user')
  .argument('<query>', 'User email, ID or name')
  .option('--prod', 'Use production database')
  .option('--update', 'Update user country if found')
  .action(async (query, options) => {
    const { prisma, pool } = await getPrisma(options.prod)

    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { id: { equals: query } },
            { name: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          email: true,
          name: true,
          country: true,
          lastLoginIp: true
        }
      })

      if (!user) {
        console.error(chalk.red(`User "${query}" not found.`))
        process.exit(1)
      }

      console.log(chalk.blue(`User: ${user.name || 'N/A'} (${user.email})`))
      console.log(chalk.blue(`Current Country: ${user.country || 'Not set'}`))

      let ip: string | null = user.lastLoginIp

      if (!ip) {
        const lastAudit = await prisma.auditLog.findFirst({
          where: {
            userId: user.id,
            ipAddress: { not: null }
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
        ip = lastAudit?.ipAddress || null
      }

      if (!ip) {
        const lastToken = await prisma.oAuthToken.findFirst({
          where: {
            userId: user.id,
            lastIp: { not: null }
          },
          orderBy: { createdAt: 'desc' }
        })
        ip = lastToken?.lastIp || null
      }

      if (!ip) {
        console.log(chalk.yellow('No IP address found for this user.'))
        return
      }

      console.log(chalk.green(`Using IP: ${ip}`))

      // GeoIP Lookup
      console.log(chalk.gray(`Looking up location for ${ip}...`))
      const geo = geoip.lookup(ip)

      if (geo) {
        console.log(
          chalk.green(
            `Suggested Location: ${geo.city || 'Unknown City'}, ${geo.region || ''}, ${geo.country}`
          )
        )

        if (options.update) {
          if (user.country === geo.country) {
            console.log(chalk.yellow('User country is already correct.'))
          } else {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                country: geo.country,
                city: geo.city || undefined,
                state: geo.region || undefined
              }
            })
            console.log(chalk.green(`Successfully updated user country to ${geo.country}.`))
          }
        } else if (!user.country) {
          console.log(chalk.cyan('Hint: Run with --update to set this country for the user.'))
        }
      } else {
        console.error(chalk.red(`GeoIP lookup failed: No data found for IP`))
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e.message)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

locationCommand
  .command('list-missing')
  .description('List users missing country information')
  .option('--prod', 'Use production database')
  .option('--limit <number>', 'Limit number of users', '50')
  .action(async (options) => {
    const { prisma, pool } = await getPrisma(options.prod)
    const limit = parseInt(options.limit)

    try {
      const users = await prisma.user.findMany({
        where: {
          OR: [{ country: null }, { country: '' }]
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true
        },
        take: limit,
        orderBy: { createdAt: 'desc' }
      })

      if (users.length === 0) {
        console.log(chalk.green('No users missing country information.'))
        return
      }

      console.log(chalk.blue(`Found ${users.length} users missing country information:`))

      const results = []
      for (const user of users) {
        const lastAudit = await prisma.auditLog.findFirst({
          where: {
            userId: user.id,
            ipAddress: { not: null }
          },
          orderBy: { createdAt: 'desc' }
        })

        results.push({
          email: user.email,
          name: user.name || 'N/A',
          lastIp: lastAudit?.ipAddress || 'None',
          lastAction: lastAudit?.action || 'N/A',
          lastSeen: lastAudit?.createdAt ? lastAudit.createdAt.toISOString() : 'N/A'
        })
      }

      console.table(results)
    } catch (e: any) {
      console.error(chalk.red('Error:'), e.message)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

locationCommand
  .command('process-missing')
  .description('Batch process users missing country information using their last IP')
  .option('--prod', 'Use production database')
  .option('--limit <number>', 'Limit number of users', '10')
  .option('--update', 'Update user country if found')
  .action(async (options) => {
    const { prisma, pool } = await getPrisma(options.prod)
    const limit = parseInt(options.limit)

    try {
      const allMissing = await prisma.user.findMany({
        where: {
          OR: [{ country: null }, { country: '' }]
        },
        select: {
          id: true,
          email: true,
          name: true,
          lastLoginIp: true
        },
        orderBy: { createdAt: 'desc' }
      })

      if (allMissing.length === 0) {
        console.log(chalk.green('No users missing country information.'))
        return
      }

      console.log(
        chalk.blue(
          `Found ${allMissing.length} users missing country information. Scanning for IP data...`
        )
      )

      // Scan for ALL users with IPs first to give a full count
      const usersWithIp = []
      let totalWithIp = 0

      for (const user of allMissing) {
        let ip: string | null = user.lastLoginIp

        if (!ip) {
          const lastAudit = await prisma.auditLog.findFirst({
            where: {
              userId: user.id,
              ipAddress: { not: null }
            },
            orderBy: { createdAt: 'desc' },
            select: { ipAddress: true }
          })
          ip = lastAudit?.ipAddress || null
        }

        if (!ip) {
          const lastToken = await prisma.oAuthToken.findFirst({
            where: {
              userId: user.id,
              lastIp: { not: null }
            },
            orderBy: { createdAt: 'desc' },
            select: { lastIp: true }
          })
          ip = lastToken?.lastIp || null
        }

        if (ip) {
          totalWithIp++
          if (usersWithIp.length < limit) {
            usersWithIp.push({ ...user, ip })
          }
        }
      }

      console.log(chalk.green(`Total users missing country: ${allMissing.length}`))
      console.log(chalk.green(`Users with available IP data: ${totalWithIp}`))

      if (usersWithIp.length === 0) {
        console.log(
          chalk.yellow('\nNo users with IP data found among those missing country information.')
        )
        return
      }

      console.log(chalk.blue(`\nProcessing first ${usersWithIp.length} users with IPs:\n`))

      for (const user of usersWithIp) {
        process.stdout.write(chalk.gray(`- ${user.email} (${user.ip}): `))

        // GeoIP Lookup
        const geo = geoip.lookup(user.ip)

        if (geo) {
          console.log(chalk.green(`${geo.country} - ${geo.city || 'Unknown City'}`))

          if (options.update) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                country: geo.country,
                city: geo.city || undefined,
                state: geo.region || undefined
              }
            })
          }
        } else {
          console.log(chalk.red(`GeoIP lookup failed`))
        }
      }

      console.log(chalk.blue('\nProcessing complete.'))
      if (!options.update) {
        console.log(chalk.cyan('Note: This was a dry run. Use --update to apply changes.'))
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e.message)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

locationCommand
  .command('list-recent')
  .description('List the last 50 users with their IP and location info using GeoIP')
  .option('--prod', 'Use production database')
  .action(async (options) => {
    const { prisma, pool } = await getPrisma(options.prod)

    try {
      const users = await prisma.user.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          country: true,
          city: true,
          lastLoginIp: true,
          createdAt: true
        }
      })

      if (users.length === 0) {
        console.log(chalk.yellow('No users found.'))
        return
      }

      console.log(chalk.blue(`Found ${users.length} recent users:`))

      const results = []
      for (const user of users) {
        let ip = user.lastLoginIp

        if (!ip) {
          const lastAudit = await prisma.auditLog.findFirst({
            where: {
              userId: user.id,
              ipAddress: { not: null }
            },
            orderBy: { createdAt: 'desc' },
            select: { ipAddress: true }
          })
          ip = lastAudit?.ipAddress
        }

        let geoInfo = 'Unknown'
        let geoCity = 'Unknown'
        let geoCountry = 'Unknown'

        if (ip && ip !== 'unknown') {
          const geo = geoip.lookup(ip)
          if (geo) {
            geoCountry = geo.country
            geoCity = geo.city
            geoInfo = `${geo.city}, ${geo.country}`
          }
        }

        results.push({
          email: user.email,
          name: user.name || 'N/A',
          stored_country: user.country || 'N/A',
          stored_city: user.city || 'N/A',
          ip: ip || 'None',
          geoip_location: geoInfo,
          joined: user.createdAt.toISOString().split('T')[0]
        })
      }

      console.table(results)
    } catch (e: any) {
      console.error(chalk.red('Error:'), e.message)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

locationCommand
  .command('update-db')
  .description('Update the GeoIP database using MAXMIND_LICENSE_KEY')
  .action(async () => {
    const licenseKey = process.env.MAXMIND_LICENSE_KEY
    if (!licenseKey) {
      console.error(chalk.red('Error: MAXMIND_LICENSE_KEY is not set in .env'))
      process.exit(1)
    }

    console.log(chalk.blue('Updating GeoIP database...'))

    // We need to run the update script inside node_modules/geoip-lite
    // Command: cd node_modules/geoip-lite && npm run-script updatedb license_key=KEY
    // We use child_process to execute this.
    const { exec } = await import('child_process')
    const { createRequire } = await import('module')
    const require = createRequire(import.meta.url)

    // Determine path to geoip-lite. In pnpm, it might be nested or symlinked.
    // Safest is to rely on require.resolve or just try standard path.
    // Let's assume standard structure first or use require.resolve to find package.json
    try {
      const geoipPath = require.resolve('geoip-lite/package.json').replace('/package.json', '')
      console.log(chalk.gray(`Found geoip-lite at: ${geoipPath}`))

      const command = `cd "${geoipPath}" && npm run-script updatedb license_key=${licenseKey}`

      const child = exec(command)

      child.stdout?.on('data', (data) => {
        console.log(chalk.gray(data.toString()))
      })

      child.stderr?.on('data', (data) => {
        console.error(chalk.yellow(data.toString()))
      })

      child.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('GeoIP database updated successfully.'))
        } else {
          console.error(chalk.red(`GeoIP update failed with exit code ${code}`))
        }
      })
    } catch (e: any) {
      console.error(chalk.red('Failed to locate geoip-lite package or execute update:'), e.message)
    }
  })

export default locationCommand
