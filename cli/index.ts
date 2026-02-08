#!/usr/bin/env node

import 'dotenv/config'
import { Command } from 'commander'
import chalk from 'chalk'
import dbCommand from './db'
import checkCommand from './check'
import debugCommand from './debug'
import changelogCommand from './changelog'
import backfillCommand from './backfill'
import oauthCommand from './oauth'
import statsCommand from './stats'
import usersCommand from './users'
import nutritionCommand from './nutrition'
import subscriptionsCommand from './subscriptions'
import geminiCommand from './gemini'
import llmCommand from './llm'
import triggerCommand from './trigger'
import monitorCommand from './monitor'
import telegramCommand from './telegram'
import { ouraCommand } from './integrations/oura'
import { polarCommand } from './integrations/polar'
import emailCommand from './email'
import bugsCommand from './bugs'

const program = new Command()

program.version('1.0.0').description('A CLI for development and troubleshooting')

// Register command modules
program.addCommand(dbCommand)
program.addCommand(checkCommand)
program.addCommand(debugCommand)
program.addCommand(changelogCommand)
program.addCommand(backfillCommand)
program.addCommand(oauthCommand)
program.addCommand(statsCommand)
program.addCommand(usersCommand)
program.addCommand(nutritionCommand)
program.addCommand(subscriptionsCommand)
program.addCommand(geminiCommand)
program.addCommand(llmCommand)
program.addCommand(triggerCommand)
program.addCommand(monitorCommand)
program.addCommand(telegramCommand)
program.addCommand(ouraCommand)
program.addCommand(polarCommand)
program.addCommand(emailCommand)
program.addCommand(bugsCommand)

program.parse(process.argv)

if (!process.argv.slice(2).length) {
  program.outputHelp()
}
