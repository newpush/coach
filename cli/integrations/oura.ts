import { Command } from 'commander'
import chalk from 'chalk'

export const ouraCommand = new Command('oura')
.description('Manage Oura integration')

ouraCommand
  .command('register-webhooks')
  .description('Register Oura webhooks for real-time updates')
  .option('--prod', 'Use production URL (coachwatts.com)')
  .option('--url <url>', 'Override base URL')
  .action(async (options) => {
    // Load Env
    const CLIENT_ID = process.env.OURA_CLIENT_ID
    const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET
    const VERIFICATION_TOKEN = process.env.OURA_WEBHOOK_VERIFICATION_TOKEN || CLIENT_SECRET

    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error(chalk.red('Missing OURA_CLIENT_ID or OURA_CLIENT_SECRET in .env'))
      process.exit(1)
    }

    let baseUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3099'
    if (options.prod) {
      baseUrl = 'https://coachwatts.com'
    } else if (options.url) {
      baseUrl = options.url
    }

    const webhookUrl = `${baseUrl}/api/integrations/oura/webhook`

    console.log(chalk.blue('--- Oura Webhook Registration ---'))
    console.log(`Base URL: ${chalk.cyan(baseUrl)}`)
    console.log(`Callback URL: ${chalk.cyan(webhookUrl)}`)
    console.log(`Client ID: ${CLIENT_ID.slice(0, 4)}...`)

    const DATA_TYPES = [
      'daily_sleep',
      'daily_activity',
      'daily_readiness',
      'sleep',
      'workout',
      'session'
    ]

    const EVENT_TYPES = ['create', 'update']

    try {
      // 1. List Existing
      console.log(chalk.gray('\nFetching existing subscriptions...'))
      const listRes = await fetch('https://api.ouraring.com/v2/webhook/subscription', {
        headers: {
          'x-client-id': CLIENT_ID,
          'x-client-secret': CLIENT_SECRET
        }
      })

      if (!listRes.ok) {
        throw new Error(`Failed to list: ${listRes.status} ${await listRes.text()}`)
      }

      const existing: any[] = await listRes.json()
      console.log(chalk.gray(`Found ${existing.length} existing subscriptions.`))

      // 2. Register Missing
      let added = 0
      let skipped = 0
      let failed = 0

      for (const dataType of DATA_TYPES) {
        for (const eventType of EVENT_TYPES) {
          const exists = existing.find(
            (s) =>
              s.callback_url === webhookUrl &&
              s.data_type === dataType &&
              s.event_type === eventType
          )

          if (exists) {
            console.log(
              chalk.yellow(`• [Skipped] ${dataType} : ${eventType}`) +
                chalk.gray(` (ID: ${exists.id})`)
            )
            skipped++
            continue
          }

          process.stdout.write(chalk.blue(`• [Registering] ${dataType} : ${eventType}... `))

          const createRes = await fetch('https://api.ouraring.com/v2/webhook/subscription', {
            method: 'POST',
            headers: {
              'x-client-id': CLIENT_ID,
              'x-client-secret': CLIENT_SECRET,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              callback_url: webhookUrl,
              verification_token: VERIFICATION_TOKEN,
              event_type: eventType,
              data_type: dataType
            })
          })

          if (createRes.ok) {
            const data: any = await createRes.json()
            console.log(chalk.green(`✔ Success (ID: ${data.id})`))
            added++
          } else {
            console.log(chalk.red(`✘ Failed`))
            console.error(chalk.red(`  Error: ${createRes.status} ${await createRes.text()}`))
            failed++
          }
        }
      }

      console.log(chalk.bold('\nSummary:'))
      console.log(chalk.green(`  Added: ${added}`))
      console.log(chalk.yellow(`  Skipped: ${skipped}`))
      console.log(chalk.red(`  Failed: ${failed}`))
    } catch (error: any) {
      console.error(chalk.red('\nFatal Error:'), error.message)
      process.exit(1)
    }
  })
