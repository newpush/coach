import { Command } from 'commander'
import { execSync } from 'child_process'
import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import 'dotenv/config'

const backupCommand = new Command('backup')

backupCommand
  .description('Backup the PostgreSQL database')
  .option('-c, --container <name>', 'Docker container name', 'watts-postgres')
  .option('-o, --output <dir>', 'Backup output directory', './backups')
  .option('-f, --format <format>', 'Backup format: plain|custom|directory|tar', 'custom')
  .action((options) => {
    console.log(chalk.green('=== PostgreSQL Database Backup ==='))

    const projectRoot = path.resolve(__dirname, '../../')
    const backupDir = path.resolve(projectRoot, options.output)

    const databaseUrl = process.env.DATABASE_URL

    if (!databaseUrl) {
      console.error(chalk.red('Error: DATABASE_URL not found in environment variables'))
      process.exit(1)
    }

    const dbUrlMatch = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/)
    if (!dbUrlMatch) {
      console.error(chalk.red('Error: Failed to parse DATABASE_URL'))
      process.exit(1)
    }

    const [, dbUser, dbPassword, dbHost, dbPort, dbName] = dbUrlMatch

    try {
      execSync(`docker ps --format '{{.Names}}' | grep -q "^${options.container}$"`, {
        stdio: 'inherit'
      })
    } catch (error) {
      console.error(chalk.red(`Error: Docker container '${options.container}' is not running`))
      process.exit(1)
    }

    fs.mkdirSync(backupDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFile = path.join(
      backupDir,
      `${dbName}_${timestamp}.${options.format === 'custom' ? 'dump' : 'sql'}`
    )

    const formatFlag = options.format === 'plain' ? '-Fp' : '-Fc'

    console.log(`Container:    ${options.container}`)
    console.log(`Database:     ${dbName}`)
    console.log(`User:         ${dbUser}`)
    console.log(`Format:       ${options.format}`)
    console.log(`Backup file:  ${backupFile}`)
    console.log('')

    console.log(chalk.yellow('Starting backup...'))

    try {
      execSync(
        `docker exec -e PGPASSWORD=${dbPassword} ${options.container} pg_dump -U ${dbUser} -h localhost ${formatFlag} ${dbName} > ${backupFile}`,
        { stdio: 'inherit' }
      )

      const stats = fs.statSync(backupFile)
      console.log(chalk.green('✓ Backup completed successfully'))
      console.log(`File: ${backupFile}`)
      console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
    } catch (error) {
      console.error(chalk.red('✗ Backup failed'))
      fs.unlinkSync(backupFile)
      process.exit(1)
    }
  })

export default backupCommand
