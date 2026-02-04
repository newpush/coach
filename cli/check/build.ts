import { Command } from 'commander'
import { execSync } from 'child_process'
import chalk from 'chalk'

const buildCommand = new Command('build')

interface BuildStatus {
  github?: {
    status: string
    conclusion: string
    workflowName: string
    displayTitle: string
    createdAt: string
    url: string
  }
  errors: string[]
}

const fetchStatus = (): BuildStatus => {
  const result: BuildStatus = { errors: [] }

  // Check GitHub Actions Status
  try {
    const ghOutput = execSync(
      'gh run list --limit=10 --json status,conclusion,workflowName,createdAt,url,displayTitle',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const runs = JSON.parse(ghOutput)
    const filteredRuns = runs.filter(
      (run: any) => !run.workflowName.includes('Gemini') && !run.workflowName.includes('Jules')
    )

    if (filteredRuns.length > 0) {
      result.github = filteredRuns[0]
    }
  } catch (error) {
    result.errors.push(
      '✗ Failed to check GitHub Actions status. Ensure gh CLI is installed and authenticated.'
    )
  }

  return result
}

const printStatus = (status: BuildStatus) => {
  console.log(chalk.blue('=== Build Status Check ===\n'))

  // GitHub Output
  if (status.github) {
    console.log(`Latest GitHub Action: `)
    const run = status.github
    const icon = run.conclusion === 'success' ? '✓' : run.conclusion === 'failure' ? '✗' : '•'
    const color =
      run.conclusion === 'success'
        ? chalk.green
        : run.conclusion === 'failure'
          ? chalk.red
          : chalk.yellow
    console.log(color(`  ${icon} ${run.workflowName}: ${run.conclusion || run.status}`))
    console.log(`    Title: ${run.displayTitle}`)
    console.log(`    Time:  ${run.createdAt}`)
    console.log(`    Url:   ${run.url}`)
    console.log('')
  } else if (!status.errors.some((e) => e.includes('GitHub'))) {
    console.log(chalk.gray('No GitHub Action runs found.'))
  }

  // Errors
  if (status.errors.length > 0) {
    console.log('')
    status.errors.forEach((err) => console.error(chalk.red(err)))
  }
}

const checkStatus = () => {
  const status = fetchStatus()
  printStatus(status)
  return {
    github: status.github?.conclusion || status.github?.status || ''
  }
}

const setTitle = (title: string) => {
  process.stdout.write(`\x1b]0;${title}\x07`)
}

buildCommand
  .description('Check the latest build status from GitHub Actions')
  .option('-m, --monitor [seconds]', 'Monitor status with refresh interval (default: 10s)')
  .action((options) => {
    if (options.monitor) {
      let interval = 10
      if (typeof options.monitor === 'string') {
        const parsed = parseInt(options.monitor, 10)
        if (!isNaN(parsed) && parsed > 0) {
          interval = parsed
        }
      }

      const loop = () => {
        // Fetch first to avoid blank screen
        const status = fetchStatus()

        process.stdout.write('\x1Bc') // Clear screen
        printStatus(status)

        const parts = []
        if (status.github) parts.push(`GH: ${status.github.conclusion || status.github.status}`)

        if (parts.length > 0) {
          setTitle(parts.join(' | '))
        }

        console.log(chalk.gray(`Last updated: ${new Date().toLocaleTimeString()}\n`))

        let remaining = interval
        const updateCountdown = () => {
          process.stdout.write(
            chalk.gray(`\rRefreshing in ${remaining}s... (Press Ctrl+C to stop)   `)
          )
        }

        updateCountdown()

        const timer = setInterval(() => {
          remaining--
          if (remaining <= 0) {
            clearInterval(timer)
            loop()
          } else {
            updateCountdown()
          }
        }, 1000)
      }
      loop()
    } else {
      checkStatus()
    }
  })

export default buildCommand
