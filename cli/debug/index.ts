import { Command } from 'commander'
import authLogicCommand from './auth-logic'
import troubleshootWorkoutsCommand from './workout'
import debugWebhookCommand from './webhook'
import debugProfileCommand from './profile'

const debugCommand = new Command('debug').description('Debug commands')

debugCommand.addCommand(authLogicCommand)
debugCommand.addCommand(troubleshootWorkoutsCommand)
debugCommand.addCommand(debugWebhookCommand)
debugCommand.addCommand(debugProfileCommand)

export default debugCommand
