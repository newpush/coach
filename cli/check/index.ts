import { Command } from 'commander'
import dbSchemaCommand from './db-schema'
import gpsCommand from './gps'

const checkCommand = new Command('check').description('Check commands')

checkCommand.addCommand(dbSchemaCommand)
checkCommand.addCommand(gpsCommand)

export default checkCommand
