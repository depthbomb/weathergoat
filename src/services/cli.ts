import { Cli } from 'clipanion';
import { CommandManagerCommand } from '@cli/commands/CommandManager';
import type { IService } from '@services';

export interface ICliService extends IService {
	run(args: string[]): Promise<void>;
}

export default class CliService implements ICliService {
	private readonly _cli: Cli;

	public constructor() {
		this._cli = new Cli({
			binaryLabel: 'WeatherGoat CLI',
			binaryVersion: '0.0.0',
			binaryName: process.argv[0]
		});

		this._cli.register(CommandManagerCommand);
	}

	public async run(args: string[]) {
		await this._cli.run(args);
	}
}
