import { Command } from 'commander'
import dbSchemaCommand from './db-schema'
import gpsCommand from './gps'
import buildCommand from './build'
import redisCommand from './redis'

const checkCommand = new Command('check').description('Check commands')

checkCommand.addCommand(dbSchemaCommand)
checkCommand.addCommand(gpsCommand)
checkCommand.addCommand(buildCommand)
checkCommand.addCommand(redisCommand)

export default checkCommand
