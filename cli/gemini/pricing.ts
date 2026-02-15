import { Command } from 'commander'
import chalk from 'chalk'
import { PRICING, MODEL_NAMES } from '../../server/utils/ai-config'

export const pricingCommand = new Command('pricing')
  .description('Display current Gemini pricing used by the application')
  .action(async () => {
    console.log(chalk.bold('Current Gemini Pricing Configuration:'))
    console.log('=====================================\n')

    console.log(chalk.yellow('1. Model Pricing (server/utils/ai-config.ts)'))
    console.log('Authoritative rates used for all cost logging\n')

    Object.entries(PRICING).forEach(([model, config]) => {
      console.log(chalk.cyan(`Model: ${model}`))

      if (config.threshold < 1_000_000_000) {
        console.log(chalk.gray(`  Tiered pricing threshold: ${config.threshold.toLocaleString()} tokens`))

        console.log(chalk.white('  Base Rates:'))
        console.log(`    Input:   $${config.base.input.toFixed(2)} / 1M tokens`)
        console.log(`    Output:  $${config.base.output.toFixed(2)} / 1M tokens`)
        console.log(`    Cached:  $${config.base.cacheInput.toFixed(3)} / 1M tokens`)

        console.log(chalk.white('  Premium Rates:'))
        console.log(`    Input:   $${config.premium.input.toFixed(2)} / 1M tokens`)
        console.log(`    Output:  $${config.premium.output.toFixed(2)} / 1M tokens`)
        console.log(`    Cached:  $${config.premium.cacheInput.toFixed(3)} / 1M tokens`)
      } else {
        console.log(chalk.white('  Fixed Rates:'))
        console.log(`    Input:   $${config.base.input.toFixed(2)} / 1M tokens`)
        console.log(`    Output:  $${config.base.output.toFixed(2)} / 1M tokens`)
        console.log(`    Cached:  $${config.base.cacheInput.toFixed(3)} / 1M tokens`)
      }
      console.log('---')
    })

    console.log('\n' + chalk.yellow('2. Active Model Aliases'))
    console.log(chalk.cyan(`  Flash (Utility): ${MODEL_NAMES.flash}`))
    console.log(chalk.cyan(`  Pro   (Chat):    ${MODEL_NAMES.pro}`))

    console.log('\n' + chalk.green.bold('STATUS: SYNCHRONIZED'))
    console.log('CLI is now displaying the actual logic from the server.')

    console.log('\n' + chalk.gray('Note: These values are defined in server/utils/ai-config.ts.'))
    console.log(
      chalk.gray('Google updates pricing periodically; ensure the config file matches latest docs.')
    )
  })
