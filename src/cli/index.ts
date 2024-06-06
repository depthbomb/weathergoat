import { Cli } from 'clipanion';
import { CommandManagerCommand } from './commands/CommandManager';

const cli = new Cli({
	binaryLabel: 'WeatherGoat CLI',
	binaryVersion: '0.0.0',
	binaryName: process.argv[0]
});

cli.register(CommandManagerCommand);

export const runCli = async () => cli.runExit(process.argv.slice(2));
