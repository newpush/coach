import { Command } from 'commander'
import webhookCommand from './webhook'
import testWebhookCommand from './test-webhook'
import triggerCommand from './webhook-trigger'
import profileCommand from './profile'
import workoutCommand from './workout'
import userStatsCommand from './user-stats'
import llmRequestCommand from './llm-request'
import athleteCommand from './athlete'
import trainingLoadCommand from './training-load'
import wellnessCommand from './wellness'
import recommendationsCommand from './recommendations'
import analyzeStreamsCommand from './analyze-streams'
import findAnyCommand from './find-any'
import plannedCommand from './planned'
import goalsCommand from './goals'
import intervalsTypesCommand from './intervals-types'
import calendarNotesCommand from './calendar-notes'
import verifyLazyProfileCommand from './verify-lazy-profile'
import deduplicateCommand from './deduplicate'
import compareIntervalsCommand from './compare-intervals'
import calendarCommand from './calendar'
import planCommand from './plan'
import checkPlannedStepsCommand from './check-planned-steps'
import authLogicCommand from './auth-logic'
import subscriptionCommand from './subscription'
import fixCheckinsCommand from './fix-checkins'
import pmcCommand from './pmc'
import chatHistoryCommand from './chat-history'
import quotasCommand from './quotas'

const debugCommand = new Command('debug').description('Debugging utilities')

debugCommand.addCommand(webhookCommand)
debugCommand.addCommand(testWebhookCommand)
debugCommand.addCommand(triggerCommand)
debugCommand.addCommand(profileCommand)
debugCommand.addCommand(workoutCommand)
debugCommand.addCommand(userStatsCommand)
debugCommand.addCommand(llmRequestCommand)
debugCommand.addCommand(athleteCommand)
debugCommand.addCommand(trainingLoadCommand)
debugCommand.addCommand(wellnessCommand)
debugCommand.addCommand(recommendationsCommand)
debugCommand.addCommand(analyzeStreamsCommand)
debugCommand.addCommand(findAnyCommand)
debugCommand.addCommand(plannedCommand)
debugCommand.addCommand(goalsCommand)
debugCommand.addCommand(intervalsTypesCommand)
debugCommand.addCommand(calendarNotesCommand)
debugCommand.addCommand(verifyLazyProfileCommand)
debugCommand.addCommand(deduplicateCommand)
debugCommand.addCommand(compareIntervalsCommand)
debugCommand.addCommand(calendarCommand)
debugCommand.addCommand(planCommand)
debugCommand.addCommand(checkPlannedStepsCommand)
debugCommand.addCommand(authLogicCommand)
debugCommand.addCommand(subscriptionCommand)
debugCommand.addCommand(fixCheckinsCommand)
debugCommand.addCommand(pmcCommand)
debugCommand.addCommand(chatHistoryCommand)
debugCommand.addCommand(quotasCommand)

export default debugCommand
