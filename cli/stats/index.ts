import { Command } from 'commander'
import usersStatsCommand from './users'
import webhookStatsCommand from './webhook'

const statsCommand = new Command('stats').description('Statistics commands')

statsCommand.addCommand(usersStatsCommand)
statsCommand.addCommand(webhookStatsCommand)

export default statsCommand
