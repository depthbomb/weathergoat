import { BaseJob } from '@jobs';
import { logger } from '@logger';
import { container } from '@container';
import { SweeperService } from '@services/sweeper';
import type { Logger } from 'winston';
import type { ISweeperService } from '@services/sweeper';

export default class SweepMessagesJob extends BaseJob {
	private readonly logger: Logger;
	private readonly sweeper: ISweeperService;

	public constructor() {
		super({
			name: 'sweep_messages',
			pattern: '* * * * *',
			runImmediately: true
		});

		this.logger  = logger.child({ jobName: this.name });
		this.sweeper = container.resolve(SweeperService);
	}

	public async execute() {
		const [sweepCount, errorCount] = await this.sweeper.sweepMessages();
		if (sweepCount || errorCount) {
			this.logger.info('Finished sweeping messages', { sweepCount, errorCount });
		}
	}
}
