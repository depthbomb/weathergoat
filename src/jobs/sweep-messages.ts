import { BaseJob } from '@jobs';
import { logger } from '@logger';
import { Tokens } from '@container';
import type { Container } from '@container';
import type { ISweeperService } from '@services/sweeper';

export default class SweepMessagesJob extends BaseJob {
	private readonly _sweeper: ISweeperService;

	public constructor(container: Container) {
		super({
			name: 'com.weathergoat.jobs.SweepMessages',
			pattern: '* * * * *',
			runImmediately: true
		});

		this._sweeper = container.resolve(Tokens.Sweeper);
	}

	public async execute() {
		const [sweepCount, errorCount] = await this._sweeper.sweepMessages();
		if (sweepCount || errorCount) {
			logger.info('Finished sweeping messages', { sweepCount, errorCount });
		}
	}
}
