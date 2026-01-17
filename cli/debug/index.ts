import { Command } from 'commander'
import webhookCommand from './webhook'
import webhookTriggerCommand from './webhook-trigger'
import profileCommand from './profile'
import workoutCommand from './workout'
import userStatsCommand from './user-stats'
import llmRequestCommand from './llm-request'
import athleteCommand from './athlete'
import trainingLoadCommand from './training-load'
import debugWellnessCommand from './wellness'
import recommendationsCommand from './recommendations'
import analyzeStreamsCommand from './analyze-streams'
import findAnyCommand from './find-any'
import plannedCommand from './planned'
import goalsCommand from './goals'
import intervalsTypesCommand from './intervals-types'

const debugCommand = new Command('debug')

debugCommand
  .description('Debugging utilities')
  .addCommand(webhookCommand)
  .addCommand(webhookTriggerCommand)
  .addCommand(profileCommand)
  .addCommand(workoutCommand)
  .addCommand(userStatsCommand)
  .addCommand(llmRequestCommand)
  .addCommand(athleteCommand)
  .addCommand(trainingLoadCommand)
  .addCommand(debugWellnessCommand)
  .addCommand(recommendationsCommand)
  .addCommand(analyzeStreamsCommand)
  .addCommand(findAnyCommand)
  .addCommand(plannedCommand)
  .addCommand(goalsCommand)
  .addCommand(intervalsTypesCommand)

export default debugCommand
