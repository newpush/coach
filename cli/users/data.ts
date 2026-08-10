import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import fs from 'fs/promises'
import path from 'path'
import zlib from 'zlib'
import { UserUniverseCollector } from '../../server/utils/data-management/collector'
import { UserUniverseImporter } from '../../server/utils/data-management/importer'
import transferCommand from './data-transfer'

const dataCommand = new Command('data').description('Export and import user data universes')

dataCommand.addCommand(transferCommand)

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

dataCommand
  .command('export')
  .description('Export a full user universe to a file')
  .argument('<identifier>', 'User email or UUID')
  .option('--prod', 'Use production database')
  .option('--output <path>', 'Output file path (defaults to ./backups/exports/)')
  .action(async (identifier, options) => {
    const { prisma, pool } = await getPrisma(options.prod)

    try {
      console.log(chalk.cyan(`Searching for user: ${identifier}...`))
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ id: identifier }, { email: identifier }]
        }
      })

      if (!user) {
        console.error(chalk.red(`User ${identifier} not found.`))
        process.exit(1)
      }

      console.log(chalk.cyan(`Found user: ${user.name || user.email} (${user.id})`))
      console.log(chalk.yellow(`Collecting data universe... this may take a moment.`))

      const collector = new UserUniverseCollector(prisma, user.id)
      const bundle = await collector.bundle()

      const outputDir = options.output || path.join(process.cwd(), 'backups', 'exports')
      await fs.mkdir(outputDir, { recursive: true })

      const filename = options.output
        ? path.basename(options.output)
        : `${user.email.replace(/[@.]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`
      const outputPath = options.output
        ? path.resolve(options.output)
        : path.join(outputDir, filename)

      // Handle binary data (FitFiles) serialization
      const content = JSON.stringify(bundle, null, 2)
      if (outputPath.endsWith('.gz')) {
        console.log(chalk.yellow(`Compressing GZIP file...`))
        const compressed = zlib.gzipSync(content)
        await fs.writeFile(outputPath, compressed)
      } else {
        await fs.writeFile(outputPath, content)
      }

      console.log(chalk.green(`\n✅ Export successful!`))
      console.log(chalk.white(`Package saved to: `) + chalk.cyan(outputPath))
      console.log(chalk.white(`Records gathered: `))
      console.log(`- Workouts: ${bundle.activities.workouts.length}`)
      console.log(`- Planned: ${bundle.activities.plannedWorkouts.length}`)
      console.log(`- Wellness: ${bundle.health.wellness.length}`)
      console.log(chalk.white(`- Chat Rooms: ${bundle.ai.rooms.length}`))
    } catch (e: any) {
      console.error(chalk.red('Error exporting data:'), e.message)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

dataCommand
  .command('api-pull')
  .description('Pull a user universe from a remote instance via API')
  .option('--key <apiKey>', 'API Key to use for authentication')
  .option('--host <url>', 'Host URL (defaults to https://coachwatts.com)', 'https://coachwatts.com')
  .option('--output <path>', 'Output file path (defaults to ./backups/exports/)')
  .action(async (options) => {
    const apiKey = options.key || process.env.COACHWATTS_API_KEY
    const host = options.host

    if (!apiKey) {
      console.error(
        chalk.red('Error: API Key is required. Set COACHWATTS_API_KEY in .env or use --key.')
      )
      process.exit(1)
    }

    try {
      console.log(chalk.cyan(`Pulling data universe from ${host}...`))
      const url = `${host.replace(/\/$/, '')}/api/profile/export`

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(chalk.red(`API Error (${response.status}): ${errorText}`))
        process.exit(1)
      }

      const bundle = await response.json()
      console.log(chalk.green(`\n✅ Data received for: ${bundle.profile.email}`))

      const outputDir = options.output || path.join(process.cwd(), 'backups', 'exports')
      await fs.mkdir(outputDir, { recursive: true })

      const filename = options.output
        ? path.basename(options.output)
        : `api_pull_${bundle.profile.email.replace(/[@.]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`
      const outputPath = options.output
        ? path.resolve(options.output)
        : path.join(outputDir, filename)

      const content = JSON.stringify(bundle, null, 2)
      if (outputPath.endsWith('.gz')) {
        console.log(chalk.yellow(`Compressing GZIP file...`))
        const compressed = zlib.gzipSync(content)
        await fs.writeFile(outputPath, compressed)
      } else {
        await fs.writeFile(outputPath, content)
      }

      console.log(chalk.green(`\n✅ Export successful!`))
      console.log(chalk.white(`Package saved to: `) + chalk.cyan(outputPath))
      console.log(
        chalk.yellow(`\nYou can now import this file locally using: `) +
          chalk.white(`cw:cli users data import ${outputPath} --clear`)
      )
    } catch (e: any) {
      console.error(chalk.red('Error pulling from API:'), e.message)
      process.exit(1)
    }
  })

dataCommand

  .command('import')
  .description('Import a user universe from a file into local database')
  .argument('<path>', 'Path to the export JSON file')
  .option('--clear', 'Delete existing local user with this email before import')
  .option('--email <email>', 'Override user email during import')
  .action(async (importPath, options) => {
    // Import always targets local DB for safety in this tool
    const { prisma, pool } = await getPrisma(false)

    try {
      const absolutePath = path.resolve(importPath)
      console.log(chalk.cyan(`Reading export package from: ${absolutePath}...`))

      let content: string
      if (importPath.endsWith('.gz')) {
        console.log(chalk.yellow(`Decompressing GZIP file...`))
        const compressedBuffer = await fs.readFile(absolutePath)
        const decompressedBuffer = zlib.gunzipSync(compressedBuffer)
        content = decompressedBuffer.toString('utf-8')
      } else {
        content = await fs.readFile(absolutePath, 'utf-8')
      }

      const bundle = JSON.parse(content)

      // Revive Buffers in FitFiles
      if (bundle.activities?.fitFiles) {
        bundle.activities.fitFiles.forEach((f: any) => {
          if (f.fileData && f.fileData.type === 'Buffer') {
            f.fileData = Buffer.from(f.fileData.data)
          }
        })
      }

      console.log(chalk.cyan(`Found data for: ${bundle.profile.email}`))
      console.log(chalk.yellow(`Injecting data universe into local database...`))

      const importer = new UserUniverseImporter(prisma)
      const user = await importer.import(bundle, {
        clearExisting: options.clear,
        emailOverride: options.email
      })

      console.log(chalk.green(`\n✅ Import successful!`))
      console.log(chalk.white(`User created/updated: `) + chalk.cyan(user.email))
      console.log(chalk.white(`ID preserved: `) + chalk.cyan(user.id))
      console.log(chalk.yellow(`\nYou can now log in locally as this user.`))
    } catch (e: any) {
      console.error(chalk.red('\n❌ Import failed:'), e.message)
      if (e.message.includes('already exists')) {
        console.log(chalk.yellow('Hint: Use the --clear flag to replace the existing user.'))
      }
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default dataCommand
