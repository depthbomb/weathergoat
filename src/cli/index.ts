import { Cli } from 'clipanion';
import { version } from '../../package.json';
import { CommandManagerCommand } from '@cli/commands/CommandManager';

const cli = new Cli({
	binaryLabel: 'WeatherGoat CLI',
	binaryVersion: version,
	binaryName: process.argv[0]
});

cli.register(CommandManagerCommand);

export const runCli = async () => cli.runExit(process.argv.slice(2));
