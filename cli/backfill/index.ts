
import { Command } from 'commander';
import backfillMetricsCommand from './metrics';

const backfillCommand = new Command('backfill')
    .description('Backfill data/metrics from raw sources');

backfillCommand.addCommand(backfillMetricsCommand);

export default backfillCommand;
