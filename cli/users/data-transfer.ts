import { Command } from 'commander'
import chalk from 'chalk'
import readline from 'readline/promises'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import Table from 'cli-table3'
import {
  ALL_SECTIONS,
  DEFAULT_SECTIONS,
  EXCLUDED_TABLES,
  TRANSFER_SECTIONS,
  type TransferSection
} from '../../server/utils/data-management/transfer-plan'
import { transferUserData } from '../../server/utils/data-management/user-data-transfer'

const DEFAULT_SOURCE = 'DATABASE_URL_PROD'
const DEFAULT_TARGET = 'DATABASE_URL_TESTING'

interface Connection {
  prisma: PrismaClient
  pool: pg.Pool
  url: string
  label: string
}

/** Accepts either an env var name (`DATABASE_URL_PROD`) or a literal postgres URL. */
function resolveUrl(ref: string): { url: string; label: string } {
  if (ref.startsWith('postgres://') || ref.startsWith('postgresql://')) {
    return { url: ref, label: describe(ref) }
  }
  const url = process.env[ref]
  if (!url) {
    throw new Error(`${ref} is not set in .env (and is not a postgres:// URL)`)
  }
  return { url: url.replace(/^"|"$/g, ''), label: `${ref} → ${describe(url)}` }
}

/** host:port/database — never the credentials. */
function describe(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`
  } catch {
    return '<unparseable url>'
  }
}

function connect(url: string, label: string): Connection {
  const pool = new pg.Pool({ connectionString: url })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  return { prisma, pool, url, label }
}

async function close(conn?: Connection) {
  if (!conn) return
  await conn.prisma.$disconnect()
  await conn.pool.end()
}

function parseSections(value: string | undefined, fallback: TransferSection[]): TransferSection[] {
  if (!value) return fallback
  if (value.trim() === 'all') return [...ALL_SECTIONS]
  const requested = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const unknown = requested.filter((s) => !ALL_SECTIONS.includes(s as TransferSection))
  if (unknown.length) {
    throw new Error(
      `Unknown section(s): ${unknown.join(', ')}. Known: ${ALL_SECTIONS.join(', ')} (or "all")`
    )
  }
  return requested as TransferSection[]
}

function parseDate(value: string | undefined, what: string): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${what} date: ${value}`)
  return date
}

async function findUser(prisma: PrismaClient, identifier: string) {
  return prisma.user.findFirst({
    where: { OR: [{ id: identifier }, { email: identifier }] },
    select: { id: true, email: true, name: true }
  })
}

function printSections() {
  const table = new Table({ head: ['Section', 'Default', 'Contents'], wordWrap: true })
  for (const section of TRANSFER_SECTIONS) {
    table.push([
      section.key,
      section.optIn ? chalk.dim('opt-in') : chalk.green('yes'),
      section.description
    ])
  }
  console.log(table.toString())
  console.log(chalk.bold('\nNever transferred:'))
  for (const excluded of EXCLUDED_TABLES) {
    console.log(`  ${chalk.dim('·')} ${excluded.name} ${chalk.dim(`— ${excluded.reason}`)}`)
  }
}

