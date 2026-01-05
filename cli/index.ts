#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import dbCommand from './db';
import checkCommand from './check';
import debugCommand from './debug';
import changelogCommand from './changelog';

const program = new Command();

program
  .version('1.0.0')
  .description('A CLI for development and troubleshooting');

// Register command modules
program.addCommand(dbCommand);
program.addCommand(checkCommand);
program.addCommand(debugCommand);
program.addCommand(changelogCommand);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
