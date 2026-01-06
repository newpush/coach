
import { Command } from 'commander';
import authLogicCommand from './auth-logic';
import troubleshootWorkoutsCommand from './workout';
import debugWebhookCommand from './webhook';

const debugCommand = new Command('debug')
    .description('Debug commands');

debugCommand.addCommand(authLogicCommand);
debugCommand.addCommand(troubleshootWorkoutsCommand);
debugCommand.addCommand(debugWebhookCommand);

export default debugCommand;
