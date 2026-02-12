import { Command } from 'commander'
import inspectCommand from './inspect'
import searchCommand from './search'
import recalculateCommand from './recalculate'
import fixDatesCommand from './fix-dates'
import metabolicCommand from './metabolic'
import chainCommand from './chain'
import debugMetabolicCommand from './debug-metabolic'

const nutritionCommand = new Command('nutrition').description('Nutrition management commands')

nutritionCommand.addCommand(inspectCommand)
nutritionCommand.addCommand(searchCommand)
nutritionCommand.addCommand(recalculateCommand)
nutritionCommand.addCommand(fixDatesCommand)
nutritionCommand.addCommand(metabolicCommand)
nutritionCommand.addCommand(chainCommand)
nutritionCommand.addCommand(debugMetabolicCommand)

export default nutritionCommand
