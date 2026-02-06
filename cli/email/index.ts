import { Command } from 'commander'
import { sendEmail } from '../../server/utils/email'
import chalk from 'chalk'

const emailCommand = new Command('email')

emailCommand.description('Email management tools')

emailCommand
  .command('send')
  .description('Send a test email')
  .requiredOption('--to <email>', 'Recipient email')
  .requiredOption('--subject <subject>', 'Email subject')
  .requiredOption('--body <body>', 'Email body (HTML)')
  .option('--from <email>', 'Sender email (overrides env var)')
  .action(async (options) => {
    console.log(chalk.blue('Sending email...'))
    try {
      const response = await sendEmail({
        to: options.to,
        from: options.from,
        subject: options.subject,
        html: options.body
      })
      console.log(chalk.green('Email sent successfully!'))
      console.log(response)
    } catch (error: any) {
      console.error(chalk.red('Failed to send email:'), error.message)
      process.exit(1)
    }
    process.exit(0)
  })

export default emailCommand
