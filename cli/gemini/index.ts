import { Command } from 'commander'
import { modelsCommand } from './models'
import { pricingCommand } from './pricing'

const geminiCommand = new Command('gemini').description('Gemini AI model and pricing management')

geminiCommand.addCommand(modelsCommand)
geminiCommand.addCommand(pricingCommand)

export default geminiCommand
