import { Command } from 'commander'
import backupCommand from './backup'

const dbCommand = new Command('db').description('Database commands')

dbCommand.addCommand(backupCommand)

export default dbCommand
