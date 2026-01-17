import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'

const triggerWebhookCommand = new Command('trigger')
  .description('Trigger an Intervals.icu webhook event for testing')
  .option('--prod', 'Use production URL')
  .option('--url <url>', 'Override the webhook URL')
  .option('--athlete <id>', 'Athlete ID', '12345')
  .option('--type <type>', 'Event type', 'ACTIVITY_UPLOADED')
  .action(async (options) => {
    const secret = process.env.INTERVALS_WEBHOOK_SECRET
    if (!secret) {
      console.error(chalk.red('INTERVALS_WEBHOOK_SECRET is not defined in .env'))
      process.exit(1)
    }

    let baseUrl = options.url
    if (!baseUrl) {
      if (options.prod) {
        baseUrl = process.env.PUBLIC_SITE_URL_PROD
        if (!baseUrl) {
          console.error(chalk.red('PUBLIC_SITE_URL_PROD is not defined in .env'))
          process.exit(1)
        }
      } else {
        baseUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      }
    }

    // Ensure baseUrl doesn't end with slash for consistency
    baseUrl = baseUrl.replace(/\/$/, '')
    const webhookUrl = `${baseUrl}/api/integrations/intervals/webhook-async`

    const payload = {
      secret,
      events: [
        {
          athlete_id: options.athlete,
          type: options.type,
          timestamp: new Date().toISOString()
        }
      ]
    }

    console.log(chalk.blue(`Triggering webhook at: ${chalk.bold(webhookUrl)}`))
    console.log(chalk.gray(`Athlete: ${options.athlete}, Type: ${options.type}`))

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const text = await response.text()

      if (response.ok) {
        console.log(chalk.green(`✔ Webhook triggered successfully: ${text}`))
      } else {
        console.error(chalk.red(`✘ Failed to trigger webhook (${response.status}): ${text}`))
      }
    } catch (error: any) {
      console.error(chalk.red(`✘ Error: ${error.message}`))
    }
  })

export default triggerWebhookCommand
