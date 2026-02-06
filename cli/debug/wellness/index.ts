import { Command } from 'commander'
import inspectCommand from './inspect'
import candidatesCommand from './candidates'
import sourceCommand from './source'
import keysCommand from './keys'
import historyCommand from './history'
import compareSourcesCommand from './compare-sources'
import tableCommand from './table'
import syncCommand from './sync'

const wellnessCommand = new Command('wellness').description('Wellness data debugging tools')

wellnessCommand.addCommand(inspectCommand)
wellnessCommand.addCommand(candidatesCommand)
wellnessCommand.addCommand(sourceCommand)
wellnessCommand.addCommand(keysCommand)
wellnessCommand.addCommand(historyCommand)
wellnessCommand.addCommand(compareSourcesCommand)
wellnessCommand.addCommand(tableCommand)
wellnessCommand.addCommand(syncCommand)

export default wellnessCommand
