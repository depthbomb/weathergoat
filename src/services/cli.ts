import { Cli } from 'clipanion';
import { injectable } from '@needle-di/core';
import { CommandManagerCommand } from '@cli/commands/CommandManager';

@injectable()
export class CliService {
	private readonly cli: Cli;

	public constructor() {
		this.cli = new Cli({
			binaryLabel: 'WeatherGoat CLI',
			binaryVersion: '0.0.0',
			binaryName: process.argv[0]
		});

		this.cli.register(CommandManagerCommand);
	}

	public async run(args: string[]) {
		await this.cli.run(args);
	}
}
