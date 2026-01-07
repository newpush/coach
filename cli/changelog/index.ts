import { Command } from 'commander'
import { generateCommand } from './generate'
import { publishCommand } from './publish'

const changelogCommand = new Command('changelog')

changelogCommand
  .description('Manage changelogs')
  .addCommand(generateCommand, { isDefault: true })
  .addCommand(publishCommand)

export default changelogCommand
