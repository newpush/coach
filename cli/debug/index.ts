import { Command } from 'commander'
import webhookCommand from './webhook'
import profileCommand from './profile'
import workoutCommand from './workout'
import userStatsCommand from './user-stats'
import llmRequestCommand from './llm-request'
import athleteCommand from './athlete'
import trainingLoadCommand from './training-load'

const debugCommand = new Command('debug')

debugCommand
  .description('Debugging utilities')
  .addCommand(webhookCommand)
  .addCommand(profileCommand)
  .addCommand(workoutCommand)
  .addCommand(userStatsCommand)
  .addCommand(llmRequestCommand)
  .addCommand(athleteCommand)
  .addCommand(trainingLoadCommand)

export default debugCommand
