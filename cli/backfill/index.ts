import { Command } from 'commander'
import backfillMetricsCommand from './metrics'
import backfillTssCommand from './tss'
import backfillPlannedWorkoutsCommand from './planned-workouts'
import backfillWorkoutsCommand from './workouts'
import backfillFeelCommand from './feel'
import backfillProfileCommand from './profile'

const backfillCommand = new Command('backfill')

backfillCommand
  .description('Backfill data/metrics')
  .addCommand(backfillTssCommand)
  .addCommand(backfillMetricsCommand)
  .addCommand(backfillProfileCommand)
  .addCommand(backfillPlannedWorkoutsCommand)
  .addCommand(backfillWorkoutsCommand)
  .addCommand(backfillFeelCommand)

export default backfillCommand
