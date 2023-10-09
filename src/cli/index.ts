import { Cli } from 'clipanion';
import { version } from '../../package.json';
import { RegisterCommandsCommand } from '@cli/commands/registerCommands';

export async function runCli(): Promise<number> {
	const cli = new Cli({
		binaryLabel:  'WeatherGoat CLI',
		binaryVersion: version,
		binaryName:    process.argv[0]!
	});

	cli.register(RegisterCommandsCommand);

	return cli.run(process.argv.slice(3));
}
