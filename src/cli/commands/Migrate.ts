import { Command } from 'clipanion';
import { runMigrations } from '@db';
import { logger } from '@lib/logger';
import type { BaseContext } from 'clipanion';

export class MigrateCommand extends Command<BaseContext> {
	public static override paths = [['migrate']];

	public async execute(): Promise<number> {
		let exitCode = 0;

		try {
			runMigrations();

			logger.info('Migrations complete');
		} catch (err: unknown) {
			logger.error(err);
			exitCode = 1;
		}

		return exitCode;
	}
}
