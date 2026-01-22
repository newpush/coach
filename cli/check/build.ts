import { Command } from 'commander'
import { execSync } from 'child_process'
import chalk from 'chalk'

const buildCommand = new Command('build')

const checkStatus = () => {
  let gcloudStatusStr = ''
  let githubStatusStr = ''

  console.log(chalk.blue('=== Build Status Check ===\n'))

  // 1. Check Gcloud Build Status
  try {
    console.log(chalk.yellow('Checking Gcloud Build status...'))
    const gcloudOutput = execSync(
      'gcloud builds list --limit=1 --format="json(status,createTime,logUrl,id)"',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const gcloudBuilds = JSON.parse(gcloudOutput)

    if (gcloudBuilds.length > 0) {
      const build = gcloudBuilds[0]
      gcloudStatusStr = build.status
      const statusColor = build.status === 'SUCCESS' ? chalk.green : chalk.red
      console.log(`Latest Gcloud Build: `)
      console.log(`  ID:     ${build.id}`)
      console.log(`  Status: ${statusColor(build.status)}`)
      console.log(`  Time:   ${build.createTime}`)
      console.log(`  Logs:   ${build.logUrl}`)
    } else {
      console.log(chalk.gray('No Gcloud builds found.'))
    }
  } catch (error) {
    console.error(
      chalk.red(
        '✗ Failed to check Gcloud status. Ensure gcloud CLI is installed and authenticated.'
      )
    )
  }

  console.log('')

  // 2. Check GitHub Actions Status
  try {
    console.log(chalk.yellow('Checking GitHub Actions status...'))
    const ghOutput = execSync(
      'gh run list --limit=10 --json status,conclusion,workflowName,createdAt,url,displayTitle',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const runs = JSON.parse(ghOutput)
    const filteredRuns = runs.filter(
      (run: any) => !run.workflowName.includes('Gemini') && !run.workflowName.includes('Jules')
    )

    if (filteredRuns.length > 0) {
      console.log(`Latest GitHub Action: `)
      const run = filteredRuns[0]
      githubStatusStr = run.conclusion || run.status
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
    } else {
      console.log(chalk.gray('No GitHub Action runs found.'))
    }
  } catch (error) {
    console.error(
      chalk.red(
        '✗ Failed to check GitHub Actions status. Ensure gh CLI is installed and authenticated.'
      )
    )
  }

  return { gcloud: gcloudStatusStr, github: githubStatusStr }
}

const setTitle = (title: string) => {
  process.stdout.write(`\x1b]0;${title}\x07`)
}

buildCommand
  .description('Check the latest build status from Gcloud and GitHub Actions')
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
        process.stdout.write('\x1Bc') // Clear screen
        const status = checkStatus()

        const parts = []
        if (status.gcloud) parts.push(`Gcloud: ${status.gcloud}`)
        if (status.github) parts.push(`GH: ${status.github}`)

        if (parts.length > 0) {
          setTitle(parts.join(' | '))
        }

        console.log(chalk.gray(`\nRefreshing in ${interval} seconds... (Press Ctrl+C to stop)`))
        setTimeout(loop, interval * 1000)
      }
      loop()
    } else {
      checkStatus()
    }
  })

export default buildCommand
