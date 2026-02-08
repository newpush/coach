import { Command } from 'commander'
import { listBugsCommand } from './list'

const bugsCommand = new Command('bugs').description('Manage bug reports')

bugsCommand.addCommand(listBugsCommand)

export default bugsCommand
