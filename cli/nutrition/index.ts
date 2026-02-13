import { Command } from 'commander'
import inspectCommand from './inspect'
import searchCommand from './search'
import recalculateCommand from './recalculate'
import fixDatesCommand from './fix-dates'
import metabolicCommand from './metabolic'
import chainCommand from './chain'
import debugMetabolicCommand from './debug-metabolic'
import fuelingWorkoutCommand from './fueling-workout'
import compareFuelingCommand from './compare-fueling'

const nutritionCommand = new Command('nutrition').description('Nutrition management commands')

nutritionCommand.addCommand(inspectCommand)
nutritionCommand.addCommand(searchCommand)
nutritionCommand.addCommand(recalculateCommand)
nutritionCommand.addCommand(fixDatesCommand)
nutritionCommand.addCommand(metabolicCommand)
nutritionCommand.addCommand(chainCommand)
nutritionCommand.addCommand(debugMetabolicCommand)
nutritionCommand.addCommand(fuelingWorkoutCommand)
nutritionCommand.addCommand(compareFuelingCommand)

export default nutritionCommand
