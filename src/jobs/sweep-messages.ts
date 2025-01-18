import { BaseJob } from '@jobs';
import { logger } from '@logger';
import { container } from '@container';
import type { Logger } from 'winston';
import type { ISweeperService } from '@services/sweeper';

export default class SweepMessagesJob extends BaseJob {
	private readonly _logger: Logger;
	private readonly _sweeper: ISweeperService;

	public constructor() {
		super({
			name: 'sweep_messages',
			pattern: '* * * * *',
			runImmediately: true
		});

		this._logger  = logger.child({ jobName: this.name });
		this._sweeper = container.resolve('Sweeper');
	}

	public async execute() {
		const [sweepCount, errorCount] = await this._sweeper.sweepMessages();
		if (sweepCount || errorCount) {
			this._logger.info('Finished sweeping messages', { sweepCount, errorCount });
		}
	}
}
