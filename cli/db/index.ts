import { Command } from 'commander'
import backupCommand from './backup'
import compareCommand from './compare'
import migrateZonesCommand from './migrate-zones'
import syncQueueCommand from './sync-queue'

const dbCommand = new Command('db').description('Database commands')

dbCommand.addCommand(backupCommand)
dbCommand.addCommand(compareCommand)
dbCommand.addCommand(migrateZonesCommand)
dbCommand.addCommand(syncQueueCommand)

export default dbCommand