const transferCommand = new Command('transfer')
  .description("Copy a user's data from one instance's database into another (e.g. prod → testing)")
  .option('--user <identifier>', 'Source user email or id')
  .option('--target-user <identifier>', 'Target user id or email (defaults to the same id)')
  .option('--from <envVarOrUrl>', 'Source database', DEFAULT_SOURCE)
  .option('--to <envVarOrUrl>', 'Target database', DEFAULT_TARGET)
  .option(
    '--sections <list>',
    `Comma-separated sections, or "all" (default: ${DEFAULT_SECTIONS.join(',')})`
  )
  .option('--skip <list>', 'Comma-separated sections to exclude')
  .option('--since <date>', 'Only date-ranged records on or after this date (YYYY-MM-DD)')
  .option('--until <date>', 'Only date-ranged records on or before this date (YYYY-MM-DD)')
  .option('--replace', "Delete the target user's rows in the selected sections first")
  .option('--dry-run', 'Report what would be copied and write nothing')
  .option('-y, --yes', 'Skip the confirmation prompt')
  .option('--list-sections', 'Print the available sections and exit')
  .action(async (options) => {
    if (options.listSections) {
      printSections()
      return
    }

    let source: Connection | undefined
    let target: Connection | undefined

    try {
      if (!options.user) throw new Error('--user is required (source user email or id)')

      const selected = parseSections(options.sections, [...DEFAULT_SECTIONS])
      const skipped = parseSections(options.skip, [])
      const sections = selected.filter((s) => !skipped.includes(s))
      if (sections.length === 0) throw new Error('No sections selected')

      const range = {
        from: parseDate(options.since, '--since'),
        to: parseDate(options.until, '--until')
      }

      const from = resolveUrl(options.from)
      const to = resolveUrl(options.to)

      // Guardrails: this tool must never write to the source, or to production.
      if (from.url === to.url) {
        throw new Error('Source and target databases are the same — refusing to run')
      }
      const prodUrl = process.env.DATABASE_URL_PROD?.replace(/^"|"$/g, '')
      if (prodUrl && to.url === prodUrl) {
        throw new Error('Target resolves to DATABASE_URL_PROD — refusing to write to production')
      }

      source = connect(from.url, from.label)
      target = connect(to.url, to.label)

      const sourceUser = await findUser(source.prisma, options.user)
      if (!sourceUser) throw new Error(`Source user "${options.user}" not found in ${from.label}`)

      const targetIdentifier = options.targetUser || sourceUser.id
      const targetUser = await findUser(target.prisma, targetIdentifier)
      if (!targetUser) {
        throw new Error(
          `Target user "${targetIdentifier}" not found in ${to.label}. ` +
            'Create the user on the target instance first (sign in there once), then pass its id with --target-user.'
        )
      }

      console.log()
      console.log(`${chalk.bold('Source')}  ${chalk.yellow(from.label)}`)
      console.log(`        ${sourceUser.email} ${chalk.dim(sourceUser.id)}`)
      console.log(`${chalk.bold('Target')}  ${chalk.cyan(to.label)}`)
      console.log(`        ${targetUser.email} ${chalk.dim(targetUser.id)}`)
      console.log(`${chalk.bold('Sections')} ${sections.join(', ')}`)
      if (range.from || range.to) {
        console.log(
          `${chalk.bold('Range')}   ${range.from?.toISOString().slice(0, 10) ?? '…'} → ${
            range.to?.toISOString().slice(0, 10) ?? '…'
          }`
        )
      }
      if (options.replace) {
        console.log(
          chalk.red(`${chalk.bold('Replace')} target rows in these sections are DELETED first`)
        )
      }
      console.log()

      if (options.dryRun) {
        const report = await transferUserData(source.prisma, target.prisma, {
          sourceUserId: sourceUser.id,
          targetUserId: targetUser.id,
          sections,
          range,
          dryRun: true
        })
        const table = new Table({ head: ['Section', 'Table', 'Rows in source'] })
        for (const row of report.tables) {
          table.push([row.section, row.label, row.fetched.toLocaleString()])
        }
        console.log(table.toString())
        console.log(chalk.bold(`Total: ${report.totals.fetched.toLocaleString()} rows`))
        console.log(chalk.dim('Dry run — nothing was written.'))
        return
      }

      if (!options.yes) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        const answer = await rl.question(
          chalk.yellow(`Write this data into ${to.label} as ${targetUser.email}? [y/N] `)
        )
        rl.close()
        if (answer.trim().toLowerCase() !== 'y') {
          console.log('Aborted.')
          return
        }
      }

      const started = Date.now()
      const report = await transferUserData(source.prisma, target.prisma, {
        sourceUserId: sourceUser.id,
        targetUserId: targetUser.id,
        sections,
        range,
        replace: options.replace,
        pools: { source: source.pool, target: target.pool },
        onProgress: (message) => console.log(chalk.dim(`  ${message}`))
      })

      console.log()
      const table = new Table({
        head: ['Table', 'Source', 'Inserted', 'Existing', 'Dropped', 'Failed', 'Deleted']
      })
      for (const row of report.tables) {
        if (!row.fetched && !row.deleted) continue
        table.push([
          row.label,
          row.fetched.toLocaleString(),
          row.inserted.toLocaleString(),
          row.skippedExisting.toLocaleString(),
          row.droppedRefs ? chalk.yellow(row.droppedRefs.toLocaleString()) : '0',
          row.failed ? chalk.red(row.failed.toLocaleString()) : '0',
          row.deleted.toLocaleString()
        ])
      }
      console.log(table.toString())

      const failures = report.tables.filter((t) => t.errors.length)
      if (failures.length) {
        console.log(chalk.red('\nProblems:'))
        for (const row of failures) {
          for (const error of row.errors) console.log(`  ${row.label}: ${error}`)
        }
      }

      console.log()
      console.log(
        chalk.green(
          `✅ ${report.totals.inserted.toLocaleString()} rows written in ${(
            (Date.now() - started) /
            1000
          ).toFixed(1)}s` + (report.profileUpdated ? ' (profile updated)' : '')
        )
      )
      if (report.totals.failed) {
        console.log(chalk.red(`${report.totals.failed} rows failed — see above.`))
        process.exitCode = 1
      }
    } catch (e) {
      console.error(chalk.red(`\n❌ ${(e as Error).message}`))
      process.exitCode = 1
    } finally {
      await close(source)
      await close(target)
    }
  })

export default transferCommand
