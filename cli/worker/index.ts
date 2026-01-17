import 'dotenv/config'
import { Command } from 'commander'
import { startCommand } from './start'
import { pingCommand } from './ping'
import { statusCommand } from './status'

const program = new Command()

program.name('cw:worker').description('Coach Watts Webhook Worker CLI').version('1.0.0')

program.addCommand(startCommand)
program.addCommand(pingCommand)
program.addCommand(statusCommand)

// Default to 'start' if no subcommand is provided (backward compatibility)
if (process.argv.length === 2) {
  process.argv.push('start')
}

program.parse(process.argv)
