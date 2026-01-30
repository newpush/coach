import { Command } from 'commander'
import chalk from 'chalk'

export const polarCommand = new Command('polar').description('Manage Polar integration')

polarCommand
  .command('create-webhook')
  .description('Create Polar webhook subscription')
  .option('--prod', 'Use production URL (coachwatts.com)')
  .option('--url <url>', 'Override base URL')
  .action(async (options) => {
    const CLIENT_ID = process.env.POLAR_CLIENT_ID
    const CLIENT_SECRET = process.env.POLAR_CLIENT_SECRET

    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error(chalk.red('Missing POLAR_CLIENT_ID or POLAR_CLIENT_SECRET in .env'))
      process.exit(1)
    }

    let baseUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3099'
    if (options.prod) {
      baseUrl = 'https://coachwatts.com'
    } else if (options.url) {
      baseUrl = options.url
    }

    // Polar Webhook URL
    const webhookUrl = `${baseUrl}/api/integrations/polar/webhook`

    console.log(chalk.blue('--- Polar Webhook Registration ---'))
    console.log(`Base URL: ${chalk.cyan(baseUrl)}`)
    console.log(`Callback URL: ${chalk.cyan(webhookUrl)}`)
    console.log(`Client ID: ${CLIENT_ID.slice(0, 4)}...`)

    try {
      // 1. Create Webhook
      console.log(chalk.gray('\nCreating webhook...'))

      // Events to subscribe to:
      // EXERCISE, SLEEP, NIGHTLY_RECHARGE (if available? Docs say "SLEEP", "NIGHTLY_RECHARGE"?)
      // Docs: "EXERCISE", "SLEEP", "CONTINUOUS_HEART_RATE", "SLEEP_WISE...", "ACTIVITY_SUMMARY"
      // Wait, Nightly Recharge? Docs don't list "NIGHTLY_RECHARGE" in Webhook Payload section list?
      // "Payload schemas ... EXERCISE, SLEEP, CONTINUOUS_HEART_RATE, SLEEP_WISE..., ACTIVITY_SUMMARY"
      // But resource list has "Nightly Recharge". Maybe it's part of Sleep or Activity?
      // Or maybe it's not webhook-able?
      // Let's assume EXERCISE, SLEEP, ACTIVITY_SUMMARY are key.

      const payload = {
        events: ['EXERCISE', 'SLEEP', 'ACTIVITY_SUMMARY'],
        url: webhookUrl
      }

      const authHeader = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')

      const createRes = await fetch('https://www.polaraccesslink.com/v3/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authHeader
        },
        body: JSON.stringify(payload)
      })

      if (createRes.ok) {
        const data: any = await createRes.json()
        const webhook = data.data || data

        console.log(chalk.green(`\n✔ Webhook created successfully!`))
        console.log(chalk.bold(`ID: ${webhook.id}`))
        if (webhook.events) {
          console.log(chalk.bold(`Events: ${webhook.events.join(', ')}`))
        }
        console.log(chalk.bold(`Url: ${webhook.url}`))

        if (webhook.signature_secret_key) {
          console.log(chalk.bgRed.white.bold('\n IMPORTANT: SAVE THIS SECRET KEY! '))
          console.log(
            chalk.bgRed.white.bold(` SIGNATURE_SECRET_KEY: ${webhook.signature_secret_key} `)
          )
          console.log(chalk.yellow('\nAdd this to your .env file as:'))
          console.log(chalk.cyan(`POLAR_WEBHOOK_SECRET="${webhook.signature_secret_key}"`))
        } else {
          console.log(chalk.yellow('\nWarning: signature_secret_key missing in response.'))
        }
      } else {
        const text = await createRes.text()
        if (createRes.status === 409) {
          console.log(chalk.yellow(`\n⚠️  Webhook already exists.`))
          console.log(chalk.gray(`Polar allows only one webhook per client.`))
          console.log(chalk.gray(`Run 'cw:cli polar list-webhooks' to see it.`))
        } else {
          console.error(chalk.red(`\n✘ Failed to create webhook (${createRes.status}):`))
          console.error(chalk.red(text))
        }
      }
    } catch (error: any) {
      console.error(chalk.red('\nFatal Error:'), error.message)
      process.exit(1)
    }
  })

polarCommand
  .command('list-webhooks')
  .description('List registered Polar webhooks')
  .action(async () => {
    const CLIENT_ID = process.env.POLAR_CLIENT_ID
    const CLIENT_SECRET = process.env.POLAR_CLIENT_SECRET

    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error(chalk.red('Missing POLAR_CLIENT_ID or POLAR_CLIENT_SECRET in .env'))
      process.exit(1)
    }

    const authHeader = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')

    try {
      const res = await fetch('https://www.polaraccesslink.com/v3/webhooks', {
        headers: {
          Accept: 'application/json',
          Authorization: authHeader
        }
      })

      if (!res.ok) {
        throw new Error(`Failed to list: ${res.status} ${await res.text()}`)
      }

      const data: any = await res.json()
      // Docs say "Get webhook" returns a single webhook object? Or list?
      // "Get webhook ... GET /v3/webhooks ... Returns: webhookInfo" (singular)
      // "Client application can only have one webhook registered."
      // So it returns object, not array.

      const webhooks = data.data ? data.data : data.id ? [data] : []

      if (webhooks.length === 0) {
        console.log(chalk.gray('No webhooks found.'))
        return
      }

      console.log(chalk.blue('--- Registered Polar Webhooks ---'))
      webhooks.forEach((w: any) => {
        console.log(chalk.bold(`ID: ${w.id}`))
        console.log(`URL: ${chalk.cyan(w.url)}`)
        console.log(`Events: ${w.events.join(', ')}`)
        console.log(`Created: ${w.created}`)
        console.log('---')
      })
    } catch (error: any) {
      // 204 No Content is possible if none exist?
      // Docs say "204 No Content ... No content when no webhook found"
      // Wait, fetch won't throw on 204, but res.json() might fail if body empty.
      console.error(chalk.red('Error listing webhooks:'), error.message)
    }
  })

polarCommand
  .command('delete-webhook')
  .description('Delete Polar webhook')
  .argument('<id>', 'Webhook ID to delete')
  .action(async (id) => {
    const CLIENT_ID = process.env.POLAR_CLIENT_ID
    const CLIENT_SECRET = process.env.POLAR_CLIENT_SECRET

    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error(chalk.red('Missing POLAR_CLIENT_ID or POLAR_CLIENT_SECRET in .env'))
      process.exit(1)
    }

    const authHeader = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')

    try {
      const res = await fetch(`https://www.polaraccesslink.com/v3/webhooks/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: authHeader
        }
      })

      if (res.ok) {
        console.log(chalk.green(`✔ Webhook ${id} deleted successfully.`))
      } else {
        console.error(chalk.red(`✘ Failed to delete webhook (${res.status}): ${await res.text()}`))
      }
    } catch (error: any) {
      console.error(chalk.red('Error deleting webhook:'), error.message)
    }
  })
